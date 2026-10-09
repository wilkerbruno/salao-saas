"use client";

import axios from "axios";


// Normaliza a URL da API: vazio -> producao; sem "/api" no final -> acrescenta
// (o prefixo global da API e /api; sem ele toda chamada da 404).
function normalizarApiUrl(valor: string | undefined, padrao: string): string {
  const v = (valor ?? "").trim().replace(/\/+$/, "");
  if (!v) return padrao;
  return v.endsWith("/api") ? v : `${v}/api`;
}

export const API_URL = normalizarApiUrl(process.env.NEXT_PUBLIC_API_URL, "https://api.elevaone.store/api");

export const api = axios.create({ baseURL: API_URL });

const TOKEN_KEY = "barberos_admin_token";

export function salvarToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function obterToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function limparToken() {
  localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = obterToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== "undefined") {
      limparToken();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
