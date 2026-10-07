import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsObject, IsOptional, IsString, ValidateIf, ValidateNested } from "class-validator";
import { MetodoPagamento } from "@salao-saas/shared";

class ItemAgendamentoManualDto {
  @ValidateIf((dto) => !dto.pacoteId)
  @IsString()
  servicoId?: string;

  @ValidateIf((dto) => !dto.servicoId)
  @IsString()
  pacoteId?: string;

  // Profissional escolhida PRA ESTE ITEM (ex: a cabeleireira pro corte, a
  // manicure pras unhas, no mesmo agendamento). Opcional: sem ela, o servidor
  // escolhe uma profissional livre que atenda a categoria do serviço.
  @IsOptional()
  @IsString()
  funcionarioId?: string;
}

// Corpo de POST /agendamentos/manual — o próprio salão lança um horário
// na agenda (cliente que ligou/chegou sem usar o app, ex: cliente avulso sem
// conta). Não passa por pagamento pelo app (ver AgendamentosService.criarManual).
export class CreateAgendamentoManualDto {
  @IsString()
  funcionarioId: string;

  @IsDateString()
  inicio: string;

  // Mesma ideia do lote do cliente: profissional por categoria (ex: cabelo com
  // a Ana, unha com a Bia) pros itens que não trazem `funcionarioId` próprio.
  @IsOptional()
  @IsObject()
  funcionariosPorCategoria?: Record<string, string>;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemAgendamentoManualDto)
  itens: ItemAgendamentoManualDto[];

  // Cliente já cadastrado no app OU nome/telefone de alguém sem conta — um
  // dos dois é obrigatório (ver validação em AgendamentosService.criarManual).
  @IsOptional()
  @IsString()
  clienteId?: string;

  @IsOptional()
  @IsString()
  clienteAvulsoNome?: string;

  @IsOptional()
  @IsString()
  clienteAvulsoTelefone?: string;

  // Como o salão recebeu por fora (dinheiro na mão, Pix fora do app,
  // cartão na própria maquininha) — não passa pelo Mercado Pago da
  // integração, só fica registrado pro Financeiro separar os 3 cards
  // (Pix/Cartão/Dinheiro). Omitido = Dinheiro (ver AgendamentosService.criarManual).
  @IsOptional()
  @IsEnum(MetodoPagamento)
  metodoPagamento?: MetodoPagamento;
}
