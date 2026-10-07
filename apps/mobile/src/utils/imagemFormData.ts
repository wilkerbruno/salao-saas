import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

// Anexa a imagem escolhida pelo ImagePicker num FormData de um jeito que
// funciona tanto no nativo quanto na versão Web do app (Expo Web) — usado em
// RegistrarSalaoScreen (logo no cadastro) e LogoScreen (Mais > Logo).
//
// No nativo, o React Native sabe transformar o objeto {uri, name, type} num
// arquivo de verdade na hora de montar o multipart/form-data — é por isso que
// esse formato "estranho" funciona lá. No navegador isso não existe: o
// `fetch`/`axios` do navegador precisa de um `File`/`Blob` de verdade, e o
// `uri` que o ImagePicker devolve na Web (um `blob:`) não serve sozinho pra
// isso. Por sorte a própria lib já devolve o `File` pronto em `asset.file`
// nesse caso (campo documentado como "web-only" no expo-image-picker) — é só
// usar ele em vez do objeto {uri, name, type} quando disponível.
export function anexarImagemAoFormData(formData: FormData, campo: string, asset: ImagePicker.ImagePickerAsset): void {
  if (Platform.OS === "web" && asset.file) {
    formData.append(campo, asset.file, asset.fileName ?? "imagem.jpg");
    return;
  }
  formData.append(campo, {
    uri: asset.uri,
    name: asset.fileName ?? "imagem.jpg",
    type: asset.mimeType ?? "image/jpeg",
  } as unknown as Blob);
}
