import { Linking, Platform } from "react-native";

// Abre o app de navegação do celular na localização do salão. No Android,
// o esquema "geo:" deixa o próprio sistema abrir o seletor entre todos os
// apps de mapa instalados (Google Maps, Waze etc.) quando há mais de um. No
// iOS não existe um seletor do sistema; abre no Mapas da Apple (ou no app
// padrão de navegação, se o cliente tiver configurado um a partir do iOS
// 17.4). Extraído de MapScreen (tela de mapa da Home) pra ser reaproveitado
// em qualquer lugar que mostre um salão com endereço (detalhe da
// salão, "meus agendamentos" etc).
export function abrirNoMapa(salao: { nome: string; latitude?: number | null; longitude?: number | null }): void {
  if (salao.latitude == null || salao.longitude == null) return;
  const label = encodeURIComponent(salao.nome);
  const urlGoogleMapsWeb = `https://www.google.com/maps/search/?api=1&query=${salao.latitude},${salao.longitude}`;

  // No navegador (Expo Web) não existem os esquemas "geo:"/"maps:" — vai
  // direto pro Google Maps, numa aba nova (mesmo comportamento do fallback
  // abaixo, só que sem depender de uma Promise rejeitada pra chegar lá, que
  // no react-native-web pode nem rejeitar do jeito esperado).
  if (Platform.OS === "web") {
    Linking.openURL(urlGoogleMapsWeb);
    return;
  }

  const url =
    Platform.OS === "ios"
      ? `maps:0,0?q=${label}@${salao.latitude},${salao.longitude}`
      : `geo:${salao.latitude},${salao.longitude}?q=${salao.latitude},${salao.longitude}(${label})`;
  Linking.openURL(url).catch(() => {
    Linking.openURL(urlGoogleMapsWeb);
  });
}
