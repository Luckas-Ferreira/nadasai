import { PACKAGED } from '../platform/platform';

/**
 * O ATALHO NATIVO DE SALVAMENTO / DOWNLOAD — o terceiro consumidor da costura de plataforma.
 *
 * No WebView do Android, clicar em `<a download href="blob:...">` não dispara download
 * nenhum por padrão: o Chromium WebView ignora navegações e downloads de blob URLs.
 * `file-saver` depende dessa técnica na web, e por isso o botão "Baixar" de todas as 57
 * ferramentas ficava mudo dentro do app empacotado no celular.
 *
 * Este módulo transfere os bytes do JavaScript para o plugin nativo `NadaSaiSave`,
 * que grava o arquivo na pasta Downloads do aparelho via `MediaStore.Downloads` (Android 10+)
 * ou com permissão de armazenamento (Android 9 e anteriores), emitindo um Toast de confirmação.
 *
 * Arquivos até 1 MB vão em uma única chamada IPC. Arquivos maiores são fatiados em blocos
 * de 1 MB (`startSave` -> `appendChunk` -> `finishSave`), garantindo que fotos pesadas,
 * áudios longos ou PDFs de 50 MB nunca estourem a memória heap do processo nem excedam
 * os limites do Binder do Android.
 */

interface NadaSaiSavePlugin {
  saveFile(options: {
    name: string;
    mimeType: string;
    data: string;
    toastMessage?: string;
  }): Promise<{ success: boolean; name?: string; uri?: string; path?: string }>;

  startSave(options: {
    name: string;
    mimeType: string;
  }): Promise<{ id: string }>;

  appendChunk(options: {
    id: string;
    data: string;
  }): Promise<{ success: boolean }>;

  finishSave(options: {
    id: string;
    toastMessage?: string;
  }): Promise<{ success: boolean; name?: string; uri?: string; path?: string }>;

  cancelSave(options: {
    id: string;
  }): Promise<{ cancelled: boolean }>;
}

let bridge: Promise<{ readonly api: NadaSaiSavePlugin }> | undefined;

function registerSave(): Promise<{ readonly api: NadaSaiSavePlugin }> {
  bridge ??= import('@capacitor/core').then(({ registerPlugin }) => ({
    api: registerPlugin<NadaSaiSavePlugin>('NadaSaiSave'),
  }));
  return bridge;
}

const CHUNK_SIZE = 1024 * 1024; // 1 MB

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res ? res.substring(res.indexOf(',') + 1) : '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler blob'));
    reader.readAsDataURL(blob);
  });
}

export async function saveNativeBlob(blob: Blob, filename: string): Promise<boolean> {
  if (!PACKAGED) return false;

  try {
    const { api } = await registerSave();
    const mimeType = blob.type || 'application/octet-stream';

    if (blob.size <= CHUNK_SIZE) {
      const base64 = await blobToBase64(blob);
      const res = await api.saveFile({
        name: filename,
        mimeType,
        data: base64,
      });
      return !!res.success;
    }

    const { id } = await api.startSave({ name: filename, mimeType });
    try {
      for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
        const slice = blob.slice(offset, offset + CHUNK_SIZE);
        const data = await blobToBase64(slice);
        await api.appendChunk({ id, data });
      }
      const res = await api.finishSave({ id });
      return !!res.success;
    } catch (err) {
      void api.cancelSave({ id }).catch(() => {});
      throw err;
    }
  } catch (err) {
    console.error('[native-save] falha ao salvar arquivo no Android:', err);
    return false;
  }
}
