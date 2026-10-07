import React, { useCallback, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { StatusConexaoMercadoPago } from "@salao-saas/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { alertar } from "../../utils/alertaCompat";
import { colors, spacing } from "../../theme/tokens";

// Deep link de volta pro app nativo (ver apps/mobile/app.json "scheme") — é
// o que openAuthSessionAsync espera pra fechar o navegador sozinho quando
// detecta essa navegação (ver SaloesMercadoPagoController.callback).
const REDIRECT_DE_VOLTA_NATIVO = "salaosaas://mercadopago-conectado";

// Na versão Web não dá pra usar o mesmo mecanismo (o navegador não conhece o
// esquema "salaosaas://" — só existe dentro do app instalado), então o
// fluxo é outro: abrimos um popup de verdade (window.open) pra página de
// autorização do Mercado Pago, e esperamos uma mensagem (postMessage) da
// página "/mercadopago-conectado" — a MESMA origem do app, pra onde o
// callback da API manda esse popup de volta no final (ver
// SaloesMercadoPagoService/MercadoPagoConectadoWebScreen). Essa página
// avisa a aba principal e se fecha sozinha.
//
// O popup precisa ser aberto de forma SÍNCRONA dentro do clique do botão
// (window.open vazio primeiro, URL de verdade só depois que a API responder)
// — se esperar a chamada à API antes de abrir, a maioria dos navegadores
// trata como popup "não solicitado pelo usuário" e bloqueia silenciosamente.
async function conectarPelaWeb(carregar: () => Promise<void>, aoTerminar: (sucesso: boolean | null) => void) {
  const popup = window.open("", "mercadopago-conectar", "width=480,height=720");
  if (!popup) {
    aoTerminar(null); // null = nem chegou a tentar (sem alerta de "falhou", é bloqueio de popup)
    alertarPopupBloqueado();
    return;
  }
  try {
    const origemWeb = window.location.origin;
    const { data } = await api.get<{ url: string }>("/saloes/mercadopago/conectar", {
      params: { plataforma: "web", origemWeb },
    });
    popup.location.href = data.url;
    aguardarRetornoDoPopup(popup, carregar, aoTerminar);
  } catch (e: any) {
    popup.close();
    aoTerminar(null);
    alertar("Não foi possível iniciar a conexão", e?.response?.data?.message ?? "Tente de novo.");
  }
}

function alertarPopupBloqueado() {
  alertar("Bloqueado pelo navegador", 'Permita pop-ups para este site (ícone na barra de endereço) e toque em "Conectar" de novo.');
}

// Fica de olho em duas coisas: a mensagem que a página de retorno manda (fim
// normal, com sucesso ou não) e o popup sendo fechado na mão pela pessoa sem
// terminar (pra não deixar o botão "conectando" travado pra sempre).
function aguardarRetornoDoPopup(popup: Window, carregar: () => Promise<void>, aoTerminar: (sucesso: boolean | null) => void) {
  function aoReceberMensagem(evento: MessageEvent) {
    if (evento.origin !== window.location.origin || evento.data?.tipo !== "mercadopago-conectado") return;
    finalizar(evento.data.sucesso as boolean);
  }

  const verificador = setInterval(() => {
    if (popup.closed) finalizar(null);
  }, 700);

  function finalizar(sucesso: boolean | null) {
    clearInterval(verificador);
    window.removeEventListener("message", aoReceberMensagem);
    carregar().finally(() => aoTerminar(sucesso));
  }

  window.addEventListener("message", aoReceberMensagem);
}

// É aqui que o dono do salão conecta a PRÓPRIA conta Mercado Pago
// (modelo marketplace) — sem isso, os clientes não conseguem pagar pelo app
// (nem agendamento avulso, nem pacote mensal): o dinheiro precisa de uma
// conta pra cair.
export function ConectarMercadoPagoScreen() {
  const [status, setStatus] = useState<StatusConexaoMercadoPago | null>(null);
  const [conectando, setConectando] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await api.get<StatusConexaoMercadoPago>("/saloes/mercadopago/status");
    setStatus(data);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function conectar() {
    setConectando(true);

    if (Platform.OS === "web") {
      // Fluxo via popup + postMessage (ver conectarPelaWeb acima) — já cuida
      // de recarregar o status e de tratar erro/popup bloqueado sozinho.
      await conectarPelaWeb(carregar, (sucesso) => {
        setConectando(false);
        if (sucesso === false) {
          alertar("Não foi possível conectar", "Tente novamente em alguns instantes.");
        }
      });
      return;
    }

    try {
      const { data } = await api.get<{ url: string }>("/saloes/mercadopago/conectar", {
        params: { plataforma: "nativo" },
      });
      const resultado = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_DE_VOLTA_NATIVO);
      // "success" = voltou pelo deep link (ver SaloesMercadoPagoController.callback).
      // Recarregamos o status de qualquer forma — é a fonte da verdade real.
      await carregar();
      if (resultado.type === "success" && resultado.url.includes("sucesso=0")) {
        alertar("Não foi possível conectar", "Tente novamente em alguns instantes.");
      }
    } catch (e: any) {
      alertar("Não foi possível iniciar a conexão", e?.response?.data?.message ?? "Tente de novo.");
    } finally {
      setConectando(false);
    }
  }

  function desconectar() {
    alertar(
      "Desconectar Mercado Pago?",
      "Clientes não vão conseguir pagar agendamentos nem pacotes mensais pelo app até você reconectar.",
      [
        { text: "Voltar", style: "cancel" },
        {
          text: "Desconectar",
          style: "destructive",
          onPress: async () => {
            await api.patch("/saloes/mercadopago/desconectar");
            carregar();
          },
        },
      ],
    );
  }

  if (!status) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Mercado Pago</Text>
        <Text style={styles.hint}>
          Conecte a conta Mercado Pago do seu salão pra receber os pagamentos dos clientes direto na sua conta —
          agendamentos avulsos (Pix/cartão) e pacotes mensais.
        </Text>

        {status.conectado ? (
          <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accent, gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <View style={styles.pontoConectado} />
              <Text style={styles.statusConectado}>Conta conectada</Text>
            </View>
            {status.conectadoEm && (
              <Text style={styles.meta}>Desde {new Date(status.conectadoEm).toLocaleDateString("pt-BR")}</Text>
            )}
          </Card>
        ) : (
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <View style={styles.pontoDesconectado} />
              <Text style={styles.statusDesconectado}>Nenhuma conta conectada</Text>
            </View>
          </Card>
        )}

        <Button
          label={status.conectado ? "Reconectar / trocar de conta" : "Conectar com Mercado Pago"}
          onPress={conectar}
          loading={conectando}
        />

        {status.conectado && (
          <Text style={styles.desconectarLink} onPress={desconectar}>
            Desconectar
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  hint: { fontSize: 13, color: colors.inkMuted },
  pontoConectado: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#4ade80" },
  pontoDesconectado: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.inkMuted },
  statusConectado: { fontWeight: "800", color: colors.ink },
  statusDesconectado: { fontWeight: "700", color: colors.inkMuted },
  meta: { fontSize: 12, color: colors.inkMuted },
  desconectarLink: { color: colors.danger, fontWeight: "700", fontSize: 13, textAlign: "center", marginTop: spacing.sm },
});
