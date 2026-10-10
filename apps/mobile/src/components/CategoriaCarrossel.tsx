import React, { useEffect, useState } from "react";
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CATEGORIAS_SERVICO, CategoriaServico } from "@salao-saas/shared";
import { api } from "../api/client";
import { colors, spacing } from "../theme/tokens";

export interface ItemCategoriaHome {
  id: string;
  rotulo: string;
  imagemUrl?: string | null;
  categoria?: CategoriaServico | null;
  busca?: string | null;
}

const IMAGENS: Record<string, ImageSourcePropType> = {
  TUDO: require("../../assets/categorias/tudo.png"),
  CABELO: require("../../assets/categorias/cabelo.png"),
  UNHA: require("../../assets/categorias/unha.png"),
  SOBRANCELHA_CILIOS: require("../../assets/categorias/sobrancelha.png"),
  MAQUIAGEM: require("../../assets/categorias/maquiagem.png"),
  ESTETICA: require("../../assets/categorias/estetica.png"),
};

const PADRAO: ItemCategoriaHome[] = [
  { id: "tudo", rotulo: "Tudo" },
  ...CATEGORIAS_SERVICO.filter((c) => c.valor !== "OUTROS").map((c) => ({
    id: c.valor as string,
    rotulo: c.valor === "UNHA" ? "Unhas" : c.rotulo,
    categoria: c.valor,
  })),
];

function imagemDe(i: ItemCategoriaHome): ImageSourcePropType {
  if (i.imagemUrl) return { uri: i.imagemUrl };
  return IMAGENS[i.categoria ?? "TUDO"] ?? IMAGENS.TUDO;
}

// Carrossel horizontal de categorias com foto. Os itens vêm do painel admin
// (GET /categorias-home); se a chamada falhar usa a lista padrão embutida.
export function CategoriaCarrossel({
  selecionado,
  onChange,
}: {
  selecionado: string;
  onChange: (item: ItemCategoriaHome) => void;
}) {
  const [itens, setItens] = useState<ItemCategoriaHome[]>(PADRAO);
  useEffect(() => {
    api
      .get<ItemCategoriaHome[]>("/categorias-home")
      .then((r) => r.data.length > 0 && setItens(r.data))
      .catch(() => {});
  }, []);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lista}>
      {itens.map((i) => {
        const ativo = selecionado === i.id || (selecionado === "tudo" && !i.categoria && !i.busca);
        return (
          <Pressable key={i.id} onPress={() => onChange(i)} style={styles.item} hitSlop={4}>
            <View style={[styles.anel, ativo && styles.anelAtivo]}>
              <Image source={imagemDe(i)} style={styles.imagem} />
            </View>
            <Text style={[styles.rotulo, ativo && styles.rotuloAtivo]} numberOfLines={2}>
              {i.rotulo}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  lista: { gap: spacing.md, paddingVertical: spacing.xs, paddingRight: spacing.md },
  item: { width: 78, alignItems: "center" },
  anel: { width: 72, height: 72, borderRadius: 36, padding: 3, borderWidth: 2, borderColor: "transparent" },
  anelAtivo: { borderColor: colors.accent },
  imagem: { width: "100%", height: "100%", borderRadius: 33 },
  rotulo: { marginTop: 6, fontSize: 12, fontWeight: "600", color: colors.inkMuted, textAlign: "center" },
  rotuloAtivo: { color: colors.accent, fontWeight: "800" },
});
