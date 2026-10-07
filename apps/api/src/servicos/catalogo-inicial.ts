import { CategoriaServico } from "@salao-saas/shared";

// Catálogo de exemplo criado junto com um salão novo (AuthService.registerSalao),
// pra o dono não começar com a lista vazia: o cliente já consegue agendar
// cabelo e unha no mesmo atendimento no primeiro dia. Preços são valores de
// referência — o dono ajusta em "Mais > Serviços e pacotes". Preço em centavos.
export const SERVICOS_INICIAIS: {
  chave: string;
  nome: string;
  descricao: string;
  categoria: CategoriaServico;
  duracaoMinutos: number;
  precoCentavos: number;
}[] = [
  { chave: "corte", nome: "Corte feminino", descricao: "Corte com lavagem e finalização.", categoria: "CABELO", duracaoMinutos: 60, precoCentavos: 8000 },
  { chave: "escova", nome: "Escova", descricao: "Lavagem, escova modelada e finalização.", categoria: "CABELO", duracaoMinutos: 45, precoCentavos: 5000 },
  { chave: "hidratacao", nome: "Hidratação", descricao: "Tratamento de hidratação profunda.", categoria: "CABELO", duracaoMinutos: 60, precoCentavos: 9000 },
  { chave: "coloracao", nome: "Coloração", descricao: "Coloração completa ou retoque de raiz.", categoria: "CABELO", duracaoMinutos: 120, precoCentavos: 15000 },
  { chave: "manicure", nome: "Manicure", descricao: "Cutilagem e esmaltação das mãos.", categoria: "UNHA", duracaoMinutos: 45, precoCentavos: 3500 },
  { chave: "pedicure", nome: "Pedicure", descricao: "Cutilagem e esmaltação dos pés.", categoria: "UNHA", duracaoMinutos: 45, precoCentavos: 4000 },
  { chave: "gel", nome: "Esmaltação em gel", descricao: "Esmalte em gel de longa duração.", categoria: "UNHA", duracaoMinutos: 60, precoCentavos: 8000 },
  { chave: "alongamento", nome: "Alongamento de unhas", descricao: "Alongamento em gel ou fibra.", categoria: "UNHA", duracaoMinutos: 120, precoCentavos: 18000 },
];

// Combo que mistura categorias — mostra de cara o agendamento "cabelo + unha em
// um lugar só" (cada serviço é feito pela profissional da área, em sequência).
export const PACOTES_INICIAIS: { nome: string; descricao: string; precoCentavos: number; servicos: string[] }[] = [
  {
    nome: "Escova + Manicure",
    descricao: "Saia pronta: escova e manicure no mesmo horário.",
    precoCentavos: 8000,
    servicos: ["escova", "manicure"],
  },
];
