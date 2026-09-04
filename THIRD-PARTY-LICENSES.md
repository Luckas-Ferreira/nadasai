# Licenças de terceiros

Nada Sai é distribuído sob a **AGPL-3.0** (veja `LICENSE`). Este arquivo lista o
que vai junto no produto entregue e sob que termos, que é a atribuição que
MIT, Apache-2.0, OFL-1.1 e LGPL-3.0 exigem — e é também o que preenche a tela de
"licenças de código aberto" da ficha da Play Store.

Só entram aqui as dependências que **chegam ao usuário**. O ferramental de build
e de teste (Angular CLI, Playwright, Karma, Tailwind) não é redistribuído e por
isso não aparece.

## Dependências de execução (npm)

| Pacote | Versão | Licença |
|---|---|---|
| `@angular/common` | 19.2.25 | MIT |
| `@angular/compiler` | 19.2.25 | MIT |
| `@angular/core` | 19.2.25 | MIT |
| `@angular/forms` | 19.2.25 | MIT |
| `@angular/platform-browser` | 19.2.25 | MIT |
| `@angular/platform-browser-dynamic` | 19.2.25 | MIT |
| `@angular/platform-server` | 19.2.25 | MIT |
| `@angular/router` | 19.2.25 | MIT |
| `@angular/service-worker` | 19.2.25 | MIT |
| `@angular/ssr` | 19.2.27 | MIT |
| `@breezystack/lamejs` | 1.2.7 | LGPL-3.0 |
| `@fontsource/nunito` | 5.2.7 | OFL-1.1 |
| `cropperjs` | 1.6.2 | MIT |
| `docx` | 9.7.1 | MIT |
| `fflate` | 0.8.3 | MIT |
| `file-saver` | 2.0.5 | MIT |
| `jspdf` | 4.2.1 | MIT |
| `onnxruntime-web` | 1.27.0 | MIT |
| `pdf-lib` | 1.17.1 | MIT |
| `pdfjs-dist` | 6.1.200 | Apache-2.0 |
| `rxjs` | 7.8.2 | Apache-2.0 |
| `tesseract.js` | 7.0.0 | Apache-2.0 |
| `tslib` | 2.8.1 | 0BSD |
| `zone.js` | 0.15.1 | MIT |
## Bibliotecas nativas do app Android

| Biblioteca | Versão | Licença |
|---|---|---|
| `com.microsoft.onnxruntime:onnxruntime-android` | 1.29.0 | MIT |
| `@capacitor/android` (Capacitor) | ver `package.json` | MIT |
| `androidx.appcompat:appcompat` | 1.7.1 | Apache-2.0 |
| `androidx.coordinatorlayout:coordinatorlayout` | 1.3.0 | Apache-2.0 |
| `androidx.core:core-splashscreen` | 1.2.0 | Apache-2.0 |

## Modelos baixados em tempo de instalação

Nenhum dos dois é versionado neste repositório; `scripts/fetch-model.mjs` e
`scripts/fetch-tessdata.mjs` os buscam no `postinstall` e no `prebuild`.

| Modelo | Origem | Licença |
|---|---|---|
| IS-Net (`isnet-general-use`, int8) | Qin et al., ECCV 2022 — [github.com/xuebinqin/DIS](https://github.com/xuebinqin/DIS) | Apache-2.0 |
| Tesseract `por` + `eng` (tessdata_best) | [github.com/tesseract-ocr/tessdata_best](https://github.com/tesseract-ocr/tessdata_best) | Apache-2.0 |

**A licença do modelo é uma decisão, não um acaso.** Os checkpoints RMBG (BRIA)
são os mais fáceis de achar prontos e são licenciados **apenas para uso não
comercial**; o cabeçalho de `scripts/fetch-model.mjs` registra isso. Trocar o
IS-Net por um deles inviabiliza qualquer versão paga do produto.

## A exceção que merece atenção: `@breezystack/lamejs`

É a única dependência **copyleft** do produto — LGPL-3.0, o codificador de MP3,
alcançado por `src/app/features/convert-audio/services/audio-converter.service.ts`.

Ele entra por importação estática, ou seja, é empacotado dentro do chunk da
ferramenta, o que forma uma "obra combinada" no sentido do § 4 da LGPL-3.0. Sob
a AGPL-3.0 isso **não custa nada**: o § 4 pede que o usuário consiga religar o
programa com uma versão modificada da biblioteca, e um repositório de fonte
aberta satisfaz esse requisito por construção.

A restrição só aparece numa eventual **versão fechada e paga**. Nesse cenário o
lamejs teria de ser carregado como arquivo separado — que é literalmente o que o
`LICENSE` dele orienta ("Link to LAME as separate jar") — além da atribuição ao
projeto LAME. Registrado aqui porque é o tipo de detalhe que só se descobre
tarde: este projeto já recusou `@imgly/background-removal` (AGPL) e
`ffmpeg.wasm` (GPL) por essa mesma conta, e o lamejs é o caso mais brando dos
três, não a ausência do problema.

## Fonte

**Nunito**, sob a SIL Open Font License 1.1, auto-hospedada via
`@fontsource/nunito`. A OFL permite o empacotamento e a venda do software que
usa a fonte; o que ela proíbe é vender a fonte isoladamente e reusar o Reserved
Font Name numa versão modificada.
