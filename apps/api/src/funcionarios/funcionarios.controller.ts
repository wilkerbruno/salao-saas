import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Papel } from "@salao-saas/shared";
import { FuncionariosService } from "./funcionarios.service";
import { CreateFuncionarioDto } from "./dto/create-funcionario.dto";
import { UpdateFuncionarioDto } from "./dto/update-funcionario.dto";
import { DefinirHorariosDto } from "./dto/definir-horarios.dto";
import { CreateFolgaDto } from "./dto/create-folga.dto";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../auth/jwt.strategy";

@Controller("funcionarios")
export class FuncionariosController {
  constructor(private funcionariosService: FuncionariosService) {}

  // ---------- Gestão da equipe (o dono do salão) ----------

  @Roles(Papel.SALAO_ADMIN)
  @Get()
  listar(@CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.funcionariosService.listarDaSalao(user.salaoId);
  }

  @Roles(Papel.SALAO_ADMIN)
  @Post()
  criar(@Body() dto: CreateFuncionarioDto, @CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.funcionariosService.criar(user.salaoId, dto);
  }

  @Roles(Papel.SALAO_ADMIN)
  @Patch(":id")
  atualizar(@Param("id") id: string, @Body() dto: UpdateFuncionarioDto, @CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.funcionariosService.atualizar(id, user.salaoId, dto);
  }

  // O dono também atende? Devolve o cadastro de profissional dele (ou null).
  @Roles(Papel.SALAO_ADMIN)
  @Get("eu")
  eu(@CurrentUser() user: AuthUser) {
    return this.funcionariosService.buscarCadastroDoDono(user.id);
  }

  // Dono de salão já existente (ou que não marcou no cadastro) passa a
  // atender também: cria o cadastro de profissional dele.
  @Roles(Papel.SALAO_ADMIN)
  @Post("eu")
  virarFuncionario(@CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.funcionariosService.criarCadastroDoDono(user.id, user.salaoId);
  }

  // Só o id do cadastro na equipe do funcionário logado — usado pra lançar
  // um agendamento manual na própria agenda (ver AgendamentosController).
  @Roles(Papel.FUNCIONARIO, Papel.SALAO_ADMIN)
  @Get("meu-id")
  meuId(@CurrentUser() user: AuthUser) {
    return this.funcionariosService.buscarMeuId(user.id);
  }

  // ---------- Foto de perfil (o próprio funcionário) ----------

  @Roles(Papel.FUNCIONARIO, Papel.SALAO_ADMIN)
  @Get("minha-foto")
  minhaFoto(@CurrentUser() user: AuthUser) {
    return this.funcionariosService.buscarMinhaFoto(user.id);
  }

  @Roles(Papel.FUNCIONARIO, Papel.SALAO_ADMIN)
  @Post("minha-foto")
  @UseInterceptors(FileInterceptor("foto", { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  atualizarMinhaFoto(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.funcionariosService.atualizarMinhaFoto(user.id, file);
  }

  // ---------- Horário de trabalho semanal (o próprio funcionário) ----------

  @Roles(Papel.FUNCIONARIO, Papel.SALAO_ADMIN)
  @Get("meus-horarios")
  meusHorarios(@CurrentUser() user: AuthUser) {
    return this.funcionariosService.listarMeusHorarios(user.id);
  }

  @Roles(Papel.FUNCIONARIO, Papel.SALAO_ADMIN)
  @Post("meus-horarios")
  definirMeusHorarios(@Body() dto: DefinirHorariosDto, @CurrentUser() user: AuthUser) {
    return this.funcionariosService.definirMeusHorarios(user.id, dto);
  }

  // ---------- Folgas / bloqueios pontuais (o próprio funcionário) ----------

  @Roles(Papel.FUNCIONARIO, Papel.SALAO_ADMIN)
  @Get("minhas-folgas")
  minhasFolgas(@CurrentUser() user: AuthUser) {
    return this.funcionariosService.listarMinhasFolgas(user.id);
  }

  @Roles(Papel.FUNCIONARIO, Papel.SALAO_ADMIN)
  @Post("minhas-folgas")
  criarMinhaFolga(@Body() dto: CreateFolgaDto, @CurrentUser() user: AuthUser) {
    return this.funcionariosService.criarMinhaFolga(user.id, dto);
  }

  @Roles(Papel.FUNCIONARIO, Papel.SALAO_ADMIN)
  @Delete("minhas-folgas/:id")
  removerMinhaFolga(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.funcionariosService.removerMinhaFolga(user.id, id);
  }

  // ---------- Horário de trabalho / folgas de um funcionário (o dono do salão) ----------

  @Roles(Papel.SALAO_ADMIN)
  @Get(":id/horarios")
  horariosDoFuncionario(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.funcionariosService.listarHorariosDoFuncionario(id, user.salaoId);
  }

  @Roles(Papel.SALAO_ADMIN)
  @Post(":id/horarios")
  definirHorariosDoFuncionario(@Param("id") id: string, @Body() dto: DefinirHorariosDto, @CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.funcionariosService.definirHorariosDoFuncionario(id, user.salaoId, dto);
  }

  @Roles(Papel.SALAO_ADMIN)
  @Get(":id/folgas")
  folgasDoFuncionario(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.funcionariosService.listarFolgasDoFuncionario(id, user.salaoId);
  }

  @Roles(Papel.SALAO_ADMIN)
  @Post(":id/folgas")
  criarFolgaDoFuncionario(@Param("id") id: string, @Body() dto: CreateFolgaDto, @CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.funcionariosService.criarFolgaDoFuncionario(id, user.salaoId, dto);
  }

  @Roles(Papel.SALAO_ADMIN)
  @Delete(":id/folgas/:folgaId")
  removerFolgaDoFuncionario(@Param("id") id: string, @Param("folgaId") folgaId: string, @CurrentUser() user: AuthUser) {
    if (!user.salaoId) throw new ForbiddenException("Usuário sem salão associada.");
    return this.funcionariosService.removerFolgaDoFuncionario(id, user.salaoId, folgaId);
  }
}
