#!/usr/bin/env bash
set -e

# Gera o APK do Eleva One no WSL, sobe sozinho o versionCode e prepara a
# pasta de publicacao (APK + versao.json) para a atualizacao automatica.
# Uso (no WSL):  bash build-apk.sh

REPO=/mnt/c/Users/wilke/Downloads/salao-saas-git
cd "$REPO"
echo "==> Repo: $(pwd)"

git pull origin main || true
pnpm install

# --- versao automatica: +1 no versionCode a cada build -----------------
APPJSON=apps/mobile/app.json
VERSAO_ANTERIOR=$(node -e "console.log(require('./$APPJSON').expo.android.versionCode)")
VERSAO=$((VERSAO_ANTERIOR + 1))
sed -i -E "s/(\"versionCode\":[[:space:]]*)[0-9]+/\1$VERSAO/" "$APPJSON"
NOME_VERSAO=$(node -e "console.log(require('./$APPJSON').expo.version)")
echo "==> versionCode: $VERSAO_ANTERIOR -> $VERSAO (versao $NOME_VERSAO)"

# guarda o novo numero no GitHub (assim o proximo build, em qualquer
# maquina, continua a contagem)
git add "$APPJSON"
git commit -m "APK: versionCode $VERSAO" || true
git push origin HEAD:main || echo "AVISO: nao deu push do versionCode; rode 'git push' depois."

# limpa a pasta android pra regenerar do zero com os icones/config atuais
rm -rf apps/mobile/android

# restringe a 1 arquitetura (evita o erro de "sem espaco em disco")
export ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a

cd apps/mobile
eas build --local --platform android --profile preview

APK="$(ls -t build-*.apk | head -1)"
echo "==> APK gerado: $APK"

# --- pasta de publicacao ------------------------------------------------
PUB="$REPO/publicar"
mkdir -p "$PUB"
cp "$APK" "$PUB/elevaone-latest.apk"
cat > "$PUB/versao.json" <<JSON
{ "versionCode": $VERSAO, "versionName": "$NOME_VERSAO", "apkUrl": "https://elevaone.store/downloads/elevaone-latest.apk" }
JSON
ls -t build-*.apk | tail -n +2 | xargs -r rm -f

# copia pra area de trabalho do Windows
for d in /mnt/c/Users/wilke/Desktop /mnt/c/Users/wilke/OneDrive/Desktop; do
  if [ -d "$d" ]; then
    cp "$APK" "$d/ElevaOne.apk"
    rm -rf "$d/ElevaOne-publicar"; cp -r "$PUB" "$d/ElevaOne-publicar"
    echo "==> Copiado para $d (ElevaOne.apk e pasta ElevaOne-publicar)"
  fi
done

echo
echo "==> PRONTO. Para os celulares se atualizarem sozinhos, suba os 2 arquivos"
echo "    da pasta 'ElevaOne-publicar' (elevaone-latest.apk e versao.json) para o"
echo "    volume /usr/share/nginx/html/downloads da landing no EasyPanel."
