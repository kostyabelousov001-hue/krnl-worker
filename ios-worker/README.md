# KRNL Worker for iOS

Подключайся к распределённому скраперу с iPhone.

## Установка (Sideloadly)

1. Зайди в **Actions** → **Build KRNL iOS Worker** → Последний успешный → Скачай `KRNLWorker-unsigned`
2. Открой Sideloadly, перетащи `.ipa`, введи свой Apple ID
3. Sideloadly подпишет и установит на iPhone

## Использование

1. Открой приложение → нажми **Connect to Host**
2. Введи адрес: `lol.krnlcamel.space`
3. Порт: `9090`
4. Нажми Connect

Приложение автоматически получает задачи от Host, парсит страницы и отправляет результаты.

## Сборка вручную

```bash
brew install xcodegen
cd ios-worker
xcodegen generate
xcodebuild build \
  -project KRNLWorker.xcodeproj \
  -scheme KRNLWorker \
  -sdk iphoneos \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CONFIGURATION_BUILD_DIR=build

mkdir Payload && cp -R build/KRNLWorker.app Payload/
zip -r KRNLWorker.ipa Payload/
```