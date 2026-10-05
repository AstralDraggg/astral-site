import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import homeIcon from '../../assets/home.svg';
import productsIcon from '../../assets/marketpurchase.svg';
import termsIcon from '../../assets/book-solid.svg';
import infoIcon from '../../assets/info-circle.svg';
import loginIcon from '../../assets/log-in.svg';
import userIcon from '../../assets/user-application-identity-authentication-login.svg';
import profileIcon from '../../assets/user.svg';
import moonIcon from '../../assets/moon.svg';
import sunIcon from '../../assets/sun.svg';
import peopleIcon from '../../assets/people-community.svg';
import { AuthUser, tokenKey } from '../auth';

const navItems = [
  { label: 'Главная', icon: homeIcon, to: '/' },
  { label: 'Товары', icon: productsIcon, to: '/products' },
  { label: 'Правила', icon: termsIcon, to: '/terms' },
  { label: 'Конфиденциальность', icon: infoIcon, to: '/privacy' },
];

type LayoutProps = {
  transitionStage?: 'idle' | 'exit' | 'enter';
};

function Layout({ transitionStage = 'idle' }: LayoutProps) {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    const savedTheme = window.localStorage.getItem('astral_theme');
    return savedTheme === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    const token = window.localStorage.getItem(tokenKey);
    if (!token) {
      setCurrentUser(null);
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
          setCurrentUser(null);
          return;
        }

        const data = (await response.json()) as { user: AuthUser };
        setCurrentUser(data.user);
      } catch {
        setCurrentUser(null);
      }
    }

    void loadUser();
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('astral_theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  }

  return (
    <div className="page-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="ambient ambient-c" />

      <aside className="theme-sidebar">
        <button
          type="button"
          className={`theme-toggle${theme === 'light' ? ' theme-toggle-light' : ''}`}
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
        >
          <span className="theme-toggle-track" />
          <span className="theme-toggle-icon-wrap theme-toggle-icon-wrap-moon">
            <img src={moonIcon} alt="" aria-hidden="true" className="theme-toggle-icon" />
          </span>
          <span className="theme-toggle-icon-wrap theme-toggle-icon-wrap-sun">
            <img src={sunIcon} alt="" aria-hidden="true" className="theme-toggle-icon" />
          </span>
        </button>
      </aside>

      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <p className="eyebrow">чистый пвп без накруток</p>
            <h1 className="brand-name">Astral</h1>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
            >
              <img src={item.icon} alt="" aria-hidden="true" className="nav-icon" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="auth-links">
          {currentUser ? (
            <NavLink
              to="/profile"
              className={({ isActive }) => `account-pill profile-pill${isActive ? ' nav-link-active' : ''}`}
            >
              <img src={profileIcon} alt="" aria-hidden="true" className="nav-icon" />
              Профиль
            </NavLink>
          ) : (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) => `account-pill${isActive ? ' nav-link-active' : ''}`}
              >
                <img src={loginIcon} alt="" aria-hidden="true" className="nav-icon" />
                Вход
              </NavLink>
              <NavLink
                to="/register"
                className={({ isActive }) => `account-pill auth-secondary${isActive ? ' nav-link-active' : ''}`}
              >
                <img src={userIcon} alt="" aria-hidden="true" className="nav-icon" />
                Регистрация
              </NavLink>
            </>
          )}
        </div>
      </header>

      <main className={`main-layout route-stage-${transitionStage}`}>
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
