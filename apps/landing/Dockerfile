# Site de apresentação do Eleva One (elevaone.store, domínio raiz) — página
# estática simples, sem build (nenhuma dependência de Node/pnpm), só HTML/CSS/
# JS direto. No EasyPanel, ao criar o serviço:
#   - Build method: Dockerfile
#   - Build context / Root directory: a raiz do repositório
#   - Dockerfile path: apps/landing/Dockerfile
#   - Domínio: elevaone.store (e www.elevaone.store, se quiser)
#   - Porta do container: 80
FROM nginx:alpine
COPY apps/landing/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/landing/public /usr/share/nginx/html
# O .apk fica FORA da imagem: no EasyPanel crie um Volume/Mount
#   /usr/share/nginx/html/downloads  (assim o deploy da landing nao apaga o apk)
# e envie elevaone-latest.apk + versao.json pra la.
EXPOSE 80
