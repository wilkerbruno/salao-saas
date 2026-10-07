import { IsLatitude, IsLongitude, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { EnderecoDto } from "../../common/dto/endereco.dto";

export class UpdateSalaoDto {
  @IsOptional()
  @IsString()
  nome?: string;

  // Endereço do estabelecimento (CEP + campos separados) — ver
  // EnderecoDto/EnderecoUtil. Opcional aqui (edição posterior); obrigatório
  // no cadastro inicial (RegisterSalaoDto).
  @IsOptional()
  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco?: EnderecoDto;

  @IsOptional()
  @IsString()
  telefone?: string;

  // Preenchidos pela tela "Mais > Localização" do app (captura o GPS do
  // celular de quem está logado como dono do salão).
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
