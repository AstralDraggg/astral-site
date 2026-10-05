# Astral — сайт

React-фронтенд + Node.js API + SQL-база. Всё на бесплатных сервисах, карта не нужна.

```
api/       — функция Vercel (обрабатывает /api/* на хостинге)
backend/   — API сервер: аккаунты, покупки, ключи, лоадер
frontend/  — сайт на React + Vite
scripts/   — проверка Vercel-функции без деплоя (npm run check)
```

---

## 1. Локальный запуск (на своём компьютере)

```powershell
npm run install:all     # один раз: ставит зависимости backend и frontend
npm run build           # собирает сервер и сайт
npm start               # http://localhost:3001
```

Для разработки с автоперезагрузкой: `npm run dev`.

Что важно:

- **Почта.** Пока не настроен SMTP/Resend, письмо не уходит: код подтверждения
  выводится в консоль сервера и подставляется в поле кода на сайте — удобно для теста.
- **Лоадер.** Положи `Astral.exe` в `backend/downloads/`, чтобы локально работала
  кнопка «Скачать лоадер».
- **Настройки** лежат в файле `.env` (шаблон — `.env.example`), на Vercel они
  задаются в дашборде.

Проверка Vercel-функции без деплоя: `npm run check`.

---

## 2. Публикация: пошагово

### Шаг 1. GitHub — куда положить код

1. Зарегистрируйся: <https://github.com> → **Sign up**.
2. Нажми **+** (справа сверху) → **New repository** → имя `astral-site` →
   выбери **Public** (иначе ссылка на лоадер будет требовать вход) → **Create repository**.
3. В папке проекта выполни (в PowerShell):

```powershell
cd "C:\Users\Артур\Desktop\ModerationAssist-src — копия\maven-upd"
git init
git add .
git commit -m "Astral site"
git branch -M main
git remote add origin https://github.com/<твой-логин>/astral-site.git
git push -u origin main
```

При `git push` GitHub попросит войти — входи через браузер. Если окно не
появилось: GitHub → Settings → Developer settings → Personal access tokens →
Tokens (classic) → Generate new token (галки **repo**) → вставь его как пароль.

### Шаг 2. База данных Turso (бесплатно: 100 баз, 5 ГБ)

1. <https://turso.tech> → **Sign up with GitHub**.
2. **Create Database**: имя `astral`, регион `eu-central` (или ближайший).
3. Открой базу → кнопка **Connect** (или Settings → API) — там будут:
   - **Database URL** вида `libsql://astral-xxxxx-db.turso.tech`
   - **Auth token** (длинная строка, начинается с `ey...`)

Оба значения пригодятся на Шаге 4.

### Шаг 3. Почта для кодов подтверждения

Коды приходят при **регистрации** и при **сбросе пароля**. Два варианта на выбор:

**Вариант A — SMTP через свою почтовую ящик (без своего домена, рекомендую)**

- Gmail: аккаунт Google → Безопасность → двухфакторная аутентификация →
  «Пароли приложений» → создать пароль (16 символов).
  Настройки: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`,
  `SMTP_USER=твой@gmail.com`, `SMTP_PASS=пароль приложения`.
- Yandex: `SMTP_HOST=smtp.yandex.ru`, логин — почта, пароль — **пароль приложения**
  (Безопасность → Пароли приложений; требует включённый 2FA).
- Mail.ru: `SMTP_HOST=smtp.mail.ru`.

Ограничение Gmail — 500 писем в сутки, для старта более чем достаточно.

**Вариант B — Resend (нужен свой домен)**

Resend слать письма без верифицированного домена не даёт. Подходит, когда
появится `astraldlc.xyz`: <https://resend.com> → Sign up → Domains → добавить
домен и внести DNS-записи → API Keys → создать ключ.
Настройки: `RESEND_API_KEY=re_...`, `EMAIL_FROM="Astral <noreply@astraldlc.xyz>"`.

### Шаг 4. Хостинг Vercel (бесплатно: 100 ГБ трафика/мес, без карты)

1. <https://vercel.com> → **Sign up with GitHub**.
2. **Add New… → Project** → выбери репозиторий `astral-site` → **Import**.
   Vercel сам возьмёт сборку из `vercel.json` (устанавливает зависимости,
   собирает сайт в `frontend/dist`, подключает функцию из `api/`).
3. Перед первым деплоем добавь переменные: **Settings → Environment Variables**:

| Переменная | Значение |
| --- | --- |
| `TURSO_DATABASE_URL` | из Шага 2 (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | из Шага 2 (токен) |
| `TOKEN_SECRET` | длинная случайная строка (см. ниже) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | из Шага 3, вариант A |
| *или* `RESEND_API_KEY` + `EMAIL_FROM` | из Шага 3, вариант B |
| `LAUNCHER_URL` | прямая ссылка на `Astral.exe` (Шаг 5), можно добавить позже |

Сгенерировать `TOKEN_SECRET`:

```powershell
powershell -Command "[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')"
```

4. Нажми **Deploy** и подожди пару минут. Адрес сайта будет вида
   `https://astral-site.vercel.app` — им уже можно делиться.

### Шаг 5. Лоадер (Astral.exe, 30 МБ)

Файл не влезает в функцию хостинга, поэтому сайт отдаёт на него ссылку.

1. В GitHub репозитории: **Releases → Draft a new release** → тег `v1.0.0` →
   в **Attach binaries** перетащи `Astral.exe` → **Publish release**.
2. Скопируй прямую ссылку на файл:
   `https://github.com/<логин>/astral-site/releases/download/v1.0.0/Astral.exe`
3. Вставь её в Vercel: **Settings → Environment Variables → `LAUNCHER_URL`** →
   потом **Deployments → … → Redeploy** (чтобы подхватилось).

Пока переменной нет, кнопка на сайте отдаёт файл с сервера (так работает
локально, где файл лежит в `backend/downloads/`).

### Шаг 6. Проверка

Открой адрес сайта → **Регистрация** → вводишь данные → приходит код на почту
(в локальном режиме код просто показывается на экране) → вводишь код →
ты в профиле. Там же: «Забыли пароль?» на странице входа, покупки, активация
ключа и кнопка «Скачать лоадер».

---

## 3. Лицензионные ключи

Добавить ключ (в папке `backend`):

```powershell
npm run key:add -- ASTRAL-XXXX-YYYY-ZZZZ sub-30
```

`sub-30` — 30 дней, `sub-90` — 90 дней, `sub-999` — 999 дней,
`hwid-reset` — сброс HWID.

---

## 4. Когда появится свой домен (astraldlc.xyz)

1. Купи домен.
2. Vercel → **Settings → Domains** → добавь `astraldlc.xyz` → Vercel покажет
   DNS-записи, внеси их у регистратора.
3. Если используешь почту через Resend — привяжи домен там (Шаг 3, вариант B).

---

## 5. Лоадер: кнопки и пересборка exe

Исходники лоадера лежат отдельно (папка `Loader` на рабочем столе).

Кнопки **«Войти через сайт»**, **«Личный кабинет»**, **«Продлить подписку»**
и **«Сбросить HWID»** открывают страницы сайта. Адрес берётся из
`Loader\main.py`:

```python
SITE_URL_DEFAULT = 'http://localhost:3001'
```

После публикации поменяй его на реальный адрес сайта
(например `https://astral-site.vercel.app`) — и, если рядом лежит
`Loader\config.json`, обнови `"site_url"` в нём.

Пересборка exe:

```powershell
cd C:\Users\Артур\Desktop\Loader
python -m PyInstaller Astral.spec --noconfirm
```

Готовый файл — `Loader\dist\Astral.exe`:

- для локальной разработки положи его в `backend/downloads/`;
- для сайта загрузи в GitHub Release и вставь ссылку в `LAUNCHER_URL`.

---

## 6. Частые вопросы

- **Обновить сайт после правок:** `git add . && git commit -m "fix" && git push` —
  Vercel подхватит и пересоберёт автоматически.
- **Посмотреть логи/ошибки:** Vercel → проект → **Logs** (или вкладка Deployments
  у конкретного деплоя).
- **Перезалить лоадер:** новый релиз на GitHub → обнови `LAUNCHER_URL` → Redeploy.
- **Тарифы:** Vercel Hobby — 0 $, Turso Free — 0 $, SMTP/Yandex/Gmail — 0 $,
  Resend Free — 3000 писем/мес. Карта нигде не нужна.
