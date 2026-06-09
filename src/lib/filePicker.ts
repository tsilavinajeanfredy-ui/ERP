/**
 * filePicker.ts
 * Abstraction cross-platform pour la sélection de fichiers.
 *
 * Sur web : utilise <input type="file"> natif du navigateur.
 * Sur mobile : utilise expo-document-picker (import dynamique pour éviter
 *              le bundling du module natif sur web/Vercel).
 */
import { Platform } from 'react-native';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  /** Objet File natif — disponible uniquement sur web */
  file?: File;
}

/**
 * Ouvre le sélecteur de fichiers.
 * @param accept  - MIME types séparés par virgule (ex: 'image/*') ou tableau
 * @param multiple - Autoriser la sélection multiple (web uniquement)
 */
export async function pickDocument(
  accept: string | string[] = '*/*',
  multiple = false
): Promise<PickedFile | null> {
  const acceptStr = Array.isArray(accept) ? accept.join(',') : accept;

  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = acceptStr;
      input.multiple = multiple;
      input.style.display = 'none';

      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        const uri = URL.createObjectURL(file);
        resolve({
          uri,
          name: file.name,
          mimeType: file.type || undefined,
          size: file.size,
          file,
        });
        document.body.removeChild(input);
      };

      input.oncancel = () => {
        resolve(null);
        document.body.removeChild(input);
      };

      document.body.appendChild(input);
      input.click();
    });
  }

  // Import dynamique — ne pas bundler expo-document-picker sur web
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: Array.isArray(accept) ? accept : [accept],
    copyToCacheDirectory: true,
    multiple,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType || undefined,
    size: asset.size,
  };
}

/**
 * Variante spécialisée pour les CSV/Excel.
 */
export async function pickSpreadsheet(): Promise<PickedFile | null> {
  return pickDocument([
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/comma-separated-values',
  ]);
}

/**
 * Variante spécialisée pour les images.
 */
export async function pickImage(): Promise<PickedFile | null> {
  return pickDocument('image/*');
}

/**
 * Variante spécialisée pour les documents PDF + images.
 */
export async function pickPdfOrImage(): Promise<PickedFile | null> {
  return pickDocument(['application/pdf', 'image/*']);
}

/**
 * Télécharge/partage un fichier.
 * Sur web : déclenche un téléchargement direct via <a>.
 * Sur mobile : utilise expo-file-system + expo-sharing.
 */
export async function downloadOrShareFile(
  url: string,
  fileName: string
): Promise<void> {
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  const FileSystem = await import('expo-file-system');
  const Sharing    = await import('expo-sharing');
  const localUri   = (FileSystem.documentDirectory ?? '') + fileName;
  const { uri: downloadedUri } = await FileSystem.downloadAsync(url, localUri);
  await Sharing.shareAsync(downloadedUri);
}
