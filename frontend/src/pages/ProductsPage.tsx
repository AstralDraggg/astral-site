import { CSSProperties, useMemo, useState } from 'react';
import productsIcon from '../../assets/marketpurchase.svg';
import boxIcon from '../../assets/box.svg';
import cupIcon from '../../assets/cup.svg';
import moreIcon from '../../assets/more-circle.svg';
import updateIcon from '../../assets/update.svg';
import swordTabIcon from '../../assets/netherite-sword.png';
import totemTabIcon from '../../assets/totem-of-undying.png';
import peopleIcon from '../../assets/people-community.svg';
import { SitePayload, ProductCategory, Product } from '../siteData';
import BuyModal from '../components/BuyModal';

type ProductsPageProps = {
  payload: SitePayload;
};

const productIcons = [boxIcon, cupIcon, moreIcon, updateIcon];

function ProductsPage({ payload }: ProductsPageProps) {
  const [activeCategory, setActiveCategory] = useState<ProductCategory>('subscription');
  const [hoveredCategory, setHoveredCategory] = useState<ProductCategory | null>(null);
  const [buyTarget, setBuyTarget] = useState<Product | null>(null);

  const subscriptions = payload.products.filter((product) => product.category === 'subscription');
  const additions = payload.products.filter((product) => product.category === 'addition');

  const visibleProducts = activeCategory === 'subscription' ? subscriptions : additions;

  const activeIndex = activeCategory === 'subscription' ? 0 : 1;
  const hoverIndex = hoveredCategory === null ? -1 : hoveredCategory === 'subscription' ? 0 : 1;

  const switchStyle = useMemo(
    () =>
      ({
        '--switch-active-index': String(activeIndex),
        '--switch-hover-index': String(hoverIndex),
        '--switch-hover-opacity':
          hoveredCategory !== null && hoveredCategory !== activeCategory ? '1' : '0',
      }) as CSSProperties,
    [activeCategory, activeIndex, hoveredCategory, hoverIndex],
  );

  return (
    <section className="products-showcase route-panel" data-reveal="products">
      <div className="products-hero" data-reveal="hero">
        <div className="products-chip">
          <img src={productsIcon} alt="" aria-hidden="true" className="note-icon" />
          Товары
        </div>

        <h2 className="products-title">Выбирай, что берёшь!</h2>
        <p className="products-subtitle">
          Тот, что подходит именно тебе: чистый клиент, чёткий визуал, быстрые модули, простая
          покупка и никакой лишней мишуры.
        </p>

        <div className="products-switch products-switch-wide" style={switchStyle}>
          <div className="switch-active-bg" aria-hidden="true" />
          <div className="switch-hover-bg" aria-hidden="true" />

          <button
            type="button"
            className={`switch-button${activeCategory === 'subscription' ? ' switch-button-active' : ''}`}
            onClick={() => setActiveCategory('subscription')}
            onMouseEnter={() => setHoveredCategory('subscription')}
            onMouseLeave={() => setHoveredCategory(null)}
          >
            <img
              src={swordTabIcon}
              alt=""
              aria-hidden="true"
              className="tab-png-icon accent-png-icon"
            />
            Подписки
          </button>

          <button
            type="button"
            className={`switch-button${activeCategory === 'addition' ? ' switch-button-active' : ''}`}
            onClick={() => setActiveCategory('addition')}
            onMouseEnter={() => setHoveredCategory('addition')}
            onMouseLeave={() => setHoveredCategory(null)}
          >
            <img
              src={totemTabIcon}
              alt=""
              aria-hidden="true"
              className="tab-png-icon accent-png-icon"
            />
            Дополнения
          </button>
        </div>
      </div>

      <div className="products-stage">
        {activeCategory === 'subscription' && (
          <div className="products-reference-grid products-enter">
            {visibleProducts.map((product, index) => (
              <article
                key={product.id}
                className="reference-card animated-card"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <div className="reference-card-top">
                  <div className="reference-badge">
                    <img
                      src={peopleIcon}
                      alt=""
                      aria-hidden="true"
                      className="mini-icon"
                    />
                    {product.badge}
                  </div>
                </div>

                <div className="reference-price-row">
                  <span className="reference-price">{product.price}</span>
                  <span className="reference-duration">{product.duration}</span>
                </div>

                <h3 className="reference-name">{product.name}</h3>
                <p className="reference-description">{product.description}</p>

                <div className="reference-divider" />

                <ul className="reference-list">
                  {product.features.map((feature, featureIndex) => (
                    <li key={feature}>
                      <img
                        src={productIcons[featureIndex % productIcons.length]}
                        alt=""
                        aria-hidden="true"
                        className="mini-icon"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className="reference-buy"
                  onClick={() => setBuyTarget(product)}
                >
                  <img src={productsIcon} alt="" aria-hidden="true" className="mini-icon" />
                  Купить
                </button>
              </article>
            ))}
          </div>
        )}

        {activeCategory === 'addition' && (
          <div className="products-addon-grid products-enter">
            {visibleProducts.map((product, index) => (
              <article
                key={product.id}
                className="reference-addon-card animated-card"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <div>
                  <div className="reference-price-row addon-price-row">
                    <span className="reference-price">{product.price}</span>
                  </div>
                  <h3 className="reference-name">{product.name}</h3>
                  <p className="reference-description">{product.description}</p>
                </div>

                <button
                  type="button"
                  className="reference-buy compact-buy"
                  onClick={() => setBuyTarget(product)}
                >
                  <img src={productsIcon} alt="" aria-hidden="true" className="mini-icon" />
                  Купить
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="products-addon-inline products-enter" style={{ animationDelay: '120ms' }}>
        {additions.map((product) => (
          <article key={product.id} className="reference-addon-card inline-addon-card animated-card">
            <div>
              <div className="reference-price-row addon-price-row">
                <span className="reference-price">{product.price}</span>
              </div>
              <h3 className="reference-name">{product.name}</h3>
              <p className="reference-description">{product.description}</p>
            </div>

            <button
              type="button"
              className="reference-buy compact-buy"
              onClick={() => setBuyTarget(product)}
            >
              <img src={productsIcon} alt="" aria-hidden="true" className="mini-icon" />
              Купить
            </button>
          </article>
        ))}
      </div>

      {buyTarget && (
        <BuyModal
          product={buyTarget}
          products={payload.products}
          onClose={() => setBuyTarget(null)}
        />
      )}
    </section>
  );
}

export default ProductsPage;
