import { Body, Controller, Post, Res } from "@nestjs/common";
import { Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterClienteDto } from "./dto/register-cliente.dto";
import { RegisterSalaoDto } from "./dto/register-salao.dto";
import { EsqueciSenhaDto } from "./dto/esqueci-senha.dto";
import { ValidarCodigoRecuperacaoDto } from "./dto/validar-codigo-recuperacao.dto";
import { RedefinirSenhaDto } from "./dto/redefinir-senha.dto";
import { Public } from "../common/decorators/public.decorator";
import { COOKIE_TOKEN } from "./jwt.strategy";

// Além do token no corpo da resposta (como sempre — é o que o app nativo usa,
// guardado no Keychain/Keystore via expo-secure-store), também seta o mesmo
// token num cookie httpOnly. É só a versão web do app (Expo Web, ver
// secureStorage.web.ts) que depende desse cookie: lá o token nunca fica em
// localStorage, então nem um script malicioso (XSS) consegue ler. `secure`
// fica ligado sempre — o site roda em HTTPS (ver elevaone.store) — e
// `sameSite: lax` já cobre o caso de app.elevaone.store chamando
// api.elevaone.store (mesmo domínio-base, subdomínios diferentes).
const UM_DIA_MS = 24 * 60 * 60 * 1000;

function setarCookieToken(res: Response, token: string) {
  res.cookie(COOKIE_TOKEN, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 7 * UM_DIA_MS, // acompanha o JWT_EXPIRES_IN padrão (7d) — ver auth.module.ts
    path: "/",
  });
}

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const resultado = await this.authService.login(dto);
    setarCookieToken(res, resultado.accessToken);
    return resultado;
  }

  @Public()
  @Post("registrar-cliente")
  async registerCliente(@Body() dto: RegisterClienteDto, @Res({ passthrough: true }) res: Response) {
    const resultado = await this.authService.registerCliente(dto);
    setarCookieToken(res, resultado.accessToken);
    return resultado;
  }

  // Onboarding de um novo salão assinante do SaaS.
  @Public()
  @Post("registrar-salao")
  async registerSalao(@Body() dto: RegisterSalaoDto, @Res({ passthrough: true }) res: Response) {
    const resultado = await this.authService.registerSalao(dto);
    setarCookieToken(res, resultado.accessToken);
    return resultado;
  }

  // Fluxo "esqueci minha senha" (ver EsqueciSenhaScreen/
  // ValidarCodigoRecuperacaoScreen/NovaSenhaScreen no app e os 3 métodos
  // correspondentes em AuthService). Sempre responde { ok: true } mesmo
  // quando o e-mail não existe — ver comentário em AuthService.esqueciSenha.
  @Public()
  @Post("esqueci-senha")
  async esqueciSenha(@Body() dto: EsqueciSenhaDto) {
    await this.authService.esqueciSenha(dto);
    return { ok: true };
  }

  @Public()
  @Post("validar-codigo-recuperacao")
  validarCodigoRecuperacao(@Body() dto: ValidarCodigoRecuperacaoDto) {
    return this.authService.validarCodigoRecuperacao(dto);
  }

  @Public()
  @Post("redefinir-senha")
  async redefinirSenha(@Body() dto: RedefinirSenhaDto) {
    await this.authService.redefinirSenha(dto);
    return { ok: true };
  }

  // Só a versão web usa isso (ver authStore.ts "logout" web) — o
  // JavaScript da página não consegue apagar um cookie httpOnly sozinho,
  // então precisa pedir pro backend limpar.
  @Public()
  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_TOKEN, { path: "/" });
    return { ok: true };
  }
}
