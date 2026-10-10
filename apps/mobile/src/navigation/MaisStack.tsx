import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PagamentoAssinatura, PeriodicidadeAssinatura } from "@salao-saas/shared";
import { MaisScreen } from "../screens/salao/MaisScreen";
import { ServicosScreen } from "../screens/salao/ServicosScreen";
import { PacotesScreen } from "../screens/salao/PacotesScreen";
import { PacotesMensaisScreen } from "../screens/salao/PacotesMensaisScreen";
import { EquipeScreen } from "../screens/salao/EquipeScreen";
import { FuncionarioHorariosScreen } from "../screens/salao/FuncionarioHorariosScreen";
import { AssinaturaScreen } from "../screens/salao/AssinaturaScreen";
import { AssinaturaPagamentoScreen } from "../screens/salao/AssinaturaPagamentoScreen";
import { AssinaturaPagamentoPendenteScreen } from "../screens/salao/AssinaturaPagamentoPendenteScreen";
import { LocalizacaoScreen } from "../screens/salao/LocalizacaoScreen";
import { LogoScreen } from "../screens/salao/LogoScreen";
import { ConectarMercadoPagoScreen } from "../screens/salao/ConectarMercadoPagoScreen";
import { EditarPerfilScreen } from "../screens/salao/EditarPerfilScreen";
import { QrCodeScreen } from "../screens/salao/QrCodeScreen";
import { SuporteScreen } from "../screens/shared/SuporteScreen";
import { FuncionarioHorariosScreen as MeusHorariosScreen } from "../screens/funcionario/HorariosScreen";
import { FuncionarioFinanceiroScreen as MeuFinanceiroScreen } from "../screens/funcionario/FinanceiroScreen";
import { SobreScreen } from "../screens/shared/SobreScreen";
import { darkStackScreenOptions } from "./stackHeaderOptions";

export type MaisStackParamList = {
  Mais: undefined;
  Servicos: undefined;
  Pacotes: undefined;
  PacotesMensais: undefined;
  Equipe: undefined;
  // Edição pelo dono do salão dos horários/folgas de um funcionário
  // específico da equipe (ver FuncionarioHorariosScreen).
  FuncionarioHorarios: { funcionarioId: string; nome: string };
  Assinatura: undefined;
  // "Cartão" na tela de Assinatura — tokeniza e cobra a mensalidade/anuidade
  // do SaaS na hora (ver AssinaturaPagamentoScreen), sem sair do app. Pix vai
  // direto pra AssinaturaPagamentoPendente.
  AssinaturaPagamento: { planoId: string; nomePlano: string; periodicidade: PeriodicidadeAssinatura; valorCentavos: number };
  AssinaturaPagamentoPendente: { pagamento: PagamentoAssinatura };
  Localizacao: undefined;
  Logo: undefined;
  MercadoPago: undefined;
  EditarPerfil: undefined;
  // Cartaz com QR Code pra imprimir e deixar no salão (ver QrCodeScreen).
  QrCode: undefined;
  Suporte: undefined;
  Sobre: undefined;
  // Dono que também atende (ver useProfissionalDono).
  MeusHorarios: undefined;
  MeuFinanceiro: undefined;
};

const Stack = createNativeStackNavigator<MaisStackParamList>();

export function MaisStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ ...darkStackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Mais" component={MaisScreen} />
      <Stack.Screen name="Servicos" component={ServicosScreen} options={{ headerShown: true, title: "Serviços" }} />
      <Stack.Screen name="Pacotes" component={PacotesScreen} options={{ headerShown: true, title: "Pacotes" }} />
      <Stack.Screen
        name="PacotesMensais"
        component={PacotesMensaisScreen}
        options={{ headerShown: true, title: "Pacotes mensais" }}
      />
      <Stack.Screen name="Equipe" component={EquipeScreen} options={{ headerShown: true, title: "Equipe" }} />
      <Stack.Screen
        name="FuncionarioHorarios"
        component={FuncionarioHorariosScreen}
        options={{ headerShown: true, title: "Horários" }}
      />
      <Stack.Screen name="Assinatura" component={AssinaturaScreen} options={{ headerShown: true, title: "Assinatura" }} />
      <Stack.Screen
        name="AssinaturaPagamento"
        component={AssinaturaPagamentoScreen}
        options={{ headerShown: true, title: "Pagamento" }}
      />
      <Stack.Screen
        name="AssinaturaPagamentoPendente"
        component={AssinaturaPagamentoPendenteScreen}
        options={{ headerShown: true, title: "Pagamento", gestureEnabled: false }}
      />
      <Stack.Screen name="Localizacao" component={LocalizacaoScreen} options={{ headerShown: true, title: "Localização" }} />
      <Stack.Screen name="Logo" component={LogoScreen} options={{ headerShown: true, title: "Logo do salão" }} />
      <Stack.Screen name="MercadoPago" component={ConectarMercadoPagoScreen} options={{ headerShown: true, title: "Mercado Pago" }} />
      <Stack.Screen name="EditarPerfil" component={EditarPerfilScreen} options={{ headerShown: true, title: "Editar perfil" }} />
      <Stack.Screen name="QrCode" component={QrCodeScreen} options={{ headerShown: true, title: "QR Code para imprimir" }} />
      <Stack.Screen name="Suporte" component={SuporteScreen} options={{ headerShown: true, title: "Suporte" }} />
      <Stack.Screen name="MeusHorarios" component={MeusHorariosScreen} options={{ headerShown: true, title: "Meus horários" }} />
      <Stack.Screen name="MeuFinanceiro" component={MeuFinanceiroScreen} options={{ headerShown: true, title: "Meu financeiro" }} />
      <Stack.Screen name="Sobre" component={SobreScreen} options={{ headerShown: true, title: "Sobre" }} />
    </Stack.Navigator>
  );
}
