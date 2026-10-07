import { Module } from "@nestjs/common";
import { AgendamentosController } from "./agendamentos.controller";
import { AgendamentosService } from "./agendamentos.service";
import { PagamentosModule } from "../pagamentos/pagamentos.module";
import { ConfiguracoesModule } from "../configuracoes/configuracoes.module";
import { PushModule } from "../push/push.module";

@Module({
  // PagamentosModule pelo MercadoPagoService, usado pra cobrar o cliente na
  // conta do salão (Pix/Cartão) e pra estornar a multa de não comparecimento.
  // ConfiguracoesModule pra saber a carência configurada (ver
  // garantirSalaoDisponivelParaAgendamento). PushModule pro lembrete de
  // dinheiro pendente (ver avisarPagamentosDinheiroNoHorario).
  imports: [PagamentosModule, ConfiguracoesModule, PushModule],
  controllers: [AgendamentosController],
  providers: [AgendamentosService],
  // SaloesModule usa isso para expor os endpoints de disponibilidade
  // (dias/horários livres) sob /saloes/:id/... .
  exports: [AgendamentosService],
})
export class AgendamentosModule {}
