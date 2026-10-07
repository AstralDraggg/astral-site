import { createClient, type Client } from '@libsql/client';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Storage layer.
 *
 * Local development -> file:./data/local.db  (plain SQLite file, nothing to install)
 * Production        -> TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (free Turso database)
 *
 * Both are SQLite, so the SQL is identical.
 */

export type SqlValue = string | number | null | Uint8Array;

export type Purchase = {
  id: string;
  productId: string;
  name: string;
  price: string;
  purchasedAt: string;
};

export type UserRecord = {
  id: string;
  uid: number;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  subscriptionTill: string;
  hwidStatus: string;
  /** HWID машины, с которой заходил лоадер (привязка аккаунта к железу). */
  hwid: string | null;
  friendsList: string[];
  friendRequests: string[];
  sentRequests: string[];
  purchases: Purchase[];
  licenseKey: string | null;
  /** 'user' | 'admin' — права внутри панели управления. */
  role: string;
  /** Аккаунт заблокирован администратором: вход и редактирование запрещены. */
  blocked: boolean;
  /** Последний IP, с которого заходил пользователь (для блокировки по IP). */
  lastIp: string | null;
  /** Когда выставили блокировку (null, если блокировки нет). */
  blockedAt: string | null;
};

export type SessionRecord = {
  token: string;
  userId: string;
  createdAt: string;
};

const dbUrl = process.env.TURSO_DATABASE_URL ?? 'file:data/local.db';
const dbAuthToken = process.env.TURSO_AUTH_TOKEN || undefined;

export const db: Client = createClient({ url: dbUrl, authToken: dbAuthToken });

export function isRemoteDb() {
  return dbUrl !== 'file:data/local.db';
}

function rowToObject(row: unknown, columns: string[]): Record<string, SqlValue> {
  const source = row as Record<string, unknown>;
  const list = row as unknown as SqlValue[];
  const result: Record<string, SqlValue> = {};

  columns.forEach((column, index) => {
    const named = source[column];
    const positional = list[index];
    const value = named === undefined ? positional : named;
    result[column] = (value ?? null) as SqlValue;
  });

  return result;
}

export async function queryAll(sqlText: string, args: SqlValue[] = []): Promise<Record<string, SqlValue>[]> {
  const result = await db.execute({ sql: sqlText, args });
  return result.rows.map((row) => rowToObject(row, result.columns));
}

export async function queryOne(sqlText: string, args: SqlValue[] = []): Promise<Record<string, SqlValue> | null> {
  const rows = await queryAll(sqlText, args);
  return rows[0] ?? null;
}

export async function run(sqlText: string, args: SqlValue[] = []): Promise<void> {
  await db.execute({ sql: sqlText, args });
}

function jsonList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function jsonPurchases(value: unknown): Purchase[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is Purchase =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Purchase).productId === 'string',
  );
}

export function rowToUser(row: Record<string, SqlValue>): UserRecord {
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString();

  return {
    id: String(row.id),
    uid: Number(row.uid ?? 1),
    username: String(row.username ?? 'user'),
    email: String(row.email ?? ''),
    passwordHash: String(row.password_hash ?? ''),
    createdAt,
    subscriptionTill: typeof row.subscription_till === 'string' ? row.subscription_till : createdAt,
    hwidStatus: String(row.hwid_status ?? 'Linked'),
    hwid: typeof row.hwid === 'string' && row.hwid ? row.hwid : null,
    friendsList: jsonList(safeParse(row.friends_list)),
    friendRequests: jsonList(safeParse(row.friend_requests)),
    sentRequests: jsonList(safeParse(row.sent_requests)),
    purchases: jsonPurchases(safeParse(row.purchases)),
    licenseKey: typeof row.license_key === 'string' && row.license_key ? row.license_key : null,
    role: String(row.role ?? 'user') === 'admin' ? 'admin' : 'user',
    blocked: Number(row.blocked ?? 0) === 1,
    lastIp: typeof row.last_ip === 'string' && row.last_ip ? row.last_ip : null,
    blockedAt: typeof row.blocked_at === 'string' && row.blocked_at ? row.blocked_at : null,
  };
}

function safeParse(value: SqlValue | undefined): unknown {
  if (typeof value !== 'string' || !value) {
    return [];
  }

  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export async function readUsers(): Promise<UserRecord[]> {
  const rows = await queryAll('SELECT * FROM users ORDER BY uid ASC');
  return rows.map(rowToUser);
}

const userColumns = [
  'id',
  'uid',
  'username',
  'email',
  'password_hash',
  'created_at',
  'subscription_till',
  'hwid_status',
  'hwid',
  'friends_list',
  'friend_requests',
  'sent_requests',
  'purchases',
  'license_key',
  'role',
  'blocked',
  'last_ip',
  'blocked_at',
];

export async function writeUsers(users: UserRecord[]): Promise<void> {
  const placeholders = userColumns.map(() => '?').join(', ');
  const updates = userColumns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');

  const sqlText = `
    INSERT INTO users (${userColumns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updates}
  `;

  for (const user of users) {
    await run(sqlText, [
      user.id,
      user.uid,
      user.username,
      user.email,
      user.passwordHash,
      user.createdAt,
      user.subscriptionTill,
      user.hwidStatus,
      user.hwid,
      JSON.stringify(user.friendsList),
      JSON.stringify(user.friendRequests),
      JSON.stringify(user.sentRequests),
      JSON.stringify(user.purchases),
      user.licenseKey,
      user.role === 'admin' ? 'admin' : 'user',
      user.blocked ? 1 : 0,
      user.lastIp,
      user.blockedAt,
    ]);
  }
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const row = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
  return row ? rowToUser(row) : null;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const row = await queryOne('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
  return row ? rowToUser(row) : null;
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const row = await queryOne('SELECT * FROM users WHERE lower(username) = lower(?)', [username]);
  return row ? rowToUser(row) : null;
}

export async function saveSession(session: SessionRecord): Promise<void> {
  await run(
    `INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, created_at = excluded.created_at`,
    [session.token, session.userId, session.createdAt],
  );
}

export async function getSession(token: string): Promise<SessionRecord | null> {
  const row = await queryOne('SELECT * FROM sessions WHERE token = ?', [token]);
  if (!row) {
    return null;
  }

  return {
    token: String(row.token),
    userId: String(row.user_id),
    createdAt: String(row.created_at),
  };
}

export async function deleteSession(token: string): Promise<void> {
  await run('DELETE FROM sessions WHERE token = ?', [token]);
}

export type LicenseKeyRecord = {
  key: string;
  productId: string;
  note: string;
  usedBy: string | null;
  createdAt: string;
};

export async function findLicenseKey(key: string): Promise<LicenseKeyRecord | null> {
  const row = await queryOne('SELECT * FROM license_keys WHERE key = ?', [key.trim().toUpperCase()]);
  if (!row) {
    return null;
  }

  return {
    key: String(row.key),
    productId: String(row.product_id ?? ''),
    note: typeof row.note === 'string' ? row.note : '',
    usedBy: typeof row.used_by === 'string' && row.used_by ? row.used_by : null,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function claimLicenseKey(key: string, userId: string): Promise<void> {
  await run('UPDATE license_keys SET used_by = ? WHERE key = ?', [userId, key.trim().toUpperCase()]);
}

export async function insertLicenseKey(key: string, productId: string, note = ''): Promise<void> {
  await run(
    `INSERT INTO license_keys (key, product_id, note, used_by, created_at)
     VALUES (?, ?, ?, NULL, ?)
     ON CONFLICT(key) DO UPDATE SET product_id = excluded.product_id, note = excluded.note`,
    [key.trim().toUpperCase(), productId, note, new Date().toISOString()],
  );
}

/** Меняет роль пользователя ('admin' | 'user'). */
export async function setUserRole(userId: string, role: string): Promise<void> {
  await run('UPDATE users SET role = ? WHERE id = ?', [role === 'admin' ? 'admin' : 'user', userId]);
}

/** Ставит или снимает блокировку аккаунта (IP пользователя при этом остаётся в last_ip). */
export async function setUserBlocked(userId: string, blocked: boolean): Promise<void> {
  await run('UPDATE users SET blocked = ?, blocked_at = ? WHERE id = ?', [
    blocked ? 1 : 0,
    blocked ? new Date().toISOString() : null,
    userId,
  ]);
}

/** Запоминает IP, с которого пользователь зашёл (нужен для блокировки по IP). */
export async function recordUserIp(userId: string, ip: string | null): Promise<void> {
  if (!ip) {
    return;
  }

  await run('UPDATE users SET last_ip = ? WHERE id = ?', [ip, userId]);
}

/**
 * Заблокирован ли IP: он числится у заблокированного аккаунта.
 * Возвращает username, чей блок сработал, — удобно для сообщения об ошибке.
 */
export async function findBlockedIp(ip: string | null): Promise<string | null> {
  if (!ip) {
    return null;
  }

  const row = await queryOne(
    'SELECT username FROM users WHERE blocked = 1 AND last_ip = ? ORDER BY blocked_at DESC LIMIT 1',
    [ip],
  );

  return row ? String(row.username ?? '') : null;
}

/** Полностью удаляет аккаунт (сессии чистит отдельный вызов deleteSessionsForUser). */
export async function deleteUserById(userId: string): Promise<void> {
  await run('DELETE FROM users WHERE id = ?', [userId]);
}

/** Все лицензионные ключи для панели управления. */
export async function listLicenseKeys(): Promise<LicenseKeyRecord[]> {
  const rows = await queryAll('SELECT * FROM license_keys ORDER BY created_at DESC');

  return rows.map((row) => ({
    key: String(row.key),
    productId: String(row.product_id ?? ''),
    note: typeof row.note === 'string' ? row.note : '',
    usedBy: typeof row.used_by === 'string' && row.used_by ? row.used_by : null,
    createdAt: String(row.created_at ?? ''),
  }));
}

/** Удаляет ключ из базы (панель управления). */
export async function deleteLicenseKey(key: string): Promise<void> {
  await run('DELETE FROM license_keys WHERE key = ?', [key.trim().toUpperCase()]);
}

export async function cleanupExpiredSessions(maxAgeMs: number): Promise<void> {
  const rows = await queryAll('SELECT token, created_at FROM sessions');
  const now = Date.now();

  for (const row of rows) {
    const createdAt = Date.parse(String(row.created_at ?? ''));
    if (!Number.isFinite(createdAt) || now - createdAt > maxAgeMs) {
      await deleteSession(String(row.token));
    }
  }
}

// --- email verification codes ------------------------------------------------

export type EmailCodeRecord = {
  id: string;
  email: string;
  purpose: 'register' | 'reset';
  codeHash: string;
  payload: string | null;
  attempts: number;
  expiresAt: number;
  createdAt: string;
};

function rowToEmailCode(row: Record<string, SqlValue>): EmailCodeRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    purpose: String(row.purpose) === 'reset' ? 'reset' : 'register',
    codeHash: String(row.code_hash),
    payload: row.payload === null || row.payload === undefined ? null : String(row.payload),
    attempts: Number(row.attempts ?? 0),
    expiresAt: Number(row.expires_at ?? 0),
    createdAt: String(row.created_at ?? ''),
  };
}

/** Сохраняет новый код, заменяя предыдущий для той же почты и цели. */
export async function saveEmailCode(code: EmailCodeRecord): Promise<void> {
  await deleteEmailCodes(code.email, code.purpose);
  await run(
    `INSERT INTO email_codes (id, email, purpose, code_hash, payload, attempts, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [code.id, code.email, code.purpose, code.codeHash, code.payload, code.attempts, code.expiresAt, code.createdAt],
  );
}

export async function findEmailCode(email: string, purpose: 'register' | 'reset'): Promise<EmailCodeRecord | null> {
  const row = await queryOne(
    'SELECT * FROM email_codes WHERE email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1',
    [email.toLowerCase(), purpose],
  );

  return row ? rowToEmailCode(row) : null;
}

export async function setCodeAttempts(id: string, attempts: number): Promise<void> {
  await run('UPDATE email_codes SET attempts = ? WHERE id = ?', [attempts, id]);
}

export async function deleteEmailCodes(email: string, purpose: 'register' | 'reset'): Promise<void> {
  await run('DELETE FROM email_codes WHERE email = ? AND purpose = ?', [email.toLowerCase(), purpose]);
}

/** Разлогинивает аккаунт на всех устройствах (после сброса пароля). */
export async function deleteSessionsForUser(userId: string): Promise<void> {
  await run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

// --- chat ---------------------------------------------------------------------

export type ChatMessageRecord = {
  id: number;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
  role: string;
  pinned: boolean;
  pinnedBy: string | null;
};

/** Сообщения чата с id больше afterId (восходящий порядок — так удобно догонять опрос). */
export async function listChatMessages(afterId: number, limit = 80): Promise<ChatMessageRecord[]> {
  const rows = await queryAll(
    `SELECT id, user_id, username, text, created_at, pinned, pinned_by, role
       FROM (
         SELECT m.id, m.user_id, m.username, m.text, m.created_at, m.pinned, m.pinned_by, u.role
           FROM chat_messages m
           LEFT JOIN users u ON u.id = m.user_id
          WHERE m.id > ?
          ORDER BY m.id DESC
          LIMIT ?
       )
      ORDER BY id ASC`,
    [afterId, limit],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    userId: String(row.user_id),
    username: String(row.username),
    text: String(row.text),
    createdAt: String(row.created_at),
    pinned: Number(row.pinned ?? 0) === 1,
    pinnedBy: row.pinned_by ? String(row.pinned_by) : null,
    role: row.role ? String(row.role) : 'user',
  }));
}

/** Закреплённые сообщения — отдельным списком, чтобы они не выпадали из окна последних. */
export async function listPinnedChatMessages(limit = 5): Promise<ChatMessageRecord[]> {
  const rows = await queryAll(
    `SELECT m.id, m.user_id, m.username, m.text, m.created_at, m.pinned, m.pinned_by, u.role
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.pinned = 1
      ORDER BY m.id DESC
      LIMIT ?`,
    [limit],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    userId: String(row.user_id),
    username: String(row.username),
    text: String(row.text),
    createdAt: String(row.created_at),
    pinned: true,
    pinnedBy: row.pinned_by ? String(row.pinned_by) : null,
    role: row.role ? String(row.role) : 'user',
  }));
}

export async function setChatPin(id: number, pinned: boolean, by: string | null): Promise<void> {
  await run('UPDATE chat_messages SET pinned = ?, pinned_by = ? WHERE id = ?', [
    pinned ? 1 : 0,
    pinned ? by : null,
    id,
  ]);
}

export async function deleteChatMessage(id: number): Promise<void> {
  await run('DELETE FROM chat_messages WHERE id = ?', [id]);
}

export async function insertChatMessage(
  userId: string,
  username: string,
  text: string,
): Promise<number> {
  const result = await db.execute({
    sql: 'INSERT INTO chat_messages (user_id, username, text, created_at) VALUES (?, ?, ?, ?)',
    args: [userId, username, text, new Date().toISOString()],
  });
  return Number(result.lastInsertRowid ?? 0);
}

/** Отмечает пользователя «онлайн» в чате. */
export async function touchChatPresence(userId: string, username: string): Promise<void> {
  await run(
    `INSERT INTO chat_presence (user_id, username, last_seen) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, last_seen = excluded.last_seen`,
    [userId, username, new Date().toISOString()],
  );
}

/** Сколько людей пинговали чат за последние windowMs миллисекунд. */
export async function countChatOnline(windowMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const row = await queryOne('SELECT COUNT(*) AS total FROM chat_presence WHERE last_seen >= ?', [cutoff]);
  return Number(row?.total ?? 0);
}

/** Чистит старые сообщения и протухшие отметки присутствия. */
export async function cleanupChat(messageMaxAgeMs: number, presenceMaxAgeMs: number): Promise<void> {
  await run('DELETE FROM chat_messages WHERE created_at < ?', [
    new Date(Date.now() - messageMaxAgeMs).toISOString(),
  ]);
  await run('DELETE FROM chat_presence WHERE last_seen < ?', [
    new Date(Date.now() - presenceMaxAgeMs).toISOString(),
  ]);
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  uid INTEGER NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  subscription_till TEXT NOT NULL,
  hwid_status TEXT NOT NULL,
  hwid TEXT,
  friends_list TEXT NOT NULL DEFAULT '[]',
  friend_requests TEXT NOT NULL DEFAULT '[]',
  sent_requests TEXT NOT NULL DEFAULT '[]',
  purchases TEXT NOT NULL DEFAULT '[]',
  license_key TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  blocked INTEGER NOT NULL DEFAULT 0,
  last_ip TEXT,
  blocked_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS license_keys (
  key TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  used_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  payload TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON email_codes (email, purpose);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  pinned_by TEXT
);

CREATE TABLE IF NOT EXISTS chat_presence (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
`;

export async function initSchema(): Promise<void> {
  await db.executeMultiple(schema);
  await ensureRoleColumn();
  await ensureUserColumns();
  await ensureChatColumns();
  await migrateLegacyUsersFile();
}

/** Докидывает колонки в таблицу чата, если она уже создана без них. */
async function ensureChatColumns(): Promise<void> {
  const columns: Array<[string, string]> = [
    ['pinned', 'INTEGER NOT NULL DEFAULT 0'],
    ['pinned_by', 'TEXT'],
  ];

  for (const [name, definition] of columns) {
    try {
      await run(`ALTER TABLE chat_messages ADD COLUMN ${name} ${definition}`);
    } catch {
      // Колонка уже есть — это норма.
    }
  }
}

/** Добавляет колонку role в уже существующую таблицу (игнорирует «колонка уже есть»). */
async function ensureRoleColumn(): Promise<void> {
  try {
    await run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  } catch {
    // Колонка уже добавлена — это норма.
  }
}

/**
 * Колонки, добавленные после создания таблицы, достраиваются в базы постфактум:
 * ALTER TABLE с уже существующей колонкой падает, поэтому каждый шаг свой.
 */
async function ensureUserColumns(): Promise<void> {
  const columns: Array<[string, string]> = [
    ['blocked', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_ip', 'TEXT'],
    ['blocked_at', 'TEXT'],
    ['hwid', 'TEXT'],
  ];

  for (const [name, definition] of columns) {
    try {
      await run(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
    } catch {
      // Колонка уже есть — это норма.
    }
  }
}

/**
 * Keeps existing local data working: if data/users.json has accounts and the
 * database is still empty, they are imported once.
 */
async function migrateLegacyUsersFile(): Promise<void> {
  const legacyPath = path.resolve(process.cwd(), 'data', 'users.json');

  try {
    const existing = await queryAll('SELECT id FROM users LIMIT 1');
    if (existing.length > 0) {
      return;
    }

    const raw = await fs.readFile(legacyPath, 'utf8');
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return;
    }

    const users: UserRecord[] = parsed.map((entry, index) => {
      const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString();

      return {
        id: typeof entry.id === 'string' ? entry.id : `legacy-${index + 1}`,
        uid: Number(entry.uid ?? index + 1),
        username: String(entry.username ?? `user${index + 1}`),
        email: String(entry.email ?? `user${index + 1}@local.dev`),
        passwordHash: String(entry.passwordHash ?? ''),
        createdAt,
        subscriptionTill: String(entry.subscriptionTill ?? createdAt),
        hwidStatus: String(entry.hwidStatus ?? 'Linked'),
        hwid: typeof entry.hwid === 'string' && entry.hwid ? entry.hwid : null,
        friendsList: jsonList(entry.friendsList),
        friendRequests: jsonList(entry.friendRequests),
        sentRequests: jsonList(entry.sentRequests),
        purchases: [],
        licenseKey: null,
        role: 'user',
        blocked: false,
        lastIp: null,
        blockedAt: null,
      };
    });

    await writeUsers(users);
    console.log(`Imported ${users.length} legacy account(s) from data/users.json`);
  } catch {
    // Legacy file is optional, ignore any read/parse problem.
  }
}
