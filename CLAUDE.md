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

npm run e2e               # Playwright, HEADED — drives all five tools in a real window
npm run e2e -- 04-convert # one spec file
npm run e2e:ui            # interactive runner
```

**The background-removal model is fetched at install/build time, not committed.** `scripts/fetch-model.mjs` runs on `postinstall` and `prebuild`; it downloads the 42 MB int8 IS-Net once into `public/model/`, sliced into ~22 MiB parts + a manifest, and is a no-op once the parts are on disk. So `npm ci && npm run build` on a fresh box produces a complete deploy — but if `public/model/` is empty and you skip install, the remove-bg tool 404s on its weights. Do **not** commit these files or swap the source to an RMBG/BRIA checkpoint (non-commercial licence only — see `fetch-model.mjs`).

**Hosting requires COOP/COEP headers.** Remove-bg runs multithreaded WASM, which needs `SharedArrayBuffer`, which needs `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`. `ng serve` sends them (`angular.json` serve `headers`) and so does the e2e preview server; a static host that omits them silently drops inference to single-threaded (~6× slower), not broken. Anything you embed cross-origin must then be CORP-compatible.

**Every runtime asset is self-hosted, and that is not optional.** `require-corp` blocks cross-origin subresources without CORP, so a library that fetches its own worker/wasm/weights from a CDN does not degrade — it fails outright. It also contradicts the footer's privacy claim, which is why `@imgly/background-removal` was dropped. Three libraries default to a CDN and are pinned to same-origin paths instead, all resolved from `document.baseURI` (never relative — routes are `/pt/…` and `/en/…`, so a relative path lands in the SPA fallback and comes back as `index.html`, which the browser then rejects on MIME):

| asset | served from | copied by |
|---|---|---|
| `ort/` — onnxruntime wasm | `node_modules` | `angular.json` assets |
| `pdfjs/pdf.worker.min.mjs` | `node_modules` | `angular.json` assets |
| `pdfjs/{wasm,iccs,standard_fonts,cmaps}/` | `node_modules` | `angular.json` assets |
| `tesseract/` — OCR worker + core wasm | `node_modules` | `angular.json` assets |
| `model/` — IS-Net weights (42 MB) | download | `scripts/fetch-model.mjs` |
| `tessdata/` — por+eng traineddata (~4 MB) | download | `scripts/fetch-tessdata.mjs` |

Both fetch scripts run on `postinstall` and `prebuild` and no-op once the files exist. Neither directory is committed. The OCR core variants are the `-lstm` ones specifically, because `OcrService` builds its worker with OEM 1 (`LSTM_ONLY`); changing the OEM means copying the Legacy variants too, or the core 404s.

**OCR renders the page at 3×, and the scale is not cosmetic.** `OCR_RENDER_SCALE` in `pdf.component.ts` feeds Tesseract ~216 DPI. It used to be `1` — justified by a comment claiming the bboxes had to map 1:1 onto the displayed page, which is false: `OcrService` normalises every bbox by `canvas.width/height`, so any scale maps identically. What `1` actually did was hand Tesseract an A4 at 72 DPI, well under the ~150 it needs, and a starved Tesseract returns bad *geometry*, not just bad characters. On a photographed form the dense page came back with a median word bbox of 27px where the glyphs were ~8px — 3× inflated — and since `getBaseFontSize()` derives the font body from bbox height, those blocks rendered 3× too large. The sparse page of the same file, easier to segment, measured correctly. Raising the scale fixed the sizing *and* the reading (`24/08/1830` → `24/08/1930`). If OCR sizing ever looks wrong again, check the input resolution before touching the font maths.

`OcrService` still clamps two things as defence in depth, and both earn their place — the max block is exactly at the cap on real documents. `clampOutlierHeights` bounds box geometry; `assignFontSizes` bounds the rendered font at 1.8× the page median. The clamp is on the **font size**, not the bbox: capping only `h` leaves the multiplier spread (1.92/1.06 = 1.8×) to still produce 3.25× on screen. A rejected alternative is recorded in that function — taking the *line* median instead of the per-word estimate is intuitive and measurably worse, because on a noisy scan the line median inherits the bad tokens and propagates them to the good words.

**pdf.js needs `Promise.try` to forward its extra arguments, and zone.js is why it isn't there.** Angular loads zone.js, which replaces the global `Promise` with `ZoneAwarePromise` — a reimplementation that does not carry `Promise.try`. So the polyfill in `core/pdf/promise-try.ts` is required even on a browser that ships `Promise.try` natively. What matters is not that it exists but that it forwards `...args`: pdf.js's `MessageHandler` dispatches every worker action as `Promise.try(action, data.data, streamSink)`, and an arity-1 polyfill satisfies `typeof` while calling each action with nothing. The failure then surfaces three hops away — the action destructures `undefined`, pdf.js wraps it as `UnknownErrorException`, and the console shows `getOperatorList - ignoring XObject` once per image. Because each image is registered as a *dependency* of the operator list and that dependency never resolves, **`page.render()` stays pending forever**: the canvas is left half-painted (pdf.js paints in chunks), no error is ever thrown, and the editor's overlay stays in its "canvas failed" branch, drawing black text on top of the canvas text. There were once two copies of this polyfill, in `main.ts` and in `pdfjs.ts`, both arity-1; fixing the second changed nothing, because the first runs at bootstrap and the other's `typeof` guard then found the broken one already installed. One implementation, imported by both. `promise-try.spec.ts` asserts the forwarding, not the existence.

**`tesseract.js` is CommonJS and must be imported through its default export.** Vite (dev) synthesises named exports from CJS; esbuild (prod) emits `export default` alone. So `const { createWorker } = await import('tesseract.js')` works under `ng serve` and yields `undefined` in a production build — surfacing as a minified `"e is not a function"` nowhere near the cause. `loadCreateWorker()` in `ocr.service.ts` reads the default with a fallback. Any other CJS dependency imported lazily has the same trap.

E2E lives in `e2e/`. It uploads a real image, runs each tool and asserts on the actual `download` event (the suggested filename is what proves both the encode and the naming rules). `e2e/fixtures/generate.ts` synthesises the fixtures at startup — a hand-rolled PNG encoder, so no binaries in the repo. **The grain in that PNG is load-bearing**: a flat synthetic image compresses smaller as lossless PNG than as lossy WebP, so `compress` legitimately produces a bigger file and the savings badge never renders. Playwright runs **two** web servers: `ng serve` on 4200 for most specs, and a real production build behind a static preview server on 4300 for `09-offline` — `ng serve` never emits `ngsw-worker.js`, so the offline/service-worker assertions need the actual build artifact.

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

`app-action-bar` takes a **nullable `primaryLabel`**, and every tool passes null once pressing the button could only reproduce the result already on screen. Each computes this as a `stale` signal: the settings its `run()` actually reads, versus the ones the current result was made with (`ranQuality`, `ranSettings`, `ranBox`, …). A primary button that recomputes identical bytes reads as "it didn't work" — on remove-bg it re-ran seconds of inference to land back where you started. Note the mirror-image bug this replaced: the templates once hid the button behind `*ngIf="!result()"`, so changing a quality or format meant re-uploading. The label must come back the instant a setting changes. Remove-bg is the tool to think about here — `run()` reads *nothing* but the file, and the backdrop is composited at export, so its button is simply gone once a cutout exists.

Register the tool once in `core/tools/tools.ts`; the nav, the home grid and the filename suffix all read from there.

**`img-to-pdf` is the one tool that does not live on the chain, and that is not an oversight.** `ImageStateService` holds exactly one file per session — that is what makes the other tools chainable — and a reorderable page list is not a chain, so the list is local component state. It still *reads* the chain on construction (a crop flows into page one) and it never calls `apply()`, because a PDF is terminal for the same reason `TERMINAL_FORMATS` blocks convert. Consequences worth knowing: `<app-tool-page>` gets `[forceLoaded]` because its default `loaded` watches the chain, which is empty here; the output filename comes off **page one**, not `originalName`; and `stale` has to include the page order, or dragging page 3 to the front would leave the stale PDF downloadable. `app-dropzone` grew `multiple` + `filesSelected` for it — emitted *alongside* `fileSelected`, never instead of it, so the five single-file tools are untouched.

`encodePdfFromImages` in `core/image/converters.ts` backs it, and `encodePdf` is now a one-line wrapper over it. Two things there are load-bearing: the loop is **sequential** (mapping it through `Promise.all` holds every decoded canvas at once — thirty 12 MP photos is gigabytes of RGBA), and `maxLongSide` caps the raster for the multi-image path only. Without the cap a batch of phone photos builds a 50 MB PDF at 2-3 MB per page; single-image convert passes no cap, because there the user asked for that one image at full resolution.

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

### Background removal (`background-removal.service.ts`)

Unlike the other tools, this doesn't route through `core/image/` — it's a self-contained service, and the file's header comment is the real spec (read it before touching this). Four things carry the design:

- **Two paths, chosen by the input.** `isFlatGraphic()` measures the image; a photo goes to the IS-Net model (`removeWithModel`), a logo/icon/flat graphic goes to a border-sampled chroma key (`removeFlatBackground`). The AI is the *worst* tool for flat art (out-of-distribution → speckle) and the key is the worst tool for hair, so neither is a fallback for the other — the routing thresholds (`FLAT_DOMINANCE`, `FLAT_BORDER_SHARE`) are tuned against real assets.
- **`onnxruntime-web` is imported dynamically and must stay that way** — megabytes of WASM glue that would otherwise land in the initial bundle for someone who only came to crop.
- **The service is stateless (`providedIn: 'root'` but holds no UI signals).** Per-run state lives in the component so Angular destroys it on navigation; it once was a root singleton and that caused stale results and a second concurrent model run fighting the first for the same progress signal. Keep progress/isProcessing in the component.
- **The tool auto-runs, and the chain's history is the guard.** Choosing remove-bg with a file already loaded is as explicit as dropping one, so the component runs on construction — the extra click meant nothing. It runs *unless* `history` already contains `remove-bg`, which is simultaneously the "don't chew on your own transparent output" case and the "don't re-run every time they navigate back" case. That guard is the only thing standing between this and an unconditional auto-run, which is what it was before and why it was turned off.
- **Retouch (`cutout-brush.component.ts`) needs no mask.** The cutout is already a PNG with alpha, so erase is `destination-out` and restore is a stroke whose `strokeStyle` is a `CanvasPattern` of the original — a pattern is anchored at the canvas origin, so it paints back exactly the pixels that were at those coordinates. Strokes are stored as points and undo replays from the pristine cutout: an ImageData snapshot per stroke is ~48 MB on a 12 MP photo. The canvas is always at natural resolution; brush size is in CSS pixels and mapped, so the brush is the size it looks.
- **The engine choice is a licence decision, not just a technical one.** It replaced `@imgly/background-removal` (AGPL-3.0 wrapper — copyleft that reaches a product sold B2B/on-prem, and it fetched weights from a third-party CDN at runtime, defeating the privacy claim). The IS-Net *model* was never the problem (Apache-2.0); only the wrapper was. Don't reintroduce an AGPL or phone-home dependency here.

### Errors

Every failure path maps through `core/errors.ts` → `toMessageKey(err)` → an `errorKey` signal → `<app-alert>`. A bare `console.error` with no user-visible feedback is a regression — that was the app's single most common defect.

### i18n

Hand-rolled, not `@angular/localize`. `TranslationService` derives `TranslationKey` from the EN dictionary and types PT as a total `Record` over it, so **a missing key is a compile error**. (The compress button once rendered with no label at all because its key simply didn't exist.) Templates read `i18n.t()['some.key']` — bracket access is mandatory under `noPropertyAccessFromIndexSignature`. A spec asserts key parity between languages.

## Design system

`src/styles.css` is the whole thing — there is no `tailwind.config.js`. It resets Tailwind's stock scales (`--color-*: initial`, `--radius-*`, `--text-*`, `--font-weight-*`, `--shadow-*`) and redefines only what the product uses. **`bg-teal-600`, `font-black`, `rounded-3xl`, `text-6xl` and `shadow-xl` therefore generate no CSS at all.** That is deliberate: the previous design read as machine-generated, and this makes the old look unreachable rather than merely discouraged.

The palette is Tailwind's **slate** ramp with a **blue** accent, on **Inter** (self-hosted via `@fontsource/inter` — a webfont CDN would be a network request on every load, which contradicts the footer's privacy claim and breaks the app offline).

Rules the tokens enforce:

- Headings cap at 28px; font weights cap at 600.
- Containers are separated by `border border-line` (1px), not shadows.
- Numbers (sizes, dimensions, percentages) use `font-mono tabular`.
- Radii: 6px controls, 8px panels, 10px the preview stage.

Four things about the colour tokens are load-bearing:

- **`accent` and `accent-fill` are different jobs.** `accent` is the foreground blue (links, active tool, focus rings) and *lightens* in dark mode to stay legible on slate. `accent-fill` is the solid blue behind white text (primary button) and stays saturated in both themes. Using `bg-accent` as a fill turns the button pastel in dark mode.
- **Dark mode lifts its surfaces** (rail `slate-950` → base `slate-900` → panel `slate-800` → input `slate-700`). Depth comes from the steps *between* surfaces, not from pushing everything toward black — that was the "escuro demais" complaint.
- **The rail flips with the theme**, so anything rendered on it must use the `rail-*` tokens (`text-rail-muted`, `bg-rail-hover`, …), never `text-white/50`. Literal white on the light rail is invisible. `<app-segmented onRail>` exists for this.
- **The image stage (`bg-stage`) stays dark in both themes** — a light surround visibly skews how you judge an image's brightness. But it is only for surfaces that actually *contain the image*: the empty dropzone is themed, because a black slab on a light page is just a black slab.

Icons go in `shared/ui/icon/icons.ts` and render via `<app-icon>`; inline `<svg>` in a template is not the pattern.

## Conventions

- Angular 19 control flow (`@if` / `@for`) — `*ngIf`/`*ngFor`/`ngClass` are gone and should stay gone.
- Signal-based inputs (`input()`, `output()`, `model()`), `ChangeDetectionStrategy.OnPush`, `inject()`.
- TypeScript `strict` with `strictTemplates`.
- Production budget errors at 1 MB initial (currently ~304 kB). Heavy deps must stay in lazy chunks.
- UI copy is in the dictionary in both PT and EN; comments and commit messages are mixed PT/EN.
