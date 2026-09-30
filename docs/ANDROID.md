# tripto.to для Android (Capacitor)

Android-приложение — это тот же веб-клиент из `public/`, упакованный Capacitor 8
в WebView. Frontend лежит внутри APK/AAB (`webDir: android-web`, без `server.url`),
backend остаётся прежним: `https://tripto.to` (Cloudflare Worker + D1).
Веб-версия работает как раньше: все нативные ветки в `public/mobile-app.js`
закрыты флагом `NATIVE` (`Capacitor.isNativePlatform()`).

| Параметр | Значение |
| --- | --- |
| applicationId | `to.tripto.app` |
| Название | `tripto.to` |
| Версия | `android/version.properties` (`versionCode`, `versionName`) |
| Capacitor | 8.5.2 (AGP 8.13, Gradle 8.14.3) |
| compileSdk / targetSdk / minSdk | 36 / 36 / 24 |
| Java | JDK 21 |
| Origin WebView | `https://localhost` (разрешён в `ALLOWED_ORIGINS`) |
| 16 KB page size | в проекте нет собственных `.so`; плагины Capacitor 8 — чистая Java/Kotlin. Проверить после сборки: Android Studio → Build → Analyze APK → `lib/` пуст |

## 1. Настройка macOS (один раз)

1. JDK 21: `brew install --cask temurin@21` (или JDK, встроенный в Android Studio).
   Проверка: `/usr/libexec/java_home -v 21`.
2. Android Studio (бесплатно): https://developer.android.com/studio.
   SDK Manager → Android SDK Platform 36, Build-Tools 36, Platform-Tools, Emulator,
   системный образ Android 15/16 (Google Play, arm64).
3. В `~/.zshrc`:
   ```bash
   export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$ANDROID_HOME/platform-tools:$PATH"
   ```
4. Сеть: Gradle нужны `dl.google.com`, `maven.google.com`, `services.gradle.org`,
   `repo.maven.apache.org`, `plugins.gradle.org`. Если стоит прокси/песочница —
   добавьте их в allowlist.
5. Node 22–25, затем `npm ci` в корне репозитория.

## 2. Сборка

| Команда | Что делает |
| --- | --- |
| `npm run android:web` | `build:app-shell` + сборка `android-web/` (без service worker, gtag, consent-banner, `shell-update.js`, `canonical-host.js`; в CSP добавлены `https://tripto.to` для API и `blob:`) |
| `npm run android:sync` | то же + `npx cap sync android` (копирует веб-бандл и плагины) |
| `npm run android:apk` | debug APK → `android/app/build/outputs/apk/debug/app-debug.apk` |
| `npm run android:aab` | release AAB → `android/app/build/outputs/bundle/release/app-release.aab` |
| `npm run android:open` | открыть проект в Android Studio |
| `npm run check:android` | статический контракт (разрешения, FileProvider, подписание, CORS, assetlinks) |

После каждого изменения веб-кода: `npm run android:sync`, затем Run в Android Studio.
`android-web/`, `android/app/src/main/assets/public` и копия `capacitor.config.json`
генерируются и не коммитятся.

Если ключ загрузки не настроен, `bundleRelease` выдаёт предупреждение и собирает
**неподписанный** AAB. Такой файл в Google Play загрузить нельзя.

## 3. Версии

Для каждой загрузки в Play увеличьте `versionCode` на 1 в `android/version.properties`
(уменьшать его нельзя никогда). `versionName` — видимая пользователю версия (`1.0.1`).

## 4. Ключ загрузки (upload key) и Play App Signing

Используется Play App Signing: Google хранит ключ подписи приложения, вы — только
ключ загрузки. Если ключ уже существует, используйте его и **не создавайте новый**.

Создание (один раз; пароль придумываете вы, keytool спросит его интерактивно):
```bash
keytool -genkeypair -v -keystore ~/secure/tripto-upload.jks \
  -keyalg RSA -keysize 4096 -validity 10000 -alias upload
```

Подключение — вариант А, файл `android/keystore.properties` (в `.gitignore`):
```properties
storeFile=/Users/<you>/secure/tripto-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```
Вариант Б — переменные окружения (для CI):
`TRIPTO_UPLOAD_STORE_FILE`, `TRIPTO_UPLOAD_STORE_PASSWORD`, `TRIPTO_UPLOAD_KEY_ALIAS`,
`TRIPTO_UPLOAD_KEY_PASSWORD`.

Резервная копия: `.jks` и пароли храните в менеджере паролей и на зашифрованном
внешнем носителе. Никогда не кладите их в репозиторий, Box/iCloud без шифрования
или в Android-ресурсы. Потерянный ключ загрузки можно сбросить через поддержку
Play Console, но это занимает время.

Отпечатки сертификатов:
```bash
# debug (создаётся Android Studio автоматически)
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
# upload
keytool -list -v -keystore ~/secure/tripto-upload.jks -alias upload
```
Отпечаток ключа подписи Google: Play Console → приложение → Test and release →
App integrity → App signing → «App signing key certificate» (SHA-1 и SHA-256).

## 5. Вход через Google

Приложение использует Android Credential Manager (`GetSignInWithGoogleOption`,
системное окно выбора аккаунта). Embedded WebView для OAuth не используется.
Полученный ID token проверяется существующим `POST /api/v1/auth/google` с nonce
из `/api/v1/auth/google/challenge`; backend проверяет `aud == GOOGLE_CLIENT_ID`
(web client), поэтому серверный код менять не нужно.

Google Cloud Console → тот же проект, что у веб-входа → APIs & Services → Credentials:
1. Существующий **Web application** client остаётся; его ID приложение получает
   из challenge и передаёт как `serverClientId`. Секреты в приложение не попадают.
2. Create credentials → OAuth client ID → **Android**, по одному на каждый сертификат:
   - package name `to.tripto.app`, SHA-1 debug-ключа (для разработки);
   - package name `to.tripto.app`, SHA-1 ключа загрузки (локальные release-сборки);
   - package name `to.tripto.app`, SHA-1 ключа подписи Google (сборки из Play).
3. OAuth consent screen должен быть в статусе «In production» (или добавьте
   тестировщиков в Test users).

Без Android-клиента с правильным SHA-1 Credential Manager вернёт ошибку, и вход не сработает.

## 6. App Links (приглашения `/join/<token>`)

Манифест объявляет `https://tripto.to/join/...` с `autoVerify`. Worker отдаёт
`/.well-known/assetlinks.json`, только когда задана переменная
`ANDROID_APP_LINK_SHA256` (до этого — 404). В `wrangler.jsonc` (оба окружения)
укажите SHA-256 ключа подписи Google и ключа загрузки через запятую:
```jsonc
"ANDROID_APP_LINK_SHA256": "AA:BB:...:FF, 11:22:...:99"
```
Это публичные отпечатки, не секрет. После деплоя проверьте:
`curl https://tripto.to/.well-known/assetlinks.json` и на устройстве
`adb shell pm get-app-links to.tripto.app` (статус `verified`).

## 7. Иконки и заставка

Адаптивная иконка — вектор `res/drawable/ic_launcher_foreground.xml` (+ монохромный
слой для тематических иконок Android 13+), фон `#E7E1FB`. PNG для Android 7 и
заставки старых версий генерирует `python3 scripts/build-android-icons.py` (Pillow).

## 8. Поведение, специфичное для Android

- **Назад:** сначала закрывается открытый диалог/лист, затем экран назад; на корневых
  экранах (список поездок, главная) приложение сворачивается.
- **Внешние ссылки** (авиакомпании, Tax Free, карты, партнёрские ссылки, privacy/terms,
  mailto/tel) открываются в системном браузере или приложении.
- **Saved Spots:** геолокация запрашивается только по нажатию «Сохранить место»; поддержаны
  точная/приблизительная, отказ, повторный запрос через настройки, выключенная геолокация,
  таймаут 15 с. Фоновой геолокации нет. Навигация: Google Maps и Waze (Apple Maps скрыт).
- **Документы:** выбор через системный picker; открытие во внешнем приложении и «Поделиться»
  идут через временные `content://`-URI из приватного `cache/tripto-share/` (очищается при
  запуске); экспорт — только через системный диалог «Сохранить как» (SAF). Разрешений на
  хранилище приложение не запрашивает.
- **Офлайн:** веб-бандл лежит в APK, поэтому интерфейс запускается без сети; для самого первого запуска сеть нужна (создание гостевой сессии или вход), дальше приложение работает офлайн; данные
  кэшируются в IndexedDB WebView и синхронизируются при появлении сети. Данные из браузера
  (PWA) в приложение **не переносятся** — пользователь входит в аккаунт, и поездки
  загружаются с сервера. Резервное копирование Android отключено (`allowBackup=false`).
- **Tripto Plus:** в Android-приложении покупка не предлагается (правила Google Play
  о платежах). Уже оформленная на сайте подписка действует. Продажа Plus внутри
  приложения потребует Google Play Billing — это отдельная задача.

## 9. Выпуск в Google Play

1. Play Console (регистрация $25 — действие владельца). Для **новых личных аккаунтов**
   нужен закрытый тест: не менее 12 тестировщиков, 14 дней подряд, только затем
   запрашивается доступ к production.
2. Create app → `tripto.to`, App, Free.
3. App content: Privacy policy `https://tripto.to/privacy`, удаление аккаунта
   `https://tripto.to/delete-account`, Data safety (см. `docs/android/PLAY_LISTING.md`),
   Ads: нет, Target audience 18+, доступ для проверки — см. инструкции для ревьюера.
4. Test and release → Testing → Internal testing → Create release → загрузить
   подписанный `app-release.aab` → добавить тестировщиков (email) → ссылка на opt-in.
5. Затем Closed testing с теми же шагами; production — только отдельным решением.

## 10. Чеклист на физическом телефоне

- [ ] Первый запуск без сети: понятная ошибка, без белого экрана; первый запуск с сетью → гостевая сессия
- [ ] Повторный запуск в режиме полёта: поездки и документы открываются
- [ ] Вход через Google, выход, вход другим аккаунтом, отмена выбора аккаунта
- [ ] Повторный запуск — сессия восстановлена; истёкшая сессия ведёт на вход
- [ ] Кнопка «Назад»: закрывает лист → экран назад → сворачивает на корне
- [ ] Клавиатура не перекрывает поля (adjustResize), нижняя панель не под жестовой полосой
- [ ] Крупный шрифт (Настройки → Размер шрифта максимум): текст не обрезается
- [ ] Светлая/тёмная системная тема и все 5 тем приложения: цвет иконок статус-бара
- [ ] Свернуть на 10 минут, «Не сохранять действия» в Developer options — возврат без потери формы/экрана
- [ ] Saved Spots: точное, приблизительное, отказ, «Больше не спрашивать» → Настройки, геолокация выключена, в помещении (таймаут)
- [ ] Открытие места в Google Maps и Waze; «Копировать координаты»
- [ ] Документ: добавить из picker (PDF, фото), открыть во внешнем приложении, поделиться, экспорт в «Загрузки» через SAF, отмена на каждом шаге
- [ ] Ссылки авиакомпаний, Tax Free, privacy/terms, mailto открываются снаружи
- [ ] Ссылка `https://tripto.to/join/<token>` из мессенджера открывает приложение (после assetlinks)
- [ ] Офлайн-правка поездки → включить сеть → синхронизация
- [ ] Экран Plus: нет цен и ссылок на оплату
- [ ] Удаление аккаунта из приложения
