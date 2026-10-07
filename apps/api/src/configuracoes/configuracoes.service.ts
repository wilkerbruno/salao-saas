import { Injectable } from "@nestjs/common";
import { Papel } from "@salao-saas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateConfiguracaoDto } from "./dto/update-configuracao.dto";
import { AuthUser } from "../auth/jwt.strategy";

// Linha única (singleton, id fixo "default") com os parâmetros globais do
// SaaS que o SAAS_ADMIN ajusta no admin-web: duração do teste grátis e horas
// de carência que um cliente ainda vê o salão depois da assinatura vencer
// (ver AssinaturasService/AssinaturaGuard, que leem esses valores em tempo de
// requisição — não há job agendado, o cálculo é sempre feito na hora).
@Injectable()
export class ConfiguracoesService {
  constructor(private prisma: PrismaService) {}

  // Cria a linha com os valores padrão (14 dias de teste, 24h de carência) na
  // primeira vez que alguém ler ou uma requisição precisar dela.
  async obter() {
    return this.prisma.configuracaoPlataforma.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });
  }

  async atualizar(dto: UpdateConfiguracaoDto) {
    await this.obter();
    return this.prisma.configuracaoPlataforma.update({
      where: { id: "default" },
      data: dto,
    });
  }

  // Tela "Suporte" do app (cliente, funcionário e dono do salão) — o
  // e-mail é sempre o mesmo pra todo mundo (ConfiguracaoPlataforma.emailSuporte,
  // cadastrado pelo SAAS_ADMIN), mas o WhatsApp só aparece pra quem pertence a
  // um salão (FUNCIONARIO/SALAO_ADMIN) cujo plano ATUAL tem
  // atendimento prioritário — nem todo salão paga por isso, e o cliente
  // final não está amarrado a um plano específico (pode agendar em várias
  // salões com planos diferentes), então pra ele só o e-mail faz sentido.
  async obterSuporte(user: AuthUser): Promise<{ emailSuporte: string | null; whatsappSuporte: string | null }> {
    const config = await this.obter();
    const resultado = { emailSuporte: config.emailSuporte ?? null, whatsappSuporte: null as string | null };

    const pertenceASalao = user.papel === Papel.SALAO_ADMIN || user.papel === Papel.FUNCIONARIO;
    if (!pertenceASalao || !user.salaoId) return resultado;

    const assinatura = await this.prisma.assinatura.findUnique({
      where: { salaoId: user.salaoId },
      include: { plano: true },
    });
    if (assinatura?.plano.atendimentoPrioritario) {
      resultado.whatsappSuporte = assinatura.plano.whatsappSuporte ?? null;
    }
    return resultado;
  }
}
