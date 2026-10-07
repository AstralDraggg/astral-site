import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import loginIcon from '../../assets/log-in.svg';
import userIcon from '../../assets/user-application-identity-authentication-login.svg';
import moreIcon from '../../assets/more-circle.svg';
import boxIcon from '../../assets/box.svg';
import marketIcon from '../../assets/marketpurchase.svg';
import infoIcon from '../../assets/info-circle.svg';
import avatarImage from '../../assets/avatar.jpeg';
import closeIcon from '../../assets/close-circle.svg';
import homeIcon from '../../assets/home.svg';
import moonIcon from '../../assets/moon.svg';
import sunIcon from '../../assets/sun.svg';
import playIcon from '../../assets/play.svg';
import updateIcon from '../../assets/update.svg';
import flashIcon from '../../assets/flash-circle.svg';
import { AuthUser, formatDate, tokenKey, writeCachedUser } from '../auth';

type PurchaseItem = {
  id: string;
  productId: string;
  name: string;
  price: string;
  purchasedAt: string;
};

function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseMessage, setLicenseMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'account' | 'settings' | 'launcher' | 'products'>('account');
  const [previousTab, setPreviousTab] = useState<'account' | 'settings' | 'launcher' | 'products'>('account');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }
    const savedTheme = window.localStorage.getItem('astral_theme');
    return savedTheme === 'light' ? 'light' : 'dark';
  });
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [friendsCount, setFriendsCount] = useState(0);
  const [launcherMessage, setLauncherMessage] = useState('');
  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    const token = window.localStorage.getItem(tokenKey);
    if (!token) {
      setLoading(false);
      return;
    }

    async function loadUser() {
      setLoadError('');
      setLoading(true);

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // Токен невалиден — только тогда выкидываем из аккаунта.
        if (response.status === 401 || response.status === 403) {
          window.localStorage.removeItem(tokenKey);
          writeCachedUser(null);
          setUser(null);
          return;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as { user: AuthUser };
        writeCachedUser(data.user);
        setUser(data.user);
        void loadPurchases(token);
        
        // Load friends count
        try {
          const friendsResponse = await fetch('/api/friends', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (friendsResponse.ok) {
            const friendsData = (await friendsResponse.json()) as { friends: { length: number } };
            setFriendsCount(friendsData.friends?.length ?? 0);
          } else {
            // Fallback to user.friends if API fails
            setFriendsCount(data.user.friends || 0);
          }
        } catch {
          // Fallback to user.friends if API fails
          setFriendsCount(data.user.friends || 0);
        }
      } catch {
        // Обрыв связи или падение сервера: сохраняем вход и даём кнопку «Повторить».
        setLoadError('Сервер не отвечает. Проверьте интернет и попробуйте ещё раз.');
      } finally {
        setLoading(false);
      }
    }

    void loadUser();
  }, [retryTick]);

  async function loadPurchases(token: string | null) {
    if (!token) {
      return;
    }

    setPurchasesLoading(true);

    try {
      const response = await fetch('/api/purchases', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = (await response.json()) as { purchases: PurchaseItem[] };
        setPurchases(data.purchases);
      }
    } catch {
      // Purchases stay empty if the request fails.
    } finally {
      setPurchasesLoading(false);
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
      // Ignore logout request failures.
    }

    window.localStorage.removeItem(tokenKey);
    writeCachedUser(null);
    navigate('/login');
  }

  function handleActivateKey() {
    void activateLicenseKey();
  }

  async function activateLicenseKey() {
    if (!licenseKey.trim()) {
      setLicenseMessage('Enter a key first.');
      return;
    }

    const token = window.localStorage.getItem(tokenKey);
    if (!token) {
      setLicenseMessage('Login to activate a key.');
      return;
    }

    try {
      const response = await fetch('/api/license/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: licenseKey.trim() }),
      });

      const data = (await response.json()) as { message?: string; error?: string; user?: AuthUser };

      if (response.ok && data.user) {
        setUser(data.user);
        setLicenseKey('');
        setLicenseMessage(data.message ?? 'Key accepted.');
      } else {
        setLicenseMessage(data.error ?? 'Activation failed.');
      }
    } catch {
      setLicenseMessage('Server error');
    }

    window.setTimeout(() => setLicenseMessage(''), 5000);
  }

  function toggleTheme() {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.dataset.theme = newTheme;
    window.localStorage.setItem('astral_theme', newTheme);
  }

  async function handleEmailChange() {
    if (!newEmail.trim()) {
      setSettingsMessage('Enter a new email address.');
      return;
    }

    const token = window.localStorage.getItem(tokenKey);
    if (!token) return;

    try {
      const response = await fetch('/api/auth/change-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: newEmail }),
      });

      const data = await response.json();
      if (response.ok) {
        setSettingsMessage('Email updated successfully!');
        setNewEmail('');
        // Reload user data
        const userResponse = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (userResponse.ok) {
          const userData = await userResponse.json();
          setUser(userData.user);
        }
      } else {
        setSettingsMessage(data.error || 'Failed to update email');
      }
    } catch {
      setSettingsMessage('Server error');
    }

    setTimeout(() => setSettingsMessage(''), 3000);
  }

  async function handlePasswordChange() {
    if (!newPassword.trim()) {
      setSettingsMessage('Enter a new password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setSettingsMessage('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setSettingsMessage('Password must be at least 6 characters.');
      return;
    }

    const token = window.localStorage.getItem(tokenKey);
    if (!token) return;

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: newPassword }),
      });

      const data = await response.json();
      if (response.ok) {
        setSettingsMessage('Password updated successfully!');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setSettingsMessage(data.error || 'Failed to update password');
      }
    } catch {
      setSettingsMessage('Server error');
    }

    setTimeout(() => setSettingsMessage(''), 3000);
  }

  async function handleDownloadLauncher() {
    const token = window.localStorage.getItem(tokenKey);
    if (!token) {
      setLauncherMessage('Войдите, чтобы скачать лоадер.');
      return;
    }

    setLauncherMessage('Готовим скачивание...');

    try {
      const response = await fetch('/api/launcher/download', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setLauncherMessage(data.error ?? 'Файл лоадера ещё не загружен.');
        return;
      }

      const contentType = response.headers.get('content-type') ?? '';

      // Сервер отдал прямую ссылку (например GitHub Release) — уходим обычной
      // навигацией, чтобы браузер скачал файл без CORS-ограничений.
      if (contentType.includes('application/json')) {
        const data = (await response.json()) as { url?: string; error?: string };

        if (data.url) {
          window.location.href = data.url;
          setLauncherMessage('Скачивание началось.');
        } else {
          setLauncherMessage(data.error ?? 'Файл лоадера ещё не загружен.');
        }

        return;
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'Astral.exe';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      setLauncherMessage('Скачивание началось.');
    } catch {
      setLauncherMessage('Ошибка сервера.');
    }

    window.setTimeout(() => setLauncherMessage(''), 5000);
  }

  function handleTabChange(newTab: 'account' | 'settings' | 'launcher' | 'products') {
    if (newTab === activeTab || isTransitioning) return;
    
    setIsTransitioning(true);
    setPreviousTab(activeTab);
    
    // Start exit animation
    setTimeout(() => {
      setActiveTab(newTab);
      // End transition after enter animation completes
      setTimeout(() => {
        setIsTransitioning(false);
      }, 400);
    }, 200);
  }

  if (!loading && !user && !loadError) {
    return <Navigate to="/login" replace />;
  }

  if (loadError && !user) {
    return (
      <section className="content-panel route-panel" data-reveal="profile">
        <p className="form-error">{loadError}</p>
        <button
          type="button"
          className="button-primary"
          onClick={() => setRetryTick((tick) => tick + 1)}
        >
          Повторить
        </button>
      </section>
    );
  }

  if (!user) {
    return <section className="content-panel route-panel">Loading profile...</section>;
  }

  const isBlocked = Boolean(user.blocked);

  return (
    <section className="profile-shell route-panel profile-route" data-reveal="profile">
      {isBlocked && (
        <div className="profile-blocked-banner" role="alert">
          Аккаунт заблокирован администратором. Редактирование профиля недоступно, подписка
          отключена.
        </div>
      )}
      <div className="profile-grid">
        <div className="profile-left">
          <article className="profile-user-card profile-panel" data-reveal="card">
            <div className="profile-user-main">
              <img src={avatarImage} alt="" aria-hidden="true" className="profile-avatar-image" />
              <div>
                <h2 className="profile-name">
                  {user.username} <span className="profile-uid">[{user.uid}]</span>
                </h2>
                <p className="profile-subscription">
                  <span className="status-dot" />
                  Subscription Till: {formatDate(user.subscriptionTill)}
                </p>
              </div>
            </div>

            <button type="button" className="profile-logout" onClick={handleLogout} aria-label="Logout">
              <img src={loginIcon} alt="" aria-hidden="true" className="profile-logout-icon" />
            </button>
          </article>

          <article className="profile-license-card profile-panel" data-reveal="card">
            <p className="profile-license-title">Activate License-Key</p>
            <div className="profile-license-row">
              <label className="profile-license-input">
                <img src={infoIcon} alt="" aria-hidden="true" className="mini-icon" />
                <input
                  type="text"
                  placeholder="Enter key..."
                  value={licenseKey}
                  disabled={isBlocked}
                  onChange={(event) => setLicenseKey(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="profile-activate"
                disabled={isBlocked}
                onClick={handleActivateKey}
              >
                <img src={closeIcon} alt="" aria-hidden="true" className="mini-icon" />
                Activate
              </button>
            </div>
            {licenseMessage && <p className="profile-license-message">{licenseMessage}</p>}
          </article>
        </div>

        <div className="profile-right">
          <div className="profile-tabs">
            <button 
              type="button" 
              className={`profile-tab${activeTab === 'account' ? ' profile-tab-active' : ''}`}
              onClick={() => handleTabChange('account')}
              disabled={isTransitioning}
            >
              <img src={userIcon} alt="" aria-hidden="true" className="mini-icon" />
              Account
            </button>
            <button 
              type="button" 
              className={`profile-tab${activeTab === 'settings' ? ' profile-tab-active' : ''}`}
              onClick={() => handleTabChange('settings')}
              disabled={isTransitioning}
            >
              <img src={moreIcon} alt="" aria-hidden="true" className="mini-icon" />
              Settings
            </button>
            <button 
              type="button" 
              className={`profile-tab${activeTab === 'launcher' ? ' profile-tab-active' : ''}`}
              onClick={() => handleTabChange('launcher')}
              disabled={isTransitioning}
            >
              <img src={homeIcon} alt="" aria-hidden="true" className="mini-icon" />
              Launcher
            </button>
            <button 
              type="button" 
              className={`profile-tab${activeTab === 'products' ? ' profile-tab-active' : ''}`}
              onClick={() => handleTabChange('products')}
              disabled={isTransitioning}
            >
              <img src={marketIcon} alt="" aria-hidden="true" className="mini-icon" />
              Products
            </button>
          </div>

          {activeTab === 'account' && (
            <div className="profile-tab-content profile-account-content">
              <div className="profile-account-cards">
                <div className="profile-account-card">
                  <div className="profile-account-card-icon">
                    <img src={infoIcon} alt="" aria-hidden="true" className="mini-icon" />
                  </div>
                  <div className="profile-account-card-info">
                    <div className="profile-account-card-label">Email</div>
                    <div className="profile-account-card-value">{user.email}</div>
                  </div>
                </div>

                <div className="profile-account-card">
                  <div className="profile-account-card-icon">
                    <img src={userIcon} alt="" aria-hidden="true" className="mini-icon" />
                  </div>
                  <div className="profile-account-card-info">
                    <div className="profile-account-card-label">Registration</div>
                    <div className="profile-account-card-value">{formatDate(user.createdAt)}</div>
                  </div>
                </div>

                <div className="profile-account-card">
                  <div className="profile-account-card-icon">
                    <img src={boxIcon} alt="" aria-hidden="true" className="mini-icon" />
                  </div>
                  <div className="profile-account-card-info">
                    <div className="profile-account-card-label">Hwid</div>
                    <div className="profile-account-card-value">{user.hwidStatus}</div>
                  </div>
                </div>
              </div>

              <div className="profile-account-bottom">
                <button
                  type="button"
                  className="profile-account-friends-card"
                  onClick={() => navigate('/friends')}
                >
                  <div className="profile-account-friends-icon">
                    <img src={userIcon} alt="" aria-hidden="true" className="mini-icon" />
                  </div>
                  <div className="profile-account-friends-info">
                    <div className="profile-account-friends-label">Friends</div>
                    <div className="profile-account-friends-count">{friendsCount}</div>
                  </div>
                  <div className="profile-account-friends-arrow">
                    <span className="profile-chevron">›</span>
                  </div>
                </button>

                <div className="profile-account-soon-card">
                  <div className="profile-account-soon-content">
                    <span>Soon...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="profile-tab-content profile-settings-content">
              {settingsMessage && <div className="profile-settings-message">{settingsMessage}</div>}
              
              <div className="profile-settings-section">
                <h3 className="profile-settings-title">Account Settings</h3>
                <div className="profile-settings-item">
                  <div className="profile-settings-info">
                    <div className="profile-settings-label">Username</div>
                    <div className="profile-settings-description">{user.username}</div>
                  </div>
                  <button type="button" className="profile-settings-button" disabled>
                    <img src={infoIcon} alt="" aria-hidden="true" className="mini-icon" />
                    Cannot Change
                  </button>
                </div>
                
                <div className="profile-settings-item">
                  <div className="profile-settings-info">
                    <div className="profile-settings-label">Current Email</div>
                    <div className="profile-settings-description">{user.email}</div>
                  </div>
                </div>
                
                <div className="profile-settings-item">
                  <div className="profile-settings-info">
                    <div className="profile-settings-label">Change Email</div>
                    <input
                      type="email"
                      className="profile-settings-input"
                      placeholder="Enter new email..."
                      value={newEmail}
                      disabled={isBlocked}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="profile-settings-button"
                    disabled={isBlocked}
                    onClick={handleEmailChange}
                  >
                    <img src={updateIcon} alt="" aria-hidden="true" className="mini-icon" />
                    Update Email
                  </button>
                </div>
                
                <div className="profile-settings-item">
                  <div className="profile-settings-info">
                    <div className="profile-settings-label">New Password</div>
                    <input
                      type="password"
                      className="profile-settings-input"
                      placeholder="Enter new password..."
                      value={newPassword}
                      disabled={isBlocked}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="profile-settings-item">
                  <div className="profile-settings-info">
                    <div className="profile-settings-label">Confirm Password</div>
                    <input
                      type="password"
                      className="profile-settings-input"
                      placeholder="Confirm new password..."
                      value={confirmPassword}
                      disabled={isBlocked}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="profile-settings-button"
                    disabled={isBlocked}
                    onClick={handlePasswordChange}
                  >
                    <img src={updateIcon} alt="" aria-hidden="true" className="mini-icon" />
                    Update Password
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'launcher' && (
            <div className="profile-tab-content profile-launcher-content">
              <div className="profile-launcher-download">
                <div className="profile-launcher-download-info">
                  <img src={homeIcon} alt="" aria-hidden="true" className="profile-launcher-download-icon" />
                  <h3 className="profile-launcher-download-title">Astral Launcher</h3>
                  <p className="profile-launcher-download-description">
                    Download the official Astral launcher to get started with the best PvP experience.
                  </p>
                  <div className="profile-launcher-download-details">
                    <div className="profile-launcher-download-detail">
                      <span className="profile-launcher-download-label">Version:</span>
                      <span className="profile-launcher-download-value">v2.1.4</span>
                    </div>
                    <div className="profile-launcher-download-detail">
                      <span className="profile-launcher-download-label">Size:</span>
                      <span className="profile-launcher-download-value">~45 MB</span>
                    </div>
                    <div className="profile-launcher-download-detail">
                      <span className="profile-launcher-download-label">Platform:</span>
                      <span className="profile-launcher-download-value">Windows 10/11</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="profile-launcher-download-button"
                    onClick={handleDownloadLauncher}
                  >
                    <img src={updateIcon} alt="" aria-hidden="true" className="profile-launcher-button-icon" />
                    Download Launcher
                  </button>
                  {launcherMessage && <p className="profile-license-message">{launcherMessage}</p>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'products' && (
            <div className="profile-products-content">
              <div className="profile-products-redirect">
                <div className="profile-products-info">
                  <img src={marketIcon} alt="" aria-hidden="true" className="profile-products-icon" />
                  <h3 className="profile-products-title">Products & Store</h3>
                  <p className="profile-products-description">
                    Browse our full catalog of products, manage your purchases, and discover new features.
                  </p>
                  <button
                    type="button"
                    className="profile-products-button"
                    onClick={() => navigate('/products')}
                  >
                    <img src={marketIcon} alt="" aria-hidden="true" className="mini-icon" />
                    Go to Products
                    <span className="profile-chevron">›</span>
                  </button>
                </div>
              </div>

              <div className="profile-settings-section">
                <h3 className="profile-settings-title">Your purchases</h3>

                {purchasesLoading ? (
                  <p className="friends-loading">Loading purchases...</p>
                ) : purchases.length === 0 ? (
                  <p className="friends-empty">No purchases yet.</p>
                ) : (
                  purchases.map((purchase) => (
                    <div key={purchase.id} className="profile-settings-item">
                      <div className="profile-settings-info">
                        <div className="profile-settings-label">{purchase.name}</div>
                        <div className="profile-settings-description">
                          {formatDate(purchase.purchasedAt)} · {purchase.price}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default ProfilePage;
