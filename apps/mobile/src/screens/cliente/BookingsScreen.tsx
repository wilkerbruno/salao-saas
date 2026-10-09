import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Agendamento, centavosParaReais, StatusAgendamento } from "@salao-saas/shared";
import { api } from "../../api/client";
import { Card } from "../../components/Card";
import { StatusBadge } from "../../components/StatusBadge";
import { colors, spacing } from "../../theme/tokens";
import { abrirNoMapa } from "../../utils/maps";
import { ligarPara } from "../../utils/telefone";
import { alertar } from "../../utils/alertaCompat";

// Vários serviços marcados juntos (mesmo grupoId — ver BookingScreen) aparecem
// como um card só, com cada serviço listado e o valor total somado.
function agruparPorVisita(agendamentos: Agendamento[]): Agendamento[][] {
  const porChave = new Map<string, Agendamento[]>();
  for (const item of agendamentos) {
    const chave = item.grupoId ?? item.id;
    porChave.set(chave, [...(porChave.get(chave) ?? []), item]);
  }
  return Array.from(porChave.values())
    .map((itens) => itens.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()))
    .sort((a, b) => new Date(b[0].inicio).getTime() - new Date(a[0].inicio).getTime());
}

export function BookingsScreen() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  const visitas = useMemo(() => agruparPorVisita(agendamentos), [agendamentos]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get<Agendamento[]>("/agendamentos/meus");
      setAgendamentos(data);
    } finally {
      setCarregando(false);
    }
  }, []);

  // Recarrega toda vez que a tela ganha foco (ex: voltando de um novo agendamento).
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function cancelar(id: string) {
    alertar("Cancelar agendamento?", "Essa ação não pode ser desfeita.", [
      { text: "Voltar", style: "cancel" },
      {
        text: "Cancelar agendamento",
        style: "destructive",
        onPress: async () => {
          await api.patch(`/agendamentos/${id}/cancelar`);
          carregar();
        },
      },
    ]);
  }

  async function confirmarPresenca(grupoId: string) {
    try {
      await api.patch(`/agendamentos/grupo/${grupoId}/confirmar-presenca`);
      alertar("Presença confirmada!", "O salão foi avisado que você vai comparecer.");
      carregar();
    } catch (e: any) {
      alertar("Não foi possível confirmar", e?.response?.data?.message ?? "Tente novamente.");
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Meus agendamentos</Text>
      <FlatList
        data={visitas}
        keyExtractor={(visita) => visita[0].id}
        contentContainerStyle={styles.list}
        refreshing={carregando}
        onRefresh={carregar}
        ListEmptyComponent={!carregando ? <Text style={styles.empty}>Você ainda não tem agendamentos.</Text> : null}
        renderItem={({ item: visita }) => {
          const total = visita.reduce((soma, item) => soma + item.precoCentavos, 0);
          const status = visita[0].status;
          const salao = visita[0].salao;
          const temLocalizacao = salao?.latitude != null && salao?.longitude != null;
          return (
            <Card style={{ marginBottom: spacing.sm, gap: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.itemTitle}>{new Date(visita[0].inicio).toLocaleString("pt-BR")}</Text>
                <StatusBadge status={status} />
              </View>
              {salao && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
                  <Text style={styles.salaoNome}>{salao.nome}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    {salao.telefone && (
                      <Pressable style={styles.comoChegar} onPress={() => ligarPara(salao.telefone)}>
                        <Ionicons name="call" size={13} color={colors.accent} />
                        <Text style={styles.comoChegarTexto}>Ligar</Text>
                      </Pressable>
                    )}
                    {temLocalizacao && (
                      <Pressable style={styles.comoChegar} onPress={() => abrirNoMapa(salao)}>
                        <Ionicons name="navigate" size={13} color={colors.accent} />
                        <Text style={styles.comoChegarTexto}>Como chegar</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
              <View style={{ gap: 2 }}>
                {visita.map((item) => (
                  <Text key={item.id} style={styles.itemServico}>
                    {item.servico?.nome ?? item.pacote?.nome ?? "Serviço"}
                    {item.funcionario?.usuario?.nome ? ` · com ${item.funcionario.usuario.nome}` : ""}
                  </Text>
                ))}
              </View>
              {(() => {
                const futuro = new Date(visita[0].inicio).getTime() > Date.now();
                const ativo = status === StatusAgendamento.PENDENTE || status === StatusAgendamento.CONFIRMADO;
                if (!futuro || !ativo) return null;
                if (visita[0].confirmadoPeloClienteEm) {
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      <Text style={{ color: colors.success, fontWeight: "700", fontSize: 13 }}>Presença confirmada</Text>
                    </View>
                  );
                }
                const grupoId = visita[0].grupoId;
                const em24h = new Date(visita[0].inicio).getTime() - Date.now() <= 24 * 3600 * 1000;
                if (!grupoId || !(visita[0].lembrete24hEnviadoEm || em24h)) return null;
                return (
                  <Pressable style={styles.confirmarBtn} onPress={() => confirmarPresenca(grupoId)}>
                    <Text style={styles.confirmarTexto}>Confirmar presença</Text>
                  </Pressable>
                );
              })()}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.itemTotal}>
                  {visita[0].assinaturaPacoteId ? "Incluído no pacote mensal" : centavosParaReais(total)}
                </Text>
                {(status === StatusAgendamento.PENDENTE || status === StatusAgendamento.CONFIRMADO) && (
                  <Text style={styles.cancelar} onPress={() => cancelar(visita[0].id)}>
                    Cancelar
                  </Text>
                )}
              </View>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  list: { padding: spacing.xl },
  empty: { color: colors.inkMuted, fontSize: 13, textAlign: "center", marginTop: spacing.xxl },
  itemTitle: { fontWeight: "700", color: colors.ink, textTransform: "capitalize" },
  salaoNome: { fontSize: 12, fontWeight: "700", color: colors.inkMuted, flex: 1 },
  comoChegar: { flexDirection: "row", alignItems: "center", gap: 4 },
  comoChegarTexto: { fontSize: 12, fontWeight: "700", color: colors.accent },
  itemServico: { fontSize: 13, color: colors.inkMuted },
  itemTotal: { fontWeight: "800", color: colors.ink, fontSize: 15 },
  confirmarBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  confirmarTexto: { color: colors.accentInk, fontWeight: "800", fontSize: 14 },
  cancelar: { color: colors.danger, fontWeight: "700", fontSize: 13 },
});
