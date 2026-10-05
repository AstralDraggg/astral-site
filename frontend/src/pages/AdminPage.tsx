import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import adminIcon from '../../assets/ranking.svg';
import userIcon from '../../assets/user.svg';
import { AuthUser, formatDate, tokenKey } from '../auth';

type AdminStats = {
  users: number;
  admins: number;
  activeSubscriptions: number;
  purchases: number;
  keysTotal: number;
  keysFree: number;
};

type AdminUser = AuthUser & {
  active: boolean;
  purchasesCount?: number;
};

type AdminKey = {
  key: string;
  productId: string;
  note: string;
  usedBy: string | null;
  usedByUsername: string | null;
  createdAt: string;
};

type Product = {
  id: string;
  name: string;
  duration: string;
  price: string;
  category: string;
};

type Tab = 'overview' | 'users' | 'keys';

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem(tokenKey);
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

function AdminPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentUsers, setRecentUsers] = useState<AdminUser[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [keys, setKeys] = useState<AdminKey[]>([]);

  const [search, setSearch] = useState('');
  const [keyProduct, setKeyProduct] = useState('');
  const [keyCount, setKeyCount] = useState(1);
  const [keyNote, setKeyNote] = useState('');
  const [createdKeys, setCreatedKeys] = useState<string[]>([]);

  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const notify = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 3500);
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/overview', { headers: authHeaders() });
      if (!response.ok) {
        throw new Error(String(response.status));
      }

      const data = (await response.json()) as {
        stats: AdminStats;
        recentUsers: AdminUser[];
        products: Product[];
      };
      setStats(data.stats);
      setRecentUsers(data.recentUsers);
      setProducts(data.products);
      setKeyProduct((current) => current || data.products[0]?.id || '');
    } catch {
      notify('Не удалось загрузить обзор', 'error');
    }
  }, [notify]);

  const loadUsers = useCallback(
    async (query?: string) => {
      try {
        const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
        const response = await fetch(`/api/admin/users${suffix}`, { headers: authHeaders() });
        if (!response.ok) {
          throw new Error(String(response.status));
        }

        const data = (await response.json()) as { users: AdminUser[] };
        setUsers(data.users);
      } catch {
        notify('Не удалось загрузить пользователей', 'error');
      }
    },
    [notify],
  );

  const loadKeys = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/keys', { headers: authHeaders() });
      if (!response.ok) {
        throw new Error(String(response.status));
      }

      const data = (await response.json()) as { keys: AdminKey[] };
      setKeys(data.keys);
    } catch {
      notify('Не удалось загрузить ключи', 'error');
    }
  }, [notify]);

  useEffect(() => {
    const token = window.localStorage.getItem(tokenKey);
    if (!token) {
      setLoading(false);
      return;
    }

    async function loadUser() {
      try {
        const response = await fetch('/api/auth/me', { headers: authHeaders() });

        if (!response.ok) {
          window.localStorage.removeItem(tokenKey);
          setUser(null);
          return;
        }

        const data = (await response.json()) as { user: AuthUser };
        setUser(data.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    void loadUser();
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') {
      void loadOverview();
      void loadUsers();
      void loadKeys();
    }
  }, [user, loadOverview, loadUsers, loadKeys]);

  async function updateUser(userId: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ userId, ...payload }),
      });
      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        notify(data.error ?? 'Не удалось обновить пользователя', 'error');
        return;
      }

      notify(data.message ?? 'Готово');
      await Promise.all([loadUsers(search), loadOverview()]);
    } catch {
      notify('Сервер не отвечает', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(userId: string, username: string) {
    if (!window.confirm(`Удалить аккаунт ${username}? Это действие необратимо.`)) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ userId }),
      });
      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        notify(data.error ?? 'Не удалось удалить пользователя', 'error');
        return;
      }

      notify(data.message ?? 'Удалено');
      await Promise.all([loadUsers(search), loadOverview()]);
    } catch {
      notify('Сервер не отвечает', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function createKeys() {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ productId: keyProduct, note: keyNote, count: keyCount }),
      });
      const data = (await response.json()) as { keys?: string[]; error?: string };

      if (!response.ok) {
        notify(data.error ?? 'Не удалось создать ключи', 'error');
        return;
      }

      setCreatedKeys(data.keys ?? []);
      notify(`Создано ключей: ${(data.keys ?? []).length}`);
      await Promise.all([loadKeys(), loadOverview()]);
    } catch {
      notify('Сервер не отвечает', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeKey(key: string) {
    if (!window.confirm(`Удалить ключ ${key}?`)) return;

    setBusy(true);
    try {
      const response = await fetch('/api/admin/keys/delete', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ key }),
      });
      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        notify(data.error ?? 'Не удалось удалить ключ', 'error');
        return;
      }

      notify(data.message ?? 'Ключ удалён');
      await Promise.all([loadKeys(), loadOverview()]);
    } catch {
      notify('Сервер не отвечает', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify('Скопировано');
    } catch {
      notify('Не удалось скопировать', 'error');
    }
  }

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return <section className="content-panel route-panel">Загрузка...</section>;
  }

  if (user?.role !== 'admin') {
    return (
      <section className="route-panel admin-denied" data-reveal="admin">
        <div className="content-panel admin-denied-card">
          <img src={adminIcon} alt="" aria-hidden="true" className="admin-denied-icon" />
          <h2 className="admin-title">Доступ запрещён</h2>
          <p className="admin-subtitle">Эта страница доступна только администраторам.</p>
          <Link to="/profile" className="button-secondary">
            В профиль
          </Link>
        </div>
      </section>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Обзор' },
    { id: 'users', label: `Пользователи${users.length ? ` (${users.length})` : ''}` },
    { id: 'keys', label: `Ключи${keys.length ? ` (${keys.length})` : ''}` },
  ];

  return (
    <section className="route-panel admin-page" data-reveal="admin">
      <div className="admin-hero" data-reveal="hero">
        <div className="admin-chip">
          <img src={adminIcon} alt="" aria-hidden="true" className="note-icon" />
          Панель управления
        </div>
        <h2 className="admin-heading">Админ-панель Astral</h2>
        <p className="admin-subtitle">Пользователи, подписки и лицензионные ключи.</p>
      </div>

      <div className="admin-tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`admin-tab${tab === item.id ? ' admin-tab-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {notice && <p className={`admin-notice ${notice.kind === 'ok' ? 'is-ok' : 'is-error'}`}>{notice.text}</p>}

      <div className="content-panel admin-content">
        {tab === 'overview' && (
          <div className="admin-overview">
            <div className="admin-stats">
              <div className="admin-stat">
                <span className="admin-stat-value">{stats?.users ?? '—'}</span>
                <span className="admin-stat-label">Всего аккаунтов</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat-value">{stats?.activeSubscriptions ?? '—'}</span>
                <span className="admin-stat-label">Активные подписки</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat-value">{stats?.purchases ?? '—'}</span>
                <span className="admin-stat-label">Покупок</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat-value">
                  {stats ? `${stats.keysFree}/${stats.keysTotal}` : '—'}
                </span>
                <span className="admin-stat-label">Ключи свободны</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat-value">{stats?.admins ?? '—'}</span>
                <span className="admin-stat-label">Администраторы</span>
              </div>
            </div>

            <h3 className="admin-section-title">Последние регистрации</h3>
            <div className="admin-list">
              {recentUsers.length === 0 && <p className="admin-empty">Пока пусто</p>}
              {recentUsers.map((entry) => (
                <div key={entry.id} className="admin-row">
                  <div className="admin-row-main">
                    <img src={userIcon} alt="" aria-hidden="true" className="mini-icon" />
                    <div>
                      <p className="admin-row-title">
                        {entry.username}
                        {entry.role === 'admin' && <span className="admin-badge">админ</span>}
                      </p>
                      <p className="admin-row-sub">
                        {entry.email} · #{entry.uid} · {formatDate(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span className={`admin-status ${entry.active ? 'is-active' : 'is-expired'}`}>
                    {entry.active ? 'подписка активна' : 'подписка истекла'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="admin-users">
            <div className="admin-search">
              <input
                type="text"
                placeholder="Поиск по юзернейму, email или UID..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void loadUsers(search)}
              />
              <button type="button" className="button-secondary" onClick={() => void loadUsers(search)}>
                Найти
              </button>
            </div>

            <div className="admin-list">
              {users.length === 0 && <p className="admin-empty">Никого не нашлось</p>}
              {users.map((entry) => (
                <div key={entry.id} className="admin-row admin-row-user">
                  <div className="admin-row-main">
                    <img src={userIcon} alt="" aria-hidden="true" className="mini-icon" />
                    <div>
                      <p className="admin-row-title">
                        {entry.username}
                        <span className="admin-badge">{entry.role === 'admin' ? 'админ' : 'юзер'}</span>
                        <span className={`admin-status ${entry.active ? 'is-active' : 'is-expired'}`}>
                          {entry.active ? 'активна' : 'истекла'}
                        </span>
                      </p>
                      <p className="admin-row-sub">
                        {entry.email} · #{entry.uid} · подписка до {formatDate(entry.subscriptionTill)} · покупок:{' '}
                        {entry.purchasesCount ?? 0}
                      </p>
                    </div>
                  </div>

                  <div className="admin-actions">
                    <button
                      type="button"
                      className="admin-action"
                      disabled={busy}
                      onClick={() => void updateUser(entry.id, { role: entry.role === 'admin' ? 'user' : 'admin' })}
                    >
                      {entry.role === 'admin' ? 'Снять админа' : 'Сделать админом'}
                    </button>
                    <button
                      type="button"
                      className="admin-action"
                      disabled={busy}
                      onClick={() => void updateUser(entry.id, { days: 30 })}
                    >
                      +30 дней
                    </button>
                    <button
                      type="button"
                      className="admin-action"
                      disabled={busy}
                      onClick={() => void updateUser(entry.id, { hwidStatus: 'Reset ready' })}
                    >
                      Сброс HWID
                    </button>
                    <button
                      type="button"
                      className="admin-action is-danger"
                      disabled={busy || entry.id === user.id}
                      onClick={() => void deleteUser(entry.id, entry.username)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'keys' && (
          <div className="admin-keys">
            <div className="admin-keyform">
              <label className="admin-field">
                <span>Товар</span>
                <select value={keyProduct} onChange={(event) => setKeyProduct(event.target.value)}>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} {product.duration} — {product.price}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-field">
                <span>Количество</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={keyCount}
                  onChange={(event) => setKeyCount(Number(event.target.value))}
                />
              </label>

              <label className="admin-field admin-field-wide">
                <span>Заметка (необязательно)</span>
                <input
                  type="text"
                  placeholder="Например: для тиктокера"
                  value={keyNote}
                  onChange={(event) => setKeyNote(event.target.value)}
                />
              </label>

              <button type="button" className="button-primary" disabled={busy} onClick={() => void createKeys()}>
                Создать ключи
              </button>
            </div>

            {createdKeys.length > 0 && (
              <div className="admin-created">
                <p className="admin-section-title">Новые ключи</p>
                <div className="admin-created-list">
                  {createdKeys.map((key) => (
                    <button key={key} type="button" className="admin-key-chip" onClick={() => void copyText(key)}>
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="admin-list">
              {keys.length === 0 && <p className="admin-empty">Ключей пока нет</p>}
              {keys.map((entry) => (
                <div key={entry.key} className="admin-row">
                  <div className="admin-row-main">
                    <div>
                      <p className="admin-row-title admin-key-value">{entry.key}</p>
                      <p className="admin-row-sub">
                        {products.find((product) => product.id === entry.productId)?.name ?? entry.productId}
                        {entry.note ? ` · ${entry.note}` : ''} · {formatDate(entry.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="admin-actions">
                    <span className={`admin-status ${entry.usedBy ? 'is-expired' : 'is-active'}`}>
                      {entry.usedByUsername ? `активирован: ${entry.usedByUsername}` : 'свободен'}
                    </span>
                    <button type="button" className="admin-action" onClick={() => void copyText(entry.key)}>
                      Копировать
                    </button>
                    <button
                      type="button"
                      className="admin-action is-danger"
                      disabled={busy}
                      onClick={() => void removeKey(entry.key)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default AdminPage;
