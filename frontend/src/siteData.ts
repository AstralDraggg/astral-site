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
    { label: 'Интерфейс', value: 'Минимализм' },
    { label: 'Античит', value: 'Обход проверок' },
    { label: 'Модули', value: '70+' },
    { label: 'Игра', value: 'Без бана' },
  ],
  features: [
    {
      title: 'Легит',
      description: 'Прицел ровный, удары чёткие, файты идут спокойно. Ничего сверхъестественного — просто играешь и всё.',
      icon: 'combat',
    },
    {
      title: 'Обход проверок',
      description: 'Античит проверяет — и промахивается. Обход заложен прямо в клиент, бан во время игры не светится.',
      icon: 'movement',
    },
    {
      title: 'Минимализм',
      description: 'Интерфейс лёгкий и приятный: лишнего нет.',
      icon: 'visuals',
    },
    {
      title: 'Конфиги',
      description: 'Настройки сохраняешь один раз, дальше просто переключаешься. Собирать всё с нуля не надо.',
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
      description: 'Стартовый доступ: поставил, настроил и спокойно играешь.',
      category: 'subscription',
      features: ['70+ модулей', 'Обход проверок', 'Минималистичный HUD', 'Поддержка 24/7'],
    },
    {
      id: 'sub-90',
      name: 'Astral',
      price: '689₽',
      duration: '/ 90 дней',
      badge: 'Нас выбирают 5 000 игроков',
      description: 'Середина: играешь много и хочешь всё и сразу.',
      category: 'subscription',
      features: ['70+ модулей', 'Обход проверок', 'Минималистичный HUD', 'Поддержка 24/7'],
    },
    {
      id: 'sub-999',
      name: 'Astral',
      price: '989₽',
      duration: '/ 999 дней',
      badge: 'Нас выбирают 5 000 игроков',
      description: 'Долгий вариант. Купил один раз и больше не думаешь.',
      category: 'subscription',
      features: ['70+ модулей', 'Обход проверок', 'Минималистичный HUD', 'Поддержка 24/7'],
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
