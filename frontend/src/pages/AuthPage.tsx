import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import userIcon from '../../assets/user-application-identity-authentication-login.svg';
import { AuthResponse, AuthUser, tokenKey } from '../auth';

type AuthPageProps = {
  mode: 'login' | 'register' | 'forgot';
};

type CodeSentResponse = {
  requireCode?: boolean;
  ok?: boolean;
  email?: string;
  devCode?: string;
  error?: string;
};

type PendingRegistration = {
  username: string;
  email: string;
  password: string;
  repeatPassword: string;
};

function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate();
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';

  const [step, setStep] = useState<'form' | 'code'>('form');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const pendingRef = useRef<PendingRegistration | null>(null);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [cooldown]);

  useEffect(() => {
    const token = window.localStorage.getItem(tokenKey);
    if (!token) {
      return;
    }

    async function loadUser() {
      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          window.localStorage.removeItem(tokenKey);
          return;
        }

        const data = (await response.json()) as { user: AuthUser };
        setCurrentUser(data.user);
      } catch {
        window.localStorage.removeItem(tokenKey);
      }
    }

    void loadUser();
  }, []);

  function applyCodeResponse(data: CodeSentResponse, successText: string) {
    if (data.devCode) {
      setCode(data.devCode);
    }

    setMessage(successText);
    setCooldown(60);
    setStep('code');
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (isRegister && password !== repeatPassword) {
      setError('Пароли не совпадают.');
      return;
    }

    setLoading(true);

    try {
      if (isForgot) {
        const response = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const data = (await response.json()) as CodeSentResponse;

        if (!response.ok || !data.ok) {
          setError(data.error ?? 'Не удалось отправить код.');
          return;
        }

        applyCodeResponse(data, `Код отправлен на ${email}. Проверьте почту и папку «Спам».`);
        return;
      }

      if (isRegister) {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password, repeatPassword }),
        });

        const data = (await response.json()) as CodeSentResponse;

        if (!response.ok || !data.requireCode) {
          setError(data.error ?? 'Не удалось начать регистрацию.');
          return;
        }

        pendingRef.current = { username, email, password, repeatPassword };
        applyCodeResponse(data, `Код отправлен на ${email}. Проверьте почту и папку «Спам».`);
        return;
      }

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as AuthResponse | { error: string };

      if (!response.ok || !('token' in data)) {
        setError('error' in data ? data.error : 'Неверный email или пароль.');
        return;
      }

      window.localStorage.setItem(tokenKey, data.token);
      setCurrentUser(data.user);
      setMessage('Вы вошли. Перенаправляем...');
      setPassword('');

      window.setTimeout(() => {
        navigate('/profile');
      }, 500);
    } catch {
      setError('Сервер не отвечает.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isRegister) {
        const response = await fetch('/api/auth/register/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: pendingRef.current?.email ?? email, code }),
        });

        const data = (await response.json()) as AuthResponse | { error: string };

        if (!response.ok || !('token' in data)) {
          setError('error' in data ? data.error : 'Неверный код.');
          return;
        }

        window.localStorage.setItem(tokenKey, data.token);
        setCurrentUser(data.user);
        setMessage('Аккаунт создан. Перенаправляем...');

        window.setTimeout(() => {
          navigate('/profile');
        }, 500);
        return;
      }

      if (password.length < 6) {
        setError('Пароль слишком короткий.');
        return;
      }

      if (password !== repeatPassword) {
        setError('Пароли не совпадают.');
        return;
      }

      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password, repeatPassword }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setError(data.error ?? 'Не удалось сбросить пароль.');
        return;
      }

      setMessage('Пароль обновлён. Перенаправляем на вход...');

      window.setTimeout(() => {
        navigate('/login');
      }, 900);
    } catch {
      setError('Сервер не отвечает.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || loading) {
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);

    try {
      const isRegisterResend = isRegister;
      const payload = isRegisterResend
        ? pendingRef.current
          ? { ...pendingRef.current }
          : null
        : { email };

      if (!payload) {
        setStep('form');
        return;
      }

      const response = await fetch(isRegisterResend ? '/api/auth/register' : '/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as CodeSentResponse;

      if (!response.ok || !(isRegisterResend ? data.requireCode : data.ok)) {
        setError(data.error ?? 'Не удалось отправить код.');
        return;
      }

      if (data.devCode) {
        setCode(data.devCode);
      }

      setMessage('Код отправлен повторно.');
      setCooldown(60);
    } catch {
      setError('Сервер не отвечает.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    const token = window.localStorage.getItem(tokenKey);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });
    } catch {
      // Ignore logout transport errors on the client.
    }

    window.localStorage.removeItem(tokenKey);
    setCurrentUser(null);
    setMessage('Вы вышли из аккаунта.');
  }

  const stepTitle = step === 'code' ? 'Подтверждение' : isRegister ? 'Регистрация' : isForgot ? 'Сброс пароля' : 'Вход';

  return (
    <section className="auth-page route-panel" data-reveal="auth">
      <div className="auth-copy content-panel inner-panel" data-reveal="card">
        <p className="section-kicker">{stepTitle}</p>
        <h2>
          {isRegister
            ? 'Создай аккаунт Astral'
            : isForgot
              ? 'Забыли пароль?'
              : 'Вход в аккаунт Astral'}
        </h2>
        <p className="hero-description">
          {isRegister
            ? 'Создай аккаунт, подтверди код с почты и забирай сборку вместе с покупками и конфигами.'
            : isForgot
              ? 'Оставь email — пришлём код, после которого можно поставить новый пароль.'
              : 'Войди, чтобы вернуться к аккаунту, покупкам и конфигам.'}
        </p>

        {currentUser && (
          <div className="session-card">
            <p className="session-title">Вы уже вошли.</p>
            <p className="session-copy">
              {currentUser.username} · UID {currentUser.uid}
            </p>
            <div className="session-actions">
              <button type="button" className="button-secondary" onClick={() => navigate('/profile')}>
                Открыть профиль
              </button>
              <button type="button" className="button-secondary" onClick={handleLogout}>
                Выйти
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="auth-card" data-reveal="card">
        <div className="auth-card-header">
          <img src={userIcon} alt="" aria-hidden="true" className="dashboard-icon" />
          <div>
            <p className="section-kicker">{stepTitle}</p>
            <h3>
              {step === 'code'
                ? 'Введите код'
                : isRegister
                  ? 'Новый аккаунт'
                  : isForgot
                    ? 'Восстановление'
                    : 'Существующий аккаунт'}
            </h3>
          </div>
        </div>

        {step === 'form' ? (
          <form className="auth-form" onSubmit={handleFormSubmit}>
            {isRegister && (
              <label className="field">
                <span>Username</span>
                <input
                  type="text"
                  placeholder="Astraluser"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
            )}

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            {!isForgot && (
              <label className="field">
                <span>Пароль</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            )}

            {isRegister && (
              <label className="field">
                <span>Повторите пароль</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={repeatPassword}
                  onChange={(event) => setRepeatPassword(event.target.value)}
                />
              </label>
            )}

            {mode === 'login' && (
              <button type="button" className="auth-link" onClick={() => navigate('/forgot-password')}>
                Забыли пароль?
              </button>
            )}

            {error && <p className="form-error">{error}</p>}
            {message && <p className="form-success">{message}</p>}

            <button type="submit" className="button-primary full-width" disabled={loading}>
              <img src={userIcon} alt="" aria-hidden="true" className="button-icon" />
              {loading
                ? 'Ждём...'
                : isRegister || isForgot
                  ? 'Получить код'
                  : 'Войти'}
            </button>

            {isForgot && (
              <button type="button" className="auth-link" onClick={() => navigate('/login')}>
                Вернуться ко входу
              </button>
            )}
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleCodeSubmit}>
            <p className="auth-hint">
              Код отправлен на <strong>{email}</strong>. Он действует 10 минут.
            </p>

            <label className="field">
              <span>Код из письма</span>
              <input
                className="code-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </label>

            {isForgot && (
              <>
                <label className="field">
                  <span>Новый пароль</span>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Повторите новый пароль</span>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={repeatPassword}
                    onChange={(event) => setRepeatPassword(event.target.value)}
                  />
                </label>
              </>
            )}

            {error && <p className="form-error">{error}</p>}
            {message && <p className="form-success">{message}</p>}

            <button
              type="submit"
              className="button-primary full-width"
              disabled={loading || code.length !== 6}
            >
              {loading ? 'Ждём...' : isRegister ? 'Подтвердить и создать аккаунт' : 'Сбросить пароль'}
            </button>

            <div className="auth-code-actions">
              <button type="button" className="button-secondary" onClick={handleResend} disabled={cooldown > 0 || loading}>
                {cooldown > 0 ? `Отправить ещё раз (${cooldown} с)` : 'Отправить код ещё раз'}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setStep('form');
                  setError('');
                  setMessage('');
                }}
              >
                {isRegister ? 'Изменить данные' : 'Назад'}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

export default AuthPage;
