# Тармақ — внутренняя сеть колледжа

**Firebase Authentication + Cloud Firestore** (данные, realtime) · **Google Диск через Apps Script** (только фото) · **Next.js 14 PWA**

```
tarmak/
├── firebase/
│   ├── firestore.rules          ← правила безопасности (вставить в консоль Firebase)
│   ├── firestore.indexes.json   ← индекс для «моих голосов» (collectionGroup votes.uid)
│   ├── firebase.json  .firebaserc
│   ├── tests/rules.test.mjs     ← 10 автотестов правил на эмуляторе (npm test)
│   └── scripts/seed.mjs         ← демо-аккаунты и демо-посты для защиты
├── gas/
│   ├── PhotoUpload.gs           ← Apps Script: Base64 → папка College_Threads_Media → ссылка thumbnail
│   ├── appsscript.json
│   └── photo-mock.mjs           ← локальная имитация PhotoUpload.gs для разработки
└── web/                         ← Next.js App Router
    ├── lib/
    │   ├── firebase.ts          ← init, офлайн-кэш Firestore, GoogleAuthProvider, эмуляторы
    │   ├── db.ts                ← все записи: транзакция номера, batch, голоса, статусы, уведомления
    │   ├── store.tsx            ← onAuthStateChanged + onSnapshot-подписки, навигация, действия
    │   ├── useComments.ts       ← realtime-комментарии открытой ветки
    │   ├── upload.ts            ← POST в PhotoUpload.gs (text/plain, ID-токен Firebase)
    │   └── stats.ts i18n.ts types.ts constants.ts utils.ts (маска телефона, сжатие фото)
    ├── components/
    │   ├── AuthScreen.tsx       ← Google (popup → redirect на iOS PWA) + Email/пароль + демо-вход
    │   ├── ProfileSetupModal.tsx← обязательные: имя, email, телефон +7 (7XX) XXX-XX-XX, роль, группа
    │   ├── AppShell.tsx         ← блокировка ленты до профиля, обработка ?loc= QR-ссылок
    │   ├── Feed.tsx PostCard.tsx PostParts.tsx (До/После) PostDetail.tsx Composer.tsx (дубликаты)
    │   ├── AdminPanel.tsx TicketAdmin.tsx (контакты автора, фото «После») QrGenerator.tsx
    │   └── Search.tsx Notifications.tsx Profile.tsx Sheets.tsx BottomNav.tsx SubBar.tsx ui.tsx
    └── public/ manifest.json sw.js icons/
```

## Модель данных Firestore

| Коллекция | Что лежит | Кто читает / пишет |
|---|---|---|
| `users_public/{uid}` | имя, @handle, роль, группа, аватар, баллы, `verified`, подписки | читают все вошедшие; роль/verified меняет только admin |
| `users_private/{uid}` | **email, телефон**, список своих заявок | **только владелец и admin** |
| `rate/{uid}` | время последней публикации | только владелец (антиспам: 1 пост/комментарий в 10 с) |
| `counters/posts` | `{ last }` | +1 только в транзакции с новой заявкой |
| `posts/{id}` | пост / ветка (`chainOf`) / репост / заявка (`ticket`) / опрос | статус, SLA, официальный ответ, фото «После» — **только admin** |
| `posts/{id}/votes/{uid}` | голос в опросе | только сам голосующий; счётчики сверяются правилами |
| `posts_owner/{id}` | настоящий автор анонимного поста | **только сам автор** — даже admin не видит |
| `comments/{id}` | ветки комментариев | все читают, автор/админ удаляют |
| `notifications/{id}` | лайки, ответы, смена статуса… | только получатель |
| `usernames/{handle}` | `{ uid }` — занятый @username | все читают (проверка «Бос / Бос емес»), занять/освободить может только владелец |
| `redemptions/{code}` | купон магазина бонусов `TRM-XXXX-XXXX` | владелец и admin; выдаёт/отменяет только admin |
| `chats/{uidA_uidB}` + `messages/{id}` | личные сообщения | **только два участника** диалога |

---

## 1. Firebase (бесплатный тариф Spark)

1. console.firebase.google.com → **Добавить проект** → имя `tarmak-college` (Google Analytics можно выключить).
2. **Build → Authentication → Начать → Sign-in method**:
   - **Google** → Включить → e-mail поддержки → Сохранить.
   - **Электронная почта/пароль** → Включить → Сохранить.
   - Вкладка **Settings → Authorized domains** → «Добавить домен» → `tarmak-college.vercel.app` (ваш домен Vercel). `localhost` там уже есть.
3. **Build → Firestore Database → Создать базу данных** → расположение `eur3 (europe-west)` (ближе к Казахстану, менять потом нельзя) → «Запустить в рабочем режиме».
4. **Firestore → вкладка «Правила» (Rules)** → удалите всё, вставьте содержимое `firebase/firestore.rules` → **Опубликовать**.
   Через CLI то же самое: `cd firebase && npx firebase login && npx firebase use <project-id> && npm run deploy:rules`. Эта команда заодно создаст индекс из `firestore.indexes.json`.
   Если индекс не создан, при первом входе в консоли браузера появится ссылка «create it here». Откройте её и нажмите «Создать».
5. **⚙️ Настройки проекта → Общие → Ваши приложения → `</>` (Web)** → зарегистрируйте приложение → скопируйте `firebaseConfig` в переменные `NEXT_PUBLIC_FIREBASE_*` (см. п. 4).
6. **Первый администратор.** Войдите в приложение, заполните профиль, затем: Firestore → `users_public` → ваш документ → поле `role` → `admin`. Дальнейших админов и подтверждение преподавателей можно делать уже из Админ-панели.

## 2. PhotoUpload.gs (фото на ваш Google Диск)

1. script.google.com → **Новый проект** → назовите «Tarmak Photo Upload».
2. Вставьте `gas/PhotoUpload.gs` вместо содержимого `Код.gs` → 💾.
3. ⚙️ **Настройки проекта** → «Показывать файл манифеста» → в редакторе замените `appsscript.json` на `gas/appsscript.json`.
4. ⚙️ **Настройки проекта → Свойства скрипта → Добавить**: `FIREBASE_API_KEY` = значение `NEXT_PUBLIC_FIREBASE_API_KEY`.
   По нему скрипт проверяет ID-токен Firebase: загружать фото могут только вошедшие пользователи.
5. Выберите функцию `setup` → **Выполнить** → разрешите доступ к Диску и внешним запросам. На Диске появится папка `College_Threads_Media`.
6. **Развертывание → Новое развертывание → Веб-приложение**: «Запуск от имени: Я», «Доступ: Все» → скопируйте URL `/exec` в `NEXT_PUBLIC_GAS_UPLOAD_URL`.
   После правок кода: «Управление развертываниями» → ✏️ → «Новая версия». URL при этом сохраняется.

Фронтенд сжимает фото через Canvas (до 1080 px, JPEG 0.8), отправляет `POST` с `Content-Type: text/plain;charset=utf-8` (без CORS preflight) и сохраняет в Firestore ссылку `https://drive.google.com/thumbnail?id=…&sz=w1000`. Правила принимают в `images` только такие ссылки.

## 3. Демо-данные для защиты (по желанию)

Ключ сервисного аккаунта: Firebase → ⚙️ Настройки проекта → **Сервисные аккаунты** → «Создать закрытый ключ».

```bash
cd firebase && npm install
```

```bash
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json DEMO_PASSWORD='придумайте-пароль' node scripts/seed.mjs <project-id>
```

Скрипт создаст `demo.student@tarmak.kz`, `demo.teacher@tarmak.kz`, `demo.admin@tarmak.kz` и ещё трёх участников, а также 17 постов (заявки #0001–#0009, опрос, ветку, анонимный пост, цитату) и комментарии. Затем включите `NEXT_PUBLIC_DEMO_MODE=true` и `NEXT_PUBLIC_DEMO_PASSWORD`. **Не храните `service-account.json` в git.**

## 4. Переменные окружения (`web/.env.local` и Vercel → Settings → Environment Variables)

| Переменная | Откуда |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | firebaseConfig.apiKey |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | firebaseConfig.authDomain (`<id>.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | firebaseConfig.projectId |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | firebaseConfig.storageBucket (не используется, но пусть будет) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | firebaseConfig.messagingSenderId |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | firebaseConfig.appId |
| `NEXT_PUBLIC_GAS_UPLOAD_URL` | URL `/exec` веб-приложения PhotoUpload.gs |
| `NEXT_PUBLIC_DEMO_MODE` | `false` (продакшен) / `true` (защита — кнопки демо-входа) |
| `NEXT_PUBLIC_DEMO_PASSWORD` | пароль демо-аккаунтов из seed.mjs (только при DEMO_MODE=true) |
| `NEXT_PUBLIC_USE_EMULATORS` | `1` только для локальной разработки с эмуляторами |

Ключи Firebase Web не секретны: доступ защищают `firestore.rules`, а не ключ.

## 5. Деплой на Vercel

```bash
git init && git add . && git commit -m "Tarmak on Firebase"
```

```bash
gh repo create tarmak --private --source=. --push
```

vercel.com → Add New → Project → репозиторий → **Root Directory: `web`** → добавьте переменные из п. 4 → Deploy. Затем добавьте домен Vercel в Firebase Auth → Authorized domains (п. 1.2).

PWA: iPhone — Safari → «Поделиться» → «На экран „Домой“»; Android — Chrome → «Установить приложение». Вход через Google в установленном iOS-приложении идёт через redirect: всплывающие окна там не работают.

## 6. Локальная разработка без облака

```bash
cd firebase && npm install && npm run emulators
```

```bash
cd firebase && DEMO_PASSWORD=tarmak2026 npm run seed:emulator
```

```bash
cd web && npm run photo-mock
```

В `web/.env.local`: `NEXT_PUBLIC_USE_EMULATORS=1`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-tarmak`, `NEXT_PUBLIC_FIREBASE_API_KEY=demo-key`, `NEXT_PUBLIC_GAS_UPLOAD_URL=http://localhost:8787/exec`, `NEXT_PUBLIC_DEMO_MODE=true`, `NEXT_PUBLIC_DEMO_PASSWORD=tarmak2026`. Затем:

```bash
cd web && npm run dev
```

Тесты правил: `cd firebase && npm test` (нужна Java 11+).

## Баллы, уровни и магазин бонусов
- Баллы начисляются **только** когда admin переводит заявку в «Шешілді» (или «Иесіне қайтарылды»): автору +10, выбранному помощнику из участников обсуждения +15. За обычные посты и комментарии баллов нет: правила запрещают пользователю менять себе `points`.
- Уровни: 1 «Жаңадан келген» (0), 2 «Бақылаушы» (30), 3 «Белсенді» (100), 4 «Колледж ревизоры» (250), 5 «Тармақ аңызы» (500). Пороги и привилегии — `LEVELS` в `web/lib/constants.ts`.
- Магазин: `SHOP_ITEMS` в `web/lib/constants.ts`. **Цены продублированы в `firestore.rules` → `itemCost()`**, меняйте в обоих местах. Купон создаётся вместе со списанием баллов одним batch; выдачу подтверждает admin в Админ-панели (отмена возвращает баллы).

## Демо-роли
Переключатель «Демо-рөл · қорғауға арналған» есть только в профиле при `NEXT_PUBLIC_DEMO_MODE=true`. Если `NEXT_PUBLIC_DEMO_PASSWORD` не задан, используется пароль `TarmakDemo2026!` из `web/lib/constants.ts`. Он виден в публичном репозитории, поэтому на проекте с реальными студентами выключите демо-режим и уберите демо-email из `demoRoleOk()` в `firestore.rules`: иначе любой войдёт как демо-admin и увидит контакты пользователей.

## QR-коды локаций
Админ-панель → «QR-коды локаций» → корпус, этаж, кабинет → PNG на дверь. Ссылка вида `/?loc=204-каб&type=complaint&b=main&f=2` открывает форму жалобы с заполненной локацией. Если человек не вошёл, форма откроется сразу после входа. Если по этому кабинету уже есть активные жалобы, форма показывает их с кнопкой «Растау», чтобы не плодить дубликаты.

## Лимиты бесплатного тарифа Spark
- 50 000 чтений и 20 000 записей Firestore в сутки. Лента читает последние 150 постов, комментарии читаются только для открытой ветки, офлайн-кэш снижает повторные чтения. Этого хватает примерно на несколько сотен открытий ленты в день. Если колледж большой, уменьшите `FEED_LIMIT` в `lib/store.tsx` или подключите тариф Blaze (оплата по факту использования, есть бесплатная квота).
- Уведомления пишет клиент: Cloud Functions на Spark недоступны. Автор анонимной заявки уведомление о смене статуса не получает (его uid никто не знает), но видит статус в реальном времени в «Профиль → Өтініштер»...
