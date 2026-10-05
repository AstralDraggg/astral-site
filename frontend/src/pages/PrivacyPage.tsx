import termsIcon from '../../assets/book-solid.svg';
import infoIcon from '../../assets/info-circle.svg';
import userIcon from '../../assets/user.svg';
import cloudIcon from '../../assets/cloud.svg';

function PrivacyPage() {
  return (
    <section className="legal-shell route-panel" data-reveal="legal">
      <div className="legal-hero" data-reveal="hero">
        <div className="legal-chip">
          <img src={termsIcon} alt="" aria-hidden="true" className="note-icon" />
          Privacy Policy
        </div>
        <h2 className="legal-title">Minimal data, clear reason, no extra nonsense.</h2>
        <p className="legal-subtitle">
          This setup keeps only the data needed for login, delivery, access control and support.
          Nothing here needs to turn into a bloated tracking system.
        </p>
      </div>

      <div className="legal-grid">
        <article className="legal-block" data-reveal="card">
          <div className="legal-block-head">
            <img src={userIcon} alt="" aria-hidden="true" className="legal-icon" />
            <h3>What is stored</h3>
          </div>
          <p>Email, username, account creation date, uid, auth data and basic service metadata.</p>
          <p>That is used for login, account display, access linking and support actions.</p>
        </article>

        <article className="legal-block" data-reveal="card">
          <div className="legal-block-head">
            <img src={cloudIcon} alt="" aria-hidden="true" className="legal-icon" />
            <h3>Why it is stored</h3>
          </div>
          <p>To keep your account working, verify access, handle purchases, and support future launcher features.</p>
          <p>Without that data the site cannot realistically manage accounts or delivery.</p>
        </article>

        <article className="legal-block" data-reveal="card">
          <div className="legal-block-head">
            <img src={infoIcon} alt="" aria-hidden="true" className="legal-icon" />
            <h3>Security note</h3>
          </div>
          <p>Real production deployment should use HTTPS, secure cookie or token handling, safer password hashing, and stricter backend validation.</p>
          <p>This current backend is fine for project structure, but for live use you should harden it properly.</p>
        </article>
      </div>

      <article className="legal-wide-card" data-reveal="card">
        <h3>Access and deletion</h3>
        <p>
          If you want data edited or removed later, that can be wired into the backend and account dashboard.
          Right now the structure is built so that account data stays small and predictable.
        </p>
        <p>
          The goal is simple: only keep what is useful for the product and avoid pointless collection.
        </p>
      </article>
    </section>
  );
}

export default PrivacyPage;
