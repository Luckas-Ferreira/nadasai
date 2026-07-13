# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ImgWork is a client-side image toolbox (remove background, crop, compress, convert, resize) built with Angular 19 + Tailwind 4. **There is no backend.** Every operation runs in the browser via WASM/Canvas, and no image ever leaves the user's machine — that privacy claim is in the footer, so keep any new feature client-side.

## Commands

```bash
npm start                 # ng serve → http://localhost:4200
npm run build             # production build → dist/imgwork
npm test                  # Karma + Jasmine in Chrome (watch mode)
npm test -- --watch=false --browsers=ChromeHeadless   # single CI-style run
ng test --include='**/converters.spec.ts'             # run one spec file
```

## Architecture

### The chain (`ImageStateService`)

`core/services/image-state.service.ts` holds one `EditSession { file, originalName, history }` and is the only shared state. It is what makes tools chainable:

1. A tool reads `state.currentFile()` in its constructor to hydrate.
2. After processing, `continueEdit()` calls `state.apply(toolId, blob, suffix, ext)` and routes to `/`.
3. The next tool hydrates from it.

Two invariants live in this service, and both are load-bearing:

- **`load()` and `apply()` reject anything that isn't `image/*`.** This is what stops the converter pushing a PDF into the chain. Tools hydrate without their own type check, so if you bypass this service you reintroduce a real bug.
- **Filenames derive from `originalName`, never from the current file.** `photo.jpg` → `photo-nobg.png` → `photo-crop.png`, not `crop-nobg-photo.jpg`.

### Writing a tool

Do **not** copy an existing component wholesale — the shared kit in `shared/ui/` exists precisely to stop that. A tool is:

```ts
@Component({ providers: [ObjectUrlScope], ... })   // <- component-scoped, not root
```

with `<app-tool-page [toolId]="'x'">` projecting three slots: `[banner]` (errors), `[stage]` (the image), `[panel]` (controls, wrapped in ONE root element — content projection does not reach through an `@if` with multiple root nodes).

Shared pieces: `app-dropzone`, `app-preview-surface`, `app-compare-slider`, `app-segmented`, `app-panel`, `app-action-bar`, `app-alert`, `[appButton]`, `app-icon`.

Register the tool once in `core/tools/tools.ts`; the nav, the home grid and the filename suffix all read from there.

### Object URLs

`ObjectUrlScope` (`core/image/object-url.ts`) must be in every tool's `providers`. Angular destroys it on route leave, which is the entire point — provide it in root and you have recreated the leak it was written to fix. Use `urls.replace(old, blob)` rather than raw `createObjectURL`.

### Image pipeline

All format logic lives in `core/image/` and is unit-tested; components should not touch canvas directly.

- `converters.ts` — `encodeImage`, `resizeImage`, `encodePdf`, `encodeIco`, `compressImage`
- `image-file.util.ts` — `loadImage` (rejects on error), `canvasToBlob` (rejects on null), `drawToCanvas`, `flatten`, `suffixedName`, `formatBytes`, validation
- `download.ts` — `saveBlob` via file-saver

Three constraints worth knowing before you "improve" this:

- **AVIF is not an output format, deliberately.** `canvas.toBlob('image/avif')` is unsupported and, per the HTML spec, *silently falls back to PNG* — it does not throw or return null. The app used to ship PNG bytes in a `.avif` file. AVIF is still accepted as input. Adding real AVIF output needs a WASM encoder.
- **Anything without an alpha channel (JPEG, PDF) must be flattened first**, or transparency serializes as black. `encodeImage`/`encodePdf` already do this; a pixel test guards it.
- **`jspdf` is lazily imported** inside `encodePdf`. It drags in html2canvas (~350 kB); importing it statically put that in the convert chunk for everyone. Keep it dynamic.

### Errors

Every failure path maps through `core/errors.ts` → `toMessageKey(err)` → an `errorKey` signal → `<app-alert>`. A bare `console.error` with no user-visible feedback is a regression — that was the app's single most common defect.

### i18n

Hand-rolled, not `@angular/localize`. `TranslationService` derives `TranslationKey` from the EN dictionary and types PT as a total `Record` over it, so **a missing key is a compile error**. (The compress button once rendered with no label at all because its key simply didn't exist.) Templates read `i18n.t()['some.key']` — bracket access is mandatory under `noPropertyAccessFromIndexSignature`. A spec asserts key parity between languages.

## Design system

`src/styles.css` is the whole thing — there is no `tailwind.config.js`. It resets Tailwind's stock scales (`--color-*: initial`, `--radius-*`, `--text-*`, `--font-weight-*`, `--shadow-*`) and redefines only what the product uses. **`bg-teal-600`, `font-black`, `rounded-3xl`, `text-6xl` and `shadow-xl` therefore generate no CSS at all.** That is deliberate: the previous design read as machine-generated, and this makes the old look unreachable rather than merely discouraged.

Rules the tokens enforce:

- Headings cap at 28px; font weights cap at 600.
- Containers are separated by `border border-line` (1px), not shadows.
- The primary button is `ink-950` (near-black). The accent (`accent-500`) appears **only** on focus rings, active nav, selection, progress and links — never as a large fill or a gradient.
- Numbers (sizes, dimensions, percentages) use `font-mono tabular`.
- Radii: 6px controls, 8px panels, 10px the preview stage.

Icons go in `shared/ui/icon/icons.ts` and render via `<app-icon>`; inline `<svg>` in a template is not the pattern.

## Conventions

- Angular 19 control flow (`@if` / `@for`) — `*ngIf`/`*ngFor`/`ngClass` are gone and should stay gone.
- Signal-based inputs (`input()`, `output()`, `model()`), `ChangeDetectionStrategy.OnPush`, `inject()`.
- TypeScript `strict` with `strictTemplates`.
- Production budget errors at 1 MB initial (currently ~304 kB). Heavy deps must stay in lazy chunks.
- UI copy is in the dictionary in both PT and EN; comments and commit messages are mixed PT/EN.
