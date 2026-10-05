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
  friendsList: string[];
  friendRequests: string[];
  sentRequests: string[];
  purchases: Purchase[];
  licenseKey: string | null;
  /** 'user' | 'admin' — права внутри панели управления. */
  role: string;
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
    friendsList: jsonList(safeParse(row.friends_list)),
    friendRequests: jsonList(safeParse(row.friend_requests)),
    sentRequests: jsonList(safeParse(row.sent_requests)),
    purchases: jsonPurchases(safeParse(row.purchases)),
    licenseKey: typeof row.license_key === 'string' && row.license_key ? row.license_key : null,
    role: String(row.role ?? 'user') === 'admin' ? 'admin' : 'user',
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
  'friends_list',
  'friend_requests',
  'sent_requests',
  'purchases',
  'license_key',
  'role',
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
      JSON.stringify(user.friendsList),
      JSON.stringify(user.friendRequests),
      JSON.stringify(user.sentRequests),
      JSON.stringify(user.purchases),
      user.licenseKey,
      user.role === 'admin' ? 'admin' : 'user',
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
  friends_list TEXT NOT NULL DEFAULT '[]',
  friend_requests TEXT NOT NULL DEFAULT '[]',
  sent_requests TEXT NOT NULL DEFAULT '[]',
  purchases TEXT NOT NULL DEFAULT '[]',
  license_key TEXT,
  role TEXT NOT NULL DEFAULT 'user'
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
`;

export async function initSchema(): Promise<void> {
  await db.executeMultiple(schema);
  await ensureRoleColumn();
  await migrateLegacyUsersFile();
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
        friendsList: jsonList(entry.friendsList),
        friendRequests: jsonList(entry.friendRequests),
        sentRequests: jsonList(entry.sentRequests),
        purchases: [],
        licenseKey: null,
        role: 'user',
      };
    });

    await writeUsers(users);
    console.log(`Imported ${users.length} legacy account(s) from data/users.json`);
  } catch {
    // Legacy file is optional, ignore any read/parse problem.
  }
}
