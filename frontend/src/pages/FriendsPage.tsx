import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import userIcon from '../../assets/user-application-identity-authentication-login.svg';
import plusIcon from '../../assets/plus.svg';
import closeIcon from '../../assets/close-circle.svg';
import peopleIcon from '../../assets/people-community.svg';
import profileIcon from '../../assets/user.svg';
import { AuthUser, tokenKey, writeCachedUser } from '../auth';

type Friend = {
  id: string;
  username: string;
  status: 'online' | 'offline';
  lastSeen?: string;
};

type FriendRequest = {
  id: string;
  username: string;
  type: 'incoming' | 'outgoing';
};

function FriendsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>({
    incoming: [],
    outgoing: [],
  });
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'online' | 'pending'>('all');

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
          headers: { Authorization: `Bearer ${token}` },
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
        setUser(data.user);
      } catch {
        // Обрыв связи: вход сохраняем, страница предложит повторить запрос.
        setLoadError('Сервер не отвечает. Проверьте интернет и попробуйте ещё раз.');
      } finally {
        setLoading(false);
      }
    }

    void loadUser();
  }, [retryTick]);

  useEffect(() => {
    if (user) {
      loadFriendsData();
    }
  }, [user]);

  async function loadFriendsData() {
    const token = window.localStorage.getItem(tokenKey);
    if (!token) return;

    setFriendsLoading(true);

    try {
      const [friendsRes, requestsRes] = await Promise.all([
        fetch('/api/friends', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/friends/requests', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (friendsRes.ok) {
        const data = (await friendsRes.json()) as { friends: Friend[] };
        setFriends(data.friends);
      }

      if (requestsRes.ok) {
        const data = (await requestsRes.json()) as { incoming: FriendRequest[]; outgoing: FriendRequest[] };
        setRequests(data);
      }
    } catch {
      setMessage('Failed to load friends data');
    } finally {
      setFriendsLoading(false);
    }
  }

  async function handleAddFriend() {
    if (!addUsername.trim()) {
      setMessage('Enter a username');
      return;
    }

    const token = window.localStorage.getItem(tokenKey);
    if (!token) return;

    try {
      const response = await fetch('/api/friends/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: addUsername }),
      });

      const data = (await response.json()) as { message?: string; error?: string };

      if (response.ok) {
        setMessage(data.message || 'Friend request sent!');
        setAddUsername('');
        await loadFriendsData();
      } else {
        setMessage(data.error || 'Failed to send request');
      }
    } catch {
      setMessage('Server error');
    }

    setTimeout(() => setMessage(''), 3000);
  }

  async function handleAcceptRequest(requesterId: string) {
    const token = window.localStorage.getItem(tokenKey);
    if (!token) return;

    try {
      const response = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requesterId }),
      });

      if (response.ok) {
        setMessage('Friend request accepted');
        await loadFriendsData();
      }
    } catch {
      setMessage('Failed to accept request');
    }

    setTimeout(() => setMessage(''), 3000);
  }

  async function handleRejectRequest(requesterId: string) {
    const token = window.localStorage.getItem(tokenKey);
    if (!token) return;

    try {
      const response = await fetch('/api/friends/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requesterId }),
      });

      if (response.ok) {
        setMessage('Friend request rejected');
        await loadFriendsData();
      }
    } catch {
      setMessage('Failed to reject request');
    }

    setTimeout(() => setMessage(''), 3000);
  }

  async function handleRemoveFriend(friendId: string) {
    const token = window.localStorage.getItem(tokenKey);
    if (!token) return;

    try {
      const response = await fetch(`/api/friends/${friendId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setMessage('Friend removed');
        await loadFriendsData();
      }
    } catch {
      setMessage('Failed to remove friend');
    }

    setTimeout(() => setMessage(''), 3000);
  }

  if (!loading && !user && !loadError) {
    return <Navigate to="/login" replace />;
  }

  if (loadError && !user) {
    return (
      <section className="content-panel route-panel">
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
    return <section className="content-panel route-panel">Loading...</section>;
  }

  const filteredFriends = friends.filter((friend) => {
    if (activeTab === 'online') return friend.status === 'online';
    if (activeTab === 'pending') return false;
    return true;
  });

  const showPending = activeTab === 'pending';

  return (
    <section className="friends-page route-panel" data-reveal="friends">
      <div className="friends-header" data-reveal="hero">
        <div className="friends-breadcrumb">
          <Link to="/profile" className="friends-back-link">
            <img src={profileIcon} alt="" aria-hidden="true" className="mini-icon" />
            Profile
          </Link>
          <span className="friends-breadcrumb-separator">›</span>
          <span className="friends-breadcrumb-current">Friends</span>
        </div>

        <div className="friends-hero-content">
          <div className="friends-chip">
            <img src={peopleIcon} alt="" aria-hidden="true" className="note-icon" />
            Friends
          </div>
          <h2 className="friends-title">Manage your friends</h2>
          <p className="friends-subtitle">
            Connect with other Astral users, send friend requests, and build your gaming network.
          </p>
        </div>

        <div className="friends-stats">
          <div className="friends-stat">
            <span className="friends-stat-value">{friends.length}</span>
            <span className="friends-stat-label">Total Friends</span>
          </div>
          <div className="friends-stat">
            <span className="friends-stat-value">{friends.filter(f => f.status === 'online').length}</span>
            <span className="friends-stat-label">Online Now</span>
          </div>
          <div className="friends-stat">
            <span className="friends-stat-value">{requests.incoming.length}</span>
            <span className="friends-stat-label">Pending Requests</span>
          </div>
        </div>
      </div>

      <div className="friends-content content-panel" data-reveal="content">
        <div className="friends-tabs">
          <button
            type="button"
            className={`friends-tab${activeTab === 'all' ? ' friends-tab-active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Friends
          </button>
          <button
            type="button"
            className={`friends-tab${activeTab === 'online' ? ' friends-tab-active' : ''}`}
            onClick={() => setActiveTab('online')}
          >
            Online
          </button>
          <button
            type="button"
            className={`friends-tab${activeTab === 'pending' ? ' friends-tab-active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending ({requests.incoming.length})
          </button>
        </div>

        <div className="friends-add-section">
          <label className="friends-add-input">
            <img src={userIcon} alt="" aria-hidden="true" className="mini-icon" />
            <input
              type="text"
              placeholder="Add friend by username..."
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
            />
          </label>
          <button type="button" className="friends-add-button" onClick={handleAddFriend}>
            <img src={plusIcon} alt="" aria-hidden="true" className="mini-icon" />
            Add Friend
          </button>
        </div>

        {message && <p className="friends-message">{message}</p>}

        <div className="friends-list">
          {friendsLoading ? (
            <p className="friends-loading">Loading friends...</p>
          ) : showPending ? (
            <>
              {requests.incoming.length === 0 && requests.outgoing.length === 0 ? (
                <p className="friends-empty">No pending requests</p>
              ) : (
                <>
                  {requests.incoming.length > 0 && (
                    <>
                      <h3 className="friends-section-title">Incoming Requests</h3>
                      {requests.incoming.map((req) => (
                        <div key={req.id} className="friend-item">
                          <div className="friend-info">
                            <div className="friend-avatar">
                              <img src={userIcon} alt="" aria-hidden="true" className="friend-avatar-icon" />
                            </div>
                            <div>
                              <p className="friend-username">{req.username}</p>
                              <p className="friend-status-text">Wants to be friends</p>
                            </div>
                          </div>
                          <div className="friend-actions">
                            <button
                              type="button"
                              className="friend-accept"
                              onClick={() => handleAcceptRequest(req.id)}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              className="friend-reject"
                              onClick={() => handleRejectRequest(req.id)}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {requests.outgoing.length > 0 && (
                    <>
                      <h3 className="friends-section-title">Outgoing Requests</h3>
                      {requests.outgoing.map((req) => (
                        <div key={req.id} className="friend-item">
                          <div className="friend-info">
                            <div className="friend-avatar">
                              <img src={userIcon} alt="" aria-hidden="true" className="friend-avatar-icon" />
                            </div>
                            <div>
                              <p className="friend-username">{req.username}</p>
                              <p className="friend-status-text">Request sent</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          ) : filteredFriends.length === 0 ? (
            <p className="friends-empty">No friends found</p>
          ) : (
            filteredFriends.map((friend) => (
              <div key={friend.id} className="friend-item">
                <div className="friend-info">
                  <div className="friend-avatar">
                    <img src={userIcon} alt="" aria-hidden="true" className="friend-avatar-icon" />
                    <span className={`friend-status friend-status-${friend.status}`} />
                  </div>
                  <div>
                    <p className="friend-username">{friend.username}</p>
                    <p className="friend-status-text">
                      {friend.status === 'online' ? 'Online' : friend.lastSeen || 'Offline'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="friend-remove"
                  onClick={() => handleRemoveFriend(friend.id)}
                  aria-label="Remove friend"
                >
                  <img src={closeIcon} alt="" aria-hidden="true" className="mini-icon" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export default FriendsPage;