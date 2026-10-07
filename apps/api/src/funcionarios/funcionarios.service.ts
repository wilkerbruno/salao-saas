import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import sharp from "sharp";
import { Papel } from "@salao-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFuncionarioDto } from "./dto/create-funcionario.dto";
import { UpdateFuncionarioDto } from "./dto/update-funcionario.dto";
import { DefinirHorariosDto } from "./dto/definir-horarios.dto";
import { CreateFolgaDto } from "./dto/create-folga.dto";
import { camposEndereco } from "../common/endereco.util";

// Tamanho máximo aceito pra foto enviada (antes de comprimir) — mesmo limite
// da logo do salão (ver SaloesService).
const TAMANHO_MAXIMO_FOTO_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class FuncionariosService {
  constructor(private prisma: PrismaService) {}

  // ---------- Gestão da equipe (SALAO_ADMIN) ----------

  listarDaSalao(salaoId: string) {
    return this.prisma.funcionario.findMany({
      where: { salaoId },
      // telefone: só o dono vê (é quem chama este método) — ver comentário em
      // FuncionarioDetalhado (packages/shared) e UsuariosService.atualizarMeuPerfil.
      include: { usuario: { select: { id: true, nome: true, email: true, telefone: true } } },
      orderBy: { usuario: { nome: "asc" } },
    });
  }

  // Cria o login do funcionário (Usuario) + o cadastro na equipe (Funcionario)
  // numa mesma transação. Respeita o limite de funcionários do plano da
  // salão (null = ilimitado) — é o "convite" de um novo membro da equipe.
  async criar(salaoId: string, dto: CreateFuncionarioDto) {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) throw new ConflictException("Já existe uma conta com este e-mail.");

    await this.garantirDentroDoLimiteDoPlano(salaoId);

    const senhaHash = await bcrypt.hash(dto.senha, 10);

    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          nome: dto.nome,
          email: dto.email,
          senhaHash,
          telefone: dto.telefone,
          // Endereço do funcionário (obrigatório no cadastro). ATENÇÃO:
          // nunca incluir `cep`/`logradouro`/`numero`/`complemento`/`bairro`/
          // `cidade`/`uf`/`endereco` nos `select`/`include` de usuario feitos
          // a partir daqui (listarDaSalao, o retorno deste método,
          // atualizar) — o dono do salão nunca pode ver o endereço do
          // funcionário, só o próprio funcionário (via "meu-perfil", que usa
          // SELECT_SEGURO em UsuariosService).
          ...camposEndereco(dto.endereco),
          papel: Papel.FUNCIONARIO,
          salaoId,
        },
      });

      return tx.funcionario.create({
        data: {
          usuarioId: usuario.id,
          salaoId,
          cargo: dto.cargo ?? "Profissional",
          comissaoPercentual: dto.comissaoPercentual ?? 60,
          especialidades: dto.especialidades ?? [],
        },
        include: { usuario: { select: { id: true, nome: true, email: true, telefone: true } } },
      });
    });
  }

  async atualizar(id: string, salaoId: string, dto: UpdateFuncionarioDto) {
    await this.garantirDaSalao(id, salaoId);

    // Reativar um funcionário desativado também respeita o limite do plano
    // (senão dava pra contornar o limite desativando/reativando gente).
    if (dto.ativo) {
      const funcionario = await this.prisma.funcionario.findUnique({ where: { id } });
      if (funcionario && !funcionario.ativo) {
        await this.garantirDentroDoLimiteDoPlano(salaoId);
      }
    }

    // telefone mora em Usuario, o resto (cargo/comissão/ativo/disponível) mora
    // em Funcionario — separa antes de gravar, cada um na sua tabela.
    const { telefone, ...dadosFuncionario } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (telefone !== undefined) {
        const funcionario = await tx.funcionario.findUniqueOrThrow({ where: { id } });
        await tx.usuario.update({ where: { id: funcionario.usuarioId }, data: { telefone } });
      }
      return tx.funcionario.update({
        where: { id },
        data: dadosFuncionario,
        include: { usuario: { select: { id: true, nome: true, email: true, telefone: true } } },
      });
    });
  }

  // Só o id do cadastro na equipe (Funcionario.id, diferente do id do
  // Usuario/login) — usado pra lançar um agendamento manual na própria
  // agenda (ver AgendamentosController.criarManual, que exige esse id).
  async buscarMeuId(usuarioId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    // especialidades: o app usa pra só oferecer, no lançamento manual, os
    // serviços das áreas em que ela atua (null/vazio = todas).
    return { id: funcionario.id, especialidades: funcionario.especialidades };
  }

  // ---------- Horário de trabalho (o próprio funcionário edita o seu) ----------

  async listarMeusHorarios(usuarioId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.listarHorariosPorFuncionarioId(funcionario.id);
  }

  // Substitui a semana inteira de uma vez (mais simples do que um CRUD dia a
  // dia — a tela do app manda os 7 dias juntos, só com os que ele trabalha).
  async definirMeusHorarios(usuarioId: string, dto: DefinirHorariosDto) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.definirHorariosPorFuncionarioId(funcionario.id, dto);
  }

  // ---------- Horário de trabalho (o dono do salão edita o de qualquer funcionário) ----------

  async listarHorariosDoFuncionario(funcionarioId: string, salaoId: string) {
    await this.garantirDaSalao(funcionarioId, salaoId);
    return this.listarHorariosPorFuncionarioId(funcionarioId);
  }

  async definirHorariosDoFuncionario(funcionarioId: string, salaoId: string, dto: DefinirHorariosDto) {
    await this.garantirDaSalao(funcionarioId, salaoId);
    return this.definirHorariosPorFuncionarioId(funcionarioId, dto);
  }

  // ---------- Folgas (o próprio funcionário edita as suas) ----------

  async listarMinhasFolgas(usuarioId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.listarFolgasPorFuncionarioId(funcionario.id);
  }

  async criarMinhaFolga(usuarioId: string, dto: CreateFolgaDto) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.criarFolgaPorFuncionarioId(funcionario.id, dto);
  }

  async removerMinhaFolga(usuarioId: string, folgaId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return this.removerFolgaPorFuncionarioId(funcionario.id, folgaId);
  }

  // ---------- Folgas (o dono do salão edita as de qualquer funcionário) ----------

  async listarFolgasDoFuncionario(funcionarioId: string, salaoId: string) {
    await this.garantirDaSalao(funcionarioId, salaoId);
    return this.listarFolgasPorFuncionarioId(funcionarioId);
  }

  async criarFolgaDoFuncionario(funcionarioId: string, salaoId: string, dto: CreateFolgaDto) {
    await this.garantirDaSalao(funcionarioId, salaoId);
    return this.criarFolgaPorFuncionarioId(funcionarioId, dto);
  }

  async removerFolgaDoFuncionario(funcionarioId: string, salaoId: string, folgaId: string) {
    await this.garantirDaSalao(funcionarioId, salaoId);
    return this.removerFolgaPorFuncionarioId(funcionarioId, folgaId);
  }

  // ---------- implementação comum (horários/folgas), por Funcionario.id ----------

  private async listarHorariosPorFuncionarioId(funcionarioId: string) {
    return this.prisma.horarioTrabalho.findMany({ where: { funcionarioId }, orderBy: { diaSemana: "asc" } });
  }

  private async definirHorariosPorFuncionarioId(funcionarioId: string, dto: DefinirHorariosDto) {
    for (const dia of dto.dias) {
      if (dia.horaFim <= dia.horaInicio) {
        throw new BadRequestException(`O horário final precisa ser depois do inicial (dia ${dia.diaSemana}).`);
      }
      const temAlmoco = dia.inicioAlmoco && dia.fimAlmoco;
      if (temAlmoco && (dia.inicioAlmoco! < dia.horaInicio || dia.fimAlmoco! > dia.horaFim || dia.fimAlmoco! <= dia.inicioAlmoco!)) {
        throw new BadRequestException(`O horário de almoço precisa estar dentro do expediente (dia ${dia.diaSemana}).`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.horarioTrabalho.deleteMany({ where: { funcionarioId } });
      if (dto.dias.length > 0) {
        await tx.horarioTrabalho.createMany({
          data: dto.dias.map((dia) => ({
            funcionarioId,
            diaSemana: dia.diaSemana,
            horaInicio: dia.horaInicio,
            horaFim: dia.horaFim,
            inicioAlmoco: dia.inicioAlmoco,
            fimAlmoco: dia.fimAlmoco,
          })),
        });
      }
    });

    return this.listarHorariosPorFuncionarioId(funcionarioId);
  }

  private async listarFolgasPorFuncionarioId(funcionarioId: string) {
    return this.prisma.folga.findMany({
      where: { funcionarioId, fim: { gte: new Date() } },
      orderBy: { inicio: "asc" },
    });
  }

  private async criarFolgaPorFuncionarioId(funcionarioId: string, dto: CreateFolgaDto) {
    const inicio = new Date(dto.inicio);
    const fim = new Date(dto.fim);
    if (fim <= inicio) throw new BadRequestException("O fim da folga precisa ser depois do início.");

    return this.prisma.folga.create({
      data: { funcionarioId, inicio, fim, motivo: dto.motivo },
    });
  }

  private async removerFolgaPorFuncionarioId(funcionarioId: string, folgaId: string) {
    const folga = await this.prisma.folga.findUnique({ where: { id: folgaId } });
    if (!folga || folga.funcionarioId !== funcionarioId) throw new NotFoundException("Folga não encontrada.");
    await this.prisma.folga.delete({ where: { id: folgaId } });
    return { ok: true };
  }

  // ---------- Foto de perfil (o próprio funcionário) ----------
  // Aparece pro cliente na hora de escolher o profissional (ver
  // SaloesService.listarFuncionariosPublico/BookingScreen no app) — mesmo
  // padrão da logo do salão (comprime/redimensiona com sharp e guarda
  // como data URL direto no banco, ver comentário do campo fotoUrl no schema).

  async buscarMinhaFoto(usuarioId: string) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);
    return { fotoUrl: funcionario.fotoUrl };
  }

  async atualizarMinhaFoto(usuarioId: string, file?: Express.Multer.File) {
    const funcionario = await this.buscarFuncionarioPorUsuario(usuarioId);

    if (!file) throw new BadRequestException('Envie um arquivo de imagem no campo "foto".');
    if (!file.mimetype.startsWith("image/")) {
      throw new BadRequestException("O arquivo enviado precisa ser uma imagem.");
    }
    if (file.size > TAMANHO_MAXIMO_FOTO_BYTES) {
      throw new BadRequestException("A imagem enviada é muito grande (máximo 5MB).");
    }

    let comprimida: Buffer;
    try {
      comprimida = await sharp(file.buffer)
        .rotate() // aplica a orientação EXIF (fotos tiradas na vertical no celular) antes de cortar
        .resize(512, 512, { fit: "cover" })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException("Não foi possível processar essa imagem. Tente outro arquivo.");
    }

    const fotoUrl = `data:image/jpeg;base64,${comprimida.toString("base64")}`;
    return this.prisma.funcionario.update({
      where: { id: funcionario.id },
      data: { fotoUrl },
      select: { id: true, fotoUrl: true },
    });
  }

  // ---------- helpers ----------

  private async buscarFuncionarioPorUsuario(usuarioId: string) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { usuarioId } });
    if (!funcionario) throw new NotFoundException("Cadastro de funcionário não encontrado para este usuário.");
    return funcionario;
  }

  private async garantirDaSalao(id: string, salaoId: string) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { id } });
    if (!funcionario) throw new NotFoundException("Funcionário não encontrado.");
    if (funcionario.salaoId !== salaoId) throw new ForbiddenException("Funcionário não pertence ao seu salão.");
  }

  private async garantirDentroDoLimiteDoPlano(salaoId: string) {
    const assinatura = await this.prisma.assinatura.findUnique({ where: { salaoId }, include: { plano: true } });
    const limite = assinatura?.plano.limiteFuncionarios;
    if (limite == null) return; // sem assinatura encontrada ou plano ilimitado: não bloqueia

    const totalAtivos = await this.prisma.funcionario.count({ where: { salaoId, ativo: true } });
    if (totalAtivos >= limite) {
      throw new BadRequestException(
        `Seu plano (${assinatura!.plano.nome}) permite até ${limite} funcionário${limite === 1 ? "" : "s"}. Desative alguém ou faça upgrade do plano pra adicionar mais.`,
      );
    }
  }
}
