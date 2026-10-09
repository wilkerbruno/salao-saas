import React, { useCallback, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Salao } from "@salao-saas/shared";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ENDERECO_VAZIO, EnderecoForm, enderecoParaApi, enderecoValido } from "../../components/EnderecoForm";
import { colors, radius, spacing } from "../../theme/tokens";

// Tela "Mais > Editar perfil" do dono — edita tanto os próprios dados
// pessoais (nome, e-mail, telefone — PATCH /usuarios/me) quanto os dados da
// salão exibidos pro cliente (nome, endereço, telefone de contato —
// PATCH /saloes/:id, mesmo endpoint que "Mais > Logo"/"Localização" já
// usam). Endereço aqui é só o texto mostrado no app do cliente — a
// localização por GPS usada na busca "Perto de você" continua em
// "Mais > Localização" (LocalizacaoScreen), são coisas diferentes.
export function EditarPerfilScreen() {
  const usuario = useAuthStore((s) => s.usuario);
  const atualizarUsuario = useAuthStore((s) => s.atualizarUsuario);
  const salaoId = usuario?.salaoId;

  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [telefone, setTelefone] = useState(usuario?.telefone ?? "");
  const [nomeSalao, setNomeSalao] = useState("");
  const [enderecoSalao, setEnderecoSalao] = useState(ENDERECO_VAZIO);
  const [telefoneSalao, setTelefoneSalao] = useState("");
  const [observacaoAgendamento, setObservacaoAgendamento] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!salaoId) return;
    setCarregando(true);
    try {
      const { data } = await api.get<Salao>(`/saloes/${salaoId}`);
      setNomeSalao(data.nome ?? "");
      setEnderecoSalao({
        cep: data.cep ?? "",
        logradouro: data.logradouro ?? "",
        numero: data.numero ?? "",
        complemento: data.complemento ?? "",
        bairro: data.bairro ?? "",
        cidade: data.cidade ?? "",
        uf: data.uf ?? "",
      });
      setTelefoneSalao(data.telefone ?? "");
      setObservacaoAgendamento(data.observacaoAgendamento ?? "");
    } finally {
      setCarregando(false);
    }
  }, [salaoId]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function salvar() {
    setErro(null);
    setSucesso(false);
    if (!nome.trim()) return setErro("Digite seu nome.");
    if (!email.includes("@")) return setErro("Digite um e-mail válido.");
    if (telefone.replace(/\D/g, "").length < 8) return setErro("Digite um telefone pessoal válido com DDD.");
    if (!nomeSalao.trim()) return setErro("Digite o nome do salão.");
    if (!enderecoValido(enderecoSalao)) return setErro("Digite o endereço completo do salão (CEP, rua, número, bairro e cidade).");
    if (telefoneSalao.replace(/\D/g, "").length < 8) return setErro("Digite um telefone do salão válido com DDD.");

    setSalvando(true);
    try {
      const [{ data: usuarioAtualizado }] = await Promise.all([
        api.patch("/usuarios/meu-perfil", {
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          telefone: telefone.trim(),
        }),
        api.patch(`/saloes/${salaoId}`, {
          nome: nomeSalao.trim(),
          endereco: enderecoParaApi(enderecoSalao),
          telefone: telefoneSalao.trim(),
          observacaoAgendamento: observacaoAgendamento.trim(),
        }),
      ]);
      await atualizarUsuario(usuarioAtualizado);
      setSucesso(true);
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.secaoTitulo}>Seus dados</Text>
          <Card style={{ gap: spacing.md }}>
            <View style={styles.field}>
              <Text style={styles.label}>Nome</Text>
              <TextInput value={nome} onChangeText={setNome} style={styles.input} placeholder="Seu nome" />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>E-mail</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
                placeholder="voce@email.com"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Telefone pessoal</Text>
              <TextInput
                value={telefone}
                onChangeText={setTelefone}
                keyboardType="phone-pad"
                style={styles.input}
                placeholder="(11) 91234-5678"
              />
            </View>
          </Card>

          <Text style={styles.secaoTitulo}>Dados do salão</Text>
          <Card style={{ gap: spacing.md }}>
            <View style={styles.field}>
              <Text style={styles.label}>Nome do salão</Text>
              <TextInput value={nomeSalao} onChangeText={setNomeSalao} style={styles.input} placeholder="Nome do salão" />
            </View>
            <EnderecoForm valores={enderecoSalao} onChange={setEnderecoSalao} />
            <View style={styles.field}>
              <Text style={styles.label}>Telefone do salão</Text>
              <TextInput
                value={telefoneSalao}
                onChangeText={setTelefoneSalao}
                keyboardType="phone-pad"
                style={styles.input}
                placeholder="(11) 91234-5678"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Aviso para o cliente ao agendar</Text>
              <TextInput
                value={observacaoAgendamento}
                onChangeText={setObservacaoAgendamento}
                multiline
                maxLength={2000}
                style={[styles.input, { minHeight: 96, textAlignVertical: "top" }]}
                placeholder="Ex: Tolerância de 10 minutos de atraso. Chegue com o cabelo lavado."
              />
            </View>
            <Text style={styles.hint}>
              Esse aviso aparece pro cliente a cada agendamento, e ele só consegue fechar depois de 60 segundos. Deixe
              vazio para não mostrar nada.
            </Text>
            <Text style={styles.hint}>
              É esse telefone que o cliente usa pra te ligar em "Meus agendamentos". A localização por GPS usada na
              busca "Perto de você" continua em Mais {">"} Localização.
            </Text>
          </Card>

          {erro && <Text style={styles.erro}>{erro}</Text>}
          {sucesso && <Text style={styles.sucesso}>Dados atualizados com sucesso.</Text>}

          <Button label="Salvar alterações" onPress={salvar} loading={salvando} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
  secaoTitulo: { fontSize: 13, fontWeight: "700", color: colors.inkMuted, marginTop: spacing.sm },
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
  hint: { fontSize: 11, color: colors.inkMuted, lineHeight: 16 },
  erro: { color: colors.danger, fontSize: 13 },
  sucesso: { color: colors.success, fontSize: 13 },
});
