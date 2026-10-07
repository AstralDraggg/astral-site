import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthUser, tokenKey } from '../auth';

type ChatMessage = {
  id: number;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
  role: string;
  pinned: boolean;
  pinnedBy: string | null;
};

type ChatMenu = { x: number; y: number; message: ChatMessage } | null;

const LAST_READ_KEY = 'astral_chat_last_read';
const POLL_MS = 6000;
const PING_MS = 30000;
const HISTORY_LIMIT = 200;

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem(tokenKey);
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

function hasToken(): boolean {
  return Boolean(window.localStorage.getItem(tokenKey));
}

function readLastRead(): number {
  const value = Number.parseInt(window.localStorage.getItem(LAST_READ_KEY) ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionRegExp(username: string): RegExp {
  return new RegExp(`@${escapeRegExp(username)}(?![\\w\\u0400-\\u04FF])`, 'i');
}

function roleLabel(role: string): string {
  return role === 'admin' ? 'админ' : 'юзер';
}

function renderText(text: string, me: string | null) {
  const tokens = text.split(/(@[\w\u0400-\u04FF.-]+)/gu);
  const myTag = me ? `@${me}`.toLowerCase() : null;

  return tokens.map((token, index) => {
    if (token.length > 1 && token.startsWith('@')) {
      const isMine = myTag !== null && token.toLowerCase() === myTag;
      return (
        <span key={index} className={isMine ? 'chat-tag chat-tag-me' : 'chat-tag'}>
          {token}
        </span>
      );
    }
    return <span key={index}>{token}</span>;
  });
}

type Props = {
  currentUser: AuthUser | null;
};

function ChatWidget({ currentUser }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [online, setOnline] = useState(0);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [menu, setMenu] = useState<ChatMenu>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [lastRead, setLastRead] = useState<number>(() => readLastRead());

  const maxIdRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 1800);
  }, []);

  const markRead = useCallback((upTo: number) => {
    if (upTo <= 0) {
      return;
    }
    setLastRead(upTo);
    window.localStorage.setItem(LAST_READ_KEY, String(upTo));
  }, []);

  const syncFeed = useCallback(async () => {
    try {
      const response = await fetch(`/api/chat?after=${maxIdRef.current}`, { headers: authHeaders() });
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        messages: ChatMessage[];
        pinned: ChatMessage[];
        online: number;
      };

      setOnline(data.online);
      setPinned(data.pinned);

      if (data.messages.length === 0) {
        return;
      }

      setMessages((prev) => {
        const known = new Set(prev.map((message) => message.id));
        const fresh = data.messages.filter((message) => !known.has(message.id));
        if (fresh.length === 0) {
          return prev;
        }
        return [...prev, ...fresh].slice(-HISTORY_LIMIT);
      });

      maxIdRef.current = Math.max(maxIdRef.current, ...data.messages.map((message) => message.id));
    } catch {
      // Обрыв связи — просто ждём следующего цикла опроса.
    }
  }, []);

  const ping = useCallback(async () => {
    if (!hasToken()) {
      return;
    }

    try {
      const response = await fetch('/api/chat/ping', { method: 'POST', headers: authHeaders() });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { online: number };
      if (typeof data.online === 'number') {
        setOnline(data.online);
      }
    } catch {
      // Онлайн обновится на следующем пинге.
    }
  }, []);

  useEffect(() => {
    void syncFeed();
    void ping();

    const poll = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      void syncFeed();
    }, POLL_MS);

    const beat = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      void ping();
    }, PING_MS);

    return () => {
      window.clearInterval(poll);
      window.clearInterval(beat);
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, [syncFeed, ping]);

  const me = currentUser?.username ?? null;

  const unread = useMemo(
    () => messages.filter((message) => message.id > lastRead).length,
    [messages, lastRead],
  );

  const hasMention = useMemo(() => {
    if (!me) {
      return false;
    }
    const pattern = mentionRegExp(me);
    return messages.some((message) => message.id > lastRead && pattern.test(message.text));
  }, [messages, lastRead, me]);

  const lastMentionId = useMemo(() => {
    if (!me) {
      return null;
    }
    const pattern = mentionRegExp(me);
    let found: number | null = null;
    for (const message of messages) {
      if (pattern.test(message.text)) {
        found = message.id;
      }
    }
    return found;
  }, [messages, me]);

  // Держим ленту внизу, пока пользователь сам не ушёл вверх.
  useEffect(() => {
    if (!open) {
      return;
    }
    const node = listRef.current;
    if (!node) {
      return;
    }
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 140;
    if (nearBottom) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, open]);

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;
      if (next) {
        void ping();
        markRead(maxIdRef.current);
        window.setTimeout(() => inputRef.current?.focus(), 80);
      }
      return next;
    });
  }

  /** Пролистывает ленту к сообщению и подсвечивает его. */
  function scrollToMessage(id: number, attempt = 0) {
    const node = listRef.current;
    const target = node?.querySelector<HTMLElement>(`[data-msg-id="${id}"]`);
    if (!node || !target) {
      // Панель могла только что открыться — пробуем ещё пару раз.
      if (attempt < 10) {
        window.setTimeout(() => scrollToMessage(id, attempt + 1), 50);
      }
      return;
    }

    node.scrollTop = target.offsetTop - node.clientHeight / 2 + target.offsetHeight / 2;
    setFlashId(id);
    window.setTimeout(() => setFlashId(null), 1800);
  }

  function jumpToMention() {
    if (lastMentionId === null) {
      return;
    }

    setOpen(true);
    scrollToMessage(lastMentionId);
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) {
      return;
    }

    if (!hasToken()) {
      setError('Войдите, чтобы писать в чат.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ text }),
      });
      const data = (await response.json()) as { error?: string; message?: ChatMessage };

      const created = !response.ok ? null : (data.message ?? null);
      if (!created) {
        setError(data.error || 'Не удалось отправить сообщение.');
        return;
      }

      const message = created;
      setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]));
      maxIdRef.current = Math.max(maxIdRef.current, message.id);
      markRead(message.id);
      setDraft('');

      const node = listRef.current;
      if (node) {
        node.scrollTop = node.scrollHeight;
      }
    } catch {
      setError('Нет связи с сайтом. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  function openMenu(event: ReactMouseEvent<HTMLDivElement>, message: ChatMessage) {
    event.preventDefault();
    const menuWidth = 216;
    const menuHeight = 208;
    const x = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8));
    const y = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8));
    setMenu({ x, y, message });
  }

  useEffect(() => {
    if (!menu) {
      return;
    }

    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null);
      }
    };

    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showNotice('Скопировано');
    } catch {
      // Clipboard недоступен (не-https / старый браузер) — молча игнорируем.
      showNotice('Не удалось скопировать');
    }
  }

  function insertMention(message: ChatMessage) {
    const token = `@${message.username} `;
    setDraft((prev) => (prev.includes(token) ? prev : `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token}`));
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 60);
  }

  async function togglePin(message: ChatMessage) {
    try {
      const response = await fetch('/api/chat/pin', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: String(message.id), pinned: String(!message.pinned) }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error || 'Не удалось изменить закрепление.');
        return;
      }

      const willPin = !message.pinned;
      setPinned((prev) => {
        if (!willPin) {
          return prev.filter((item) => item.id !== message.id);
        }
        return [{ ...message, pinned: true, pinnedBy: currentUser?.username ?? null }, ...prev].slice(0, 5);
      });
      setMessages((prev) =>
        prev.map((item) =>
          item.id === message.id
            ? {
                ...item,
                pinned: willPin,
                pinnedBy: willPin ? currentUser?.username ?? null : null,
              }
            : item,
        ),
      );
      showNotice(willPin ? 'Закреплено' : 'Откреплено');
    } catch {
      setError('Нет связи с сайтом.');
    }
  }

  async function removeMessage(message: ChatMessage) {
    try {
      const response = await fetch(`/api/chat/${message.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error || 'Не удалось удалить сообщение.');
        return;
      }

      setMessages((prev) => prev.filter((item) => item.id !== message.id));
      setPinned((prev) => prev.filter((item) => item.id !== message.id));
      showNotice('Удалено');
    } catch {
      setError('Нет связи с сайтом.');
    }
  }

  const isAdmin = currentUser?.role === 'admin';

  return (
    <>
      {menu && (
        <div className="chat-menu" style={{ left: menu.x, top: menu.y }}>
          <button type="button" className="chat-menu-item" onClick={() => void copyText(menu.message.text)}>
            Копировать текст
          </button>
          <button type="button" className="chat-menu-item" onClick={() => insertMention(menu.message)}>
            Упомянуть автора
          </button>
          {isAdmin && (
            <button type="button" className="chat-menu-item" onClick={() => void togglePin(menu.message)}>
              {menu.message.pinned ? 'Открепить' : 'Закрепить'}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className="chat-menu-item chat-menu-item-danger"
              onClick={() => void removeMessage(menu.message)}
            >
              Удалить сообщение
            </button>
          )}
          {!isAdmin && <div className="chat-menu-note">Закрепление и удаление — только для админа</div>}
        </div>
      )}

      {open && (
        <section className="chat-panel" aria-label="Общий чат">
          <header className="chat-head">
            <div className="chat-head-main">
              <h2 className="chat-head-title">Общий чат</h2>
              <span className="chat-online">
                <i className="chat-dot" aria-hidden="true" />
                {online} онлайн
              </span>
            </div>
            <div className="chat-head-actions">
              <button
                type="button"
                className="chat-icon-btn"
                title="Перейти к последнему упоминанию"
                onClick={jumpToMention}
                disabled={lastMentionId === null}
              >
                @
              </button>
              <button
                type="button"
                className="chat-icon-btn"
                title="Закрыть чат"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
          </header>

          {pinned.length > 0 && (
            <div className="chat-pinned">
              <div className="chat-pinned-label">Закреплено</div>
              {pinned.map((message) => (
                <div key={`pin-${message.id}`} className="chat-pinned-item">
                  <span className={`chat-role chat-role-${message.role}`}>{roleLabel(message.role)}</span>
                  <b className="chat-pinned-author">{message.username}</b>
                  <span className="chat-pinned-text">{message.text}</span>
                </div>
              ))}
            </div>
          )}

          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && <p className="chat-empty">Пока тихо. Напишите первым.</p>}
            {messages.map((message) => (
              <div
                key={message.id}
                data-msg-id={message.id}
                className={`chat-msg${flashId === message.id ? ' chat-msg-flash' : ''}`}
                onContextMenu={(event) => openMenu(event, message)}
              >
                <div className="chat-msg-head">
                  <span className={`chat-role chat-role-${message.role}`}>{roleLabel(message.role)}</span>
                  <span className="chat-msg-author">{message.username}</span>
                  <span className="chat-msg-time">{formatTime(message.createdAt)}</span>
                </div>
                <div className="chat-msg-text">{renderText(message.text, me)}</div>
              </div>
            ))}
          </div>

          <footer className="chat-foot">
            {error && <div className="chat-error">{error}</div>}
            {notice && !error && <div className="chat-notice">{notice}</div>}

            {hasToken() ? (
              <form
                className="chat-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <input
                  ref={inputRef}
                  className="chat-input"
                  value={draft}
                  maxLength={500}
                  placeholder="Написать в чат…  (@ — упомянуть)"
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button className="chat-send" type="submit" disabled={busy || !draft.trim()}>
                  {busy ? '…' : '→'}
                </button>
              </form>
            ) : (
              <div className="chat-guest">
                <span>Читать можно всем, писать — только авторизованным.</span>
                <Link className="chat-guest-link" to="/login" onClick={() => setOpen(false)}>
                  Войти
                </Link>
              </div>
            )}
          </footer>
        </section>
      )}

      <button
        type="button"
        className="chat-launcher"
        onClick={toggleOpen}
        aria-label={open ? 'Закрыть чат' : 'Открыть чат'}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path
            d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.4 3.5A.6.6 0 0 1 4.6 19l.1-3.1A2.5 2.5 0 0 1 4 13.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
        {!open && unread > 0 && (
          <span className={`chat-badge${hasMention ? ' chat-badge-mention' : ''}`}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </>
  );
}

export default ChatWidget;
