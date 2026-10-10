import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useProfissionalDono } from "../../store/profissionalDonoStore";
import { alertar } from "../../utils/alertaCompat";
import { useAuthStore } from "../../store/authStore";
import { Card } from "../../components/Card";
import { colors, spacing } from "../../theme/tokens";
import { MaisStackParamList } from "../../navigation/MaisStack";

type Props = NativeStackScreenProps<MaisStackParamList, "Mais">;

export function MaisScreen({ navigation }: Props) {
  const logout = useAuthStore((s) => s.logout);
  const atende = useProfissionalDono((s) => s.atende);
  const ativarAtendimento = useProfissionalDono((s) => s.ativar);

  const itens: Array<{ label: string; onPress: () => void }> = [
    { label: "Editar perfil", onPress: () => navigation.navigate("EditarPerfil") },
    ...(atende
      ? [
          { label: "Meus horários (como profissional)", onPress: () => navigation.navigate("MeusHorarios") },
          { label: "Meu financeiro (como profissional)", onPress: () => navigation.navigate("MeuFinanceiro") },
        ]
      : [
          {
            label: "Eu também atendo (ativar minha agenda)",
            onPress: () =>
              alertar("Ativar minha agenda?", "Você passa a ter agenda, horários e financeiro como profissional, na mesma conta.", [
                { text: "Agora não", style: "cancel" },
                {
                  text: "Ativar",
                  onPress: async () => {
                    try {
                      await ativarAtendimento();
                    } catch {
                      alertar("Não foi possível ativar", "Tente novamente em instantes.");
                    }
                  },
                },
              ]),
          },
        ]),
    { label: "Serviços", onPress: () => navigation.navigate("Servicos") },
    { label: "Pacotes", onPress: () => navigation.navigate("Pacotes") },
    { label: "Pacotes mensais", onPress: () => navigation.navigate("PacotesMensais") },
    { label: "Equipe", onPress: () => navigation.navigate("Equipe") },
    { label: "Localização", onPress: () => navigation.navigate("Localizacao") },
    { label: "QR Code para imprimir", onPress: () => navigation.navigate("QrCode") },
    { label: "Logo do salão", onPress: () => navigation.navigate("Logo") },
    { label: "Mercado Pago", onPress: () => navigation.navigate("MercadoPago") },
    { label: "Assinatura do plano", onPress: () => navigation.navigate("Assinatura") },
    { label: "Suporte", onPress: () => navigation.navigate("Suporte") },
    { label: "Sobre", onPress: () => navigation.navigate("Sobre") },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Mais</Text>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {itens.map((item, i) => (
            <Text
              key={item.label}
              onPress={item.onPress}
              style={[
                styles.item,
                i < itens.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
              ]}
            >
              {item.label}
            </Text>
          ))}
        </Card>
        <Text style={styles.logout} onPress={logout}>Sair da conta</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, padding: spacing.xl },
  item: { padding: spacing.lg, fontSize: 14, fontWeight: "600", color: colors.ink },
  logout: { color: colors.danger, fontWeight: "700", padding: spacing.sm },
});
