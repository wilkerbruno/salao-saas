import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Avaliacao, CATEGORIAS_SERVICO, SalaoPublica, Pacote, PacoteMensal, Servico } from "@salao-saas/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { StarRating } from "../../components/StarRating";
import { alertar } from "../../utils/alertaCompat";
import { colors, radius, spacing } from "../../theme/tokens";
import { abrirNoMapa } from "../../utils/maps";
import { HomeStackParamList } from "../../navigation/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "SalaoDetail">;
type AvaliacaoComCliente = Avaliacao & { cliente: { id: string; nome: string } };

// Detalhe de um salão escolhido na Home: serviços/pacotes pra agendar
// (mesmo padrão de seleção que existia na Home antiga) e, abaixo, as
// avaliações — o formulário pra deixar a própria avaliação só aparece depois
// que o cliente já teve um atendimento concluído aqui (ver "podeAvaliar",
// calculado no back-end a partir do horário do agendamento).
export function SalaoDetailScreen({ route, navigation }: Props) {
  const { salaoId, nome } = route.params;

  const [salao, setSalao] = useState<SalaoPublica | null>(null);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [pacotesMensais, setPacotesMensais] = useState<PacoteMensal[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoComCliente[]>([]);
  const [podeAvaliar, setPodeAvaliar] = useState(false);
  const [minhaNota, setMinhaNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviandoAvaliacao, setEnviandoAvaliacao] = useState(false);

  // Serviços/pacotes marcados aqui — ao tocar em "Agendar", eles vão prontos
  // pra tela seguinte, que pula direto pra escolha de dia/horário.
  const [servicosSelecionados, setServicosSelecionados] = useState<Set<string>>(new Set());
  const [pacotesSelecionados, setPacotesSelecionados] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [infoRes, servicosRes, pacotesRes, pacotesMensaisRes, avaliacoesRes, minhaRes] = await Promise.all([
        api.get<SalaoPublica>(`/saloes/${salaoId}/publico`),
        api.get<Servico[]>(`/saloes/${salaoId}/servicos`),
        api.get<Pacote[]>(`/saloes/${salaoId}/pacotes`),
        api.get<PacoteMensal[]>(`/saloes/${salaoId}/pacotes-mensais`),
        api.get<AvaliacaoComCliente[]>(`/saloes/${salaoId}/avaliacoes`),
        api.get(`/saloes/${salaoId}/avaliacoes/minha`).catch(() => ({ data: { avaliacao: null, podeAvaliar: false } })),
      ]);
      setSalao(infoRes.data);
      setServicos(servicosRes.data);
      setPacotes(pacotesRes.data);
      setPacotesMensais(pacotesMensaisRes.data);
      setAvaliacoes(avaliacoesRes.data);
      setPodeAvaliar(!!minhaRes.data?.podeAvaliar);
      if (minhaRes.data?.avaliacao) {
        setMinhaNota(minhaRes.data.avaliacao.nota);
        setComentario(minhaRes.data.avaliacao.comentario ?? "");
      }
    } finally {
      setCarregando(false);
    }
  }, [salaoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function alternarServico(id: string) {
    setServicosSelecionados((atual) => {
      const novo = new Set(atual);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  }

  function alternarPacote(id: string) {
    setPacotesSelecionados((atual) => {
      const novo = new Set(atual);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  }

  const totalSelecionado = servicosSelecionados.size + pacotesSelecionados.size;

  function agendar() {
    if (totalSelecionado === 0) {
      navigation.navigate("Agendar", { salaoId, nome });
      return;
    }
    const itensPreSelecionados = [
      ...Array.from(servicosSelecionados).map((servicoId) => ({ servicoId })),
      ...Array.from(pacotesSelecionados).map((pacoteId) => ({ pacoteId })),
    ];
    navigation.navigate("Agendar", { salaoId, nome, itensPreSelecionados });
  }

  // Abre a tela de assinatura dentro do próprio app (Pix ou Cartão, com
  // opção de renovação automática no cartão — ver AssinarPacoteScreen) em
  // vez de redirecionar pro site do Mercado Pago como antes.
  function assinarPacoteMensal(pacote: PacoteMensal) {
    navigation.navigate("AssinarPacote", {
      salaoId,
      pacoteMensalId: pacote.id,
      pacoteNome: pacote.nome,
      precoCentavos: pacote.precoCentavos,
    });
  }

  async function enviarAvaliacao() {
    if (minhaNota === 0) return;
    setEnviandoAvaliacao(true);
    try {
      await api.post(`/saloes/${salaoId}/avaliacoes`, {
        nota: minhaNota,
        comentario: comentario || undefined,
      });
      await carregar();
    } finally {
      setEnviandoAvaliacao(false);
    }
  }

  if (carregando || !salao) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <FlatList
        data={avaliacoes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing.xl }}>
            <View style={{ gap: spacing.xs }}>
              {salao.endereco && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
                  <Text style={[styles.endereco, { flex: 1 }]}>{salao.endereco}</Text>
                  {salao.latitude != null && salao.longitude != null && (
                    <Pressable style={styles.comoChegar} onPress={() => abrirNoMapa(salao)}>
                      <Ionicons name="navigate" size={14} color={colors.accent} />
                      <Text style={styles.comoChegarTexto}>Como chegar</Text>
                    </Pressable>
                  )}
                </View>
              )}
              <StarRating value={salao.notaMedia} totalAvaliacoes={salao.totalAvaliacoes} size={14} />
            </View>

            <Text style={styles.dica}>Toque em um serviço ou pacote pra marcar ou desmarcar — o botão de agendar fica no final da tela.</Text>

            {CATEGORIAS_SERVICO.filter((c) => servicos.some((s) => s.categoria === c.valor)).map((categoria) => (
            <View key={categoria.valor} style={{ gap: spacing.sm }}>
              <Text style={styles.sectionTitle}>
                {categoria.rotulo}
              </Text>
              {servicos.filter((s) => s.categoria === categoria.valor).map((item) => {
                const selecionado = servicosSelecionados.has(item.id);
                return (
                  <Pressable key={item.id} onPress={() => alternarServico(item.id)}>
                    <Card
                      style={[
                        { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
                        selecionado && styles.cardSelecionado,
                      ]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
                        <Ionicons
                          name={selecionado ? "checkmark-circle" : "ellipse-outline"}
                          size={22}
                          color={selecionado ? colors.accent : colors.border}
                        />
                        <View>
                          <Text style={styles.itemName}>{item.nome}</Text>
                          <Text style={styles.itemMeta}>{item.duracaoMinutos} min</Text>
                        </View>
                      </View>
                      <PriceTag centavos={item.precoCentavos} />
                    </Card>
                  </Pressable>
                );
              })}
            </View>
            ))}

            {pacotes.length > 0 && (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.sectionTitle}>Combos (mais de uma área no mesmo horário)</Text>
                {pacotes.map((pacote) => {
                  const selecionado = pacotesSelecionados.has(pacote.id);
                  return (
                    <Pressable key={pacote.id} onPress={() => alternarPacote(pacote.id)}>
                      <Card style={selecionado && styles.cardSelecionado}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
                            <Ionicons
                              name={selecionado ? "checkmark-circle" : "ellipse-outline"}
                              size={22}
                              color={selecionado ? colors.accent : colors.border}
                            />
                            <Text style={styles.itemName}>
                              {pacote.nome}
                            </Text>
                          </View>
                          <PriceTag centavos={pacote.precoCentavos} />
                        </View>
                        {pacote.descricao && <Text style={[styles.itemMeta, { marginLeft: 30 }]}>{pacote.descricao}</Text>}
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {pacotesMensais.length > 0 && (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.sectionTitle}>Pacotes mensais</Text>
                <Text style={styles.dica}>Assine e use os serviços incluídos várias vezes por mês, sem pagar por agendamento.</Text>
                {pacotesMensais.map((pacote) => (
                  <Card key={pacote.id} style={{ gap: spacing.xs }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Text style={styles.itemName}>{pacote.nome}</Text>
                      <PriceTag centavos={pacote.precoCentavos} />
                    </View>
                    <Text style={styles.itemMeta}>
                      Até {pacote.vezesPorSemana}x por semana · {pacote.servicos.map((ps) => ps.servico.nome).join(", ")}
                    </Text>
                    {pacote.descricao && <Text style={styles.itemMeta}>{pacote.descricao}</Text>}
                    <Button label="Assinar" variant="secondary" onPress={() => assinarPacoteMensal(pacote)} />
                  </Card>
                ))}
              </View>
            )}

            {podeAvaliar && (
              <Card style={{ gap: spacing.sm }}>
                <Text style={styles.sectionTitle}>Sua avaliação</Text>
                <StarRating value={minhaNota} onChange={setMinhaNota} size={30} />
                <TextInput
                  value={comentario}
                  onChangeText={setComentario}
                  placeholder="Conte como foi seu atendimento (opcional)"
                  placeholderTextColor={colors.inkMuted}
                  style={styles.input}
                  multiline
                />
                <Button label="Enviar avaliação" onPress={enviarAvaliacao} loading={enviandoAvaliacao} disabled={minhaNota === 0} />
              </Card>
            )}

            <Text style={styles.sectionTitle}>Avaliações de clientes</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.mensagem}>Ainda não há avaliações desse salão.</Text>}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm, gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.itemName}>{item.cliente.nome}</Text>
              <StarRating value={item.nota} size={12} />
            </View>
            {item.comentario && <Text style={styles.itemMeta}>{item.comentario}</Text>}
          </Card>
        )}
        // O botão de agendar fica como ÚLTIMA opção da tela — depois de
        // serviços, pacotes, pacotes mensais e das avaliações — em vez de logo
        // no topo, pra o cliente ver tudo que o salão oferece antes de
        // decidir agendar (a seleção de serviços/pacotes já feita lá em cima
        // continua valendo, só o botão que desceu pro final).
        ListFooterComponent={
          <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
            <Button
              label={totalSelecionado > 0 ? `Ver horários (${totalSelecionado} selecionado${totalSelecionado === 1 ? "" : "s"})` : "Agendar horário"}
              onPress={agendar}
            />
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.xl },
  endereco: { fontSize: 13, color: colors.inkMuted },
  comoChegar: { flexDirection: "row", alignItems: "center", gap: 4 },
  comoChegarTexto: { fontSize: 12, fontWeight: "700", color: colors.accent },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: colors.ink },
  mensagem: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.md },
  itemName: { fontSize: 14, fontWeight: "700", color: colors.ink },
  itemMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  cardSelecionado: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.accentSoft },
  dica: { fontSize: 12, color: colors.inkMuted, marginTop: -spacing.sm, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: colors.ink,
    minHeight: 60,
    textAlignVertical: "top",
  },
});
