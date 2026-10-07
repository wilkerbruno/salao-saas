import React, { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Asset } from "expo-asset";
import * as Sharing from "expo-sharing";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { alertar } from "../../utils/alertaCompat";
import { colors, spacing } from "../../theme/tokens";

// Imagem estática (não desenhada na hora): o conteúdo é sempre o mesmo —
// aponta pra bellaone.store — já que a plataforma ainda não tem uma página
// de agendamento própria por salão (o cliente baixa o app e procura a
// salão de lá). Se um dia existir um link direto por salão, esse QR
// Code passa a ser gerado dinamicamente com o id do salão em vez de usar
// esse arquivo fixo em assets/.
const QRCODE_ASSET = require("../../../assets/qrcode-agendamento.png");
// Proporção real do arquivo (1200x1600) — usada abaixo pra calcular a altura
// certa a partir da largura disponível na tela, em vez de confiar em
// `aspectRatio` + `width: "100%"` dentro de um Card: com flex/alignItems
// "center" esse combo mediu errado (imagem saindo gigante, cortada nas
// bordas, sem ninguém conseguir rolar até o botão). Calculando os números
// certos aqui, o tamanho fica garantido não importa a tela.
const RAZAO_ALTURA_LARGURA = 1600 / 1200;

// Cartaz com QR Code pra imprimir e deixar no salão (balcão, vitrine,
// etc) — "Mais" > "QR Code para imprimir" (ver MaisScreen/MaisStack).
export function QrCodeScreen() {
  const [compartilhando, setCompartilhando] = useState(false);
  const { width: larguraTela } = useWindowDimensions();

  const paddingCard = spacing.sm;
  const larguraImagem = larguraTela - spacing.xl * 2 - paddingCard * 2;
  const alturaImagem = larguraImagem * RAZAO_ALTURA_LARGURA;

  // Usa expo-asset (Asset.fromModule + downloadAsync) em vez de
  // Image.resolveAssetSource direto: no Android, o caminho "cru" de um
  // asset embutido no pacote (android_asset) não é acessível por outros
  // apps — downloadAsync copia o arquivo pra uma pasta que o app consegue
  // compartilhar de verdade via Sharing.shareAsync (mesmo padrão recomendado
  // na documentação do Expo pra compartilhar um asset local).
  async function compartilhar() {
    setCompartilhando(true);
    try {
      const disponivel = await Sharing.isAvailableAsync();
      if (!disponivel) {
        alertar("Não disponível", "Esse aparelho não consegue compartilhar ou salvar arquivos.");
        return;
      }
      const asset = Asset.fromModule(QRCODE_ASSET);
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      await Sharing.shareAsync(uri, {
        dialogTitle: "Salvar ou imprimir QR Code",
        mimeType: "image/png",
        UTI: "public.png",
      });
    } catch {
      alertar("Não foi possível compartilhar", "Tente novamente em instantes.");
    } finally {
      setCompartilhando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Baixe ou compartilhe esse cartaz e deixe impresso no balcão — seus clientes escaneiam e caem direto no
          agendamento.
        </Text>
        <Card style={[styles.cardImagem, { padding: paddingCard }]}>
          <Image
            source={QRCODE_ASSET}
            style={{ width: larguraImagem, height: alturaImagem, borderRadius: 12 }}
            resizeMode="contain"
          />
        </Card>
        <Button label="Baixar / compartilhar" onPress={compartilhar} loading={compartilhando} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  hint: { fontSize: 13, color: colors.inkMuted, textAlign: "center", lineHeight: 18 },
  cardImagem: { alignItems: "center" },
});
