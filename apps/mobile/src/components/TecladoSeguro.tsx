import React, { PropsWithChildren, useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, StyleProp, View, ViewStyle } from "react-native";

// Impede o teclado de tampar o formulário. No Android recente (tela cheia /
// edge-to-edge) a janela NÃO encolhe quando o teclado abre, então o
// KeyboardAvoidingView com "height" não funciona. Aqui medimos quanto do
// container o teclado cobre de fato e damos esse espaço como padding no
// rodapé — assim o ScrollView de dentro encolhe e dá pra rolar até o fim.
// Se o sistema já tiver encolhido a janela, a sobreposição medida é zero e
// nada é somado (sem padding duplicado).
export function TecladoSeguro({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const ref = useRef<View>(null);
  const [padding, setPadding] = useState(0);

  useEffect(() => {
    if (Platform.OS === "ios") return;
    const mostrar = Keyboard.addListener("keyboardDidShow", (e) => {
      const topoTeclado = e.endCoordinates.screenY;
      ref.current?.measureInWindow((_x, y, _w, h) => {
        setPadding(Math.max(0, Math.round(y + h - topoTeclado)));
      });
    });
    const esconder = Keyboard.addListener("keyboardDidHide", () => setPadding(0));
    return () => {
      mostrar.remove();
      esconder.remove();
    };
  }, []);

  if (Platform.OS === "ios") {
    return (
      <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior="padding">
        {children}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View ref={ref} collapsable={false} style={[{ flex: 1, paddingBottom: padding }, style]}>
      {children}
    </View>
  );
}
