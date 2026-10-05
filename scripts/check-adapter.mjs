/**
 * Проверка Vercel-функции api/[[...path]].js без деплоя.
 *
 * Vercel разбирает JSON-тело до вызова функции и отдаёт его как req.body,
 * а сервер ждёт «сырой» поток. Скрипт эмулирует оба сценария и сверяет
 * ответы с ожидаемыми.
 *
 * Запуск: npm run check
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Работаем из backend, чтобы локальная база была на своём месте,
// и отключаем listen() при импорте сервера (как на Vercel).
process.chdir(path.join(root, 'backend'));
process.env.VERCEL = '1';

const { default: handler } = await import(pathToFileURL(path.join(root, 'api', '[[...path]].js')).href);

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    writeHead(status, headers) {
      this.statusCode = status;
      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          this.headers[String(key).toLowerCase()] = String(value);
        }
      }
      return this;
    },
    write(chunk) {
      this.body += String(chunk);
    },
    end(chunk) {
      if (chunk) this.body += String(chunk);
    },
  };
}

async function call(method, url, body) {
  const req = {
    method,
    url,
    headers: { 'x-forwarded-for': '127.0.0.1' },
  };

  if (body !== undefined) {
    req.headers['content-type'] = 'application/json';
    req.body = body; // именно так Vercel отдаёт разобранное тело
  }

  const res = makeResponse();
  await handler(req, res);

  let parsed = null;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    parsed = null;
  }

  return { status: res.statusCode, parsed, raw: res.body };
}

const health = await call('GET', '/api/health');
console.log('GET  /api/health        ->', health.status, health.parsed?.ok ? 'ok' : health.raw);

const loginEmpty = await call('POST', '/api/auth/login', {});
console.log('POST /api/auth/login    ->', loginEmpty.status, loginEmpty.parsed?.error);

const loginBad = await call('POST', '/api/auth/login', { email: 'nobody@astral.xyz', password: 'wrong' });
console.log('POST /api/auth/login    ->', loginBad.status, loginBad.parsed?.error);

const forgot = await call('POST', '/api/auth/forgot-password', { email: 'nobody@astral.xyz' });
console.log('POST /forgot-password   ->', forgot.status, JSON.stringify(forgot.parsed));

const siteData = await call('GET', '/api/site-data');
console.log('GET  /api/site-data     ->', siteData.status, Array.isArray(siteData.parsed?.products) ? 'products ok' : 'bad');

const passed =
  health.status === 200 &&
  health.parsed?.ok === true &&
  loginEmpty.status === 400 &&
  loginBad.status === 401 &&
  forgot.status === 404 &&
  siteData.status === 200;

console.log(passed ? 'ADAPTER OK' : 'ADAPTER FAILED');
process.exit(passed ? 0 : 1);
