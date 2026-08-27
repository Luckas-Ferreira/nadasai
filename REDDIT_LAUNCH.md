# Reddit Launch Kit — Nada Sai

Perfil completo, o portão de karma que derruba a maioria das contas novas, e nove posts
escritos para colar. Todo número aqui foi conferido no repositório — nada de afirmação
que a copy não consiga sustentar num comentário hostil.

| | |
|---|---|
| **57** | ferramentas em 6 módulos — imagem 11, PDF 15, privacidade 11, áudio 9, vídeo 8, office 3 |
| **0** | permissões de rede no APK. O manifesto mesclado não tem `android.permission.INTERNET` |
| **privado** | o repositório é fechado e sem licença — a copy assume isso em vez de desviar |

> **Cole no modo Markdown do editor do Reddit**, não no editor visual — ele come os `**`
> e transforma listas em coisas estranhas. O botão fica no canto inferior direito da
> caixa de texto.

---

## 1. A conta

Uma decisão antes dos campos: **não crie `u/nadasai`**. Handle que é só a marca é lido
como conta corporativa pelo AutoModerator e pelos moderadores humanos, e é removido em
quase todos os subs desta lista. O que passa em todo lugar é um handle que soa como *a
pessoa que fez a coisa*. Você continua tendo uma conta dedicada ao produto — ela só não
se apresenta como departamento de marketing.

### Username — não pode ser mudado depois (3–20 caracteres)

Pegue uma e **não crie segunda conta** para os subs em português: duas contas suas
votando ou comentando no mesmo assunto é *ban evasion* aos olhos do sistema antifraude,
mesmo sem intenção.

```
nadasai_dev
```

```
luckas_nadasai
```

```
nadasai_builder
```

### Display name — máx. 30, usa 25

O nome do produto já diz a tese quando traduzido, então a tradução é o subtítulo. Serve
nas duas línguas.

```
Nada Sai — nothing leaves
```

### Bio (About) — máx. 200, usa 184

Termina na permissão do Android de propósito: é a única frase do texto que ninguém
consegue contestar, e é a que faz o cético clicar.

```
I build Nada Sai: 57 file tools — PDF, image, audio, video — that run entirely in your browser. No upload, no account, works offline. The Android app ships with no INTERNET permission.
```

Versão em português, caso decida que a conta é primariamente BR (190 caracteres):

```
Faço o Nada Sai: 57 ferramentas de arquivo — PDF, imagem, áudio, vídeo — que rodam inteiras no navegador. Sem upload, sem conta, funciona offline. O app Android não pede permissão de internet.
```

### Avatar — 256×256 PNG

Use o ícone que o `npm run og` já gera para a PWA. Não invente um avatar novo: quem vir
seu comentário em r/webdev e depois abrir o site precisa reconhecer a mesma marca. Não
use foto sua nem o avatar padrão do Reddit — perfil sem avatar é sinal de spam para
automod.

### Banner — 1920×384 PNG

Não faça um banner de marca. Faça **uma captura da barra do topo do site com o medidor de
rede em zero**, ampliada, com o resto do site desfocado atrás. É a prova, no formato de
banner, e é a única imagem que trabalha a seu favor quando alguém abre seu perfil
desconfiando de você.

### Social links — até 5 slots

Rótulo personalizado em cada um. Ordem importa: o primeiro é o que aparece colapsado no
mobile.

```
Nada Sai        → https://nadasai.com
Como funciona   → https://nadasai.com/en/about
Privacidade     → https://nadasai.com/pt/privacidade
Product Hunt    → (link da sua página lá)
Google Play     → (quando a ficha estiver no ar)
```

### Ajustes a marcar antes do primeiro post

- **Verifique o e-mail.** Conta sem e-mail verificado é filtrada por automod em vários
  dos subs abaixo, silenciosamente — o post aparece para você e para mais ninguém.
- **Ative o perfil público** e o *Allow people to follow you*.
- **Preencha tudo antes de postar.** Perfil vazio na hora do primeiro link é o padrão
  exato de uma conta descartável.
- **Não** ative NSFW, e não desative o histórico público de posts — perfil opaco é motivo
  de remoção manual.

---

## 2. O portão

Esta é a parte que quase todo mundo pula, e é por isso que quase todo lançamento no
Reddit desaparece sem um voto. Vários dos subs da lista exigem idade mínima de conta e
karma mínimo, os limites não são publicados, e a remoção é *silenciosa*: você vê seu post
normalmente, deslogado ele não existe.

> ⚠️ **Postar link na primeira semana queima a conta.** Não é só o post que cai. Conta
> nova cujo primeiro ato é link do próprio domínio entra em filtros de spam que valem
> para o Reddit inteiro, e aí os posts seguintes caem em subs que nem teriam reclamado.
> Se isso acontecer, não adianta criar outra conta — **o domínio é que fica marcado**.

**Alvo antes do primeiro link: 30 dias de conta e ~200 de karma de comentário.** Não é
regra oficial, é o patamar que passa confortavelmente na maioria dos filtros. Dá para
chegar lá com dez comentários por semana durante um mês.

### Onde ganhar isso honestamente

Você tem vantagem real aqui: quase ninguém no Reddit sabe as coisas que você sabe.
Responda perguntas onde a sua experiência é rara e específica.

- **r/webdev, r/javascript** — COOP/COEP e `SharedArrayBuffer`, por que uma lib que busca
  o próprio worker num CDN quebra sob `require-corp`, CSP na prática.
- **r/angular** — zoneless, prerender que quebra por código que só falha no Node,
  `OnPush` com signals.
- **r/pdf, r/datacurator** — pdf.js vs pdf-lib, por que tarja preta sobre texto não é
  censura, por que comprimir PDF destrói texto vetorial.
- **r/brdev** — qualquer coisa, em português, sobre Angular e sobre publicar produto
  sozinho.

### A regra durante o aquecimento

**Zero links para nadasai.com nesses comentários. Nenhum.** Responda a pergunta e pare.
Quem se interessar clica no seu perfil — que é justamente por isso que ele precisa estar
pronto antes. Um link do próprio produto dentro de uma resposta técnica é a forma mais
rápida de virar "aquele cara que só aparece para divulgar".

---

## 3. Calendário

Um post por semana, um sub por vez, **nunca o mesmo texto em dois lugares**. O Reddit
detecta texto repetido entre subs e trata como spam — é por isso que os nove posts abaixo
são nove textos diferentes, e não um traduzido.

| Quando | Sub | Por que aí | Risco |
|---|---|---|---|
| Semana 0–4 | — | Aquecimento. Só comentários, nenhum link. | nulo |
| Semana 5 | **r/SideProject** | O sub feito para isso. Serve de histórico para os próximos. | baixo |
| Semana 6 | **r/InternetIsBeautiful** | Maior alcance da lista para site grátis. Vale o risco. | médio |
| Semana 7 (sábado) | **r/webdev** | Autopromoção só no Showoff Saturday. Público que entende a dificuldade. | baixo |
| Semana 8 | **r/androidapps** | **Segure até a ficha da Play estar no ar.** É o post mais forte que você tem. | médio |
| Semana 9 | **r/degoogle** | Substitui serviço em nuvem por local — a tese exata do sub. | médio |
| Semana 10 | **r/privacy** | Maior retorno e maior risco. Só depois de ter histórico. | alto |
| Semana 11 | **r/brdev** | Em português. Público que indica ferramenta para os outros. | baixo |
| Semana 12 | **r/pdf** | Pequeno, mas é intenção de busca pura. | baixo |
| Qualquer hora | **r/angular** | Post técnico, produto de passagem. É o "9" da regra 9:1. | nulo |

**Horário:** terça a quinta, entre 9h e 11h da manhã no horário do leste dos EUA
(10h–12h em Brasília), para os subs em inglês. Sábado de manhã para o r/webdev. Para o
r/brdev, noite de terça a quinta no horário de Brasília.

---

## 4. Os posts

### 01 · r/SideProject

`inglês` · `semana 5` · `risco baixo`

Post de texto com o link no corpo, não link post. Aqui ninguém se incomoda com
autopromoção — o sub existe para isso — então este é o lugar de estabelecer histórico
antes dos subs difíceis.

**Título**

```
I built 57 file tools that run entirely in the browser. The Android build ships with no INTERNET permission.
```

**Corpo**

```
Every "compress a PDF" site works the same way: you upload your file to someone's server, they process it, you download it back. For a meme that's fine. For a signed contract, a payslip or a medical report, it's a stranger's hard drive.

Nada Sai (Portuguese for "nothing leaves") does those same jobs with nothing leaving the machine. 57 tools across PDF, image, audio, video and privacy — merge, split, compress, sign, OCR, background removal, redaction, encryption. All of it is WebAssembly and Canvas running in your tab.

Three things make that checkable instead of just claimed:

1. **There is no backend.** The build output is static files. There is no server for your file to arrive at.
2. **The CSP is `connect-src 'self' data: blob:`.** If a dependency ever tried to phone home, the browser blocks it before it happens — I don't have to be the one who notices.
3. **There's a live counter in the top bar of every page**, wrapping fetch/XHR/sendBeacon/WebSocket and counting bytes of file data leaving the tab. It's a reading, not a graphic. It sits at zero.

The Android build goes one further: it doesn't declare `android.permission.INTERNET`. Everything ships inside the APK — the PDF engine, the OCR data, the 42 MB background-removal model — and the OS refuses the app a socket. It's the one version of the promise I can't break by accident.

Free, no signup, no file size limit, works offline after the first load. Portuguese and English.

https://nadasai.com

Happy to answer anything about the browser-side parts. The PDF pipeline and getting OCR to produce usable geometry were the two that took real work.
```

---

### 02 · r/InternetIsBeautiful

`inglês` · `semana 6` · `risco médio`

**Link post**, não post de texto — o sub é sobre o site, e o corpo vai como primeiro
comentário seu. O título precisa descrever o site, não anunciar você. Texto curto: lá,
parede de texto afunda.

**Título** (o link é nadasai.com)

```
A file toolbox that uploads nothing — it shows a live counter of the bytes leaving your browser, and it stays at zero
```

**Primeiro comentário, postado por você logo depois**

```
57 tools for PDF, images, audio and video — merge, compress, convert, OCR, background removal, redaction, encryption — all running in the tab. No account, no upload, no file size limit, and it keeps working with the wifi off.

I built it because every free PDF site is quietly someone else's server, and people paste genuinely private documents into them.

The part I like best is the meter in the top bar. It wraps fetch, XHR, sendBeacon and WebSocket and counts bytes of file data actually leaving the page. It's instrumentation, not a badge — and you don't have to take its word for it either, you can open DevTools and watch the network tab do nothing while a 50 MB PDF gets compressed.

Disclosure: I made it. Free, nothing to sign up for, no ads.
```

---

### 03 · r/webdev

`inglês` · **só sábado** · `risco baixo`

r/webdev só permite mostrar projeto próprio no **Showoff Saturday**. Em qualquer outro
dia é removido na hora. Aqui a copy é técnica: esse público não se impressiona com
contagem de ferramentas, se impressiona com restrição resolvida.

**Título**

```
[Showoff Saturday] 57 file tools with no backend — zoneless Angular, 78 prerendered routes, and a CSP that makes uploading impossible
```

**Corpo**

```
nadasai.com — PDF, image, audio, video and privacy tools that run entirely client-side. Angular 19 + Tailwind 4, deployed as static files. No server, no accounts, no analytics.

Things that might actually interest this sub:

**The CSP is the product.** `connect-src 'self' data: blob:`. The privacy claim isn't a footer promise, it's a directive the browser enforces — a dependency that ships telemetry cannot exfiltrate anything, because the connection never opens. There's also a service wrapping fetch/XHR/sendBeacon/WebSocket that counts *file* egress specifically, displayed live in the top bar. Counting all outbound bytes was the first attempt and it was wrong in both directions — a corporate TLS-intercepting AV injects a script that POSTs its own telemetry, which had my product accusing itself on its own home page.

**Everything is self-hosted, and it wasn't optional.** Background removal needs multithreaded WASM → `SharedArrayBuffer` → COOP/COEP → and `require-corp` blocks any cross-origin subresource without CORP. So a library that fetches its own worker or wasm from a CDN doesn't gracefully degrade, it fails outright. onnxruntime, pdf.js, Tesseract and a 42 MB ONNX model all come off my own origin.

**Zoneless.** Dropped zone.js — every component was already OnPush with signal state, so the prerequisite was paid before the migration started. Home page entry JS went from 34.7 kB gz to 22.1 kB gz. The thing that breaks in zoneless, if anyone's considering it: plain-field state (not signals) written inside a setTimeout, rAF, or a third-party callback. The screen just doesn't update, with no error at all.

**78 routes prerendered**, no SSR and no express, because "there is no backend" should stay literally true. Four classes of browser-only code had to yield first, and they're the shape of what breaks next for anyone doing this: a `localStorage` write in a root service's effect (injected everywhere, so it failed *all* routes); `window` listeners in shell components; a module-scope const calling `document.baseURI`; and a `cancelAnimationFrame` in `ngOnDestroy` — that last one is the nasty one, because the app is destroyed *after* the HTML is written, so it killed the prerender worker and took down every route still queued behind it in cascade. The CLI reports "error occurred while prerendering route X" and discards the exception, so step one was installing an ErrorHandler that actually prints it.

**The 75 MB of engines are installable packages now.** A settings page lists every runtime asset, its real size, and a working uninstall — silently occupying 60 MB in an app whose whole argument is honesty about what happens on your device was the most expensive contradiction left in it.

Happy to go into any of these.
```

---

### 04 · r/androidapps

`inglês` · **só com Play no ar** · `risco médio`

**Este é o post mais forte do kit**, e é o único argumento que nenhum concorrente pode
copiar sem refazer o produto. Segure até a ficha da Play estar publicada: a seção de
permissões da loja é o que torna a afirmação verificável sem instalar nada. Marque a
flair de desenvolvedor.

**Título**

```
[Dev] I made an offline file toolbox — 57 tools, and the app doesn't request the INTERNET permission
```

**Corpo**

```
I make a browser-based file toolbox and just shipped the Android build. The thing I actually want to point at is the manifest.

It doesn't declare `android.permission.INTERNET`.

Not "we don't upload your files." Not a privacy policy. The app has no network permission, so Android refuses it a socket at the OS level. There is no code path — mine, a dependency's, or one injected into it — that can send your document anywhere, and you can confirm that from the permissions section of the Play listing without trusting a word I say.

Everything ships inside the APK: the PDF engine, the Tesseract OCR language data, and the 42 MB model for background removal. Nothing is fetched at runtime. Updates come through the store.

**What's in it — 57 tools:** merge, split, compress, rotate, sign, watermark, unlock and redact PDF; PDF to Word; OCR; background removal; image convert, resize, crop and compress; ID photo sheets; audio cut, convert, normalize and remove-silence; video trim, crop, compress and video-to-GIF; EXIF stripping; AES-GCM file encryption; hashing; QR codes.

Free. No ads, no accounts, no analytics, no in-app purchases.

[link da Play]

**Trade-off worth stating up front:** because there's no network, there is no cloud sync, no backup, and no crash reporting — I genuinely cannot see when it breaks for you. Bug reports have to reach me directly. I think that's the right trade for this particular app, but it is a trade and you should know it before installing.
```

---

### 05 · r/degoogle

`inglês` · `semana 9` · `risco médio`

Aqui o enquadramento é substituição, não lançamento. O sub responde a "troquei X por Y e
aqui está o que perdi", não a "olha meu produto".

**Título**

```
Stopped using Smallpdf/iLovePDF entirely — built the replacement so there's no server in it at all
```

**Corpo**

```
The free file-tool sites are the last thing a lot of otherwise careful people still hand their documents to. You de-Google your mail, your photos and your search, and then you upload a scanned ID to a random PDF compressor because you need it under 2 MB in the next five minutes.

I got annoyed enough to build the replacement. nadasai.com — 57 tools for PDF, image, audio and video, plus encryption, EXIF stripping and redaction. Everything runs in the browser via WebAssembly and Canvas. No account, no upload, no telemetry, and it works offline after the first load because it's a PWA.

Why this isn't just another privacy promise:

- **No backend exists.** The deploy is static files on a CDN. There's no server component for a file to reach.
- **`connect-src 'self' data: blob:`** in the CSP. The browser enforces it, so a dependency with telemetry fails rather than succeeding quietly.
- **A live egress meter** in the top bar, counting file bytes leaving the tab. Or skip it and use DevTools — same answer, and you're not trusting my code to be honest about my code.
- **The Android build declares no `android.permission.INTERNET`.** The OS won't give it a socket.

Being straight about the weaknesses, since this sub will find them anyway: **it's not open source.** It's a commercial product I sell on-prem and I haven't opened the source, so this isn't auditable the way you'd want. What I'd say is that the important claim here is unusually verifiable without source — watch the network tab, or read the Android permission list. And the AI background removal downloads a 42 MB model once, from my own origin, which you can see happen and can delete afterwards from a settings page that lists every runtime asset with its real size.

Free, PT and EN.
```

---

### 06 · r/privacy

`inglês` · `semana 10` · **risco alto**

O sub tem regra contra autopromoção e o repositório fechado é uma fraqueza real ali. A
única copy que sobrevive é a que **abre pela fraqueza** e entrega defeitos que ninguém te
obrigou a contar. Se for removido, não reposte e não discuta com moderador — mande
modmail educado uma vez.

**Título**

```
I built a file toolbox with no backend — and the closed-source problem that comes with it
```

**Corpo**

```
Disclosure first, because in this sub it should come before anything else: I built this, and **it is not open source.**

nadasai.com is 57 file tools — PDF, image, audio, video, plus encryption, EXIF stripping and redaction — that run entirely in the browser. No account, no upload, no server.

I'm posting it here rather than in a launch sub because "we delete your files after one hour" is the standard offer in this category, and I think that's the wrong shape of promise. So the design tries to make the claim checkable by someone who has no reason to trust me:

- **There is no backend.** The deploy is static files. There is nowhere for a file to be sent.
- **CSP: `connect-src 'self' data: blob:`.** Not a policy document — a directive the browser enforces. A dependency shipping telemetry cannot exfiltrate anything. That one isn't hypothetical: a corporate TLS-intercepting AV on my own machine injected a script that POSTed its own telemetry, and my egress meter caught the product appearing to accuse itself on its own home page.
- **A live egress meter** in the top bar of every route, wrapping fetch/XHR/sendBeacon/WebSocket and counting bytes of file data leaving the tab.
- **The Android build declares no `android.permission.INTERNET`.** The kernel refuses it a socket. This is the strongest version of the claim, because it doesn't depend on my code being correct.

**On the closed-source part.** It's a commercial product sold on-prem and I haven't opened the source. I'm not going to argue that's equivalent to auditable, because it isn't. What I will argue is that this is an unusual category where the important claim is verifiable without the source: load a tool, open DevTools, process a 50 MB file, watch the network tab stay empty. Or read the Android permission list. That's weaker than a reproducible build and I know it.

**Two limitations I'd rather state than have discovered:**

The redaction tool offers a black bar and a pixelate/blur mode. **Only the black bar is a guarantee** — pixelation and blur both have published recovery attacks against low-entropy content like an ID number or a date of birth. Black is the default and the panel says this on screen, not just in a comment. For PDFs the redaction rasterises the page, because a rectangle drawn over a text layer leaves the text in the file, which is how "redacted" documents leak. The cost is that the document loses its text layer, and the panel says that too.

The file encryption is AES-GCM with PBKDF2 at 100,000 iterations. **Current OWASP guidance is 600,000.** The count isn't stored in the envelope header, so raising it would silently make every existing encrypted file undecryptable — doing it properly needs a versioned header that keeps the old reader intact. That's a deliberate separate change rather than something I'll break people's files over, but until it lands, the number is what it is and you should know it.

Free, PT and EN. Happy to take the hard questions.
```

---

### 07 · r/brdev

`português` · `semana 11` · `risco baixo`

Público que indica ferramenta para os outros — e o ângulo LGPD só existe aqui. Não
traduza o post do r/webdev: o Reddit compara texto entre subs.

**Título**

```
Fiz 57 ferramentas de arquivo que rodam 100% no navegador. O app Android não pede permissão de internet.
```

**Corpo**

```
Todo site de "comprimir PDF" funciona igual: você sobe o arquivo pro servidor de alguém, ele processa, você baixa de volta. Pra um meme, tudo bem. Pra um contrato assinado, um holerite ou um laudo médico, é o HD de um estranho — e, se for documento de cliente, é tratamento de dado pessoal por terceiro que ninguém contratou nem avaliou.

Fiz o nadasai.com pra fazer o mesmo trabalho sem nada sair da máquina. 57 ferramentas entre PDF, imagem, áudio, vídeo e privacidade — juntar, dividir, comprimir, assinar, OCR, remover fundo, censurar, criptografar. Tudo em WebAssembly e Canvas dentro da aba.

O que faz isso ser verificável e não só uma frase no rodapé:

- **Não existe backend.** A saída do build são arquivos estáticos. Não tem servidor pro arquivo chegar.
- **A CSP é `connect-src 'self' data: blob:`.** Não é promessa, é diretiva: uma dependência com telemetria não consegue mandar nada, o navegador barra antes. Isso não é hipotético — um antivírus corporativo com interceptação de TLS injetou um script que fazia POST da própria telemetria, e meu medidor pegou o produto se acusando na própria home.
- **Tem um medidor ao vivo** na barra do topo de toda rota, envolvendo fetch/XHR/sendBeacon/WebSocket e contando byte de arquivo que sai da aba. É leitura, não selo.
- **O build Android não declara `android.permission.INTERNET`.** O sistema recusa socket pro app. Essa é a versão da promessa que não depende de o meu código estar certo.

Stack, pra quem se interessa: Angular 19 zoneless (o JS de entrada da home caiu de 34,7 kB gz pra 22,1 kB gz ao tirar o zone.js), Tailwind 4, 78 rotas pré-renderizadas sem SSR e sem express, pdf.js pra ler, pdf-lib pra escrever, Tesseract local pro OCR e um IS-Net em ONNX pra remoção de fundo. Tudo self-hosted por obrigação: remoção de fundo precisa de WASM multithread, que precisa de SharedArrayBuffer, que precisa de COOP/COEP — e sob `require-corp` qualquer lib que busca o próprio worker num CDN não degrada, simplesmente falha.

Grátis, sem cadastro, sem limite de tamanho, funciona offline depois do primeiro acesso. PT e EN.

Aceito porrada no código e nas decisões.
```

---

### 08 · r/pdf

`inglês` · `semana 12` · `risco baixo`

Sub pequeno, mas é intenção de busca pura — quem está lá tem um problema de PDF agora.
Copy específica de PDF, sem o discurso de privacidade em primeiro plano.

**Título**

```
Browser-side PDF tools with no upload — including redaction that actually rasterises instead of drawing a rectangle over the text
```

**Corpo**

```
I built nadasai.com — 15 PDF tools that run in the tab with no upload and no account. pdf.js reads, pdf-lib writes, and the split between them decides what each tool can and can't do, which I think is worth spelling out because most sites hide it:

**Rotate loses nothing.** Rotation is a number inside the file, so pdf-lib just changes it and the text stays text.

**Merge, split, organize, sign, watermark and page numbers lose nothing either** — all page-level pdf-lib operations.

**Compress and protect both rasterise**, because pdf-lib can neither rasterise nor encrypt, so those two go through pdf.js and a re-encode. That destroys vector text, so compress re-draws the old text layer invisibly over the raster to keep Ctrl+F working. The tool says this on screen rather than surprising you.

**Unlock rasterises too**, and for a reason that trips people up: pdf-lib's `ignoreEncryption: true` walks straight past the lock without opening it — the streams stay encrypted, the saved file is unreadable, and nothing throws. So the only honest path is read with pdf.js, rasterise, rebuild, don't call encrypt. Also worth knowing there are two cases, not one: a *user* password stops the file opening, an *owner* password doesn't and only forbids printing and copying. The second is the one that actually shows up, and for it there's no password to type.

**Redaction rasterises on purpose, and that IS the guarantee.** A black rectangle over a text layer leaves the text in the file — that's how redacted documents leak. The whole page loses its text layer, which is a real cost, and the panel says so.

**PDF to Word** reuses the editor's own extraction: native paragraph merging for a digital page, Tesseract for a scanned one. OCR renders at 3× (~216 DPI) because a starved Tesseract returns bad *geometry*, not just bad characters — at 72 DPI a photographed form came back with word boxes 3× inflated, and since font size is derived from box height, the whole document rendered at triple size.

Free, no signup, 100 MB limit per file (memory ceiling, not policy). Works offline after first load.
```

---

### 09 · r/angular

`inglês` · **pode ir antes de tudo** · `risco nulo`

Este não é um post de divulgação, é o "9" da regra 9:1 — conteúdo técnico de verdade,
com o produto aparecendo uma vez e de passagem. Pode publicar durante o aquecimento: é a
forma mais rápida de ganhar karma e credibilidade ao mesmo tempo.

**Título**

```
Going zoneless on a 78-route app: 34.7 → 22.1 kB gz entry, and the four things that only broke during prerender
```

**Corpo**

```
Migrated a fairly large Angular 19 app to `provideExperimentalZonelessChangeDetection()` and prerendered all 78 routes. Notes, in case they save someone a day.

**Zoneless was anticlimactic, because the prerequisite was already paid.** Every component was OnPush with signal state, `NgZone` appeared nowhere, and `fakeAsync`/`tick` appeared in none of the 587 specs. Removing zone.js from the build polyfills dropped the home page entry JS from **34.7 kB gz to 22.1 kB gz**. If you're not already there, the thing that breaks is plain-field state (not signals) written inside `setTimeout`, `requestAnimationFrame` or a third-party callback — the view simply doesn't update, with no error.

Keep zone.js in the *test* polyfills unless you want to add a provider to every spec. That's a separate migration.

**One genuine surprise:** pdf.js needs `Promise.try`, and zone.js was what removed it — `ZoneAwarePromise` doesn't have it. If you polyfill it, the polyfill must forward `...args`, because pdf.js dispatches every worker action as `Promise.try(action, data.data, streamSink)`. An arity-1 polyfill satisfies `typeof` and calls every action with nothing, and the failure surfaces three hops away as `UnknownErrorException`. Worse, the page render promise then never settles, so you get a half-painted canvas and no thrown error at all.

**Prerender is where the real work was.** `ng build` with `prerender: true` runs the app in Node once per route, and four classes of browser-only code failed:

1. A `localStorage` write inside a root service's `effect`. That service was injected almost everywhere, so it failed *every* route at once.
2. `window` keyboard listeners in shell components.
3. A module-scope `const` calling `document.baseURI` — this one threw in `ModuleJob.run`, before any component existed.
4. A `cancelAnimationFrame` in `ngOnDestroy`. This was the nastiest by far: the app is destroyed *after* the HTML is already written, so it killed the prerender worker and cascaded into every route still queued on that worker, including unrelated ones.

The CLI reports only "error occurred while prerendering route X" and discards the exception. **Install an `ErrorHandler` in `app.config.server.ts` that prints it** before you debug any of this, or you're guessing.

**Then the host disagreed about URLs.** Angular's prerender writes `route/index.html`, which a static host only serves at `route/` — so every canonical URL 308'd, and each destination page then declared a canonical pointing back at a redirect. Renaming `route/index.html` → `route.html` in a postbuild script fixed it without touching a single `routerLink`. Worth checking with `maxRedirects: 0`, because following the redirect is exactly what hides the bug — the content at the end of it was always fine.

App is nadasai.com if anyone wants to poke at the output. Happy to answer Angular questions.
```

---

## 5. Respostas prontas

Cinco perguntas vão aparecer em todo post. Responder rápido e sem defensiva é o que decide
se a thread sobe ou apodrece — na prática vale mais que o texto do post. Responda **tudo
nas primeiras três horas**.

### "É open source?"

A pior resposta é desviar. A boa resposta admite e redireciona para o que é verificável.

```
No, and I'd rather say that plainly than dance around it. It's a commercial product I sell on-prem.

What I'd point out is that this is one of the few categories where the claim that matters can be checked without the source: open DevTools, run a 50 MB file through any tool, and watch the network tab stay empty. Or install the Android build and read the permission list — there's no INTERNET permission, so the OS won't give it a socket regardless of what my code says.

That's genuinely weaker than a reproducible build. I'm not claiming otherwise.
```

### "Como você ganha dinheiro?" / "Qual é a pegadinha?"

Se não responder, a plateia preenche o silêncio com "ele vende os dados". Responda antes
disso acontecer.

```
Fair question, and the honest answer matters more than usual here since "free file tool" usually means you're the product.

The public site is free and always will be — there's no ad network, no analytics and no account, partly on principle and partly because a CSP of `connect-src 'self'` makes all three technically impossible without breaking the thing the product is for.

The money is on-prem licensing: companies that handle documents they legally can't upload — law firms, accounting, HR, health — run the same static build inside their own network. That business only exists because the public version is genuinely local, so there's no version of this where quietly monetising your files makes sense for me.
```

### "Como eu sei que não faz upload?"

```
Don't take my word for it, take thirty seconds:

1. Open DevTools → Network, tick "Preserve log".
2. Load a big file into any tool and run it.
3. You'll see the app's own chunks load, and after that nothing. No request carries your file.

If you want it stricter: pull your network cable after the page loads. Everything keeps working — it's a PWA and the engines are cached locally. A tool that needed to upload would stop.

Strictest version: the Android build has no `android.permission.INTERNET` at all, so the OS refuses it a socket. That one doesn't depend on my code being right.
```

### "Isso não é só o Stirling PDF / PDF24 / [x]?"

```
Related, but a different trade.

Stirling PDF is excellent and open source, and it's a server you run — great if you already self-host, a non-starter for someone who needs to fix a PDF on a work laptop in the next five minutes. PDF24 and the rest run the work on their servers; the desktop build is a real alternative but it's an install, and Windows only.

This one has no server anywhere in it, including mine, and needs nothing installed — it's a tab. The trade you make for that is browser memory limits (100 MB per file) and no batch API. If you're already self-hosting Stirling, honestly stay there.
```

### "Por que baixa 42 MB?"

```
That's the background-removal model (IS-Net, int8), and it only downloads if you open that specific tool — everything else works without it. It comes from my own origin, not a third-party CDN, which matters because the whole app runs under `require-corp` and a CDN-fetched model would both fail and contradict the point.

There's a settings page listing every runtime asset with its real size — the model, the ONNX runtime, the PDF engine, the OCR data — with a working uninstall for each. Occupying 60 MB silently in an app whose entire argument is honesty about what happens on your device seemed like the one contradiction I couldn't leave in.
```

---

## 6. Regras de operação

- **Leia as regras da barra lateral antes de cada post.** Elas mudam, e este kit não sabe
  disso. Especialmente r/webdev (só sábado) e r/androidapps (flair obrigatória).
- **Nunca o mesmo texto em dois subs.** É por isso que aqui são nove textos e não um
  traduzido. Reddit compara e trata como spam.
- **Mínimo cinco dias entre posts**, e nunca dois no mesmo dia.
- **Não peça upvote em lugar nenhum** — nem no Twitter, nem em grupo de WhatsApp. Voto
  coordenado detectado derruba a conta e marca o domínio, o que é bem pior que um post
  fraco.
- **Não apague post que foi mal.** Apagar é sinal de conta descartável. Deixa lá; ninguém
  lembra.
- **Não discuta com cético.** Dê o teste do DevTools e siga. Quem lê a thread decide, não
  quem comenta.
- **Responda tudo nas primeiras três horas.** O algoritmo do Reddit pesa velocidade de
  comentário, e é a janela em que o post sobe ou morre.
- **Se um moderador remover, mande modmail uma vez**, curto e educado, e aceite a
  resposta. Repostar depois de remoção é ban.
- **Mantenha a proporção 9:1** — nove comentários úteis para cada post seu. O post do
  r/angular conta como conteúdo, não como divulgação.

### O ativo que falta, e que serve nos nove

Um GIF de 15 segundos: um arquivo grande entrando numa ferramenta, o resultado saindo, e o
medidor de rede em zero o tempo todo, visível. Reddit dá muito mais alcance a post com
mídia do que a post só de texto, e essa é a única imagem que prova a tese sem exigir que
ninguém acredite em você. Vale mais que qualquer parágrafo deste kit.

### Pendência fora do Reddit

A listagem do Product Hunt diz **33 ferramentas** e hoje são **57**. Atualize antes de
mandar tráfego novo para lá.
