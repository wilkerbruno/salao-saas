# Produção: elevaone.store (EasyPanel)

Todos os serviços usam o repositório `wilkerbruno/salao-saas`, branch `main`,
**build context = raiz do repositório**.

| Serviço | Domínio | Dockerfile | Porta do container | Variáveis |
|---|---|---|---|---|
| Landing | `elevaone.store` (e `www.`) | `apps/landing/Dockerfile` | 80 | nenhuma |
| API | `api.elevaone.store` | `apps/api/Dockerfile` | 3000 | runtime (abaixo) |
| Painel SaaS | `painel.elevaone.store` | `apps/admin-web/Dockerfile` | 3001 | build: `NEXT_PUBLIC_API_URL` |
| Web do cliente | `app.elevaone.store` | `apps/mobile/Dockerfile.web` | 3002 | build: `EXPO_PUBLIC_API_URL` |
| MySQL | só rede interna | (serviço do EasyPanel) | 3306 | `DATABASE_URL` da API |

No EasyPanel, em cada serviço > Domínios: HTTPS ligado e a **porta** da tabela.

## API (variáveis de ambiente de runtime)

```env
PORT=3000
DATABASE_URL="mysql://USUARIO:SENHA@NOME-INTERNO-DO-MYSQL:3306/BANCO"
JWT_SECRET="(openssl rand -base64 48)"
JWT_EXPIRES_IN="7d"

SAAS_ADMIN_EMAIL="seu-email"
SAAS_ADMIN_SENHA="senha-forte"

CORS_ORIGINS="https://app.elevaone.store,https://painel.elevaone.store"

MERCADOPAGO_ACCESS_TOKEN="(conta da plataforma, cobra a mensalidade)"
MERCADOPAGO_PUBLIC_KEY="(chave pública da aplicação)"
MERCADOPAGO_WEBHOOK_SECRET="(assinatura secreta do webhook)"
MERCADOPAGO_CLIENT_ID="(aplicação, OAuth)"
MERCADOPAGO_CLIENT_SECRET="(aplicação, OAuth)"
MERCADOPAGO_OAUTH_REDIRECT_URI="https://api.elevaone.store/api/saloes/mercadopago/callback"
MERCADOPAGO_BACK_URL="https://painel.elevaone.store/pagamento-confirmado"
MERCADOPAGO_WEB_ORIGENS_PERMITIDAS="https://app.elevaone.store"

SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="seuemail@gmail.com"
SMTP_PASS="(senha de app)"
SMTP_FROM='"Eleva One" <seuemail@gmail.com>'
```

No painel do Mercado Pago, na sua aplicação:
- Redirect URI (OAuth): `https://api.elevaone.store/api/saloes/mercadopago/callback`
- URL do webhook: `https://api.elevaone.store/api/webhooks/pagamento`

## Painel SaaS (Build variables, não só runtime)

```env
NEXT_PUBLIC_API_URL=https://api.elevaone.store/api
```

## Web do cliente (Build variables, não só runtime)

```env
EXPO_PUBLIC_API_URL=https://api.elevaone.store/api
```

## APK (EAS)

`apps/mobile/eas.json` já aponta para `https://api.elevaone.store/api`. Antes do
primeiro build: `cd apps/mobile && eas init` (gera o projectId do app).
A atualização do APK lê `https://elevaone.store/downloads/versao.json`; os
arquivos de `downloads/` precisam ser servidos na landing (volume montado em
`/usr/share/nginx/html/downloads`).

## Conferência rápida

- `https://api.elevaone.store/api` responde (qualquer resposta da API, mesmo 404 em JSON).
- `https://painel.elevaone.store/login` abre e loga com `SAAS_ADMIN_EMAIL`.
- `https://app.elevaone.store` abre o app do cliente.
- Trocou a URL da API depois? Painel e web do cliente precisam de **rebuild**.
