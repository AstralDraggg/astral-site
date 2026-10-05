import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, Location } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ProductsPage from './pages/ProductsPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import AuthPage from './pages/AuthPage';
import ProfilePage from './pages/ProfilePage';
import FriendsPage from './pages/FriendsPage';
import AdminPage from './pages/AdminPage';
import { SitePayload, fallbackPayload } from './siteData';

function AppRoutes() {
  const location = useLocation();
  const [payload, setPayload] = useState<SitePayload>(fallbackPayload);
  const [displayLocation, setDisplayLocation] = useState<Location>(location);
  const [transitionStage, setTransitionStage] = useState<'idle' | 'exit' | 'enter'>('enter');

  useEffect(() => {
    let cancelled = false;

    async function loadSitePayload() {
      try {
        const response = await fetch('/api/site-data');
        if (!response.ok) {
          throw new Error(`Failed to fetch site data: ${response.status}`);
        }

        const nextPayload = (await response.json()) as SitePayload;
        if (!cancelled) {
          setPayload(nextPayload);
        }
      } catch {
        if (!cancelled) {
          setPayload(fallbackPayload);
        }
      }
    }

    void loadSitePayload();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (location.pathname === displayLocation.pathname) {
      // Навигация оборвалась посреди анимации (например, кликнули туда-обратно
      // быстрее 450 мс): без сброса <main> навсегда остаётся с opacity:0 —
      // страница выглядит пустой.
      if (transitionStage === 'exit') {
        setTransitionStage('enter');
      }

      return;
    }

    setTransitionStage('exit');

    const timeout = window.setTimeout(() => {
      setDisplayLocation(location);
      setTransitionStage('enter');
    }, 450);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [location, displayLocation.pathname, transitionStage]);

  useEffect(() => {
    if (transitionStage !== 'enter') {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTransitionStage('idle');
    }, 450);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [transitionStage]);

  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    let fallbackTimer = 0;

    const frame = window.requestAnimationFrame(() => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
      if (nodes.length === 0) {
        return;
      }

      const activeObserver: IntersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('reveal-visible');
              activeObserver.unobserve(entry.target);
            }
          }
        },
        {
          threshold: 0.1,
          rootMargin: '0px 0px -5% 0px',
        },
      );

      observer = activeObserver;

      for (const node of nodes) {
        activeObserver.observe(node);
      }

      fallbackTimer = window.setTimeout(() => {
        for (const node of nodes) {
          node.classList.add('reveal-visible');
        }
      }, 300);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(fallbackTimer);
      observer?.disconnect();
    };
  }, [displayLocation.pathname, transitionStage]);

  // Контент подгружается асинхронно (профиль, друзья, админка): новые блоки
  // с data-reveal появляются ПОСЛЕ того, как наблюдатель выше отработал,
  // иначе они остаются прозрачными и страница выглядит пустой.
  useEffect(() => {
    const reveal = (node: Element) => {
      if (node instanceof HTMLElement && node.hasAttribute('data-reveal')) {
        node.classList.add('reveal-visible');
      }

      node.querySelectorAll<HTMLElement>('[data-reveal]').forEach((child) => {
        child.classList.add('reveal-visible');
      });
    };

    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            reveal(node);
          }
        });
      }
    });

    const root = document.querySelector('.main-layout') ?? document.body;
    mutationObserver.observe(root, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
    };
  }, []);

  return (
    <Routes location={displayLocation}>
      <Route element={<Layout transitionStage={transitionStage} />}>
        <Route path="/" element={<HomePage payload={payload} />} />
        <Route path="/products" element={<ProductsPage payload={payload} />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
