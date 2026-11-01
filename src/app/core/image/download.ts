import { PACKAGED } from '../platform/platform';
import { saveAs } from 'file-saver';
import { saveNativeBlob } from './native-save';

/**
 * Single download path for the whole app.
 *
 * No navegador, dispara o download via `file-saver` (criando um `<a download>`).
 * No Android empacotado (Capacitor), o WebView ignora cliques em tags <a> com
 * URLs do tipo `blob:` em silêncio. `saveNativeBlob` encaminha os bytes para o
 * plugin nativo `NadaSaiSave`, gravando na pasta pública Downloads via MediaStore
 * (Android 10+) ou permissão de armazenamento (Android 9 e anteriores).
 */
export function saveBlob(blob: Blob, filename: string): void {
  if (PACKAGED) {
    saveNativeBlob(blob, filename).then((saved) => {
      if (!saved) {
        saveAs(blob, filename);
      }
    }).catch(() => {
      saveAs(blob, filename);
    });
  } else {
    saveAs(blob, filename);
  }
}
