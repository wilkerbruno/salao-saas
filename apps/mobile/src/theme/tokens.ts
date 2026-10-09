// Tokens visuais do app — tema claro "rosa e dourado": fundo rosa claro com dourado de
// destaque, pensado para salão feminino (cabelo + unhas). Toda tela usa só
// os nomes abaixo (colors.*, nunca hex direto), então trocar a paleta aqui
// muda o app inteiro.
export const colors = {
  background: "#F2CFCF",
  surface: "#FBE6E4",
  surfaceAlt: "#EBBDBD",
  ink: "#4B3A31",
  inkMuted: "#7A5F58",
  border: "#DDA9A9",
  accent: "#A8782A", // dourado - cor de destaque (botoes, icone ativo, estrelas)
  accentSoft: "#F3DDB5",
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
