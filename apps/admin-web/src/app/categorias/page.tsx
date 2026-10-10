"use client";

import React, { useEffect, useState } from "react";
import { CATEGORIAS_SERVICO } from "@salao-saas/shared";
import { api } from "../../lib/api";

interface Cat {
  id: string;
  rotulo: string;
  imagemUrl: string | null;
  categoria: string | null;
  busca: string | null;
  ordem: number;
  ativo: boolean;
  fixa: boolean;
}

const NOVA = "__NOVA__";

export default function CategoriasPage() {
  const [itens, setItens] = useState<Cat[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [novo, setNovo] = useState({ rotulo: "", tipo: NOVA, busca: "", arquivo: null as File | null });
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    api.get<Cat[]>("/categorias-home/todas").then((r) => setItens(r.data));
  }
  useEffect(carregar, []);

  function erroDe(e: any) {
    const m = e?.response?.data?.message;
    return Array.isArray(m) ? m.join(", ") : m || "Não foi possível salvar.";
  }

  async function criar(ev: React.FormEvent) {
    ev.preventDefault();
    setMsg(null);
    const fd = new FormData();
    fd.append("rotulo", novo.rotulo);
    if (novo.tipo === NOVA) fd.append("busca", novo.busca || novo.rotulo);
    else fd.append("categoria", novo.tipo);
    if (novo.arquivo) fd.append("imagem", novo.arquivo);
    setSalvando(true);
    try {
      await api.post("/categorias-home", fd);
      setNovo({ rotulo: "", tipo: NOVA, busca: "", arquivo: null });
      (document.getElementById("novo-arquivo") as HTMLInputElement | null)?.value && ((document.getElementById("novo-arquivo") as HTMLInputElement).value = "");
      carregar();
    } catch (e) {
      setMsg(erroDe(e));
    } finally {
      setSalvando(false);
    }
  }

  async function salvar(c: Cat, campos: Record<string, string>, arquivo?: File | null) {
    setMsg(null);
    const fd = new FormData();
    Object.entries(campos).forEach(([k, v]) => fd.append(k, v));
    if (arquivo) fd.append("imagem", arquivo);
    try {
      await api.patch(`/categorias-home/${c.id}`, fd);
      carregar();
    } catch (e) {
      setMsg(erroDe(e));
    }
  }

  async function excluir(c: Cat) {
    if (!confirm(`Excluir "${c.rotulo}" do carrossel?`)) return;
    try {
      await api.delete(`/categorias-home/${c.id}`);
      carregar();
    } catch (e) {
      setMsg(erroDe(e));
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Categorias da Home</h1>
      <p style={{ color: "#664A43", fontSize: 13 }}>
        Carrossel de categorias da página inicial do app. Troque as fotos, mude a ordem ou crie novas categorias.
      </p>
      {msg && <div style={{ color: "#A8782A", fontSize: 13, marginTop: 12 }}>{msg}</div>}

      <form onSubmit={criar} style={{ ...cardStyle, marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>Nova categoria</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input required placeholder="Nome (ex: Podologia)" value={novo.rotulo} onChange={(e) => setNovo({ ...novo, rotulo: e.target.value })} style={{ ...inputStyle, flex: 2, minWidth: 180 }} />
          <select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })} style={{ ...inputStyle, flex: 2, minWidth: 200 }}>
            <option value={NOVA}>Categoria nova (busca por palavra)</option>
            {CATEGORIAS_SERVICO.map((c) => (
              <option key={c.valor} value={c.valor}>Atalho: {c.rotulo}</option>
            ))}
          </select>
          {novo.tipo === NOVA && (
            <input placeholder="Palavra de busca (ex: podologia)" value={novo.busca} onChange={(e) => setNovo({ ...novo, busca: e.target.value })} style={{ ...inputStyle, flex: 2, minWidth: 180 }} />
          )}
        </div>
        <input id="novo-arquivo" type="file" accept="image/*" onChange={(e) => setNovo({ ...novo, arquivo: e.target.files?.[0] ?? null })} style={{ fontSize: 13 }} />
        <button type="submit" disabled={salvando} style={{ ...btnPrimary, width: 160 }}>{salvando ? "Salvando..." : "Adicionar"}</button>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16, marginTop: 24 }}>
        {itens.map((c) => (
          <Item key={c.id} c={c} salvar={salvar} excluir={excluir} />
        ))}
      </div>
    </div>
  );
}

function Item({ c, salvar, excluir }: { c: Cat; salvar: (c: Cat, campos: Record<string, string>, arquivo?: File | null) => void; excluir: (c: Cat) => void }) {
  const [rotulo, setRotulo] = useState(c.rotulo);
  const [ordem, setOrdem] = useState(String(c.ordem));
  const [busca, setBusca] = useState(c.busca ?? "");
  useEffect(() => {
    setRotulo(c.rotulo);
    setOrdem(String(c.ordem));
    setBusca(c.busca ?? "");
  }, [c]);
  const tipo = c.fixa ? "Mostra todos os salões" : c.categoria ? `Atalho: ${CATEGORIAS_SERVICO.find((x) => x.valor === c.categoria)?.rotulo ?? c.categoria}` : "Busca por palavra";
  return (
    <div style={{ ...cardStyle, padding: 16, opacity: c.ativo ? 1 : 0.55, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {c.imagemUrl ? (
          <img src={c.imagemUrl} alt={c.rotulo} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "2px solid #A8782A" }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#DCA0A0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, textAlign: "center", color: "#664A43" }}>imagem padrão do app</div>
        )}
        <div style={{ fontSize: 12, color: "#664A43" }}>{tipo}</div>
      </div>
      <input value={rotulo} onChange={(e) => setRotulo(e.target.value)} style={inputStyle} />
      {!c.fixa && !c.categoria && <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Palavra de busca" style={inputStyle} />}
      <label style={{ fontSize: 12, color: "#664A43", display: "flex", alignItems: "center", gap: 8 }}>
        Ordem
        <input type="number" value={ordem} onChange={(e) => setOrdem(e.target.value)} style={{ ...inputStyle, width: 70, padding: "6px 8px" }} />
      </label>
      <input type="file" accept="image/*" style={{ fontSize: 12 }} onChange={(e) => { const f = e.target.files?.[0]; if (f) salvar(c, {}, f); }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btnPrimary} onClick={() => salvar(c, { rotulo, ordem, ...(!c.fixa && !c.categoria ? { busca } : {}) })}>Salvar</button>
        {!c.fixa && (
          <button style={btnSecondary} onClick={() => salvar(c, { ativo: String(!c.ativo) })}>{c.ativo ? "Ocultar" : "Mostrar"}</button>
        )}
        {c.imagemUrl && <button style={btnSecondary} onClick={() => salvar(c, { removerImagem: "true" })}>Tirar foto</button>}
        {!c.fixa && <button style={btnSecondary} onClick={() => excluir(c)}>Excluir</button>}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = { border: "1px solid #CC8C8C", borderRadius: 16, padding: 22, background: "#F5D9D7" };
const btnBase: React.CSSProperties = { border: "none", borderRadius: 9, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnPrimary: React.CSSProperties = { ...btnBase, background: "#A8782A", color: "white" };
const btnSecondary: React.CSSProperties = { ...btnBase, border: "1px solid #CC8C8C", background: "#F5D9D7" };
const inputStyle: React.CSSProperties = { border: "1px solid #CC8C8C", borderRadius: 9, padding: "10px 12px", fontSize: 13 };
