# Site de apresentação do Eleva One (elevaone.store, domínio raiz) — página
# estática simples, sem build (nenhuma dependência de Node/pnpm), só HTML/CSS/
# JS direto. No EasyPanel, ao criar o serviço:
#   - Build method: Dockerfile
#   - Build context / Root directory: a raiz do repositório
#   - Dockerfile path: apps/landing/Dockerfile
#   - Domínio: elevaone.store (e www.elevaone.store, se quiser)
#   - Porta do container: 80
FROM nginx:alpine
COPY apps/landing/public /usr/share/nginx/html
EXPOSE 80
