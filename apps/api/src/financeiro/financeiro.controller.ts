import { Controller, ForbiddenException, Get, Query } from "@nestjs/common";
import { Papel } from "@salao-saas/shared";
import { FinanceiroService } from "./financeiro.service";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("financeiro")
export class FinanceiroController {
  constructor(private financeiroService: FinanceiroService) {}

  @Roles(Papel.FUNCIONARIO, Papel.SALAO_ADMIN)
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

  // O plano do salão inclui "Gerar relatório"? (o app só mostra o botão se sim)
  @Roles(Papel.FUNCIONARIO, Papel.SALAO_ADMIN)
  @Get("relatorios-disponiveis")
  async relatoriosDisponiveis(@CurrentUser() user: AuthUser) {
    if (!user.salaoId) return { habilitado: false };
    return { habilitado: await this.financeiroService.relatoriosDisponiveis(user.salaoId) };
  }

  // Relatório do próprio profissional (funcionário ou dono que também atende).
  @Roles(Papel.FUNCIONARIO, Papel.SALAO_ADMIN)
  @Get("meu-relatorio")
  meuRelatorio(@CurrentUser() user: AuthUser, @Query("de") de?: string, @Query("ate") ate?: string) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.financeiroService.relatorioFuncionario(user.id, user.salaoId, de, ate);
  }

  // Relatório geral (todos os profissionais) — só o dono.
  @Roles(Papel.SALAO_ADMIN)
  @Get("relatorio-salao")
  relatorioSalao(@CurrentUser() user: AuthUser, @Query("de") de?: string, @Query("ate") ate?: string) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.financeiroService.relatorioSalao(user.salaoId, de, ate);
  }
}
