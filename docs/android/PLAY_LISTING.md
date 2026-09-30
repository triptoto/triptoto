# Google Play: материалы для страницы и App content (черновик)

Составлено по коду на 2026-09-30 (web v824, Android 1.0.0 / versionCode 1).
Перед отправкой владелец проверяет каждый пункт, помеченный **[проверить]**.

## Страница приложения (en, основная)

- **App name:** tripto.to
- **Short description (≤80):** Plan trips, keep bookings and documents together, share plans with your crew.
- **Full description (≤4000):**

  tripto.to keeps your whole trip in one calm place.

  - Trips and day plans: flights, stays, reservations, activities and notes on one timeline.
  - Smart import: add bookings from PDFs, screenshots and confirmation emails. Files are read on your phone.
  - Documents: keep tickets, passes and booking confirmations with the trip and open them offline.
  - Saved Spots: save a place with one tap and navigate back with Google Maps or Waze.
  - Travel tools: weather for your stops, a currency converter, tax-free refund guides and airline links.
  - Share with your crew: invite people to a trip and plan together.
  - Works offline: your trips open without a connection and sync when you are back online.
  - Five languages: English, Deutsch, Français, Español, Русский.

  Sign in with Google to keep trips in sync across devices, or start right away without an account.

- **Category:** Travel & Local. **Tags:** trip planner, itinerary, travel documents.
- **Contact email:** go@tripto.to. **Website:** https://tripto.to. **Privacy policy:** https://tripto.to/privacy.
- Переводы de/fr/es/ru можно добавить в Play Console → Store presence → Main store listing → Manage translations.

## Графика

| Ресурс | Требование | Статус |
| --- | --- | --- |
| Иконка | 512×512 PNG, 32-bit | сгенерировать из `public/app-icon.svg` (например, `mark(512)` в `scripts/build-android-icons.py`) |
| Feature graphic | 1024×500 PNG/JPG | не создан: фон `#E7E1FB`, знак слева, «tripto.to» + слоган справа |
| Скриншоты телефона | 2–8 шт., 1080×1920 или больше | **не сделаны**: нужны реальные снимки с эмулятора/телефона (Android Studio → Running Devices → Take screenshot). Рекомендуемые экраны: список поездок, таймлайн поездки, документ, Saved Spots, погода, приглашение |

Скриншоты должны показывать реальный интерфейс приложения с демо-поездкой отдельного тестового
аккаунта (не поездки реальных пользователей).

## Разрешения и назначение

| Разрешение | Зачем | Когда запрашивается |
| --- | --- | --- |
| `INTERNET` | синхронизация с https://tripto.to, карта, погода, курсы валют | не запрашивается (обычное) |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | одна точка при нажатии «Сохранить место» в Saved Spots и «Моё местоположение» на карте поездки. Можно дать только приблизительную | только после нажатия пользователем |

Не запрашиваются: фоновая геолокация, камера, микрофон, контакты, доступ ко всем файлам,
медиа-разрешения (файлы выбираются через системный picker и сохраняются через системный диалог).

## Data safety (черновик по коду)

**Шифрование при передаче:** да (только HTTPS, `usesCleartextTraffic=false`, HSTS).
**Удаление данных:** да, в приложении (Account → Privacy & data → Delete my account,
`DELETE /api/v1/account`) и через https://tripto.to/delete-account.

### Собираемые данные (хранятся на сервере tripto.to)

| Категория Play | Данные | Обязательно? | Назначение |
| --- | --- | --- | --- |
| Personal info → Name | имя из Google-аккаунта; имена путешественников и контактов поездки, введённые пользователем | нет (гостевой режим без входа) | App functionality, Account management |
| Personal info → Email address | email Google-аккаунта; email приглашённых; email контактов поездки | нет | Account management, App functionality |
| Personal info → User IDs | ID пользователя, subject Google | нет | Account management |
| Personal info → Other info | год рождения путешественника (не полная дата), номера билетов, места, питание, особая помощь | нет | App functionality |
| Personal info → Phone number | телефоны контактов поездки (если введены) | нет | App functionality |
| Location → Approximate/Precise | координаты мест поездки (отели, остановки), заданные пользователем; геокодирование названий мест для погоды | нет | App functionality |
| App activity → Other user-generated content | поездки, брони, коды подтверждения, заметки, чеклисты, текст вставленных писем с бронями, поля, извлечённые из документов | нет | App functionality |
| App activity → App interactions | серверные события `beta_events` (ID пользователя/устройства, ID поездки, имя события, день) | да, при использовании | Analytics **[проверить формулировку]** |
| Financial info → Purchase history | статус подписки Plus (ID подписки/клиента Lemon Squeezy, план, даты). Только если Plus куплен на сайте | нет | Account management |
| Device or other IDs | случайный ID устройства, выданный сервером; платформа, версия клиента | да | App functionality, Account management |

Эфемерно (Play «processed ephemerally»): IP и User-Agent обрабатываются для rate limit в виде
HMAC-хэша, счётчики удаляются через 48 ч.

### Только на устройстве (не «сбор» по определению Play)

- Точка текущего местоположения (Saved Spots, «Моё местоположение» на карте) — хранится
  в IndexedDB приложения, на сервер не отправляется.
- Файлы документов и вложений — в IndexedDB приложения; распознавание (Tesseract, pdf.js)
  выполняется на устройстве. На сервер уходят только извлечённые поля, имя файла и контрольная сумма.

### Передача третьим лицам

| Получатель | Что получает | Примечание |
| --- | --- | --- |
| Google (Credential Manager / Sign-In) | вход через Google | системный компонент |
| Stay22 (скрипт `scripts.stay22.com` выполняется в приложении) | IP, данные устройства/браузера, возможно, контекст страницы | **[проверить]** политику Stay22; если они собирают данные, отметить «Shared → App interactions / Device IDs» либо отключить Stay22 в Android-сборке |
| OpenFreeMap (плитки), jsDelivr (MapLibre), Google Fonts | IP, область карты | обычные сетевые запросы к CDN |
| Open-Meteo, Nominatim | координаты/названия мест поездки (запрашивает сервер, не телефон) | для погоды |
| Frankfurter, open.er-api | только коды валют | |
| AeroDataBox (RapidAPI) | номер рейса и дата | сейчас выключено в `wrangler.jsonc` |
| Lemon Squeezy | в Android-приложении не используется | покупка скрыта |

Внешние ссылки (авиакомпании, Booking.com, партнёрские tpm.li, Google Maps, Waze) открываются
в браузере/другом приложении — это не передача данных приложением, но URL может содержать
город и даты поездки.

**Не найдено в коде:** рекламные SDK, рекламный ID, Firebase/Crashlytics/Sentry, Google Analytics
в Android-сборке (удалён при сборке `android-web`), доступ к контактам/камере/микрофону,
чтение буфера обмена.

**Хранение гостевых данных [проверить]:** автоматической очистки гостевых устройств и поездок
в коде нет. Укажите в политике конфиденциальности фактический срок или добавьте очистку.

## Другие разделы App content

- **Ads:** No ads (партнёрские ссылки — не реклама в смысле Play SDK; **[проверить]** с учётом Stay22).
- **Target audience:** 18+.
- **Content rating:** анкета IARC — пользовательский контент между приглашёнными участниками поездки, без публичного обмена.
- **Financial features:** нет.
- **Government app / News / Health:** нет.
- **Account deletion URL:** https://tripto.to/delete-account.

## Инструкции для ревьюера (App access)

```
tripto.to works without an account: on first launch (internet required once)
the app starts a guest session automatically. Guests can create their first
trip and use every planning feature; sync across devices and trip sharing
need Google sign-in.

To test sign-in, use any Google account (Sign in with Google on the welcome
screen). No special test credentials are required.

Location is requested only when you tap "Save this spot" in Saved Spots or the
locate button on a trip map. The app does not use background location.

Tripto Plus (unlimited trips) is not sold in the Android app. The first trip
is free; Plus bought earlier on the website is honored in the app.

Account deletion: Account -> Privacy & data -> Delete my account.
```

Подписи сверены с кодом: «Save this spot» (Saved Spots), «Delete my account» (Account → Privacy & data). Гостевая сессия создаётся автоматически; бесплатна первая поездка.

## Политика Google Play по платежам

Plus продаётся только на сайте через Lemon Squeezy. В Android-приложении цены, кнопки покупки,
ссылки на checkout и портал подписки скрыты; уже купленная на сайте подписка действует.
Чтобы продавать Plus внутри приложения, нужен Google Play Billing (отдельная разработка,
серверная проверка покупок, синхронизация прав с Lemon Squeezy).
