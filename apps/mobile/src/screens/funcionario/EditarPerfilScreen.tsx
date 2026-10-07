import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/Button";
import { EnderecoForm, enderecoParaApi, enderecoValido, EnderecoValores } from "../../components/EnderecoForm";
import { anexarImagemAoFormData } from "../../utils/imagemFormData";
import { colors, radius, spacing } from "../../theme/tokens";

// Tela "Perfil > Editar perfil" do funcionário — foto, nome e e-mail. O
// telefone fica de fora de propósito: é cadastrado e só pode ser alterado
// pelo dono do salão, pela tela Equipe (ver UsuariosService.atualizarMeuPerfil,
// que recusa no backend mesmo que alguém tente mandar telefone por aqui).
export function EditarPerfilScreen() {
  const usuario = useAuthStore((s) => s.usuario);
  const atualizarUsuario = useAuthStore((s) => s.atualizarUsuario);

  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [endereco, setEndereco] = useState<EnderecoValores>({
    cep: usuario?.cep ?? "",
    logradouro: usuario?.logradouro ?? "",
    numero: usuario?.numero ?? "",
    complemento: usuario?.complemento ?? "",
    bairro: usuario?.bairro ?? "",
    cidade: usuario?.cidade ?? "",
    uf: usuario?.uf ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Foto de perfil: aparece pro cliente na hora de escolher o profissional
  // (ver BookingScreen) — independente do resto do formulário, pra salvar
  // sozinha assim que escolhida (mesmo padrão de LogoScreen, no salão).
  const [fotoAtual, setFotoAtual] = useState<string | null>(null);
  const [novaFoto, setNovaFoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [statusFoto, setStatusFoto] = useState<"carregando" | "pronto" | "enviando" | "erro">("carregando");
  const [erroFoto, setErroFoto] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ fotoUrl: string | null }>("/funcionarios/minha-foto")
      .then(({ data }) => {
        setFotoAtual(data.fotoUrl);
        setStatusFoto("pronto");
      })
      .catch(() => setStatusFoto("erro"));
  }, []);

  async function escolherFoto() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) return;

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!resultado.canceled && resultado.assets[0]) {
      setNovaFoto(resultado.assets[0]);
    }
  }

  async function enviarFoto() {
    if (!novaFoto) return;
    setStatusFoto("enviando");
    setErroFoto(null);
    const formData = new FormData();
    anexarImagemAoFormData(formData, "foto", novaFoto);
    try {
      const { data } = await api.post<{ fotoUrl: string }>("/funcionarios/minha-foto", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFotoAtual(data.fotoUrl);
      setNovaFoto(null);
      setStatusFoto("pronto");
    } catch (e: any) {
      setStatusFoto("erro");
      setErroFoto(e?.response?.data?.message ?? "Não foi possível salvar a foto. Tente de novo.");
    }
  }

  const previewFoto = novaFoto?.uri ?? fotoAtual;

  async function salvar() {
    setErro(null);
    setSucesso(false);
    if (!nome.trim()) return setErro("Digite seu nome.");
    if (!email.includes("@")) return setErro("Digite um e-mail válido.");
    if (!enderecoValido(endereco)) return setErro("Digite seu endereço completo (CEP, rua, número, bairro e cidade).");

    setSalvando(true);
    try {
      const { data } = await api.patch("/usuarios/meu-perfil", {
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        endereco: enderecoParaApi(endereco),
      });
      await atualizarUsuario(data);
      setSucesso(true);
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.fotoSecao}>
            <Pressable onPress={escolherFoto} style={styles.fotoPicker}>
              {statusFoto === "carregando" ? (
                <ActivityIndicator color={colors.accent} />
              ) : previewFoto ? (
                <Image source={{ uri: previewFoto }} style={styles.fotoPreview} />
              ) : (
                <View style={styles.fotoPlaceholder}>
                  <Ionicons name="camera-outline" size={28} color={colors.inkMuted} />
                </View>
              )}
            </Pressable>
            <Text style={styles.trocarFoto} onPress={escolherFoto}>
              {previewFoto ? "Escolher outra foto" : "Escolher foto"}
            </Text>
            <Text style={styles.hint}>
              Essa foto aparece pro cliente na hora de escolher com qual profissional agendar.
            </Text>
            {novaFoto && <Button label="Salvar foto" onPress={enviarFoto} loading={statusFoto === "enviando"} />}
            {erroFoto && <Text style={styles.erro}>{erroFoto}</Text>}
          </View>

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
          <EnderecoForm
            valores={endereco}
            onChange={setEndereco}
            hint="Seu endereço é privado: o salão não tem acesso a esse dado, só você."
          />
          <Text style={styles.hint}>
            Seu telefone é cadastrado pelo salão e só pode ser alterado por ele.
          </Text>

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
  fotoSecao: { alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  fotoPicker: { marginTop: spacing.xs },
  fotoPreview: { width: 110, height: 110, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  fotoPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  trocarFoto: { fontSize: 13, fontWeight: "600", color: colors.accent },
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
  hint: { fontSize: 12, color: colors.inkMuted, lineHeight: 17 },
  erro: { color: colors.danger, fontSize: 13 },
  sucesso: { color: colors.success, fontSize: 13 },
});
