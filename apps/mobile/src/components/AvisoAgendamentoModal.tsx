import React, { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { Card } from "./Card";
import { colors, spacing } from "../theme/tokens";

export interface AvisoItem {
  titulo?: string;
  texto: string;
}

const SEGUNDOS = 60;

// Aviso do salão exibido antes de confirmar o agendamento. Só dá pra fechar
// (e seguir com o agendamento) depois de 60 segundos de leitura.
export function AvisoAgendamentoModal({ visivel, avisos, onConcordar }: { visivel: boolean; avisos: AvisoItem[]; onConcordar: () => void }) {
  const [restante, setRestante] = useState(SEGUNDOS);

  useEffect(() => {
    if (!visivel) return;
    setRestante(SEGUNDOS);
    const id = setInterval(() => setRestante((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [visivel]);

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.fundo}>
        <Card style={styles.card}>
          <Text style={styles.titulo}>Avisos do salão</Text>
          <Text style={styles.sub}>Leia com atenção antes de confirmar o agendamento.</Text>
          <ScrollView style={styles.lista}>
            {avisos.map((a, i) => (
              <View key={i} style={styles.item}>
                {a.titulo ? <Text style={styles.itemTitulo}>{a.titulo}</Text> : null}
                <Text style={styles.texto}>{a.texto}</Text>
              </View>
            ))}
          </ScrollView>
          <Button
            label={restante > 0 ? `Aguarde ${restante}s para continuar` : "Li e concordo"}
            onPress={onConcordar}
            disabled={restante > 0}
          />
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: spacing.lg },
  card: { maxHeight: "85%" },
  titulo: { fontSize: 18, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  sub: { color: colors.inkMuted, marginBottom: spacing.md },
  lista: { marginBottom: spacing.md },
  item: { marginBottom: spacing.md },
  itemTitulo: { fontWeight: "700", color: colors.ink, marginBottom: 2 },
  texto: { color: colors.ink, lineHeight: 20 },
});
