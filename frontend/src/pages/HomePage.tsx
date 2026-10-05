import { Link } from 'react-router-dom';
import productsIcon from '../../assets/marketpurchase.svg';
import plusIcon from '../../assets/plus.svg';
import swordIcon from '../../assets/sword-fill.svg';
import dragIcon from '../../assets/cursor-drag-drop.svg';
import boxIcon from '../../assets/box.svg';
import cloudIcon from '../../assets/cloud.svg';
import youtubeIcon from '../../assets/youtube.svg';
import userMetaIcon from '../../assets/user.svg';
import likeIcon from '../../assets/like.svg';
import eyeIcon from '../../assets/eye.svg';
import chatIcon from '../../assets/chatbubbles.svg';
import categoryIcon from '../../assets/category-alt.svg';
import discordIcon from '../../assets/discord-fill.svg';
import telegramIcon from '../../assets/telegram.svg';
import vkIcon from '../../assets/vk.svg';
import homeIcon from '../../assets/home.svg';
import termsIcon from '../../assets/book-solid.svg';
import infoIcon from '../../assets/info-circle.svg';
import authDataIcon from '../../assets/user-application-identity-authentication-login.svg';
import copyrightIcon from '../../assets/copyright.svg';
import { SitePayload } from '../siteData';
import { siteConfig } from '../siteConfig';

const iconMap: Record<string, string> = {
  combat: swordIcon,
  movement: dragIcon,
  visuals: boxIcon,
  configs: cloudIcon,
};

const videoCards = [
  {
    id: 'video-1',
    views: '8042',
    likes: '245',
    duration: '37:36',
    author: 'astralclips',
    title: 'ЛУЧШИЕ НАСТРОЙКИ ДЛЯ ЛЕГИТ-ФАЙТОВ',
    previewClass: 'video-preview-a',
    url: 'https://www.youtube.com/results?search_query=minecraft+pvp+client+best+settings',
  },
  {
    id: 'video-2',
    views: '5177',
    likes: '101',
    duration: '12:44',
    author: 'astralzone',
    title: 'КАК СОБРАТЬ ХОРОШИЙ КОНФИГ ЗА ОДНУ СЕССИЮ',
    previewClass: 'video-preview-b',
    url: 'https://www.youtube.com/results?search_query=minecraft+pvp+client+config+setup',
  },
  {
    id: 'video-3',
    views: '5791',
    likes: '63',
    duration: '2:01',
    author: 'ph4smob',
    title: 'ПОЧЕМУ ЧИСТЫЕ КЛИЕНТЫ ЛУЧШЕ СЛУЧАЙНЫХ ПАСТОВ',
    previewClass: 'video-preview-c',
    url: 'https://www.youtube.com/results?search_query=minecraft+clean+pvp+client',
  },
];

type HomePageProps = {
  payload: SitePayload;
};

function HomePage({ payload }: HomePageProps) {
  return (
    <div className="home-layout">
      <section className="hero-panel route-panel" data-reveal="hero">
        <div className="hero-copy">
          <p className="section-kicker">Приватная сборка</p>
          <h2 className="hero-title">Чистый легит-вайб, злой движок, ноль клоунских визуалов.</h2>
          <p className="hero-description">
            Astral — быстрый и аккуратный клиент для тех, кто хочет полезные фичи, а не бардак на
            экране.
          </p>

          <div className="hero-actions">
            <Link className="button-primary" to="/products">
              <img src={productsIcon} alt="" aria-hidden="true" className="button-icon" />
              Смотреть товары
            </Link>
            <Link className="button-secondary" to="/register">
              <img src={plusIcon} alt="" aria-hidden="true" className="button-icon" />
              Создать аккаунт
            </Link>
          </div>

          <div className="stat-grid">
            {payload.stats.map((stat) => (
              <article key={stat.label} className="stat-card">
                <span className="stat-value">{stat.value}</span>
                <span className="stat-label">{stat.label}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="content-panel inner-panel" data-reveal="features">
        <div className="section-heading">
          <p className="section-kicker">Возможности</p>
          <h2>То, что реально важно в игре.</h2>
        </div>

        <div className="feature-grid">
          {payload.features.map((feature) => (
            <article key={feature.title} className="feature-card" data-reveal="card">
              <img src={iconMap[feature.icon]} alt="" aria-hidden="true" className="feature-icon" />
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="videos-shell content-panel inner-panel" data-reveal="videos">
        <div className="videos-head" data-reveal="hero">
          <div className="videos-chip">
            <img src={youtubeIcon} alt="" aria-hidden="true" className="mini-icon" />
            Видео
          </div>
          <h2 className="videos-title">Смотри лучшие видео!</h2>
          <p className="videos-subtitle">
            На превью видно, как выглядит клиент и как ощущаются разные сборки в деле.
          </p>
        </div>

        <div className="videos-grid">
          {videoCards.map((video, index) => (
            <a
              key={video.id}
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="video-card video-card-link"
              data-reveal="card"
              style={{ transitionDelay: `${index * 80}ms` }}
            >
              <div className={`video-preview ${video.previewClass}`}>
                <div className="video-preview-overlay" />
                <div className="video-meta-top">
                  <span className="video-meta-inline">
                    <img src={eyeIcon} alt="" aria-hidden="true" className="mini-icon" />
                    {video.views}
                  </span>
                  <span className="video-meta-inline">
                    <img src={likeIcon} alt="" aria-hidden="true" className="mini-icon" />
                    {video.likes}
                  </span>
                </div>
                <span className="video-duration">{video.duration}</span>
              </div>

              <div className="video-body">
                <div className="video-author">
                  <img src={userMetaIcon} alt="" aria-hidden="true" className="mini-icon" />
                  {video.author}
                </div>
                <h3>{video.title}</h3>
              </div>
            </a>
          ))}
        </div>
      </section>

      <footer className="home-footer content-panel inner-panel" data-reveal="footer">
        <div className="footer-topline">
          <p className="footer-copy">Оставайся на связи и переходи по сайту из одного места.</p>
        </div>

        <div className="footer-columns footer-columns-three">
          <div className="footer-column">
            <div className="footer-head">
              <div className="footer-chip">
                <img src={chatIcon} alt="" aria-hidden="true" className="mini-icon" />
                Связь
              </div>
            </div>

            <div className="footer-links">
              <a href={siteConfig.discordUrl} target="_blank" rel="noreferrer" className="footer-link">
                <img src={discordIcon} alt="" aria-hidden="true" className="mini-icon" />
                Discord
              </a>
              <a href={siteConfig.telegramUrl} target="_blank" rel="noreferrer" className="footer-link">
                <img src={telegramIcon} alt="" aria-hidden="true" className="mini-icon" />
                Telegram
              </a>
              <a href={siteConfig.vkUrl} target="_blank" rel="noreferrer" className="footer-link">
                <img src={vkIcon} alt="" aria-hidden="true" className="mini-icon" />
                VK
              </a>
            </div>
          </div>

          <div className="footer-column">
            <div className="footer-head">
              <div className="footer-chip">
                <img src={categoryIcon} alt="" aria-hidden="true" className="mini-icon" />
                Страницы
              </div>
            </div>

            <div className="footer-links">
              <Link to="/" className="footer-link">
                <img src={homeIcon} alt="" aria-hidden="true" className="mini-icon" />
                Главная
              </Link>
              <Link to="/products" className="footer-link">
                <img src={productsIcon} alt="" aria-hidden="true" className="mini-icon" />
                Товары
              </Link>
              <Link to="/terms" className="footer-link">
                <img src={termsIcon} alt="" aria-hidden="true" className="mini-icon" />
                Правила
              </Link>
              <Link to="/privacy" className="footer-link">
                <img src={infoIcon} alt="" aria-hidden="true" className="mini-icon" />
                Политика
              </Link>
            </div>
          </div>

          <div className="footer-column">
            <div className="footer-head">
              <div className="footer-chip">
                <img src={authDataIcon} alt="" aria-hidden="true" className="mini-icon" />
                Аккаунт
              </div>
            </div>

            <div className="footer-links">
              <Link to="/login" className="footer-link">
                <img src={authDataIcon} alt="" aria-hidden="true" className="mini-icon" />
                Вход
              </Link>
              <Link to="/register" className="footer-link">
                <img src={authDataIcon} alt="" aria-hidden="true" className="mini-icon" />
                Регистрация
              </Link>
              <Link to="/profile" className="footer-link">
                <img src={userMetaIcon} alt="" aria-hidden="true" className="mini-icon" />
                Профиль
              </Link>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-branding">
            <h3>Astral</h3>
            <p>
              Только лучшее — с нами!
              <br />
              Заходи быстрее!
            </p>
          </div>

          <div className="footer-legal">
            <span className="footer-legal-line">
              <img src={copyrightIcon} alt="" aria-hidden="true" className="mini-icon" />
              Авторские права, 2026
            </span>
            <span>Все права защищены</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;
