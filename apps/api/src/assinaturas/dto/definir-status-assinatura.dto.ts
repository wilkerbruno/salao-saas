import { IsIn } from "class-validator";
import { StatusAssinatura } from "@salao-saas/shared";

// Usado pelo SAAS_ADMIN pra suspender/reativar manualmente a assinatura de
// um salão (ex: inadimplência tratada fora do gateway, cortesia, etc).
export class DefinirStatusAssinaturaDto {
  @IsIn(Object.values(StatusAssinatura))
  status: StatusAssinatura;
}
