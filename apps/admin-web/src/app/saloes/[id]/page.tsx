"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { centavosParaReais, Plano } from "@salao-saas/shared";
import { api } from "../../../lib/api";

interface FuncionarioResumo {
  id: string;
  cargo: string;
  ativo: boolean;
  usuario: { nome: string; email: string };
}

interface FaturaResumo {
  id: string;
  valorCentavos: number;
  vencimentoEm: string;
  status: string;
  metodoPagamento: string | null;
}

interface SalaoDetalhe {
  id: string;
  nome: string;
  endereco: string | null;
  telefone: string | null;
  criadoEm: string;
  notaMedia: number;
  totalAvaliacoes: number;
  funcionarios: FuncionarioResumo[];
  visibilidadeRestrita: boolean;
  assinatura: {
    status: string;
    proximaCobrancaEm: string | null;
    trialTerminaEm: string | null;
    bloqueadaEm: string | null;
    plano: Plano;
    faturas: FaturaResumo[];
  } | null;
}

interface ClienteAutorizado {
  id: string;
  nome: string;
  email: string;
}

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Período de teste",
  ATIVA: "Ativa",
  INADIMPLENTE: "Inadimplente",
  CANCELADA: "Cancelada",
};

// Detalhe de um salão assinante: dados básicos, situação da assinatura
// (com suspender/reativar/cancelar e troca manual de plano), equipe e
// histórico de faturas — tudo que o suporte da plataforma precisa pra atender
// um chamado sem precisar mexer direto no banco.
export default function SalaoDetalhePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [salao, setSalao] = useState<SalaoDetalhe | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoSelecionado, setPlanoSelecionado] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [clientesAutorizados, setClientesAutorizados] = useState<ClienteAutorizado[]>([]);
  const [emailParaAutorizar, setEmailParaAutorizar] = useState("");
  const [autorizando, setAutorizando] = useState(false);
  const [erroVisibilidade, setErroVisibilidade] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [salaoRes, planosRes, clientesRes] = await Promise.all([
      api.get<SalaoDetalhe>(`/saloes/${id}`),
      api.get<Plano[]>("/planos/todos"),
      api.get<ClienteAutorizado[]>(`/saloes/${id}/clientes-autorizados`),
    ]);
    setSalao(salaoRes.data);
    setPlanos(planosRes.data);
    setPlanoSelecionado(salaoRes.data.assinatura?.plano.id ?? "");
    setClientesAutorizados(clientesRes.data);
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function definirStatus(status: string) {
    setErro(null);
    setSalvando(true);
    try {
      await api.patch(`/assinaturas/${id}/status`, { status });
      carregar();
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível atualizar o status.");
    } finally {
      setSalvando(false);
    }
  }

  async function aplicarPlano() {
    if (!planoSelecionado) return;
    setErro(null);
    setSalvando(true);
    try {
      await api.patch(`/assinaturas/${id}/plano`, { planoId: planoSelecionado });
      carregar();
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível trocar o plano.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarVisibilidade() {
    if (!salao) return;
    setErroVisibilidade(null);
    setAutorizando(true);
    try {
      await api.patch(`/saloes/${id}/visibilidade`, { restrita: !salao.visibilidadeRestrita });
      carregar();
    } catch (e: any) {
      setErroVisibilidade(e?.response?.data?.message ?? "Não foi possível atualizar a visibilidade.");
    } finally {
      setAutorizando(false);
    }
  }

  async function autorizarCliente() {
    if (!emailParaAutorizar.trim()) return;
    setErroVisibilidade(null);
    setAutorizando(true);
    try {
      await api.post(`/saloes/${id}/clientes-autorizados`, { email: emailParaAutorizar.trim() });
      setEmailParaAutorizar("");
      carregar();
    } catch (e: any) {
      setErroVisibilidade(e?.response?.data?.message ?? "Não foi possível autorizar esse cliente.");
    } finally {
      setAutorizando(false);
    }
  }

  async function removerClienteAutorizado(clienteId: string) {
    setErroVisibilidade(null);
    setAutorizando(true);
    try {
      await api.delete(`/saloes/${id}/clientes-autorizados/${clienteId}`);
      carregar();
    } catch (e: any) {
      setErroVisibilidade(e?.response?.data?.message ?? "Não foi possível remover esse cliente.");
    } finally {
      setAutorizando(false);
    }
  }

  if (!salao) return null;

  return (
    <div>
      <Link href="/saloes" style={{ fontSize: 13, color: "#837A73" }}>
        ← Salões
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>{salao.nome}</h1>
      <p style={{ color: "#837A73", fontSize: 13 }}>
        {salao.endereco ?? "Sem endereço cadastrado"} {salao.telefone ? `· ${salao.telefone}` : ""}
      </p>
      <p style={{ color: "#837A73", fontSize: 12, marginTop: 2 }}>
        Assinante desde {new Date(salao.criadoEm).toLocaleDateString("pt-BR")} · {salao.notaMedia.toFixed(1)}★ (
        {salao.totalAvaliacoes} avaliações)
      </p>

      {erro && (
        <div style={{ marginTop: 16, color: "#b04a6c", fontSize: 13, background: "#F7E9E6", padding: 10, borderRadius: 8 }}>
          {erro}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginTop: 24 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Assinatura</div>
          {salao.assinatura ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>{salao.assinatura.plano.nome}</div>
              <div style={{ fontSize: 13, color: "#837A73" }}>
                {centavosParaReais(salao.assinatura.plano.precoCentavos)}/mês
              </div>
              <div style={{ marginTop: 10, fontSize: 13 }}>
                Status: <strong>{STATUS_LABEL[salao.assinatura.status] ?? salao.assinatura.status}</strong>
              </div>
              {salao.assinatura.proximaCobrancaEm && (
                <div style={{ fontSize: 12, color: "#837A73", marginTop: 2 }}>
                  Próxima cobrança: {new Date(salao.assinatura.proximaCobrancaEm).toLocaleDateString("pt-BR")}
                </div>
              )}
              {salao.assinatura.status === "TRIAL" && salao.assinatura.trialTerminaEm && (
                <div style={{ fontSize: 12, color: "#837A73", marginTop: 2 }}>
                  Teste grátis termina em: {new Date(salao.assinatura.trialTerminaEm).toLocaleDateString("pt-BR")}
                </div>
              )}
              {salao.assinatura.bloqueadaEm && (
                <div style={{ fontSize: 12, color: "#b04a6c", marginTop: 6, fontWeight: 600 }}>
                  Equipe bloqueada desde {new Date(salao.assinatura.bloqueadaEm).toLocaleString("pt-BR")} — cliente
                  final some da busca após o período de carência configurado.
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <button disabled={salvando} onClick={() => definirStatus("ATIVA")} style={btnSecondary}>
                  Reativar
                </button>
                <button disabled={salvando} onClick={() => definirStatus("INADIMPLENTE")} style={btnSecondary}>
                  Suspender
                </button>
                <button disabled={salvando} onClick={() => definirStatus("CANCELADA")} style={btnDanger}>
                  Cancelar assinatura
                </button>
              </div>

              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #DEDAD4" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#837A73", marginBottom: 8 }}>
                  Trocar plano manualmente (sem cobrança — use com cuidado)
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={planoSelecionado} onChange={(e) => setPlanoSelecionado(e.target.value)} style={selectStyle}>
                    {planos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                  <button disabled={salvando} onClick={aplicarPlano} style={btnPrimary}>
                    Aplicar
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p style={{ color: "#837A73", fontSize: 13 }}>Sem assinatura.</p>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Equipe ({salao.funcionarios.length})</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {salao.funcionarios.length === 0 && <p style={{ color: "#837A73", fontSize: 13 }}>Nenhum funcionário cadastrado.</p>}
            {salao.funcionarios.map((f) => (
              <div key={f.id} style={{ fontSize: 13, opacity: f.ativo ? 1 : 0.5 }}>
                <strong>{f.usuario.nome}</strong> · {f.cargo}
                <div style={{ fontSize: 12, color: "#837A73" }}>{f.usuario.email}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Visibilidade (modo teste)</div>
        <p style={{ color: "#837A73", fontSize: 13, marginTop: 6 }}>
          Com o modo teste ativado, esse salão some da busca/"salões próximos" pra todos os clientes do app,
          exceto os autorizados abaixo. Útil pra testar o fluxo completo (agendamento, pagamento) sem aparecer pros
          clientes reais da plataforma. Não afeta o acesso direto por link.
        </p>

        {erroVisibilidade && (
          <div style={{ marginTop: 10, color: "#b04a6c", fontSize: 13, background: "#F7E9E6", padding: 10, borderRadius: 8 }}>
            {erroVisibilidade}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {salao.visibilidadeRestrita ? "🔒 Modo teste ativado" : "Visível normalmente pra todo mundo"}
          </span>
          <button disabled={autorizando} onClick={alternarVisibilidade} style={salao.visibilidadeRestrita ? btnSecondary : btnPrimary}>
            {salao.visibilidadeRestrita ? "Desativar modo teste" : "Ativar modo teste"}
          </button>
        </div>

        {salao.visibilidadeRestrita && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #DEDAD4" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#837A73", marginBottom: 8 }}>
              Clientes autorizados a ver esse salão
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {clientesAutorizados.length === 0 && (
                <p style={{ color: "#837A73", fontSize: 13 }}>Nenhum cliente autorizado ainda — ninguém vê esse salão na busca.</p>
              )}
              {clientesAutorizados.map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <div>
                    <strong>{c.nome}</strong>
                    <div style={{ fontSize: 12, color: "#837A73" }}>{c.email}</div>
                  </div>
                  <button disabled={autorizando} onClick={() => removerClienteAutorizado(c.id)} style={btnDanger}>
                    Remover
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="email"
                value={emailParaAutorizar}
                onChange={(e) => setEmailParaAutorizar(e.target.value)}
                placeholder="e-mail do cliente de teste"
                style={selectStyle}
              />
              <button disabled={autorizando} onClick={autorizarCliente} style={btnPrimary}>
                Autorizar
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Faturas</div>
        {!salao.assinatura || salao.assinatura.faturas.length === 0 ? (
          <p style={{ color: "#837A73", fontSize: 13 }}>Nenhuma fatura ainda.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Método</th>
              </tr>
            </thead>
            <tbody>
              {salao.assinatura.faturas.map((f) => (
                <tr key={f.id}>
                  <td>{centavosParaReais(f.valorCentavos)}</td>
                  <td>{new Date(f.vencimentoEm).toLocaleDateString("pt-BR")}</td>
                  <td>{f.status}</td>
                  <td>{f.metodoPagamento ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #DEDAD4",
  borderRadius: 14,
  padding: 20,
  background: "white",
};

const btnBase: React.CSSProperties = {
  border: "none",
  borderRadius: 9,
  padding: "9px 14px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = { ...btnBase, background: "#b04a6c", color: "white" };
const btnSecondary: React.CSSProperties = { ...btnBase, background: "#F1EEE9", color: "#2A2420" };
const btnDanger: React.CSSProperties = { ...btnBase, background: "#F7E9E6", color: "#b04a6c" };
const selectStyle: React.CSSProperties = {
  border: "1px solid #DEDAD4",
  borderRadius: 9,
  padding: "9px 10px",
  fontSize: 13,
  flex: 1,
};
