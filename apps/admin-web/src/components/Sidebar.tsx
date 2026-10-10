"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { limparToken } from "../lib/api";

const ITEMS = [
  { href: "/", label: "Visão geral" },
  { href: "/saloes", label: "Salões" },
  { href: "/planos", label: "Planos e preços" },
  { href: "/categorias", label: "Categorias da Home" },
  { href: "/faturamento", label: "Faturamento" },
  { href: "/configuracoes", label: "Configurações" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function sair() {
    limparToken();
    router.replace("/login");
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.brand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Eleva One" style={{ width: "100%", maxWidth: 170, height: "auto", display: "block" }} />
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{ ...styles.link, ...(pathname === item.href ? styles.linkActive : {}) }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <button onClick={sair} style={styles.logout}>
        Sair
      </button>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 240,
    background: "#EEC3C3",
    borderRight: "1px solid #CC8C8C",
    color: "#4B3A31",
    display: "flex",
    flexDirection: "column",
    padding: "24px 16px",
    gap: 24,
  },
  brand: { fontWeight: 800, fontSize: 16, padding: "0 8px" },
  link: { padding: "11px 12px", borderRadius: 10, color: "#664A43", textDecoration: "none", fontSize: 13, fontWeight: 600 },
  linkActive: { background: "#EACB97", color: "#4B3A31" },
  logout: { background: "none", border: "none", color: "#664A43", textAlign: "left", padding: "11px 12px", cursor: "pointer", fontSize: 13 },
};
