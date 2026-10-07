import { IsBoolean, IsEmail, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { EnderecoDto } from "../../common/dto/endereco.dto";

// Onboarding de um novo salão no SaaS: cria o tenant (Salão) +
// o usuário dono (papel SALAO_ADMIN) + assinatura em TRIAL no plano informado.
export class RegisterSalaoDto {
  @IsString()
  nomeSalao: string;

  @IsString()
  nomeDono: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  senha: string;

  // Vira tanto o telefone pessoal do dono (Usuario.telefone) quanto o
  // telefone de contato do salão (Salao.telefone, mostrado pro
  // cliente no botão "Ligar para o salão" — ver AuthService.registerSalao).
  @IsString()
  @MinLength(8)
  telefone: string;

  // Endereço completo do ESTABELECIMENTO (CEP + campos separados — Salão
  // .endereco/.cep/.logradouro/...) — diferente da localização por GPS
  // (latitude/longitude, capturada depois em "Mais > Localização"). Visível
  // pro cliente (é o endereço que ele usa pra achar o salão), ver
  // SELECT_PUBLICO em SaloesService.
  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco: EnderecoDto;

  @IsString()
  planoId: string;

  // Cria junto um catálogo de exemplo (serviços de cabelo e unha + um combo)
  // pra o salão já poder receber agendamentos. Omitido = true; passe false
  // pra começar com a lista vazia.
  @IsOptional()
  @IsBoolean()
  criarCatalogoInicial?: boolean;
}
