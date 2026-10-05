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
  deleteSession,
  deleteSessionsForUser,
  findEmailCode,
  findLicenseKey,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  getSession,
  initSchema,
  isRemoteDb,
  readUsers,
  saveEmailCode,
  saveSession,
  setCodeAttempts,
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
    { label: 'Стиль', value: 'Чистый приват' },
    { label: 'Модули', value: '70+' },
    { label: 'Конфиги', value: 'Быстрая смена' },
    { label: 'Ощущения', value: 'Быстро и чисто' },
  ],
  features: [
    {
      title: 'Бой',
      description: 'Удары чёткие, прицел чистый, а файты идут плавно, а не как клоунада.',
      icon: 'combat',
    },
    {
      title: 'Движение',
      description: 'Скорость, стрейфы и движение ощущаются плавно: не рывками и не странно.',
      icon: 'movement',
    },
    {
      title: 'Визуал',
      description: 'HUD и визуал остаются аккуратными, экран не превращается в кашу.',
      icon: 'visuals',
    },
    {
      title: 'Конфиги',
      description: 'Быстро меняй сборки и сохраняй свои настройки, не собирая всё с нуля.',
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
      description: 'Стартовый доступ, если просто хочешь зайти и играть.',
      category: 'subscription',
      features: ['25+ визуальных функций', 'Быстрые модули', 'Поддержка 24/7', 'Частые обновления клиента'],
    },
    {
      id: 'sub-90',
      name: 'Astral',
      price: '689₽',
      duration: '/ 90 дней',
      badge: 'Нас выбирают 5 000 игроков',
      description: 'Лучший вариант посередине, если играешь много и хочешь всё и сразу.',
      category: 'subscription',
      features: ['25+ визуальных функций', 'Быстрые модули', 'Поддержка 24/7', 'Частые обновления клиента'],
    },
    {
      id: 'sub-999',
      name: 'Astral',
      price: '989₽',
      duration: '/ 999 дней',
      badge: 'Нас выбирают 5 000 игроков',
      description: 'Долгий вариант. Купил один раз и больше не думаешь.',
      category: 'subscription',
      features: ['25+ визуальных функций', 'Быстрые модули', 'Поддержка 24/7', 'Частые обновления клиента'],
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
  const match = /(\d+)\s*days/i.exec(product.duration);
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
    friends: user.friendsList.length,
    licenseKey: user.licenseKey,
    purchases: user.purchases,
  };
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
  const forwarded = request.headers['x-forwarded-for'];
  const forwardedIp = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  const ip = forwardedIp || request.socket?.remoteAddress || 'unknown';
  return `${scope}:${ip}`;
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
 * Обработчик запросов в формате node:http.
 * Локально поднимается через createServer, на Vercel вызывается из api/.
 */
export async function nodeHandler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await ensureReady();

  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = request.url ?? '/';
  const isApi = url === '/api' || url.startsWith('/api/');

  if (!isApi) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      await serveStatic(request, response);
    } else {
      response.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Метод не поддерживается.' }));
    }
    return;
  }

  if (request.method === 'GET' && url === '/api/health') {
    sendJson(response, 200, { ok: true, service: 'astral-backend', database: isRemoteDb() ? 'turso' : 'file' });
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
        friendsList: [],
        friendRequests: [],
        sentRequests: [],
        purchases: [],
        licenseKey: null,
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
      const email = body.email?.trim().toLowerCase() ?? '';
      const password = body.password ?? '';

      if (!email || !password) {
        sendJson(response, 400, { error: 'Введите email и пароль.' });
        return;
      }

      const user = await findUserByEmail(email);

      if (!user || !verifyPassword(password, user.passwordHash)) {
        sendJson(response, 401, { error: 'Неверный email или пароль.' });
        return;
      }

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
      message: product ? `Ключ принят: ${product.name}.` : 'Ключ принят.',
      product: product ? { id: product.id, name: product.name } : null,
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
