import { Controller, ForbiddenException, Get, Patch, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Papel } from "@salao-saas/shared";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../auth/jwt.strategy";
import { SaloesMercadoPagoService } from "./saloes-mercadopago.service";

@Controller("saloes/mercadopago")
export class SaloesMercadoPagoController {
  constructor(private service: SaloesMercadoPagoService) {}

  // "plataforma" vem do app (ver ConectarMercadoPagoScreen): "web" na versão
  // Expo Web (manda também "origemWeb", a origem de onde partiu o pedido —
  // ver validarOrigemWeb no service) ou ausente/qualquer outra coisa pro app
  // nativo. Isso é só o que decide pra onde o callback abaixo manda o
  // navegador de volta no final — o resto do fluxo OAuth é idêntico nos dois
  // casos.
  @Roles(Papel.SALAO_ADMIN)
  @Get("conectar")
  conectar(
    @Query("plataforma") plataforma: string | undefined,
    @Query("origemWeb") origemWeb: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.service.gerarUrlConexao(user.salaoId, plataforma === "web" ? "web" : "nativo", origemWeb);
  }

  @Roles(Papel.SALAO_ADMIN)
  @Get("status")
  status(@CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.service.status(user.salaoId);
  }

  @Roles(Papel.SALAO_ADMIN)
  @Patch("desconectar")
  desconectar(@CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.service.desconectar(user.salaoId);
  }

  // O Mercado Pago redireciona o NAVEGADOR do dono pra cá depois do OAuth
  // (não é chamado pelo app diretamente) — por isso é público e devolve HTML,
  // não JSON. O service já decide pra onde mandar o navegador em seguida
  // (redirectFinal): deep link do app nativo, ou de volta pra uma aba da
  // versão Web — ver o comentário grande em SaloesMercadoPagoService e em
  // ConectarMercadoPagoScreen/MercadoPagoConectadoWebScreen no app.
  @Public()
  @Get("callback")
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Res() res: Response) {
    const resultado = await this.service.processarCallback(code, state);

    res
      .status(200)
      .type("html")
      .send(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Mercado Pago</title>
<style>
  body { font-family: -apple-system, Roboto, sans-serif; background:#E6B4B4; color:#4B3A31; text-align:center; padding-top:72px; }
  h2 { color: ${resultado.sucesso ? "#3F8F62" : "#C4493F"}; }
  a { color:#A8782A; }
</style>
</head>
<body>
  <h2>${resultado.sucesso ? "Conta conectada!" : "Não foi possível conectar"}</h2>
  <p>${resultado.mensagem}</p>
  <p>Voltando…</p>
  <p><a href="${resultado.redirectFinal}">Toque aqui se não voltar automaticamente</a></p>
  <script>window.location.replace(${JSON.stringify(resultado.redirectFinal)});</script>
</body>
</html>`);
  }
}
