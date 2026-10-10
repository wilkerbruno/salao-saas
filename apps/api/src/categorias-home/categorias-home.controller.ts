import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Papel } from "@salao-saas/shared";
import { CategoriasHomeService } from "./categorias-home.service";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";

const upload = () => FileInterceptor("imagem", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

@Controller("categorias-home")
export class CategoriasHomeController {
  constructor(private service: CategoriasHomeService) {}

  @Public()
  @Get()
  listarAtivas() {
    return this.service.listar(true);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Get("todas")
  listarTodas() {
    return this.service.listar(false);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Post()
  @UseInterceptors(upload())
  criar(@Body() body: Record<string, string>, @UploadedFile() file?: Express.Multer.File) {
    return this.service.criar(body, file);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Patch(":id")
  @UseInterceptors(upload())
  atualizar(@Param("id") id: string, @Body() body: Record<string, string>, @UploadedFile() file?: Express.Multer.File) {
    return this.service.atualizar(id, body, file);
  }

  @Roles(Papel.SAAS_ADMIN)
  @Delete(":id")
  excluir(@Param("id") id: string) {
    return this.service.excluir(id);
  }
}
