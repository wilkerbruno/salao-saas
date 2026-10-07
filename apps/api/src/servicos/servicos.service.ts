import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateServicoDto } from "./dto/create-servico.dto";
import { UpdateServicoDto } from "./dto/update-servico.dto";
import { CreatePacoteDto } from "./dto/create-pacote.dto";
import { UpdatePacoteDto } from "./dto/update-pacote.dto";

@Injectable()
export class ServicosService {
  constructor(private prisma: PrismaService) {}

  // ---------- Catálogo público (usado pelo app do cliente) ----------

  listarServicosDaSalao(salaoId: string) {
    return this.prisma.servico.findMany({
      where: { salaoId, ativo: true },
      orderBy: [{ categoria: "asc" }, { nome: "asc" }],
    });
  }

  listarPacotesDaSalao(salaoId: string) {
    return this.prisma.pacote.findMany({
      where: { salaoId, ativo: true },
      include: { servicos: { include: { servico: true } } },
      orderBy: { nome: "asc" },
    });
  }

  // ---------- Gestão (SALAO_ADMIN) ----------

  criarServico(salaoId: string, dto: CreateServicoDto) {
    return this.prisma.servico.create({ data: { ...dto, salaoId } });
  }

  async atualizarServico(id: string, salaoId: string, dto: UpdateServicoDto) {
    await this.garantirServicoDaSalao(id, salaoId);
    return this.prisma.servico.update({ where: { id }, data: dto });
  }

  async removerServico(id: string, salaoId: string) {
    await this.garantirServicoDaSalao(id, salaoId);
    // Soft delete: mantém histórico de agendamentos que referenciam este serviço.
    return this.prisma.servico.update({ where: { id }, data: { ativo: false } });
  }

  async criarPacote(salaoId: string, dto: CreatePacoteDto) {
    const { servicoIds, ...dados } = dto;
    return this.prisma.pacote.create({
      data: {
        ...dados,
        salaoId,
        servicos: { create: servicoIds.map((servicoId) => ({ servicoId })) },
      },
      include: { servicos: { include: { servico: true } } },
    });
  }

  async atualizarPacote(id: string, salaoId: string, dto: UpdatePacoteDto) {
    await this.garantirPacoteDaSalao(id, salaoId);
    const { servicoIds, ...dados } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (servicoIds) {
        await tx.pacoteServico.deleteMany({ where: { pacoteId: id } });
        await tx.pacoteServico.createMany({
          data: servicoIds.map((servicoId) => ({ pacoteId: id, servicoId })),
        });
      }
      return tx.pacote.update({
        where: { id },
        data: dados,
        include: { servicos: { include: { servico: true } } },
      });
    });
  }

  async removerPacote(id: string, salaoId: string) {
    await this.garantirPacoteDaSalao(id, salaoId);
    return this.prisma.pacote.update({ where: { id }, data: { ativo: false } });
  }

  private async garantirServicoDaSalao(id: string, salaoId: string) {
    const servico = await this.prisma.servico.findUnique({ where: { id } });
    if (!servico) throw new NotFoundException("Serviço não encontrado.");
    if (servico.salaoId !== salaoId) throw new ForbiddenException("Serviço não pertence ao seu salão.");
  }

  private async garantirPacoteDaSalao(id: string, salaoId: string) {
    const pacote = await this.prisma.pacote.findUnique({ where: { id } });
    if (!pacote) throw new NotFoundException("Pacote não encontrado.");
    if (pacote.salaoId !== salaoId) throw new ForbiddenException("Pacote não pertence ao seu salão.");
  }
}
