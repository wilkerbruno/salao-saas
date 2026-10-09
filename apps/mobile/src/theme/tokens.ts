// Tokens visuais do app — tema claro "rosa e dourado": fundo rosa claro com dourado de
// destaque, pensado para salão feminino (cabelo + unhas). Toda tela usa só
// os nomes abaixo (colors.*, nunca hex direto), então trocar a paleta aqui
// muda o app inteiro.
export const colors = {
  background: "#E6B4B4",
  surface: "#F5D9D7",
  surfaceAlt: "#DCA0A0",
  ink: "#4B3A31",
  inkMuted: "#664A43",
  border: "#CC8C8C",
  accent: "#A8782A", // dourado - cor de destaque (botoes, icone ativo, estrelas)
  accentSoft: "#EACB97",
  accentInk: "#FFFFFF", // texto sobre o dourado
  success: "#3F8F62",
  successSoft: "#E1F1E7",
  danger: "#C4493F",
  dangerSoft: "#FADDD9",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  pill: 999,
};

export const typography = {
  // Carregue Manrope/Work Sans via expo-font se quiser igualar 100% ao protótipo;
  // até lá, o sistema usa a fonte padrão da plataforma.
  heading: { fontWeight: "800" as const },
  subheading: { fontWeight: "700" as const },
  body: { fontWeight: "400" as const },
};
