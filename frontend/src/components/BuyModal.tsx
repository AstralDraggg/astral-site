import { useEffect, useState } from 'react';
import funpayLogo from '../../assets/funpay.svg';
import { Product } from '../siteData';
import { LicenseTerm, TERM_OPTIONS, EXTRA_LINKS, funpayUrl } from '../funpay';

type BuyModalProps = {
  product: Product;
  /** Весь каталог — отсюда берём цену для выбранной длительности. */
  products: Product[];
  onClose: () => void;
};

/**
 * Окно «Купить»: слева способ оплаты (Funpay), справа срок лицензии.
 * Как только выбраны и то, и другое — сразу открывается лот на Funpay.
 */
function BuyModal({ product, products, onClose }: BuyModalProps) {
  const [method, setMethod] = useState<'funpay' | null>(null);
  // Срок не подставляем заранее: пока не выбраны и способ, и срок — ничего
  // не открывается, чтобы случайно не уехать на чужой лот.
  const [term, setTerm] = useState<LicenseTerm | null>(null);

  const availableTerms = TERM_OPTIONS.filter((option) =>
    products.some((item) => item.id === option.productId),
  );
  // Выбор срока есть только у подписок; у товаров вроде «Сброс HWID» — своя ссылка.
  const hasTerms = product.category === 'subscription' && availableTerms.length > 0;
  const needsLink = !hasTerms && !EXTRA_LINKS[product.id];
  const url = funpayUrl(term, product.id);
  const ready = Boolean(url);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * Открываем лот через скрытую ссылку, а не window.open: так вкладку
   * не может заблокировать даже агрессивный блокировщик, а сама страница
   * Funpay не получает доступ к нашей вкладке (rel="noopener").
   */
  function openFunpay(termToUse: LicenseTerm | null = term) {
    const target = funpayUrl(termToUse, product.id);
    if (!target) {
      return;
    }

    const link = document.createElement('a');
    link.href = target;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();

    onClose();
  }

  function chooseMethod() {
    setMethod('funpay');
    if (term || !hasTerms) {
      openFunpay(term);
    }
  }

  function chooseTerm(next: LicenseTerm) {
    setTerm(next);
    if (method === 'funpay') {
      openFunpay(next);
    }
  }

  function priceFor(selected: LicenseTerm | null): string {
    if (!selected) {
      return '';
    }
    const option = TERM_OPTIONS.find((item) => item.id === selected);
    return products.find((item) => item.id === option?.productId)?.price ?? '';
  }

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div className="modal-content buy-modal" role="dialog" aria-modal="true" aria-label="Покупка">
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Купить: {product.name}</h3>
            <p className="modal-subtitle">Выбери способ оплаты и срок — откроется страница Funpay.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="buy-body">
          <div className="buy-column">
            <p className="buy-label">Способы оплаты</p>

            <button
              type="button"
              className={`buy-method${method === 'funpay' ? ' buy-method-active' : ''}`}
              onClick={chooseMethod}
            >
              <img src={funpayLogo} alt="" aria-hidden="true" className="buy-funpay-logo" />
              <span className="buy-method-name">Funpay</span>
            </button>
          </div>

          <div className="buy-column">
            {hasTerms ? (
              <>
                <p className="buy-label">Срок лицензии</p>
                <div className="buy-terms">
                  {availableTerms.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`buy-term${term === option.id ? ' buy-term-active' : ''}`}
                      onClick={() => chooseTerm(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <p className="buy-price">
                  К оплате: <b>{term ? priceFor(term) : '—'}</b>
                </p>
              </>
            ) : (
              <p className="buy-hint">
                Для этого товара ссылка на оплату пока не добавлена. Напишите в поддержку —
                выставим.
              </p>
            )}

            <button type="button" className="buy-pay" onClick={() => openFunpay()} disabled={!ready}>
              {needsLink ? 'Оплата недоступна' : 'Оплатить через FUNPAY'}
            </button>

            {ready && !method && (
              <p className="buy-hint">Оплата проходит на Funpay — там же получишь товар.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BuyModal;
