import React, { useState } from "react";
import { TecladoSeguro } from "../../components/TecladoSeguro";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api, mensagemErroApi } from "../../api/client";
import { Button } from "../../components/Button";
import { alertar } from "../../utils/alertaCompat";
import { colors, radius, spacing } from "../../theme/tokens";
import { AuthStackParamList } from "../../navigation/AuthNavigator";

type Props = NativeStackScreenProps<AuthStackParamList, "EsqueciSenha">;

// Passo 1 de "esqueci minha senha": pede o e-mail cadastrado e manda um
// código de verificação pra ele (ver AuthController.esqueciSenha). A API
// sempre responde com sucesso, mesmo se o e-mail não existir — não dá pra
// essa tela saber (nem contar pro usuário) se deu certo mandar o e-mail de
// verdade, só que o pedido foi feito.
export function EsqueciSenhaScreen({ navigation, route }: Props) {
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [carregando, setCarregando] = useState(false);

  async function enviarCodigo() {
    const emailLimpo = email.trim();
    if (!emailLimpo || !emailLimpo.includes("@")) {
      alertar("E-mail inválido", "Digite o e-mail cadastrado na sua conta.");
      return;
    }

    setCarregando(true);
    try {
      await api.post("/auth/esqueci-senha", { email: emailLimpo });
      navigation.navigate("ValidarCodigoRecuperacao", { email: emailLimpo });
    } catch (e: any) {
      alertar("Não foi possível continuar", mensagemErroApi(e));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <TecladoSeguro>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Esqueci minha senha</Text>
          <Text style={styles.subtitle}>
            Digite o e-mail da sua conta. Vamos mandar um código de verificação pra ele.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoFocus
              keyboardType="email-address"
              style={styles.input}
              placeholder="voce@email.com"
              placeholderTextColor={colors.inkMuted}
            />
          </View>

          <Button label="Enviar código" onPress={enviarCodigo} loading={carregando} />
        </ScrollView>
      </TecladoSeguro>
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
