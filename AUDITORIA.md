# Auditoria Nada Sai — desempenho, SEO, usabilidade e roadmap

> **Estado em 2026-08-06:** Fase 1 concluída e medida (ver §7). Núcleo do
> vetorizador escrito e testado; falta a camada de UI (ver §8).

---

## 7. Fase 1 — feito e medido

Medido nas mesmas 74 rotas, mesmo perfil (390×844, CPU 4×, 1.6 Mbps / 150 ms).

| Métrica | Antes | Depois | |
|---|---|---|---|
| **CLS máximo** | 0,2126 (reprova) | **0,0487** | −77% ✅ |
| CLS p75 | 0,0017 | 0,0011 | −35% |
| **Long tasks máx** | 3683 ms | **1997 ms** | −46% |
| Long tasks p75 | 2156 ms | 1628 ms | −24% |
| Long tasks p95 | 3233 ms | 1967 ms | −39% |
| LCP p75 | 957 ms | 915 ms | −4% |
| LCP máximo | 1200 ms | 1019 ms | −15% |
| Fontes emitidas | 40 arq / 517 kB | **12 arq / 244 kB** | −53% |
| Prefetch do SW (`assets`) | 0,50 MB | **0,13 MB** | −74% |

Nenhuma página reprova mais em nenhum Core Web Vital. Payload por página
inalterado (mediana 229 kB gz); o CSS encolheu de 13 para 12 kB.

**O que foi feito**

1. **Cards sociais** — `scripts/generate-og-cards.mjs` (`npm run og`) gera 67 PNGs
   1200×630 em `public/og/`: um por ferramenta por língua, dois padrão e o logo
   quadrado. `og:image`/`twitter:image` agora apontam para PNG por página;
   `Organization.logo` virou raster quadrado 512×512.
2. **CLS** — subsets de fonte explícitos (latin + latin-ext), fallback com
   métricas medidas contra a Arial (`size-adjust: 100.49%`), preload dos três
   pesos, e `strong, b` trazido para 600.
3. **Acessibilidade** — skip link (WCAG 2.4.1 A), `aria-label` no `<nav>` do
   rodapé, e os cinco `alt` hardcoded movidos para o dicionário.
4. **`index.html`** — JSON-LD estático reduzido ao que não envelhece.

**Dois defeitos achados durante a execução, não na auditoria inicial**

- **`og:title` e `twitter:title` estavam genéricos nas 72 páginas de ferramenta.**
  `SeoService` lia `data['title']`, mas em `app.routes.ts` o título é propriedade
  de primeiro nível da `Route` — o Angular não a copia para `data`. O `<title>`
  da aba saía certo porque quem o escreve é o `TitleStrategy` embutido, o que
  escondeu o defeito; a `description` escapou por vir de `data`. Corrigido lendo
  `route.snapshot.title`.
- **`font-bold` não gera CSS.** A escala de pesos para em 600, então as 6
  ocorrências de `font-bold` nos templates são classes mortas — renderizam no
  peso herdado. Vale trocar por `font-semibold` ou remover.

---

## 7b. Fase 2 — e três itens do plano que a medição derrubou

**Feito:** `scripts/generate-llms.mjs` (`npm run llms`, e no `prebuild`) passa a
escrever `public/llms.txt` a partir de `TOOLS` + `tool-content.ts`. Era a última
lista mantida à mão ao lado de uma fonte derivável, e tinha envelhecido do jeito
previsto: dizia "31 tools" com 32 no ar e omitia `video-to-audio`.

Os outros dois itens da Fase 2 **não procediam**, e vale registrar por quê — os
três casos nasceram de ler documentação e configuração em vez de medir:

- **`jspdf` estático no protect-pdf.** Já era dinâmico no código. O CLAUDE.md
  ainda descreve o desvio, mas ele foi corrigido — e por um motivo melhor que o
  peso: o módulo do jspdf toca `document` na importação, o que derrubava o
  prerender no Node. A auditoria repetiu o CLAUDE.md sem abrir o arquivo.

- **O `modulepreload` de pdf-lib nas páginas de merge e clean-metadata.** É real
  (204 kB gz de pdf-lib, 125 kB gz de jspdf no protect), mas **não custa nada**.
  Medido, mediana de 3 execuções, mobile 4× / 1.6 Mbps:

  | rota | pré-carrega | LCP | TBT |
  |---|---|---|---|
  | `/pt/pdf/juntar` | pdf-lib, 204 kB | 935 ms | 1405 ms |
  | `/pt/pdf/organizar` | nada | 923 ms | **1440 ms** |
  | `/pt/pdf/proteger` | jspdf, 125 kB | 867 ms | 1203 ms |
  | `/pt/pdf/dividir` | nada | 837 ms | 1133 ms |

  A página que pré-carrega 204 kB tem TBT MENOR que a equivalente que não
  pré-carrega. `modulepreload` baixa e não executa: os bytes chegam em paralelo,
  e nenhum trabalho de main thread é acrescentado. Remover seria trocar um
  benefício (pdf-lib quente quando a pessoa clica) por nada.

- **Adiar `AppUpdateService` / `ModelPrefetchService`.** Os dois já são baratos e
  já adiam por conta própria: o primeiro sai na primeira linha quando não há
  service worker e no resto só assina um observable; o segundo guarda contra
  Node, checa `saveData`/2g/3g e entrega tudo a `requestIdleCallback`. Não há
  trabalho síncrono para adiar.

**Onde o TBT realmente está.** Perfil de CPU da home, 4× throttled, janela de
5,6 s:

```
65,7%  (idle)                    <- esperando rede
18,7%  (program)                 <- PARSE/COMPILE de script
 2,4%  Ye        @polyfills.js   <- zone.js
 1,1%  (anon)    @chunk-Angular
 …nenhuma outra função acima de 0,4%
```

Não existe função quente para otimizar. O bloqueio é o **volume de JavaScript
analisado** — 571 kB brutos de bundle inicial. Isso reordena o plano: adiar
inicializador não move nada, e o que move é reduzir bytes iniciais. Daí o item
9 (zoneless) subir de prioridade: ele tira o zone.js do parse E elimina o
patching global de todo callback assíncrono. O split dos dicionários de i18n
(~43 kB brutos da língua que o visitante não usa) é o segundo, mas é caro:
`t()` é síncrono em ~750 pontos de template.

**Continua no plano, sem alteração:** o conteúdo das páginas de ferramenta, que
segue sendo o item que decide tráfego orgânico.

---

## 8. Vetorizador — estado

**Núcleo pronto e testado** em `src/app/core/vector/`, sem dependência nenhuma,
no mesmo formato de `core/audio/` e `core/crypto/`:

| Arquivo | O quê |
|---|---|
| `color.ts` | sRGB↔CIELAB, ΔE2000, ΔE76 |
| `quantize.ts` | k-means++ em Lab, k automático por ΔE2000, Otsu para o modo traço |
| `segment.ts` | componentes conexos 4-conexos, despeckle que **funde** (nunca apaga) |
| `planar.ts` | **Diferencial 1** — subdivisão planar, aresta compartilhada |
| `fit.ts` | cantos por curvatura, RDP ancorado, Bézier de Schneider com G1 |
| `gradient.ts` | **Diferencial 2** — degradê linear/radial por mínimos quadrados em luz linear |
| `serialize.ts` | SVG com precisão 2, comandos relativos, separadores mínimos |
| `vectorize.ts` | pipeline + 4 modos + `suggestMode()` |

18 testes passando. `planar.spec.ts` prova a propriedade que justifica o módulo:
duas regiões vizinhas referenciam **o mesmo arco**, não duas cópias — um teste
que só conferisse o contorno passaria igual com traçado por região, e a costura
voltaria sem nada ficar vermelho. `vectorize.spec.ts` renderiza o SVG produzido
num canvas e mede a fração de pixel translúcido: **zero**, que é costura zero.

**Entregue por completo.** Além do núcleo: `preprocess.ts` (filtro guiado, O(1)
por pixel via tabela de soma acumulada — bilateral seria O(r²) e custaria
segundos numa foto), `vector.worker.ts` (o raster vai por transferência, não por
cópia: 48 MB não são clonados ida e volta), `features/vectorize/` com serviço
stateless e componente, e o registro nos 5 lugares + `tool-content.ts`. 33
ferramentas, sitemap com 76 URLs.

**Quatro defeitos que só apareceram rodando a ferramenta de verdade**, nenhum
deles visível nos testes unitários iniciais:

1. **Separador mínimo do `d` corrompia o path.** A regra olhava a string
   acumulada em vez do último token, então `17 0 .33` saía `17 0.33` — dois
   números onde havia três, todo o resto do subpath deslocado. O `d` continua
   bem formado e o navegador não reclama. Um disco simples renderizava com
   **28% da área descoberta**. Os testes passavam porque usavam retângulos
   alinhados à grade, onde todo número é inteiro e a regra nunca dispara.
2. **Encadeamento de ciclos por `pop()`.** Num nó onde três regiões se encontram
   saem vários candidatos, e pegar qualquer um emenda o fim de uma fronteira no
   começo de outra. Substituído pela travessia de faces de grafo planar: o
   próximo arco é o primeiro no sentido horário a partir do reverso da chegada.
   Dois testes novos travam a invariante (todo arco de um ciclo deixa a MESMA
   região à esquerda).
3. **Ajuste de Bézier sem limite superior.** O Schneider original protege contra
   alfa pequeno demais e não contra grande demais; num sistema mal condicionado
   a solução ótima punha o ponto de controle a **801 px** numa imagem de 200×150,
   e a curva disparava para fora e voltava. Clamp em 1,5× a corda.
4. **Tolerância abaixo do piso do reticulado.** O preset de logo estava em 0,7 px,
   e o contorno traçado tem escada intrínseca de meio pixel. Resultado: o ajuste
   reproduzia o ruído de amostragem. Medido, mesmo desenho: 0,7 → 936 nós /
   17,7 kB; 1,2 → 112 nós / **3,1 kB**. Presets corrigidos e o slider mantido
   inteiramente acima do piso.

Sobra o **conflation artifact**, que é do renderizador e não do arquivo: numa
borda curva o pixel é coberto parcialmente pelas duas formas e compor 60% sobre
40% dá 76%. Fechado com um contorno sub-pixel da própria cor — que NÃO é a
gambiarra de dilatar, porque a geometria continua exata e compartilhada e tirar
o `stroke` devolve a partição perfeita. Medido depois: pior pixel em 239/255
(94% de cobertura), contra área estruturalmente descoberta antes.

**Falta só:** e2e no `e2e/` (o teste vivo foi feito com um script avulso, não
commitado).

Fora da cadeia do `ImageStateService`, de propósito: a saída é SVG e não
`image/*`, então `apply()` recusa — e corretamente, porque reencodar um vetor por
canvas destrói exatamente o que a ferramenta produziu. Mesmo argumento que já
isola `remove-exif`.

---


Medido em 2026-08-06 contra o build de produção (`npm run build`, 74 rotas
prerenderizadas), commit `1fcd5ce`. Os números aqui são leituras, não estimativas:
onde diz "medido", há um comando que reproduz.

**Metodologia.** Payload por página: soma gzip -9 de todo `.js`/`.css` referenciado
no HTML gerado. Runtime: Playwright/Chromium headless contra
`e2e/preview-server.mjs`, viewport 390×844, CPU 4× throttled, rede 1.6 Mbps /
150 ms RTT, service worker bloqueado (primeira visita), 74 rotas, 4 s de coleta
por página via `PerformanceObserver`.

---

## 0. Veredito

| Eixo | Nota | Resumo |
|---|---|---|
| SEO técnico | **A** | Melhor que a maioria dos sites comerciais. Canonical, hreflang derivado, prerender, sitemap com `lastmod` de git, flatten + `_redirects`. Nada a consertar na fundação. |
| SEO de conteúdo | **D** | 174–270 palavras por página de ferramenta. É o que impede de ranquear, não a técnica. |
| Carregamento (LCP/FCP) | **A** | LCP p75 = 957 ms. O prerender + hidratação está pagando. |
| Interatividade (TBT) | **C−** | 825–1349 ms de main thread bloqueada. Faixa vermelha do Lighthouse. |
| Estabilidade (CLS) | **B / 1 falha** | p75 = 0,0017, mas `/pt/privacidade` = **0,2126** (reprova). Causa única e conhecida. |
| Acessibilidade | **B−** | Sem skip link. `alt` em português em páginas EN. |
| Compartilhamento social | **F** | `og:image` é SVG. **Nenhum** card de compartilhamento renderiza, em nenhuma rede. |

A tese do produto está bem executada. O que trava crescimento não é a engenharia —
é que as páginas são finas demais para competir e que cada link compartilhado
aparece sem imagem.

---

## 1. Desempenho — medido

### 1.1 Core Web Vitals (74 rotas, mobile throttled)

```
LCP          p50  886 ms   p75  957 ms   p95 1098 ms   max 1200 ms   ✅ bom (<2500)
FCP          p50  560 ms   p75  602 ms   p95  851 ms   max 1026 ms   ✅
CLS          p50 0,0007    p75 0,0017                  max 0,2126    ⚠️ 1 reprovação
LongTask ms  p50 1732      p75 2156      p95 3233      max 3683      ❌
```

Nenhuma página sem `<h1>`, nenhuma com `<h1>` duplicado, **zero erros de console em
74 rotas**. Isso é raro e vale registrar.

### 1.2 CLS: a falha é a troca de fonte — causa única, correção padrão

`/pt/privacidade` = 0,2126 (reprova; o limite é 0,1). `/pt/…/gerador-de-senha` =
0,0487, `/pt/faq` = 0,0214. As versões EM INGLÊS das mesmas páginas deslocam
menos (`/en/privacy` = 0,0115) — o que já aponta a causa.

Todos os deslocamentos acontecem entre **1218 ms e 1479 ms**, e mudam altura de
bloco em poucos pixels:

```
/pt/privacidade   shift 0,2027 @ 1358ms
   SECTION.mb-8    y/h [427,218] -> [402,218]     (subiu 25px)
   SECTION.mb-8    y/h [677,168] -> [652,192]     (mudou de altura: 168 -> 192)

/pt/faq           5 shifts entre 1414ms e 1479ms
   DETAILS...      y/h [715,87] -> [725,87]       (a lista inteira empurrada)
```

Altura mudando em passos de ~24 px = uma linha a mais ou a menos. Isso é reflow
por métrica de fonte, não por imagem sem dimensão nem por conteúdo injetado.

Confirmado no CSS publicado:

```
20 × font-display:swap          ← todas as 20 @font-face
 0 × size-adjust / ascent-override / descent-override
 0 × <link rel="preload" as="font">
```

Ou seja: a fonte do sistema pinta primeiro, a Nunito chega em ~1,2 s, e **todo
texto do site refluí**. O português desloca mais que o inglês porque o texto é
mais longo e tem mais chance de mudar a contagem de linhas quando a métrica muda.

**Correção (três linhas de CSS + duas tags):**

1. `<link rel="preload" as="font" type="font/woff2" crossorigin>` para
   `nunito-latin-400` e `nunito-latin-600` no `index.html` e nos 74 HTML gerados
   (um passo no `postbuild`, ao lado do `preload-entry-chunks.mjs` que já faz
   exatamente esse tipo de trabalho). Com COEP `require-corp`, `crossorigin` é
   obrigatório mesmo sendo same-origin.
2. Um `@font-face` de fallback com métricas casadas — `size-adjust`,
   `ascent-override`, `descent-override` calibrados contra a Nunito — e usá-lo
   como próximo da pilha em `--font-sans`. É o que o Next.js faz automaticamente
   e o que zera o reflow: o fallback ocupa exatamente o mesmo espaço.
3. Manter `font-display: swap` (trocar para `optional` zeraria o CLS também, mas
   ao custo de metade dos visitantes nunca ver a Nunito na primeira visita).

Só isso leva o CLS máximo de 0,21 para perto de zero.

### 1.3 TBT: 825–1349 ms bloqueando a main thread

```
/pt                     11 long tasks   TBT ~1349 ms   maior tarefa 554 ms
/pt/…/gerador-de-senha   9 long tasks   TBT ~1235 ms   maior tarefa 483 ms
/pt/privacidade          4 long tasks   TBT ~ 959 ms   maior tarefa 573 ms
```

O Lighthouse considera vermelho acima de 600 ms. É este eixo — e não o LCP — que
segura a nota de Performance, e é ele que vira INP ruim no campo.

As alavancas, em ordem de retorno:

- **Zoneless (`provideExperimentalZonelessChangeDetection`).** O `app.config.ts`
  usa `provideZoneChangeDetection({ eventCoalescing: true })`. O zone.js
  monkey-patcha todo callback assíncrono e dispara detecção de mudança global a
  cada um. O app já é `OnPush` + signals em tudo, que é justamente o pré-requisito
  da migração. Bônus: mata a classe inteira de bug que o
  `core/pdf/promise-try.ts` existe para contornar — o polyfill só é necessário
  porque o zone.js substitui `Promise` por um `ZoneAwarePromise` que não carrega
  `Promise.try`. Sem zone.js, o `Promise` nativo volta e o polyfill vira legado.
  Também tira ~14 kB gz do bundle inicial.
- **Adiar os inicializadores não críticos.** `NetworkProbeService.install()`
  precisa mesmo rodar antes de qualquer código de aplicação — é a razão de ser do
  instrumento. Mas `AppUpdateService.start()` e `ModelPrefetchService.start()`
  rodam como `provideAppInitializer` e competem com a hidratação. Movê-los para
  `afterNextRender` + `requestIdleCallback` tira trabalho da janela onde o TBT é
  contado. (O `ModelPrefetchService` já usa `requestIdleCallback` internamente; é
  o *registro* dele que roda cedo.)
- **Separar os dicionários de i18n.** Detalhado em 1.5.

### 1.4 Payload por página (gzip, como servido)

```
pior:    /pt/privacidade/limpar-metadados-pdf   432 kB   (404 kB JS)
         /pt/pdf/juntar                         425 kB
         /pt/pdf/proteger                       356 kB
mediana: página de ferramenta                   229 kB
melhor:  /pt/sobre                              182 kB
casca:   index.csr.html                         174 kB   ← piso do framework
```

Três coisas explicam os extremos:

- **`chunk-PVBUKQ2Y.js` = pdf-lib + pako, 531 kB cru / 210 kB gz.** Ele é
  `modulepreload` em exatamente 4 páginas: `pdf/juntar` e
  `privacidade/limpar-metadados-pdf` nas duas línguas. Todo `import('pdf-lib')` no
  código-fonte é dinâmico (verificado: zero imports estáticos não-type), então
  isso é o Angular decidindo pré-carregar. Nessas duas páginas o preload **dobra**
  o peso inicial. Vale checar se o ganho (o pdf-lib já quente quando a pessoa
  clica em juntar) compensa competir com a hidratação — nas outras 8 ferramentas
  que usam pdf-lib, ele não é pré-carregado, e a inconsistência sugere que
  ninguém escolheu isso conscientemente.
- **`protect-pdf` importa jspdf estaticamente** — o CLAUDE.md já registra o
  desvio. São 356 kB contra 229 kB de mediana. Tornar dinâmico é uma linha.
- **`chunk-36XA7YBS.js` = Angular core + os DOIS dicionários, 338 kB cru /
  107 kB gz, em todas as 76 páginas.**

### 1.5 Fontes: 76% do que é baixado não é usado

```
enviado          40 arquivos   517 kB
  .woff legado   20 arquivos   290 kB   ← nenhum navegador com service worker precisa
  cyrillic/greek/vietnamese  24 arq  228 kB   ← site é pt-BR + en-US
necessário        8 arquivos   126 kB   (latin + latin-ext, woff2, pesos 400/500/600/700)
```

E o `ngsw-config.json` põe `/media/**` no grupo `assets` com
`installMode: prefetch` — então **o service worker baixa os 40 arquivos, os 517 kB,
inclusive o cirílico**, na instalação. Medido no `ngsw.json` gerado: grupo
`assets` = 42 arquivos, 0,5 MB.

`@fontsource/nunito/400.css` importa todos os subsets. A correção é trocar pelos
arquivos de subset específicos (`@fontsource/nunito/latin-400.css` etc.), o que
resolve os três problemas de uma vez: menos CSS por página, menos prefetch do SW,
e a fonte chega mais cedo (ajudando o CLS de 1.2).

**Total do prefetch do SW na primeira visita: 1,7 MB gz** (app 1,2 MB + assets
0,5 MB). Reduzir para ~1,3 MB só cortando fonte.

### 1.6 O prefetch de 42 MB do modelo

`ModelPrefetchService` pula corretamente em `saveData`, `slow-2g`, `2g` e `3g`.
Mas em 4G ele baixa 42 MB em segundo plano para todo visitante — inclusive quem
entrou para comprimir um PDF e nunca vai usar remoção de fundo. `saveData` é
opt-in e pouca gente liga. Vale considerar disparar só quando a pessoa **visita**
o módulo de imagem, ou expor um controle. É custo de dados de terceiros, e o
produto se vende como respeitoso.

---

## 2. SEO

### 2.1 O que já está certo (não mexer)

Canonical sem barra + `flatten-prerender.mjs` + `_redirects`; hreflang derivado de
`TOOLS` com objeto compartilhado; `alternatesFor()` devolvendo `null` em vez de
inventar URL; JSON-LD puro e testado, sem `aggregateRating`/`review` fabricados;
`FAQPage` emitido só quando há FAQ na tela; sitemap com `lastmod` de git; 74 rotas
prerenderizadas com `<h1>` único. Isso é trabalho de nível alto e a auditoria não
achou defeito nenhum aí.

### 2.2 🔴 `og:image` é SVG — todo compartilhamento está quebrado

`src/index.html:28,38` e `seo.service.ts:112,119` apontam para
`https://nadasai.com/logo_nadasai.svg`.

- **Nenhum crawler social renderiza SVG.** Facebook, X/Twitter, LinkedIn,
  WhatsApp, Slack, Discord, Telegram — todos ignoram. Cada link do site
  compartilhado em qualquer lugar aparece sem imagem.
- O arquivo é **339×339** (verificado no `viewBox`), mas as tags declaram
  `og:image:width=1200` / `height=630`.
- `twitter:card` é `summary_large_image`, que exige imagem grande — sem ela o card
  degrada para nada.
- O mesmo SVG está como `logo` da `Organization` no JSON-LD com 1200×630. O logo
  da Organization deveria ser o logo na proporção real, não um card social.

**Correção:** gerar um PNG 1200×630 e apontar `og:image`/`twitter:image` para ele;
usar um PNG quadrado (≥112 px) para `Organization.logo`; acrescentar
`og:image:type`, `og:image:alt`. Como o site já gera 74 páginas no build, dá para
gerar **um card por ferramenta** (nome + ícone + tom da ferramenta) com um script
no `prebuild` usando canvas — o mesmo padrão do `generate-sitemap.mjs`. Isso é o
item de maior retorno por esforço da auditoria inteira.

### 2.3 🔴 As páginas são finas demais para ranquear

Medido no HTML gerado (texto visível, sem script/style):

```
/pt/imagem/cortar                 174 palavras   1 h1   1 h2   0 h3
/pt/pdf/juntar                    227 palavras   1 h1   1 h2   0 h3
/pt/privacidade/gerador-de-senha  270 palavras   1 h1   2 h2   0 h3
/pt/faq                           229 palavras   1 h1   0 h2   0 h3
/pt (home)                        757 palavras   1 h1   6 h2   0 h3
```

As consultas-alvo ("juntar pdf", "cortar imagem online", "comprimir pdf") são
comerciais e dominadas por iLovePDF, Smallpdf, Adobe e Canva — domínios com
autoridade alta e páginas de 800–2000 palavras. Com 174 palavras e um único `h2`,
a página não tem do que ranquear, por mais impecável que seja a técnica. **Este é
o gargalo real de tráfego, não o SEO técnico.**

O único `h2` da página de ferramenta é o título do FAQ. E as perguntas do FAQ são
`<summary><span>`, não cabeçalhos — então a página não tem hierarquia nenhuma
abaixo do `h1`.

Duas notas de honestidade sobre schema, para não gastar esforço à toa:

- **`FAQPage` deixou de gerar rich result** para sites que não sejam de governo ou
  saúde (Google, agosto/2023). O markup não faz mal, mas não traz mais o
  resultado rico. O valor do FAQ hoje é o **conteúdo** ranqueando cauda longa —
  e para isso as perguntas precisam ser `h2`/`h3`.
- **`HowTo` foi descontinuado** (Google, agosto/2023). Não vale implementar.

O que de fato move o ponteiro, em ordem:

1. Expandir cada página de ferramenta para 700–1000 palavras: como usar (passo a
   passo real, com os limites do produto), quando **não** usar, formatos e limites
   suportados, o que acontece com a qualidade, comparação honesta com a alternativa
   de fazer no desktop, e as perguntas como `h2`/`h3`.
2. **Linkagem interna contextual.** Hoje `/pt/imagem/cortar` tem 13 links internos,
   todos do rail (mesmo módulo) + rodapé. Não há nenhum link cruzando módulos nem
   nenhum "ferramentas relacionadas" no corpo. Uma seção de 3–4 relacionadas por
   página, escolhidas por afinidade real (cortar → redimensionar → comprimir →
   converter), distribui autoridade e é um sinal forte.
3. **Cauda longa programática.** "converter imagem" é uma consulta; "png para jpg",
   "webp para png", "heic para jpg" são doze consultas, cada uma com volume
   próprio e intenção mais específica — logo mais fáceis. O `convert` já faz o
   trabalho; falta URL, `h1` e texto por par de formato. Mesmo padrão para
   áudio (m4a → mp3) e PDF. Isso multiplica a superfície indexada sem código novo,
   e o repositório já tem a máquina para gerar rotas a partir de `TOOLS`.
4. `Organization.sameAs` + sinais de E-E-A-T (quem faz, por quê). O `/sobre` existe
   e tem 182 palavras — é pouco para a página que sustenta a confiança de um
   produto cujo argumento é privacidade.

### 2.4 🟡 Dois arquivos com conteúdo vencido

- **`src/index.html:45-96`** carrega um JSON-LD estático com `featureList` de
  **22 ferramentas** — sem o módulo de privacidade inteiro e sem `video-to-audio`.
  O `SeoService` sobrescreve o nó `#seo-jsonld` depois do bootstrap, e as 74
  páginas prerenderizadas já saem corretas. Mas este arquivo é servido literalmente
  no fallback de SPA, e crawlers que não executam JS (Bing, os crawlers de LLM) leem
  a lista velha. Deveria ser reduzido ao mínimo, ou removido: o prerender já cobre
  toda rota real.
- **`public/llms.txt`** diz "Thirty-one tools" e lista 4 ferramentas de áudio —
  falta `video-to-audio`. São 32 ferramentas. Mesmo problema que o
  `route-map.ts` foi escrito para eliminar: lista mantida à mão ao lado de uma
  fonte derivável. Deveria ser gerado no `prebuild` a partir de `TOOLS` +
  `tool-content.ts`, como o sitemap.

### 2.5 🟢 Menor

`meta keywords` é ignorado pelo Google desde 2009 — inofensivo, mas é peso morto
em 74 páginas. `robots.txt` não diferencia crawlers de IA (`GPTBot`,
`ClaudeBot`, `PerplexityBot`); como o produto tem `llms.txt` e quer ser citado,
o `Allow` explícito é coerente com a estratégia.

---

## 3. Usabilidade, acessibilidade e design

### 3.1 🔴 Sem skip link (WCAG 2.4.1, nível A)

`app.component.html` não tem link de pular navegação. Em qualquer página de
ferramenta, quem navega por teclado ou leitor de tela atravessa a barra do topo
(logo, switcher, busca, medidor) **mais até 10 links do rail** antes de chegar ao
conteúdo — em toda navegação. É a falha de acessibilidade mais comum e a mais
barata de corrigir: um `<a href="#main">` visível só no foco, e um `id` no `<main>`.

### 3.2 🔴 `alt` em português nas páginas em inglês

```
pdf-to-img.component.html:104    [alt]="'Página ' + thumb.index"
pdf-to-word.component.html:54    [alt]="'Página ' + thumb.index"
split-pdf.component.html:108     [alt]="'Página ' + thumb.index"
sign-pdf.component.html:87       [alt]="'Página ' + selectedPageIndex()"
redact-pdf.component.html:42     [alt]="'page ' + currentPage()"     ← inglês fixo, o inverso
```

Texto de interface literal fora do dicionário. O `TranslationService` torna chave
faltante um erro de compilação justamente para isso, mas string crua no template
escapa da rede. Um usuário de leitor de tela em inglês ouve "Página 1"; em
português, "page 1" no redact-pdf.

### 3.3 🟡 Menores

- O `<nav>` do rodapé (`app.component.html:36`) não tem `aria-label`. O rail e a
  barra mobile têm. Com três `<nav>` na página, o leitor de tela anuncia um sem
  nome.
- O reflow de fonte da seção 1.2 **é visível para o usuário**, não só uma métrica:
  o texto salta em ~1,2 s. Corrigir o CLS corrige a percepção junto.
- A seção "Em breve" ocupa 4 cards na home com itens não clicáveis. Define
  expectativa, mas fica logo abaixo das ferramentas reais em prime real estate.
  Vale medir se ajuda ou distrai.

### 3.4 O que está bom e merece registro

Paleta de comandos com campo visível e chip de atalho (`⌘K`) no topo — não é um
atalho escondido. `:focus-visible` com anel de 2 px em tudo. Rail escopado por
módulo, com o argumento de escala correto. Tokens semânticos sem hex solto em
componente. Zero erro de console em 74 rotas. O `_headers` com casamento por
prefixo (e o comentário explicando por que não por extensão) é o tipo de detalhe
que quase ninguém acerta.

---

## 4. Ferramentas novas por módulo

Critério: **precisa ser 100% client-side** (senão contradiz o produto), precisa
ter demanda de busca real, e de preferência precisa reaproveitar o que já existe.

### Imagem

| Ferramenta | Por que | Reaproveita |
|---|---|---|
| **Imagem → SVG (vetorizar)** | Seção 5. A grande. | — |
| **Remover fundo em lote** | O modelo já está carregado; a segunda foto é inferência pura. Hoje é uma de cada vez. | `BackgroundRemovalService`, `app-page-grid` |
| **Colagem / grade de fotos** | Volume de busca alto, zero dependência (canvas puro). | `core/image/converters.ts` |
| **Comparador de qualidade (slider + tamanho)** | Já existe `app-compare-slider`; falta expor como ferramenta com números lado a lado. | `app-compare-slider` |
| **Conversor HEIC → JPG/PNG** | Todo iPhone gera HEIC e o Windows não abre. Demanda enorme. Precisa de decoder WASM (`libheif`, LGPL — verificar licença antes). | `core/image/` |
| **Favicon / ícone multi-tamanho** | `encodeIco` já existe em `converters.ts`. É quase só UI. | `encodeIco` |

### PDF

| Ferramenta | Por que | Reaproveita |
|---|---|---|
| **Numerar páginas** | Pedido constante, trivial com pdf-lib. | `pdf-lib`, o padrão de watermark |
| **Recortar / aparar margens (crop PDF)** | Escanear torto é universal. pdf-lib mexe em MediaBox. | `pdf-lib`, `app-region-overlay` |
| **PDF → texto / Markdown** | O `pdf-to-word` já extrai tudo; falta só outro escritor. Serve o público que joga PDF em LLM. | `PdfLoaderService`, `mergeNativeParagraphs` |
| **Comparar dois PDFs** | `core/text/diff.ts` (Myers) já existe e o extrator também. | `core/text/diff.ts` + `PdfLoaderService` |
| **Preencher formulário (AcroForm)** | pdf-lib lê e escreve campos de formulário nativamente. | `pdf-lib` |
| **PDF/A (arquivamento)** | Exigência de órgão público e cartório — público que já busca "assinar pdf". | `pdf-lib` |

### Áudio

| Ferramenta | Por que | Reaproveita |
|---|---|---|
| **Normalizar volume (LUFS / peak)** | Aritmética sobre Float32, zero dependência. Fecha o buraco entre cortar e juntar. | `core/audio/` |
| **Remover silêncio** | Detecção de limiar + o mesmo splice do cortador. Público de podcast. | `AudioCutterService` |
| **Mudar velocidade / pitch** | Time-stretch é o algoritmo mais pedido. WSOLA em Float32, sem dependência. | `core/audio/` |
| **Gravador de voz** | `MediaRecorder` + o cortador que já existe. Entra na cadeia de áudio. | `AudioEngine` |
| **Separar canais / mono↔estéreo** | Trivial; o `merge-audio` já faz o alargamento. | `core/audio/` |
| **Áudio → texto (transcrição)** | Whisper-tiny em ONNX pesa ~40 MB — o mesmo perfil do IS-Net, e a infra de download em partes já existe. Ambicioso, mas é o pedido nº 1. | `scripts/fetch-model.mjs`, `onnxruntime-web` |

### Privacidade / segurança

| Ferramenta | Por que | Reaproveita |
|---|---|---|
| **Anonimizar documento (CPF/RG/e-mail)** | Detecta padrão brasileiro no texto extraído e tarja automático. É a versão útil do `redact-pdf` e ninguém faz bem. | `redact-pdf`, `PdfLoaderService`, OCR |
| **QR Code gerador/leitor offline** | Todo gerador de QR online manda o conteúdo para o servidor — inclusive senha de Wi-Fi e chave Pix. O argumento de venda escreve sozinho. | canvas puro |
| **Cofre de arquivos (múltiplos + manifesto)** | O `encrypt-file` faz um por vez. Zip + envelope V2, mesma cripto. | `core/crypto/envelope.ts`, `fflate` |
| **Verificador de vazamento (k-anonymity)** | ⚠️ Exige rede (API do HIBP). Contradiz "nada sai" mesmo com k-anonymity. **Não recomendo** — mas registro para que a decisão seja consciente. | — |
| **Assinatura digital / verificação (Ed25519)** | WebCrypto faz nativo. Assinar arquivo e verificar assinatura de terceiro. | `core/crypto/` |
| **Metadados de Office (docx/xlsx)** | O `clean-pdf-metadata` já provou o valor; docx é zip + XML, e o `fflate` já é dependência declarada. | `fflate`, `core/exif/` |

---

## 5. Imagem → SVG: o design para ser o melhor, não mais um

### 5.1 Por que os vetorizadores da web são ruins

O usuário chamou de "cagado" e a palavra é precisa. Os defeitos são sempre os
mesmos seis, e cada um tem causa técnica identificável:

1. **Serrilhado.** Traçam o contorno de pixel e emitem polilinha. Sem ajuste de
   curva, o resultado tem degrau de escada — pior que o raster que substituiu.
2. **Explosão de paths.** Um path por corrida de pixel. SVG de 20 MB que trava o
   navegador para representar um logo de 4 cores.
3. **Costura entre regiões.** Cada região é traçada isolada, então entre dois
   vizinhos sobra uma fresta de fundo de meio pixel, ou eles se sobrepõem e a
   ordem de pintura decide quem ganha. É o defeito mais visível e o mais difícil
   de consertar depois.
4. **Bandeamento em degradê.** Um degradê suave vira 14 faixas de cor chapada,
   cada uma com seu path.
5. **Cantos arredondados ou curvas quebradas.** Suavizar tudo derrete cantos
   retos; não suavizar nada devolve o serrilhado. Quase ninguém detecta canto.
6. **Ruído de JPEG virando geometria.** Sem pré-filtro, artefato de compressão
   produz milhares de regiões espúrias de 3 px.

### 5.2 Restrição de licença — vem antes do algoritmo

**Potrace é GPL.** É o padrão-ouro para traçado bilevel e a maioria das portas JS
deriva dele. Este produto já recusou copyleft uma vez (o `@imgly/background-removal`
AGPL) por vender B2B/on-prem. **Portar Potrace refaria exatamente esse erro.**

Opções limpas:

- **VTracer / `visioncortex`** (Rust, **MIT**) — compila para WASM, faz clustering
  de cor + traçado + ajuste de spline. É a melhor base permissiva que existe.
  Mas sozinho **não** resolve os defeitos 3 (costura) e 4 (degradê) — ele é bom,
  não é o melhor do mundo.
- **Implementação própria em TypeScript** em `core/vector/`. É o que o repositório
  faz em `core/audio/`, `core/crypto/`, `core/exif/` e `core/text/`: núcleo puro,
  zero dependência, testado unitariamente. Custa mais, e é o único caminho que
  chega no "melhor do mundo" porque os dois diferenciais reais não existem
  prontos em lugar nenhum.

**Recomendo o caminho próprio**, com VTracer-WASM como plano B se o prazo apertar.

### 5.3 O pipeline

```
1. Pré-filtro          filtro guiado / bilateral, preservando borda
2. Quantização         k-means em CIELAB (ΔE2000), k automático
3. Segmentação         componentes conexos + merge de área mínima
4. Grafo planar        ← DIFERENCIAL 1
5. Traçado de aresta   Moore-neighbour, uma vez por aresta
6. Detecção de canto   curvatura discreta; canto nunca é suavizado
7. Simplificação       RDP ancorado nos cantos
8. Ajuste de curva     Bézier cúbica por mínimos quadrados (Schneider), G1
9. Degradês            ← DIFERENCIAL 2
10. Serialização       coordenadas com 2 casas, comandos relativos
```

**Diferencial 1 — topologia de aresta compartilhada (mata o defeito 3).**
Em vez de traçar cada região fechada isoladamente, extrair a **subdivisão planar**:
cada aresta entre duas regiões é traçada **uma vez**, ajustada **uma vez**, e as
duas regiões referenciam a mesma geometria. Consequências: costura é
matematicamente impossível (a fronteira é literalmente o mesmo conjunto de pontos);
o arquivo encolhe quase pela metade (cada fronteira interna era escrita duas
vezes); e editar depois no Illustrator/Inkscape não abre fresta. É o que o Vector
Magic faz e é a razão de ele ser pago. **Praticamente nada na web faz isso** — é
aqui que se ganha a comparação.

**Diferencial 2 — detecção de degradê (mata o defeito 4).**
Antes de aceitar que uma região precisa ser subdividida em faixas, ajustar um
gradiente linear ou radial ao interior dela por mínimos quadrados. Se o resíduo
fica abaixo do limiar, emitir **um** path com `<linearGradient>` em vez de 14
paths chapados. Para ilustração e foto com sombreado, é a diferença entre um SVG
de 300 kB com bandeamento e um de 20 kB que parece o original.

**Sobre cantos (defeito 5).** Calcular curvatura discreta ao longo da polilinha e
marcar como canto tudo acima do limiar. O RDP é ancorado nesses pontos e o
ajuste de Bézier trata cada trecho entre cantos como um segmento independente,
impondo continuidade G1 (tangente contínua) só nas junções *suaves*. É o que faz a
curva parecer desenhada em vez de traçada.

**Sobre despeckle (defeito 6).** Regiões abaixo da área mínima devem ser
**fundidas ao vizinho dominante**, nunca apagadas. Apagar deixa buraco, e buraco
no meio de um logo é pior que o ponto que se queria remover.

### 5.4 Modos — um algoritmo não serve para os quatro casos

| Modo | Para | Comportamento |
|---|---|---|
| **Traço / P&B** | logo, assinatura, digitalização | bilevel, limiar adaptativo, saída de path único |
| **Logo / cor chapada** | marca, ícone, arte plana | poucas cores, aresta dura, topologia compartilhada, sem degradê |
| **Ilustração** | desenho, cartoon, arte com sombra | muitas cores + degradês + empilhamento |
| **Pixel art** | sprite, ícone pequeno | sem suavização entre pixels; Kopf-Lischinski |

O `isFlatGraphic()` de `BackgroundRemovalService` já mede exatamente o tipo de
sinal necessário para **sugerir o modo automaticamente** — o precedente de
roteamento por medida do input já existe no código.

### 5.5 Encaixe na arquitetura

- `core/vector/` — puro, zero dependência, testado unitariamente. Mesmo formato de
  `core/audio/` e `core/exif/`.
- **Web Worker obrigatório.** É o trabalho mais pesado de CPU do produto inteiro;
  na main thread congela a aba. (O TBT já é o eixo fraco — ver 1.3.)
- `features/vectorize/` com serviço stateless `providedIn: 'root'`, estado na
  componente, `ObjectUrlScope` nos providers.
- **Fora da cadeia do `ImageStateService`.** A saída é SVG, não `image/*` — o
  `apply()` recusa, e corretamente: reencodar um vetor por canvas destrói o que a
  ferramenta produziu. Mesmo argumento que já isola `remove-exif` e `img-to-pdf`.
- Prévia lado a lado com `app-compare-slider`, contagem de paths e tamanho do
  arquivo ao vivo, `stale` incluindo cada parâmetro que o `run()` lê.
- Registro nos 5 lugares do checklist do CLAUDE.md + `core/seo/tool-content.ts`.

### 5.6 Esforço honesto

Não é uma ferramenta de uma semana. Estimativa realista:

| Etapa | Esforço |
|---|---|
| Quantização + segmentação + traçado + Bézier (já melhor que a média da web) | ~2 semanas |
| Topologia de aresta compartilhada (diferencial 1) | ~1,5 semana |
| Detecção de degradê (diferencial 2) | ~1 semana |
| Os 4 modos + auto-detecção + UI + testes + SEO | ~1,5 semana |

**~6 semanas** para o "melhor do mundo" de verdade. Um MVP respeitável (modo traço
+ modo logo, sem degradê) sai em ~2 semanas e já supera a maioria dos concorrentes
gratuitos. Recomendo entregar nessa ordem, com o corte de release depois do
diferencial 1 — porque é ele, e não o degradê, que faz as pessoas notarem a
diferença.

---

## 6. Plano priorizado

Ordem por (impacto ÷ esforço). Os quatro primeiros somam menos de um dia.

### Fase 1 — hoje (impacto alto, esforço trivial)

1. **PNG 1200×630 para `og:image`/`twitter:image`** + `Organization.logo` quadrado.
   Conserta o compartilhamento em todas as redes, em todas as 74 URLs. *(~1 h)*
2. **Preload de fonte + fallback com métricas casadas.** CLS de 0,21 → ~0.
   Também tira o salto de texto visível. *(~2 h)*
3. **Subsets de fonte** (`latin` + `latin-ext`, só woff2). −391 kB no prefetch do
   SW, CSS menor, fonte mais cedo. *(~30 min)*
4. **Skip link + `aria-label` no `<nav>` do rodapé + os 5 `alt` no dicionário.**
   *(~1 h)*

### Fase 2 — esta semana

5. **`llms.txt` gerado no `prebuild`** a partir de `TOOLS`, e enxugar o JSON-LD
   estático do `index.html`. Elimina duas listas mantidas à mão. *(~2 h)*
6. **`jspdf` dinâmico no `protect-pdf`** e revisar o modulepreload de pdf-lib nas
   4 páginas. −127 kB na pior página. *(~2 h)*
7. **Adiar `AppUpdateService` / `ModelPrefetchService`** para depois da primeira
   renderização. Primeira mordida no TBT. *(~2 h)*

### Fase 3 — próximas 2–3 semanas

8. **Conteúdo: 700–1000 palavras por página de ferramenta**, perguntas como
   `h2`/`h3`, seção de relacionadas. É o item que decide o tráfego orgânico —
   e o mais trabalhoso, porque são 32 páginas × 2 línguas de texto que precisa ser
   realmente útil. Começar pelas 6 ferramentas de maior volume de busca.
9. **Migração para zoneless.** Maior alavanca de TBT, e aposenta o
   `promise-try.ts`. Precisa de passada pelos specs e pela suíte e2e.
10. **Cauda longa programática** (png→jpg, webp→png, m4a→mp3…). Multiplica a
    superfície indexada reusando ferramenta que já existe.

### Fase 4 — o diferencial

11. **Imagem → SVG**, na ordem da seção 5.6. Release após o diferencial 1.
12. Ferramentas novas da seção 4, priorizando as que reaproveitam infra pronta:
    numerar páginas PDF, normalizar áudio, QR offline, remover fundo em lote.

---

## Apêndice — reproduzir as medições

```bash
npm run build
node e2e/preview-server.mjs 4310          # em outro terminal

# payload por página (gzip do que o HTML referencia)
# runtime CWV nas 74 rotas (390x844, CPU 4x, 1.6 Mbps)
# — os dois scripts usados estão descritos na seção "Metodologia";
#   reescrevê-los é ~60 linhas de Playwright + zlib.

# checagens pontuais
grep -o "font-display:[a-z]*" dist/nadasai/browser/styles-*.css | sort | uniq -c
grep -rl "chunk-PVBUKQ2Y" --include=*.html dist/nadasai/browser
node -e "const j=require('./dist/nadasai/browser/ngsw.json');for(const g of j.assetGroups)console.log(g.name,g.installMode,g.urls.length)"
```
