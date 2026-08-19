import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AppError, type ErrorCode } from '../errors';
import { assertUsableAudio } from '../audio/audio-file.util';
import { kindOf, type FileKind } from '../files/kind';
import { assertUsableImage, suffixedName } from '../image/image-file.util';
import { MAX_PDF_BYTES } from '../pdf/pdfjs';
import { assertUsableVideo } from '../video/video-file.util';
import { toolById, type ToolId } from '../tools/tools';

export interface WorkSession {
  readonly file: File;
  /** What the working file IS, which is what decides who can take it next. */
  readonly kind: FileKind;
  /** The name the user originally uploaded. Keeps chained filenames from stacking prefixes. */
  readonly originalName: string;
  /** Tools applied so far, in order. Drives the provenance breadcrumb. */
  readonly history: readonly ToolId[];
  /**
   * The working file as it was *before* each entry in `history`, same order and
   * length — `past[i]` is what the chain looked like before `history[i]` ran, and
   * `past[0]` is therefore always the untouched upload.
   *
   * This exists because apply() used to drop the previous file on the floor, so
   * a crop you regretted three tools later was simply gone: the only way back was
   * Start over and re-upload. Keeping the Files costs little — a Blob is backed by
   * disk, not heap, and a chain is a handful of steps — and it is what makes undo
   * possible at all.
   */
  readonly past: readonly File[];
  /**
   * Onde o arquivo ENTROU na sessão — a ferramenta em que ele foi solto.
   *
   * `history` diz o que já foi aplicado, e na maior parte do tempo o último passo
   * dela é a resposta para "de onde eu vim". Mas num upload que ainda não rodou
   * nada `history` está vazia, e sem isto clicar no arquivo na home não teria
   * para onde voltar justamente no momento em que a pessoa acabou de sair da
   * ferramenta onde o largou. Null quando o arquivo entrou sem ferramenta (o
   * gravador de tela, que chama `load` sem id).
   */
  readonly openedIn: ToolId | null;

  /**
   * The password of the PDF in the session, once a tool has asked for it.
   *
   * It lives here and not in each component because it is a property of the
   * DOCUMENT, not of the tool looking at it. Without this, merging → compressing →
   * protecting a protected file asked for the same password three times, and the
   * chain was the thing that made that possible in the first place.
   */
  readonly pdfPassword: string | null;
}

/**
 * The single hand-off point between tools, for the whole product.
 *
 * It replaced `ImageStateService` and `AudioStateService`, which were the same
 * service twice with a different `assertUsable*` in the middle — and, more to the
 * point, two sessions that could not see each other. That is why a PDF built out
 * of photos, or an audio track pulled out of a video, hit a download button and
 * stopped: the file was in the wrong session to continue.
 *
 * **The type guard moved, and got stronger.** The old services refused anything
 * that was not their kind at the door (`apply()` threw on a PDF, which is what
 * stopped the converter pushing one into the image chain). Here the session holds
 * whatever kind you put in it, and the refusal happens where the file is picked
 * UP: `fileFor(tool)` hands the session over only when the tool's `accepts` list
 * covers the session's kind. Crop still cannot receive a PDF — and now img-to-pdf
 * can hand its output to the PDF module, which the old guard made impossible.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly _session = signal<WorkSession | null>(null);

  readonly session = this._session.asReadonly();
  readonly currentFile = computed(() => this._session()?.file ?? null);
  readonly kind = computed(() => this._session()?.kind ?? null);
  readonly history = computed(() => this._session()?.history ?? []);
  readonly pdfPassword = computed(() => this._session()?.pdfPassword ?? null);

  /** The tool that undo() would take back, or null when there is nothing to undo. */
  readonly undoableTool = computed(() => this._session()?.history.at(-1) ?? null);

  /**
   * A ferramenta em que a pessoa mexeu no arquivo por último.
   *
   * É o último passo do histórico e, num arquivo recém-carregado que ainda não
   * rodou nada, a ferramenta onde ele entrou. Serve para o clique no nome do
   * arquivo devolver a pessoa ao lugar de onde ela saiu: sem isto, sair de uma
   * ferramenta para a home era um caminho de mão única — o arquivo continuava
   * ali na barra, e voltar significava caçar a ferramenta na grade de novo.
   */
  readonly lastTool = computed<ToolId | null>(
    () => this._session()?.history.at(-1) ?? this._session()?.openedIn ?? null,
  );

  /**
   * The session file, but only for a tool that can actually open it.
   *
   * This is the hydration door, and every tool must come through it rather than
   * reading `currentFile()` directly — otherwise a tool picks up whatever the
   * previous one happened to leave behind, which is the exact bug the old
   * per-kind services existed to prevent.
   */
  fileFor(toolId: ToolId): File | null {
    const session = this._session();
    if (!session) return null;

    const { accepts } = toolById(toolId);
    return accepts.includes(session.kind) || accepts.includes('any') ? session.file : null;
  }

  /** Whether a tool could open what is currently in the session. */
  accepts(toolId: ToolId): boolean {
    return this.fileFor(toolId) !== null;
  }

  /**
   * Starts a fresh session from a user upload. Throws AppError if unusable.
   *
   * `forTool` é quem está recebendo o arquivo, e passá-lo é o que devolve a
   * mensagem de erro. Desde que a sessão aceita qualquer tipo, um .txt solto no
   * cortar-imagem entraria feliz e a ferramenta simplesmente voltaria a mostrar
   * o dropzone, sem dizer nada — que é pior do que a recusa que havia antes.
   * Com o id, a recusa acontece na porta e vira `error.unsupported_file`.
   */
  load(file: File, forTool?: ToolId): void {
    const kind = assertUsable(file, forTool);
    this._session.set({
      file,
      kind,
      originalName: file.name,
      history: [],
      past: [],
      openedIn: forTool ?? null,
      pdfPassword: null,
    });
  }

  /** Records a tool's output as the new working file. Throws AppError if unusable. */
  apply(tool: ToolId, blob: Blob, suffix: string, ext: string): void {
    const current = this._session();
    const originalName = current?.originalName ?? `file.${ext}`;
    const file = new File([blob], suffixedName(originalName, suffix, ext), { type: blob.type });

    const kind = assertUsable(file);

    this._session.set({
      file,
      kind,
      originalName,
      history: [...(current?.history ?? []), tool],
      // Only push a previous file when there was one. Applying a tool with no
      // session (possible: apply() tolerates it and invents originalName) must
      // not push an entry that has no matching history slot.
      past: current ? [...current.past, current.file] : [],
      openedIn: current?.openedIn ?? null,
      // A password belongs to the document that carried it. The moment a tool
      // rewrites the file, whatever comes out is a different document — and every
      // writer in this app writes an UNprotected PDF unless it is protect-pdf.
      pdfPassword: null,
    });
  }

  /** Remembers the password a tool just used, so the rest of the chain does not ask again. */
  setPdfPassword(password: string | null): void {
    const current = this._session();
    if (!current) return;
    this._session.set({ ...current, pdfPassword: password });
  }

  /**
   * Steps back one tool, restoring the file exactly as it was before it ran.
   *
   * Restores bytes, not a re-run: `past` holds the real File, so undoing a crop
   * cannot re-encode or re-compress anything. Undoing to `past[0]` hands back the
   * original upload untouched.
   *
   * No-op with nothing to undo, so callers do not have to guard.
   */
  undo(): void {
    const current = this._session();
    const file = current?.past.at(-1);
    if (!current || !file) return;

    this._session.set({
      file,
      // Re-derived rather than remembered: undoing past img-to-pdf takes the
      // session from a PDF back to an image, and a stale `kind` would then offer
      // that image to the PDF tools.
      kind: kindOf(file) ?? current.kind,
      originalName: current.originalName,
      history: current.history.slice(0, -1),
      past: current.past.slice(0, -1),
      openedIn: current.openedIn,
      pdfPassword: null,
    });
  }

  clear(): void {
    this._session.set(null);
  }
}

/**
 * Liga uma ferramenta à sessão: chama `onFile` na abertura e sempre que o arquivo
 * que ELA consegue abrir mudar de verdade.
 *
 * É um `effect` e não uma leitura no construtor porque o construtor roda uma vez
 * e a sessão muda depois dele — no desfazer, que é o caso que importa. Antes, a
 * barra de arquivo desfazia e navegava para a home só para forçar a ferramenta a
 * ser reconstruída com o arquivo restaurado; ou seja, desfazer um corte te
 * expulsava da ferramenta em que você estava. Reagindo aqui, o Ctrl+Z troca a
 * imagem embaixo do editor e a pessoa continua onde estava.
 *
 * A comparação é por identidade de `File`, não por conteúdo: aplicar um resultado
 * cria um `File` novo, desfazer devolve o objeto exato que estava em `past`. E o
 * callback roda em `untracked` porque ele lê meia dúzia de signals da própria
 * ferramenta — rastreá-los faria o efeito depender do que ele mesmo escreve, que
 * é o laço infinito que `file-bar.component.ts` já documenta na miniatura.
 *
 * Deve ser chamado de um contexto de injeção (campo ou construtor do componente).
 */
export function hydrateFromWorkspace(
  toolId: ToolId,
  onFile: (file: File | null) => void,
): void {
  const workspace = inject(WorkspaceService);
  let hydrated: File | null | undefined = undefined;

  effect(() => {
    const file = workspace.fileFor(toolId);
    if (file === hydrated) return;
    hydrated = file;
    untracked(() => onFile(file));
  });
}

/**
 * The per-kind ceilings, kept exactly where they already were.
 *
 * Each module's limit protects something different — pixels, decoded PCM seconds,
 * pdf.js's own working set — so this dispatches to the existing validators rather
 * than inventing one number for all of them. An unrecognised file is
 * `unsupported_file`, the same code the image path has always thrown.
 */
function assertUsable(file: File, forTool?: ToolId): FileKind {
  const kind = kindOf(file);

  if (forTool) {
    const { accepts } = toolById(forTool);
    if (!accepts.includes(kind) && !accepts.includes('any')) throw new AppError(rejectionFor(accepts));
  }

  switch (kind) {
    case 'image':
      assertUsableImage(file);
      return kind;
    case 'audio':
      assertUsableAudio(file);
      return kind;
    case 'video':
      assertUsableVideo(file);
      return kind;
    case 'pdf':
      if (file.size > MAX_PDF_BYTES) throw new AppError('pdf_too_large');
      return kind;
    // Sem teto próprio: quem recebe um binário é encrypt-file ou file-hash, e
    // as duas já têm o seu (`crypto_too_large`, `hash_too_large`) medido contra
    // o que elas realmente fazem com os bytes.
    case 'svg':
    case 'text':
    case 'docx':
    case 'zip':
    case 'binary':
      return kind;
    default:
      throw new AppError('unsupported_file');
  }
}

/**
 * A recusa tem que falar do que a ferramenta ABRE, não do que o arquivo é.
 *
 * `unsupported_file` diz "não é uma imagem suportada, use PNG, JPEG, WebP…":
 * foi escrito quando o módulo de imagem era o único com sessão, e a guarda de
 * tipo morava no `apply()` dele. Ao subir para cá ela passou a atender os cinco
 * módulos com aquela mesma frase — soltar um .txt em "Comprimir PDF" respondia
 * mandando usar PNG, que é pior do que não explicar nada.
 *
 * Todo `accepts` do produto tem exatamente um tipo (ou `'any'`, que nunca chega
 * aqui porque aceita tudo, ou `[]`, que é a gravação de tela e não recebe
 * arquivo), então o mapa é direto. `unsupported_file` fica como padrão porque
 * imagem é o único tipo restante que hoje alcança esta linha.
 */
function rejectionFor(accepts: readonly FileKind[]): ErrorCode {
  if (accepts.includes('pdf')) return 'pdf_unsupported';
  if (accepts.includes('audio')) return 'audio_unsupported';
  if (accepts.includes('video')) return 'video_unsupported';
  return 'unsupported_file';
}

/** Re-exported so components can catch the same type the service throws. */
export { AppError };
