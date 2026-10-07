import { Platform } from "react-native";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

// Auto-atualização do .apk (versão nativa), SEM depender da loja.
//
// Isso é diferente do expo-updates (ver App.tsx): aquele só troca o
// JS/telas do app já instalado. Esse arquivo aqui troca o PRÓPRIO
// instalador quando a mudança exige algo nativo (nova lib, nova permissão,
// etc) — é o caso desta própria leva, que adiciona expo-file-system e
// expo-intent-launcher.
//
// Como funciona: a cada deploy de um .apk novo, alguém (nós) atualiza
// apps/landing/public/downloads/versao.json com o versionCode do build que
// acabou de subir. O app compara esse número com o que está instalado
// (Application.nativeBuildVersion) e, se o do site for maior, baixa o novo
// .apk sozinho (sem abrir navegador nem precisar visitar o site) e manda o
// Android abrir a tela de instalação assim que termina.
//
// Limite real do Android (não é algo que dá pra contornar com código): o
// toque final em "Instalar" na tela do sistema é sempre do usuário — nenhum
// app comum (fora Play Store/MDM/root) pode instalar sozinho sem essa
// confirmação, por segurança do próprio Android. O que dá pra automatizar
// (e isso aqui faz) é tudo o resto: checar, baixar e já deixar a tela de
// instalação aberta, sem precisar ir ao site nem abrir o arquivo manualmente.
// Isso deixa de ser necessário completamente quando o app for publicado na
// Play Store (aí a atualização do APK também passa a ser automática de
// verdade, incluindo a instalação).

const URL_VERSAO = "https://bellaone.store/downloads/versao.json";

interface VersaoRemota {
  versionCode: number;
  apkUrl: string;
}

export type ResultadoAtualizacaoApk =
  | { status: "nao-aplicavel" }
  | { status: "sem-novidade" }
  | { status: "baixando" }
  | { status: "instalando" }
  | { status: "erro"; motivo: string };

export async function verificarEAtualizarApk(
  aoProgredir?: (fracao: number) => void
): Promise<ResultadoAtualizacaoApk> {
  if (Platform.OS !== "android") {
    // iOS não instala .apk, e a versão Web não tem "instalador" nenhum —
    // os dois continuam só no fluxo normal de JS (expo-updates / rebuild).
    return { status: "nao-aplicavel" };
  }

  let remota: VersaoRemota;
  try {
    const resposta = await fetch(URL_VERSAO, { cache: "no-store" as any });
    if (!resposta.ok) return { status: "erro", motivo: `HTTP ${resposta.status}` };
    remota = await resposta.json();
  } catch (e: any) {
    return { status: "erro", motivo: e?.message ?? "Sem conexão" };
  }

  const versaoInstalada = Number(Application.nativeBuildVersion ?? 0);
  if (!remota?.versionCode || !remota?.apkUrl || remota.versionCode <= versaoInstalada) {
    return { status: "sem-novidade" };
  }

  try {
    const destino = FileSystem.cacheDirectory + "bellaone-atualizacao.apk";

    const download = FileSystem.createDownloadResumable(remota.apkUrl, destino, {}, (p) => {
      if (aoProgredir && p.totalBytesExpectedToWrite > 0) {
        aoProgredir(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    });

    const resultado = await download.downloadAsync();
    if (!resultado?.uri) return { status: "erro", motivo: "Falha ao baixar o APK" };

    const uriConteudo = await FileSystem.getContentUriAsync(resultado.uri);
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: uriConteudo,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION — deixa o instalador do Android ler o arquivo baixado
      type: "application/vnd.android.package-archive",
    });

    return { status: "instalando" };
  } catch (e: any) {
    return { status: "erro", motivo: e?.message ?? "Falha ao instalar" };
  }
}
