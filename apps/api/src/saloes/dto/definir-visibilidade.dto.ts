import { IsBoolean } from "class-validator";

// Painel SaaS: liga/desliga o "modo teste" de um salão — ver
// Salao.visibilidadeRestrita no schema.
export class DefinirVisibilidadeDto {
  @IsBoolean()
  restrita: boolean;
}
