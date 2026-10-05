export type ProductCategory = 'subscription' | 'addition';

export type Product = {
  id: string;
  name: string;
  price: string;
  duration: string;
  badge: string;
  description: string;
  features: string[];
  category: ProductCategory;
};

export type SitePayload = {
  stats: Array<{ label: string; value: string }>;
  features: Array<{ title: string; description: string; icon: string }>;
  products: Product[];
};

export const fallbackPayload: SitePayload = {
  stats: [
    { label: 'Стиль', value: 'Чистый приват' },
    { label: 'Модули', value: '70+' },
    { label: 'Конфиги', value: 'Быстрая смена' },
    { label: 'Ощущения', value: 'Быстро и чисто' },
  ],
  features: [
    {
      title: 'Бой',
      description: 'Удары чёткие, прицел чистый, а файты идут плавно, а не как клоунада.',
      icon: 'combat',
    },
    {
      title: 'Движение',
      description: 'Скорость, стрейфы и движение ощущаются плавно: не рывками и не странно.',
      icon: 'movement',
    },
    {
      title: 'Визуал',
      description: 'HUD и визуал остаются аккуратными, экран не превращается в кашу.',
      icon: 'visuals',
    },
    {
      title: 'Конфиги',
      description: 'Быстро меняй сборки и сохраняй свои настройки, не собирая всё с нуля.',
      icon: 'configs',
    },
  ],
  products: [
    {
      id: 'sub-30',
      name: 'Astral',
      price: '389₽',
      duration: '/ 30 дней',
      badge: 'Нас выбирают 5 000 игроков',
      description: 'Стартовый доступ, если просто хочешь зайти и играть.',
      category: 'subscription',
      features: ['25+ визуальных функций', 'Быстрые модули', 'Поддержка 24/7', 'Частые обновления клиента'],
    },
    {
      id: 'sub-90',
      name: 'Astral',
      price: '689₽',
      duration: '/ 90 дней',
      badge: 'Нас выбирают 5 000 игроков',
      description: 'Лучший вариант посередине, если играешь много и хочешь всё и сразу.',
      category: 'subscription',
      features: ['25+ визуальных функций', 'Быстрые модули', 'Поддержка 24/7', 'Частые обновления клиента'],
    },
    {
      id: 'sub-999',
      name: 'Astral',
      price: '989₽',
      duration: '/ 999 дней',
      badge: 'Нас выбирают 5 000 игроков',
      description: 'Долгий вариант. Купил один раз и больше не думаешь.',
      category: 'subscription',
      features: ['25+ визуальных функций', 'Быстрые модули', 'Поддержка 24/7', 'Частые обновления клиента'],
    },
    {
      id: 'hwid-reset',
      name: 'Сброс HWID',
      price: '189₽',
      duration: '',
      badge: 'Дополнение',
      description: 'Нужен быстрый сброс привязки железа на аккаунте? Бери это.',
      category: 'addition',
      features: [],
    },
  ],
};
