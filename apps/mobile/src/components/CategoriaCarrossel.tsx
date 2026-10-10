import React from "react";
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CATEGORIAS_SERVICO, CategoriaServico } from "@salao-saas/shared";
import { colors, spacing } from "../theme/tokens";

const IMAGENS: Record<string, ImageSourcePropType> = {
  TUDO: require("../../assets/categorias/tudo.png"),
  CABELO: require("../../assets/categorias/cabelo.png"),
  UNHA: require("../../assets/categorias/unha.png"),
  SOBRANCELHA_CILIOS: require("../../assets/categorias/sobrancelha.png"),
  MAQUIAGEM: require("../../assets/categorias/maquiagem.png"),
  ESTETICA: require("../../assets/categorias/estetica.png"),
};

const ROTULOS_CURTOS: Record<string, string> = {
  SOBRANCELHA_CILIOS: "Sobrancelha e cílios",
  ESTETICA: "Estética e depilação",
};

// Carrossel horizontal de categorias com imagem (mesmo funcionamento do CategoriaChips com "Tudo").
export function CategoriaCarrossel({
  valor,
  onChange,
  categorias,
}: {
  valor: CategoriaServico | undefined;
  onChange: (categoria: CategoriaServico | undefined) => void;
  categorias?: readonly CategoriaServico[];
}) {
  const opcoes = CATEGORIAS_SERVICO.filter((c) => !categorias || categorias.includes(c.valor));
  const itens: { chave: string; rotulo: string; valor: CategoriaServico | undefined }[] = [
    { chave: "TUDO", rotulo: "Tudo", valor: undefined },
    ...opcoes.map((c) => ({ chave: c.valor as string, rotulo: ROTULOS_CURTOS[c.valor] ?? c.rotulo, valor: c.valor })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lista}>
      {itens.map((i) => {
        const ativo = valor === i.valor;
        return (
          <Pressable key={i.chave} onPress={() => onChange(i.valor)} style={styles.item} hitSlop={4}>
            <View style={[styles.anel, ativo && styles.anelAtivo]}>
              <Image source={IMAGENS[i.chave]} style={styles.imagem} />
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
