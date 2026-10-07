import { IsIn, IsInt, IsOptional, IsPositive, IsString, Min } from "class-validator";
import { CategoriaServico } from "@salao-saas/shared";

export class CreateServicoDto {
  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsInt()
  @Min(5)
  duracaoMinutos: number;

  // Preço em centavos (evita erro de arredondamento com float). Ex: R$ 45,00 = 4500.
  @IsInt()
  @IsPositive()
  precoCentavos: number;

  // Área do serviço (cabelo, unha...). Omitido = CABELO (default do schema).
  // Define quais profissionais podem fazê-lo (ver Funcionario.especialidades).
  @IsOptional()
  @IsIn(Object.values(CategoriaServico))
  categoria?: CategoriaServico;
}
