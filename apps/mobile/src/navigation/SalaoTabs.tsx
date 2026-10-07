import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SalaoDashboardScreen } from "../screens/salao/DashboardScreen";
import { SalaoAgendaStackNavigator } from "./AgendaStack";
import { SalaoFinanceiroScreen } from "../screens/salao/FinanceiroScreen";
import { MaisStackNavigator } from "./MaisStack";
import { tabBarScreenOptions } from "./tabBarOptions";

const Tab = createBottomTabNavigator();

// Navegação do papel SALAO_ADMIN (dono): Início, Agenda, Financeiro e Mais
// (Mais reúne Serviços/Pacotes, Equipe, Localização e Assinatura do plano).
export function SalaoTabs() {
  return (
    <Tab.Navigator screenOptions={tabBarScreenOptions}>
      <Tab.Screen
        name="Início"
        component={SalaoDashboardScreen}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Agenda"
        component={SalaoAgendaStackNavigator}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Financeiro"
        component={SalaoFinanceiroScreen}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "cash" : "cash-outline"} size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Mais"
        component={MaisStackNavigator}
        options={{ tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "menu" : "menu-outline"} size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}
