// Tokens visuais do app — tema escuro "rosé": vinho escuro com rosé de
// destaque, pensado para salão feminino (cabelo + unhas). Toda tela usa só
// os nomes abaixo (colors.*, nunca hex direto), então trocar a paleta aqui
// muda o app inteiro.
export const colors = {
  background: "#161014",
  surface: "#211820",
  surfaceAlt: "#2C2029",
  ink: "#F7EEF1",
  inkMuted: "#A99BA3",
  border: "#43323D",
  accent: "#E8A0B4", // rosé — cor de destaque (botões, ícone ativo, estrelas)
  accentSoft: "#40222F",
  accentInk: "#2A0F1B", // texto escuro sobre o rosé (contraste)
  success: "#7BB394",
  successSoft: "#1E2B24",
  danger: "#E5736A",
  dangerSoft: "#38201F",
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
