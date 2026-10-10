import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button } from "./Button";
import { alertar } from "../utils/alertaCompat";
import { compartilharRelatorio, periodoParaDatas, RelatorioApi } from "../utils/relatorio";

// "Gerar relatório": só aparece se o PLANO do salão incluir relatórios (ver
// Plano.relatoriosHabilitado / GET /financeiro/relatorios-disponiveis).
// tipo "salao" = relatório geral (dono); "meu" = só os atendimentos do próprio
// profissional.
export function BotaoRelatorio({ tipo, periodo }: { tipo: "salao" | "meu"; periodo: "hoje" | "semana" | "mes" }) {
  const [habilitado, setHabilitado] = useState(false);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    api
      .get<{ habilitado: boolean }>("/financeiro/relatorios-disponiveis")
      .then(({ data }) => setHabilitado(!!data.habilitado))
      .catch(() => setHabilitado(false));
  }, []);

  if (!habilitado) return null;

  async function gerar() {
    setGerando(true);
    try {
      const { de, ate } = periodoParaDatas(periodo);
      const rota = tipo === "salao" ? "/financeiro/relatorio-salao" : "/financeiro/meu-relatorio";
      const { data } = await api.get<RelatorioApi>(rota, { params: { de, ate } });
      await compartilharRelatorio(data, `relatorio-${tipo === "salao" ? "salao" : "profissional"}-${de}-a-${ate}.csv`);
    } catch (e: any) {
      alertar("Não foi possível gerar o relatório", e?.response?.data?.message ?? e?.message ?? "Tente novamente.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <Button
      label={gerando ? "Gerando..." : tipo === "salao" ? "Gerar relatório geral" : "Gerar meu relatório"}
      variant="secondary"
      onPress={gerar}
      loading={gerando}
    />
  );
}
