import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, mensagemErroApi } from "../../api/client";
import { Button } from "../../components/Button";
import { PasswordInput } from "../../components/PasswordInput";
import { alertar } from "../../utils/alertaCompat";
import { colors, radius, spacing } from "../../theme/tokens";
import { AuthStackParamList } from "../../navigation/AuthNavigator";

const TAMANHO_MINIMO_SENHA = 8;

type Props = NativeStackScreenProps<AuthStackParamList, "NovaSenha">;

// Passo 3 (e último) de "esqueci minha senha": digitar e confirmar a nova
// senha. `resetToken` veio da validação do código (passo anterior) e só
// serve pra essa troca — ver AuthService.redefinirSenha.
export function NovaSenhaScreen({ navigation, route }: Props) {
  const { resetToken } = route.params;
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function salvar() {
    if (novaSenha.length < TAMANHO_MINIMO_SENHA) {
      alertar("Senha muito curta", `A nova senha precisa ter no mínimo ${TAMANHO_MINIMO_SENHA} caracteres.`);
      return;
    }
    if (novaSenha !== confirmarSenha) {
      alertar("As senhas não coincidem", "Digite a mesma senha nos dois campos.");
      return;
    }

    setCarregando(true);
    try {
      await api.post("/auth/redefinir-senha", { resetToken, novaSenha });
      alertar("Senha redefinida!", "Faça login com a sua nova senha.", [
        { text: "OK", onPress: () => navigation.reset({ index: 0, routes: [{ name: "Login" }] }) },
      ]);
    } catch (e: any) {
      alertar("Não foi possível redefinir", mensagemErroApi(e, "O código pode ter expirado. Peça um novo e tente de novo."));
    } finally {
      setCarregando(false);
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
          <Text style={styles.title}>Nova senha</Text>
          <Text style={styles.subtitle}>Escolha uma nova senha com no mínimo {TAMANHO_MINIMO_SENHA} caracteres.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Nova senha</Text>
            <PasswordInput
              value={novaSenha}
              onChangeText={setNovaSenha}
              style={styles.input}
              placeholder="••••••••"
              autoFocus
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirmar nova senha</Text>
            <PasswordInput
              value={confirmarSenha}
              onChangeText={setConfirmarSenha}
              style={styles.input}
              placeholder="••••••••"
            />
          </View>

          <Button label="Salvar nova senha" onPress={salvar} loading={carregando} />
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
});
