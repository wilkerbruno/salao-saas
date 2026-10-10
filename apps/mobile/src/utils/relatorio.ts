import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { centavosParaReais } from "@salao-saas/shared";

export interface RelatorioApi {
  titulo: string;
  de: string;
  ate: string;
  linhas: Array<{ inicio: string; servico: string; profissional: string; status: string; valorCentavos: number; comissaoCentavos: number }>;
  totais: { atendimentos: number; valorCentavos: number; comissaoCentavos: number };
  porProfissional?: Array<{ profissional: string; atendimentos: number; valorCentavos: number; comissaoCentavos: number }>;
}

function dataBr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function dataSimples(ymd: string): string {
  const [a, m, d] = ymd.split("-");
  return `${d}/${m}/${a}`;
}

function celula(valor: string | number): string {
  const t = String(valor).replace(/"/g, '""');
  return /[;"\n]/.test(t) ? `"${t}"` : t;
}

// CSV com ";" e BOM — abre direto no Excel/Google Planilhas em português.
export function montarCsv(r: RelatorioApi): string {
  const linhas: string[] = [];
  linhas.push(celula(r.titulo));
  linhas.push(`Período;${dataSimples(r.de)} a ${dataSimples(r.ate)}`);
  linhas.push("");
  linhas.push(["Data e hora", "Serviço", "Profissional", "Situação", "Valor", "Comissão"].join(";"));
  for (const l of r.linhas) {
    linhas.push(
      [dataBr(l.inicio), l.servico, l.profissional, l.status, centavosParaReais(l.valorCentavos), centavosParaReais(l.comissaoCentavos)]
        .map(celula)
        .join(";"),
    );
  }
  linhas.push("");
  linhas.push(["TOTAL", "", "", `${r.totais.atendimentos} atendimento(s)`, centavosParaReais(r.totais.valorCentavos), centavosParaReais(r.totais.comissaoCentavos)].map(celula).join(";"));
  if (r.porProfissional?.length) {
    linhas.push("");
    linhas.push("Por profissional");
    linhas.push(["Profissional", "Atendimentos", "Valor", "Comissão"].join(";"));
    for (const p of r.porProfissional) {
      linhas.push([p.profissional, p.atendimentos, centavosParaReais(p.valorCentavos), centavosParaReais(p.comissaoCentavos)].map(celula).join(";"));
    }
  }
  return "﻿" + linhas.join("\r\n");
}

// Grava o CSV na pasta de cache do app e abre o menu de compartilhar do
// Android (salvar, enviar por WhatsApp/e-mail, abrir no Excel...).
export async function compartilharRelatorio(r: RelatorioApi, nomeArquivo: string): Promise<void> {
  if (Platform.OS === "web") throw new Error("Geração de relatório disponível só no aplicativo.");
  const destino = FileSystem.cacheDirectory + nomeArquivo;
  await FileSystem.writeAsStringAsync(destino, montarCsv(r), { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error("Este aparelho não consegue compartilhar arquivos.");
  await Sharing.shareAsync(destino, { mimeType: "text/csv", dialogTitle: "Salvar ou enviar relatório", UTI: "public.comma-separated-values-text" });
}

// Converte o período da tela financeira (hoje/semana/mês) em datas AAAA-MM-DD.
export function periodoParaDatas(periodo: "hoje" | "semana" | "mes"): { de: string; ate: string } {
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hoje = new Date();
  const de = new Date(hoje);
  if (periodo === "semana") de.setDate(de.getDate() - 7);
  else if (periodo === "mes") de.setDate(1);
  return { de: fmt(de), ate: fmt(hoje) };
}
