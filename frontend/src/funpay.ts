// Оплата идёт на Funpay: у каждой длительности там свой лот.
// Меняешь ссылку — меняется только этот файл.
export type LicenseTerm = '30' | '90' | 'forever';

export type TermOption = {
  id: LicenseTerm;
  label: string;
  /** Товар в каталоге, у которого берём цену для этой длительности. */
  productId: string;
};

export const TERM_OPTIONS: TermOption[] = [
  { id: '30', label: '30 дней', productId: 'sub-30' },
  { id: '90', label: '90 дней', productId: 'sub-90' },
  { id: 'forever', label: 'Навсегда', productId: 'sub-999' },
];

export const FUNPAY_LINKS: Record<LicenseTerm, string> = {
  '30': 'https://funpay.com/lots/offer?id=78863078',
  '90': 'https://funpay.com/lots/offer?id=79192891',
  forever: 'https://funpay.com/lots/offer?id=79193123',
};

/**
 * Товары, у которых нет выбора длительности (например «Сброс HWID»).
 * Пока ссылок нет — ключ пустой, и в окне показывается подсказка вместо кнопки.
 */
export const EXTRA_LINKS: Record<string, string> = {};

/** Ссылка на оплату: по длительности либо по товару без длительности. */
export function funpayUrl(term: LicenseTerm | null, productId: string): string {
  if (term) {
    return FUNPAY_LINKS[term];
  }
  return EXTRA_LINKS[productId] ?? '';
}
