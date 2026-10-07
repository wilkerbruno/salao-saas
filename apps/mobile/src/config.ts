// Não usado mais pelo fluxo do cliente: agora ele escolhe o salão na Home
// (lista de salões perto dele) em vez de o app estar fixo numa só — ver
// HomeScreen/SalaoDetailScreen. Mantido por enquanto por segurança, caso
// alguma outra parte do app ainda dependa de um salão "padrão".
export const SALAO_ID = process.env.EXPO_PUBLIC_SALAO_ID ?? "";
