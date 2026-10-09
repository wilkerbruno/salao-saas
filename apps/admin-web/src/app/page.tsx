"use client";

import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { centavosParaReais } from "@salao-saas/shared";

interface AssinaturaResumo {
  id: string;
  status: string;
  salao: { nome: string };
  plano: { nome: string; precoCentavos: number };
}

interface FaturaResumo {
  id: string;
  status: string;
  valorCentavos: number;
}

// Visão geral: MRR calculado a partir das assinaturas ativas (soma do preço do
// plano de cada uma) — é a receita contratada, não necessariamente a já
// recebida (pra isso, ver "Recebido este mês", que vem das faturas PAGA de
// verdade confirmadas pelo Mercado Pago). Métricas mais ricas (churn, séries
// históricas) exigem guardar snapshots mensais — próximo passo natural aqui.
export default function DashboardPage() {
  const [assinaturas, setAssinaturas] = useState<AssinaturaResumo[]>([]);
  const [faturas, setFaturas] = useState<FaturaResumo[]>([]);

  useEffect(() => {
    api.get<AssinaturaResumo[]>("/assinaturas").then((res) => setAssinaturas(res.data));
    api.get<FaturaResumo[]>("/faturas").then((res) => setFaturas(res.data));
  }, []);

  const ativas = assinaturas.filter((a) => a.status === "ATIVA");
  const inadimplentes = assinaturas.filter((a) => a.status === "INADIMPLENTE");
  const mrrCentavos = ativas.reduce((soma, a) => soma + a.plano.precoCentavos, 0);
  const recebidoCentavos = faturas.filter((f) => f.status === "PAGA").reduce((soma, f) => soma + f.valorCentavos, 0);
  const emAtraso = faturas.filter((f) => f.status === "ATRASADA").length;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Visão geral</h1>
      <p style={{ color: "#664A43", fontSize: 13 }}>Desempenho da plataforma entre todas os salões assinantes</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 28 }}>
        <Card label="MRR (receita contratada)" value={centavosParaReais(mrrCentavos)} />
        <Card label="Recebido (faturas pagas)" value={centavosParaReais(recebidoCentavos)} />
        <Card label="Salões assinantes" value={String(assinaturas.length)} />
        <Card label="Assinaturas ativas" value={String(ativas.length)} />
        <Card label="Inadimplentes" value={String(inadimplentes.length)} highlight={inadimplentes.length > 0} />
        <Card label="Faturas em atraso" value={String(emAtraso)} highlight={emAtraso > 0} />
      </div>
    </div>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        border: `1px solid ${highlight ? "#E6C9A0" : "#CC8C8C"}`,
        borderRadius: 14,
        padding: 18,
        background: highlight ? "#FBF0DD" : "#F5D9D7",
      }}
    >
      <div style={{ fontSize: 12, color: "#664A43" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: highlight ? "#A8782A" : "#4B3A31" }}>{value}</div>
    </div>
  );
}
