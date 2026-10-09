import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { MercadoPagoConectadoWebScreen } from "./src/screens/salao/MercadoPagoConectadoWebScreen";
import { verificarEAtualizarApk } from "./src/utils/atualizacaoApk";
import { colors, radius, spacing } from "./src/theme/tokens";
import { useAuthStore } from "./src/store/authStore";

// Na versão Web, o popup de OAuth do Mercado Pago volta pra essa mesma
// origem em "/mercadopago-conectado" (ver SaloesMercadoPagoService e
// ConectarMercadoPagoScreen/conectarPelaWeb). Esse popup não deve montar o
// app inteiro (navegação, telas de login, etc) — só precisa avisar a aba
// principal e se fechar sozinho — por isso essa checagem intercepta a rota
// ANTES de qualquer coisa relacionada a autenticação/navegação.
function ehPopupDeRetornoDoMercadoPago(): boolean {
  return Platform.OS === "web" && typeof window !== "undefined" && window.location.pathname === "/mercadopago-conectado";
}

// Por padrão, o expo-updates só CHECA por atualização OTA (JS/assets) ao
// abrir o app, baixa em segundo plano se achar, e só aplica na PRÓXIMA vez
// que o app for aberto — por isso dois celulares podem ficar em versões
// diferentes por um tempo (um "atualiza sozinho" mais rápido que o outro,
// dependendo de quantas vezes cada um foi reaberto com internet). Aqui a
// gente força: checa, baixa e já recarrega o app na hora, assim que abre —
// reduz a demora/inconsistência entre aparelhos pra mudanças só de
// JS/tela (não cobre mudança nativa, tipo nova permissão ou libraria nova,
// que exige instalar o .apk novo mesmo).
function useAtualizacaoAutomatica() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    (async () => {
      try {
        const resultado = await Updates.checkForUpdateAsync();
        if (resultado.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Sem internet, ou qualquer falha na checagem: segue com a versão
        // já instalada normalmente, sem travar o app por causa disso.
      }
    })();
  }, []);
}

// Atualização do .apk em si (mudança nativa — nova lib, nova permissão,
// etc), separada da checagem de JS acima. Ver src/utils/atualizacaoApk.ts
// pro racional completo e o limite real do Android nisso (o toque final em
// "Instalar" é sempre do usuário, nenhum app comum consegue pular essa
// etapa). Essa barrinha só aparece durante o download, pra avisar que tem
// algo baixando em segundo plano.
function useAtualizacaoApk() {
  const [progresso, setProgresso] = useState<number | null>(null);
  // Checa assim que o usuario esta logado (e de novo em cada novo login).
  const logado = useAuthStore((s) => !!s.usuario);

  useEffect(() => {
    if (__DEV__ || !logado) return;
    verificarEAtualizarApk((fracao) => setProgresso(fracao)).finally(() => {
      setProgresso(null);
    });
  }, [logado]);

  return progresso;
}

export default function App() {
  useAtualizacaoAutomatica();
  const progressoApk = useAtualizacaoApk();

  if (ehPopupDeRetornoDoMercadoPago()) {
    return <MercadoPagoConectadoWebScreen />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <RootNavigator />
      {progressoApk !== null && (
        <View style={styles.avisoAtualizacao} pointerEvents="none">
          <Text style={styles.avisoTexto}>
            Baixando atualização do app… {Math.round(progressoApk * 100)}%
          </Text>
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  avisoAtualizacao: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingBottom: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  avisoTexto: {
    color: colors.accent,
    fontSize: 12.5,
    fontWeight: "700",
  },
});
