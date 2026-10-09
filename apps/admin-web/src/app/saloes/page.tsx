"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

interface SalaoResumo {
  id: string;
  nome: string;
  criadoEm: string;
  assinatura: { status: string; plano: { nome: string } } | null;
  funcionarios: unknown[];
  visibilidadeRestrita: boolean;
}

export default function SaloesPage() {
  const [saloes, setSaloes] = useState<SalaoResumo[]>([]);

  useEffect(() => {
    api.get<SalaoResumo[]>("/saloes").then((res) => setSaloes(res.data));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Salões</h1>
      <p style={{ color: "#664A43", fontSize: 13 }}>Todas as contas assinantes da plataforma</p>

      <div style={{ border: "1px solid #CC8C8C", borderRadius: 14, background: "#F5D9D7", marginTop: 20, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Salão</th>
              <th>Plano</th>
              <th>Funcionários</th>
              <th>Status</th>
              <th>Visibilidade</th>
              <th>Desde</th>
            </tr>
          </thead>
          <tbody>
            {saloes.map((b) => (
              <tr key={b.id} style={{ cursor: "pointer" }} onClick={() => (window.location.href = `/saloes/${b.id}`)}>
                <td style={{ fontWeight: 700 }}>
                  <Link href={`/saloes/${b.id}`} onClick={(e) => e.stopPropagation()}>
                    {b.nome}
                  </Link>
                </td>
                <td>{b.assinatura?.plano.nome ?? "—"}</td>
                <td>{b.funcionarios.length}</td>
                <td>{b.assinatura?.status ?? "—"}</td>
                <td>
                  {b.visibilidadeRestrita ? (
                    <span style={{ color: "#A8782A", fontWeight: 700, fontSize: 12 }}>🔒 Teste</span>
                  ) : (
                    <span style={{ color: "#664A43", fontSize: 12 }}>Normal</span>
                  )}
                </td>
                <td>{new Date(b.criadoEm).toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
