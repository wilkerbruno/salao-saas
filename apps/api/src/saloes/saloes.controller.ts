import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { CategoriaServico, EtapaDisponibilidade, Papel } from "@salao-saas/shared";
import { SaloesService } from "./saloes.service";
import { UpdateSalaoDto } from "./dto/update-salao.dto";
import { CreateAvaliacaoDto } from "./dto/create-avaliacao.dto";
import { DefinirVisibilidadeDto } from "./dto/definir-visibilidade.dto";
import { AutorizarClienteDto } from "./dto/autorizar-cliente.dto";
import { AgendamentosService } from "../agendamentos/agendamentos.service";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("saloes")
export class SaloesController {
  constructor(
    private saloesService: SaloesService,
    private agendamentosService: AgendamentosService,
  ) {}

  // Painel SaaS: lista todas os salões assinantes da plataforma.
  @Roles(Papel.SAAS_ADMIN)
  @Get()
  listarTodas() {
    return this.saloesService.listarTodas();
  }

  // Home do app do cliente: lista os salões perto dele (com busca por nome
  // opcional), já ordenada pra colocar à frente as que ele já frequentou e,
  // depois, as com melhor nota. Precisa vir ANTES de ":id" pra não ser
  // interpretada como um id de salão.
  @Roles(Papel.CLIENTE)
  @Get("proximas")
  listarProximas(
    @Query("lat") lat: string,
    @Query("lng") lng: string,
    @Query("raioKm") raioKm: string | undefined,
    @Query("q") q: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (lat === undefined || lng === undefined || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException("Informe os parâmetros lat e lng.");
    }
    return this.saloesService.listarProximas(latitude, longitude, raioKm ? Number(raioKm) : undefined, q, user.id);
  }

  // Popup de avaliação pós-atendimento (ver PopupAvaliacaoPendente no app) —
  // não recebe id de salão (é por cliente, olhando todas), então também
  // precisa vir ANTES de ":id" pelo mesmo motivo de "proximas" acima.
  @Roles(Papel.CLIENTE)
  @Get("avaliacao-pendente")
  buscarAvaliacaoPendente(@CurrentUser() user: AuthUser) {
    return this.saloesService.buscarAvaliacaoPendente(user.id);
  }

  // Público: dados mínimos pra Home do app do cliente (nome, endereço, estrelas).
  @Public()
  @Get(":id/publico")
  buscarInfoPublica(@Param("id") id: string) {
    return this.saloesService.buscarInfoPublica(id);
  }

  @Get(":id")
  buscarPorId(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    this.garantirAcesso(id, user);
    return this.saloesService.buscarPorId(id);
  }

  // Público: usado pelo app do cliente no passo "Escolher profissional".
  @Public()
  @Get(":id/funcionarios")
  listarFuncionarios(@Param("id") id: string) {
    return this.saloesService.listarFuncionariosPublico(id);
  }

  // Público: dias do mês com pelo menos um horário livre pra duração total dos
  // serviços escolhidos — alimenta o calendário da tela de agendamento.
  // mes no formato "YYYY-MM".
  @Public()
  @Get(":id/dias-disponiveis")
  diasDisponiveis(
    @Param("id") id: string,
    @Query("mes") mes: string,
    @Query("duracaoMinutos") duracaoMinutos?: string,
    @Query("funcionarioId") funcionarioId?: string,
    @Query("etapas") etapas?: string,
  ) {
    const [ano, mesNum] = (mes ?? "").split("-").map(Number);
    if (!ano || !mesNum) throw new BadRequestException("Informe o parâmetro mes no formato YYYY-MM.");
    return this.agendamentosService.listarDiasDisponiveis(
      id,
      ano,
      mesNum,
      Number(duracaoMinutos) || 30,
      funcionarioId,
      parseEtapas(etapas),
    );
  }

  // Público: horários livres (formato "HH:mm") num dia específico, pra duração
  // total dos serviços escolhidos. data no formato "YYYY-MM-DD".
  @Public()
  @Get(":id/horarios-disponiveis")
  horariosDisponiveis(
    @Param("id") id: string,
    @Query("data") data: string,
    @Query("duracaoMinutos") duracaoMinutos?: string,
    @Query("funcionarioId") funcionarioId?: string,
    @Query("etapas") etapas?: string,
  ) {
    if (!data) throw new BadRequestException("Informe o parâmetro data no formato YYYY-MM-DD.");
    return this.agendamentosService.listarHorariosDisponiveis(
      id,
      data,
      Number(duracaoMinutos) || 30,
      funcionarioId,
      parseEtapas(etapas),
    );
  }

  @Roles(Papel.SALAO_ADMIN)
  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: UpdateSalaoDto, @CurrentUser() user: AuthUser) {
    this.garantirAcesso(id, user);
    return this.saloesService.atualizar(id, dto);
  }

  // ===== Painel SaaS: "modo teste" (visibilidade restrita) =====
  // Ver Salao.visibilidadeRestrita/SalaoClienteAutorizado no schema e
  // o filtro em SaloesService.listarProximas. Só o SAAS_ADMIN configura —
  // o dono do salão (SALAO_ADMIN) não enxerga nem controla isso.

  @Roles(Papel.SAAS_ADMIN)
  @Patch(":id/visibilidade")
  definirVisibilidade(@Param("id") id: string, @Body() dto: DefinirVisibilidadeDto) {
    return this.saloesService.definirVisibilidade(id, dto.restrita);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Get(":id/clientes-autorizados")
  listarClientesAutorizados(@Param("id") id: string) {
    return this.saloesService.listarClientesAutorizados(id);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Post(":id/clientes-autorizados")
  autorizarCliente(@Param("id") id: string, @Body() dto: AutorizarClienteDto) {
    return this.saloesService.autorizarCliente(id, dto.email);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Delete(":id/clientes-autorizados/:clienteId")
  removerClienteAutorizado(@Param("id") id: string, @Param("clienteId") clienteId: string) {
    return this.saloesService.removerClienteAutorizado(id, clienteId);
  }

  // Envio da logo — usado tanto logo após o cadastro do salão (Criar conta
  // de salão, no app) quanto depois, em "Mais > Logo". Recebe multipart
  // (campo "logo"); a API redimensiona/comprime antes de guardar.
  @Roles(Papel.SALAO_ADMIN)
  @Post(":id/logo")
  @UseInterceptors(
    FileInterceptor("logo", { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  enviarLogo(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    this.garantirAcesso(id, user);
    return this.saloesService.atualizarLogo(id, file);
  }

  // Público: estrelas + comentários de quem já avaliou (tela de detalhe do salão).
  @Public()
  @Get(":id/avaliacoes")
  listarAvaliacoes(@Param("id") id: string) {
    return this.saloesService.listarAvaliacoes(id);
  }

  // Cliente avalia (ou atualiza a própria avaliação) um salão.
  @Roles(Papel.CLIENTE)
  @Post(":id/avaliacoes")
  avaliar(@Param("id") id: string, @Body() dto: CreateAvaliacaoDto, @CurrentUser() user: AuthUser) {
    return this.saloesService.avaliar(id, user.id, dto);
  }

  // Cliente logado busca a própria avaliação (pra pré-preencher as estrelas).
  @Roles(Papel.CLIENTE)
  @Get(":id/avaliacoes/minha")
  buscarMinhaAvaliacao(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.saloesService.buscarMinhaAvaliacao(id, user.id);
  }

  // Um SALAO_ADMIN só pode ler/editar o próprio salão; SAAS_ADMIN pode ver qualquer uma.
  private garantirAcesso(salaoId: string, user: AuthUser) {
    if (user.papel === Papel.SAAS_ADMIN) return;
    if (user.salaoId !== salaoId) {
      throw new ForbiddenException("Você não tem acesso a este salão.");
    }
  }
}

// ?etapas=[{"duracaoMinutos":60,"categoria":"CABELO","funcionarioId":"..."},...]
// (JSON na query string) — o atendimento completo, um item por serviço, na
// ordem em que serão feitos. Opcional: sem isso vale o formato antigo
// (?duracaoMinutos=&funcionarioId=).
function parseEtapas(bruto?: string): EtapaDisponibilidade[] | undefined {
  if (!bruto) return undefined;
  let dados: unknown;
  try {
    dados = JSON.parse(bruto);
  } catch {
    throw new BadRequestException("Parâmetro etapas inválido (JSON esperado).");
  }
  if (!Array.isArray(dados) || dados.length === 0 || dados.length > 12) {
    throw new BadRequestException("Parâmetro etapas deve ser uma lista de 1 a 12 itens.");
  }
  return dados.map((item: any) => {
    const duracaoMinutos = Number(item?.duracaoMinutos);
    if (!Number.isInteger(duracaoMinutos) || duracaoMinutos < 5 || duracaoMinutos > 720) {
      throw new BadRequestException("Duração inválida em etapas.");
    }
    const categoria = item?.categoria ?? null;
    if (categoria !== null && !Object.values(CategoriaServico).includes(categoria)) {
      throw new BadRequestException("Categoria inválida em etapas.");
    }
    const funcionarioId = typeof item?.funcionarioId === "string" && item.funcionarioId ? item.funcionarioId : undefined;
    return { duracaoMinutos, categoria, funcionarioId };
  });
}
