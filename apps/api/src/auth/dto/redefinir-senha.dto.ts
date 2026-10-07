import { IsString, MinLength } from "class-validator";

export class RedefinirSenhaDto {
  // Emitido por AuthService.validarCodigoRecuperacao depois que o código é
  // confirmado — não é o JWT de sessão normal (ver "tipo" dentro do payload).
  @IsString()
  resetToken: string;

  @IsString()
  @MinLength(8, { message: "A nova senha precisa ter no mínimo 8 caracteres." })
  novaSenha: string;
}
