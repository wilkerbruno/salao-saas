import { Module } from "@nestjs/common";
import { SaloesController } from "./saloes.controller";
import { SaloesService } from "./saloes.service";
import { AgendamentosModule } from "../agendamentos/agendamentos.module";
import { PagamentosModule } from "../pagamentos/pagamentos.module";
import { ConfiguracoesModule } from "../configuracoes/configuracoes.module";
import { GeocodificacaoModule } from "../common/geocodificacao/geocodificacao.module";
import { SaloesMercadoPagoController } from "./mercadopago/saloes-mercadopago.controller";
import { SaloesMercadoPagoService } from "./mercadopago/saloes-mercadopago.service";

@Module({
  // Precisa do AgendamentosService pra expor dias/horários disponíveis sob
  // /saloes/:id/... (fica mais natural pro app do que sob /agendamentos/...).
  // PagamentosModule pelo MercadoPagoService, usado na conexão OAuth da conta
  // Mercado Pago de cada salão (ver ./mercadopago). ConfiguracoesModule
  // pra saber a carência configurada (listarProximas esconde salão
  // vencida há mais que isso — ver assinatura-status.util). GeocodificacaoModule
  // pro fallback de localização por endereço (ver comCoordenadasResolvidas em
  // SaloesService).
  imports: [AgendamentosModule, PagamentosModule, ConfiguracoesModule, GeocodificacaoModule],
  controllers: [SaloesController, SaloesMercadoPagoController],
  providers: [SaloesService, SaloesMercadoPagoService],
})
export class SaloesModule {}
