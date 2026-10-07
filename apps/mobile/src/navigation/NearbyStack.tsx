import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { NearbyScreen } from "../screens/cliente/NearbyScreen";
import { SalaoDetailScreen } from "../screens/cliente/SalaoDetailScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type NearbyStackParamList = {
  Nearby: undefined;
  SalaoDetail: { salaoId: string; nome: string };
};

const Stack = createNativeStackNavigator<NearbyStackParamList>();

// Pilha da aba "Perto de você": lista de salões próximos (por GPS) que
// empilha o detalhe/avaliação de um salão por cima.
export function NearbyStackNavigator() {
  return (
    <Stack.Navigator screenOptions={darkStackScreenOptions}>
      <Stack.Screen name="Nearby" component={NearbyScreen} options={{ title: "Perto de você" }} />
      <Stack.Screen
        name="SalaoDetail"
        component={SalaoDetailScreen}
        options={({ route }) => ({ title: route.params.nome })}
      />
    </Stack.Navigator>
  );
}
