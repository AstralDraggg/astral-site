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
  }, [location, displayLocation.pathname]);

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

      for (const node of nodes) {
        node.classList.remove('reveal-visible');
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
