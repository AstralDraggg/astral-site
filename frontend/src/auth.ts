export type AuthUser = {
  id: string;
  uid: number;
  username: string;
  email: string;
  createdAt: string;
  subscriptionTill: string;
  hwidStatus: string;
  friends: number;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export const tokenKey = 'astral_auth_token';

export function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString('ru-RU');
}
