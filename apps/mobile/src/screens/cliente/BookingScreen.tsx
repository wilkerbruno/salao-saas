import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  AgendamentoLoteCriado,
  AssinaturaPacoteCliente,
  atendeCategoria,
  CATEGORIAS_SERVICO,
  CategoriaServico,
  centavosParaReais,
  etapasDoPacote,
  FuncionariosPorCategoria,
  FuncionarioPublico as FuncionarioPublicoBase,
  MetodoPagamento,
  Pacote,
  rotuloCategoria,
  Servico,
  StatusAssinaturaPacote,
} from "@salao-saas/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { AvisoAgendamentoModal, AvisoItem } from "../../components/AvisoAgendamentoModal";
import { CategoriaChips } from "../../components/CategoriaChips";
import { alertar } from "../../utils/alertaCompat";
import { colors, radius, spacing } from "../../theme/tokens";
import { HomeStackParamList } from "../../navigation/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Agendar">;

const HOJE = new Date();
const HOJE_ISO = formatarDataLocal(HOJE);
const LIMITE_DIAS_FUTUROS = 60; // até quantos dias à frente dá pra agendar

// Fluxo de agendamento do salão — cabelo, unha e o que mais houver, num atendimento só:
// 1) escolher um ou mais serviços (de qualquer categoria; pode repetir o mesmo)
// → 2) escolher QUEM faz cada área (ex: a Ana no cabelo, a Bia nas unhas — ou
// "qualquer profissional" em cada uma) e, se houver mais de uma área, por qual
// delas começar → 3) escolher um dia no calendário → 4) escolher um horário
// livre (o servidor só oferece horários em que TODAS as etapas cabem em
// sequência, cada uma com uma profissional da área livre naquele trecho) →
// 5) conferir o resumo (cada etapa com seu horário) e confirmar.

// Duração de um pacote = soma da duração de cada serviço incluído nele (só
// pra exibir na lista — o cálculo de verdade é por etapa, ver etapasDoPacote).
function duracaoDoPacote(pacote: Pacote): number {
  return pacote.servicos.reduce((total, ps) => total + ps.servico.duracaoMinutos, 0) || 30;
}

// "PACOTE" é uma opção a mais além dos métodos de pagamento avulso de
// verdade — quando escolhida, nenhum Pagamento é criado (ver criarLote no
// backend); é só a cota da assinatura mensal sendo usada.
type FormaPagamento = MetodoPagamento | "PACOTE";

// Resposta de GET /saloes/:id/funcionarios (ver
// SaloesService.listarFuncionariosPublico) — só o necessário pra montar
// a lista de "escolher profissional", nunca dados sensíveis do usuário dela.
interface FuncionarioPublico extends FuncionarioPublicoBase {
  fotoUrl: string | null;
}

// Uma etapa do atendimento já na ordem em que será feita.
interface EtapaTela {
  nome: string;
  duracaoMinutos: number;
  categoria: CategoriaServico | null;
}

// Item escolhido (serviço ou pacote) com a categoria que define sua posição na sequência.
type ItemSelecionado =
  | { tipo: "servico"; id: string; nome: string; duracaoMinutos: number; precoCentavos: number; quantidade: number; categoria: CategoriaServico }
  | { tipo: "pacote"; id: string; nome: string; duracaoMinutos: number; precoCentavos: number; quantidade: number; pacote: Pacote };

export function BookingScreen({ route, navigation }: Props) {
  const { salaoId } = route.params;
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [quantidadesPacotes, setQuantidadesPacotes] = useState<Record<string, number>>({});
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaServico | undefined>(undefined);

  // Profissional escolhida por categoria (ex: { CABELO: "<id>", UNHA: "<id>" });
  // categoria sem entrada = "qualquer profissional dessa área disponível".
  const [funcionarios, setFuncionarios] = useState<FuncionarioPublico[]>([]);
  const [profissionaisPorCategoria, setProfissionaisPorCategoria] = useState<FuncionariosPorCategoria>({});
  // Por qual área o atendimento começa (as demais seguem em ordem).
  const [ordemCategorias, setOrdemCategorias] = useState<CategoriaServico[]>(CATEGORIAS_SERVICO.map((c) => c.valor));

  // Quando o cliente já escolheu os itens na Home, pulamos direto pra
  // escolha de dia/horário — a seleção só reaparece se ele tocar "Alterar itens".
  const temPreSelecao = !!route.params?.itensPreSelecionados?.length;
  const [mostrarSelecao, setMostrarSelecao] = useState(!temPreSelecao);

  const [mesVisivel, setMesVisivel] = useState({ ano: HOJE.getFullYear(), mes: HOJE.getMonth() + 1 });
  const [diasDisponiveis, setDiasDisponiveis] = useState<string[]>([]);
  const [carregandoDias, setCarregandoDias] = useState(false);
  const [diaSelecionado, setDiaSelecionado] = useState<string | undefined>();

  const [horarios, setHorarios] = useState<string[]>([]);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [horarioSelecionado, setHorarioSelecionado] = useState<string | undefined>();

  // true = cabelo, unhas etc. ao mesmo tempo (profissionais diferentes).
  const [simultaneo, setSimultaneo] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>(MetodoPagamento.PIX);
  const [enviando, setEnviando] = useState(false);
  const [avisoSalao, setAvisoSalao] = useState<string | null>(null);
  const [avisosModal, setAvisosModal] = useState<AvisoItem[] | null>(null);

  // Assinaturas ATIVAS do cliente nesse salão — usadas pra oferecer "usar
  // meu pacote mensal" quando ela cobrir os serviços/dia/cota escolhidos (a
  // conferência de verdade é sempre no servidor, isso aqui só decide se
  // mostra a opção).
  const [assinaturasAtivas, setAssinaturasAtivas] = useState<AssinaturaPacoteCliente[]>([]);
  useEffect(() => {
    api
      .get<AssinaturaPacoteCliente[]>("/pacotes-mensais/minhas-assinaturas")
      .then(({ data }) =>
        setAssinaturasAtivas(data.filter((a) => a.salaoId === salaoId && a.status === StatusAssinaturaPacote.ATIVA)),
      )
      .catch(() => setAssinaturasAtivas([]));
  }, [salaoId]);

  // Carrega o catálogo de serviços, pacotes e a equipe (pra "escolher
  // profissional") e já marca o que veio por parâmetro (quando o cliente
  // escolheu tudo direto na Home).
  useEffect(() => {
    api
      .get<{ observacaoAgendamento?: string | null }>(`/saloes/${salaoId}/publico`)
      .then((r) => setAvisoSalao(r.data?.observacaoAgendamento?.trim() || null))
      .catch(() => setAvisoSalao(null));
    Promise.all([
      api.get<Servico[]>(`/saloes/${salaoId}/servicos`),
      api.get<Pacote[]>(`/saloes/${salaoId}/pacotes`),
      api.get<FuncionarioPublico[]>(`/saloes/${salaoId}/funcionarios`),
    ]).then(([servicosRes, pacotesRes, funcionariosRes]) => {
      setServicos(servicosRes.data);
      setPacotes(pacotesRes.data);
      setFuncionarios(funcionariosRes.data);

      const itens = route.params?.itensPreSelecionados;
      if (itens?.length) {
        const novasQuantidades: Record<string, number> = {};
        const novasQuantidadesPacotes: Record<string, number> = {};
        for (const item of itens) {
          if ("servicoId" in item && item.servicoId) {
            novasQuantidades[item.servicoId] = (novasQuantidades[item.servicoId] ?? 0) + 1;
          } else if ("pacoteId" in item && item.pacoteId) {
            novasQuantidadesPacotes[item.pacoteId] = (novasQuantidadesPacotes[item.pacoteId] ?? 0) + 1;
          }
        }
        setQuantidades(novasQuantidades);
        setQuantidadesPacotes(novasQuantidadesPacotes);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salaoId]);

  // Itens escolhidos, na ordem do atendimento: pela área que começa primeiro
  // (ordemCategorias) e, dentro dela, na ordem do catálogo.
  const itensSelecionados = useMemo<ItemSelecionado[]>(() => {
    const doServicos: ItemSelecionado[] = servicos
      .filter((s) => (quantidades[s.id] ?? 0) > 0)
      .map((s) => ({
        tipo: "servico" as const,
        id: s.id,
        nome: s.nome,
        duracaoMinutos: s.duracaoMinutos,
        precoCentavos: s.precoCentavos,
        quantidade: quantidades[s.id],
        categoria: s.categoria,
      }));
    const doPacotes: ItemSelecionado[] = pacotes
      .filter((p) => (quantidadesPacotes[p.id] ?? 0) > 0)
      .map((p) => ({
        tipo: "pacote" as const,
        id: p.id,
        nome: p.nome,
        duracaoMinutos: duracaoDoPacote(p),
        precoCentavos: p.precoCentavos,
        quantidade: quantidadesPacotes[p.id],
        pacote: p,
      }));
    const posicao = (item: ItemSelecionado) => {
      const categoria = item.tipo === "servico" ? item.categoria : (etapasDoPacote(item.pacote)[0]?.categoria ?? null);
      const indice = categoria ? ordemCategorias.indexOf(categoria) : ordemCategorias.length;
      return indice < 0 ? ordemCategorias.length : indice;
    };
    return [...doServicos, ...doPacotes]
      .map((item, ordemOriginal) => ({ item, ordemOriginal }))
      .sort((a, b) => posicao(a.item) - posicao(b.item) || a.ordemOriginal - b.ordemOriginal)
      .map(({ item }) => item);
  }, [servicos, pacotes, quantidades, quantidadesPacotes, ordemCategorias]);
  const totalItens = itensSelecionados.reduce((total, item) => total + item.quantidade, 0);
  const duracaoTotalMinutos = itensSelecionados.reduce((total, item) => total + item.duracaoMinutos * item.quantidade, 0);
  const precoTotalCentavos = itensSelecionados.reduce((total, item) => total + item.precoCentavos * item.quantidade, 0);

  // Etapas na ordem em que serão feitas — um serviço por etapa (pacote com
  // várias áreas vira uma etapa por serviço, igual ao servidor).
  const etapas = useMemo<EtapaTela[]>(() => {
    const lista: EtapaTela[] = [];
    for (const item of itensSelecionados) {
      for (let i = 0; i < item.quantidade; i++) {
        if (item.tipo === "servico") {
          lista.push({ nome: item.nome, duracaoMinutos: item.duracaoMinutos, categoria: item.categoria });
        } else {
          lista.push(...etapasDoPacote(item.pacote));
        }
      }
    }
    return lista;
  }, [itensSelecionados]);

  // Áreas presentes no atendimento, na ordem em que acontecem.
  const categoriasDoAtendimento = useMemo(() => {
    const vistas: CategoriaServico[] = [];
    for (const etapa of etapas) if (etapa.categoria && !vistas.includes(etapa.categoria)) vistas.push(etapa.categoria);
    return vistas;
  }, [etapas]);

  // O modo simultâneo só existe quando há mais de uma área no atendimento.
  const simultaneoAtivo = simultaneo && categoriasDoAtendimento.length > 1;

  // Parâmetro `etapas` das consultas de disponibilidade (ver SaloesController.parseEtapas).
  const etapasParam = useMemo(
    () =>
      JSON.stringify(
        etapas.map((e) => ({
          duracaoMinutos: e.duracaoMinutos,
          categoria: e.categoria,
          funcionarioId: e.categoria ? profissionaisPorCategoria[e.categoria] : undefined,
        })),
      ),
    [etapas, profissionaisPorCategoria],
  );

  // Existe uma assinatura de pacote mensal que cobre exatamente o que foi
  // escolhido? Só serviços avulsos contam (nada de Pacote-combo), todos
  // precisam estar incluídos no MESMO pacote, no dia da semana permitido e
  // com cota sobrando — o servidor confere tudo de novo antes de confirmar.
  const assinaturaElegivel = useMemo(() => {
    if (itensSelecionados.length === 0 || !diaSelecionado) return null;
    if (itensSelecionados.some((item) => item.tipo !== "servico")) return null;
    const diaSemana = new Date(`${diaSelecionado}T00:00:00`).getDay();
    const servicoIds = itensSelecionados.map((item) => item.id);
    return (
      assinaturasAtivas.find((assinatura) => {
        const pacote = assinatura.pacoteMensal;
        if (!pacote) return false;
        const idsIncluidos = new Set(pacote.servicos.map((ps) => ps.servicoId));
        if (!servicoIds.every((id) => idsIncluidos.has(id))) return false;
        if (!pacote.diasSemanaPermitidos.includes(diaSemana)) return false;
        return (assinatura.usosNaSemana ?? 0) + totalItens <= pacote.vezesPorSemana;
      }) ?? null
    );
  }, [itensSelecionados, diaSelecionado, totalItens, assinaturasAtivas]);

  // Se a seleção mudou e o pacote deixou de cobrir, volta pro Pix (não deixa
  // a opção "Pacote mensal" marcada escondida sem aparecer mais na lista).
  useEffect(() => {
    if (formaPagamento === "PACOTE" && !assinaturaElegivel) setFormaPagamento(MetodoPagamento.PIX);
  }, [assinaturaElegivel, formaPagamento]);

  // Qualquer mudança no que será feito/por quem/em que ordem altera a
  // disponibilidade, então o dia/horário escolhidos antes podem não valer
  // mais — melhor pedir pra escolher de novo do que arriscar um agendamento
  // que estoura o horário de outro cliente.
  function resetarDiaEHorario() {
    setDiaSelecionado(undefined);
    setHorarioSelecionado(undefined);
  }

  function alterarQuantidade(servicoId: string, delta: number) {
    setQuantidades((atual) => ({ ...atual, [servicoId]: Math.max(0, (atual[servicoId] ?? 0) + delta) }));
    resetarDiaEHorario();
  }

  function alterarQuantidadePacote(pacoteId: string, delta: number) {
    setQuantidadesPacotes((atual) => ({ ...atual, [pacoteId]: Math.max(0, (atual[pacoteId] ?? 0) + delta) }));
    resetarDiaEHorario();
  }

  function escolherProfissional(categoria: CategoriaServico, id: string | undefined) {
    setProfissionaisPorCategoria((atual) => {
      const proximo = { ...atual };
      if (id) proximo[categoria] = id;
      else delete proximo[categoria];
      return proximo;
    });
    resetarDiaEHorario();
  }

  // Recarrega os dias disponíveis sempre que o mês visível ou o atendimento
  // (etapas, profissionais escolhidas) mudam.
  useEffect(() => {
    if (etapas.length === 0) {
      setDiasDisponiveis([]);
      return;
    }
    let cancelado = false;
    setCarregandoDias(true);
    const mes = `${mesVisivel.ano}-${String(mesVisivel.mes).padStart(2, "0")}`;
    api
      .get<string[]>(`/saloes/${salaoId}/dias-disponiveis`, { params: { mes, etapas: etapasParam, simultaneo: simultaneoAtivo ? 1 : undefined } })
      .then(({ data }) => !cancelado && setDiasDisponiveis(data))
      .finally(() => !cancelado && setCarregandoDias(false));
    return () => {
      cancelado = true;
    };
  }, [salaoId, mesVisivel, etapasParam, etapas.length, simultaneoAtivo]);

  // Recarrega os horários sempre que o dia escolhido ou o atendimento mudam.
  useEffect(() => {
    if (!diaSelecionado || etapas.length === 0) {
      setHorarios([]);
      return;
    }
    let cancelado = false;
    setCarregandoHorarios(true);
    setHorarioSelecionado(undefined);
    api
      .get<string[]>(`/saloes/${salaoId}/horarios-disponiveis`, { params: { data: diaSelecionado, etapas: etapasParam, simultaneo: simultaneoAtivo ? 1 : undefined } })
      .then(({ data }) => !cancelado && setHorarios(data))
      .finally(() => !cancelado && setCarregandoHorarios(false));
    return () => {
      cancelado = true;
    };
  }, [salaoId, diaSelecionado, etapasParam, etapas.length, simultaneoAtivo]);

  const markedDates = useMemo(() => {
    const marcado: Record<string, any> = {};
    if (!carregandoDias && etapas.length > 0) {
      for (const dia of diasDoMes(mesVisivel.ano, mesVisivel.mes)) {
        if (dia < HOJE_ISO) continue; // dias passados: o minDate do calendário já cuida de não deixar navegar
        marcado[dia] = diasDisponiveis.includes(dia)
          ? { marked: true, dotColor: colors.accent }
          : { disabled: true, disableTouchEvent: true };
      }
    }
    if (diaSelecionado) {
      marcado[diaSelecionado] = {
        ...(marcado[diaSelecionado] ?? {}),
        selected: true,
        selectedColor: colors.accent,
        selectedTextColor: colors.accentInk,
      };
    }
    return marcado;
  }, [diasDisponiveis, diaSelecionado, mesVisivel, carregandoDias, etapas.length]);

  // Só manda profissionais efetivamente escolhidas (e que ainda são das áreas do atendimento).
  function profissionaisParaEnvio(): FuncionariosPorCategoria | undefined {
    const resultado: FuncionariosPorCategoria = {};
    for (const categoria of categoriasDoAtendimento) {
      const id = profissionaisPorCategoria[categoria];
      if (id) resultado[categoria] = id;
    }
    return Object.keys(resultado).length > 0 ? resultado : undefined;
  }

  // Antes de agendar, mostra o aviso do salão + observações dos serviços
  // escolhidos (inclusive os de dentro de pacotes); só libera após 60s.
  function confirmar() {
    const avisos: AvisoItem[] = [];
    if (avisoSalao) avisos.push({ titulo: "Aviso do salão", texto: avisoSalao });
    const vistos = new Set<string>();
    const add = (nome: string, obs?: string | null) => {
      const t = obs?.trim();
      if (!t || vistos.has(nome + t)) return;
      vistos.add(nome + t);
      avisos.push({ titulo: nome, texto: t });
    };
    for (const s of servicos) if ((quantidades[s.id] ?? 0) > 0) add(s.nome, s.observacao);
    for (const p of pacotes) {
      if ((quantidadesPacotes[p.id] ?? 0) <= 0) continue;
      for (const ps of p.servicos) add(ps.servico.nome, (ps.servico as { observacao?: string | null }).observacao);
    }
    if (avisos.length === 0) {
      void executarConfirmacao();
      return;
    }
    setAvisosModal(avisos);
  }

  async function executarConfirmacao() {
    if (!diaSelecionado || !horarioSelecionado || itensSelecionados.length === 0) return;
    // Offset fixo do horário de Brasília: evita depender do fuso configurado
    // no aparelho do cliente pra não agendar num horário errado.
    const inicio = `${diaSelecionado}T${horarioSelecionado}:00-03:00`;
    // Na ordem do atendimento (itensSelecionados já vem ordenado pela área que começa primeiro).
    const itens = itensSelecionados.flatMap((item) =>
      Array.from({ length: item.quantidade }, () =>
        item.tipo === "servico" ? { servicoId: item.id } : { pacoteId: item.id },
      ),
    );
    const funcionariosPorCategoria = profissionaisParaEnvio();

    // Cartão nunca cria o agendamento direto por aqui — primeiro precisa do
    // formulário nativo (tokeniza e cobra na hora, sem sair do app); é a
    // CartaoScreen quem chama POST /agendamentos/lote depois de tokenizar.
    if (formaPagamento === MetodoPagamento.CARTAO) {
      navigation.navigate("Cartao", { salaoId, inicio, itens, valorCentavos: precoTotalCentavos, funcionariosPorCategoria, simultaneo: simultaneoAtivo });
      return;
    }

    setEnviando(true);
    try {
      const usandoPacote = formaPagamento === "PACOTE" && assinaturaElegivel;
      const { data } = await api.post<AgendamentoLoteCriado>("/agendamentos/lote", {
        inicio,
        itens,
        funcionariosPorCategoria,
        simultaneo: simultaneoAtivo,
        metodoPagamento: usandoPacote ? undefined : (formaPagamento as MetodoPagamento),
        usarAssinaturaPacoteId: usandoPacote ? assinaturaElegivel.id : undefined,
      });
      if (formaPagamento === MetodoPagamento.DINHEIRO) {
        // Já nasce CONFIRMADO (ver AgendamentosService.criarLote) — não tem
        // QR/cobrança pra mostrar, então pula a PagamentoScreen (que é só pra
        // Pix/Cartão) e confirma direto, igual ao fluxo de pacote mensal.
        alertar("Agendamento confirmado!", "Pague em dinheiro direto no salão, na hora do atendimento.");
        navigation.navigate("Home");
      } else if (data.pagamento) {
        navigation.replace("Pagamento", { pagamento: data.pagamento, aviso: data.aviso });
      } else {
        alertar("Agendamento confirmado!", "Reservado usando a cota do seu pacote mensal.");
        navigation.navigate("Home");
      }
    } catch (e: any) {
      alertar("Não foi possível agendar", e?.response?.data?.message ?? "Tente outro horário.");
    } finally {
      setEnviando(false);
    }
  }

  const dataHoraSelecionada = diaSelecionado && horarioSelecionado ? `${diaSelecionado}T${horarioSelecionado}:00-03:00` : undefined;

  // Horário de início de cada etapa (HH:mm), a partir do horário escolhido —
  // mostrado no resumo pra ficar claro "10:00 escova · 11:00 manicure".
  const horariosDasEtapas = useMemo(() => {
    if (!horarioSelecionado) return [];
    const [h, m] = horarioSelecionado.split(":").map(Number);
    const base = h * 60 + m;
    // Em sequência há um cursor só; no modo simultâneo, um por área.
    const cursores: Record<string, number> = {};
    let cursorUnico = base;
    const formatar = (t: number) => `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    return etapas.map((etapa) => {
      const chave = etapa.categoria ?? "_";
      const inicio = simultaneoAtivo ? (cursores[chave] ?? base) : cursorUnico;
      const fim = inicio + etapa.duracaoMinutos;
      if (simultaneoAtivo) cursores[chave] = fim;
      else cursorUnico = fim;
      return { inicio: formatar(inicio), fim: formatar(fim), fimMinutos: fim };
    });
  }, [etapas, horarioSelecionado, simultaneoAtivo]);

  // Horário em que o atendimento todo termina (a etapa que acaba por último).
  const fimDoAtendimento = useMemo(() => {
    if (horariosDasEtapas.length === 0) return undefined;
    const ultima = horariosDasEtapas.reduce((a, b) => (b.fimMinutos > a.fimMinutos ? b : a));
    return ultima.fim;
  }, [horariosDasEtapas]);

  // Duração do atendimento completo (a mais longa das filas, se simultâneo).
  const duracaoDoAtendimentoMinutos = useMemo(() => {
    if (!simultaneoAtivo) return duracaoTotalMinutos;
    const porArea: Record<string, number> = {};
    for (const e of etapas) porArea[e.categoria ?? "_"] = (porArea[e.categoria ?? "_"] ?? 0) + e.duracaoMinutos;
    return Math.max(0, ...Object.values(porArea));
  }, [simultaneoAtivo, etapas, duracaoTotalMinutos]);

  const nomeDaProfissional = (categoria: CategoriaServico | null) => {
    const id = categoria ? profissionaisPorCategoria[categoria] : undefined;
    return funcionarios.find((f) => f.id === id)?.usuario.nome;
  };

  // Categorias que têm algum serviço (ou pacote) no catálogo — só elas viram filtro/seção.
  const categoriasDoCatalogo = useMemo(() => {
    const presentes = new Set<CategoriaServico>(servicos.map((s) => s.categoria));
    return CATEGORIAS_SERVICO.map((c) => c.valor).filter((c) => presentes.has(c));
  }, [servicos]);

  const servicosVisiveis = servicos.filter((s) => !categoriaFiltro || s.categoria === categoriaFiltro);
  const pacotesVisiveis = pacotes.filter(
    (p) => !categoriaFiltro || p.servicos.some((ps) => ps.servico.categoria === categoriaFiltro),
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {mostrarSelecao ? (
          <>
            {categoriasDoCatalogo.length > 1 && (
              <CategoriaChips valor={categoriaFiltro} onChange={setCategoriaFiltro} categorias={categoriasDoCatalogo} comTodos />
            )}

            {CATEGORIAS_SERVICO.filter((c) => servicosVisiveis.some((s) => s.categoria === c.valor)).map((categoria) => (
              <View key={categoria.valor} style={{ gap: spacing.sm }}>
                <Text style={styles.sectionTitle}>
                  {categoria.rotulo}
                </Text>
                {servicosVisiveis
                  .filter((s) => s.categoria === categoria.valor)
                  .map((s) => {
                    const quantidade = quantidades[s.id] ?? 0;
                    return (
                      <Card key={s.id} style={styles.servicoLinha}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemNome}>{s.nome}</Text>
                          <Text style={styles.itemMeta}>
                            {centavosParaReais(s.precoCentavos)}
                          </Text>
                          {s.descricao ? <Text style={styles.itemMeta}>{s.descricao}</Text> : null}
                        </View>
                        <View style={styles.stepper}>
                          <Pressable onPress={() => alterarQuantidade(s.id, -1)} disabled={quantidade === 0} hitSlop={8}>
                            <Ionicons name="remove-circle" size={26} color={quantidade === 0 ? colors.border : colors.accent} />
                          </Pressable>
                          <Text style={styles.stepperValor}>{quantidade}</Text>
                          <Pressable onPress={() => alterarQuantidade(s.id, 1)} hitSlop={8}>
                            <Ionicons name="add-circle" size={26} color={colors.accent} />
                          </Pressable>
                        </View>
                      </Card>
                    );
                  })}
              </View>
            ))}

            {pacotesVisiveis.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Combos</Text>
                <View style={{ gap: spacing.sm }}>
                  {pacotesVisiveis.map((p) => {
                    const quantidade = quantidadesPacotes[p.id] ?? 0;
                    const areas = Array.from(new Set(p.servicos.map((ps) => ps.servico.categoria)));
                    return (
                      <Card key={p.id} style={styles.servicoLinha}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemNome}>
                            {p.nome}
                          </Text>
                          <Text style={styles.itemMeta}>
                            {centavosParaReais(p.precoCentavos)}
                          </Text>
                          {p.descricao && <Text style={styles.itemMeta}>{p.descricao}</Text>}
                        </View>
                        <View style={styles.stepper}>
                          <Pressable onPress={() => alterarQuantidadePacote(p.id, -1)} disabled={quantidade === 0} hitSlop={8}>
                            <Ionicons name="remove-circle" size={26} color={quantidade === 0 ? colors.border : colors.accent} />
                          </Pressable>
                          <Text style={styles.stepperValor}>{quantidade}</Text>
                          <Pressable onPress={() => alterarQuantidadePacote(p.id, 1)} hitSlop={8}>
                            <Ionicons name="add-circle" size={26} color={colors.accent} />
                          </Pressable>
                        </View>
                      </Card>
                    );
                  })}
                </View>
              </>
            )}
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Itens selecionados</Text>
            <View style={{ gap: spacing.sm }}>
              {itensSelecionados.map((item) => (
                <Card key={`${item.tipo}-${item.id}`} style={styles.servicoLinha}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemNome}>
                      {item.quantidade}x {item.nome}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {centavosParaReais(item.precoCentavos)}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
            <Pressable onPress={() => setMostrarSelecao(true)} hitSlop={8}>
              <Text style={styles.linkAlterar}>Alterar itens</Text>
            </Pressable>
          </>
        )}

        {totalItens > 0 && (
          <Card style={styles.resumoCard}>
            <Text style={styles.resumoTexto}>
              {totalItens} {totalItens === 1 ? "item" : "itens"} selecionado{totalItens === 1 ? "" : "s"}
            </Text>
            <Text style={styles.resumoValor}>{centavosParaReais(precoTotalCentavos)}</Text>
          </Card>
        )}

        {categoriasDoAtendimento.map((categoria) => {
          const info = CATEGORIAS_SERVICO.find((c) => c.valor === categoria)!;
          const doTime = funcionarios.filter((f) => atendeCategoria(f.especialidades, categoria));
          const escolhida = profissionaisPorCategoria[categoria];
          return (
            <View key={categoria} style={{ gap: spacing.sm }}>
              <Text style={styles.sectionTitle}>
                {info.perguntaProfissional}
              </Text>
              {doTime.length === 0 ? (
                <Text style={styles.hint}>
                  Este salão ainda não tem profissional de {info.rotulo.toLowerCase()} cadastrada — escolha outro serviço
                  ou fale com o salão.
                </Text>
              ) : (
                <View style={styles.horariosGrid}>
                  <Pressable onPress={() => escolherProfissional(categoria, undefined)}>
                    <View style={[styles.horarioChip, escolhida === undefined && styles.horarioChipSelecionado]}>
                      <Text style={[styles.horarioTexto, escolhida === undefined && styles.horarioTextoSelecionado]}>
                        Qualquer profissional
                      </Text>
                    </View>
                  </Pressable>
                  {doTime.map((f) => {
                    const selecionado = escolhida === f.id;
                    return (
                      <Pressable key={f.id} onPress={() => escolherProfissional(categoria, f.id)}>
                        <View style={[styles.horarioChip, styles.funcionarioChip, selecionado && styles.horarioChipSelecionado]}>
                          {f.fotoUrl ? (
                            <Image source={{ uri: f.fotoUrl }} style={styles.funcionarioFoto} />
                          ) : (
                            <View style={styles.funcionarioFotoPlaceholder}>
                              <Ionicons name="person" size={14} color={colors.inkMuted} />
                            </View>
                          )}
                          <Text style={[styles.horarioTexto, selecionado && styles.horarioTextoSelecionado]}>
                            {f.usuario.nome}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        {totalItens > 0 && (
          <>
            <Text style={styles.sectionTitle}>Escolha o dia</Text>
            <View style={styles.calendarioWrapper}>
              <Calendar
                current={HOJE_ISO}
                minDate={HOJE_ISO}
                maxDate={formatarDataLocal(new Date(HOJE.getTime() + LIMITE_DIAS_FUTUROS * 86_400_000))}
                onMonthChange={(m: { year: number; month: number }) => setMesVisivel({ ano: m.year, mes: m.month })}
                onDayPress={(d: { dateString: string }) => diasDisponiveis.includes(d.dateString) && setDiaSelecionado(d.dateString)}
                markedDates={markedDates}
                disableAllTouchEventsForDisabledDays
                theme={calendarTheme}
              />
            </View>
            {carregandoDias && <Text style={styles.hint}>Verificando dias disponíveis…</Text>}
            {!carregandoDias && diasDisponiveis.length === 0 && (
              <Text style={styles.hint}>
                Nenhum dia disponível nesse mês para essa combinação de serviços e profissionais. Tente "Qualquer
                profissional" ou outro mês.
              </Text>
            )}
          </>
        )}

        {diaSelecionado && (
          <>
            <Text style={styles.sectionTitle}>Horários disponíveis</Text>
            {carregandoHorarios ? (
              <Text style={styles.hint}>Carregando horários…</Text>
            ) : horarios.length === 0 ? (
              <Text style={styles.hint}>Nenhum horário livre nesse dia. Escolha outro dia.</Text>
            ) : (
              <View style={styles.horariosGrid}>
                {horarios.map((h) => {
                  const selecionado = h === horarioSelecionado;
                  return (
                    <Pressable key={h} onPress={() => setHorarioSelecionado(h)}>
                      <View style={[styles.horarioChip, selecionado && styles.horarioChipSelecionado]}>
                        <Text style={[styles.horarioTexto, selecionado && styles.horarioTextoSelecionado]}>{h}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {dataHoraSelecionada && (
          <>
            <Text style={styles.sectionTitle}>Confirmar</Text>
            <Card style={{ gap: spacing.sm }}>
              <Text style={styles.confirmData}>
                {new Date(dataHoraSelecionada).toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}
              </Text>
              <View style={{ gap: spacing.sm }}>
                {etapas.map((etapa, indice) => {
                  const quem = nomeDaProfissional(etapa.categoria);
                  return (
                    <View key={`${etapa.nome}-${indice}`} style={styles.etapaLinha}>
                      <Text style={styles.etapaHora}>{horariosDasEtapas[indice]?.inicio}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.confirmServico}>
                          {etapa.nome}
                        </Text>
                        <Text style={styles.itemMeta}>
                          {quem ? `com ${quem}` : "profissional disponível na hora"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={styles.divisor} />
              <View style={{ gap: 4 }}>
                {itensSelecionados.map((item) => (
                  <View key={`${item.tipo}-${item.id}`} style={styles.confirmLinha}>
                    <Text style={styles.confirmServico}>
                      {item.quantidade}x {item.nome}
                    </Text>
                    <Text style={styles.confirmServico}>{centavosParaReais(item.precoCentavos * item.quantidade)}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.divisor} />
              <View style={styles.confirmLinha}>
                <Text style={styles.confirmTotalLabel}>
                  Total
                </Text>
                <Text style={styles.confirmTotalValor}>{centavosParaReais(precoTotalCentavos)}</Text>
              </View>
            </Card>

            <Text style={styles.sectionTitle}>Forma de pagamento</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {(
                [
                  { valor: MetodoPagamento.PIX as FormaPagamento, label: "Pix" },
                  { valor: MetodoPagamento.CARTAO as FormaPagamento, label: "Cartão" },
                  { valor: MetodoPagamento.DINHEIRO as FormaPagamento, label: "Dinheiro" },
                  ...(assinaturaElegivel ? [{ valor: "PACOTE" as FormaPagamento, label: "Pacote mensal" }] : []),
                ]
              ).map((opcao) => {
                const selecionado = formaPagamento === opcao.valor;
                return (
                  <Pressable key={opcao.valor} onPress={() => setFormaPagamento(opcao.valor)} style={{ flex: 1 }}>
                    <View style={[styles.horarioChip, styles.metodoChip, selecionado && styles.horarioChipSelecionado]}>
                      <Text style={[styles.horarioTexto, selecionado && styles.horarioTextoSelecionado]}>{opcao.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {formaPagamento === "PACOTE" && assinaturaElegivel && (
              <Text style={styles.hint}>
                Usa {totalItens} de {assinaturaElegivel.pacoteMensal!.vezesPorSemana - (assinaturaElegivel.usosNaSemana ?? 0)} usos
                restantes essa semana no seu pacote — sem cobrança avulsa.
              </Text>
            )}
            {formaPagamento === MetodoPagamento.DINHEIRO && (
              <Text style={styles.hint}>
                Seu horário já fica reservado. Pague em dinheiro direto no salão, na hora do atendimento.
              </Text>
            )}

            <Button
              label={
                formaPagamento === "PACOTE" || formaPagamento === MetodoPagamento.DINHEIRO
                  ? "Confirmar agendamento"
                  : formaPagamento === MetodoPagamento.CARTAO
                    ? "Continuar para pagamento"
                    : "Confirmar e pagar"
              }
              onPress={confirmar}
              loading={enviando}
            />
          </>
        )}
      </ScrollView>
      <AvisoAgendamentoModal
        visivel={avisosModal !== null}
        avisos={avisosModal ?? []}
        onConcordar={() => {
          setAvisosModal(null);
          void executarConfirmacao();
        }}
      />
    </SafeAreaView>
  );
}

const calendarTheme = {
  backgroundColor: colors.background,
  calendarBackground: colors.surface,
  textSectionTitleColor: colors.inkMuted,
  selectedDayBackgroundColor: colors.accent,
  selectedDayTextColor: colors.accentInk,
  todayTextColor: colors.accent,
  dayTextColor: colors.ink,
  textDisabledColor: colors.border,
  dotColor: colors.accent,
  selectedDotColor: colors.accentInk,
  arrowColor: colors.accent,
  monthTextColor: colors.ink,
  indicatorColor: colors.accent,
  textDayFontWeight: "600" as const,
  textMonthFontWeight: "800" as const,
  textDayHeaderFontWeight: "700" as const,
};

function formatarDataLocal(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function diasDoMes(ano: number, mes: number): string[] {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dias: string[] = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    dias.push(`${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
  }
  return dias;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.inkMuted,
    textTransform: "uppercase",
    marginTop: spacing.md,
  },
  hint: { fontSize: 12, color: colors.inkMuted },
  linkAlterar: { fontSize: 13, fontWeight: "700", color: colors.accent, marginTop: -spacing.xs },
  servicoLinha: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemNome: { fontSize: 14, fontWeight: "700", color: colors.ink },
  itemMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepperValor: { fontSize: 15, fontWeight: "800", color: colors.ink, minWidth: 16, textAlign: "center" },
  resumoCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  resumoTexto: { fontSize: 13, fontWeight: "700", color: colors.accent, flex: 1, paddingRight: spacing.sm },
  resumoValor: { fontSize: 16, fontWeight: "800", color: colors.accent },
  calendarioWrapper: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  horariosGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  horarioChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  horarioChipSelecionado: { backgroundColor: colors.accent, borderColor: colors.accent },
  funcionarioChip: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  funcionarioFoto: { width: 22, height: 22, borderRadius: radius.pill },
  funcionarioFotoPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  horarioTexto: { fontSize: 13, fontWeight: "700", color: colors.ink },
  horarioTextoSelecionado: { color: colors.accentInk },
  metodoChip: { alignItems: "center" },
  confirmLinha: { flexDirection: "row", justifyContent: "space-between" },
  confirmServico: { fontSize: 13, color: colors.ink, fontWeight: "600" },
  divisor: { height: 1, backgroundColor: colors.border },
  confirmData: { fontSize: 13, fontWeight: "700", color: colors.accent, textTransform: "capitalize" },
  etapaLinha: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  etapaHora: { fontSize: 13, fontWeight: "800", color: colors.accent, minWidth: 44 },
  confirmTotalLabel: { fontSize: 14, fontWeight: "800", color: colors.ink },
  confirmTotalValor: { fontSize: 16, fontWeight: "800", color: colors.accent },
});
