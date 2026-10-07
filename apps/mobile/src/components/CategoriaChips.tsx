import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CATEGORIAS_SERVICO, CategoriaServico } from "@salao-saas/shared";
import { colors, radius, spacing } from "../theme/tokens";

interface BaseProps {
  // Restringe as opções mostradas (ex: só as categorias que o salão realmente tem).
  categorias?: readonly CategoriaServico[];
}

// Escolha de UMA categoria (ex: cadastrar um serviço) — opcionalmente com uma
// opção "Todos" na frente (filtro da lista de serviços no agendamento).
export function CategoriaChips({
  valor,
  onChange,
  categorias,
  comTodos = false,
}: BaseProps & {
  valor: CategoriaServico | undefined;
  onChange: (categoria: CategoriaServico | undefined) => void;
  comTodos?: boolean;
}) {
  const opcoes = CATEGORIAS_SERVICO.filter((c) => !categorias || categorias.includes(c.valor));
  return (
    <View style={styles.linha}>
      {comTodos && <Chip rotulo="Tudo" selecionado={valor === undefined} onPress={() => onChange(undefined)} />}
      {opcoes.map((c) => (
        <Chip
          key={c.valor}
          rotulo={`${c.rotulo}`}
          selecionado={valor === c.valor}
          onPress={() => onChange(c.valor)}
        />
      ))}
    </View>
  );
}

// Escolha de VÁRIAS categorias (ex: em quais áreas a profissional atua).
export function CategoriaChipsMulti({
  valores,
  onChange,
  categorias,
}: BaseProps & {
  valores: readonly CategoriaServico[];
  onChange: (categorias: CategoriaServico[]) => void;
}) {
  const opcoes = CATEGORIAS_SERVICO.filter((c) => !categorias || categorias.includes(c.valor));
  return (
    <View style={styles.linha}>
      {opcoes.map((c) => {
        const selecionado = valores.includes(c.valor);
        return (
          <Chip
            key={c.valor}
            rotulo={`${c.rotulo}`}
            selecionado={selecionado}
            onPress={() => onChange(selecionado ? valores.filter((v) => v !== c.valor) : [...valores, c.valor])}
          />
        );
      })}
    </View>
  );
}

function Chip({ rotulo, selecionado, onPress }: { rotulo: string; selecionado: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <View style={[styles.chip, selecionado && styles.chipSelecionado]}>
        <Text style={[styles.texto, selecionado && styles.textoSelecionado]}>{rotulo}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelecionado: { backgroundColor: colors.accent, borderColor: colors.accent },
  texto: { fontSize: 13, fontWeight: "700", color: colors.ink },
  textoSelecionado: { color: colors.accentInk },
});
