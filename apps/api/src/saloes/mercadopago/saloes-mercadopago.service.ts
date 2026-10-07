import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { StatusConexaoMercadoPago } from "@salao-saas/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { MercadoPagoService } from "../../pagamentos/mercadopago.service";

// Esquema do app nativo (ver apps/mobile/app.json "scheme") — é pra cá que o
// callback abaixo (processarCallback) manda o navegador de volta quando quem
// iniciou a conexão foi o app instalado (Android/iOS). Na versão Web, o
// destino final é outro — ver EstadoConexaoMp.origemWeb logo abaixo.
const APP_SCHEME_REDIRECT = "salaosaas://mercadopago-conectado";

// Dados que precisam sobreviver à ida-e-volta do OAuth do Mercado Pago, lidos
// de volta no callback através do parâmetro "state" (ver assinarEstado/
// validarEDecodificarEstado). "plataforma" decide se o callback devolve o
// navegador pro app nativo (deep link) ou pra uma aba da versão Web — nesse
// segundo caso, "origemWeb" é ONDE: a origem (protocolo+domínio) de onde o
// pedido de conexão partiu, já validada contra uma lista de origens
// permitidas (ver validarOrigemWeb) pra ninguém conseguir montar esse link
// apontando pra um domínio de phishing.
interface EstadoConexaoMp {
  salaoId: string;
  plataforma: "nativo" | "web";
  origemWeb?: string;
}

// Conexão da CONTA MERCADO PAGO DE CADA SALÃO (modelo marketplace — ver
// o comentário grande em MercadoPagoService). O dono autoriza uma vez (OAuth)
// e a partir daí os pagamentos dos clientes desse salão caem direto na
// conta dela.
//
// Funciona tanto pelo app instalado quanto pela versão Web (ver
// ConectarMercadoPagoScreen no app): nos dois casos o Mercado Pago sempre
// volta pro MESMO redirect_uri cadastrado na aplicação (esse "callback" logo
// abaixo — MERCADOPAGO_OAUTH_REDIRECT_URI, nunca muda); a diferença é só pra
// onde ESSE callback manda o navegador depois, e isso é decidido pelo
// "state" que a gente mesmo assina ao gerar o link (gerarUrlConexao).
@Injectable()
export class SaloesMercadoPagoService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mercadoPago: MercadoPagoService,
  ) {}

  private assinarEstado(estado: EstadoConexaoMp): string {
    const segredo = this.config.get<string>("JWT_SECRET") ?? "dev-secret";
    const payload = Buffer.from(JSON.stringify(estado)).toString("base64url");
    const hmac = crypto.createHmac("sha256", segredo).update(payload).digest("hex");
    return `${payload}.${hmac}`;
  }

  private validarEDecodificarEstado(state: string | undefined): EstadoConexaoMp {
    if (!state || !state.includes(".")) throw new BadRequestException("Link de conexão inválido ou expirado.");
    const indice = state.lastIndexOf(".");
    const payload = state.slice(0, indice);
    const hmacRecebido = state.slice(indice + 1);
    const segredo = this.config.get<string>("JWT_SECRET") ?? "dev-secret";
    const hmacEsperado = crypto.createHmac("sha256", segredo).update(payload).digest("hex");
    if (hmacRecebido !== hmacEsperado) throw new BadRequestException("Link de conexão inválido ou expirado.");
    try {
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      throw new BadRequestException("Link de conexão inválido ou expirado.");
    }
  }

  // Só aceita como origem de retorno uma das cadastradas em
  // MERCADOPAGO_WEB_ORIGENS_PERMITIDAS (ver .env.example) — nunca uma vinda
  // do cliente sem checagem, senão qualquer um poderia montar essa URL
  // apontando o redirect final pra um domínio de phishing.
  private validarOrigemWeb(origemWeb: string | undefined): string {
    if (!origemWeb) throw new BadRequestException("Origem da conexão (origemWeb) não informada.");
    const normalizada = origemWeb.replace(/\/+$/, "");
    const permitidas = (this.config.get<string>("MERCADOPAGO_WEB_ORIGENS_PERMITIDAS") ?? "")
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean);
    if (!permitidas.includes(normalizada)) {
      throw new BadRequestException("Essa origem não está autorizada a conectar o Mercado Pago.");
    }
    return normalizada;
  }

  gerarUrlConexao(salaoId: string, plataforma: "nativo" | "web", origemWeb?: string): { url: string } {
    const origemValidada = plataforma === "web" ? this.validarOrigemWeb(origemWeb) : undefined;
    const state = this.assinarEstado({ salaoId, plataforma, origemWeb: origemValidada });
    return { url: this.mercadoPago.gerarUrlAutorizacao(state) };
  }

  async status(salaoId: string): Promise<StatusConexaoMercadoPago> {
    const salao = await this.prisma.salao.findUnique({
      where: { id: salaoId },
      select: { mercadoPagoAccessToken: true, mercadoPagoConectadoEm: true },
    });
    return {
      conectado: !!salao?.mercadoPagoAccessToken,
      conectadoEm: salao?.mercadoPagoConectadoEm?.toISOString() ?? null,
    };
  }

  // Dono desconecta (ex: quer trocar de conta Mercado Pago). Não cancela
  // cobranças em andamento — só impede novas cobranças até reconectar.
  async desconectar(salaoId: string): Promise<void> {
    await this.prisma.salao.update({
      where: { id: salaoId },
      data: {
        mercadoPagoAccessToken: null,
        mercadoPagoRefreshToken: null,
        mercadoPagoUserId: null,
        mercadoPagoPublicKey: null,
        mercadoPagoTokenExpiraEm: null,
        mercadoPagoConectadoEm: null,
      },
    });
  }

  // Chamado pelo callback público (o navegador do dono é redirecionado pra cá
  // pelo próprio Mercado Pago depois de autorizar). Nunca lança erro — sempre
  // devolve um `redirectFinal` pronto pro controller usar, já que mesmo numa
  // falha o navegador do dono precisa ir pra algum lugar (não dá pra deixar
  // ele preso numa chamada de API que ele nunca vai ver o resultado).
  async processarCallback(
    code: string | undefined,
    state: string | undefined,
  ): Promise<{ sucesso: boolean; mensagem: string; redirectFinal: string }> {
    let estado: EstadoConexaoMp;
    try {
      estado = this.validarEDecodificarEstado(state);
    } catch {
      // Link malformado/adulterado — não dá nem pra saber se era a versão Web
      // ou o app nativo, então cai no destino padrão (deep link do app) só
      // pra não deixar a página sem nenhum lugar pra ir.
      return { sucesso: false, mensagem: "Link de conexão inválido ou expirado.", redirectFinal: `${APP_SCHEME_REDIRECT}?sucesso=0` };
    }

    const redirectBase =
      estado.plataforma === "web" && estado.origemWeb ? `${estado.origemWeb}/mercadopago-conectado` : APP_SCHEME_REDIRECT;

    if (!code) {
      return { sucesso: false, mensagem: "Autorização cancelada ou incompleta.", redirectFinal: `${redirectBase}?sucesso=0` };
    }

    try {
      const salao = await this.prisma.salao.findUnique({ where: { id: estado.salaoId } });
      if (!salao) throw new Error("Salão não encontrado.");

      const tokens = await this.mercadoPago.trocarCodigoPorToken(code);
      await this.prisma.salao.update({
        where: { id: estado.salaoId },
        data: {
          mercadoPagoAccessToken: tokens.accessToken,
          mercadoPagoRefreshToken: tokens.refreshToken,
          mercadoPagoUserId: tokens.userId,
          mercadoPagoPublicKey: tokens.publicKey,
          mercadoPagoTokenExpiraEm: tokens.expiraEm,
          mercadoPagoConectadoEm: new Date(),
        },
      });
      return {
        sucesso: true,
        mensagem: "Conta Mercado Pago conectada com sucesso!",
        redirectFinal: `${redirectBase}?sucesso=1`,
      };
    } catch (e: any) {
      return {
        sucesso: false,
        mensagem: e?.message ?? "Não foi possível concluir a conexão.",
        redirectFinal: `${redirectBase}?sucesso=0`,
      };
    }
  }
}
