import termsIcon from '../../assets/book-solid.svg';
import marketIcon from '../../assets/marketpurchase.svg';
import userIcon from '../../assets/user.svg';
import closeIcon from '../../assets/close-circle.svg';

function TermsPage() {
  return (
    <section className="legal-shell route-panel" data-reveal="legal">
      <div className="legal-hero" data-reveal="hero">
        <div className="legal-chip">
          <img src={termsIcon} alt="" aria-hidden="true" className="note-icon" />
          Terms of Service
        </div>
        <h2 className="legal-title">Rules for access, use and account safety.</h2>
        <p className="legal-subtitle">
          Simple version: buy normally, use your own account, do not leak files, do not mess
          with the service, and do not try to abuse payments.
        </p>
      </div>

      <div className="legal-grid">
        <article className="legal-block" data-reveal="card">
          <div className="legal-block-head">
            <img src={marketIcon} alt="" aria-hidden="true" className="legal-icon" />
            <h3>Purchases</h3>
          </div>
          <p>Buying Astral gives you a personal license to use the product on your own account.</p>
          <p>Access is not transferable unless you later build a transfer system on the backend yourself.</p>
        </article>

        <article className="legal-block" data-reveal="card">
          <div className="legal-block-head">
            <img src={userIcon} alt="" aria-hidden="true" className="legal-icon" />
            <h3>Accounts</h3>
          </div>
          <p>You are responsible for your own account, login data and anything done through your account.</p>
          <p>If someone else uses your credentials, that still counts as your account activity.</p>
        </article>

        <article className="legal-block" data-reveal="card">
          <div className="legal-block-head">
            <img src={closeIcon} alt="" aria-hidden="true" className="legal-icon" />
            <h3>What is not allowed</h3>
          </div>
          <p>No leaking builds, no reselling, no reversing protected files, no trying to bypass license checks, no payment abuse.</p>
          <p>If you do any of that, access can be removed without keeping the account active.</p>
        </article>
      </div>

      <article className="legal-wide-card" data-reveal="card">
        <h3>Service reserve</h3>
        <p>
          Astral can change over time. Modules, launcher logic, delivery flow, account
          checks and product structure may be updated whenever needed for support, security or maintenance.
        </p>
        <p>
          If the service is being abused, unstable, under attack or being redistributed, account access
          can be limited or revoked to protect the project.
        </p>
      </article>
    </section>
  );
}

export default TermsPage;
