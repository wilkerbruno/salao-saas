import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

// Envio de e-mails transacionais via SMTP (hoje só o código de "esqueci minha
// senha" — ver AuthService.esqueciSenha). Sem lib paga/serviço externo: usa
// nodemailer direto contra o SMTP configurado em SMTP_HOST/PORT/USER/PASS
// (ver apps/api/.env.example — dá pra usar o SMTP do Gmail com uma "Senha de
// app"). Se não houver SMTP configurado (ambiente de dev, ou produção ainda
// sem configurar), só loga um aviso e segue sem travar o fluxo que chamou —
// mesmo padrão do MercadoPagoService pra credenciais ausentes.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transportador: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>("SMTP_HOST");
    const usuario = this.config.get<string>("SMTP_USER");
    const senha = this.config.get<string>("SMTP_PASS");

    if (!host || !usuario || !senha) {
      this.logger.warn(
        "SMTP não configurado (SMTP_HOST/SMTP_USER/SMTP_PASS ausentes) — e-mails (ex.: código de recuperação de senha) serão só logados, não enviados de verdade.",
      );
      return;
    }

    this.transportador = nodemailer.createTransport({
      host,
      port: Number(this.config.get<string>("SMTP_PORT") ?? "587"),
      secure: this.config.get<string>("SMTP_SECURE") === "true", // true só pra porta 465 (SSL direto); 587 usa STARTTLS (false aqui)
      auth: { user: usuario, pass: senha },
    });
  }

  private get remetente(): string {
    return this.config.get<string>("SMTP_FROM") || '"Bella One" <no-reply@bellaone.store>';
  }

  private async enviar(destinatario: string, assunto: string, html: string): Promise<void> {
    if (!this.transportador) {
      this.logger.warn(`SMTP não configurado — e-mail "${assunto}" para ${destinatario} não foi enviado.`);
      return;
    }
    try {
      await this.transportador.sendMail({ from: this.remetente, to: destinatario, subject: assunto, html });
    } catch (erro) {
      // Nunca propaga: quem chamou (ex.: "esqueci minha senha") já responde
      // sempre com sucesso genérico pro app, pra não vazar se o e-mail existe
      // nem travar o fluxo por causa de uma falha pontual do SMTP.
      this.logger.error(`Falha ao enviar e-mail "${assunto}" para ${destinatario}: ${(erro as Error).message}`);
    }
  }

  // E-mail do fluxo "esqueci minha senha" (ver AuthService.esqueciSenha).
  // Estilo inline (sem <style> externo) porque é o que os clientes de e-mail
  // de fato respeitam; cores seguindo a marca (ver theme/tokens.ts no app).
  async enviarCodigoRecuperacaoSenha(destinatario: string, nome: string, codigo: string): Promise<void> {
    const primeiroNome = nome.trim().split(" ")[0] || nome;
    const html = `
      <div style="background:#161014;padding:32px 16px;font-family:-apple-system,Helvetica,Arial,sans-serif;">
        <div style="max-width:420px;margin:0 auto;background:#1c1816;border-radius:12px;padding:32px 24px;">
          <p style="color:#E8A0B4;font-size:20px;font-weight:700;margin:0 0 20px;">Bella One</p>
          <p style="color:#F7EEF1;font-size:15px;margin:0 0 8px;">Olá, ${primeiroNome}!</p>
          <p style="color:#F7EEF1;font-size:15px;line-height:22px;margin:0 0 24px;">
            Recebemos um pedido para redefinir a senha da sua conta. Use o código abaixo no app — ele
            expira em 15 minutos.
          </p>
          <p style="color:#E8A0B4;font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;margin:0 0 24px;">
            ${codigo}
          </p>
          <p style="color:#A99BA3;font-size:12px;line-height:18px;margin:0;">
            Se você não pediu essa alteração, pode ignorar este e-mail — sua senha continua a mesma.
          </p>
        </div>
      </div>`;
    await this.enviar(destinatario, "Seu código de recuperação de senha — Bella One", html);
  }
}
