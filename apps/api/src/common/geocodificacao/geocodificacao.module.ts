import { Module } from "@nestjs/common";
import { GeocodificacaoService } from "./geocodificacao.service";

// Não precisa importar PrismaModule aqui — ele é @Global() (ver
// prisma/prisma.module.ts), então PrismaService já está disponível pra
// injetar em GeocodificacaoService sem declarar a dependência explicitamente.
@Module({
  providers: [GeocodificacaoService],
  exports: [GeocodificacaoService],
})
export class GeocodificacaoModule {}
