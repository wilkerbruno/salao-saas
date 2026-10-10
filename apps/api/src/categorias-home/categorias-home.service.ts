import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import { CATEGORIAS_SERVICO } from "@salao-saas/shared";
import { PrismaService } from "../prisma/prisma.service";

const PADRAO: { rotulo: string; categoria: string | null; fixa?: boolean }[] = [
  { rotulo: "Tudo", categoria: null, fixa: true },
  { rotulo: "Cabelo", categoria: "CABELO" },
  { rotulo: "Unhas", categoria: "UNHA" },
  { rotulo: "Sobrancelha e cílios", categoria: "SOBRANCELHA_CILIOS" },
  { rotulo: "Maquiagem", categoria: "MAQUIAGEM" },
  { rotulo: "Estética e depilação", categoria: "ESTETICA" },
];

@Injectable()
export class CategoriasHomeService {
  constructor(private prisma: PrismaService) {}

  async listar(somenteAtivas: boolean) {
    if ((await this.prisma.categoriaHome.count()) === 0) {
      await this.prisma.categoriaHome.createMany({
        data: PADRAO.map((p, i) => ({ rotulo: p.rotulo, categoria: p.categoria, fixa: !!p.fixa, ordem: i })),
      });
    }
    return this.prisma.categoriaHome.findMany({
      where: somenteAtivas ? { ativo: true } : undefined,
      orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
    });
  }

  private async comprimir(file: Express.Multer.File) {
    try {
      const buf = await sharp(file.buffer)
        .rotate()
        .resize(384, 384, { fit: "cover" })
        .jpeg({ quality: 82 })
        .toBuffer();
      return `data:image/jpeg;base64,${buf.toString("base64")}`;
    } catch {
      throw new BadRequestException("Arquivo de imagem inválido.");
    }
  }

  private campos(body: Record<string, string>) {
    const out: Record<string, unknown> = {};
    if (body.rotulo !== undefined) {
      if (!body.rotulo.trim()) throw new BadRequestException("Informe o nome da categoria.");
      out.rotulo = body.rotulo.trim();
    }
    if (body.categoria !== undefined) {
      const valida = CATEGORIAS_SERVICO.some((c) => c.valor === body.categoria);
      out.categoria = valida ? body.categoria : null;
    }
    if (body.busca !== undefined) out.busca = body.busca.trim() || null;
    if (body.ordem !== undefined && body.ordem !== "") out.ordem = parseInt(body.ordem, 10) || 0;
    if (body.ativo !== undefined) out.ativo = body.ativo === "true";
    return out;
  }

  async criar(body: Record<string, string>, file?: Express.Multer.File) {
    const dados = this.campos(body);
    if (!dados.rotulo) throw new BadRequestException("Informe o nome da categoria.");
    if (!dados.categoria && !dados.busca) {
      throw new BadRequestException("Escolha uma categoria existente ou informe a palavra de busca.");
    }
    const imagemUrl = file ? await this.comprimir(file) : undefined;
    const max = await this.prisma.categoriaHome.aggregate({ _max: { ordem: true } });
    return this.prisma.categoriaHome.create({
      data: { rotulo: dados.rotulo as string, categoria: (dados.categoria as string) ?? null, busca: (dados.busca as string) ?? null, ordem: (dados.ordem as number) ?? (max._max.ordem ?? 0) + 1, ativo: (dados.ativo as boolean) ?? true, imagemUrl },
    });
  }

  async atualizar(id: string, body: Record<string, string>, file?: Express.Multer.File) {
    const atual = await this.prisma.categoriaHome.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException("Categoria não encontrada.");
    const dados = this.campos(body);
    if (atual.fixa) {
      delete dados.categoria;
      delete dados.busca;
      delete dados.ativo;
    }
    if (file) dados.imagemUrl = await this.comprimir(file);
    if (body.removerImagem === "true") dados.imagemUrl = null;
    return this.prisma.categoriaHome.update({ where: { id }, data: dados });
  }

  async excluir(id: string) {
    const atual = await this.prisma.categoriaHome.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException("Categoria não encontrada.");
    if (atual.fixa) throw new BadRequestException('O item "Tudo" não pode ser excluído (apenas editado).');
    await this.prisma.categoriaHome.delete({ where: { id } });
    return { ok: true };
  }
}
