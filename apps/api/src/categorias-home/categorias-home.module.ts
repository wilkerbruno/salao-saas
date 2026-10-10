import { Module } from "@nestjs/common";
import { CategoriasHomeController } from "./categorias-home.controller";
import { CategoriasHomeService } from "./categorias-home.service";

@Module({ controllers: [CategoriasHomeController], providers: [CategoriasHomeService] })
export class CategoriasHomeModule {}
