import { Body, Controller, Delete, ForbiddenException, Get, Param, Post } from "@nestjs/common";
import { Papel } from "@salao-saas/shared";
import { AssinaturasCartoesService } from "./assinaturas-cartoes.service";
import { SalvarCartaoAssinaturaDto } from "./dto/salvar-cartao-assinatura.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { PermitirAssinaturaBloqueada } from "../common/decorators/permitir-assinatura-bloqueada.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

// Cartões salvos pelo DONO do salão pra pagar a própria mensalidade do
// SaaS — ver AssinaturasCartoesService. @PermitirAssinaturaBloqueada em todas
// as rotas: precisa funcionar mesmo com o salão bloqueado (é exatamente
// quando o dono mais precisa pagar).
@Controller("assinaturas/minha/cartoes")
export class AssinaturasCartoesController {
  constructor(private cartoesService: AssinaturasCartoesService) {}

  @Roles(Papel.SALAO_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Get()
  listar(@CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.cartoesService.listar(user.salaoId);
  }

  @Roles(Papel.SALAO_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Post()
  salvar(@Body() dto: SalvarCartaoAssinaturaDto, @CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.cartoesService.salvar(user.salaoId, user.id, dto.cartaoToken, dto.bin);
  }

  @Roles(Papel.SALAO_ADMIN)
  @PermitirAssinaturaBloqueada()
  @Delete(":id")
  remover(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.cartoesService.remover(user.salaoId, id);
  }
}
