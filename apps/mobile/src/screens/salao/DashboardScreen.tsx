import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Card } from "../../components/Card";
import { PriceTag } from "../../components/PriceTag";
import { colors, spacing } from "../../theme/tokens";

interface ResumoSalao {
  atendimentos: number;
  faturamentoCentavos: number;
  comissoesCentavos: number;
  lucroCentavos: number;
  porFuncionario: Array<{ nome: string; atendimentos: number; faturamentoCentavos: number; comissaoCentavos: number }>;
}

export function SalaoDashboardScreen() {
  const salaoId = useAuthStore((s) => s.usuario?.salaoId);
  const [resumo, setResumo] = useState<ResumoSalao | null>(null);
  // Era um texto fixo ("Salão Alameda", deixado de um teste/mock) — mostrava
  // sempre o mesmo nome aqui independente de qual conta/salao estivesse
  // logada (inclusive depois do salão de teste já ter sido excluída). Os
  // números abaixo (faturamento, agendamentos etc.) sempre vieram certos da
  // salão logada de verdade — só esse título nunca tinha sido ligado ao
  // dado real.
  const [nomeSalao, setNomeSalao] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await api.get<ResumoSalao>("/financeiro/resumo-salao", { params: { periodo: "hoje" } });
    setResumo(data);
  }, []);

  const carregarSalao = useCallback(async () => {
    if (!salaoId) return;
    try {
      const { data } = await api.get<{ nome: string }>(`/saloes/${salaoId}`);
      setNomeSalao(data.nome);
    } catch {
      // Sem bloquear a tela por causa disso — o resto do painel continua útil.
    }
  }, [salaoId]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useFocusEffect(useCallback(() => { carregarSalao(); }, [carregarSalao]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Painel do dono</Text>
        <Text style={styles.title}>{nomeSalao ?? "Meu salão"}</Text>

        {resumo && (
          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            <Card>
              <Text style={styles.label}>Faturamento hoje</Text>
              <PriceTag centavos={resumo.faturamentoCentavos} size={24} />
            </Card>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Card style={{ flex: 1 }}>
                <Text style={styles.label}>Agendamentos</Text>
                <Text style={styles.count}>{resumo.atendimentos}</Text>
              </Card>
              <Card style={{ flex: 1 }}>
                <Text style={styles.label}>Lucro líquido</Text>
                <PriceTag centavos={resumo.lucroCentavos} size={18} />
              </Card>
            </View>

            <Text style={styles.sectionTitle}>Por funcionário</Text>
            {resumo.porFuncionario.map((f) => (
              <Card key={f.nome} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ fontWeight: "700", color: colors.ink }}>{f.nome}</Text>
                  <Text style={{ fontSize: 12, color: colors.inkMuted }}>{f.atendimentos} atendimentos</Text>
                </View>
                <PriceTag centavos={f.faturamentoCentavos} />
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  subtitle: { fontSize: 12, color: colors.inkMuted },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, textTransform: "uppercase", marginTop: spacing.md },
  label: { fontSize: 12, color: colors.inkMuted, marginBottom: 4 },
  count: { fontSize: 20, fontWeight: "800", color: colors.ink },
});
