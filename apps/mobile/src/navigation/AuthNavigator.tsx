import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegistrarClienteScreen } from "../screens/auth/RegistrarClienteScreen";
import { RegistrarSalaoScreen } from "../screens/auth/RegistrarSalaoScreen";
import { EsqueciSenhaScreen } from "../screens/auth/EsqueciSenhaScreen";
import { ValidarCodigoRecuperacaoScreen } from "../screens/auth/ValidarCodigoRecuperacaoScreen";
import { NovaSenhaScreen } from "../screens/auth/NovaSenhaScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type AuthStackParamList = {
  Login: undefined;
  RegistrarCliente: undefined;
  RegistrarSalao: undefined;
  // Fluxo "esqueci minha senha" (ver EsqueciSenhaScreen/
  // ValidarCodigoRecuperacaoScreen/NovaSenhaScreen) — 3 passos em sequência,
  // cada um passando adiante só o que o próximo precisa.
  EsqueciSenha: { email?: string } | undefined;
  ValidarCodigoRecuperacao: { email: string };
  NovaSenha: { resetToken: string };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

// Pilha exibida enquanto ninguém está logado (ver RootNavigator).
export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="RegistrarCliente" component={RegistrarClienteScreen} options={{ headerShown: true, title: "Criar conta" }} />
      <Stack.Screen
        name="RegistrarSalao"
        component={RegistrarSalaoScreen}
        options={{ headerShown: true, title: "Cadastrar salão" }}
      />
      <Stack.Screen
        name="EsqueciSenha"
        component={EsqueciSenhaScreen}
        options={{ headerShown: true, title: "Esqueci minha senha" }}
      />
      <Stack.Screen
        name="ValidarCodigoRecuperacao"
        component={ValidarCodigoRecuperacaoScreen}
        options={{ headerShown: true, title: "Verificar código" }}
      />
      <Stack.Screen
        name="NovaSenha"
        component={NovaSenhaScreen}
        options={{ headerShown: true, title: "Nova senha", gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
