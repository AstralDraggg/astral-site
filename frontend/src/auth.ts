export type AuthUser = {
  id: string;
  uid: number;
  username: string;
  email: string;
  createdAt: string;
  subscriptionTill: string;
  hwidStatus: string;
  friends: number;
  role?: 'user' | 'admin';
  /** Аккаунт заблокирован администратором. */
  blocked?: boolean;
  blockedAt?: string | null;
  lastIp?: string | null;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export const tokenKey = 'astral_auth_token';
const userKey = 'astral_auth_user';

/**
 * Юзер из localStorage — читаем синхронно, чтобы после перезагрузки шапка
 * сразу рисовалась залогиненной, а не мигала «Вход», пока летит /api/auth/me.
 * Живёт только вместе с токеном: токена нет — кеш не отдаём.
 */
export function readCachedUser(): AuthUser | null {
  try {
    const token = window.localStorage.getItem(tokenKey);
    const raw = window.localStorage.getItem(userKey);
    if (!token || !raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as AuthUser | null;
    return parsed && typeof parsed.username === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/** Запоминаем юзера после входа и после каждого успешного /api/auth/me. */
export function writeCachedUser(user: AuthUser | null): void {
  try {
    if (user) {
      window.localStorage.setItem(userKey, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(userKey);
    }
  } catch {
    // localStorage недоступен (приватный режим) — просто работаем без кеша.
  }
}

export function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString('ru-RU');
}
