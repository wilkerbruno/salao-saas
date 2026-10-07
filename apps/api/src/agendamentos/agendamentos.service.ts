import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Funcionario, Folga, HorarioTrabalho } from "@prisma/client";
import {
  AVISO_NAO_COMPARECIMENTO,
  CategoriaServico,
  EtapaDisponibilidade,
  atendeCategoria,
  ordenarServicosDoPacote,
  rotuloCategoria,
  MetodoPagamento,
  OrigemAgendamento,
  Papel,
  StatusAgendamento,
  StatusAssinaturaPacote,
  StatusPagamento,
} from "@salao-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";
import { ConfiguracoesService } from "../configuracoes/configuracoes.service";
import { PushService } from "../push/push.service";
import { estaForaDaCarencia } from "../assinaturas/assinatura-status.util";
import { CreateAgendamentoDto } from "./dto/create-agendamento.dto";
import { CreateAgendamentoLoteDto } from "./dto/create-agendamento-lote.dto";
import { CreateAgendamentoManualDto } from "./dto/create-agendamento-manual.dto";
import { AuthUser } from "../auth/jwt.strategy";

// De quanto em quanto tempo um novo horário pode começar (ex: 09:00, 09:30,
// 10:00...). O expediente em si (dias, hora de início/fim, almoço) agora vem
// do HorarioTrabalho de cada funcionário, cadastrado por ele mesmo no app.
const INTERVALO_ENTRE_INICIOS_MINUTOS = 30;

// Um agendamento PENDENTE (pagamento ainda não confirmado) bloqueia o horário
// como se fosse CONFIRMADO — mas só por um tempo: se o cliente abandona o
// pagamento (fecha o app sem pagar o Pix, não conclui o checkout do cartão),
// o horário não pode ficar preso pra sempre. Depois desse prazo, o servidor
// simplesmente ignora esse PENDENTE ao calcular disponibilidade/conflito —
// não precisa de um job em background pra "limpar" nada.
const PENDENTE_EXPIRA_MINUTOS = 20;

// Fração retida como multa quando o cliente não comparece (ver
// marcarNaoCompareceu) — o resto é estornado. Mesmo valor usado no aviso
// exibido na hora de pagar (AVISO_NAO_COMPARECIMENTO, em @salao-saas/shared).
const FRACAO_MULTA_NAO_COMPARECIMENTO = 0.5;

type FuncionarioComAgenda = Funcionario & { horarios: HorarioTrabalho[]; folgas: Folga[] };

// Uma "etapa" do agendamento: um serviço (ou um pacote de uma categoria só) a
// ser feito por UMA profissional, em sequência com as demais etapas do lote
// (ex: etapa 1 = escova com a cabeleireira, etapa 2 = manicure com a manicure).
interface ItemResolvido {
  servicoId?: string;
  pacoteId?: string;
  duracaoMinutos: number;
  precoCentavos: number;
  salaoId: string;
  // Categoria do serviço; null = qualquer profissional pode fazer (pacote sem
  // serviços, ou consulta de disponibilidade sem categoria).
  categoria: CategoriaServico | null;
  // Profissional que o cliente/salão escolheu especificamente pra essa etapa.
  funcionarioId?: string;
}

// Etapa já com profissional e horário definidos (resultado de planejarEtapas).
interface EtapaPlanejada extends ItemResolvido {
  funcionarioId: string;
  inicio: Date;
  fim: Date;
}

interface EtapaConsulta {
  duracaoMinutos: number;
  categoria: CategoriaServico | null;
  funcionarioId?: string;
}

@Injectable()
export class AgendamentosService {
  private readonly logger = new Logger(AgendamentosService.name);

  // Marca até onde já checamos agendamentos pra avisar sobre dinheiro
  // pendente (ver avisarPagamentosDinheiroNoHorario) — só em memória mesmo:
  // se o servidor reiniciar, a próxima rodada volta 5 min pra não perder
  // nenhum, e na pior hipótese algum agendamento recebe o aviso de novo
  // (reenviar um lembrete não causa problema nenhum).
  private ultimaChecagemLembreteDinheiro: Date | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mercadoPago: MercadoPagoService,
    private configuracoes: ConfiguracoesService,
    private push: PushService,
  ) {}

  // Cliente não consegue criar um agendamento novo num salão cuja
  // assinatura do SaaS já passou da carência (mesmo critério que a esconde da
  // busca — ver SaloesService.listarProximas). A equipe desse salão
  // já está bloqueada bem antes disso (na hora, sem carência — ver
  // AssinaturaGuard), então essa checagem aqui é só a metade "cliente" da
  // regra. Sem assinatura cadastrada não bloqueia (não é essa checagem que
  // decide esse caso).
  private async garantirSalaoDisponivelParaAgendamento(salaoId: string) {
    const assinatura = await this.prisma.assinatura.findUnique({
      where: { salaoId },
      select: { status: true, bloqueadaEm: true, trialTerminaEm: true },
    });
    if (!assinatura) return;
    const { horasCarenciaAposVencimento } = await this.configuracoes.obter();
    if (estaForaDaCarencia(assinatura, horasCarenciaAposVencimento)) {
      throw new BadRequestException("Este salão está temporariamente indisponível para novos agendamentos.");
    }
  }

  // Mantido por compatibilidade (agendamento de um serviço/pacote só) — por
  // baixo é a mesma coisa que criarLote com um item, mesmo fluxo de pagamento.
  criar(clienteId: string, dto: CreateAgendamentoDto) {
    return this.criarLote(clienteId, {
      funcionarioId: dto.funcionarioId,
      inicio: dto.inicio,
      itens: [{ servicoId: dto.servicoId, pacoteId: dto.pacoteId }],
      metodoPagamento: dto.metodoPagamento,
    });
  }

  // O cliente marca vários serviços de uma vez (pode repetir o mesmo, ex: 2x
  // corte pra pai e filho) num único horário — cada item vira um Agendamento
  // próprio (status PENDENTE até o pagamento confirmar), encadeado em
  // sequência a partir de "inicio" e com o mesmo profissional, todos com o
  // mesmo grupoId pra serem exibidos/cancelados/pagos juntos. Devolve os
  // agendamentos criados + a cobrança (Pix/Cartão) que o cliente precisa
  // pagar pra confirmar — ver AVISO_NAO_COMPARECIMENTO pro texto exibido
  // nessa hora (o salão retém 50% se o cliente não comparecer).
  async criarLote(clienteId: string, dto: CreateAgendamentoLoteDto) {
    const resolvidos = await this.resolverItens(dto.itens, dto.funcionariosPorCategoria);

    const salaoId = resolvidos[0].salaoId;
    if (resolvidos.some((r) => r.salaoId !== salaoId)) {
      throw new BadRequestException("Todos os serviços do agendamento precisam ser do mesmo salão.");
    }
    await this.garantirSalaoDisponivelParaAgendamento(salaoId);

    const inicio = new Date(dto.inicio);

    // Cada etapa (cabelo, unha...) ganha a sua profissional — a escolhida pelo
    // cliente pra aquele serviço ou, se ela não escolheu, qualquer uma que
    // atenda a categoria e esteja livre naquele trecho do horário.
    const plano = await this.planejarEtapas(salaoId, resolvidos, inicio, dto.funcionarioId);

    // Antes de exigir pagamento avulso, confere se uma assinatura de pacote
    // mensal ATIVA do cliente já cobre esse lote inteiro (mesmos serviços,
    // dia da semana permitido, cota da semana não esgotada) — nesse caso o
    // agendamento nasce CONFIRMADO direto, sem Pagamento nenhum (ver
    // encontrarAssinaturaPacoteElegivel).
    const assinaturaPacote = await this.encontrarAssinaturaPacoteElegivel(
      clienteId,
      salaoId,
      resolvidos,
      inicio,
      dto.usarAssinaturaPacoteId,
    );
    if (assinaturaPacote) {
      return this.criarComAssinaturaPacote(clienteId, salaoId, plano, assinaturaPacote.id);
    }

    const metodoPagamento = dto.metodoPagamento ?? MetodoPagamento.PIX;
    const valorTotalCentavos = resolvidos.reduce((total, r) => total + r.precoCentavos, 0);

    // Confere ANTES de criar qualquer coisa que o salão tem como receber
    // — evita reservar o horário só pra descobrir depois que não dá pra
    // cobrar. Dinheiro nunca passa pelo Mercado Pago, então pula essa
    // exigência de propósito: o salão pode aceitar pagamento em dinheiro
    // mesmo sem ter conectado uma conta Mercado Pago ainda.
    const tokenSalao =
      metodoPagamento === MetodoPagamento.DINHEIRO ? null : await this.mercadoPago.tokenDaSalao(salaoId);

    const [cliente, salao, ultimoPagamentoAprovado] = await Promise.all([
      this.prisma.usuario.findUnique({ where: { id: clienteId } }),
      this.prisma.salao.findUnique({ where: { id: salaoId } }),
      // Só pra montar additional_info.payer da cobrança com cartão abaixo
      // (ver MercadoPagoService.criarPagamentoCartao) — busca em paralelo com
      // o resto pra não atrasar o fluxo de Pix, que não usa esse dado.
      // atualizadoEm é usado como proxy de "quando foi aprovado" porque
      // Pagamento não guarda uma data de aprovação separada — é atualizado
      // exatamente quando o status muda pra APROVADO (ver mais abaixo).
      this.prisma.pagamento.findFirst({
        where: { clienteId, status: StatusPagamento.APROVADO },
        orderBy: { atualizadoEm: "desc" },
      }),
    ]);
    if (!cliente) throw new NotFoundException("Cliente não encontrado.");

    const grupoId = randomUUID();
    const dadosParaCriar = plano.map((item) => {
      return {
        salaoId,
        clienteId,
        funcionarioId: item.funcionarioId,
        servicoId: item.servicoId,
        pacoteId: item.pacoteId,
        inicio: item.inicio,
        fim: item.fim,
        precoCentavos: item.precoCentavos,
        // Pix/Cartão nascem PENDENTE até o gateway confirmar (ver mais
        // abaixo) — mas Dinheiro nasce CONFIRMADO direto: diferente de um
        // checkout abandonado, aqui o cliente já se comprometeu com o
        // horário, e um PENDENTE expira sozinho depois de
        // PENDENTE_EXPIRA_MINUTOS (ver filtroStatusAtivo), o que liberaria a
        // vaga de baixo do cliente que ainda vai aparecer pra pagar em
        // dinheiro. O controle de "ainda não pagou" fica só no Pagamento
        // (criado abaixo como PENDENTE) até o funcionário/salao
        // confirmarem o recebimento — ver confirmarPagamentoDinheiro.
        status:
          metodoPagamento === MetodoPagamento.DINHEIRO ? StatusAgendamento.CONFIRMADO : StatusAgendamento.PENDENTE,
        origem: OrigemAgendamento.CLIENTE_APP,
        grupoId,
      };
    });

    await this.prisma.$transaction(dadosParaCriar.map((data) => this.prisma.agendamento.create({ data })));
    const pagamento = await this.prisma.pagamento.create({
      data: { grupoId, clienteId, salaoId, metodo: metodoPagamento, valorCentavos: valorTotalCentavos },
    });

    let motivoRecusaCartao: string | null = null;
    try {
      if (metodoPagamento === MetodoPagamento.PIX) {
        const pix = await this.mercadoPago.criarPagamentoPix(
          {
            valorCentavos: valorTotalCentavos,
            descricao: `Agendamento - ${salao?.nome ?? "Salão"}`,
            // "_" (não ":") — a Orders API (usada pelo cartão, ver
            // MercadoPagoService.criarPagamentoCartao) valida external_reference
            // com um padrão mais restrito que a API clássica e rejeita ":"
            // ("does not match pattern", constatado em produção). Pix também
            // foi trocado pro mesmo formato só por consistência (não precisa,
            // mas evita ter dois padrões diferentes pro mesmo campo).
            externalReference: `agendamento_${pagamento.id}`,
            payerEmail: cliente.email,
          },
          tokenSalao as string,
        );
        const aprovadoNaHora = pix.status === "approved";
        await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: {
            gatewayPagamentoId: pix.id,
            pixQrCodeBase64: pix.qrCodeBase64,
            pixCopiaECola: pix.qrCode,
            status: aprovadoNaHora ? StatusPagamento.APROVADO : StatusPagamento.PENDENTE,
          },
        });
        if (aprovadoNaHora) {
          await this.prisma.agendamento.updateMany({ where: { grupoId }, data: { status: StatusAgendamento.CONFIRMADO } });
        }
      } else if (metodoPagamento === MetodoPagamento.CARTAO) {
        // Cartão: formulário nativo no app tokenizou o cartão (dto.cartaoToken)
        // e o cliente nunca sai do app — cobra na hora, sem checkout hospedado.
        if (!dto.cartaoToken || !dto.cartaoBin || !dto.cartaoCpf) {
          throw new BadRequestException("Dados do cartão incompletos.");
        }
        const { paymentMethodId } = await this.mercadoPago.identificarBandeiraCartao(dto.cartaoBin);
        const cobranca = await this.mercadoPago.criarPagamentoCartao(
          {
            valorCentavos: valorTotalCentavos,
            descricao: `Agendamento - ${salao?.nome ?? "Salão"}`,
            // "_" (não ":") — a Orders API (usada pelo cartão, ver
            // MercadoPagoService.criarPagamentoCartao) valida external_reference
            // com um padrão mais restrito que a API clássica e rejeita ":"
            // ("does not match pattern", constatado em produção). Pix também
            // foi trocado pro mesmo formato só por consistência (não precisa,
            // mas evita ter dois padrões diferentes pro mesmo campo).
            externalReference: `agendamento_${pagamento.id}`,
            token: dto.cartaoToken,
            paymentMethodId,
            payerEmail: cliente.email,
            payerCpf: dto.cartaoCpf,
            payerNome: cliente.nome,
            payerTelefone: cliente.telefone,
            deviceId: dto.cartaoDeviceId,
            payerCadastradoEm: cliente.criadoEm,
            payerPrimeiraCompra: !ultimoPagamentoAprovado,
            payerUltimaCompraEm: ultimoPagamentoAprovado?.atualizadoEm ?? null,
            dataAgendamento: inicio,
          },
          tokenSalao as string,
        );
        const aprovadoNaHora = cobranca.status === "approved";
        const recusado = cobranca.status === "rejected";
        await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: {
            gatewayPagamentoId: cobranca.id,
            status: aprovadoNaHora ? StatusPagamento.APROVADO : recusado ? StatusPagamento.RECUSADO : StatusPagamento.PENDENTE,
            // Preenchido só quando o Mercado Pago exigiu desafio 3DS (ver
            // MercadoPagoService.criarPagamentoCartao) — o app usa isso pra
            // decidir se mostra a WebView de confirmação com o banco.
            desafio3dsUrl: cobranca.desafio3dsUrl,
          },
        });
        if (aprovadoNaHora) {
          await this.prisma.agendamento.updateMany({ where: { grupoId }, data: { status: StatusAgendamento.CONFIRMADO } });
        } else if (recusado) {
          // Recusa da operadora não é uma falha técnica (não deve virar o
          // erro genérico do catch abaixo) — libera o horário e devolve pro
          // cliente um motivo específico pra ele tentar outro cartão.
          await this.prisma.agendamento.updateMany({ where: { grupoId }, data: { status: StatusAgendamento.CANCELADO } });
          motivoRecusaCartao = traduzirMotivoRecusaCartao(cobranca.statusDetail);
        }
      }
      // DINHEIRO: nada a fazer aqui — o Agendamento já nasceu CONFIRMADO e o
      // Pagamento já foi criado acima como PENDENTE, sem gatewayPagamentoId.
      // Fica assim até o funcionário/salao confirmarem o recebimento
      // presencialmente (ver confirmarPagamentoDinheiro), o que também é o
      // que libera `concluir()` pra esse agendamento (exige Pagamento
      // APROVADO pra agendamentos vindos do app).
    } catch (e) {
      // Não deixa a reserva/pagamento órfãos travando o horário pra sempre —
      // desfaz os dois e devolve um erro claro pro cliente tentar de novo.
      this.logger.error(`Falha ao gerar cobrança pro agendamento (grupo ${grupoId}): ${e}`);
      await this.prisma.agendamento.updateMany({ where: { grupoId }, data: { status: StatusAgendamento.CANCELADO } });
      await this.prisma.pagamento.update({ where: { id: pagamento.id }, data: { status: StatusPagamento.RECUSADO } });
      // Erros com mensagem própria (ex: motivo específico do Mercado Pago, ou
      // "bandeira não identificada") já são claros o suficiente pro cliente —
      // só cai na mensagem genérica quando o erro é algo inesperado (ex: falha
      // de rede) sem nada útil pra mostrar.
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException("Não foi possível gerar a cobrança agora. Tente novamente em instantes.");
    }

    if (motivoRecusaCartao) {
      throw new BadRequestException(motivoRecusaCartao);
    }

    const [agendamentos, pagamentoFinal] = await Promise.all([
      this.prisma.agendamento.findMany({
        where: { grupoId },
        // select em vez de include: true — mesmo motivo das outras consultas
        // de agenda: evita devolver o Usuario inteiro (hash de senha) do
        // funcionário pro app do cliente que acabou de agendar.
        include: { servico: true, pacote: true, funcionario: { include: { usuario: { select: { id: true, nome: true } } } } },
        orderBy: { inicio: "asc" },
      }),
      this.prisma.pagamento.findUniqueOrThrow({ where: { id: pagamento.id } }),
    ]);

    return { agendamentos, pagamento: this.mapearPagamento(pagamentoFinal), aviso: AVISO_NAO_COMPARECIMENTO };
  }

  // Procura uma AssinaturaPacoteCliente ATIVA do cliente (nesse salão)
  // que cubra o lote inteiro: só serviços avulsos (nada de Pacote — combo já
  // tem preço/composição própria), todos incluídos no mesmo pacote mensal, no
  // dia da semana permitido e com cota sobrando pra todos os itens do lote.
  // Se `usarAssinaturaPacoteId` foi informado (o cliente escolheu usar o
  // pacote de propósito), qualquer motivo de não cobrir vira erro claro em
  // vez de cair silenciosamente pro pagamento avulso.
  private async encontrarAssinaturaPacoteElegivel(
    clienteId: string,
    salaoId: string,
    resolvidos: ItemResolvido[],
    inicio: Date,
    usarAssinaturaPacoteId?: string,
  ) {
    if (resolvidos.some((r) => !r.servicoId || r.pacoteId)) {
      if (usarAssinaturaPacoteId) {
        throw new BadRequestException("Pacotes de serviço avulso não podem ser pagos com a cota de um pacote mensal.");
      }
      return null;
    }

    const candidatas = await this.prisma.assinaturaPacoteCliente.findMany({
      where: {
        ...(usarAssinaturaPacoteId ? { id: usarAssinaturaPacoteId } : {}),
        clienteId,
        salaoId,
        status: StatusAssinaturaPacote.ATIVA,
      },
      include: { pacoteMensal: { include: { servicos: true } } },
    });
    if (usarAssinaturaPacoteId && candidatas.length === 0) {
      throw new BadRequestException("Assinatura de pacote mensal não encontrada ou não está ativa.");
    }

    const diaSemana = inicio.getDay();
    const servicoIds = resolvidos.map((r) => r.servicoId!);

    for (const candidata of candidatas) {
      const idsIncluidos = new Set(candidata.pacoteMensal.servicos.map((s) => s.servicoId));
      if (!servicoIds.every((id) => idsIncluidos.has(id))) {
        if (usarAssinaturaPacoteId) throw new BadRequestException("Essa assinatura não cobre um ou mais dos serviços escolhidos.");
        continue;
      }

      const diasPermitidos = (candidata.pacoteMensal.diasSemanaPermitidos as number[]) ?? [];
      if (!diasPermitidos.includes(diaSemana)) {
        if (usarAssinaturaPacoteId) throw new BadRequestException("Seu pacote mensal não permite agendar nesse dia da semana.");
        continue;
      }

      const usos = await this.usosDaAssinaturaNaSemana(candidata.id, inicio);
      if (usos + resolvidos.length > candidata.pacoteMensal.vezesPorSemana) {
        if (usarAssinaturaPacoteId) throw new BadRequestException("Cota semanal do seu pacote mensal esgotada.");
        continue;
      }

      return candidata;
    }
    return null;
  }

  // Mesma definição de semana (segunda 00:00 até o próximo domingo) usada em
  // PacotesMensaisService.usosNaSemana — duplicado de propósito pra não criar
  // um ciclo entre os dois módulos por causa de um helper de 6 linhas.
  private usosDaAssinaturaNaSemana(assinaturaId: string, dataReferencia: Date) {
    const diaSemana = dataReferencia.getDay();
    const diasDesdeSegunda = (diaSemana + 6) % 7;
    const inicioSemana = new Date(dataReferencia);
    inicioSemana.setHours(0, 0, 0, 0);
    inicioSemana.setDate(inicioSemana.getDate() - diasDesdeSegunda);
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(fimSemana.getDate() + 7);

    return this.prisma.agendamento.count({
      where: {
        assinaturaPacoteId: assinaturaId,
        status: { in: [StatusAgendamento.CONFIRMADO, StatusAgendamento.CONCLUIDO, StatusAgendamento.NAO_COMPARECEU] },
        inicio: { gte: inicioSemana, lt: fimSemana },
      },
    });
  }

  // Cria o lote inteiro já CONFIRMADO, usando a cota da assinatura — sem
  // Pagamento nenhum (o cliente já paga a mensalidade à parte, ver
  // PacotesMensaisService.assinar).
  private async criarComAssinaturaPacote(
    clienteId: string,
    salaoId: string,
    plano: EtapaPlanejada[],
    assinaturaPacoteId: string,
  ) {
    const grupoId = randomUUID();
    const dadosParaCriar = plano.map((item) => {
      return {
        salaoId,
        clienteId,
        funcionarioId: item.funcionarioId,
        servicoId: item.servicoId,
        inicio: item.inicio,
        fim: item.fim,
        precoCentavos: item.precoCentavos,
        status: StatusAgendamento.CONFIRMADO,
        origem: OrigemAgendamento.CLIENTE_APP,
        assinaturaPacoteId,
        grupoId,
      };
    });

    await this.prisma.$transaction(dadosParaCriar.map((data) => this.prisma.agendamento.create({ data })));
    const agendamentos = await this.prisma.agendamento.findMany({
      where: { grupoId },
      // select em vez de include: true — mesmo motivo das demais consultas.
      include: { servico: true, pacote: true, funcionario: { include: { usuario: { select: { id: true, nome: true } } } } },
      orderBy: { inicio: "asc" },
    });

    return { agendamentos, pagamento: null, aviso: AVISO_NAO_COMPARECIMENTO };
  }

  // O próprio salão lança um agendamento na agenda — cliente avulso (sem
  // conta, só nome/telefone) ou um cliente já cadastrado no app. Cai direto
  // como CONFIRMADO, sem PENDENTE/pagamento pelo app (quem cobra, se cobrar,
  // é o próprio salão por fora — ex: dinheiro/maquininha na hora).
  // Funcionário só pode lançar na PRÓPRIA agenda; o dono do salão pode
  // lançar na de qualquer funcionário da casa.
  async criarManual(user: AuthUser, dto: CreateAgendamentoManualDto) {
    if (!dto.clienteId && !dto.clienteAvulsoNome) {
      throw new BadRequestException("Informe o cliente cadastrado ou ao menos o nome do cliente avulso.");
    }

    let salaoId: string;
    if (user.papel === Papel.SALAO_ADMIN) {
      if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
      salaoId = user.salaoId;
    } else if (user.papel === Papel.FUNCIONARIO) {
      const funcionario = await this.prisma.funcionario.findUnique({ where: { usuarioId: user.id } });
      if (!funcionario) throw new NotFoundException("Cadastro de funcionário não encontrado para este usuário.");
      if (funcionario.id !== dto.funcionarioId) {
        throw new ForbiddenException("Você só pode lançar agendamentos na sua própria agenda.");
      }
      salaoId = funcionario.salaoId;
    } else {
      throw new ForbiddenException("Sem permissão para lançar agendamentos manualmente.");
    }

    const resolvidos = await this.resolverItens(dto.itens, dto.funcionariosPorCategoria);
    if (resolvidos.some((r) => r.salaoId !== salaoId)) {
      throw new BadRequestException("Todos os serviços do agendamento precisam ser do mesmo salão.");
    }

    // Cada serviço pode ter a sua profissional (itens[].funcionarioId) — ex: o
    // dono lança "escova com a Ana + unha com a Bia" num único atendimento. O
    // `funcionarioId` do corpo é a profissional padrão pros itens sem escolha
    // própria que ela atende.
    const inicio = new Date(dto.inicio);
    const plano = await this.planejarEtapas(salaoId, resolvidos, inicio, dto.funcionarioId);

    // Funcionária só lança na PRÓPRIA agenda — vale pra todas as etapas.
    if (user.papel === Papel.FUNCIONARIO && plano.some((e) => e.funcionarioId !== dto.funcionarioId)) {
      throw new ForbiddenException(
        "Esse atendimento inclui serviços que não são da sua agenda. Peça ao salão para lançar o atendimento completo.",
      );
    }

    if (dto.clienteId) {
      const cliente = await this.prisma.usuario.findUnique({ where: { id: dto.clienteId } });
      if (!cliente) throw new NotFoundException("Cliente não encontrado.");
    }

    // Só usa grupoId quando há mais de um serviço (agrupa pra
    // cancelar/concluir juntos) — um item só nem precisa.
    const grupoId = plano.length > 1 ? randomUUID() : undefined;
    // Como o salão recebeu por fora (sem Pagamento, não passa pelo
    // Mercado Pago) — ver Agendamento.metodoPagamentoManual no schema e
    // FinanceiroService, que usa isso pros cards de Pix/Cartão/Dinheiro.
    // Default Dinheiro: é o caso mais comum de lançamento manual (cliente que
    // pagou na hora, na mão).
    const metodoPagamentoManual = dto.metodoPagamento ?? MetodoPagamento.DINHEIRO;
    const dadosParaCriar = plano.map((item) => {
      return {
        salaoId,
        funcionarioId: item.funcionarioId,
        clienteId: dto.clienteId,
        clienteAvulsoNome: dto.clienteId ? undefined : dto.clienteAvulsoNome,
        clienteAvulsoTelefone: dto.clienteId ? undefined : dto.clienteAvulsoTelefone,
        servicoId: item.servicoId,
        pacoteId: item.pacoteId,
        inicio: item.inicio,
        fim: item.fim,
        precoCentavos: item.precoCentavos,
        status: StatusAgendamento.CONFIRMADO,
        origem: OrigemAgendamento.SALAO_MANUAL,
        metodoPagamentoManual,
        grupoId,
      };
    });

    const criados = await this.prisma.$transaction(dadosParaCriar.map((data) => this.prisma.agendamento.create({ data })));
    return this.prisma.agendamento.findMany({
      where: { id: { in: criados.map((c) => c.id) } },
      // select em vez de include: true — mesmo motivo das demais consultas
      // de agenda (evita devolver hash de senha/e-mail desnecessariamente).
      include: {
        servico: true,
        pacote: true,
        funcionario: { include: { usuario: { select: { id: true, nome: true } } } },
        cliente: { select: { id: true, nome: true, telefone: true } },
      },
      orderBy: { inicio: "asc" },
    });
  }

  // O app chama isso pra saber se o Pix/checkout já foi pago — enquanto
  // PENDENTE, também confere ao vivo com o Mercado Pago (não depende só do
  // webhook, que pode demorar ou estar mal configurado num ambiente novo).
  async buscarPagamento(pagamentoId: string, clienteId: string) {
    const pagamento = await this.prisma.pagamento.findUnique({ where: { id: pagamentoId } });
    if (!pagamento || pagamento.clienteId !== clienteId) throw new NotFoundException("Pagamento não encontrado.");

    if (pagamento.status === StatusPagamento.PENDENTE && pagamento.gatewayPagamentoId) {
      try {
        const token = await this.mercadoPago.tokenDaSalao(pagamento.salaoId);
        const atualizado = await this.sincronizarPagamentoComGateway(pagamento.id, pagamento.gatewayPagamentoId, token);
        return this.mapearPagamento(atualizado);
      } catch (e) {
        this.logger.warn(`Falha ao sincronizar pagamento ${pagamentoId} ao vivo, devolvendo estado salvo: ${e}`);
      }
    }
    return this.mapearPagamento(pagamento);
  }

  // Cliente desistiu de pagar (ex: voltou da tela de pagamento sem concluir)
  // — libera o horário e o grupo inteiro na hora, em vez de deixar preso até
  // PENDENTE_EXPIRA_MINUTOS vencer sozinho (ver filtroStatusAtivo). Só mexe
  // em algo se AINDA estiver PENDENTE: se o pagamento já aprovou (ex: o
  // webhook chegou um instante antes de o cliente tocar "cancelar") ou já foi
  // recusado, não desfaz nada — evita cancelar um agendamento que na verdade
  // já foi pago.
  async cancelarPagamentoPendente(pagamentoId: string, clienteId: string) {
    const pagamento = await this.prisma.pagamento.findUnique({ where: { id: pagamentoId } });
    if (!pagamento || pagamento.clienteId !== clienteId) throw new NotFoundException("Pagamento não encontrado.");

    if (pagamento.status === StatusPagamento.PENDENTE && pagamento.grupoId) {
      // Dinheiro nasce CONFIRMADO (não PENDENTE, ver criarLote) — se o
      // cliente ainda assim desistir antes de confirmar em dinheiro, precisa
      // soltar o CONFIRMADO também, senão o horário ficava preso com um
      // Pagamento RECUSADO órfão (nunca mais confirmável nem concluível).
      const statusParaLiberar =
        pagamento.metodo === MetodoPagamento.DINHEIRO
          ? [StatusAgendamento.PENDENTE, StatusAgendamento.CONFIRMADO]
          : [StatusAgendamento.PENDENTE];
      await this.prisma.$transaction([
        this.prisma.agendamento.updateMany({
          where: { grupoId: pagamento.grupoId, status: { in: statusParaLiberar } },
          data: { status: StatusAgendamento.CANCELADO },
        }),
        this.prisma.pagamento.update({ where: { id: pagamentoId }, data: { status: StatusPagamento.RECUSADO } }),
      ]);
    }

    return this.mapearPagamento(await this.prisma.pagamento.findUniqueOrThrow({ where: { id: pagamentoId } }));
  }

  // Usado tanto pelo poll acima quanto pelo webhook (ver WebhooksService) —
  // busca o status atual no Mercado Pago e atualiza Pagamento/Agendamentos.
  private async sincronizarPagamentoComGateway(pagamentoId: string, gatewayPagamentoId: string, token: string) {
    const pagamentoMp = await this.mercadoPago.buscarPayment(gatewayPagamentoId, token);
    const novoStatus =
      pagamentoMp.status === "approved"
        ? StatusPagamento.APROVADO
        : pagamentoMp.status === "pending" || pagamentoMp.status === "in_process" || pagamentoMp.status === "authorized"
          ? StatusPagamento.PENDENTE
          : StatusPagamento.RECUSADO;

    const atualizado = await this.prisma.pagamento.update({
      where: { id: pagamentoId },
      // `?? null`: PaymentDetalhe.desafio3dsUrl vem undefined pro Pix (não
      // existe conceito de 3DS lá) — sem isso o Prisma reclamaria do tipo.
      data: {
        status: novoStatus,
        desafio3dsUrl: pagamentoMp.desafio3dsUrl ?? null,
        // Mesma taxa do Mercado Pago gravada no webhook (ver
        // WebhooksService.tratarPagamentoAgendamento) — esse poll é só o
        // outro caminho que pode ser o primeiro a ver a aprovação.
        taxaMercadoPagoCentavos: pagamentoMp.taxaCentavos,
      },
    });
    if (novoStatus === StatusPagamento.APROVADO && atualizado.grupoId) {
      await this.prisma.agendamento.updateMany({
        where: { grupoId: atualizado.grupoId, status: StatusAgendamento.PENDENTE },
        data: { status: StatusAgendamento.CONFIRMADO },
      });
    } else if (novoStatus === StatusPagamento.RECUSADO && atualizado.grupoId) {
      // BUG (set/2026): quando a recusa é descoberta só DEPOIS da criação —
      // ex: Order que nasce "pending"/"pending_review_manual" e vira "failed"
      // (high_risk) alguns segundos depois, achado aqui pelo poll/webhook, não
      // na criação (ver criarPagamentoCartao/criarLote, que JÁ cancelava
      // nesse outro caminho) — faltava esse `else if`: o Agendamento ficava
      // PENDENTE, e `filtroStatusAtivo()` trata PENDENTE recente como
      // ocupando o horário por até PENDENTE_EXPIRA_MINUTOS. Resultado: o
      // cliente tentava agendar de novo no mesmo horário na hora e recebia
      // "esse horário acabou de ser reservado" — mesmo o pagamento já tendo
      // sido definitivamente recusado. Libera o horário na hora, igual já
      // acontece nos outros dois caminhos de recusa (criarLote e
      // cancelarPagamentoPendente).
      await this.prisma.agendamento.updateMany({
        where: { grupoId: atualizado.grupoId, status: StatusAgendamento.PENDENTE },
        data: { status: StatusAgendamento.CANCELADO },
      });
    }
    return atualizado;
  }

  private mapearPagamento(pagamento: {
    id: string;
    grupoId: string | null;
    clienteId: string;
    salaoId: string;
    metodo: string;
    status: string;
    valorCentavos: number;
    valorEstornadoCentavos: number;
    pixQrCodeBase64: string | null;
    pixCopiaECola: string | null;
    desafio3dsUrl: string | null;
    criadoEm: Date;
  }, checkoutUrl?: string | null) {
    return {
      id: pagamento.id,
      grupoId: pagamento.grupoId,
      clienteId: pagamento.clienteId,
      salaoId: pagamento.salaoId,
      metodo: pagamento.metodo,
      status: pagamento.status,
      valorCentavos: pagamento.valorCentavos,
      valorEstornadoCentavos: pagamento.valorEstornadoCentavos,
      pixQrCodeBase64: pagamento.pixQrCodeBase64,
      pixCopiaECola: pagamento.pixCopiaECola,
      desafio3dsUrl: pagamento.desafio3dsUrl,
      checkoutUrl: checkoutUrl ?? null,
      criadoEm: pagamento.criadoEm.toISOString(),
    };
  }

  // Dias (dentro do mês informado) que têm pelo menos um horário livre para o
  // atendimento completo — alimenta o calendário do app. `etapas` descreve o
  // atendimento (cada serviço escolhido, em sequência, com sua categoria e,
  // opcionalmente, a profissional escolhida pra ele); sem `etapas`, cai no
  // formato antigo (uma etapa só, duração total, profissional opcional).
  async listarDiasDisponiveis(
    salaoId: string,
    ano: number,
    mes: number,
    duracaoMinutos: number,
    funcionarioId?: string,
    etapas?: EtapaDisponibilidade[],
  ) {
    const inicioMes = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
    const inicioProximoMes = new Date(ano, mes, 1, 0, 0, 0, 0);
    const consulta = montarConsulta(duracaoMinutos, funcionarioId, etapas);
    // folga/agenda precisam cobrir também as etapas que passam da meia-noite do
    // último dia (raro, mas não custa).
    const fimJanela = addMinutos(inicioProximoMes, consulta.reduce((t, e) => t + e.duracaoMinutos, 0));

    const funcionarios = await this.funcionariosComAgenda(salaoId, inicioMes, fimJanela);
    if (funcionarios.length === 0) return [];
    const agendamentos = await this.buscarAgendamentosNoIntervalo(
      funcionarios.map((f) => f.id),
      inicioMes,
      fimJanela,
    );
    const agora = new Date();

    const dias: string[] = [];
    for (let dia = new Date(inicioMes); dia < inicioProximoMes; dia.setDate(dia.getDate() + 1)) {
      if (this.iniciosPossiveisNoDia(funcionarios, agendamentos, consulta, dia, agora).length > 0) dias.push(formatarData(dia));
    }
    return dias;
  }

  // Horários de início livres (formato "HH:mm") num dia específico para o
  // atendimento completo — vale só se TODAS as etapas couberem em sequência,
  // cada uma com uma profissional que atenda a categoria e esteja livre.
  async listarHorariosDisponiveis(
    salaoId: string,
    data: string,
    duracaoMinutos: number,
    funcionarioId?: string,
    etapas?: EtapaDisponibilidade[],
  ) {
    const dia = new Date(`${data}T00:00:00`);
    const proximoDia = new Date(dia);
    proximoDia.setDate(proximoDia.getDate() + 1);
    const consulta = montarConsulta(duracaoMinutos, funcionarioId, etapas);
    const fimJanela = addMinutos(proximoDia, consulta.reduce((t, e) => t + e.duracaoMinutos, 0));

    const funcionarios = await this.funcionariosComAgenda(salaoId, dia, fimJanela);
    if (funcionarios.length === 0) return [];
    const agendamentos = await this.buscarAgendamentosNoIntervalo(
      funcionarios.map((f) => f.id),
      dia,
      fimJanela,
    );

    return this.iniciosPossiveisNoDia(funcionarios, agendamentos, consulta, dia, new Date());
  }

  // Candidatos a início = horários em que alguma profissional QUALIFICADA pra
  // primeira etapa pode começar; cada candidato só vale se as etapas seguintes
  // (deslocadas pela duração das anteriores) também tiverem profissional livre.
  private iniciosPossiveisNoDia(
    funcionarios: FuncionarioComAgenda[],
    agendamentos: { funcionarioId: string; inicio: Date; fim: Date }[],
    consulta: EtapaConsulta[],
    dia: Date,
    agora: Date,
  ): string[] {
    const primeira = consulta[0];
    const candidatas = funcionarios.filter(
      (f) => (!primeira.funcionarioId || f.id === primeira.funcionarioId) && funcionariaAtende(f, primeira.categoria),
    );

    const candidatosDeInicio = new Map<number, Date>();
    for (const funcionaria of candidatas) {
      for (const slot of slotsDoFuncionarioNoDia(funcionaria, dia, primeira.duracaoMinutos)) {
        candidatosDeInicio.set(slot.inicio.getTime(), slot.inicio);
      }
    }

    const horarios: string[] = [];
    for (const inicio of Array.from(candidatosDeInicio.values()).sort((a, b) => a.getTime() - b.getTime())) {
      if (inicio <= agora) continue;

      let cursor = inicio;
      const cabe = consulta.every((etapa) => {
        const inicioEtapa = cursor;
        const fimEtapa = addMinutos(inicioEtapa, etapa.duracaoMinutos);
        cursor = fimEtapa;
        return funcionarios.some(
          (f) =>
            (!etapa.funcionarioId || f.id === etapa.funcionarioId) &&
            !motivoIndisponivel(f, agendamentos, etapa.categoria, inicioEtapa, fimEtapa),
        );
      });
      if (cabe) horarios.push(formatarHorario(inicio));
    }
    return horarios;
  }

  listarMeusComoCliente(clienteId: string) {
    return this.prisma.agendamento.findMany({
      where: { clienteId },
      include: {
        servico: true,
        pacote: true,
        // `select` em vez de `include: true` — isso devolvia o Usuario inteiro
        // do funcionário (hash de senha incluído) pro app do cliente, sem
        // necessidade nenhuma de expor isso.
        funcionario: { include: { usuario: { select: { id: true, nome: true } } } },
        // O cliente pode ter agendamentos em vários salões diferentes —
        // sem isso, "Meus agendamentos" não tinha como mostrar em qual
        // salão foi cada um nem oferecer o botão "Como chegar". telefone:
        // é o que alimenta o botão "Ligar para o salão".
        salao: { select: { id: true, nome: true, endereco: true, telefone: true, latitude: true, longitude: true } },
      },
      orderBy: { inicio: "desc" },
    });
  }

  // Agenda de um funcionário específico, a partir do id do USUÁRIO logado
  // (usada pelo próprio app do funcionário — o token só carrega o id de Usuario).
  async listarAgendaFuncionario(usuarioId: string, dataInicio?: Date, dataFim?: Date) {
    const funcionario = await this.prisma.funcionario.findUnique({ where: { usuarioId } });
    if (!funcionario) throw new NotFoundException("Cadastro de funcionário não encontrado para este usuário.");

    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        funcionarioId: funcionario.id,
        status: { not: StatusAgendamento.CANCELADO },
        ...(dataInicio && dataFim ? { inicio: { gte: dataInicio, lt: dataFim } } : {}),
      },
      // `select` em vez de `include: true` — evita devolver o Usuario inteiro
      // do cliente (hash de senha incluído) pra agenda do funcionário.
      // telefone: alimenta o botão "Ligar para o cliente".
      include: { servico: true, pacote: true, cliente: { select: { id: true, nome: true, telefone: true } } },
      orderBy: { inicio: "asc" },
    });
    return this.anexarPagamento(agendamentos);
  }

  // Agenda de toda o salão (usada pelo app do dono), com filtro opcional por funcionário.
  async listarAgendaSalao(salaoId: string, dataInicio?: Date, dataFim?: Date, funcionarioId?: string) {
    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        salaoId,
        status: { not: StatusAgendamento.CANCELADO },
        ...(funcionarioId ? { funcionarioId } : {}),
        ...(dataInicio && dataFim ? { inicio: { gte: dataInicio, lt: dataFim } } : {}),
      },
      // Mesma correção acima (select em vez de include: true) pros dois
      // relacionamentos de Usuario — nenhum precisa do registro inteiro
      // (hash de senha, e-mail) só pra mostrar nome/telefone na agenda.
      include: {
        servico: true,
        pacote: true,
        cliente: { select: { id: true, nome: true, telefone: true } },
        funcionario: { include: { usuario: { select: { id: true, nome: true } } } },
      },
      orderBy: { inicio: "asc" },
    });
    return this.anexarPagamento(agendamentos);
  }

  // Junta o metodo/status do Pagamento de cada agendamento vindo do app
  // (ligado pelo grupoId, já que não é uma relação do Prisma — ver comentário
  // no schema) — hoje só usado pra agenda do funcionário/salao saberem
  // quando um agendamento está com Dinheiro ainda PENDENTE de confirmação
  // (ver EquipeScreen/SalaoAgendaScreen, botão "Marcar como pago").
  // Lançamento manual (sem grupoId) e agendamento coberto por pacote mensal
  // (grupoId sem Pagamento nenhum) simplesmente não têm `pagamento` nenhum.
  private async anexarPagamento<T extends { grupoId: string | null; origem: string }>(
    agendamentos: T[],
  ): Promise<(T & { pagamento: { metodo: string; status: string } | null })[]> {
    const grupoIds = [
      ...new Set(
        agendamentos
          .filter((a) => a.origem === OrigemAgendamento.CLIENTE_APP && a.grupoId)
          .map((a) => a.grupoId as string),
      ),
    ];
    if (grupoIds.length === 0) return agendamentos.map((a) => ({ ...a, pagamento: null }));

    const pagamentos = await this.prisma.pagamento.findMany({
      where: { grupoId: { in: grupoIds } },
      select: { grupoId: true, metodo: true, status: true },
    });
    const porGrupo = new Map(pagamentos.map((p) => [p.grupoId as string, p]));
    return agendamentos.map((a) => {
      const pagamento = a.grupoId ? porGrupo.get(a.grupoId) : undefined;
      return { ...a, pagamento: pagamento ? { metodo: pagamento.metodo, status: pagamento.status } : null };
    });
  }

  async cancelar(id: string, user: AuthUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id }, include: { funcionario: true } });
    if (!agendamento) throw new NotFoundException("Agendamento não encontrado.");

    const podeCancelar =
      (user.papel === Papel.CLIENTE && agendamento.clienteId === user.id) ||
      (user.papel === Papel.FUNCIONARIO && agendamento.funcionario.usuarioId === user.id) ||
      (user.papel === Papel.SALAO_ADMIN && agendamento.salaoId === user.salaoId);
    if (!podeCancelar) throw new ForbiddenException("Você não pode cancelar este agendamento.");

    // Se faz parte de um lote (vários serviços marcados juntos), cancela o
    // grupo inteiro — pro cliente, é "um" agendamento só.
    if (agendamento.grupoId) {
      await this.prisma.$transaction([
        this.prisma.agendamento.updateMany({
          where: { grupoId: agendamento.grupoId, status: { not: StatusAgendamento.CANCELADO } },
          data: { status: StatusAgendamento.CANCELADO },
        }),
        // Nunca chegou a ser pago (cliente cancelou antes de pagar) — não tem
        // o que estornar, só marca a cobrança como não vai mais acontecer.
        // Se JÁ estava aprovado, não mexe aqui: hoje não há estorno automático
        // por cancelamento (só por não comparecimento — ver marcarNaoCompareceu).
        this.prisma.pagamento.updateMany({
          where: { grupoId: agendamento.grupoId, status: StatusPagamento.PENDENTE },
          data: { status: StatusPagamento.RECUSADO },
        }),
      ]);
      return this.prisma.agendamento.findMany({ where: { grupoId: agendamento.grupoId } });
    }

    return this.prisma.agendamento.update({ where: { id }, data: { status: StatusAgendamento.CANCELADO } });
  }

  // Funcionário/dono confirma que recebeu o pagamento em dinheiro na mão do
  // cliente, presencialmente — o agendamento já nasceu CONFIRMADO (ver
  // criarLote), então isso só libera o Pagamento (PENDENTE -> APROVADO), que
  // por sua vez é o que `concluir()` exige pra permitir marcar o atendimento
  // como concluído/entrar no faturamento (ver FinanceiroService). Idempotente:
  // chamar de novo num pagamento já confirmado não dá erro.
  async confirmarPagamentoDinheiro(id: string, user: AuthUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id }, include: { funcionario: true } });
    if (!agendamento) throw new NotFoundException("Agendamento não encontrado.");

    const podeConfirmar =
      (user.papel === Papel.FUNCIONARIO && agendamento.funcionario.usuarioId === user.id) ||
      (user.papel === Papel.SALAO_ADMIN && agendamento.salaoId === user.salaoId);
    if (!podeConfirmar) throw new ForbiddenException("Você não pode confirmar o pagamento deste agendamento.");

    if (agendamento.origem !== OrigemAgendamento.CLIENTE_APP || !agendamento.grupoId) {
      throw new BadRequestException("Esse agendamento não tem uma cobrança em dinheiro pra confirmar.");
    }
    const pagamento = await this.prisma.pagamento.findFirst({ where: { grupoId: agendamento.grupoId } });
    if (!pagamento || pagamento.metodo !== MetodoPagamento.DINHEIRO) {
      throw new BadRequestException("Esse agendamento não está com pagamento em dinheiro.");
    }
    if (pagamento.status === StatusPagamento.RECUSADO || pagamento.status === StatusPagamento.ESTORNADO) {
      throw new BadRequestException("Esse pagamento foi cancelado e não pode ser confirmado.");
    }

    if (pagamento.status !== StatusPagamento.APROVADO) {
      await this.prisma.pagamento.update({ where: { id: pagamento.id }, data: { status: StatusPagamento.APROVADO } });
    }

    return this.prisma.agendamento.findMany({ where: { grupoId: agendamento.grupoId } });
  }

  // Cron a cada minuto: avisa por push o funcionário responsável assim que
  // chega o horário de um agendamento com Dinheiro ainda PENDENTE de
  // confirmação — é a rede de segurança pedida pra evitar o cliente sair sem
  // pagar (o funcionário recebe o lembrete bem na hora de atender, não só
  // quando olhar a agenda). Um aviso só por grupo (mesmo quando o cliente
  // marcou vários serviços juntos no mesmo horário).
  @Cron(CronExpression.EVERY_MINUTE)
  async avisarPagamentosDinheiroNoHorario() {
    const agora = new Date();
    // Janela curta: só o que passou a ser "hora de atender" desde a última
    // checagem (ou os últimos 5 min, na primeira rodada depois de o servidor
    // subir) — evita tanto perder agendamento quanto avisar o mesmo de novo
    // a cada minuto.
    const desde = this.ultimaChecagemLembreteDinheiro ?? new Date(agora.getTime() - 5 * 60_000);
    this.ultimaChecagemLembreteDinheiro = agora;

    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        origem: OrigemAgendamento.CLIENTE_APP,
        status: StatusAgendamento.CONFIRMADO,
        grupoId: { not: null },
        inicio: { gt: desde, lte: agora },
      },
      include: {
        funcionario: { include: { usuario: { select: { pushToken: true } } } },
        cliente: { select: { nome: true } },
      },
    });
    if (agendamentos.length === 0) return;

    const grupoIds = [...new Set(agendamentos.map((a) => a.grupoId as string))];
    const pagamentosDinheiroPendentes = await this.prisma.pagamento.findMany({
      where: { grupoId: { in: grupoIds }, metodo: MetodoPagamento.DINHEIRO, status: StatusPagamento.PENDENTE },
      select: { grupoId: true },
    });
    const gruposComDinheiroPendente = new Set(pagamentosDinheiroPendentes.map((p) => p.grupoId));

    const jaAvisados = new Set<string>();
    for (const a of agendamentos) {
      const grupoId = a.grupoId as string;
      if (!gruposComDinheiroPendente.has(grupoId) || jaAvisados.has(grupoId)) continue;
      jaAvisados.add(grupoId);

      const nomeCliente = a.cliente?.nome ?? a.clienteAvulsoNome ?? "O cliente";
      await this.push.enviarParaTokens(
        [a.funcionario.usuario.pushToken],
        "Pagamento em dinheiro",
        `${nomeCliente} vai pagar em dinheiro por este atendimento — confirme o recebimento no app assim que ele pagar, pra não esquecer.`,
        { tipo: "PAGAMENTO_DINHEIRO_PENDENTE", agendamentoId: a.id },
      );
    }
  }

  // O funcionário marca o atendimento como concluído (entra no financeiro
  // dele/do salão). Se veio do app do cliente, exige que o pagamento já
  // esteja aprovado — evita marcar como concluído (e contar no faturamento)
  // um horário que na verdade não foi pago ainda.
  async concluir(id: string, user: AuthUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id }, include: { funcionario: true } });
    if (!agendamento) throw new NotFoundException("Agendamento não encontrado.");

    const podeConcluir =
      (user.papel === Papel.FUNCIONARIO && agendamento.funcionario.usuarioId === user.id) ||
      (user.papel === Papel.SALAO_ADMIN && agendamento.salaoId === user.salaoId);
    if (!podeConcluir) throw new ForbiddenException("Você não pode concluir este agendamento.");

    if (agendamento.origem === OrigemAgendamento.CLIENTE_APP && agendamento.grupoId) {
      const pagamento = await this.prisma.pagamento.findFirst({ where: { grupoId: agendamento.grupoId } });
      if (pagamento && pagamento.status !== StatusPagamento.APROVADO) {
        throw new BadRequestException("O pagamento desse agendamento ainda não foi confirmado.");
      }
    }

    return this.prisma.agendamento.update({ where: { id }, data: { status: StatusAgendamento.CONCLUIDO } });
  }

  // Funcionário/salao marca que o cliente não apareceu no horário — retém
  // 50% do valor pago como multa (estornando o resto) e libera o profissional
  // pro resto da agenda. Aplica ao GRUPO inteiro (todos os serviços marcados
  // juntos nesse horário), já que "não comparecimento" é sobre o horário, não
  // sobre um serviço específico dentro dele.
  async marcarNaoCompareceu(id: string, user: AuthUser) {
    const agendamento = await this.prisma.agendamento.findUnique({ where: { id }, include: { funcionario: true } });
    if (!agendamento) throw new NotFoundException("Agendamento não encontrado.");

    const podeMarcar =
      (user.papel === Papel.FUNCIONARIO && agendamento.funcionario.usuarioId === user.id) ||
      (user.papel === Papel.SALAO_ADMIN && agendamento.salaoId === user.salaoId);
    if (!podeMarcar) throw new ForbiddenException("Você não pode marcar isso nesse agendamento.");
    if (agendamento.status !== StatusAgendamento.CONFIRMADO) {
      throw new BadRequestException("Só é possível marcar não comparecimento em um agendamento confirmado.");
    }

    const grupoId = agendamento.grupoId ?? agendamento.id;
    const grupo = agendamento.grupoId
      ? await this.prisma.agendamento.findMany({ where: { grupoId: agendamento.grupoId } })
      : [agendamento];

    const pagamento = await this.prisma.pagamento.findFirst({ where: { grupoId } });

    await this.prisma.$transaction(
      grupo.map((a) =>
        this.prisma.agendamento.update({
          where: { id: a.id },
          data: {
            status: StatusAgendamento.NAO_COMPARECEU,
            // Sem multa em dinheiro quando o horário veio da cota de um
            // pacote mensal — não existe Pagamento avulso pra reter/estornar
            // aqui, o cliente já paga a mensalidade à parte. A vaga da
            // semana ainda é contada como usada (ver usosDaAssinaturaNaSemana).
            valorMultaCentavos: a.assinaturaPacoteId ? null : Math.round(a.precoCentavos * FRACAO_MULTA_NAO_COMPARECIMENTO),
          },
        }),
      ),
    );

    // Estorna 50% ao cliente (o resto fica retido com o salão como
    // multa) — só se realmente foi pago pelo app. Agendamento lançado
    // manualmente pelo salão (sem Pagamento) não tem o que estornar.
    if (pagamento && pagamento.status === StatusPagamento.APROVADO && pagamento.gatewayPagamentoId) {
      const valorEstornoCentavos = pagamento.valorCentavos - Math.round(pagamento.valorCentavos * FRACAO_MULTA_NAO_COMPARECIMENTO);
      try {
        const token = await this.mercadoPago.tokenDaSalao(agendamento.salaoId);
        await this.mercadoPago.estornarPagamento(pagamento.gatewayPagamentoId, token, valorEstornoCentavos);
        await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: { status: StatusPagamento.PARCIALMENTE_ESTORNADO, valorEstornadoCentavos: valorEstornoCentavos },
        });
      } catch (e) {
        // O agendamento já foi marcado como não comparecido de qualquer
        // forma (o salão não deve ficar travada esperando o Mercado
        // Pago) — mas registra bem alto, porque isso precisa de atenção
        // manual: o cliente não foi estornado.
        this.logger.error(
          `FALHA AO ESTORNAR multa de não comparecimento — pagamento ${pagamento.id}, agendamento ${id}: ${e}. Requer estorno manual.`,
        );
      }
    }

    return this.prisma.agendamento.findMany({ where: { grupoId } });
  }

  // ---------- helpers privados ----------

  // Transforma os itens escolhidos (serviço avulso ou pacote) em etapas, na
  // ordem em que o cliente os escolheu. Um pacote cujos serviços são de UMA
  // categoria só continua sendo uma etapa única (com o preço do pacote); um
  // pacote que mistura categorias (ex: "Dia da noiva": cabelo + unha) é
  // desmembrado numa etapa por serviço — cada uma com a sua profissional —,
  // dividindo o preço do pacote proporcionalmente ao preço de cada serviço (a
  // soma continua sendo exatamente o preço do pacote).
  private async resolverItens(
    itens: { servicoId?: string; pacoteId?: string; funcionarioId?: string }[],
    funcionariosPorCategoria?: Record<string, string>,
  ): Promise<ItemResolvido[]> {
    // Só aceita chaves que são categorias de verdade e valores string — o resto
    // do objeto (vindo do cliente) é descartado.
    const porCategoria = new Map<string, string>();
    for (const [categoria, id] of Object.entries(funcionariosPorCategoria ?? {})) {
      if ((Object.values(CategoriaServico) as string[]).includes(categoria) && typeof id === "string" && id) {
        porCategoria.set(categoria, id);
      }
    }
    const etapas: ItemResolvido[] = [];
    for (const item of itens) {
      if (item.servicoId) {
        const servico = await this.prisma.servico.findUnique({ where: { id: item.servicoId } });
        if (!servico || !servico.ativo) throw new BadRequestException("Serviço inválido.");
        etapas.push({
          servicoId: servico.id,
          duracaoMinutos: servico.duracaoMinutos,
          precoCentavos: servico.precoCentavos,
          salaoId: servico.salaoId,
          categoria: servico.categoria,
          funcionarioId: item.funcionarioId ?? porCategoria.get(servico.categoria),
        });
        continue;
      }
      if (item.pacoteId) {
        const pacote = await this.prisma.pacote.findUnique({
          where: { id: item.pacoteId },
          include: { servicos: { include: { servico: true } } },
        });
        if (!pacote || !pacote.ativo) throw new BadRequestException("Pacote inválido.");

        // Mesma ordem usada pelo app (ordenarServicosDoPacote, no pacote compartilhado).
        const servicosDoPacote = ordenarServicosDoPacote(pacote.servicos);
        const categorias = new Set(servicosDoPacote.map((ps) => ps.servico.categoria));
        if (categorias.size <= 1) {
          const duracaoMinutos = servicosDoPacote.reduce((total, ps) => total + ps.servico.duracaoMinutos, 0) || 30;
          etapas.push({
            pacoteId: pacote.id,
            duracaoMinutos,
            precoCentavos: pacote.precoCentavos,
            salaoId: pacote.salaoId,
            categoria: servicosDoPacote[0]?.servico.categoria ?? null,
            funcionarioId:
              item.funcionarioId ?? (servicosDoPacote[0] ? porCategoria.get(servicosDoPacote[0].servico.categoria) : undefined),
          });
          continue;
        }

        const somaBase = servicosDoPacote.reduce((total, ps) => total + ps.servico.precoCentavos, 0);
        let acumulado = 0;
        servicosDoPacote.forEach((ps, indice) => {
          const ultimo = indice === servicosDoPacote.length - 1;
          const proporcao = somaBase > 0 ? ps.servico.precoCentavos / somaBase : 1 / servicosDoPacote.length;
          const preco = ultimo ? pacote.precoCentavos - acumulado : Math.round(pacote.precoCentavos * proporcao);
          acumulado += preco;
          etapas.push({
            servicoId: ps.servico.id,
            pacoteId: pacote.id,
            duracaoMinutos: ps.servico.duracaoMinutos,
            precoCentavos: preco,
            salaoId: pacote.salaoId,
            categoria: ps.servico.categoria,
            // Pacote que mistura categorias: cada etapa usa a profissional
            // escolhida pra sua categoria ou, sem escolha, uma livre que atenda.
            funcionarioId: porCategoria.get(ps.servico.categoria),
          });
        });
        continue;
      }
      throw new BadRequestException("Informe um serviço ou um pacote para cada item do agendamento.");
    }
    if (etapas.length === 0) throw new BadRequestException("Informe ao menos um serviço.");
    return etapas;
  }

  // Busca os funcionários ativos/disponíveis do salão junto com o
  // expediente semanal e as folgas que caem dentro do intervalo pedido —
  // tudo que é preciso pra calcular disponibilidade sem novas queries por dia.
  private funcionariosComAgenda(salaoId: string, inicioIntervalo: Date, fimIntervalo: Date) {
    return this.prisma.funcionario.findMany({
      where: { salaoId, ativo: true, disponivel: true },
      include: {
        horarios: true,
        folgas: { where: { inicio: { lt: fimIntervalo }, fim: { gt: inicioIntervalo } } },
      },
    });
  }

  // Distribui as etapas do lote entre as profissionais do salão: etapas em
  // sequência a partir de `inicio` (uma começa quando a anterior termina), cada
  // uma com a profissional escolhida pro serviço — ou, na falta de escolha, a
  // preferida do lote (`funcionarioPreferidaId`, se atende a categoria) ou
  // qualquer outra livre que atenda a categoria. Lança BadRequest com o motivo
  // específico quando não dá (profissional não atende a área, de folga, fora do
  // expediente, horário já reservado).
  private async planejarEtapas(
    salaoId: string,
    etapas: ItemResolvido[],
    inicio: Date,
    funcionarioPreferidaId?: string,
  ): Promise<EtapaPlanejada[]> {
    const duracaoTotal = etapas.reduce((total, e) => total + e.duracaoMinutos, 0);
    const fimTotal = addMinutos(inicio, duracaoTotal);

    const funcionarios = await this.funcionariosComAgenda(salaoId, inicio, fimTotal);
    const agendamentos = await this.buscarAgendamentosNoIntervalo(
      funcionarios.map((f) => f.id),
      inicio,
      fimTotal,
    );

    // Se alguma profissional foi pedida explicitamente mas não está na lista
    // (inativa, indisponível ou de outro salão), falha com mensagem clara em
    // vez de cair silenciosamente em outra.
    for (const etapa of etapas) {
      if (etapa.funcionarioId && !funcionarios.some((f) => f.id === etapa.funcionarioId)) {
        throw new BadRequestException("Profissional indisponível para agendamento.");
      }
    }
    if (funcionarioPreferidaId && !funcionarios.some((f) => f.id === funcionarioPreferidaId)) {
      throw new BadRequestException("Profissional indisponível para agendamento.");
    }

    const plano: EtapaPlanejada[] = [];
    let cursor = inicio;
    for (const etapa of etapas) {
      const inicioEtapa = cursor;
      const fimEtapa = addMinutos(inicioEtapa, etapa.duracaoMinutos);
      cursor = fimEtapa;

      const escolhida = this.escolherFuncionariaParaEtapa(
        funcionarios,
        agendamentos,
        etapa,
        inicioEtapa,
        fimEtapa,
        funcionarioPreferidaId,
      );
      plano.push({ ...etapa, funcionarioId: escolhida, inicio: inicioEtapa, fim: fimEtapa });
    }
    return plano;
  }

  private escolherFuncionariaParaEtapa(
    funcionarios: FuncionarioComAgenda[],
    agendamentos: { funcionarioId: string; inicio: Date; fim: Date }[],
    etapa: EtapaConsulta,
    inicio: Date,
    fim: Date,
    funcionarioPreferidaId?: string,
  ): string {
    // Escolha explícita: precisa dar certo com ela, senão explica o motivo.
    if (etapa.funcionarioId) {
      const funcionaria = funcionarios.find((f) => f.id === etapa.funcionarioId)!;
      const motivo = motivoIndisponivel(funcionaria, agendamentos, etapa.categoria, inicio, fim);
      if (motivo) throw new BadRequestException(motivo);
      return funcionaria.id;
    }

    const candidatas = funcionarios.filter((f) => funcionariaAtende(f, etapa.categoria));
    // A preferida do lote vem primeiro, se atende essa etapa.
    candidatas.sort((a, b) => Number(b.id === funcionarioPreferidaId) - Number(a.id === funcionarioPreferidaId));

    for (const candidata of candidatas) {
      if (!motivoIndisponivel(candidata, agendamentos, etapa.categoria, inicio, fim)) return candidata.id;
    }

    const area = etapa.categoria ? ` de ${rotuloCategoria(etapa.categoria).toLowerCase()}` : "";
    throw new BadRequestException(
      candidatas.length === 0
        ? `Este salão ainda não tem profissional${area} cadastrada. Escolha outro serviço ou fale com o salão.`
        : `Nenhuma profissional${area} livre às ${formatarHorario(inicio)}. Escolha outro horário.`,
    );
  }

  private buscarAgendamentosNoIntervalo(funcionarioIds: string[], inicio: Date, fim: Date) {
    return this.prisma.agendamento.findMany({
      where: { funcionarioId: { in: funcionarioIds }, ...filtroStatusAtivo(), inicio: { lt: fim }, fim: { gt: inicio } },
      select: { funcionarioId: true, inicio: true, fim: true },
    });
  }
}

// CONFIRMADO sempre bloqueia o horário; PENDENTE (pagamento em andamento) só
// bloqueia enquanto ainda está "fresco" — depois de PENDENTE_EXPIRA_MINUTOS,
// trata como se o cliente tivesse desistido do pagamento (ver comentário na
// constante). Evita precisar de um job em background só pra liberar slots
// de pagamentos abandonados.
function filtroStatusAtivo() {
  return {
    OR: [
      { status: StatusAgendamento.CONFIRMADO },
      { status: StatusAgendamento.PENDENTE, criadoEm: { gte: new Date(Date.now() - PENDENTE_EXPIRA_MINUTOS * 60_000) } },
    ],
  };
}

// Quebra o expediente de um dia em uma ou duas janelas (antes/depois do
// almoço, se houver). Sem almoço cadastrado, é uma janela só.
function gerarJanelasDoDia(horario: HorarioTrabalho, dia: Date): { inicio: Date; fim: Date }[] {
  const inicio = combinarDataHora(dia, horario.horaInicio);
  const fim = combinarDataHora(dia, horario.horaFim);

  if (horario.inicioAlmoco && horario.fimAlmoco) {
    const inicioAlmoco = combinarDataHora(dia, horario.inicioAlmoco);
    const fimAlmoco = combinarDataHora(dia, horario.fimAlmoco);
    return [
      { inicio, fim: inicioAlmoco },
      { inicio: fimAlmoco, fim },
    ];
  }
  return [{ inicio, fim }];
}

// Gera os horários de início possíveis (de INTERVALO_ENTRE_INICIOS_MINUTOS em
// INTERVALO_ENTRE_INICIOS_MINUTOS) pro funcionário num dia, considerando seu
// expediente cadastrado (HorarioTrabalho) — se ele não trabalha nesse dia da
// semana, retorna lista vazia.
function slotsDoFuncionarioNoDia(
  funcionario: FuncionarioComAgenda,
  dia: Date,
  duracaoMinutos: number,
): { inicio: Date; fim: Date }[] {
  const diaSemana = dia.getDay();
  const horario = funcionario.horarios.find((h) => h.diaSemana === diaSemana);
  if (!horario) return [];

  const slots: { inicio: Date; fim: Date }[] = [];
  for (const janela of gerarJanelasDoDia(horario, dia)) {
    for (
      let inicio = new Date(janela.inicio);
      addMinutos(inicio, duracaoMinutos) <= janela.fim;
      inicio = addMinutos(inicio, INTERVALO_ENTRE_INICIOS_MINUTOS)
    ) {
      slots.push({ inicio: new Date(inicio), fim: addMinutos(inicio, duracaoMinutos) });
    }
  }
  return slots;
}

// Confere se [inicio, fim) cabe inteiro dentro de alguma janela do expediente
// do funicionário no dia de "inicio" — usado na hora de CRIAR o agendamento
// (fora do fluxo de "listar slots"), pra bloquear tentativas de marcar direto
// na API fora do horário de trabalho ou durante o almoço.
function dentroDoExpediente(funcionario: FuncionarioComAgenda, inicio: Date, fim: Date): boolean {
  const diaSemana = inicio.getDay();
  const horario = funcionario.horarios.find((h) => h.diaSemana === diaSemana);
  if (!horario) return false;
  return gerarJanelasDoDia(horario, inicio).some((janela) => inicio >= janela.inicio && fim <= janela.fim);
}

// Categorias em que a profissional atua (null = atende todas) — ver
// Funcionario.especialidades no schema.
function especialidadesDe(funcionario: { especialidades?: unknown }): string[] | null {
  return Array.isArray(funcionario.especialidades) ? (funcionario.especialidades as string[]) : null;
}

function funcionariaAtende(funcionario: { especialidades?: unknown }, categoria: CategoriaServico | null): boolean {
  return categoria === null || atendeCategoria(especialidadesDe(funcionario), categoria);
}

// Devolve o motivo (já em texto pro cliente) de a profissional NÃO poder fazer
// essa etapa em [inicio, fim), ou null se pode. Usado tanto pra validar uma
// escolha explícita quanto pra filtrar candidatas e montar a disponibilidade.
function motivoIndisponivel(
  funcionario: FuncionarioComAgenda,
  agendamentos: { funcionarioId: string; inicio: Date; fim: Date }[],
  categoria: CategoriaServico | null,
  inicio: Date,
  fim: Date,
): string | null {
  if (!funcionariaAtende(funcionario, categoria)) {
    return categoria
      ? `Essa profissional não realiza serviços de ${rotuloCategoria(categoria).toLowerCase()}. Escolha outra profissional.`
      : "Essa profissional não realiza esse serviço.";
  }
  if (!folgaLivre(funcionario.folgas, inicio, fim)) {
    return "Profissional de folga nesse horário. Escolha outro horário ou profissional.";
  }
  if (!dentroDoExpediente(funcionario, inicio, fim)) {
    return "Horário fora do expediente da profissional (ou durante o horário de almoço). Escolha outro horário.";
  }
  if (!slotLivre(agendamentos, funcionario.id, inicio, fim)) {
    return "Esse horário acabou de ser reservado. Escolha outro.";
  }
  return null;
}

// Converte os parâmetros da consulta de disponibilidade em etapas: o formato
// novo (`etapas`) ou o antigo (uma etapa só, sem categoria — qualquer
// profissional, ou a escolhida em `funcionarioId`).
function montarConsulta(duracaoMinutos: number, funcionarioId?: string, etapas?: EtapaDisponibilidade[]): EtapaConsulta[] {
  if (etapas && etapas.length > 0) {
    return etapas.map((e) => ({
      duracaoMinutos: e.duracaoMinutos,
      categoria: e.categoria ?? null,
      funcionarioId: e.funcionarioId || undefined,
    }));
  }
  return [{ duracaoMinutos, categoria: null, funcionarioId: funcionarioId || undefined }];
}

function slotLivre(
  agendamentos: { funcionarioId: string; inicio: Date; fim: Date }[],
  funcionarioId: string,
  inicio: Date,
  fim: Date,
): boolean {
  return !agendamentos.some((a) => a.funcionarioId === funcionarioId && a.inicio < fim && a.fim > inicio);
}

function folgaLivre(folgas: { inicio: Date; fim: Date }[], inicio: Date, fim: Date): boolean {
  return !folgas.some((f) => f.inicio < fim && f.fim > inicio);
}

function combinarDataHora(dia: Date, horaMinuto: string): Date {
  const [horas, minutos] = horaMinuto.split(":").map(Number);
  const data = new Date(dia);
  data.setHours(horas, minutos, 0, 0);
  return data;
}

function addMinutos(data: Date, minutos: number): Date {
  return new Date(data.getTime() + minutos * 60_000);
}

function formatarData(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarHorario(data: Date): string {
  const horas = String(data.getHours()).padStart(2, "0");
  const minutos = String(data.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

// Traduz os motivos de recusa mais comuns que o Mercado Pago devolve em
// status_detail pra uma mensagem que faça sentido pro cliente final — o
// código cru (ex: "cc_rejected_insufficient_amount") não diz nada pra quem
// não é integrador. Lista não exaustiva de propósito: cobre os motivos mais
// frequentes, com uma mensagem genérica de fallback pros demais.
// Exportada (não só usada aqui) — a AssinaturasPagamentoService reusa a mesma
// tradução pra cobrança da mensalidade/anuidade do SaaS, mesmo mecanismo de
// cartão (ver comentário acima).
export function traduzirMotivoRecusaCartao(statusDetail: string | null): string {
  const mensagens: Record<string, string> = {
    cc_rejected_insufficient_amount: "Cartão sem limite suficiente para esse valor.",
    cc_rejected_bad_filled_security_code: "Código de segurança (CVV) incorreto.",
    cc_rejected_bad_filled_date: "Data de validade incorreta.",
    cc_rejected_bad_filled_card_number: "Número do cartão incorreto.",
    cc_rejected_bad_filled_other: "Dados do cartão incorretos.",
    cc_rejected_call_for_authorize: "O banco exige autorização — ligue para o emissor do cartão ou tente outro.",
    cc_rejected_card_disabled: "Cartão desabilitado. Entre em contato com o banco ou tente outro cartão.",
    cc_rejected_duplicated_payment: "Já existe um pagamento igual recente — aguarde alguns minutos ou tente outro cartão.",
    cc_rejected_high_risk: "O pagamento foi recusado por segurança. Tente outro cartão.",
    cc_rejected_max_attempts: "Número máximo de tentativas excedido. Tente outro cartão.",
    cc_rejected_invalid_installments: "Parcelamento inválido para esse cartão.",
    cc_rejected_other_reason: "O cartão recusou o pagamento.",
  };
  const mensagem = (statusDetail && mensagens[statusDetail]) || "O cartão recusou o pagamento.";
  return `Pagamento não aprovado: ${mensagem} Tente outro cartão ou pague com Pix.`;
}
