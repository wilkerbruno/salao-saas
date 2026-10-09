# Gerar o APK do Eleva One

O app ja checa atualizacao sozinho: logo apos o login ele le
`https://elevaone.store/downloads/versao.json`, e se o `versionCode` de la for
maior que o instalado, baixa o `.apk` e abre a tela de instalacao do Android.
(O toque final em "Instalar" e sempre do usuario - limite do Android.)

## Opcao A - build na nuvem do Expo (mais simples, funciona no Windows)
```powershell
cd salao-saas-git
pnpm install
npm i -g eas-cli
cd apps\mobile
eas login
eas init                       # so na primeira vez (preenche o projectId)
eas build --platform android --profile preview
```
Ao terminar, baixe o .apk pelo link que o EAS mostrar. O EAS guarda a keystore
(assinatura) - mantenha sempre a mesma, senao o Android recusa a atualizacao.

## Opcao B - build local (Android Studio + JDK 17 instalados)
```powershell
cd salao-saas-git
pnpm install
cd apps\mobile
npx expo prebuild --platform android
```
Crie UMA vez a keystore e GUARDE o arquivo (sem ele nao ha como atualizar):
```powershell
keytool -genkeypair -v -storetype PKCS12 -keystore eleva.keystore -alias eleva -keyalg RSA -keysize 2048 -validity 10000
```
Copie `eleva.keystore` para `android\app\` e em `android\gradle.properties` coloque:
```
ELEVA_STORE_FILE=eleva.keystore
ELEVA_STORE_PASSWORD=sua_senha
ELEVA_KEY_ALIAS=eleva
ELEVA_KEY_PASSWORD=sua_senha
```
Em `android\app\build.gradle`, dentro de `android { }`, use essa assinatura no
release (signingConfigs.release com as 4 propriedades acima e
`buildTypes.release.signingConfig signingConfigs.release`). Depois:
```powershell
cd android
$env:EXPO_PUBLIC_API_URL="https://api.elevaone.store/api"
.\gradlew assembleRelease
```
APK: `android\app\build\outputs\apk\release\app-release.apk`

## Publicar uma versao
1. Aumente `android.versionCode` em `apps/mobile/app.json` (1, 2, 3...).
2. Gere o APK (A ou B).
3. Envie para a pasta `downloads` da landing (volume do EasyPanel
   `/usr/share/nginx/html/downloads`): o APK como `elevaone-latest.apk` e o
   `versao.json` com o novo `versionCode`.
Mudancas so de tela/JS nao precisam disso: vao por `eas update --channel preview`.
