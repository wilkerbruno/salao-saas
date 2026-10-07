import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../../theme/tokens";

// Página de pouso do popup de OAuth do Mercado Pago na versão Web (ver
// ConectarMercadoPagoScreen/conectarPelaWeb e
// SaloesMercadoPagoService.processarCallback, que é quem manda o popup
// pra cá no final: "<origemWeb>/mercadopago-conectado?sucesso=0|1"). Só
// existe pra avisar a aba principal (window.opener) do resultado via
// postMessage e se fechar sozinha — nunca deveria aparecer pra ninguém por
// mais que um instante. Ver App.tsx, que intercepta essa rota ANTES de
// montar a navegação normal do app.
export function MercadoPagoConectadoWebScreen() {
  useEffect(() => {
    const sucesso = new URLSearchParams(window.location.search).get("sucesso") === "1";
    if (window.opener) {
      window.opener.postMessage({ tipo: "mercadopago-conectado", sucesso }, window.location.origin);
    }
    const temporizador = setTimeout(() => window.close(), 400);
    return () => clearTimeout(temporizador);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.texto}>Conectando sua conta Mercado Pago…</Text>
      <Text style={styles.subtexto}>Essa aba vai fechar sozinha em instantes.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  texto: { color: colors.ink, fontWeight: "700", fontSize: 15, textAlign: "center" },
  subtexto: { color: colors.inkMuted, fontSize: 13, textAlign: "center" },
});
