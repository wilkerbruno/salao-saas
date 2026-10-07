import { Controller, ForbiddenException, Get, Query } from "@nestjs/common";
import { Papel } from "@salao-saas/shared";
import { FinanceiroService } from "./financeiro.service";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("financeiro")
export class FinanceiroController {
  constructor(private financeiroService: FinanceiroService) {}

  @Roles(Papel.FUNCIONARIO)
  @Get("meu-resumo")
  meuResumo(@CurrentUser() user: AuthUser, @Query("periodo") periodo: "hoje" | "semana" | "mes" = "semana") {
    return this.financeiroService.resumoFuncionario(user.id, periodo);
  }

  @Roles(Papel.SALAO_ADMIN)
  @Get("resumo-salao")
  resumoSalao(@CurrentUser() user: AuthUser, @Query("periodo") periodo: "hoje" | "semana" | "mes" = "semana") {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.financeiroService.resumoSalao(user.salaoId, periodo);
  }
}
