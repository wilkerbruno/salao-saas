import { Module } from "@nestjs/common";
import { PacotesMensaisController } from "./pacotes-mensais.controller";
import { PacotesMensaisService } from "./pacotes-mensais.service";
import { PagamentosModule } from "../pagamentos/pagamentos.module";

@Module({
  // PagamentosModule pelo MercadoPagoService — a assinatura recorrente do
  // pacote mensal usa o mesmo Preapproval do resto (ver PacotesMensaisService).
  imports: [PagamentosModule],
  controllers: [PacotesMensaisController],
  providers: [PacotesMensaisService],
  exports: [PacotesMensaisService],
})
export class PacotesMensaisModule {}
