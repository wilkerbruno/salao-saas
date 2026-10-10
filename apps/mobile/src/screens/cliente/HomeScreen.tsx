import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { CategoriaServico, SalaoProxima } from "@salao-saas/shared";
import { api } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { CategoriaCarrossel } from "../../components/CategoriaCarrossel";
import { StarRating } from "../../components/StarRating";
import { colors, radius, spacing } from "../../theme/tokens";
import { HomeStackParamList } from "../../navigation/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Home">;
type Estado = "carregando" | "sem-permissao" | "erro" | "pronto";

// Tela inicial do app do cliente: salões perto dele, com busca por nome,
// ordenadas primeiro pelas que ele já frequentou e depois pelas com melhor
// nota (ver SaloesService.listarProximas) — daqui ele escolhe em qual vai
// agendar.
export function HomeScreen({ navigation }: Props) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [saloes, setSaloes] = useState<SalaoProxima[]>([]);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<CategoriaServico | undefined>(undefined);
  const [catId, setCatId] = useState("tudo");
  const [termoCategoria, setTermoCategoria] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const buscarLocalizacao = useCallback(async () => {
    setEstado("carregando");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setEstado("sem-permissao");
        return;
      }
      const posicao = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: posicao.coords.latitude, lng: posicao.coords.longitude });
    } catch {
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    buscarLocalizacao();
  }, [buscarLocalizacao]);

  // Refaz a busca sempre que a localização é obtida ou o texto de busca muda
  // (com um pequeno atraso pra não disparar uma chamada a cada letra digitada).
  useEffect(() => {
    if (!coords) return;
    let cancelado = false;
    const tempo = setTimeout(async () => {
      try {
        const { data } = await api.get<SalaoProxima[]>("/saloes/proximas", {
          params: { lat: coords.lat, lng: coords.lng, raioKm: 30, q: busca || termoCategoria || undefined, categoria },
        });
        if (!cancelado) {
          setSaloes(data);
          setEstado("pronto");
        }
      } catch {
        if (!cancelado) setEstado("erro");
      }
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(tempo);
    };
  }, [coords, busca, categoria, termoCategoria]);

  if (estado === "carregando") {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (estado === "sem-permissao" || estado === "erro") {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.mensagem}>
          {estado === "sem-permissao"
            ? "Precisamos da sua localização pra mostrar os salões mais perto de você."
            : "Não foi possível buscar os salões agora. Verifique sua internet/GPS e tente de novo."}
        </Text>
        <Button label="Tentar novamente" onPress={buscarLocalizacao} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.title}>Salões</Text>
          <Pressable
            onPress={() => coords && navigation.navigate("Map", { saloes, minhaLat: coords.lat, minhaLng: coords.lng })}
            style={styles.mapaBotao}
            hitSlop={8}
          >
            <Ionicons name="map-outline" size={16} color={colors.accent} />
            <Text style={styles.mapaBotaoTexto}>Ver no mapa</Text>
          </Pressable>
        </View>
        <View style={styles.buscaWrapper}>
          <Ionicons name="search" size={16} color={colors.inkMuted} />
          <TextInput
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar salão ou serviço (cabelo, unha, make...)"
            placeholderTextColor={colors.inkMuted}
            style={styles.buscaInput}
          />
        </View>
        <CategoriaCarrossel
          selecionado={catId}
          onChange={(item) => {
            setCatId(item.id);
            setCategoria(item.categoria ?? undefined);
            setTermoCategoria(item.categoria ? "" : item.busca ?? "");
          }}
        />
      </View>

      <FlatList
        data={saloes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.mensagem}>
            {busca || categoria
              ? "Nenhum salão encontrado para essa busca. Tente outra palavra ou área."
              : "Nenhum salão cadastrado perto de você ainda."}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate("SalaoDetail", { salaoId: item.id, nome: item.nome })}>
            <Card style={{ marginBottom: spacing.sm, gap: spacing.xs, flexDirection: "row" }}>
              {item.logoUrl ? (
                <Image source={{ uri: item.logoUrl }} style={styles.logo} />
              ) : (
                <View style={[styles.logo, styles.logoPlaceholder]}>
                  <Ionicons name="cut-outline" size={22} color={colors.inkMuted} />
                </View>
              )}
              <View style={{ flex: 1, gap: spacing.xs }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, paddingRight: spacing.sm }}>
                    <Text style={styles.nome}>{item.nome}</Text>
                    {item.endereco && <Text style={styles.endereco}>{item.endereco}</Text>}
                  </View>
                  <Text style={styles.distancia}>
                    {item.distanciaKm < 1 ? `${Math.round(item.distanciaKm * 1000)} m` : `${item.distanciaKm.toFixed(1)} km`}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <StarRating value={item.notaMedia} totalAvaliacoes={item.totalAvaliacoes} size={14} />
                  {item.jaAgendou && <Text style={styles.jaAgendouTag}>Você já foi aqui</Text>}
                </View>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  mapaBotao: { flexDirection: "row", alignItems: "center", gap: 4 },
  mapaBotaoTexto: { fontSize: 12, fontWeight: "700", color: colors.accent },
  buscaWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  buscaInput: { flex: 1, paddingVertical: spacing.sm, fontSize: 14, color: colors.ink },
  list: { padding: spacing.xl },
  mensagem: { color: colors.inkMuted, fontSize: 14, textAlign: "center" },
  logo: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  logoPlaceholder: { alignItems: "center", justifyContent: "center" },
  nome: { fontSize: 15, fontWeight: "800", color: colors.ink },
  endereco: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  distancia: { fontSize: 12, fontWeight: "700", color: colors.accent },
  jaAgendouTag: { fontSize: 11, fontWeight: "700", color: colors.accent },
});
