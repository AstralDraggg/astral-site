import './env.js';
import { createHash, createCipheriv, createDecipheriv, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cleanupExpiredSessions,
  claimLicenseKey,
  deleteEmailCodes,
  deleteLicenseKey,
  deleteSession,
  deleteSessionsForUser,
  deleteUserById,
  findEmailCode,
  findBlockedIp,
  findLicenseKey,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  getSession,
  initSchema,
  insertLicenseKey,
  isRemoteDb,
  listLicenseKeys,
  readUsers,
  recordUserIp,
  saveEmailCode,
  saveSession,
  setCodeAttempts,
  setUserBlocked,
  writeUsers,
  type EmailCodeRecord,
  type Purchase,
  type UserRecord,
} from './db.js';
import { devCodesAllowed, isMailerConfigured, sendVerificationCode } from './mailer.js';

const port = Number(process.env.PORT ?? 3001);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(moduleDir, '..', '..', 'frontend', 'dist');
const downloadsDir = path.resolve(moduleDir, '..', 'downloads');
const launcherFileName = process.env.LAUNCHER_FILE ?? 'Astral.exe';

const TOKEN_SECRET = process.env.TOKEN_SECRET ?? 'astral-secret-key-change-in-production';
const TOKEN_ALGORITHM = 'aes-256-gcm';
const TOKEN_IV_LENGTH = 16;
const TOKEN_AUTH_TAG_LENGTH = 16;
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

if (!process.env.TOKEN_SECRET) {
  console.warn('[astral] TOKEN_SECRET is not set, using the built-in development secret.');
}

type FeatureIcon = 'combat' | 'movement' | 'visuals' | 'configs';

type Feature = { title: string; description: string; icon: FeatureIcon };
type Stat = { label: string; value: string };

const payload: { stats: Stat[]; features: Feature[]; products: Product[] } = {
  stats: [
    { label: 'Интерфейс', value: 'Минимализм' },
    { label: 'Античит', value: 'Обход проверок' },
    { label: 'Модули', value: '70+' },
    { label: 'Игра', value: 'Без бана' },
  ],
  features: [
    {
      title: 'Легит-бой',
      description: 'Прицел ровный, удары чёткие, файты идут спокойно. Ничего сверхъестественного — просто играешь и всё.',
      icon: 'combat',
    },
    {
      title: 'Обход проверок',
      description: 'Античит проверяет — и промахивается. Обход заложен прямо в клиент, бан во время игры не светится.',
      icon: 'movement',
    },
    {
      title: 'Минимализм',
      description: 'Интерфейс лёгкий и приятный: лишнего нет, глаза не устают, на экране только нужное.',
      icon: 'visuals',
    },
    {
      title: 'Конфиги',
      description: 'Настройки сохраняешь один раз, дальше просто переключаешься. Собирать всё с нуля не надо.',
      icon: 'configs',
    },
  ],
  products: [
    {
      id: 'sub-30',
      name: 'Astral',
      price: '389₽',
      duration: '/ 30 дней',
      badge: 'Нас выбирают 5 000 игроков',
      description: 'Стартовый доступ: поставил, настроил и спокойно играешь.',
      category: 'subscription',
      features: ['70+ модулей', 'Обход проверок', 'Минималистичный HUD', 'Поддержка 24/7'],
    },
    {
      id: 'sub-90',
      name: 'Astral',
      price: '689₽',
      duration: '/ 90 дней',
      badge: 'Нас выбирают 5 000 игроков',
      description: 'Середина: играешь много и хочешь всё и сразу.',
      category: 'subscription',
      features: ['70+ модулей', 'Обход проверок', 'Минималистичный HUD', 'Поддержка 24/7'],
    },
    {
      id: 'sub-999',
      name: 'Astral',
      price: '989₽',
      duration: '/ 999 дней',
      badge: 'Нас выбирают 5 000 игроков',
      description: 'Долгий вариант. Купил один раз и больше не думаешь.',
      category: 'subscription',
      features: ['70+ модулей', 'Обход проверок', 'Минималистичный HUD', 'Поддержка 24/7'],
    },
    {
      id: 'hwid-reset',
      name: 'Сброс HWID',
      price: '189₽',
      duration: '',
      badge: 'Дополнение',
      description: 'Нужен быстрый сброс привязки железа на аккаунте? Бери это.',
      category: 'addition',
      features: [],
    },
  ],
};

type Product = {
  id: string;
  name: string;
  price: string;
  duration: string;
  badge: string;
  description: string;
  category: 'subscription' | 'addition';
  features: string[];
};

function productById(productId: string): Product | null {
  return payload.products.find((product) => product.id === productId) ?? null;
}

function subscriptionDays(product: Product): number {
  // duration пишется по-русски ('/ 30 дней') — ловим и русские, и английские единицы.
  const match = /(\d+)\s*(?:days?|дней|дня|день|дн)/i.exec(product.duration);
  return match ? Number(match[1]) : 0;
}

function plusDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString();
}

function applyProductToUser(user: UserRecord, product: Product) {
  const days = subscriptionDays(product);

  if (days > 0) {
    const currentEnd = Date.parse(user.subscriptionTill);
    const base = Number.isFinite(currentEnd) && currentEnd > Date.now() ? new Date(currentEnd) : new Date();
    user.subscriptionTill = plusDays(base, days);
  }

  if (product.id === 'hwid-reset') {
    user.hwidStatus = 'Reset ready';
  }
}

/** ASTRAL-XXXXXX-XXXXXX — формат лицензионного ключа для панели. */
function generateLicenseKey(): string {
  const part = () => randomBytes(3).toString('hex').toUpperCase();
  return `ASTRAL-${part()}-${part()}`;
}

// --- passwords ---------------------------------------------------------------

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith('scrypt$')) {
    const [, salt, expected] = stored.split('$');
    if (!salt || !expected) {
      return false;
    }

    const actual = scryptSync(password, salt, 64).toString('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');

    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }

  // Legacy sha256 hashes from the original template still keep working.
  const legacy = createHash('sha256').update(password).digest('hex');
  return legacy === stored;
}

// --- session tokens ----------------------------------------------------------

function encryptToken(rawPayload: string): string {
  const iv = randomBytes(TOKEN_IV_LENGTH);
  const key = scryptSync(TOKEN_SECRET, 'salt', 32);
  const cipher = createCipheriv(TOKEN_ALGORITHM, key, iv);

  let encrypted = cipher.update(rawPayload, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decryptToken(token: string): string | null {
  try {
    const parts = token.split(':');
    if (parts.length !== 3) {
      return null;
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = scryptSync(TOKEN_SECRET, 'salt', 32);

    const decipher = createDecipheriv(TOKEN_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    return null;
  }
}

function makeToken(userId: string): string {
  const rawPayload = JSON.stringify({
    userId,
    timestamp: Date.now(),
    nonce: randomBytes(16).toString('hex'),
  });

  return encryptToken(rawPayload);
}

function getTokenFromRequest(request: IncomingMessage): { token: string; userId: string } | null {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length);
  const decrypted = decryptToken(token);

  if (!decrypted) {
    return null;
  }

  try {
    const parsed = JSON.parse(decrypted) as { userId?: string; timestamp?: number; nonce?: string };

    if (!parsed.userId || !parsed.timestamp || !parsed.nonce) {
      return null;
    }

    if (Date.now() - parsed.timestamp > SESSION_MAX_AGE) {
      return null;
    }

    return { token, userId: parsed.userId };
  } catch {
    return null;
  }
}

async function createSession(userId: string): Promise<string> {
  const token = makeToken(userId);
  await saveSession({ token, userId, createdAt: new Date().toISOString() });
  return token;
}

/** Resolves the current user from the Authorization header (token + session check). */
async function authenticate(request: IncomingMessage): Promise<UserRecord | null> {
  const tokenData = getTokenFromRequest(request);
  if (!tokenData) {
    return null;
  }

  const session = await getSession(tokenData.token);
  if (!session || session.userId !== tokenData.userId) {
    return null;
  }

  const age = Date.now() - Date.parse(session.createdAt);
  if (!Number.isFinite(age) || age > SESSION_MAX_AGE) {
    await deleteSession(tokenData.token);
    return null;
  }

  return findUserById(tokenData.userId);
}

function sanitizeUser(user: UserRecord) {
  return {
    id: user.id,
    uid: user.uid,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    subscriptionTill: user.subscriptionTill,
    hwidStatus: user.hwidStatus,
    hwid: user.hwid,
    friends: user.friendsList.length,
    licenseKey: user.licenseKey,
    purchases: user.purchases,
    role: isAdmin(user) ? 'admin' : 'user',
    blocked: user.blocked,
    blockedAt: user.blockedAt,
    lastIp: user.lastIp,
  };
}

// --- admin --------------------------------------------------------------------

/**
 * Логины администраторов через переменную окружения (запятая в качестве разделителя).
 * Работает до того, как у аккаунта появится роль admin в базе.
 */
function adminUsernames(): string[] {
  return (process.env.ADMIN_USERS ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

function isAdmin(user: UserRecord): boolean {
  return user.role === 'admin' || adminUsernames().includes(user.username.toLowerCase());
}

/** Проверяет, что запрос от вошедшего администратора (иначе 401/403). */
function requireAdmin(request: IncomingMessage, response: ServerResponse): Promise<UserRecord | null> {
  // Намеренно через authenticate: администратор должен зайти в панель,
  // чтобы снять блокировку, даже если его аккаунт помечен заблокированным.
  return authenticate(request).then((user) => {
    if (!user) {
      sendJson(response, 401, { error: 'Нет доступа.' });
      return null;
    }

    if (!isAdmin(user)) {
      sendJson(response, 403, { error: 'Нужны права администратора.' });
      return null;
    }

    return user;
  });
}

// --- helpers -----------------------------------------------------------------

function sendJson(response: ServerResponse, statusCode: number, data: unknown) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readBody(request: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: IncomingMessage, scope: string): string {
  return `${scope}:${clientIp(request)}`;
}

/** IP клиента: учитывает X-Forwarded-For от прокси/Vercel. */
function clientIp(request: IncomingMessage): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  const forwardedIp = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  const ip = forwardedIp || request.socket?.remoteAddress || '';
  return ip || null;
}

function rateLimit(request: IncomingMessage, scope: string, limit = 30, windowMs = 60_000): boolean {
  const key = clientKey(request, scope);
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= limit;
}

function requireAuth(request: IncomingMessage, response: ServerResponse): Promise<UserRecord | null> {
  return authenticate(request).then((user) => {
    if (!user) {
      sendJson(response, 401, { error: 'Нет доступа.' });
      return null;
    }

    // Заблокированный аккаунт видит свой профиль, но менять ничего не может.
    if (user.blocked) {
      sendJson(response, 403, { error: 'Аккаунт заблокирован администратором.', blocked: true });
      return null;
    }

    return user;
  });
}

// --- email codes -------------------------------------------------------------

const CODE_TTL_MS = 10 * 60_000;
const CODE_MAX_ATTEMPTS = 5;
const CODE_RESEND_INTERVAL_MS = 45_000;

function hashCode(code: string): string {
  return createHash('sha256').update(`${TOKEN_SECRET}:${code}`).digest('hex');
}

function randomVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

type CodeIssueResult = { ok: true; code: string } | { ok: false; status: number; error: string };

/** Создаёт новый код, кладёт его в БД и отправляет письмо. */
async function issueEmailCode(
  email: string,
  purpose: 'register' | 'reset',
  payload: string | null,
): Promise<CodeIssueResult> {
  if (!isMailerConfigured() && !devCodesAllowed()) {
    return { ok: false, status: 503, error: 'Почта временно не настроена, попробуйте позже.' };
  }

  const lastCode = await findEmailCode(email, purpose);
  if (lastCode && Date.now() - Date.parse(lastCode.createdAt) < CODE_RESEND_INTERVAL_MS) {
    return { ok: false, status: 429, error: 'Код уже отправлен. Подождите около минуты и попробуйте снова.' };
  }

  const code = randomVerificationCode();

  await saveEmailCode({
    id: randomBytes(8).toString('hex'),
    email,
    purpose,
    codeHash: hashCode(code),
    payload,
    attempts: 0,
    expiresAt: Date.now() + CODE_TTL_MS,
    createdAt: new Date().toISOString(),
  });

  try {
    await sendVerificationCode(email, code, purpose);
  } catch (error) {
    await deleteEmailCodes(email, purpose);
    console.error('[astral] Не удалось отправить код:', error);
    return { ok: false, status: 502, error: 'Не удалось отправить код на почту. Попробуйте позже.' };
  }

  return { ok: true, code };
}

type CodeCheckResult = { ok: true; record: EmailCodeRecord } | { ok: false; status: number; error: string };

async function checkEmailCode(email: string, purpose: 'register' | 'reset', code: string): Promise<CodeCheckResult> {
  const record = await findEmailCode(email, purpose);

  if (!record) {
    return { ok: false, status: 400, error: 'Код не найден. Запросите новый.' };
  }

  if (Date.now() > record.expiresAt) {
    await deleteEmailCodes(email, purpose);
    return { ok: false, status: 400, error: 'Код истёк. Запросите новый.' };
  }

  if (record.attempts >= CODE_MAX_ATTEMPTS) {
    await deleteEmailCodes(email, purpose);
    return { ok: false, status: 429, error: 'Слишком много неверных попыток. Запросите новый код.' };
  }

  const expected = Buffer.from(record.codeHash, 'hex');
  const actual = Buffer.from(hashCode(code), 'hex');
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    await setCodeAttempts(record.id, record.attempts + 1);
    return { ok: false, status: 400, error: 'Неверный код.' };
  }

  return { ok: true, record };
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- static frontend ---------------------------------------------------------

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.zip': 'application/zip',
};

function contentTypeFor(filePath: string): string {
  return contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

async function serveStatic(request: IncomingMessage, response: ServerResponse) {
  const requestUrl = request.url ?? '/';

  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch {
    pathname = '/';
  }

  const relativePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  let filePath = path.join(frontendDist, relativePath);

  if (!filePath.startsWith(frontendDist)) {
    filePath = path.join(frontendDist, 'index.html');
  }

  try {
    const stat = await fs.stat(filePath);
    const target = stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    const data = await fs.readFile(target);

    const isImmutableAsset = pathname.startsWith('/assets/');
    response.writeHead(200, {
      'Content-Type': contentTypeFor(target),
      'Cache-Control': isImmutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    response.end(data);
    return;
  } catch {
    // SPA fallback: let react-router handle the route.
  }

  try {
    const indexHtml = await fs.readFile(path.join(frontendDist, 'index.html'));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    response.end(indexHtml);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Frontend build is missing. Run "npm run build" in the project root.');
  }
}

// --- server ------------------------------------------------------------------

/**
 * Раскрывает цепочку cause у ошибок: у fetch в Node сообщение "fetch failed"
 * прячет настоящую причину (DNS, таймаут, обрыв) внутри error.cause.
 */
function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  for (let i = 0; current && i < 5; i += 1) {
    const err = current as { message?: unknown; code?: unknown; cause?: unknown };
    const message = typeof err.message === 'string' ? err.message : String(current);
    const code = typeof err.code === 'string' ? ` [${err.code}]` : '';
    const line = `${message}${code}`;
    if (!parts.includes(line)) parts.push(line);
    current = err.cause;
  }

  return parts.join(' → ');
}

/** Кладёт диагностику в HTTP-заголовок (её можно прочитать извне, без логов). */
function setDiagHeader(response: ServerResponse, name: string, value: string): void {
  try {
    response.setHeader(name, encodeURIComponent(value).slice(0, 500));
  } catch {
    // заголовок не критичен
  }
}

/**
 * Обработчик запросов в формате node:http.
 * Локально поднимается через createServer, на Vercel вызывается из api/.
 */
export async function nodeHandler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const rawUrl = request.url ?? '/';
  // Vercel добавляет к URL query вида "?[...path]=health", поэтому
  // маршрутизируем по пути без query, иначе сравнение с '/api/health' не проходит.
  const queryIndex = rawUrl.indexOf('?');
  const pathOnly = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
  const queryString = queryIndex === -1 ? '' : rawUrl.slice(queryIndex + 1);
  let url = pathOnly;

  // Глубокие маршруты (/api/auth/login) Vercel не отдаёт функции напрямую —
  // их переводит rewrite в vercel.json, сохраняя путь в параметре __route.
  try {
    const override = new URLSearchParams(queryString).get('__route');
    if (override) {
      url = override.startsWith('/') ? override : `/${override}`;
    }
  } catch {
    // query не разобрался — используем путь как есть
  }

  setDiagHeader(response, 'X-Astral-Url', rawUrl);
  setDiagHeader(response, 'X-Astral-Route', url);
  setDiagHeader(response, 'X-Astral-Method', request.method ?? 'unknown');
  const isApi = url === '/api' || url.startsWith('/api/');

  // Диагностика отвечает даже при упавшей инициализации БД,
  // иначе причину сбоя видно только в логах хостинга.
  if (!(isApi && url === '/api/diag')) {
    try {
      await ensureReady();
    } catch (error) {
      console.error('[astral] init failed:', error);
      const detail = describeError(error);
      response.setHeader('Access-Control-Allow-Origin', '*');
      setDiagHeader(response, 'X-Astral-Diag', detail);
      setDiagHeader(response, 'X-Astral-Db', process.env.TURSO_DATABASE_URL ?? 'missing');
      setDiagHeader(response, 'X-Astral-Token', process.env.TURSO_AUTH_TOKEN ? 'set' : 'missing');
      sendJson(response, 500, {
        error: 'Инициализация базы данных не удалась.',
        detail,
        db: isRemoteDb() ? 'turso' : 'file',
      });
      return;
    }
  }

  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (!isApi) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      await serveStatic(request, response);
    } else {
      response.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Метод не поддерживается.' }));
    }
    return;
  }

  const isGetLike = request.method === 'GET' || request.method === 'HEAD';

  if (isGetLike && url === '/api/health') {
    sendJson(response, 200, { ok: true, service: 'astral-backend', database: isRemoteDb() ? 'turso' : 'file' });
    return;
  }

  // Диагностика: что видит сервер (без значений секретов).
  if (isGetLike && url === '/api/diag') {
    const tursoUrl = process.env.TURSO_DATABASE_URL ?? '';
    let dbHost: string | null = null;

    try {
      dbHost = new URL(tursoUrl).host || null;
    } catch {
      dbHost = tursoUrl ? `${tursoUrl.slice(0, 60)} (не разбирается как URL)` : null;
    }

    // Прямая попытка соединиться с хостом базы — показывает реальную причину
    // (DNS, таймаут, обрыв), если она прячется за "fetch failed".
    let probe: string | null = null;
    if (dbHost && !dbHost.includes('не разбирается')) {
      const started = Date.now();
      try {
        const res = await fetch(`https://${dbHost}/`, { signal: AbortSignal.timeout(5000) });
        probe = `HTTP ${res.status} за ${Date.now() - started} мс`;
      } catch (error) {
        probe = `${describeError(error)} за ${Date.now() - started} мс`;
      }
    }

    setDiagHeader(response, 'X-Astral-Db', process.env.TURSO_DATABASE_URL ?? 'missing');
    setDiagHeader(response, 'X-Astral-Diag', probe ?? 'no-probe');

    sendJson(response, 200, {
      ok: true,
      db: isRemoteDb() ? 'turso' : 'file',
      dbHost,
      probe,
      env: {
        TURSO_DATABASE_URL: tursoUrl ? 'set' : 'missing',
        TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? 'set' : 'missing',
        TOKEN_SECRET: process.env.TOKEN_SECRET ? 'set' : 'missing',
        SMTP_HOST: process.env.SMTP_HOST ?? null,
        SMTP_PORT: process.env.SMTP_PORT ?? null,
        SMTP_USER: process.env.SMTP_USER ? 'set' : 'missing',
        SMTP_PASS: process.env.SMTP_PASS ? 'set' : 'missing',
        LAUNCHER_URL: process.env.LAUNCHER_URL ?? null,
        NODE_ENV: process.env.NODE_ENV ?? null,
      },
    });
    return;
  }

  if (request.method === 'GET' && url === '/api/site-data') {
    sendJson(response, 200, payload);
    return;
  }

  // --- auth ------------------------------------------------------------------

  if (request.method === 'POST' && url === '/api/auth/register') {
    if (!rateLimit(request, 'register', 10)) {
      sendJson(response, 429, { error: 'Слишком много попыток, попробуйте через минуту.' });
      return;
    }

    try {
      const body = await readBody(request);
      const username = body.username?.trim() ?? '';
      const email = body.email?.trim().toLowerCase() ?? '';
      const password = body.password ?? '';
      const repeatPassword = body.repeatPassword ?? '';

      if (!username || !email || !password || !repeatPassword) {
        sendJson(response, 400, { error: 'Заполните все поля.' });
        return;
      }

      if (!emailPattern.test(email)) {
        sendJson(response, 400, { error: 'Введите корректный email.' });
        return;
      }

      if (password !== repeatPassword) {
        sendJson(response, 400, { error: 'Пароли не совпадают.' });
        return;
      }

      if (password.length < 6) {
        sendJson(response, 400, { error: 'Пароль слишком короткий.' });
        return;
      }

      if (username.length > 24) {
        sendJson(response, 400, { error: 'Имя пользователя слишком длинное.' });
        return;
      }

      const existingByEmail = await findUserByEmail(email);
      const existingByUsername = await findUserByUsername(username);

      if (existingByEmail || existingByUsername) {
        sendJson(response, 409, { error: 'Такой email или ник уже занят.' });
        return;
      }

      // Новый аккаунт с IP забаненного пользователя не создаётся.
      if (await findBlockedIp(clientIp(request))) {
        sendJson(response, 403, { error: 'Доступ с вашего IP-адреса ограничен.', blocked: true });
        return;
      }

      // Аккаунт создаётся только после подтверждения кода из письма.
      const issued = await issueEmailCode(
        email,
        'register',
        JSON.stringify({ username, passwordHash: hashPassword(password) }),
      );

      if (!issued.ok) {
        sendJson(response, issued.status, { error: issued.error });
        return;
      }

      sendJson(response, 200, {
        requireCode: true,
        email,
        ...(devCodesAllowed() ? { devCode: issued.code } : {}),
      });
      return;
    } catch {
      sendJson(response, 400, { error: 'Некорректный запрос.' });
    }
    return;
  }

  if (request.method === 'POST' && url === '/api/auth/register/verify') {
    if (!rateLimit(request, 'register-verify', 20)) {
      sendJson(response, 429, { error: 'Слишком много попыток, попробуйте через минуту.' });
      return;
    }

    try {
      const body = await readBody(request);
      const email = body.email?.trim().toLowerCase() ?? '';
      const code = body.code?.trim() ?? '';

      if (!email || !code) {
        sendJson(response, 400, { error: 'Введите код из письма.' });
        return;
      }

      const checked = await checkEmailCode(email, 'register', code);
      if (!checked.ok) {
        sendJson(response, checked.status, { error: checked.error });
        return;
      }

      let pending: { username?: string; passwordHash?: string } = {};
      try {
        pending = JSON.parse(checked.record.payload ?? '{}') as { username?: string; passwordHash?: string };
      } catch {
        pending = {};
      }

      const username = pending.username ?? '';
      const passwordHash = pending.passwordHash ?? '';

      if (!username || !passwordHash) {
        await deleteEmailCodes(email, 'register');
        sendJson(response, 400, { error: 'Данные регистрации устарели. Начните заново.' });
        return;
      }

      const pendingEmailTaken = await findUserByEmail(email);
      const pendingUsernameTaken = await findUserByUsername(username);

      if (pendingEmailTaken || pendingUsernameTaken) {
        await deleteEmailCodes(email, 'register');
        sendJson(response, 409, { error: 'Такой email или ник уже занят.' });
        return;
      }

      const users = await readUsers();
      const now = new Date();

      const nextUser: UserRecord = {
        id: randomBytes(8).toString('hex'),
        uid: users.length > 0 ? Math.max(...users.map((user) => user.uid)) + 1 : 1,
        username,
        email,
        passwordHash,
        createdAt: now.toISOString(),
        subscriptionTill: plusDays(now, 30),
        hwidStatus: 'Linked',
        hwid: null,
        friendsList: [],
        friendRequests: [],
        sentRequests: [],
        purchases: [],
        licenseKey: null,
        role: 'user',
        blocked: false,
        lastIp: clientIp(request),
        blockedAt: null,
      };

      users.push(nextUser);
      await writeUsers(users);
      await deleteEmailCodes(email, 'register');

      const token = await createSession(nextUser.id);

      sendJson(response, 201, { token, user: sanitizeUser(nextUser) });
      return;
    } catch {
      sendJson(response, 400, { error: 'Некорректный запрос.' });
    }
    return;
  }

  if (request.method === 'POST' && url === '/api/auth/login') {
    if (!rateLimit(request, 'login', 15)) {
      sendJson(response, 429, { error: 'Слишком много попыток, попробуйте через минуту.' });
      return;
    }

    try {
      const body = await readBody(request);
      // Вход можно делать по юзернейму или по email — что удобнее.
      const identifier = (body.email ?? body.username ?? body.login ?? '').trim();
      const password = body.password ?? '';

      if (!identifier || !password) {
        sendJson(response, 400, { error: 'Введите юзернейм (или email) и пароль.' });
        return;
      }

      const byEmail = identifier.includes('@');
      const user = byEmail
        ? (await findUserByEmail(identifier)) ?? (await findUserByUsername(identifier))
        : (await findUserByUsername(identifier)) ?? (await findUserByEmail(identifier));

      if (!user || !verifyPassword(password, user.passwordHash)) {
        sendJson(response, 401, { error: 'Неверный юзернейм, email или пароль.' });
        return;
      }

      const ip = clientIp(request);
      // Администратор проходит всегда — иначе нельзя снять блокировку с панели.
      if (!isAdmin(user)) {
        if (user.blocked) {
          sendJson(response, 403, {
            error: 'Аккаунт заблокирован администратором.',
            blocked: true,
          });
          return;
        }

        // Блокировка по IP: тот же адрес, с которого заходил забаненный аккаунт.
        const blockedBy = await findBlockedIp(ip);
        if (blockedBy) {
          sendJson(response, 403, {
            error: 'Доступ с вашего IP-адреса ограничен.',
            blocked: true,
          });
          return;
        }
      }

      await recordUserIp(user.id, ip);
      const token = await createSession(user.id);
      sendJson(response, 200, { token, user: sanitizeUser(user) });
      return;
    } catch {
      sendJson(response, 400, { error: 'Некорректный запрос.' });
    }
    return;
  }

  if (request.method === 'POST' && url === '/api/auth/forgot-password') {
    if (!rateLimit(request, 'forgot', 10)) {
      sendJson(response, 429, { error: 'Слишком много запросов, попробуйте позже.' });
      return;
    }

    try {
      const body = await readBody(request);
      const email = body.email?.trim().toLowerCase() ?? '';

      if (!emailPattern.test(email)) {
        sendJson(response, 400, { error: 'Введите корректный email.' });
        return;
      }

      const user = await findUserByEmail(email);

      if (!user) {
        // Не подсказываем, какие email существуют.
        if (devCodesAllowed()) {
          sendJson(response, 404, { error: 'Аккаунт с таким email не найден.' });
        } else {
          sendJson(response, 200, { ok: true, email });
        }
        return;
      }

      const issued = await issueEmailCode(email, 'reset', null);

      if (!issued.ok) {
        sendJson(response, issued.status, { error: issued.error });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        email,
        ...(devCodesAllowed() ? { devCode: issued.code } : {}),
      });
      return;
    } catch {
      sendJson(response, 400, { error: 'Некорректный запрос.' });
    }
    return;
  }

  if (request.method === 'POST' && url === '/api/auth/reset-password') {
    if (!rateLimit(request, 'reset', 20)) {
      sendJson(response, 429, { error: 'Слишком много попыток, попробуйте через минуту.' });
      return;
    }

    try {
      const body = await readBody(request);
      const email = body.email?.trim().toLowerCase() ?? '';
      const code = body.code?.trim() ?? '';
      const password = body.password ?? '';
      const repeatPassword = body.repeatPassword ?? '';

      if (!email || !code) {
        sendJson(response, 400, { error: 'Введите код из письма.' });
        return;
      }

      if (password.length < 6) {
        sendJson(response, 400, { error: 'Пароль слишком короткий.' });
        return;
      }

      if (password !== repeatPassword) {
        sendJson(response, 400, { error: 'Пароли не совпадают.' });
        return;
      }

      const checked = await checkEmailCode(email, 'reset', code);
      if (!checked.ok) {
        sendJson(response, checked.status, { error: checked.error });
        return;
      }

      const user = await findUserByEmail(email);
      if (!user) {
        await deleteEmailCodes(email, 'reset');
        sendJson(response, 404, { error: 'Аккаунт не найден.' });
        return;
      }

      user.passwordHash = hashPassword(password);
      await writeUsers([user]);
      await deleteEmailCodes(email, 'reset');
      await deleteSessionsForUser(user.id);

      sendJson(response, 200, { ok: true, message: 'Пароль обновлён. Теперь можно войти.' });
      return;
    } catch {
      sendJson(response, 400, { error: 'Некорректный запрос.' });
    }
    return;
  }

  if (request.method === 'GET' && url === '/api/auth/me') {
    const user = await authenticate(request);
    if (!user) {
      sendJson(response, 401, { error: 'Токен недействителен или отсутствует.' });
      return;
    }

    sendJson(response, 200, { user: sanitizeUser(user) });
    return;
  }

  if (request.method === 'POST' && url === '/api/auth/logout') {
    const tokenData = getTokenFromRequest(request);
    if (tokenData) {
      await deleteSession(tokenData.token);
    }

    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && url === '/api/auth/change-email') {
    const user = await requireAuth(request, response);
    if (!user) return;

    const body = await readBody(request);
    const nextEmail = body.email?.trim().toLowerCase() ?? '';

    if (!emailPattern.test(nextEmail)) {
      sendJson(response, 400, { error: 'Введите корректный email.' });
      return;
    }

    if (nextEmail === user.email) {
      sendJson(response, 400, { error: 'Это ваш текущий email.' });
      return;
    }

    const taken = await findUserByEmail(nextEmail);
    if (taken) {
      sendJson(response, 409, { error: 'Этот email уже занят.' });
      return;
    }

    user.email = nextEmail;
    await writeUsers([user]);

    sendJson(response, 200, { message: 'Email обновлён.', user: sanitizeUser(user) });
    return;
  }

  if (request.method === 'POST' && url === '/api/auth/change-password') {
    const user = await requireAuth(request, response);
    if (!user) return;

    const body = await readBody(request);
    const nextPassword = body.password ?? '';

    if (nextPassword.length < 6) {
      sendJson(response, 400, { error: 'Пароль должен быть не короче 6 символов.' });
      return;
    }

    // If the client sends the current password, verify it before changing.
    if (body.currentPassword && !verifyPassword(body.currentPassword, user.passwordHash)) {
      sendJson(response, 401, { error: 'Текущий пароль неверный.' });
      return;
    }

    user.passwordHash = hashPassword(nextPassword);
    await writeUsers([user]);

    sendJson(response, 200, { message: 'Пароль обновлён.' });
    return;
  }

  // --- purchases -------------------------------------------------------------

  if (request.method === 'GET' && url === '/api/purchases') {
    const user = await requireAuth(request, response);
    if (!user) return;

    sendJson(response, 200, { purchases: user.purchases });
    return;
  }

  if (request.method === 'POST' && url === '/api/purchase') {
    const user = await requireAuth(request, response);
    if (!user) return;

    const body = await readBody(request);
    const product = productById(body.productId ?? '');

    if (!product) {
      sendJson(response, 404, { error: 'Товар не найден.' });
      return;
    }

    const purchase: Purchase = {
      id: randomBytes(6).toString('hex'),
      productId: product.id,
      name: product.name + (product.duration ? ` ${product.duration.replace('/', '').trim()}` : ''),
      price: product.price,
      purchasedAt: new Date().toISOString(),
    };

    user.purchases.push(purchase);
    applyProductToUser(user, product);
    await writeUsers([user]);

    sendJson(response, 201, { purchase, user: sanitizeUser(user) });
    return;
  }

  // --- license keys ----------------------------------------------------------

  if (request.method === 'POST' && url === '/api/license/activate') {
    const user = await requireAuth(request, response);
    if (!user) return;

    const body = await readBody(request);
    const key = body.key?.trim() ?? '';

    if (!key) {
      sendJson(response, 400, { error: 'Сначала введите ключ.' });
      return;
    }

    const record = await findLicenseKey(key);

    if (!record) {
      sendJson(response, 404, { error: 'Ключ не найден.' });
      return;
    }

    if (record.usedBy && record.usedBy !== user.id) {
      sendJson(response, 409, { error: 'Ключ уже используется на другом аккаунте.' });
      return;
    }

    const product = productById(record.productId);

    if (!record.usedBy) {
      await claimLicenseKey(record.key, user.id);
    }

    user.licenseKey = record.key;

    if (product) {
      applyProductToUser(user, product);
    }

    await writeUsers([user]);

    sendJson(response, 200, {
      message: product
        ? `Ключ принят: ${product.name}${product.duration ? ` ${product.duration.replace('/', '').trim()}` : ''}.`
        : 'Ключ принят.',
      product: product ? { id: product.id, name: product.name } : null,
      user: sanitizeUser(user),
    });
    return;
  }

  // --- hwid --------------------------------------------------------------------

  /**
   * Лоадер привязывает HWID машины к аккаунту: старая привязка снимается,
   * статус возвращается в 'Linked' (купленный сброс при этом погашается).
   */
  if (request.method === 'POST' && url === '/api/hwid/reset') {
    const user = await requireAuth(request, response);
    if (!user) return;

    const body = await readBody(request);
    const hwid = String(body.hwid ?? '').trim().toUpperCase().slice(0, 32);

    if (!/^[A-Z0-9-]{4,32}$/.test(hwid)) {
      sendJson(response, 400, { error: 'Некорректный HWID.' });
      return;
    }

    user.hwid = hwid;
    // 'Reset ready' означает купленный сброс — он погашается при новой привязке.
    if (user.hwidStatus === 'Reset ready') {
      user.hwidStatus = 'Linked';
    }
    await writeUsers([user]);

    sendJson(response, 200, {
      ok: true,
      hwid,
      hwidStatus: user.hwidStatus,
      user: sanitizeUser(user),
    });
    return;
  }

  // --- launcher --------------------------------------------------------------

  if (request.method === 'GET' && url === '/api/launcher/download') {
    const user = await authenticate(request);
    if (!user) {
      sendJson(response, 401, { error: 'Войдите, чтобы скачать лоадер.' });
      return;
    }

    // 1) Прямая ссылка: большой файл (30 МБ) не прогоняем через серверлес-функцию.
    if (process.env.LAUNCHER_URL) {
      sendJson(response, 200, { url: process.env.LAUNCHER_URL });
      return;
    }

    // 2) Локальный файл: backend/downloads, затем собранная папка фронтенда.
    const candidates = [
      path.join(downloadsDir, launcherFileName),
      path.join(frontendDist, launcherFileName),
    ];

    for (const candidate of candidates) {
      try {
        const data = await fs.readFile(candidate);
        response.writeHead(200, {
          'Content-Type': contentTypeFor(candidate),
          'Content-Length': String(data.length),
          'Content-Disposition': `attachment; filename="${path.basename(candidate)}"`,
          'Cache-Control': 'no-store',
        });
        response.end(data);
        return;
      } catch {
        // Пробуем следующее место.
      }
    }

    sendJson(response, 404, {
      error: 'Файл лоадера ещё не загружен. Положи его в backend/downloads или укажи LAUNCHER_URL.',
    });
    return;
  }

  // --- friends ---------------------------------------------------------------

  if (request.method === 'GET' && url === '/api/friends') {
    const user = await requireAuth(request, response);
    if (!user) return;

    const users = await readUsers();
    const friends = user.friendsList
      .map((friendId) => users.find((entry) => entry.id === friendId))
      .filter((entry): entry is UserRecord => Boolean(entry))
      .map((friend) => ({
        id: friend.id,
        username: friend.username,
        status: 'offline' as const,
        lastSeen: 'Recently',
      }));

    sendJson(response, 200, { friends });
    return;
  }

  if (request.method === 'GET' && url === '/api/friends/requests') {
    const user = await requireAuth(request, response);
    if (!user) return;

    const users = await readUsers();

    const incoming = user.friendRequests
      .map((requesterId) => users.find((entry) => entry.id === requesterId))
      .filter((entry): entry is UserRecord => Boolean(entry))
      .map((entry) => ({ id: entry.id, username: entry.username, type: 'incoming' as const }));

    const outgoing = user.sentRequests
      .map((targetId) => users.find((entry) => entry.id === targetId))
      .filter((entry): entry is UserRecord => Boolean(entry))
      .map((entry) => ({ id: entry.id, username: entry.username, type: 'outgoing' as const }));

    sendJson(response, 200, { incoming, outgoing });
    return;
  }

  if (request.method === 'POST' && url === '/api/friends/add') {
    const current = await requireAuth(request, response);
    if (!current) return;

    try {
      const body = await readBody(request);
      const targetUsername = body.username?.trim() ?? '';

      if (!targetUsername) {
        sendJson(response, 400, { error: 'Укажите имя пользователя' });
        return;
      }

      const users = await readUsers();
      const currentUser = users.find((entry) => entry.id === current.id);
      const targetUser = users.find(
        (entry) => entry.username.toLowerCase() === targetUsername.toLowerCase(),
      );

      if (!currentUser) {
        sendJson(response, 404, { error: 'Пользователь не найден' });
        return;
      }

      if (!targetUser) {
        sendJson(response, 404, { error: 'Указанный пользователь не найден' });
        return;
      }

      if (targetUser.id === currentUser.id) {
        sendJson(response, 400, { error: 'Нельзя добавить себя в друзья' });
        return;
      }

      if (currentUser.friendsList.includes(targetUser.id)) {
        sendJson(response, 400, { error: 'Вы уже в друзьях' });
        return;
      }

      if (currentUser.sentRequests.includes(targetUser.id)) {
        sendJson(response, 400, { error: 'Запрос уже отправлен' });
        return;
      }

      if (targetUser.friendRequests.includes(currentUser.id)) {
        targetUser.friendRequests = targetUser.friendRequests.filter((id) => id !== currentUser.id);
        currentUser.sentRequests = currentUser.sentRequests.filter((id) => id !== targetUser.id);

        currentUser.friendsList.push(targetUser.id);
        targetUser.friendsList.push(currentUser.id);

        await writeUsers(users);
        sendJson(response, 200, { message: 'Теперь вы в друзьях' });
        return;
      }

      currentUser.sentRequests.push(targetUser.id);
      targetUser.friendRequests.push(currentUser.id);

      await writeUsers(users);
      sendJson(response, 200, { message: 'Запрос в друзья отправлен' });
      return;
    } catch {
      sendJson(response, 400, { error: 'Некорректный запрос' });
    }
    return;
  }

  if (request.method === 'POST' && url === '/api/friends/accept') {
    const current = await requireAuth(request, response);
    if (!current) return;

    try {
      const body = await readBody(request);
      const requesterId = body.requesterId?.trim() ?? '';

      if (!requesterId) {
        sendJson(response, 400, { error: 'Не указан ID пользователя' });
        return;
      }

      const users = await readUsers();
      const currentUser = users.find((entry) => entry.id === current.id);
      const requester = users.find((entry) => entry.id === requesterId);

      if (!currentUser || !requester) {
        sendJson(response, 404, { error: 'Пользователь не найден' });
        return;
      }

      if (!currentUser.friendRequests.includes(requesterId)) {
        sendJson(response, 400, { error: 'От этого пользователя нет запроса' });
        return;
      }

      currentUser.friendRequests = currentUser.friendRequests.filter((id) => id !== requesterId);
      requester.sentRequests = requester.sentRequests.filter((id) => id !== currentUser.id);

      currentUser.friendsList.push(requesterId);
      requester.friendsList.push(currentUser.id);

      await writeUsers(users);
      sendJson(response, 200, { message: 'Запрос в друзья принят' });
      return;
    } catch {
      sendJson(response, 400, { error: 'Некорректный запрос' });
    }
    return;
  }

  if (request.method === 'POST' && url === '/api/friends/reject') {
    const current = await requireAuth(request, response);
    if (!current) return;

    try {
      const body = await readBody(request);
      const requesterId = body.requesterId?.trim() ?? '';

      if (!requesterId) {
        sendJson(response, 400, { error: 'Не указан ID пользователя' });
        return;
      }

      const users = await readUsers();
      const currentUser = users.find((entry) => entry.id === current.id);
      const requester = users.find((entry) => entry.id === requesterId);

      if (!currentUser || !requester) {
        sendJson(response, 404, { error: 'Пользователь не найден' });
        return;
      }

      currentUser.friendRequests = currentUser.friendRequests.filter((id) => id !== requesterId);
      requester.sentRequests = requester.sentRequests.filter((id) => id !== currentUser.id);

      await writeUsers(users);
      sendJson(response, 200, { message: 'Запрос в друзья отклонён' });
      return;
    } catch {
      sendJson(response, 400, { error: 'Некорректный запрос' });
    }
    return;
  }

  if (request.method === 'DELETE' && url.startsWith('/api/friends/')) {
    const current = await requireAuth(request, response);
    if (!current) return;

    const friendId = url.split('/api/friends/')[1];

    if (!friendId) {
      sendJson(response, 400, { error: 'Не указан ID друга' });
      return;
    }

    const users = await readUsers();
    const currentUser = users.find((entry) => entry.id === current.id);
    const friend = users.find((entry) => entry.id === friendId);

    if (!currentUser || !friend) {
      sendJson(response, 404, { error: 'Пользователь не найден' });
      return;
    }

    if (!currentUser.friendsList.includes(friendId)) {
      sendJson(response, 400, { error: 'Вы не в друзьях с этим пользователем' });
      return;
    }

    currentUser.friendsList = currentUser.friendsList.filter((id) => id !== friendId);
    friend.friendsList = friend.friendsList.filter((id) => id !== currentUser.id);

    await writeUsers(users);
    sendJson(response, 200, { message: 'Удалено из друзей' });
    return;
  }

  // --- admin ------------------------------------------------------------------

  if (url.startsWith('/api/admin/')) {
    const admin = await requireAdmin(request, response);
    if (!admin) return;

    // Обзор: цифры для главной вкладки панели.
    if (request.method === 'GET' && url === '/api/admin/overview') {
      const users = await readUsers();
      const keys = await listLicenseKeys();
      const now = Date.now();

      const recentUsers = [...users]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 8)
        .map((entry) => ({ ...sanitizeUser(entry), active: Date.parse(entry.subscriptionTill) > now }));

      sendJson(response, 200, {
        stats: {
          users: users.length,
          admins: users.filter((entry) => isAdmin(entry)).length,
          activeSubscriptions: users.filter((entry) => Date.parse(entry.subscriptionTill) > now).length,
          purchases: users.reduce((total, entry) => total + entry.purchases.length, 0),
          keysTotal: keys.length,
          keysFree: keys.filter((key) => !key.usedBy).length,
        },
        recentUsers,
        products: payload.products.map((product) => ({
          id: product.id,
          name: product.name,
          duration: product.duration,
          price: product.price,
          category: product.category,
        })),
      });
      return;
    }

    // Список пользователей (+ поиск по нику, email или uid).
    if (request.method === 'GET' && url === '/api/admin/users') {
      const query = new URLSearchParams(queryString).get('q')?.trim().toLowerCase() ?? '';
      const now = Date.now();

      const users = (await readUsers())
        .filter(
          (entry) =>
            !query ||
            entry.username.toLowerCase().includes(query) ||
            entry.email.toLowerCase().includes(query) ||
            String(entry.uid) === query,
        )
        .map((entry) => ({
          ...sanitizeUser(entry),
          active: Date.parse(entry.subscriptionTill) > now,
          purchasesCount: entry.purchases.length,
        }));
      sendJson(response, 200, { users });
      return;
    }

    // Изменение пользователя: роль, продление подписки, статус HWID.
    if (request.method === 'POST' && url === '/api/admin/users/update') {
      try {
        const body = await readBody(request);
        const targetId = body.userId?.trim() ?? '';

        if (!targetId) {
          sendJson(response, 400, { error: 'Не указан пользователь.' });
          return;
        }

        const target = await findUserById(targetId);
        if (!target) {
          sendJson(response, 404, { error: 'Пользователь не найден.' });
          return;
        }

        const changes: string[] = [];

        // Блокировка: подписка снимается, сессии растугиваются, IP уходит в бан.
        if (body.blocked === 'true' || body.blocked === 'false') {
          const shouldBlock = body.blocked === 'true';

          if (target.id === admin.id && shouldBlock) {
            sendJson(response, 400, { error: 'Нельзя заблокировать самого себя.' });
            return;
          }

          await setUserBlocked(target.id, shouldBlock);
          target.blocked = shouldBlock;
          target.blockedAt = shouldBlock ? new Date().toISOString() : null;

          if (shouldBlock) {
            target.subscriptionTill = new Date().toISOString();
            await deleteSessionsForUser(target.id);
            changes.push(`аккаунт заблокирован${target.lastIp ? `, IP ${target.lastIp} в бане` : ''}`);
          } else {
            changes.push('блокировка снята');
          }
        }

        if (body.role === 'admin' || body.role === 'user') {
          if (target.id === admin.id && body.role === 'user') {
            sendJson(response, 400, { error: 'Нельзя снять роль у самого себя.' });
            return;
          }

          target.role = body.role;
          changes.push(body.role === 'admin' ? 'роль администратора выдана' : 'роль администратора снята');
        }

        if (body.days !== undefined && body.days !== null && body.days !== '') {
          const days = Number(body.days);
          if (!Number.isFinite(days) || days < 1 || days > 3650) {
            sendJson(response, 400, { error: 'Количество дней: от 1 до 3650.' });
            return;
          }

          const currentEnd = Date.parse(target.subscriptionTill);
          const base = Number.isFinite(currentEnd) && currentEnd > Date.now() ? new Date(currentEnd) : new Date();
          target.subscriptionTill = plusDays(base, days);
          changes.push(`подписка +${days} дн.`);
        }

        if (body.hwidStatus) {
          target.hwidStatus = String(body.hwidStatus).slice(0, 32);
          changes.push(`HWID: ${target.hwidStatus}`);
        }

        if (changes.length === 0) {
          sendJson(response, 400, {
            error: 'Нечего менять: укажите роль, дни, HWID или блокировку.',
          });
          return;
        }

        await writeUsers([target]);
        sendJson(response, 200, { message: changes.join(', '), user: sanitizeUser(target) });
        return;
      } catch {
        sendJson(response, 400, { error: 'Некорректный запрос.' });
      }
      return;
    }

    // Удаление аккаунта (вместе с сессиями и ссылками в списках друзей).
    if (request.method === 'POST' && url === '/api/admin/users/delete') {
      try {
        const body = await readBody(request);
        const targetId = body.userId?.trim() ?? '';

        if (!targetId) {
          sendJson(response, 400, { error: 'Не указан пользователь.' });
          return;
        }

        const target = await findUserById(targetId);
        if (!target) {
          sendJson(response, 404, { error: 'Пользователь не найден.' });
          return;
        }

        if (target.id === admin.id) {
          sendJson(response, 400, { error: 'Нельзя удалить самого себя.' });
          return;
        }

        const rest = (await readUsers())
          .filter((entry) => entry.id !== target.id)
          .map((entry) => ({
            ...entry,
            friendsList: entry.friendsList.filter((id) => id !== target.id),
            friendRequests: entry.friendRequests.filter((id) => id !== target.id),
            sentRequests: entry.sentRequests.filter((id) => id !== target.id),
          }));

        await writeUsers(rest);
        await deleteUserById(target.id);
        await deleteSessionsForUser(target.id);

        sendJson(response, 200, { message: `Аккаунт ${target.username} удалён.` });
        return;
      } catch {
        sendJson(response, 400, { error: 'Некорректный запрос.' });
      }
      return;
    }

    // Лицензионные ключи.
    if (request.method === 'GET' && url === '/api/admin/keys') {
      const users = await readUsers();
      const keys = (await listLicenseKeys()).map((key) => ({
        ...key,
        usedByUsername: key.usedBy ? (users.find((entry) => entry.id === key.usedBy)?.username ?? null) : null,
      }));

      sendJson(response, 200, { keys });
      return;
    }

    if (request.method === 'POST' && url === '/api/admin/keys') {
      try {
        const body = await readBody(request);
        const productId = body.productId?.trim() ?? '';
        const note = body.note?.trim() ?? '';
        const count = Math.max(1, Math.min(50, Math.floor(Number(body.count) || 1)));

        if (!productById(productId)) {
          sendJson(response, 400, { error: 'Выберите товар.' });
          return;
        }

        const created: string[] = [];
        for (let index = 0; index < count; index += 1) {
          const key = generateLicenseKey();
          await insertLicenseKey(key, productId, note);
          created.push(key);
        }

        sendJson(response, 201, { keys: created, message: `Создано ключей: ${created.length}` });
        return;
      } catch {
        sendJson(response, 400, { error: 'Некорректный запрос.' });
      }
      return;
    }

    if (request.method === 'POST' && url === '/api/admin/keys/delete') {
      try {
        const body = await readBody(request);
        const key = body.key?.trim() ?? '';

        if (!key) {
          sendJson(response, 400, { error: 'Не указан ключ.' });
          return;
        }

        const record = await findLicenseKey(key);
        if (!record) {
          sendJson(response, 404, { error: 'Ключ не найден.' });
          return;
        }

        await deleteLicenseKey(record.key);
        sendJson(response, 200, { message: `Ключ ${record.key} удалён.` });
        return;
      } catch {
        sendJson(response, 400, { error: 'Некорректный запрос.' });
      }
      return;
    }
  }

  sendJson(response, 404, { error: 'Не найдено' });
}

let readyPromise: Promise<void> | null = null;

/** Первичная инициализация БД (схема + чистка старых сессий), один раз. */
function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      await initSchema();
      await cleanupExpiredSessions(SESSION_MAX_AGE);
    })();
  }

  return readyPromise;
}

async function start(): Promise<void> {
  await ensureReady();

  setInterval(() => {
    void cleanupExpiredSessions(SESSION_MAX_AGE);
  }, 60 * 60 * 1000).unref();

  createServer(nodeHandler).listen(port, () => {
    console.log(`Astral backend listening on http://localhost:${port}`);
    console.log(`Database: ${isRemoteDb() ? 'Turso (cloud)' : 'file:data/local.db (local)'}`);
  });
}

// На Vercel сервер не поднимается — там вызывается nodeHandler из api/.
if (!process.env.VERCEL) {
  void start();
}
