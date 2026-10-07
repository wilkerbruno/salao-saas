import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

// Cliente avalia um salão (1 a 5 estrelas + comentário opcional).
// Avaliar de novo o mesmo salão atualiza a avaliação existente.
export class CreateAvaliacaoDto {
  @IsInt()
  @Min(1)
  @Max(5)
  nota: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentario?: string;
}
