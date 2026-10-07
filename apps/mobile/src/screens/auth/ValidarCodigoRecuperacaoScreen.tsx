import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, mensagemErroApi } from "../../api/client";
import { Button } from "../../components/Button";
import { alertar } from "../../utils/alertaCompat";
import { colors, radius, spacing } from "../../theme/tokens";
import { AuthStackParamList } from "../../navigation/AuthNavigator";

type Props = NativeStackScreenProps<AuthStackParamList, "ValidarCodigoRecuperacao">;

// Passo 2 de "esqueci minha senha": confere o código de 6 dígitos recebido
// por e-mail. Em caso de sucesso, a API devolve um resetToken de validade
// curta (10 min — ver AuthService.validarCodigoRecuperacao) que autoriza só a
// troca de senha do próximo passo, sem precisar reenviar o código.
export function ValidarCodigoRecuperacaoScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const [codigo, setCodigo] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [reenviando, setReenviando] = useState(false);

  async function validar() {
    if (codigo.trim().length !== 6) {
      alertar("Código incompleto", "Digite os 6 dígitos que mandamos pro seu e-mail.");
      return;
    }

    setCarregando(true);
    try {
      const { data } = await api.post("/auth/validar-codigo-recuperacao", { email, codigo: codigo.trim() });
      navigation.navigate("NovaSenha", { resetToken: data.resetToken });
    } catch (e: any) {
      alertar("Código inválido", mensagemErroApi(e, "Confira o código ou peça um novo."));
    } finally {
      setCarregando(false);
    }
  }

  async function reenviarCodigo() {
    setReenviando(true);
    try {
      await api.post("/auth/esqueci-senha", { email });
      alertar("Código reenviado", "Se for preciso, mandamos um novo código pro seu e-mail.");
    } catch (e: any) {
      alertar("Não foi possível reenviar", mensagemErroApi(e));
    } finally {
      setReenviando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Digite o código</Text>
          <Text style={styles.subtitle}>Enviamos um código de 6 dígitos para {email}. Ele vale por 15 minutos.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Código de verificação</Text>
            <TextInput
              value={codigo}
              onChangeText={(texto) => setCodigo(texto.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              autoFocus
              maxLength={6}
              style={[styles.input, styles.inputCodigo]}
              placeholder="000000"
              placeholderTextColor={colors.inkMuted}
            />
          </View>

          <Button label="Validar código" onPress={validar} loading={carregando} />

          <Text style={styles.linkReenviar} onPress={reenviando ? undefined : reenviarCodigo}>
            {reenviando ? "Reenviando..." : "Não recebeu? Reenviar código"}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.xl, justifyContent: "center", gap: spacing.md },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.inkMuted, lineHeight: 18, marginBottom: spacing.lg },
  field: { gap: spacing.xs },
  label: { fontSize: 12, fontWeight: "600", color: colors.inkMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.ink,
  },
  inputCodigo: { fontSize: 22, fontWeight: "700", letterSpacing: 8, textAlign: "center" },
  linkReenviar: { textAlign: "center", fontSize: 13, color: colors.accent, fontWeight: "600", marginTop: spacing.sm },
});
