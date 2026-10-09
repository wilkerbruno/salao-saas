import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { CATEGORIAS_SERVICO, CategoriaServico, categoriasDaBusca, Papel, StatusAgendamento } from "@salao-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoService } from "../pagamentos/mercadopago.service";
import { ConfiguracoesService } from "../configuracoes/configuracoes.service";
import { GeocodificacaoService } from "../common/geocodificacao/geocodificacao.service";
import { estaForaDaCarencia } from "../assinaturas/assinatura-status.util";
import { UpdateSalaoDto } from "./dto/update-salao.dto";
import { CreateAvaliacaoDto } from "./dto/create-avaliacao.dto";
import { camposEndereco } from "../common/endereco.util";

// Campos que precisam estar selecionados numa consulta de salão pra
// comCoordenadasResolvidas (abaixo) conseguir aplicar o fallback de
// geocodificação por endereço — ver GeocodificacaoService.
const CAMPOS_PARA_FALLBACK_DE_COORDENADAS = {
  enderecoLatitude: true,
  enderecoLongitude: true,
  logradouro: true,
  numero: true,
  bairro: true,
  cidade: true,
  uf: true,
} as const;

// Campos seguros para expor sem autenticação (busca de proximidade, tela
// pública "sobre o salão" etc). Nunca inclua e-mail/telefone de usuários
// nem dados de assinatura/faturamento aqui. mercadoPagoPublicKey é a chave
// PÚBLICA usada pra tokenizar cartão direto no aparelho do cliente (ver
// CartaoScreen) — ao contrário do access token, é seguro expor. Vem do banco
// só por compatibilidade; na prática quase sempre é substituída pela chave
// da própria aplicação (ver comChavePublicaResolvida abaixo).
const SELECT_PUBLICO = {
  id: true,
  nome: true,
  endereco: true,
  telefone: true,
  latitude: true,
  longitude: true,
  logoUrl: true,
  notaMedia: true,
  totalAvaliacoes: true,
  mercadoPagoPublicKey: true,
  observacaoAgendamento: true,
} as const;

// Pra quem já tem acesso ao salão (dono, funcionário dele, ou SAAS_ADMIN —
// ver SaloesController.garantirAcesso): em cima do que já é público,
// inclui os campos separados do endereço (pra reabrir o formulário de edição
// já preenchido — ver EditarPerfilScreen) e o status (não o segredo) da
// conexão com o Mercado Pago. NUNCA inclua mercadoPagoAccessToken/
// mercadoPagoRefreshToken aqui nem troque isso por um `include` genérico.
const SELECT_DETALHE = {
  ...SELECT_PUBLICO,
  cep: true,
  logradouro: true,
  numero: true,
  complemento: true,
  bairro: true,
  cidade: true,
  uf: true,
  mercadoPagoUserId: true,
  mercadoPagoConectadoEm: true,
  criadoEm: true,
  // Ver Salao.visibilidadeRestrita no schema — precisa estar aqui pra
  // tela de detalhe do painel SaaS (admin-web) saber o estado atual do
  // "modo teste" e mostrar/esconder a seção de clientes autorizados.
  visibilidadeRestrita: true,
} as const;

// Tamanho máximo aceito pro arquivo de logo enviado (antes de comprimir).
const TAMANHO_MAXIMO_LOGO_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class SaloesService {
  constructor(
    private prisma: PrismaService,
    private mercadoPago: MercadoPagoService,
    private configuracoes: ConfiguracoesService,
    private geocodificacao: GeocodificacaoService,
  ) {}

  // O Mercado Pago nem sempre devolve a public_key da conta conectada no
  // OAuth (ver MercadoPagoService.trocarCodigoPorToken) — como a tokenização
  // de cartão não depende de quem vai receber o dinheiro, cai pra chave da
  // própria aplicação (MERCADOPAGO_PUBLIC_KEY) sempre que a do salão não
  // veio, em vez de deixar o cliente sem poder pagar com cartão.
  private comChavePublicaResolvida<T extends { mercadoPagoPublicKey: string | null }>(salao: T): T {
    return { ...salao, mercadoPagoPublicKey: salao.mercadoPagoPublicKey ?? this.mercadoPago.publicKeyPlataforma };
  }

  // Decide que coordenada mostrar pro app: o GPS que o dono capturou em "Mais
  // > Localização" quando existir (mais preciso) ou, se ele ainda não
  // capturou, o fallback calculado a partir do endereço cadastrado (ver
  // GeocodificacaoService) — assim um salão sem GPS ainda aparece no
  // mapa, na posição aproximada do endereço, em vez de sumir da busca
  // "perto de você". `latitude`/`longitude` ficam `null` só quando não há GPS
  // NEM endereço completo o bastante pra geocodificar. Nunca expõe os campos
  // internos de cache/endereço usados só pra calcular isso (ver
  // CAMPOS_PARA_FALLBACK_DE_COORDENADAS) — o formato devolvido pro app é
  // sempre o mesmo de antes dessa feature existir.
  private async comCoordenadasResolvidas<
    T extends { id: string; latitude: number | null; longitude: number | null } & Record<
      keyof typeof CAMPOS_PARA_FALLBACK_DE_COORDENADAS,
      unknown
    >,
  >(salao: T): Promise<Omit<T, keyof typeof CAMPOS_PARA_FALLBACK_DE_COORDENADAS>> {
    const { enderecoLatitude, enderecoLongitude, logradouro, numero, bairro, cidade, uf, ...resto } = salao as any;
    if (resto.latitude != null && resto.longitude != null) return resto;

    const fallback = await this.geocodificacao.resolverCoordenadas({
      id: salao.id,
      enderecoLatitude,
      enderecoLongitude,
      logradouro,
      numero,
      bairro,
      cidade,
      uf,
    });
    return { ...resto, latitude: fallback?.latitude ?? null, longitude: fallback?.longitude ?? null };
  }

  // Usado pelo painel SaaS (SAAS_ADMIN) para listar todas os salões assinantes.
  listarTodas() {
    return this.prisma.salao.findMany({
      include: { assinatura: { include: { plano: true } }, funcionarios: true },
      orderBy: { criadoEm: "desc" },
    });
  }

  async buscarPorId(id: string) {
    // Select explícito (não `include` genérico) — ver comentário em
    // SELECT_DETALHE: esse endpoint é alcançável por qualquer funcionário da
    // próprio salão, não só o dono, então nunca pode vazar os segredos
    // do Mercado Pago.
    const salao = await this.prisma.salao.findUnique({
      where: { id },
      select: {
        ...SELECT_DETALHE,
        assinatura: { include: { plano: true, faturas: { orderBy: { vencimentoEm: "desc" }, take: 12 } } },
        funcionarios: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
      },
    });
    if (!salao) throw new NotFoundException("Salão não encontrado.");
    return salao;
  }

  // Público: dados mínimos para a Home do app do cliente (nome, endereço, estrelas).
  // Inclui o fallback de coordenadas por endereço (ver comCoordenadasResolvidas)
  // — é o que alimenta o botão "Como chegar" (abrirNoMapa) no detalhe da
  // salão mesmo quando o dono ainda não capturou o GPS.
  async buscarInfoPublica(id: string) {
    const salao = await this.prisma.salao.findUnique({
      where: { id },
      select: { ...SELECT_PUBLICO, ...CAMPOS_PARA_FALLBACK_DE_COORDENADAS },
    });
    if (!salao) throw new NotFoundException("Salão não encontrado.");
    return this.comChavePublicaResolvida(await this.comCoordenadasResolvidas(salao));
  }

  async atualizar(id: string, dto: UpdateSalaoDto) {
    const { endereco, ...resto } = dto;
    const dadosEndereco = endereco
      ? {
          ...camposEndereco(endereco),
          // Endereço mudou: invalida o fallback de geocodificação cacheado
          // (ver GeocodificacaoService) — é recalculado logo abaixo.
          enderecoLatitude: null,
          enderecoLongitude: null,
        }
      : {};

    if (resto.observacaoAgendamento !== undefined) {
      (resto as any).observacaoAgendamento = resto.observacaoAgendamento.trim() || null;
    }
    const salao = await this.prisma.salao.update({ where: { id }, data: { ...resto, ...dadosEndereco } });

    if (endereco) {
      // Fora do await principal — não trava a resposta da edição esperando o
      // Nominatim. Se falhar agora, só fica sem fallback até a próxima
      // leitura tentar de novo (ver GeocodificacaoService.resolverCoordenadas).
      this.geocodificacao.geocodificarEAtualizar(id, salao).catch(() => {});
    }

    return salao;
  }

  // Recebe o arquivo de logo enviado pelo dono (registro do salão ou
  // Mais > Logo), redimensiona/comprime com sharp e guarda como data URL
  // (base64) direto no banco — ver comentário do campo logoUrl no schema.
  async atualizarLogo(id: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Envie um arquivo de imagem no campo "logo".');
    if (!file.mimetype.startsWith("image/")) {
      throw new BadRequestException("O arquivo enviado precisa ser uma imagem.");
    }
    if (file.size > TAMANHO_MAXIMO_LOGO_BYTES) {
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

    const logoUrl = `data:image/jpeg;base64,${comprimida.toString("base64")}`;
    return this.prisma.salao.update({
      where: { id },
      data: { logoUrl },
      select: { id: true, logoUrl: true },
    });
  }

  // Público: o app do cliente usa isso para montar a lista de profissionais
  // no passo "Escolher profissional" do agendamento.
  listarFuncionariosPublico(salaoId: string) {
    return this.prisma.funcionario.findMany({
      where: { salaoId, ativo: true, disponivel: true },
      include: { usuario: { select: { id: true, nome: true } } },
    });
  }

  // Home do app do cliente. Busca os salões com localização cadastrada
  // dentro do raio (fórmula de Haversine, em memória — sem depender de
  // extensão geoespacial do MySQL, suficiente pro volume de um SaaS ainda
  // pequeno), com filtro opcional por nome, e ordena colocando à frente:
  // 1) salões onde o cliente já teve algum agendamento; 2) as com melhor
  // nota média; 3) desempate por distância.
  //
  // Inclui no "tem localização cadastrada" tanto quem já capturou o GPS
  // (latitude/longitude) quanto quem só tem endereço completo o bastante pra
  // ser geocodificado (ver comCoordenadasResolvidas/GeocodificacaoService) —
  // sem isso, um salão que só preencheu o endereço no cadastro nunca
  // apareceria aqui nem no mapa.
  async listarProximas(latitude: number, longitude: number, raioKm = 15, nome?: string, clienteId?: string, categoriaFiltro?: string) {
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException("Informe latitude e longitude válidas.");
    }

    // Busca: pelo nome do salão, pelo nome de um serviço ativo ("progressiva")
    // ou pela ÁREA que o texto pede ("unha", "make", "depilação"...) — ver
    // categoriasDaBusca. Um filtro explícito de categoria (chips da Home) exige
    // serviço ativo daquela área.
    const termo = nome?.trim();
    const categoriasPedidas = termo ? categoriasDaBusca(termo) : [];
    const categoriaEscolhida = (CATEGORIAS_SERVICO.map((c) => c.valor) as string[]).includes(categoriaFiltro ?? "")
      ? (categoriaFiltro as CategoriaServico)
      : undefined;
    const condicoes: Prisma.SalaoWhereInput[] = [];
    if (termo) {
      condicoes.push({
        OR: [
          { nome: { contains: termo } },
          { servicos: { some: { ativo: true, nome: { contains: termo } } } },
          ...(categoriasPedidas.length > 0
            ? [{ servicos: { some: { ativo: true, categoria: { in: categoriasPedidas } } } }]
            : []),
        ],
      });
    }
    if (categoriaEscolhida) condicoes.push({ servicos: { some: { ativo: true, categoria: categoriaEscolhida } } });
    const filtroDeBusca: Prisma.SalaoWhereInput | undefined = condicoes.length > 0 ? { AND: condicoes } : undefined;

    const [candidatas, agendamentosDoCliente, autorizacoesDoCliente, { horasCarenciaAposVencimento }] = await Promise.all([
      this.prisma.salao.findMany({
        where: {
          AND: [
            {
              OR: [
                { latitude: { not: null }, longitude: { not: null } },
                { enderecoLatitude: { not: null }, enderecoLongitude: { not: null } },
                { cidade: { not: null }, uf: { not: null } },
              ],
            },
            ...(filtroDeBusca ? [filtroDeBusca] : []),
          ],
        },
        select: {
          ...SELECT_PUBLICO,
          ...CAMPOS_PARA_FALLBACK_DE_COORDENADAS,
          visibilidadeRestrita: true,
          assinatura: { select: { status: true, bloqueadaEm: true, trialTerminaEm: true } },
        },
      }),
      clienteId
        ? this.prisma.agendamento.findMany({
            where: { clienteId },
            select: { salaoId: true },
            distinct: ["salaoId"],
          })
        : Promise.resolve([]),
      // Salões em "modo teste" (visibilidadeRestrita) que ESTE cliente
      // está autorizado a ver — ver Salao.visibilidadeRestrita.
      clienteId
        ? this.prisma.salaoClienteAutorizado.findMany({
            where: { clienteId },
            select: { salaoId: true },
          })
        : Promise.resolve([]),
      this.configuracoes.obter(),
    ]);

    const idsJaAgendados = new Set(agendamentosDoCliente.map((a) => a.salaoId));
    const idsAutorizados = new Set(autorizacoesDoCliente.map((a) => a.salaoId));

    const resolvidas = await Promise.all(
      candidatas
        // Assinatura vencida há mais de `horasCarenciaAposVencimento`: some da
        // busca do cliente (a equipe já foi bloqueada bem antes disso — ver
        // AssinaturaGuard). Sem assinatura cadastrada (não deveria acontecer no
        // fluxo normal) não é filtrada, pra não esconder por engano.
        .filter((salao) => !salao.assinatura || !estaForaDaCarencia(salao.assinatura, horasCarenciaAposVencimento))
        // "Modo teste": só aparece pros clientes explicitamente autorizados
        // (ver Salao.visibilidadeRestrita/SalaoClienteAutorizado).
        .filter((salao) => !salao.visibilidadeRestrita || idsAutorizados.has(salao.id))
        .map(async (candidata) => {
          const { assinatura, visibilidadeRestrita, ...candidataSemAssinatura } = candidata;
          const salao = await this.comCoordenadasResolvidas(candidataSemAssinatura);
          // Nem GPS nem endereço geocodificável: fica de fora, como já era
          // antes (nunca existiu uma posição pra mostrar no mapa).
          if (salao.latitude == null || salao.longitude == null) return null;
          return {
            ...this.comChavePublicaResolvida(salao),
            distanciaKm: distanciaHaversineKm(latitude, longitude, salao.latitude, salao.longitude),
            jaAgendou: idsJaAgendados.has(salao.id),
          };
        }),
    );

    return resolvidas
      .filter((salao): salao is NonNullable<typeof salao> => salao != null)
      .filter((salao) => salao.distanciaKm <= raioKm)
      .sort((a, b) => {
        if (a.jaAgendou !== b.jaAgendou) return a.jaAgendou ? -1 : 1;
        if (b.notaMedia !== a.notaMedia) return b.notaMedia - a.notaMedia;
        return a.distanciaKm - b.distanciaKm;
      });
  }

  // Cliente avalia (ou atualiza a própria avaliação) um salão. Depois de
  // gravar, recalcula a média/contagem cacheadas em Salao.notaMedia e
  // Salao.totalAvaliacoes, usadas em toda listagem (evita agregar a tabela
  // Avaliacao inteira toda vez que alguém abre a lista de salões).
  async avaliar(salaoId: string, clienteId: string, dto: CreateAvaliacaoDto) {
    const salao = await this.prisma.salao.findUnique({ where: { id: salaoId } });
    if (!salao) throw new NotFoundException("Salão não encontrado.");

    if (!(await this.clienteJaFoiAtendido(salaoId, clienteId))) {
      throw new ForbiddenException(
        "Você só pode avaliar depois que o horário do seu atendimento nesse salão passar.",
      );
    }

    await this.prisma.avaliacao.upsert({
      where: { salaoId_clienteId: { salaoId, clienteId } },
      update: { nota: dto.nota, comentario: dto.comentario },
      create: { salaoId, clienteId, nota: dto.nota, comentario: dto.comentario },
    });

    const agregado = await this.prisma.avaliacao.aggregate({
      where: { salaoId },
      _avg: { nota: true },
      _count: { nota: true },
    });

    const atualizada = await this.prisma.salao.update({
      where: { id: salaoId },
      data: {
        notaMedia: agregado._avg.nota ?? 0,
        totalAvaliacoes: agregado._count.nota,
      },
      select: SELECT_PUBLICO,
    });
    return this.comChavePublicaResolvida(atualizada);
  }

  // Lista as avaliações (com comentário) de um salão, mais recentes primeiro.
  listarAvaliacoes(salaoId: string) {
    return this.prisma.avaliacao.findMany({
      where: { salaoId },
      orderBy: { criadoEm: "desc" },
      include: { cliente: { select: { id: true, nome: true } } },
    });
  }

  // Avaliação que o próprio cliente logado já fez (se houver), mais se ele já
  // pode avaliar — usado pra pré-preencher as estrelas e pra decidir se o
  // formulário de avaliação aparece (só depois de um atendimento concluído).
  async buscarMinhaAvaliacao(salaoId: string, clienteId: string) {
    const [avaliacao, podeAvaliar] = await Promise.all([
      this.prisma.avaliacao.findUnique({ where: { salaoId_clienteId: { salaoId, clienteId } } }),
      this.clienteJaFoiAtendido(salaoId, clienteId),
    ]);
    return { avaliacao, podeAvaliar };
  }

  // Um cliente só pode avaliar um salão depois que o horário de algum
  // agendamento dele lá já tiver passado (não vale cancelado, nem um horário
  // ainda futuro) — é isso que "libera" o formulário de avaliação no app.
  private async clienteJaFoiAtendido(salaoId: string, clienteId: string): Promise<boolean> {
    const total = await this.prisma.agendamento.count({
      where: {
        salaoId,
        clienteId,
        fim: { lt: new Date() },
        status: { not: StatusAgendamento.CANCELADO },
      },
    });
    return total > 0;
  }

  // Alimenta o popup de avaliação pós-atendimento do app (ver
  // PopupAvaliacaoPendente) — olha TODAS os salões (não só uma) onde esse
  // cliente já foi atendido (mesma regra de clienteJaFoiAtendido acima:
  // horário já passou, não foi cancelado) e devolve a mais antiga que ele
  // ainda não avaliou. Assim o popup aparece sozinho assim que o cliente
  // reabre o app depois do horário passar, em vez de depender dele lembrar de
  // ir na tela do salão avaliar manualmente. `null` quando não há nenhuma
  // pendente (nunca foi atendido em lugar nenhum, ou já avaliou tudo).
  async buscarAvaliacaoPendente(clienteId: string): Promise<{ salaoId: string; nome: string; atendidoEm: Date } | null> {
    const atendimentos = await this.prisma.agendamento.findMany({
      where: { clienteId, fim: { lt: new Date() }, status: { not: StatusAgendamento.CANCELADO } },
      distinct: ["salaoId"],
      orderBy: { fim: "asc" }, // o salão esperando avaliação há mais tempo aparece primeiro
      select: { salaoId: true, fim: true, salao: { select: { nome: true } } },
    });
    if (atendimentos.length === 0) return null;

    const jaAvaliadas = await this.prisma.avaliacao.findMany({
      where: { clienteId, salaoId: { in: atendimentos.map((a) => a.salaoId) } },
      select: { salaoId: true },
    });
    const avaliadasSet = new Set(jaAvaliadas.map((a) => a.salaoId));

    const pendente = atendimentos.find((a) => !avaliadasSet.has(a.salaoId));
    if (!pendente) return null;

    return { salaoId: pendente.salaoId, nome: pendente.salao.nome, atendidoEm: pendente.fim };
  }

  // ===== Painel SaaS: "modo teste" (visibilidade restrita) =====
  // Ver Salao.visibilidadeRestrita/SalaoClienteAutorizado e o filtro
  // em listarProximas acima — tudo abaixo é exclusivo do SAAS_ADMIN
  // (SaloesController).

  async definirVisibilidade(id: string, restrita: boolean) {
    const existente = await this.prisma.salao.findUnique({ where: { id }, select: { id: true } });
    if (!existente) throw new NotFoundException("Salão não encontrado.");
    return this.prisma.salao.update({
      where: { id },
      data: { visibilidadeRestrita: restrita },
      select: { id: true, visibilidadeRestrita: true },
    });
  }

  async listarClientesAutorizados(id: string) {
    const registros = await this.prisma.salaoClienteAutorizado.findMany({
      where: { salaoId: id },
      include: { cliente: { select: { id: true, nome: true, email: true } } },
      orderBy: { criadoEm: "desc" },
    });
    return registros.map((r) => r.cliente);
  }

  // Autoriza pelo e-mail (não pelo id) porque é assim que o suporte/o dono da
  // plataforma identifica uma conta de teste no dia a dia — não precisa ir
  // procurar o id do usuário antes. Idempotente (upsert): autorizar de novo
  // quem já está autorizado não dá erro.
  async autorizarCliente(id: string, email: string) {
    const salao = await this.prisma.salao.findUnique({ where: { id }, select: { id: true } });
    if (!salao) throw new NotFoundException("Salão não encontrado.");

    const cliente = await this.prisma.usuario.findUnique({ where: { email } });
    if (!cliente || cliente.papel !== Papel.CLIENTE) {
      throw new NotFoundException("Nenhum cliente encontrado com esse e-mail.");
    }

    await this.prisma.salaoClienteAutorizado.upsert({
      where: { salaoId_clienteId: { salaoId: id, clienteId: cliente.id } },
      create: { salaoId: id, clienteId: cliente.id },
      update: {},
    });

    return { id: cliente.id, nome: cliente.nome, email: cliente.email };
  }

  async removerClienteAutorizado(id: string, clienteId: string) {
    await this.prisma.salaoClienteAutorizado.deleteMany({ where: { salaoId: id, clienteId } });
  }
}

// Distância em linha reta entre duas coordenadas (km). Precisão de sobra pra
// filtrar salões "perto de você" num raio de alguns km.
function distanciaHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = grausParaRad(lat2 - lat1);
  const dLon = grausParaRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(grausParaRad(lat1)) * Math.cos(grausParaRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function grausParaRad(graus: number): number {
  return (graus * Math.PI) / 180;
}
