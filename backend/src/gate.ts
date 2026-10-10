import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Защита при входе на сайт.
 *
 * Как устроено:
 *   1. Браузер берёт задание (/api/gate/challenge).
 *   2. Локально подбирает решение (proof-of-work: SHA-256 с нужным числом
 *      нулей в начале хеша). Бот без JS это не сделает, а бот с JS должен
 *      потратить процессорное время.
 *   3. Отдаёт решение на /api/gate/verify, сервер проверяет и ставит
 *      подписанный HttpOnly-куки на несколько часов.
 *   4. Все браузерные запросы API без этого куки получают 403.
 *
 * Что здесь НЕ защищаем: логин/регистрацию/активацию ключа — ими пользуется
 * лоадер Astral.exe, у которого браузера нет. Эти маршруты живут под своими
 * лимитами (rateLimit в server.ts).
 */

const CHALLENGE_TTL_MS = 180_000;
const TOKEN_TTL_MS = 6 * 60 * 60_000;
const COOKIE_NAME = 'astral_gate';

const CHALLENGE_LIMIT = 40; // заданий в минуту на IP
const VERIFY_LIMIT = 20; // решений в минуту на IP
const FAIL_LIMIT = 15; // неверных решений за окно
const FAIL_WINDOW_MS = 10 * 60_000;
const FAIL_BLOCK_MS = 10 * 60_000;

/** Общий бюджет запросов API на один адрес в минуту. */
const API_LIMIT = 480;
const STRIKE_LIMIT = 25; // сколько раз уложился в лимит 429 за окно
const STRIKE_WINDOW_MS = 10 * 60_000;
const STRIKE_BLOCK_MS = 10 * 60_000;

type Bucket = { count: number; resetAt: number };
type Track = { count: number; windowEnd: number; blockedUntil: number };

const buckets = new Map<string, Bucket>();
const tracks = new Map<string, Track>();

/** IP клиента: учитывает X-Forwarded-For от прокси/Vercel. */
export function clientIp(request: IncomingMessage): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  const forwardedIp = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  const ip = forwardedIp || request.socket?.remoteAddress || '';
  return ip || null;
}

function headerValue(request: IncomingMessage, name: string): string {
  const raw = request.headers[name];
  return (Array.isArray(raw) ? raw[0] : raw) ?? '';
}

/**
 * Карта с лимитами растёт на каждый новый адрес. Периодически выкидываем
 * протухшее, иначе при потоке мусорного трафика процесс съест память.
 */
const sweeper = setInterval(() => {
  const now = Date.now();

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  for (const [key, track] of tracks) {
    if (track.windowEnd <= now && track.blockedUntil <= now) {
      tracks.delete(key);
    }
  }

  if (buckets.size > 20_000) {
    buckets.clear();
  }
  if (tracks.size > 20_000) {
    tracks.clear();
  }
}, 60_000);

sweeper.unref?.();

function takeBucket(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= limit;
}

function trackFor(key: string, windowMs: number): Track {
  const now = Date.now();
  let track = tracks.get(key);

  if (!track || track.windowEnd <= now) {
    track = { count: 0, windowEnd: now + windowMs, blockedUntil: 0 };
    tracks.set(key, track);
  }

  return track;
}

// --- общий защитный рубильник ----------------------------------------------

export type GuardVerdict = { status: number; error: string; retryAfter?: number } | null;

/**
 * Первое, что проходит запрос: общий бюджет на адрес и временное блокировка
 * для тех, кто упорно упирается в лимиты.
 */
export function guardRequest(request: IncomingMessage): GuardVerdict {
  const ip = clientIp(request);
  if (!ip) {
    return { status: 403, error: 'Не удалось определить адрес.' };
  }

  const now = Date.now();
  const track = tracks.get(ip);
  if (track && track.blockedUntil > now) {
    return {
      status: 429,
      error: 'Слишком много запросов. Подождите немного.',
      retryAfter: Math.ceil((track.blockedUntil - now) / 1000),
    };
  }

  if (!takeBucket(`api:${ip}`, API_LIMIT, 60_000)) {
    const strike = trackFor(`strike:${ip}`, STRIKE_WINDOW_MS);
    strike.count += 1;
    if (strike.count >= STRIKE_LIMIT) {
      strike.blockedUntil = Date.now() + STRIKE_BLOCK_MS;
    }

    return { status: 429, error: 'Слишком много запросов. Подождите минуту.', retryAfter: 60 };
  }

  return null;
}

/**
 * Маршруты, которые не требуют прохождения проверки: сама проверка, служебное
 * и всё, чем пользуется лоадер (у него нет браузера).
 */
const GATE_EXEMPT = ['/api/health', '/api/diag', '/api/gate/challenge', '/api/gate/verify'];
const GATE_EXEMPT_PREFIXES = ['/api/auth/', '/api/license/', '/api/launcher/'];

export function isGateExempt(url: string): boolean {
  if (GATE_EXEMPT.includes(url)) {
    return true;
  }

  return GATE_EXEMPT_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/** Похоже ли, что запрос пришёл из настоящего браузера, а не из скрипта. */
export function isBrowserLike(request: IncomingMessage): boolean {
  const agent = headerValue(request, 'user-agent').trim();
  if (!agent) {
    return false;
  }

  if (
    /(curl|wget|libcurl|python-requests|python-urllib|python-httpx|httpx\/|aiohttp|go-http-client|okhttp|libwww|java\/|scrapy|sqlmap|nikto|masscan|zgrab|nmap|headlesschrome|phantomjs|playwright|puppeteer|selenium)/i.test(
      agent,
    )
  ) {
    return false;
  }

  // Настоящий браузер всегда присылает Accept; пустой или отсутствующий — признак скрипта.
  return Boolean(headerValue(request, 'accept').trim());
}

// --- сама проверка ------------------------------------------------------------

export function gateDifficulty(): number {
  const raw = Number(process.env.GATE_DIFFICULTY);
  if (!Number.isFinite(raw)) {
    return 4;
  }

  return Math.min(6, Math.max(3, Math.trunc(raw)));
}

export function makeChallenge(): { nonce: string; ts: number; difficulty: number } {
  return {
    nonce: randomBytes(16).toString('hex'),
    ts: Date.now(),
    difficulty: gateDifficulty(),
  };
}

function solveHash(nonce: string, counter: number): string {
  return createHash('sha256').update(`${nonce}:${counter}`).digest('hex');
}

export function allowChallenge(request: IncomingMessage): boolean {
  const ip = clientIp(request);
  return Boolean(ip && takeBucket(`challenge:${ip}`, CHALLENGE_LIMIT, 60_000));
}

export type VerifyResult =
  | { ok: true; token: string; maxAge: number }
  | { ok: false; status: number; error: string; retryAfter?: number };

export function verifyChallenge(
  request: IncomingMessage,
  body: Record<string, string>,
): VerifyResult {
  const ip = clientIp(request);
  if (!ip) {
    return { ok: false, status: 403, error: 'Не удалось определить адрес.' };
  }

  const now = Date.now();
  const track = tracks.get(ip);
  if (track && track.blockedUntil > now) {
    return {
      ok: false,
      status: 429,
      error: 'Слишком много неудачных попыток. Подождите немного.',
      retryAfter: Math.ceil((track.blockedUntil - now) / 1000),
    };
  }

  if (!takeBucket(`verify:${ip}`, VERIFY_LIMIT, 60_000)) {
    return { ok: false, status: 429, error: 'Слишком много запросов. Подождите минуту.', retryAfter: 60 };
  }

  const nonce = body.nonce ?? '';
  const ts = Number(body.ts);
  const difficulty = Number(body.difficulty);
  const counter = Number(body.counter);

  // Сложность нельзя занизить, задание должно быть свежим, а счётчик — числом.
  const wellFormed =
    /^[a-f0-9]{32}$/.test(nonce) &&
    Number.isFinite(ts) &&
    Math.abs(now - ts) <= CHALLENGE_TTL_MS &&
    difficulty === gateDifficulty() &&
    Number.isSafeInteger(counter) &&
    counter >= 0 &&
    counter < 20_000_000;

  const solved = wellFormed && solveHash(nonce, counter).startsWith('0'.repeat(difficulty));

  if (!solved) {
    const fail = trackFor(`fail:${ip}`, FAIL_WINDOW_MS);
    fail.count += 1;
    if (fail.count >= FAIL_LIMIT) {
      fail.blockedUntil = Date.now() + FAIL_BLOCK_MS;
    }

    return { ok: false, status: 403, error: 'Проверка не пройдена. Обновите страницу.' };
  }

  return { ok: true, token: issueGateToken(), maxAge: TOKEN_TTL_MS };
}

function secret(): string {
  return process.env.TOKEN_SECRET || 'astral-gate';
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(`gate:${value}`).digest('hex');
}

function issueGateToken(): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  return `g1.${exp}.${sign(String(exp))}`;
}

export function readGateToken(request: IncomingMessage): string | null {
  const header = headerValue(request, 'cookie');
  if (!header) {
    return null;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() !== COOKIE_NAME) {
      continue;
    }

    return decodeURIComponent(part.slice(separator + 1).trim());
  }

  return null;
}

export function isValidGateToken(token: string | null): boolean {
  if (!token) {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'g1') {
    return false;
  }

  const [, expRaw, signature] = parts;
  if (!/^\d{1,15}$/.test(expRaw ?? '')) {
    return false;
  }

  const expected = Buffer.from(sign(expRaw));
  const actual = Buffer.from(signature ?? '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return false;
  }

  return Number(expRaw) > Date.now();
}

export function setGateCookie(response: ServerResponse, token: string, maxAge: number): void {
  response.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${Math.floor(maxAge / 1000)}; Path=/; HttpOnly; SameSite=Lax`,
  );
}
