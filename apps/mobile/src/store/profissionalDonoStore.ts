import { create } from "zustand";
import { api } from "../api/client";

// Dono de salão que TAMBÉM atende: tem cadastro de profissional (Funcionario)
// na mesma conta. Quando existe, o app do dono ganha "Minha agenda", "Meus
// horários" e "Meu financeiro" (ver SalaoTabs/MaisScreen).
interface ProfissionalDonoState {
  carregado: boolean;
  atende: boolean;
  carregar: () => Promise<void>;
  ativar: () => Promise<void>;
  limpar: () => void;
}

export const useProfissionalDono = create<ProfissionalDonoState>((set) => ({
  carregado: false,
  atende: false,
  carregar: async () => {
    try {
      const { data } = await api.get<{ id: string } | null>("/funcionarios/eu");
      set({ atende: !!data, carregado: true });
    } catch {
      set({ carregado: true });
    }
  },
  ativar: async () => {
    await api.post("/funcionarios/eu");
    set({ atende: true, carregado: true });
  },
  limpar: () => set({ carregado: false, atende: false }),
}));
