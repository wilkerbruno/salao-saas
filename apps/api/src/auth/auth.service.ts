import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { Papel, StatusAssinatura } from "@salao-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ConfiguracoesService } from "../configuracoes/configuracoes.service";
import { EmailService } from "../common/email/email.service";
import { GeocodificacaoService } from "../common/geocodificacao/geocodificacao.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterClienteDto } from "./dto/register-cliente.dto";
import { RegisterSalaoDto } from "./dto/register-salao.dto";
import { EsqueciSenhaDto } from "./dto/esqueci-senha.dto";
import { ValidarCodigoRecuperacaoDto } from "./dto/validar-codigo-recuperacao.dto";
import { RedefinirSenhaDto } from "./dto/redefinir-senha.dto";
import { camposEndereco } from "../common/endereco.util";
import { PACOTES_INICIAIS, SERVICOS_INICIAIS } from "../servicos/catalogo-inicial";

// "Esqueci minha senha" (ver esqueciSenha/validarCodigoRecuperacao/
// redefinirSenha abaixo): código de 6 dígitos válido por 15 minutos, no
// máximo 5 tentativas de digitar antes de precisar pedir um código novo, e
// pelo menos 60s entre dois pedidos de código (evita spam de e-mail se
// alguém ficar martelando o botão "reenviar").
const RECUPERACAO_SENHA_EXPIRACAO_MINUTOS = 15;
const RECUPERACAO_SENHA_LIMITE_TENTATIVAS = 5;
const RECUPERACAO_SENHA_COOLDOWN_SEGUNDOS = 60;
// Claim que distingue o token emitido depois de validar o código (só serve
// pra chamar /auth/redefinir-senha) de um accessToken de sessão normal —
// ambos são JWTs assinados com o mesmo segredo, mas um token de sessão nunca
// tem esse campo, então redefinirSenha nunca aceita um por engano.
const TIPO_TOKEN_RESET_SENHA = "reset-senha";

function gerarCodigoDeSeisDigitos(): string {
  // 0 a 999999, sempre com 6 dígitos (zeros à esquerda quando precisar).
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas diacríticas após normalize NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private configuracoes: ConfiguracoesService,
    private email: EmailService,
    private geocodificacao: GeocodificacaoService,
  ) {}

  private async assinarToken(usuario: { id: string; papel: Papel; salaoId: string | null }) {
    const token = await this.jwt.signAsync({
      sub: usuario.id,
      papel: usuario.papel,
      salaoId: usuario.salaoId,
    });
    return { accessToken: token };
  }

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (!usuario) throw new UnauthorizedException("E-mail ou senha inválidos.");

    const senhaValida = await bcrypt.compare(dto.senha, usuario.senhaHash);
    if (!senhaValida) throw new UnauthorizedException("E-mail ou senha inválidos.");

    const { senhaHash, ...usuarioSemSenha } = usuario;
    return {
      usuario: usuarioSemSenha,
      ...(await this.assinarToken(usuario)),
    };
  }

  async registerCliente(dto: RegisterClienteDto) {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) throw new ConflictException("Já existe uma conta com este e-mail.");

    const senhaHash = await bcrypt.hash(dto.senha, 10);
    const usuario = await this.prisma.usuario.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        senhaHash,
        telefone: dto.telefone,
        ...camposEndereco(dto.endereco),
        papel: Papel.CLIENTE,
      },
    });

    const { senhaHash: _, ...usuarioSemSenha } = usuario;
    return { usuario: usuarioSemSenha, ...(await this.assinarToken(usuario)) };
  }

  // Onboarding do SaaS: cria o salão (tenant), o usuário dono e a assinatura
  // inicial em modo TRIAL. É aqui que o salão "vira cliente" da plataforma.
  async registerSalao(dto: RegisterSalaoDto) {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) throw new ConflictException("Já existe uma conta com este e-mail.");

    const plano = await this.prisma.plano.findUnique({ where: { id: dto.planoId } });
    if (!plano) throw new ConflictException("Plano informado não existe.");

    const slugBase = slugify(dto.nomeSalao);
    let slug = slugBase;
    let tentativa = 1;
    while (await this.prisma.salao.findUnique({ where: { slug } })) {
      slug = `${slugBase}-${++tentativa}`;
    }

    const senhaHash = await bcrypt.hash(dto.senha, 10);
    const { diasTesteGratis } = await this.configuracoes.obter();

    const resultado = await this.prisma.$transaction(async (tx) => {
      const salao = await tx.salao.create({
        // Telefone e endereço pra começar já preenchidos com o informado no
        // cadastro — é o que o cliente vê no botão "Ligar para o salão"
        // e no endereço do estabelecimento. O dono pode trocar depois em
        // Mais > Editar perfil > Dados do salão (EditarPerfilScreen),
        // sem afetar os dados pessoais dele.
        data: { nome: dto.nomeSalao, slug, telefone: dto.telefone, ...camposEndereco(dto.endereco) },
      });

      const dono = await tx.usuario.create({
        data: {
          nome: dto.nomeDono,
          email: dto.email,
          senhaHash,
          telefone: dto.telefone,
          papel: Papel.SALAO_ADMIN,
          salaoId: salao.id,
        },
      });

      if (dto.tambemFuncionario) {
        await tx.funcionario.create({
          data: { usuarioId: dono.id, salaoId: salao.id, cargo: "Proprietária", comissaoPercentual: 100, especialidades: [] },
        });
      }

      const trialTerminaEm = new Date();
      trialTerminaEm.setDate(trialTerminaEm.getDate() + diasTesteGratis);

      await tx.assinatura.create({
        data: {
          salaoId: salao.id,
          planoId: plano.id,
          status: StatusAssinatura.TRIAL,
          trialTerminaEm,
        },
      });

      // Catálogo de exemplo (cabelo + unha) pra o salão já nascer utilizável;
      // o dono ajusta preços/serviços depois. Opt-out via criarCatalogoInicial=false.
      if (dto.criarCatalogoInicial !== false) {
        const servicosPorChave = new Map<string, string>();
        for (const modelo of SERVICOS_INICIAIS) {
          const servico = await tx.servico.create({
            data: {
              salaoId: salao.id,
              nome: modelo.nome,
              descricao: modelo.descricao,
              categoria: modelo.categoria,
              duracaoMinutos: modelo.duracaoMinutos,
              precoCentavos: modelo.precoCentavos,
            },
          });
          servicosPorChave.set(modelo.chave, servico.id);
        }
        for (const modelo of PACOTES_INICIAIS) {
          await tx.pacote.create({
            data: {
              salaoId: salao.id,
              nome: modelo.nome,
              descricao: modelo.descricao,
              precoCentavos: modelo.precoCentavos,
              servicos: { create: modelo.servicos.map((chave) => ({ servicoId: servicosPorChave.get(chave)! })) },
            },
          });
        }
      }

      return { salao, dono };
    });

    // Fora da transação (não pode travar o cadastro se o Nominatim estiver
    // fora do ar) e sem `await` bloqueando a resposta — o dono não precisa
    // esperar a geocodificação pra terminar de se cadastrar; se falhar, a
    // salão só fica sem o fallback de endereço no mapa até a primeira
    // leitura tentar de novo (ver GeocodificacaoService.resolverCoordenadas).
    this.geocodificacao.geocodificarEAtualizar(resultado.salao.id, resultado.salao).catch(() => {});

    const { senhaHash: _, ...usuarioSemSenha } = resultado.dono;
    return {
      salao: resultado.salao,
      usuario: usuarioSemSenha,
      ...(await this.assinarToken(resultado.dono)),
    };
  }

  // Passo 1 do "esqueci minha senha": gera um código de 6 dígitos, grava só o
  // HASH dele (nunca o código em texto puro) e manda por e-mail. Sempre
  // responde com sucesso (ver AuthController), não importa se o e-mail existe
  // ou não — contar isso pro app abriria uma forma de descobrir quais e-mails
  // têm conta cadastrada.
  async esqueciSenha(dto: EsqueciSenhaDto): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
      select: { id: true, nome: true, email: true },
    });
    if (!usuario) return;

    const pedidoAnterior = await this.prisma.codigoRecuperacaoSenha.findUnique({ where: { usuarioId: usuario.id } });
    if (pedidoAnterior) {
      const segundosDesdeOPedido = (Date.now() - pedidoAnterior.criadoEm.getTime()) / 1000;
      if (segundosDesdeOPedido < RECUPERACAO_SENHA_COOLDOWN_SEGUNDOS) return; // ainda sem passar o cooldown — ignora silenciosamente (mesmo motivo do early-return acima)
    }

    const codigo = gerarCodigoDeSeisDigitos();
    const codigoHash = await bcrypt.hash(codigo, 10);
    const expiraEm = new Date(Date.now() + RECUPERACAO_SENHA_EXPIRACAO_MINUTOS * 60 * 1000);

    await this.prisma.codigoRecuperacaoSenha.upsert({
      where: { usuarioId: usuario.id },
      update: { codigoHash, expiraEm, tentativas: 0, criadoEm: new Date() },
      create: { usuarioId: usuario.id, codigoHash, expiraEm },
    });

    await this.email.enviarCodigoRecuperacaoSenha(usuario.email, usuario.nome, codigo);
  }

  // Passo 2: confere o código digitado contra o hash salvo. Em caso de
  // sucesso, apaga o código (não serve mais — evita reuso) e devolve um
  // resetToken de curta duração que autoriza SÓ a chamada de redefinirSenha
  // abaixo, sem precisar reenviar o código nem o e-mail de novo nessa etapa.
  async validarCodigoRecuperacao(dto: ValidarCodigoRecuperacaoDto): Promise<{ resetToken: string }> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    const pedido = usuario
      ? await this.prisma.codigoRecuperacaoSenha.findUnique({ where: { usuarioId: usuario.id } })
      : null;

    // Mesma mensagem genérica pra e-mail inexistente, código errado e código
    // expirado — não dá pra um visitante distinguir qual dos três aconteceu.
    const erroGenerico = new BadRequestException("Código inválido ou expirado. Confira o código ou peça um novo.");
    if (!usuario || !pedido) throw erroGenerico;
    if (pedido.expiraEm < new Date()) throw erroGenerico;
    if (pedido.tentativas >= RECUPERACAO_SENHA_LIMITE_TENTATIVAS) {
      throw new BadRequestException("Muitas tentativas erradas. Peça um novo código.");
    }

    const codigoValido = await bcrypt.compare(dto.codigo, pedido.codigoHash);
    if (!codigoValido) {
      await this.prisma.codigoRecuperacaoSenha.update({
        where: { usuarioId: usuario.id },
        data: { tentativas: { increment: 1 } },
      });
      throw erroGenerico;
    }

    await this.prisma.codigoRecuperacaoSenha.delete({ where: { usuarioId: usuario.id } });

    const resetToken = await this.jwt.signAsync(
      { sub: usuario.id, tipo: TIPO_TOKEN_RESET_SENHA },
      { expiresIn: "10m" },
    );
    return { resetToken };
  }

  // Passo 3: confere o resetToken emitido no passo 2 e troca a senha. DTO já
  // garante os 8 caracteres mínimos (ver RedefinirSenhaDto).
  async redefinirSenha(dto: RedefinirSenhaDto): Promise<void> {
    let payload: { sub: string; tipo?: string };
    try {
      payload = await this.jwt.verifyAsync(dto.resetToken);
    } catch {
      throw new BadRequestException("Código expirado. Peça um novo código e tente de novo.");
    }
    if (payload.tipo !== TIPO_TOKEN_RESET_SENHA) {
      throw new BadRequestException("Token inválido para redefinição de senha.");
    }

    const senhaHash = await bcrypt.hash(dto.novaSenha, 10);
    await this.prisma.usuario.update({ where: { id: payload.sub }, data: { senhaHash } });
  }
}
