import { IsEmail, IsString, Length } from "class-validator";

export class ValidarCodigoRecuperacaoDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6, { message: "O código tem 6 dígitos." })
  codigo: string;
}
