import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, spacing } from "../../theme/tokens";
import { obterVersaoInstalada, obterVersaoRemota, verificarEAtualizarApk, VersaoRemota } from "../../utils/atualizacaoApk";

// "Sobre": mostra a versão instalada e a disponível no site (versao.json) e
// permite buscar atualização na hora — baixa o APK novo e abre o instalador.
export function SobreScreen() {
  const instalada = obterVersaoInstalada();
  const [remota, setRemota] = useState<VersaoRemota | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    obterVersaoRemota().then(setRemota).catch(() => setRemota(null));
  }, []);

  async function verificar() {
    setVerificando(true);
    setMensagem(null);
    setProgresso(null);
    try {
      try {
        setRemota(await obterVersaoRemota());
      } catch {
        // o erro de conexão é tratado abaixo, por verificarEAtualizarApk
      }
      const r = await verificarEAtualizarApk((f) => setProgresso(f));
      if (r.status === "nao-aplicavel") setMensagem("A atualização pelo app só está disponível no Android.");
      else if (r.status === "sem-novidade") setMensagem("Você já está com a versão mais recente.");
      else if (r.status === "instalando") setMensagem("Download concluído. Toque em Instalar na tela do Android para concluir.");
      else if (r.status === "erro") setMensagem(`Não foi possível verificar a atualização (${r.motivo}). Tente novamente.`);
    } finally {
      setVerificando(false);
      setProgresso(null);
    }
  }

  const haNova = !!remota && remota.versionCode > instalada.versionCode;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.content}>
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.titulo}>Eleva One</Text>
          <Linha rotulo="Versão instalada (versionName)" valor={instalada.versionName} />
          <Linha rotulo="Código da versão (versionCode)" valor={String(instalada.versionCode)} />
        </Card>
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.titulo}>Disponível para download</Text>
          {remota ? (
            <>
              <Linha rotulo="versionName" valor={remota.versionName ?? "-"} />
              <Linha rotulo="versionCode" valor={String(remota.versionCode)} />
              <Text style={[styles.status, haNova && { color: colors.accent }]}>
                {haNova ? "Há uma versão mais nova disponível." : "Você está na versão mais recente."}
              </Text>
            </>
          ) : (
            <Text style={styles.rotulo}>Toque em "Verificar atualização" para consultar.</Text>
          )}
        </Card>
        {Platform.OS === "android" && (
          <Button label={verificando ? "Verificando..." : "Verificar atualização"} onPress={verificar} loading={verificando} />
        )}
        {progresso !== null && (
          <Text style={styles.rotulo}>Baixando atualização... {Math.round(progresso * 100)}%</Text>
        )}
        {verificando && progresso === null && <ActivityIndicator color={colors.accent} />}
        {mensagem && <Text style={styles.status}>{mensagem}</Text>}
      </View>
    </SafeAreaView>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <Text style={styles.valor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  titulo: { fontSize: 16, fontWeight: "800", color: colors.ink },
  linha: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  rotulo: { fontSize: 13, color: colors.inkMuted, flexShrink: 1 },
  valor: { fontSize: 13, fontWeight: "700", color: colors.ink },
  status: { fontSize: 13, fontWeight: "600", color: colors.ink },
});
