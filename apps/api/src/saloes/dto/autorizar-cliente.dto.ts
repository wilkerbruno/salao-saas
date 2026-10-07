import { IsEmail } from "class-validator";

// Painel SaaS: autoriza um cliente (pelo e-mail da conta) a ver um salão
// em "modo teste" (visibilidadeRestrita=true) na busca — ver
// SalaoClienteAutorizado no schema.
export class AutorizarClienteDto {
  @IsEmail()
  email: string;
}
