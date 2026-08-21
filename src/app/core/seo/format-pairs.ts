import type { ToolId } from '../tools/tools';

/**
 * CAUDA LONGA PROGRAMÁTICA — uma página por par de formatos.
 *
 * Ninguém procura "converter imagem". Procura-se "png para jpg", e quem chega
 * com essa busca quer a resposta de uma pergunta específica: some a
 * transparência? o arquivo diminui? perde qualidade? A ferramenta de converter
 * responde às três, mas a página dela fala de conversão em geral e não casa com
 * nenhuma dessas buscas.
 *
 * Cada entrada aqui vira DUAS URLs indexadas (pt e en) que abrem a mesma
 * ferramenta já com o formato de destino escolhido. É por isso que se chama
 * programática: a ferramenta não é reescrita, só apontada.
 *
 * ── A REGRA QUE FAZ ISTO NÃO SER UMA FÁBRICA DE PORTAS DE ENTRADA ───────────
 *
 * Doze páginas com o mesmo texto e o mesmo FAQ são conteúdo duplicado fino, que
 * o Google trata como tal e que é PIOR do que não ter as páginas — é o mesmo
 * argumento que o cabeçalho de `tool-content.ts` já faz sobre as ferramentas.
 * Então cada par aqui carrega texto que só vale para ELE, e cada afirmação sai
 * do código:
 *
 *   - o JPEG achata a transparência sobre BRANCO, fixo (`encodeImage` passa
 *     `#ffffff`; o seletor de fundo do conversor é só do PDF);
 *   - JPEG sai a 0,92, WebP a 0,9, PNG sem perda nenhuma;
 *   - `loadImage` é um `new Image()` desenhado num canvas, então de um GIF ou
 *     WebP animado sai o PRIMEIRO QUADRO e mais nada;
 *   - AVIF entra e não sai, porque `canvas.toBlob('image/avif')` não existe e,
 *     pela especificação, cai em silêncio para PNG;
 *   - no áudio, só MP3 e WAV são destino: o resto depende do `MediaRecorder` do
 *     navegador e cai para MP3 quando falta — prometer OGG numa página cujo
 *     título é "para OGG" seria a mentira que tirou o FLAC da lista de saída.
 *
 * ── ONDE ISTO É LIDO ────────────────────────────────────────────────────────
 *
 * Sem imports de valor, de propósito: `scripts/generate-sitemap.mjs` carrega
 * este arquivo direto do Node, e um módulo que importe Angular não passa por
 * lá. Mesma razão de `static-pages.ts` existir separado.
 *
 * As rotas, o mapa de hreflang, o sitemap e o `llms.txt` são todos DERIVADOS
 * daqui. Acrescentar um par é uma entrada — e nada mais.
 */

export interface PairSection {
  readonly h: string;
  readonly p: readonly string[];
}

export interface PairFaq {
  readonly q: string;
  readonly a: string;
}

export interface PairContent {
  /** Vira o h1 da página, no lugar do nome da ferramenta. */
  readonly h1: string;
  readonly sub: string;
  /** Título da aba e `og:title`. */
  readonly title: string;
  readonly description: string;
  readonly sections: readonly PairSection[];
  readonly faq: readonly PairFaq[];
}

export interface FormatPair {
  readonly id: string;
  /** A ferramenta que a página abre. */
  readonly tool: ToolId;
  /**
   * O valor que a ferramenta pré-seleciona ao abrir por esta rota. Casa com o
   * `TargetFormat` do conversor de imagem ou o `TargetAudioFormat` do de áudio.
   */
  readonly target: string;
  readonly pathPt: string;
  readonly pathEn: string;
  readonly pt: PairContent;
  readonly en: PairContent;
}

export const FORMAT_PAIRS: readonly FormatPair[] = [
  // ── Imagem ────────────────────────────────────────────────────────────────
  {
    id: 'png-to-jpg',
    tool: 'convert',
    target: 'JPEG',
    pathPt: 'imagem/png-para-jpg',
    pathEn: 'image/png-to-jpg',
    pt: {
      h1: 'PNG para JPG',
      sub: 'Converta PNG em JPEG no navegador, sem enviar o arquivo.',
      title: 'Converter PNG para JPG Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta PNG em JPG direto no navegador. A transparência é achatada sobre branco e o arquivo costuma cair para uma fração do tamanho. Sem cadastro e sem upload.',
      sections: [
        {
          h: 'O que muda de PNG para JPG',
          p: [
            'PNG é sem perda e guarda transparência; JPEG é com perda e não guarda. A conversão troca as duas coisas de uma vez: o arquivo encolhe muito — numa foto, tipicamente para menos de um quinto — e o canal alfa deixa de existir.',
            'A qualidade usada aqui é 0,92, alta o bastante para a diferença não aparecer em foto e baixa o bastante para o ganho de tamanho ser o esperado. É uma escolha fixa: se você precisa apertar mais, o caminho é converter e depois passar pelo compressor, que expõe o controle.',
          ],
        },
        {
          h: 'A transparência vira branco',
          p: [
            'JPEG não tem canal alfa, então todo pixel transparente precisa virar alguma cor. Aqui ele vira BRANCO, e isso é fixo — não há seletor de fundo nesta conversão. Um logotipo recortado sobre transparência sai com um retângulo branco em volta.',
            'Se o fundo branco não serve, há dois caminhos honestos: manter PNG, ou converter para WebP, que é o único formato pequeno desta lista que preserva alfa.',
          ],
        },
      ],
      faq: [
        {
          q: 'Converter PNG para JPG diminui muito o arquivo?',
          a: 'Numa fotografia, sim — a queda costuma ser de cinco a dez vezes, porque o PNG guarda cada pixel exatamente e o JPEG descarta o que o olho não vê. Em desenho, ícone ou captura de tela com poucas cores chapadas, o efeito pode se inverter: o PNG já comprime esse tipo de conteúdo muito bem, e o JPEG ainda acrescenta chiado em volta das bordas duras.',
        },
        {
          q: 'O que acontece com o fundo transparente?',
          a: 'Ele é preenchido com branco antes de gravar, porque o formato JPEG não tem como representar transparência. Não é uma opção que dá para desligar nesta conversão. Se precisa manter o recorte, converta para WebP: ele guarda o alfa e ainda assim fica bem menor que o PNG.',
        },
        {
          q: 'Dá para voltar de JPG para PNG e recuperar a qualidade?',
          a: 'Não. O que o JPEG descartou não está mais no arquivo, e regravar como PNG só congela o resultado num formato sem perda — o arquivo fica maior e a imagem continua igual. Guarde o PNG original se ainda vai precisar dele.',
        },
      ],
    },
    en: {
      h1: 'PNG to JPG',
      sub: 'Convert PNG to JPEG in the browser, with no upload.',
      title: 'Convert PNG to JPG Online (Free, Offline) — Nada Sai',
      description:
        'Convert PNG to JPG right in the browser. Transparency is flattened onto white and the file usually drops to a fraction of its size. No signup, no upload.',
      sections: [
        {
          h: 'What changes from PNG to JPG',
          p: [
            'PNG is lossless and carries transparency; JPEG is lossy and carries none. The conversion trades both at once: the file shrinks a lot — on a photo, typically to under a fifth — and the alpha channel stops existing.',
            'The quality used here is 0.92, high enough that the difference does not show on a photograph and low enough that the size gain is the one you expect. It is a fixed choice: if you need to squeeze harder, convert and then pass the result through the compressor, which exposes the control.',
          ],
        },
        {
          h: 'Transparency becomes white',
          p: [
            'JPEG has no alpha channel, so every transparent pixel has to become some colour. Here it becomes WHITE, and that is fixed — this conversion has no background picker. A logo cut out against transparency comes out with a white rectangle around it.',
            'If white does not work, there are two honest paths: keep the PNG, or convert to WebP, the only small format on this list that keeps alpha.',
          ],
        },
      ],
      faq: [
        {
          q: 'Does converting PNG to JPG shrink the file much?',
          a: 'On a photograph, yes — the drop is usually five to ten times, because PNG stores every pixel exactly while JPEG discards what the eye does not catch. On line art, an icon or a screenshot with flat colours it can go the other way: PNG already compresses that kind of content very well, and JPEG adds ringing around the hard edges.',
        },
        {
          q: 'What happens to a transparent background?',
          a: 'It is filled with white before writing, because the JPEG format cannot represent transparency. It is not an option you can switch off in this conversion. If you need the cutout, convert to WebP instead: it keeps the alpha and is still far smaller than PNG.',
        },
        {
          q: 'Can I go back from JPG to PNG and recover the quality?',
          a: 'No. What JPEG discarded is no longer in the file, and re-saving as PNG only freezes the result in a lossless container — the file gets bigger and the image looks the same. Keep the original PNG if you will still need it.',
        },
      ],
    },
  },
  {
    id: 'jpg-to-png',
    tool: 'convert',
    target: 'PNG',
    pathPt: 'imagem/jpg-para-png',
    pathEn: 'image/jpg-to-png',
    pt: {
      h1: 'JPG para PNG',
      sub: 'Converta JPEG em PNG no navegador, sem enviar o arquivo.',
      title: 'Converter JPG para PNG Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta JPG em PNG direto no navegador. O PNG é sem perda, então nada é descartado a partir daqui — mas o arquivo cresce e a qualidade já perdida não volta.',
      sections: [
        {
          h: 'O arquivo vai crescer, e isso é esperado',
          p: [
            'PNG é sem perda: ele guarda cada pixel exatamente como está. JPEG chegou até aqui justamente por ter descartado informação, e regravar sem perda o que já foi reduzido significa gastar bytes para preservar inclusive os artefatos da compressão anterior. É normal um JPEG de 400 kB virar um PNG de 2 MB.',
            'Vale quando o destino exige PNG, quando a imagem vai passar por várias edições em sequência — cada regravação em JPEG acrescenta uma geração de perda, e o PNG interrompe essa conta — ou quando você precisa acrescentar transparência depois.',
          ],
        },
        {
          h: 'O que a conversão NÃO faz',
          p: [
            'Não recupera nitidez, não remove o quadriculado do JPEG e não inventa detalhe. O que foi descartado não está no arquivo, e nenhum formato de destino traz de volta. Se o que você quer é uma imagem melhor, e não outro formato, a ferramenta de melhorar qualidade é a que reconstrói borda e reduz ruído.',
            'Também não acrescenta transparência sozinha: o PNG que sai daqui é opaco, porque o JPEG de origem era. Para recortar o fundo depois, a remoção de fundo devolve um PNG com alfa de verdade.',
          ],
        },
      ],
      faq: [
        {
          q: 'Por que o PNG ficou maior que o JPG original?',
          a: 'Porque ele é sem perda. O PNG grava cada pixel como está, inclusive os artefatos que a compressão JPEG deixou, e não tem como descartar nada para economizar. Crescer três a cinco vezes é o resultado normal, não um defeito da conversão.',
        },
        {
          q: 'Converter para PNG melhora a qualidade da imagem?',
          a: 'Não. A partir daqui nada mais é descartado, o que é uma garantia real para as próximas edições, mas o que o JPEG já tinha jogado fora continua fora. Um PNG feito de um JPEG ruim é um arquivo grande com uma imagem ruim dentro.',
        },
        {
          q: 'O PNG resultante fica com fundo transparente?',
          a: 'Não. Ele sai opaco, porque a origem era opaca — o formato passa a SUPORTAR transparência, mas não há transparência para representar. Para tirar o fundo, use a remoção de fundo, que devolve um PNG com canal alfa preenchido de verdade.',
        },
      ],
    },
    en: {
      h1: 'JPG to PNG',
      sub: 'Convert JPEG to PNG in the browser, with no upload.',
      title: 'Convert JPG to PNG Online (Free, Offline) — Nada Sai',
      description:
        'Convert JPG to PNG right in the browser. PNG is lossless, so nothing is discarded from here on — but the file grows and quality already lost does not come back.',
      sections: [
        {
          h: 'The file will grow, and that is expected',
          p: [
            'PNG is lossless: it stores every pixel exactly as it is. The JPEG got here precisely by discarding information, and re-saving that losslessly means spending bytes to preserve even the artefacts of the earlier compression. A 400 kB JPEG becoming a 2 MB PNG is normal.',
            'It is worth it when the destination demands PNG, when the image will go through several edits in a row — each JPEG re-save adds a generation of loss, and PNG stops that arithmetic — or when you need to add transparency afterwards.',
          ],
        },
        {
          h: 'What the conversion does not do',
          p: [
            'It does not restore sharpness, it does not remove JPEG blocking, and it does not invent detail. What was discarded is not in the file, and no destination format brings it back. If what you want is a better image rather than another format, the upscaling tool is the one that reconstructs edges and reduces noise.',
            'It also does not add transparency on its own: the PNG that comes out is opaque, because the source JPEG was. To cut the background out afterwards, background removal returns a PNG with real alpha.',
          ],
        },
      ],
      faq: [
        {
          q: 'Why is the PNG bigger than the original JPG?',
          a: 'Because it is lossless. PNG records every pixel as it stands, including the artefacts JPEG compression left behind, and has no way to discard anything to save room. Growing three to five times is the normal outcome, not a fault in the conversion.',
        },
        {
          q: 'Does converting to PNG improve image quality?',
          a: 'No. Nothing more is discarded from here on, which is a real guarantee for the edits that follow, but whatever JPEG already threw away stays away. A PNG made from a bad JPEG is a large file with a bad image inside it.',
        },
        {
          q: 'Will the resulting PNG have a transparent background?',
          a: 'No. It comes out opaque, because the source was opaque — the format now SUPPORTS transparency, but there is no transparency to represent. To remove the background, use background removal, which returns a PNG with a genuinely filled alpha channel.',
        },
      ],
    },
  },
  {
    id: 'png-to-webp',
    tool: 'convert',
    target: 'WEBP',
    pathPt: 'imagem/png-para-webp',
    pathEn: 'image/png-to-webp',
    pt: {
      h1: 'PNG para WebP',
      sub: 'Converta PNG em WebP mantendo a transparência, sem enviar o arquivo.',
      title: 'Converter PNG para WebP Online (Mantém Alfa) — Nada Sai',
      description:
        'Converta PNG em WebP direto no navegador, com a transparência preservada. É a troca que reduz o peso de imagem de site sem perder o recorte.',
      sections: [
        {
          h: 'A única troca desta lista que mantém o recorte',
          p: [
            'WebP é o formato pequeno que guarda canal alfa. Sair de PNG para JPEG derruba o tamanho mas achata a transparência sobre branco; sair para WebP derruba o tamanho e mantém o recorte intacto. Para arte de site — logotipo, ícone, ilustração sobre fundo transparente — é a conversão que faz sentido.',
            'A qualidade usada é 0,9. Em conteúdo chapado, que é a maior parte do que se guarda em PNG, essa diferença não aparece; em foto com muito degradê, olhe o resultado antes de descartar o original.',
          ],
        },
        {
          h: 'Onde WebP ainda não serve',
          p: [
            'Todo navegador atual abre WebP, e é aí que ele economiza. Fora do navegador o suporte é irregular: sistemas de impressão, editores antigos e alguns formulários de upload continuam recusando. Se o arquivo vai para um desses, o destino certo é PNG ou JPEG.',
            'De um PNG animado (APNG) sai apenas o primeiro quadro: a conversão desenha a imagem num canvas, e um canvas tem um quadro só.',
          ],
        },
      ],
      faq: [
        {
          q: 'WebP preserva o fundo transparente do PNG?',
          a: 'Sim, e é o principal motivo para escolher este destino. O canal alfa atravessa a conversão inteiro, então um logotipo recortado continua recortado. É a diferença prática entre este par e o PNG para JPG, onde a transparência é preenchida com branco.',
        },
        {
          q: 'Quanto menor fica?',
          a: 'Depende muito do conteúdo. Numa ilustração ou captura de tela com áreas chapadas, cair para um terço do PNG é comum. Em foto o ganho é maior ainda. Em imagem já pequena, de poucos quilobytes, a diferença pode ser irrelevante — vale conferir o tamanho do resultado antes de trocar.',
        },
        {
          q: 'Posso usar WebP em qualquer lugar?',
          a: 'Em navegador, sim: todos os atuais abrem. Fora dele o suporte é desigual — parte dos programas de escritório, sistemas de impressão e formulários de upload ainda recusam o formato. Para esses destinos, converta para PNG ou JPG.',
        },
      ],
    },
    en: {
      h1: 'PNG to WebP',
      sub: 'Convert PNG to WebP with transparency kept, and no upload.',
      title: 'Convert PNG to WebP Online (Keeps Alpha) — Nada Sai',
      description:
        'Convert PNG to WebP right in the browser, transparency preserved. It is the trade that cuts the weight of site imagery without losing the cutout.',
      sections: [
        {
          h: 'The one trade here that keeps the cutout',
          p: [
            'WebP is the small format that carries an alpha channel. Going from PNG to JPEG drops the size but flattens transparency onto white; going to WebP drops the size and leaves the cutout intact. For site artwork — a logo, an icon, an illustration over a transparent background — this is the conversion that makes sense.',
            'The quality used is 0.9. On flat content, which is most of what people keep as PNG, that difference does not show; on a photo with long gradients, look at the result before discarding the original.',
          ],
        },
        {
          h: 'Where WebP still does not fit',
          p: [
            'Every current browser opens WebP, and that is where it saves you weight. Outside the browser support is patchy: print systems, older editors and some upload forms still refuse it. If the file is headed somewhere like that, PNG or JPEG is the right destination.',
            'From an animated PNG (APNG) only the first frame comes out: the conversion draws the image onto a canvas, and a canvas holds one frame.',
          ],
        },
      ],
      faq: [
        {
          q: 'Does WebP keep the PNG transparent background?',
          a: 'Yes, and it is the main reason to pick this destination. The alpha channel crosses the conversion whole, so a cut-out logo stays cut out. That is the practical difference between this pair and PNG to JPG, where transparency is filled with white.',
        },
        {
          q: 'How much smaller does it get?',
          a: 'It depends heavily on the content. On an illustration or a screenshot with flat areas, dropping to a third of the PNG is common. On a photo the gain is larger still. On an image that is already a few kilobytes the difference can be irrelevant — check the resulting size before switching.',
        },
        {
          q: 'Can I use WebP everywhere?',
          a: 'In a browser, yes: all current ones open it. Outside that, support is uneven — some office software, print systems and upload forms still refuse the format. For those destinations, convert to PNG or JPG.',
        },
      ],
    },
  },
  {
    id: 'webp-to-png',
    tool: 'convert',
    target: 'PNG',
    pathPt: 'imagem/webp-para-png',
    pathEn: 'image/webp-to-png',
    pt: {
      h1: 'WebP para PNG',
      sub: 'Converta WebP em PNG para abrir onde o formato não é aceito.',
      title: 'Converter WebP para PNG Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta WebP em PNG direto no navegador, com a transparência preservada. É a saída para programas e formulários que ainda recusam WebP.',
      sections: [
        {
          h: 'Por que quase sempre é compatibilidade',
          p: [
            'Quem faz esta conversão raramente quer PNG por PNG: quer abrir o arquivo num programa que recusa WebP, ou enviá-lo a um formulário que só aceita PNG e JPG. O WebP é ótimo dentro do navegador e continua irregular fora dele, e é exatamente essa lacuna que esta página cobre.',
            'A transparência atravessa inteira — os dois formatos têm canal alfa —, então um recorte continua recortado. O que muda é o tamanho: o PNG resultante costuma ser várias vezes maior, porque é sem perda e o WebP não era.',
          ],
        },
        {
          h: 'WebP animado perde a animação',
          p: [
            'De um WebP animado sai o PRIMEIRO QUADRO e mais nada. A conversão decodifica a imagem e a desenha num canvas, e um canvas guarda um quadro só — não há como um PNG comum representar a sequência de qualquer forma.',
            'Se o que você tem é uma animação e o destino precisa se mover, o caminho é outro: um GIF. A ferramenta de vídeo para GIF monta um a partir de um vídeo, com a paleta agrupada em CIELAB em vez de RGB.',
          ],
        },
      ],
      faq: [
        {
          q: 'A transparência do WebP sobrevive?',
          a: 'Sim, inteira. Os dois formatos têm canal alfa, então nada precisa ser achatado e nenhum fundo é inventado. É a diferença entre este par e o WebP para JPG, onde a transparência vira branco.',
        },
        {
          q: 'Por que o PNG ficou tão maior?',
          a: 'Porque o PNG é sem perda e o WebP não era. O arquivo de origem economizava descartando informação que o olho não capta; o PNG grava tudo o que sobrou, exatamente como está. Crescer três a cinco vezes é o resultado normal.',
        },
        {
          q: 'E se o meu WebP for animado?',
          a: 'Sai apenas o primeiro quadro. Um PNG comum não tem como carregar a sequência, e a conversão desenha a imagem num canvas, que guarda um quadro por definição. A página avisa disso aqui em vez de deixar você descobrir no arquivo baixado.',
        },
      ],
    },
    en: {
      h1: 'WebP to PNG',
      sub: 'Convert WebP to PNG to open it where the format is refused.',
      title: 'Convert WebP to PNG Online (Free, Offline) — Nada Sai',
      description:
        'Convert WebP to PNG right in the browser, transparency preserved. It is the way out for software and forms that still refuse WebP.',
      sections: [
        {
          h: 'Why this is almost always about compatibility',
          p: [
            'People making this conversion rarely want PNG for its own sake: they want to open the file in software that refuses WebP, or send it to a form that only accepts PNG and JPG. WebP is excellent inside the browser and still uneven outside it, and that gap is exactly what this page covers.',
            'Transparency crosses over whole — both formats have an alpha channel — so a cutout stays cut out. What changes is size: the resulting PNG is usually several times larger, because it is lossless and the WebP was not.',
          ],
        },
        {
          h: 'An animated WebP loses its animation',
          p: [
            'From an animated WebP only the FIRST FRAME comes out. The conversion decodes the image and draws it onto a canvas, and a canvas holds a single frame — an ordinary PNG could not represent the sequence in any case.',
            'If what you have is an animation and the destination has to move, the path is different: a GIF. The video-to-GIF tool builds one from a video, with the palette clustered in CIELAB rather than RGB.',
          ],
        },
      ],
      faq: [
        {
          q: 'Does the WebP transparency survive?',
          a: 'Yes, entirely. Both formats have an alpha channel, so nothing has to be flattened and no background is invented. That is the difference between this pair and WebP to JPG, where transparency becomes white.',
        },
        {
          q: 'Why did the PNG get so much bigger?',
          a: 'Because PNG is lossless and the WebP was not. The source file saved room by discarding information the eye does not catch; the PNG records everything that is left, exactly as it stands. Growing three to five times is the normal outcome.',
        },
        {
          q: 'What if my WebP is animated?',
          a: 'Only the first frame comes out. An ordinary PNG has no way to carry the sequence, and the conversion draws the image onto a canvas, which holds one frame by definition. The page says so here rather than letting you find out in the downloaded file.',
        },
      ],
    },
  },
  {
    id: 'jpg-to-webp',
    tool: 'convert',
    target: 'WEBP',
    pathPt: 'imagem/jpg-para-webp',
    pathEn: 'image/jpg-to-webp',
    pt: {
      h1: 'JPG para WebP',
      sub: 'Converta JPEG em WebP para deixar a página mais leve.',
      title: 'Converter JPG para WebP Online (Mais Leve) — Nada Sai',
      description:
        'Converta JPG em WebP direto no navegador. O WebP costuma entregar o mesmo aspecto num arquivo menor — sem cadastro e sem upload.',
      sections: [
        {
          h: 'Menor no mesmo aspecto',
          p: [
            'Para a mesma aparência, o WebP costuma ocupar bem menos que o JPEG — a diferença cresce quanto maior a imagem. Numa página com muitas fotos, é a troca de formato que mais mexe no tempo de carregamento sem tocar em mais nada.',
            'A qualidade de saída é 0,9. Isso é uma decisão sobre a aparência do resultado, não sobre quanto do original sobra: o que o JPEG já tinha descartado continua descartado.',
          ],
        },
        {
          h: 'É uma segunda geração de perda',
          p: [
            'JPEG e WebP são os dois com perda, então esta conversão descarta uma segunda vez. Numa foto bem comprimida a olho nu não muda nada; num JPEG que já estava sofrido — salvo e resalvo várias vezes — a segunda geração aparece nas bordas.',
            'A regra prática é converter a partir do melhor original que você tiver, e não do arquivo que já passou por três programas. Se o original ainda existe em PNG ou RAW, comece de lá.',
          ],
        },
      ],
      faq: [
        {
          q: 'Vale a pena converter JPG para WebP?',
          a: 'Para imagem que vai para a web, quase sempre: o mesmo aspecto num arquivo bem menor, e todos os navegadores atuais abrem. Para arquivo que vai ser enviado por e-mail, impresso ou aberto em programa de escritório, muitas vezes não vale — o suporte fora do navegador continua irregular.',
        },
        {
          q: 'A imagem perde qualidade nessa conversão?',
          a: 'Sim, um pouco: os dois formatos são com perda, então gravar em WebP descarta uma segunda vez. Num JPEG de boa qualidade a diferença não é visível; num que já foi salvo e resalvo várias vezes, ela aparece nas bordas. Converta sempre do melhor original que tiver.',
        },
        {
          q: 'O WebP resultante tem transparência?',
          a: 'Não, porque a origem não tinha. O formato suporta canal alfa, mas um JPEG é opaco e a conversão não inventa recorte. Para tirar o fundo, passe pela remoção de fundo antes: ela devolve alfa de verdade e o resultado chega aqui pela cadeia.',
        },
      ],
    },
    en: {
      h1: 'JPG to WebP',
      sub: 'Convert JPEG to WebP to make the page lighter.',
      title: 'Convert JPG to WebP Online (Lighter Files) — Nada Sai',
      description:
        'Convert JPG to WebP right in the browser. WebP usually delivers the same look in a smaller file — no signup, no upload.',
      sections: [
        {
          h: 'Smaller at the same look',
          p: [
            'For the same appearance, WebP usually takes far less room than JPEG — and the gap widens as the image gets larger. On a page full of photographs, it is the format change that moves load time the most without touching anything else.',
            'The output quality is 0.9. That is a decision about how the result looks, not about how much of the original survives: whatever JPEG already discarded stays discarded.',
          ],
        },
        {
          h: 'It is a second generation of loss',
          p: [
            'JPEG and WebP are both lossy, so this conversion discards a second time. On a well-compressed photo nothing changes to the eye; on a JPEG that has already been through the mill — saved and re-saved several times — the second generation shows at the edges.',
            'The rule of thumb is to convert from the best original you have, not from the file that already passed through three programs. If the original still exists as PNG or RAW, start there.',
          ],
        },
      ],
      faq: [
        {
          q: 'Is converting JPG to WebP worth it?',
          a: 'For imagery headed to the web, almost always: the same look in a much smaller file, and every current browser opens it. For a file that will be emailed, printed or opened in office software, often not — support outside the browser is still uneven.',
        },
        {
          q: 'Does the image lose quality in this conversion?',
          a: 'Yes, a little: both formats are lossy, so writing WebP discards a second time. On a good-quality JPEG the difference is not visible; on one saved and re-saved several times it shows at the edges. Always convert from the best original you have.',
        },
        {
          q: 'Does the resulting WebP have transparency?',
          a: 'No, because the source had none. The format supports an alpha channel, but a JPEG is opaque and the conversion does not invent a cutout. To remove the background, run background removal first: it returns real alpha, and the result reaches this tool through the chain.',
        },
      ],
    },
  },
  {
    id: 'webp-to-jpg',
    tool: 'convert',
    target: 'JPEG',
    pathPt: 'imagem/webp-para-jpg',
    pathEn: 'image/webp-to-jpg',
    pt: {
      h1: 'WebP para JPG',
      sub: 'Converta WebP em JPEG para onde só JPG é aceito.',
      title: 'Converter WebP para JPG Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta WebP em JPG direto no navegador. É a saída para formulários, impressoras e programas que só aceitam JPEG.',
      sections: [
        {
          h: 'Compatibilidade, e um fundo branco no caminho',
          p: [
            'Este par existe pelo mesmo motivo do WebP para PNG: alguma coisa do outro lado não abre WebP. A diferença é o preço. O JPEG não tem canal alfa, então se o seu WebP tinha transparência ela é preenchida com BRANCO, fixo — sem seletor de fundo.',
            'Se o recorte importa, o destino certo é PNG, que mantém o alfa e é aceito praticamente em todo lugar que aceita JPEG.',
          ],
        },
        {
          h: 'Perda sobre perda',
          p: [
            'Os dois formatos são com perda, então gravar o JPEG descarta uma segunda vez sobre o que o WebP já tinha descartado. A 0,92 isso é invisível numa foto e perceptível em texto pequeno ou linha fina, que é onde o artefato do JPEG mais aparece.',
            'De um WebP animado sai apenas o primeiro quadro, pela mesma razão de sempre: a conversão desenha num canvas, e canvas guarda um quadro.',
          ],
        },
      ],
      faq: [
        {
          q: 'A transparência do WebP some ao virar JPG?',
          a: 'Sim. O JPEG não tem canal alfa, então cada pixel transparente é preenchido com branco antes de gravar — e isso é fixo nesta conversão. Se o recorte importa, converta para PNG, que mantém o alfa e é aceito quase em todo lugar que aceita JPEG.',
        },
        {
          q: 'Perde qualidade converter WebP para JPG?',
          a: 'Um pouco. Os dois formatos são com perda, então o JPEG descarta uma segunda vez sobre o que o WebP já tinha descartado. Na qualidade usada aqui, 0,92, isso não aparece em foto; aparece em texto pequeno e linha fina, que é onde o artefato do JPEG é mais visível.',
        },
        {
          q: 'Por que preciso converter, se o WebP é melhor?',
          a: 'Porque "melhor" só vale dentro do navegador. Fora dele — formulário de upload antigo, sistema de impressão, programa de escritório, alguns aplicativos de celular — o WebP simplesmente não abre, e o JPEG abre em todos. A conversão é sobre onde o arquivo vai, não sobre qual formato é superior.',
        },
      ],
    },
    en: {
      h1: 'WebP to JPG',
      sub: 'Convert WebP to JPEG for places that only take JPG.',
      title: 'Convert WebP to JPG Online (Free, Offline) — Nada Sai',
      description:
        'Convert WebP to JPG right in the browser. It is the way out for forms, printers and software that only accept JPEG.',
      sections: [
        {
          h: 'Compatibility, with a white background on the way',
          p: [
            'This pair exists for the same reason as WebP to PNG: something on the other side does not open WebP. The difference is the price. JPEG has no alpha channel, so if your WebP carried transparency it is filled with WHITE, fixed — no background picker.',
            'If the cutout matters, PNG is the right destination: it keeps the alpha and is accepted virtually everywhere JPEG is.',
          ],
        },
        {
          h: 'Loss on top of loss',
          p: [
            'Both formats are lossy, so writing the JPEG discards a second time on top of what WebP had already discarded. At 0.92 that is invisible on a photograph and noticeable on small text or thin lines, which is where JPEG artefacts show most.',
            'From an animated WebP only the first frame comes out, for the usual reason: the conversion draws onto a canvas, and a canvas holds one frame.',
          ],
        },
      ],
      faq: [
        {
          q: 'Does WebP transparency disappear when it becomes JPG?',
          a: 'Yes. JPEG has no alpha channel, so every transparent pixel is filled with white before writing — and that is fixed in this conversion. If the cutout matters, convert to PNG, which keeps the alpha and is accepted almost everywhere JPEG is.',
        },
        {
          q: 'Does converting WebP to JPG lose quality?',
          a: 'A little. Both formats are lossy, so JPEG discards a second time on top of what WebP had already discarded. At the quality used here, 0.92, it does not show on a photograph; it shows on small text and thin lines, where JPEG artefacts are most visible.',
        },
        {
          q: 'Why convert at all, if WebP is better?',
          a: 'Because "better" only holds inside the browser. Outside it — an older upload form, a print system, office software, some phone apps — WebP simply does not open, and JPEG opens everywhere. The conversion is about where the file is going, not about which format is superior.',
        },
      ],
    },
  },
  {
    id: 'avif-to-jpg',
    tool: 'convert',
    target: 'JPEG',
    pathPt: 'imagem/avif-para-jpg',
    pathEn: 'image/avif-to-jpg',
    pt: {
      h1: 'AVIF para JPG',
      sub: 'Abra um AVIF e grave em JPEG, sem enviar o arquivo.',
      title: 'Converter AVIF para JPG Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta AVIF em JPG direto no navegador. O AVIF é lido aqui, mas não é escrito — e esta página explica por quê.',
      sections: [
        {
          h: 'AVIF entra, e não sai',
          p: [
            'O navegador DECODIFICA AVIF sem problema, e é por isso que esta conversão funciona. Ele não CODIFICA: `canvas.toBlob("image/avif")` não é suportado por navegador nenhum e, pela especificação, um tipo não suportado cai em silêncio para PNG — não lança erro nem devolve nulo.',
            'Este produto já tropeçou nisso: uma versão antiga oferecia AVIF como destino e entregava bytes de PNG dentro de um arquivo chamado `.avif`. AVIF saiu da lista de saída por causa disso, e continua aceito na entrada. Escrever AVIF de verdade exigiria um codificador WASM de centenas de kilobytes.',
          ],
        },
        {
          h: 'O que esperar do arquivo que sai',
          p: [
            'O JPEG é gravado a 0,92 a partir da imagem decodificada. O AVIF costuma ser menor que o JPEG equivalente, então o arquivo tende a crescer — o que você ganha é abrir em qualquer lugar.',
            'Se o AVIF de origem tinha transparência, ela é preenchida com branco: JPEG não tem canal alfa. Para preservar o recorte, converta para PNG ou WebP.',
          ],
        },
      ],
      faq: [
        {
          q: 'Dá para converter uma imagem PARA AVIF aqui?',
          a: 'Não, e a ausência é deliberada. Nenhum navegador implementa a codificação de AVIF em canvas, e a especificação manda cair em silêncio para PNG quando o tipo não é suportado — ou seja, a ferramenta entregaria bytes de PNG num arquivo com extensão .avif. Preferimos não oferecer a oferecer isso.',
        },
        {
          q: 'Por que o JPG ficou maior que o AVIF original?',
          a: 'Porque o AVIF comprime melhor. Para a mesma aparência ele costuma ocupar bem menos que o JPEG, então converter na direção do JPEG quase sempre aumenta o arquivo. O que se ganha é compatibilidade: JPEG abre em qualquer programa, e AVIF ainda não.',
        },
        {
          q: 'E se o AVIF tiver transparência?',
          a: 'Ela é preenchida com branco, porque o JPEG não tem canal alfa. Se o recorte importa, escolha PNG ou WebP como destino: os dois guardam alfa e os dois abrem o AVIF de origem do mesmo jeito.',
        },
      ],
    },
    en: {
      h1: 'AVIF to JPG',
      sub: 'Open an AVIF and write JPEG, with no upload.',
      title: 'Convert AVIF to JPG Online (Free, Offline) — Nada Sai',
      description:
        'Convert AVIF to JPG right in the browser. AVIF is read here but not written — and this page explains why.',
      sections: [
        {
          h: 'AVIF goes in, and does not come out',
          p: [
            'The browser DECODES AVIF without trouble, which is why this conversion works. It does not ENCODE it: `canvas.toBlob("image/avif")` is supported by no browser and, per the specification, an unsupported type silently falls back to PNG — it does not throw and does not return null.',
            'This product tripped over exactly that: an older version offered AVIF as a destination and delivered PNG bytes inside a file named `.avif`. AVIF left the output list because of it, and stays accepted as input. Writing real AVIF would need a WASM encoder of several hundred kilobytes.',
          ],
        },
        {
          h: 'What to expect from the file that comes out',
          p: [
            'The JPEG is written at 0.92 from the decoded image. AVIF is usually smaller than the equivalent JPEG, so the file tends to grow — what you gain is opening it anywhere.',
            'If the source AVIF carried transparency, it is filled with white: JPEG has no alpha channel. To keep the cutout, convert to PNG or WebP instead.',
          ],
        },
      ],
      faq: [
        {
          q: 'Can I convert an image TO AVIF here?',
          a: 'No, and the absence is deliberate. No browser implements AVIF encoding in a canvas, and the specification says to fall back silently to PNG when the type is unsupported — meaning the tool would hand you PNG bytes in a file with an .avif extension. We would rather not offer it than offer that.',
        },
        {
          q: 'Why is the JPG bigger than the original AVIF?',
          a: 'Because AVIF compresses better. For the same appearance it usually takes far less room than JPEG, so converting towards JPEG almost always grows the file. What you gain is compatibility: JPEG opens in any program, and AVIF still does not.',
        },
        {
          q: 'What if the AVIF has transparency?',
          a: 'It is filled with white, because JPEG has no alpha channel. If the cutout matters, pick PNG or WebP as the destination: both keep alpha, and both read the source AVIF just the same.',
        },
      ],
    },
  },
  {
    id: 'gif-to-png',
    tool: 'convert',
    target: 'PNG',
    pathPt: 'imagem/gif-para-png',
    pathEn: 'image/gif-to-png',
    pt: {
      h1: 'GIF para PNG',
      sub: 'Converta um GIF em PNG — o primeiro quadro, sem enviar o arquivo.',
      title: 'Converter GIF para PNG Online (Primeiro Quadro) — Nada Sai',
      description:
        'Converta GIF em PNG direto no navegador. De um GIF animado sai o primeiro quadro: o PNG não carrega a sequência, e a página diz isso antes.',
      sections: [
        {
          h: 'De um GIF animado sai UM quadro',
          p: [
            'Esta é a coisa mais importante desta página, e vem antes de qualquer outra: se o seu GIF se move, o PNG que sai daqui não se move. A conversão decodifica a imagem e a desenha num canvas, e um canvas guarda um quadro — o primeiro.',
            'Não é uma limitação que dá para contornar mudando de opção: o PNG comum não tem como representar uma sequência. Dizer isso aqui é melhor do que deixar você descobrir no arquivo baixado.',
          ],
        },
        {
          h: 'Quando a troca vale',
          p: [
            'GIF guarda no máximo 256 cores e uma transparência binária — um pixel é opaco ou é invisível, sem meio-termo. O PNG guarda cor de 24 bits e alfa contínuo, então converter é o passo certo quando o GIF é uma imagem estática que você vai editar: as bordas param de serrilhar a cada edição.',
            'Para arte estática de poucas cores o PNG costuma até ficar menor que o GIF. Para foto salva como GIF — que existe e é sempre um erro de origem — o PNG fica maior, mas a imagem para de perder cor a cada regravação.',
          ],
        },
      ],
      faq: [
        {
          q: 'A animação do GIF é preservada no PNG?',
          a: 'Não. Sai o primeiro quadro e mais nada. O PNG comum não carrega sequência, e a conversão desenha a imagem num canvas, que guarda um quadro por definição. Se você precisa de algo que se mova, o GIF continua sendo o formato — e a ferramenta de vídeo para GIF monta um a partir de um vídeo.',
        },
        {
          q: 'O PNG melhora as cores do GIF?',
          a: 'Não recupera o que o GIF já jogou fora, mas impede que se perca mais. O GIF guarda no máximo 256 cores; o PNG guarda 24 bits. As cores que sobraram passam intactas e param de ser reduzidas a cada nova edição — o ganho é daqui para a frente, não para trás.',
        },
        {
          q: 'E a transparência?',
          a: 'Ela atravessa, e melhora de tipo. A transparência do GIF é binária: um pixel é totalmente opaco ou totalmente invisível, o que produz a borda serrilhada típica do formato. O PNG guarda alfa contínuo, então a partir daqui dá para suavizar essa borda — a serrilha que já existe, porém, continua onde está.',
        },
      ],
    },
    en: {
      h1: 'GIF to PNG',
      sub: 'Convert a GIF to PNG — the first frame, with no upload.',
      title: 'Convert GIF to PNG Online (First Frame) — Nada Sai',
      description:
        'Convert GIF to PNG right in the browser. From an animated GIF you get the first frame: PNG carries no sequence, and the page says so up front.',
      sections: [
        {
          h: 'From an animated GIF you get ONE frame',
          p: [
            'This is the most important thing on this page, and it comes before anything else: if your GIF moves, the PNG that comes out of here does not. The conversion decodes the image and draws it onto a canvas, and a canvas holds one frame — the first.',
            'It is not a limitation you can work around by changing an option: an ordinary PNG cannot represent a sequence. Saying so here is better than letting you find out in the downloaded file.',
          ],
        },
        {
          h: 'When the trade is worth it',
          p: [
            'GIF holds at most 256 colours and a binary transparency — a pixel is either opaque or invisible, with nothing in between. PNG holds 24-bit colour and continuous alpha, so converting is the right step when the GIF is a static image you are going to edit: the edges stop jagging with every save.',
            'For static artwork with few colours, PNG often ends up smaller than the GIF. For a photograph saved as GIF — which happens, and is always a mistake at the source — the PNG is larger, but the image stops losing colour on every re-save.',
          ],
        },
      ],
      faq: [
        {
          q: 'Is the GIF animation preserved in the PNG?',
          a: 'No. You get the first frame and nothing else. An ordinary PNG carries no sequence, and the conversion draws the image onto a canvas, which holds one frame by definition. If you need something that moves, GIF is still the format — and the video-to-GIF tool builds one from a video.',
        },
        {
          q: 'Does PNG improve the GIF colours?',
          a: 'It does not recover what the GIF already threw away, but it stops more from being lost. GIF holds at most 256 colours; PNG holds 24-bit. The colours that survived pass through intact and stop being reduced on every new edit — the gain is forward-looking, not retroactive.',
        },
        {
          q: 'And the transparency?',
          a: 'It crosses over, and improves in kind. GIF transparency is binary: a pixel is either fully opaque or fully invisible, which produces the jagged edge the format is known for. PNG holds continuous alpha, so from here you can soften that edge — the jaggedness already baked in, however, stays where it is.',
        },
      ],
    },
  },

  {
    id: 'bmp-to-png',
    tool: 'convert',
    target: 'PNG',
    pathPt: 'imagem/bmp-para-png',
    pathEn: 'image/bmp-to-png',
    pt: {
      h1: 'BMP para PNG',
      sub: 'Converta BMP em PNG sem perder um pixel — e com uma fração do tamanho.',
      title: 'Converter BMP para PNG Online (Sem Perda) — Nada Sai',
      description:
        'Converta BMP em PNG direto no navegador. Os dois são sem perda, então a imagem é idêntica — o que muda é o tamanho, que costuma cair para uma fração.',
      sections: [
        {
          h: 'Sem perda dos dois lados, e mesmo assim muito menor',
          p: [
            'Esta é a conversão mais fácil de justificar da lista: BMP e PNG são ambos sem perda, então a imagem que sai é idêntica pixel a pixel à que entrou. Nenhuma decisão de qualidade, nenhum artefato, nenhuma troca.',
            'O que muda é o tamanho. O BMP guarda cada pixel cru, sem compressão nenhuma na forma mais comum: uma captura de tela de 1920 por 1080 ocupa cerca de 8 MB. O PNG comprime sem descartar nada e costuma entregar a mesma imagem em uma fração disso.',
          ],
        },
        {
          h: 'O que mais o PNG ganha',
          p: [
            'Suporte universal. O BMP é um formato do Windows e continua sendo mal aceito fora dele: sites recusam, celulares hesitam, e boa parte dos aplicativos web nem lista a extensão. O PNG abre em qualquer lugar.',
            'E canal alfa de verdade. O BMP tem transparência apenas em variantes de 32 bits que quase ninguém escreve; o PNG a carrega sempre, então a partir daqui dá para recortar o fundo e o resultado se comporta como se espera.',
          ],
        },
      ],
      faq: [
        {
          q: 'Converter BMP para PNG perde qualidade?',
          a: 'Nenhuma. Os dois formatos são sem perda, então a imagem resultante é idêntica pixel a pixel à original. É a diferença desta conversão para quase todas as outras: aqui não há troca a fazer, só um arquivo muito menor com exatamente o mesmo conteúdo.',
        },
        {
          q: 'Quanto menor fica?',
          a: 'Depende do conteúdo, mas a queda costuma ser grande porque o ponto de partida é alto: um BMP comum não comprime nada e gasta três ou quatro bytes por pixel. Numa captura de tela ou num desenho com áreas chapadas, o PNG entrega a mesma imagem em uma fração do tamanho.',
        },
        {
          q: 'Por que ainda existem arquivos BMP?',
          a: 'Porque é o formato que o Windows historicamente usa em ferramentas simples — o Paint antigo, capturas de tela coladas, saída de alguns scanners e equipamentos industriais. Ele é fácil de escrever, o que o mantém vivo em software embarcado; e é pesado e mal aceito, que é o motivo de quase sempre valer a pena converter.',
        },
      ],
    },
    en: {
      h1: 'BMP to PNG',
      sub: 'Convert BMP to PNG without losing a pixel — at a fraction of the size.',
      title: 'Convert BMP to PNG Online (Lossless) — Nada Sai',
      description:
        'Convert BMP to PNG right in the browser. Both are lossless, so the image is identical — what changes is the size, which usually drops to a fraction.',
      sections: [
        {
          h: 'Lossless on both sides, and still far smaller',
          p: [
            'This is the easiest conversion on the list to justify: BMP and PNG are both lossless, so the image that comes out is identical pixel for pixel to the one that went in. No quality decision, no artefacts, no trade.',
            'What changes is size. BMP stores every pixel raw, with no compression at all in its most common form: a 1920 by 1080 screenshot takes around 8 MB. PNG compresses without discarding anything and usually delivers the same image in a fraction of that.',
          ],
        },
        {
          h: 'What else PNG gains you',
          p: [
            'Universal support. BMP is a Windows format and remains poorly accepted outside it: websites refuse it, phones hesitate, and plenty of web applications do not even list the extension. PNG opens everywhere.',
            'And a real alpha channel. BMP only has transparency in 32-bit variants almost nobody writes; PNG always carries it, so from here you can cut the background out and the result behaves as expected.',
          ],
        },
      ],
      faq: [
        {
          q: 'Does converting BMP to PNG lose quality?',
          a: 'None at all. Both formats are lossless, so the resulting image is identical pixel for pixel to the original. That is what sets this conversion apart from almost every other one: there is no trade to make, just a much smaller file with exactly the same content.',
        },
        {
          q: 'How much smaller does it get?',
          a: 'It depends on the content, but the drop is usually large because the starting point is high: an ordinary BMP compresses nothing and spends three or four bytes per pixel. On a screenshot or line art with flat areas, PNG delivers the same image in a fraction of the size.',
        },
        {
          q: 'Why do BMP files still exist?',
          a: 'Because it is the format Windows historically uses in simple tools — old Paint, pasted screenshots, output from some scanners and industrial equipment. It is easy to write, which keeps it alive in embedded software; and it is heavy and poorly accepted, which is why converting is almost always worth it.',
        },
      ],
    },
  },
  {
    id: 'bmp-to-jpg',
    tool: 'convert',
    target: 'JPEG',
    pathPt: 'imagem/bmp-para-jpg',
    pathEn: 'image/bmp-to-jpg',
    pt: {
      h1: 'BMP para JPG',
      sub: 'Converta BMP em JPEG e troque megabytes por kilobytes.',
      title: 'Converter BMP para JPG Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta BMP em JPG direto no navegador. A queda de tamanho é a maior da lista, porque o BMP não comprime nada e o JPEG comprime muito.',
      sections: [
        {
          h: 'A maior queda de tamanho da lista',
          p: [
            'O BMP guarda cada pixel cru e o JPEG descarta o que o olho não capta. A distância entre os dois é a maior que existe entre um formato de entrada e um de saída aqui: uma foto que ocupa vários megabytes em BMP costuma sair com algumas centenas de kilobytes.',
            'A qualidade usada é 0,92. Em fotografia essa diferença não aparece; em captura de tela com texto pequeno e linhas finas ela aparece, e ali o destino certo é PNG, que é sem perda e ainda assim muito menor que o BMP.',
          ],
        },
        {
          h: 'Escolha pelo conteúdo, não pelo tamanho',
          p: [
            'Se o BMP é uma FOTOGRAFIA, JPEG é o destino óbvio: menor, aceito em todo lugar, e a perda não se vê.',
            'Se é um desenho, um diagrama, uma captura de tela ou qualquer coisa com áreas de cor chapada e bordas duras, prefira PNG. O JPEG acrescenta chiado em volta de cada borda dura, e num conteúdo desses o PNG frequentemente sai até menor — porque é exatamente o tipo de imagem que ele comprime melhor.',
          ],
        },
      ],
      faq: [
        {
          q: 'Quanto menor fica um BMP virando JPG?',
          a: 'A diferença é de ordem de grandeza. Um BMP não comprime nada e gasta três ou quatro bytes por pixel, então uma foto grande facilmente ocupa dezenas de megabytes; o mesmo conteúdo em JPEG cabe em algumas centenas de kilobytes. É a maior queda entre os pares desta lista.',
        },
        {
          q: 'Devo escolher JPG ou PNG a partir de um BMP?',
          a: 'Pelo conteúdo. Fotografia vai para JPEG: menor, aceito em todo lugar, e a perda não se vê. Desenho, diagrama, captura de tela ou qualquer coisa com cor chapada e borda dura vai para PNG, que é sem perda, não acrescenta chiado nas bordas e nesse tipo de imagem costuma sair até menor que o JPEG.',
        },
        {
          q: 'A transparência do BMP sobrevive?',
          a: 'Não, e na maioria dos casos não havia transparência para perder: o BMP só a suporta em variantes de 32 bits que quase nenhum programa escreve. Se o seu arquivo for uma dessas, o alfa é preenchido com branco, porque o JPEG não tem canal alfa. Para preservá-lo, converta para PNG ou WebP.',
        },
      ],
    },
    en: {
      h1: 'BMP to JPG',
      sub: 'Convert BMP to JPEG and trade megabytes for kilobytes.',
      title: 'Convert BMP to JPG Online (Free, Offline) — Nada Sai',
      description:
        'Convert BMP to JPG right in the browser. The size drop is the largest on the list, because BMP compresses nothing and JPEG compresses a lot.',
      sections: [
        {
          h: 'The largest size drop on the list',
          p: [
            'BMP stores every pixel raw and JPEG discards what the eye does not catch. The distance between the two is the widest between any input and output format here: a photo taking several megabytes as BMP usually comes out at a few hundred kilobytes.',
            'The quality used is 0.92. On photographs that difference does not show; on a screenshot with small text and thin lines it does, and there the right destination is PNG, which is lossless and still far smaller than the BMP.',
          ],
        },
        {
          h: 'Choose by content, not by size',
          p: [
            'If the BMP is a PHOTOGRAPH, JPEG is the obvious destination: smaller, accepted everywhere, and the loss does not show.',
            'If it is line art, a diagram, a screenshot or anything with flat colour areas and hard edges, prefer PNG. JPEG adds ringing around every hard edge, and on that kind of content PNG often comes out smaller anyway — because it is exactly the kind of image it compresses best.',
          ],
        },
      ],
      faq: [
        {
          q: 'How much smaller does a BMP get as a JPG?',
          a: 'The difference is an order of magnitude. A BMP compresses nothing and spends three or four bytes per pixel, so a large photo easily takes tens of megabytes; the same content as JPEG fits in a few hundred kilobytes. It is the biggest drop among the pairs on this list.',
        },
        {
          q: 'Should I pick JPG or PNG from a BMP?',
          a: 'By content. Photographs go to JPEG: smaller, accepted everywhere, and the loss does not show. Line art, diagrams, screenshots or anything with flat colour and hard edges goes to PNG, which is lossless, adds no ringing at the edges, and on that kind of image often comes out smaller than the JPEG anyway.',
        },
        {
          q: 'Does BMP transparency survive?',
          a: 'No, and in most cases there was no transparency to lose: BMP only supports it in 32-bit variants almost no program writes. If yours is one of those, the alpha is filled with white, because JPEG has no alpha channel. To keep it, convert to PNG or WebP instead.',
        },
      ],
    },
  },
  {
    id: 'avif-to-png',
    tool: 'convert',
    target: 'PNG',
    pathPt: 'imagem/avif-para-png',
    pathEn: 'image/avif-to-png',
    pt: {
      h1: 'AVIF para PNG',
      sub: 'Abra um AVIF e grave em PNG, com a transparência preservada.',
      title: 'Converter AVIF para PNG Online (Mantém Alfa) — Nada Sai',
      description:
        'Converta AVIF em PNG direto no navegador, com o canal alfa intacto. É a saída quando o programa do outro lado não abre AVIF.',
      sections: [
        {
          h: 'Quando o destino não abre AVIF',
          p: [
            'O AVIF é o formato mais eficiente que os navegadores atuais leem, e é justamente por ser novo que ele não abre em tanto lugar: editores de imagem mais antigos, sistemas de impressão, formulários de upload e boa parte do software de escritório ainda o recusam.',
            'O PNG é o oposto: pesado e universal. Esta conversão troca eficiência por compatibilidade, e é quase sempre por isso que ela é feita.',
          ],
        },
        {
          h: 'Alfa preservado, arquivo maior',
          p: [
            'Os dois formatos têm canal alfa, então um recorte atravessa intacto — não há fundo inventado nem transparência achatada. É a diferença desta conversão para o AVIF para JPG, onde o alfa vira branco.',
            'O tamanho vai na direção contrária: o AVIF costuma ocupar bem menos que o PNG equivalente, então o arquivo cresce, muitas vezes várias vezes. É o preço do formato sem perda que abre em qualquer lugar. Se o destino aceitar WebP, ele é o meio-termo: mantém alfa e fica bem menor que o PNG.',
          ],
        },
      ],
      faq: [
        {
          q: 'A transparência do AVIF é preservada?',
          a: 'Sim, inteira. Os dois formatos têm canal alfa, então nada precisa ser achatado e nenhum fundo é inventado. É a diferença entre este par e o AVIF para JPG, onde cada pixel transparente é preenchido com branco.',
        },
        {
          q: 'Por que o PNG ficou muito maior que o AVIF?',
          a: 'Porque o PNG é sem perda e o AVIF é um dos formatos com perda mais eficientes que existem. O AVIF economizava descartando informação que o olho não capta; o PNG grava tudo o que sobrou, exatamente como está. Crescer várias vezes é o resultado normal, não um defeito.',
        },
        {
          q: 'Dá para converter uma imagem PARA AVIF aqui?',
          a: 'Não, e a ausência é deliberada. Nenhum navegador implementa a codificação de AVIF em canvas, e a especificação manda cair em silêncio para PNG quando o tipo não é suportado — a ferramenta entregaria bytes de PNG num arquivo com extensão .avif. Uma versão antiga deste produto fazia exatamente isso, e foi por isso que o AVIF saiu da lista de saída.',
        },
      ],
    },
    en: {
      h1: 'AVIF to PNG',
      sub: 'Open an AVIF and write PNG, with transparency preserved.',
      title: 'Convert AVIF to PNG Online (Keeps Alpha) — Nada Sai',
      description:
        'Convert AVIF to PNG right in the browser, alpha channel intact. It is the way out when the software on the other side does not open AVIF.',
      sections: [
        {
          h: 'When the destination does not open AVIF',
          p: [
            'AVIF is the most efficient format current browsers read, and it is precisely because it is new that it does not open in many places: older image editors, print systems, upload forms and much office software still refuse it.',
            'PNG is the opposite: heavy and universal. This conversion trades efficiency for compatibility, and that is almost always why it is made.',
          ],
        },
        {
          h: 'Alpha preserved, file larger',
          p: [
            'Both formats have an alpha channel, so a cutout crosses over intact — no invented background, no flattened transparency. That is the difference between this conversion and AVIF to JPG, where alpha becomes white.',
            'Size goes the other way: AVIF usually takes far less room than the equivalent PNG, so the file grows, often several times over. That is the price of a lossless format that opens anywhere. If the destination accepts WebP, it is the middle ground: keeps alpha and lands far below PNG.',
          ],
        },
      ],
      faq: [
        {
          q: 'Is the AVIF transparency preserved?',
          a: 'Yes, entirely. Both formats have an alpha channel, so nothing has to be flattened and no background is invented. That is the difference between this pair and AVIF to JPG, where every transparent pixel is filled with white.',
        },
        {
          q: 'Why is the PNG so much bigger than the AVIF?',
          a: 'Because PNG is lossless and AVIF is one of the most efficient lossy formats there is. AVIF saved room by discarding information the eye does not catch; PNG records everything that is left, exactly as it stands. Growing several times over is the normal outcome, not a fault.',
        },
        {
          q: 'Can I convert an image TO AVIF here?',
          a: 'No, and the absence is deliberate. No browser implements AVIF encoding in a canvas, and the specification says to fall back silently to PNG when the type is unsupported — the tool would hand you PNG bytes in a file with an .avif extension. An older version of this product did exactly that, and it is why AVIF left the output list.',
        },
      ],
    },
  },
  {
    id: 'avif-to-webp',
    tool: 'convert',
    target: 'WEBP',
    pathPt: 'imagem/avif-para-webp',
    pathEn: 'image/avif-to-webp',
    pt: {
      h1: 'AVIF para WebP',
      sub: 'Ganhe compatibilidade sem voltar ao peso do PNG.',
      title: 'Converter AVIF para WebP Online (Mantém Alfa) — Nada Sai',
      description:
        'Converta AVIF em WebP direto no navegador. O WebP abre em mais lugares que o AVIF e continua muito mais leve que o PNG.',
      sections: [
        {
          h: 'O meio-termo entre eficiência e suporte',
          p: [
            'Sair de AVIF costuma ser uma decisão de compatibilidade. O destino óbvio seria o PNG, mas ele é sem perda e o arquivo cresce muito. O WebP resolve os dois lados: abre em toda parte que o AVIF ainda não alcança dentro do navegador, mantém o canal alfa, e fica muito mais perto do tamanho do AVIF do que do PNG.',
            'A qualidade de saída é 0,9. Como os dois formatos são com perda, esta é uma segunda geração de compressão — em imagem bem produzida a diferença não aparece, mas ela existe e é bom saber.',
          ],
        },
        {
          h: 'Onde cada um ainda ganha',
          p: [
            'O AVIF continua sendo mais eficiente: para a mesma aparência ele ocupa menos que o WebP. Se o seu destino já o aceita, não há motivo para converter.',
            'O WebP ganha em alcance. Ele é suportado por navegadores há mais tempo, o que importa para quem ainda tem visitantes em versões antigas, e é aceito por bem mais ferramentas de terceiros — plataformas de publicação, geradores de site, plugins. Fora do navegador, porém, nenhum dos dois é confiável: ali o destino é PNG ou JPEG.',
          ],
        },
      ],
      faq: [
        {
          q: 'Por que converter AVIF para WebP em vez de PNG?',
          a: 'Porque o PNG é sem perda e faz o arquivo crescer muito, enquanto o WebP mantém o peso próximo do AVIF. Se o motivo da conversão é compatibilidade e o destino é um navegador ou uma plataforma web, o WebP entrega o alcance sem devolver os megabytes.',
        },
        {
          q: 'A transparência sobrevive?',
          a: 'Sim. Os dois formatos têm canal alfa, então um recorte atravessa intacto. É o motivo de este par e o AVIF para PNG serem os destinos certos quando há transparência em jogo — o AVIF para JPG preenche o alfa com branco.',
        },
        {
          q: 'Perde qualidade nessa conversão?',
          a: 'Um pouco: os dois formatos são com perda, então gravar o WebP descarta uma segunda vez sobre o que o AVIF já tinha descartado. Em imagem bem produzida a diferença não aparece; num AVIF já muito comprimido ela pode aparecer nas bordas. Converta sempre do melhor original que tiver.',
        },
      ],
    },
    en: {
      h1: 'AVIF to WebP',
      sub: 'Gain compatibility without going back to PNG weight.',
      title: 'Convert AVIF to WebP Online (Keeps Alpha) — Nada Sai',
      description:
        'Convert AVIF to WebP right in the browser. WebP opens in more places than AVIF and stays far lighter than PNG.',
      sections: [
        {
          h: 'The middle ground between efficiency and support',
          p: [
            'Leaving AVIF is usually a compatibility decision. The obvious destination would be PNG, but it is lossless and the file grows a lot. WebP solves both sides: it opens everywhere AVIF does not yet reach inside the browser, it keeps the alpha channel, and it lands far closer to AVIF size than to PNG.',
            'The output quality is 0.9. Since both formats are lossy, this is a second generation of compression — on well-produced imagery the difference does not show, but it exists and is worth knowing.',
          ],
        },
        {
          h: 'Where each one still wins',
          p: [
            'AVIF remains more efficient: for the same appearance it takes less room than WebP. If your destination already accepts it, there is no reason to convert.',
            'WebP wins on reach. It has been supported by browsers for longer, which matters if you still have visitors on older versions, and it is accepted by far more third-party tooling — publishing platforms, site generators, plugins. Outside the browser, though, neither is reliable: there the destination is PNG or JPEG.',
          ],
        },
      ],
      faq: [
        {
          q: 'Why convert AVIF to WebP rather than PNG?',
          a: 'Because PNG is lossless and makes the file grow a lot, while WebP keeps the weight close to the AVIF. If the reason for converting is compatibility and the destination is a browser or a web platform, WebP delivers the reach without handing back the megabytes.',
        },
        {
          q: 'Does transparency survive?',
          a: 'Yes. Both formats have an alpha channel, so a cutout crosses over intact. That is why this pair and AVIF to PNG are the right destinations when transparency is involved — AVIF to JPG fills the alpha with white.',
        },
        {
          q: 'Does it lose quality?',
          a: 'A little: both formats are lossy, so writing WebP discards a second time on top of what AVIF already discarded. On well-produced imagery the difference does not show; on an already heavily compressed AVIF it can show at the edges. Always convert from the best original you have.',
        },
      ],
    },
  },
  {
    id: 'gif-to-jpg',
    tool: 'convert',
    target: 'JPEG',
    pathPt: 'imagem/gif-para-jpg',
    pathEn: 'image/gif-to-jpg',
    pt: {
      h1: 'GIF para JPG',
      sub: 'Converta um GIF em JPEG — o primeiro quadro, sem transparência.',
      title: 'Converter GIF para JPG Online (Primeiro Quadro) — Nada Sai',
      description:
        'Converta GIF em JPG direto no navegador. De um GIF animado sai o primeiro quadro, e a transparência vira branco. A página diz isso antes.',
      sections: [
        {
          h: 'Duas coisas somem, e as duas antes de você baixar',
          p: [
            'A ANIMAÇÃO. Se o seu GIF se move, o JPEG que sai daqui não se move: a conversão desenha a imagem num canvas, e um canvas guarda um quadro — o primeiro. Não é contornável trocando de opção, porque o JPEG não tem como representar uma sequência.',
            'A TRANSPARÊNCIA. O GIF tem transparência binária — um pixel é opaco ou invisível — e o JPEG não tem nenhuma. Cada pixel invisível é preenchido com branco, fixo.',
          ],
        },
        {
          h: 'Quando faz sentido, e quando o destino é outro',
          p: [
            'Faz sentido quando o GIF é uma FOTOGRAFIA estática salva no formato errado, o que acontece com frequência em arquivos antigos e em material vindo de sistemas legados. Ali o JPEG comprime muito melhor um conteúdo fotográfico do que o GIF, que só tem 256 cores.',
            'Não faz sentido para desenho, ícone ou qualquer coisa com áreas chapadas: o JPEG acrescenta chiado em volta das bordas duras, e o PNG é o destino certo — mantém a transparência e costuma ficar menor. E se a animação importa, nenhum dos dois serve: o GIF continua sendo o formato, e a ferramenta de vídeo para GIF monta um a partir de um vídeo.',
          ],
        },
      ],
      faq: [
        {
          q: 'A animação do GIF é preservada no JPG?',
          a: 'Não. Sai o primeiro quadro e mais nada. O JPEG não carrega sequência, e a conversão desenha a imagem num canvas, que guarda um quadro por definição. A página avisa disso aqui em vez de deixar você descobrir no arquivo baixado.',
        },
        {
          q: 'O que acontece com a transparência?',
          a: 'Vira branco. A transparência do GIF é binária — um pixel é totalmente opaco ou totalmente invisível — e o JPEG não tem canal alfa nenhum, então cada pixel invisível é preenchido, com branco fixo. Se o recorte importa, converta para PNG, que guarda alfa contínuo.',
        },
        {
          q: 'Devo escolher JPG ou PNG a partir de um GIF?',
          a: 'PNG na maior parte dos casos: ele mantém a transparência, não acrescenta chiado nas bordas duras típicas de um GIF e costuma ficar menor em conteúdo de poucas cores. JPG só vale quando o GIF é na verdade uma fotografia estática salva no formato errado — ali o JPEG comprime muito melhor do que 256 cores conseguem.',
        },
      ],
    },
    en: {
      h1: 'GIF to JPG',
      sub: 'Convert a GIF to JPEG — the first frame, with no transparency.',
      title: 'Convert GIF to JPG Online (First Frame) — Nada Sai',
      description:
        'Convert GIF to JPG right in the browser. From an animated GIF you get the first frame, and transparency becomes white. The page says so up front.',
      sections: [
        {
          h: 'Two things disappear, and both before you download',
          p: [
            'The ANIMATION. If your GIF moves, the JPEG that comes out does not: the conversion draws the image onto a canvas, and a canvas holds one frame — the first. It is not something you can work around by changing an option, because JPEG cannot represent a sequence.',
            'The TRANSPARENCY. GIF has binary transparency — a pixel is either opaque or invisible — and JPEG has none at all. Every invisible pixel is filled with white, fixed.',
          ],
        },
        {
          h: 'When it makes sense, and when the destination is different',
          p: [
            'It makes sense when the GIF is a static PHOTOGRAPH saved in the wrong format, which happens often in old archives and in material from legacy systems. There JPEG compresses photographic content far better than GIF, which only has 256 colours.',
            'It does not make sense for line art, icons or anything with flat areas: JPEG adds ringing around the hard edges, and PNG is the right destination — it keeps transparency and usually ends up smaller. And if the animation matters, neither works: GIF is still the format, and the video-to-GIF tool builds one from a video.',
          ],
        },
      ],
      faq: [
        {
          q: 'Is the GIF animation preserved in the JPG?',
          a: 'No. You get the first frame and nothing else. JPEG carries no sequence, and the conversion draws the image onto a canvas, which holds one frame by definition. The page says so here rather than letting you find out in the downloaded file.',
        },
        {
          q: 'What happens to the transparency?',
          a: 'It becomes white. GIF transparency is binary — a pixel is either fully opaque or fully invisible — and JPEG has no alpha channel at all, so every invisible pixel is filled, with fixed white. If the cutout matters, convert to PNG, which holds continuous alpha.',
        },
        {
          q: 'Should I pick JPG or PNG from a GIF?',
          a: 'PNG in most cases: it keeps the transparency, adds no ringing around the hard edges typical of a GIF, and usually ends up smaller on low-colour content. JPG is only worth it when the GIF is actually a static photograph saved in the wrong format — there JPEG compresses far better than 256 colours can.',
        },
      ],
    },
  },
  // ── Áudio ─────────────────────────────────────────────────────────────────
  {
    id: 'm4a-to-mp3',
    tool: 'convert-audio',
    target: 'mp3',
    pathPt: 'audio/m4a-para-mp3',
    pathEn: 'audio/m4a-to-mp3',
    pt: {
      h1: 'M4A para MP3',
      sub: 'Converta M4A em MP3 no navegador, sem enviar o arquivo.',
      title: 'Converter M4A para MP3 Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta M4A em MP3 direto no navegador. O áudio é decodificado e recodificado na sua máquina, sem upload e sem cadastro.',
      sections: [
        {
          h: 'Por que este par existe',
          p: [
            'M4A é o que o iPhone, o Apple Music e boa parte dos gravadores de voz produzem, e é o que aparelho de som de carro antigo, alguns tocadores e uma quantidade surpreendente de sistemas corporativos recusam. O MP3 abre em tudo, e é praticamente sempre por isso que se converte.',
            'A conversão acontece inteira no navegador: o arquivo é decodificado pela Web Audio API e recodificado por um encoder LAME em JavaScript. Nada é enviado.',
          ],
        },
        {
          h: 'É uma segunda geração de perda',
          p: [
            'M4A e MP3 são os dois com perda, e não existe caminho de um para o outro que não passe por decodificar e recodificar. O que o AAC dentro do M4A já tinha descartado não volta, e o MP3 descarta mais um pouco por cima.',
            'Na taxa padrão a diferença é difícil de ouvir em música e praticamente inaudível em voz. Se o arquivo é um master e você ainda vai editá-lo, converta para WAV: sem perda, arquivo grande, nenhuma geração acrescentada.',
          ],
        },
      ],
      faq: [
        {
          q: 'Converter M4A para MP3 piora o som?',
          a: 'Um pouco, e inevitavelmente. Os dois formatos são com perda, então a conversão decodifica o que sobrou do M4A e descarta mais um pouco ao gravar o MP3. Em voz é praticamente inaudível; em música é difícil de ouvir na taxa padrão. Para não acrescentar geração nenhuma, converta para WAV.',
        },
        {
          q: 'Preciso instalar alguma coisa?',
          a: 'Não. A decodificação é a do próprio navegador e o encoder de MP3 é uma porta do LAME em JavaScript que já vem com a página. O arquivo não sai do seu dispositivo em momento nenhum — o medidor no topo da tela mostra isso enquanto você trabalha.',
        },
        {
          q: 'Há limite de tamanho ou duração?',
          a: 'Sim: 100 MB de arquivo e 30 minutos de duração. O limite de duração não é política, é memória — a decodificação expande o áudio para PCM de 32 bits, e meia hora de estéreo a 48 kHz já ocupa cerca de 690 MB na aba do navegador.',
        },
      ],
    },
    en: {
      h1: 'M4A to MP3',
      sub: 'Convert M4A to MP3 in the browser, with no upload.',
      title: 'Convert M4A to MP3 Online (Free, Offline) — Nada Sai',
      description:
        'Convert M4A to MP3 right in the browser. The audio is decoded and re-encoded on your machine, with no upload and no signup.',
      sections: [
        {
          h: 'Why this pair exists',
          p: [
            'M4A is what the iPhone, Apple Music and most voice recorders produce, and it is what older car stereos, some players and a surprising number of corporate systems refuse. MP3 opens in everything, and that is almost always the reason for converting.',
            'The conversion happens entirely in the browser: the file is decoded by the Web Audio API and re-encoded by a LAME encoder written in JavaScript. Nothing is uploaded.',
          ],
        },
        {
          h: 'It is a second generation of loss',
          p: [
            'M4A and MP3 are both lossy, and there is no path from one to the other that avoids decoding and re-encoding. What the AAC inside the M4A had already discarded does not come back, and the MP3 discards a little more on top.',
            'At the default bitrate the difference is hard to hear on music and effectively inaudible on speech. If the file is a master you still intend to edit, convert to WAV instead: lossless, large file, no generation added.',
          ],
        },
      ],
      faq: [
        {
          q: 'Does converting M4A to MP3 make it sound worse?',
          a: 'A little, and unavoidably. Both formats are lossy, so the conversion decodes what is left of the M4A and discards a bit more when writing the MP3. On speech it is effectively inaudible; on music it is hard to hear at the default bitrate. To add no generation at all, convert to WAV.',
        },
        {
          q: 'Do I need to install anything?',
          a: 'No. The decoding is the browser’s own and the MP3 encoder is a JavaScript port of LAME that ships with the page. The file never leaves your device — the meter at the top of the screen shows that while you work.',
        },
        {
          q: 'Is there a size or length limit?',
          a: 'Yes: 100 MB of file and 30 minutes of duration. The duration limit is not policy, it is memory — decoding expands the audio to 32-bit float PCM, and half an hour of stereo at 48 kHz already takes around 690 MB in the browser tab.',
        },
      ],
    },
  },
  {
    id: 'wav-to-mp3',
    tool: 'convert-audio',
    target: 'mp3',
    pathPt: 'audio/wav-para-mp3',
    pathEn: 'audio/wav-to-mp3',
    pt: {
      h1: 'WAV para MP3',
      sub: 'Converta WAV em MP3 e derrube o tamanho do arquivo.',
      title: 'Converter WAV para MP3 Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta WAV em MP3 direto no navegador. É a conversão que troca dezenas de megabytes por poucos, sem upload e sem cadastro.',
      sections: [
        {
          h: 'A conversão que muda o tamanho de ordem',
          p: [
            'WAV é PCM cru: sem compressão nenhuma. Um minuto de estéreo em qualidade de CD ocupa cerca de 10 MB, o que faz uma gravação de reunião de uma hora passar de meio gigabyte. O MP3 na taxa padrão coloca o mesmo material numa fração disso.',
            'É por isso que este é o par mais pedido do módulo: não é sobre compatibilidade — WAV abre em todo lugar — é sobre o arquivo caber em anexo, em pendrive e em upload.',
          ],
        },
        {
          h: 'A primeira perda é aqui',
          p: [
            'O WAV é sem perda, então o que sai daqui é a PRIMEIRA geração de compressão desse áudio. É a melhor situação possível para converter: nada foi descartado antes, e o encoder trabalha sobre o material completo.',
            'Guarde o WAV se ainda vai editar. Cortar, juntar e normalizar a partir do MP3 e regravar em MP3 acrescenta uma geração a cada passo; a partir do WAV, nenhuma.',
          ],
        },
      ],
      faq: [
        {
          q: 'Quanto menor fica o arquivo?',
          a: 'A ordem de grandeza muda. Um WAV estéreo em qualidade de CD gasta cerca de 10 MB por minuto, sem compressão nenhuma; o MP3 na taxa padrão coloca o mesmo minuto numa fração disso. Uma gravação de uma hora sai de mais de meio gigabyte para algo que cabe em anexo de e-mail.',
        },
        {
          q: 'Perde qualidade?',
          a: 'Sim, mas esta é a melhor hora para perder: o WAV é sem perda, então o MP3 que sai daqui é a primeira geração de compressão desse áudio, feita sobre o material completo. É bem diferente de converter a partir de um arquivo que já tinha sido comprimido antes.',
        },
        {
          q: 'Devo apagar o WAV depois de converter?',
          a: 'Se ainda vai editar, não. Cortar, juntar ou normalizar a partir do MP3 e regravar em MP3 acrescenta uma geração de perda a cada passo. Trabalhe no WAV e converta uma vez, no fim — o resultado é audivelmente melhor pelo mesmo tamanho final.',
        },
      ],
    },
    en: {
      h1: 'WAV to MP3',
      sub: 'Convert WAV to MP3 and collapse the file size.',
      title: 'Convert WAV to MP3 Online (Free, Offline) — Nada Sai',
      description:
        'Convert WAV to MP3 right in the browser. It is the conversion that trades tens of megabytes for a few, with no upload and no signup.',
      sections: [
        {
          h: 'The conversion that changes the order of magnitude',
          p: [
            'WAV is raw PCM: no compression at all. One minute of CD-quality stereo takes around 10 MB, which puts an hour-long meeting recording past half a gigabyte. MP3 at the default bitrate fits the same material into a fraction of that.',
            'That is why this is the most requested pair in the module: it is not about compatibility — WAV opens everywhere — it is about the file fitting in an attachment, on a stick, and through an upload.',
          ],
        },
        {
          h: 'The first loss happens here',
          p: [
            'WAV is lossless, so what comes out of here is the FIRST generation of compression for that audio. It is the best possible situation to convert from: nothing was discarded earlier, and the encoder works on complete material.',
            'Keep the WAV if you still plan to edit. Cutting, joining and normalising from the MP3 and re-saving as MP3 adds a generation at every step; from the WAV, none.',
          ],
        },
      ],
      faq: [
        {
          q: 'How much smaller does the file get?',
          a: 'The order of magnitude changes. A CD-quality stereo WAV spends around 10 MB per minute with no compression at all; MP3 at the default bitrate fits the same minute into a fraction of that. An hour-long recording goes from over half a gigabyte to something that fits in an email attachment.',
        },
        {
          q: 'Does it lose quality?',
          a: 'Yes, but this is the best moment to lose it: WAV is lossless, so the MP3 that comes out is the first generation of compression for that audio, made from complete material. That is quite different from converting a file that had already been compressed once.',
        },
        {
          q: 'Should I delete the WAV after converting?',
          a: 'If you still plan to edit, no. Cutting, joining or normalising from the MP3 and re-saving as MP3 adds a generation of loss at every step. Work on the WAV and convert once, at the end — the result is audibly better for the same final size.',
        },
      ],
    },
  },
  {
    id: 'flac-to-mp3',
    tool: 'convert-audio',
    target: 'mp3',
    pathPt: 'audio/flac-para-mp3',
    pathEn: 'audio/flac-to-mp3',
    pt: {
      h1: 'FLAC para MP3',
      sub: 'Converta FLAC em MP3 no navegador, sem enviar o arquivo.',
      title: 'Converter FLAC para MP3 Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta FLAC em MP3 direto no navegador. O FLAC é lido aqui; escrever FLAC é o que nenhum navegador faz, e esta página explica.',
      sections: [
        {
          h: 'FLAC entra; para sair sem perda, o destino é WAV',
          p: [
            'O navegador decodifica FLAC, então esta conversão funciona. O que ele não sabe fazer é CODIFICAR FLAC, e não existe encoder de FLAC que caiba nas regras deste projeto — tudo roda no cliente, sem servidor e sem baixar dezenas de megabytes de WASM.',
            'Este produto já ofereceu FLAC como destino e entregava um WAV PCM de 16 bits com a extensão trocada: bytes de um formato dentro do nome de outro, que decodificador de FLAC nenhum abre. A opção saiu por isso. Quem precisa de saída sem perda tem WAV, que é sem perda de verdade e sai com o nome certo.',
          ],
        },
        {
          h: 'De sem perda para com perda, uma vez só',
          p: [
            'O FLAC guarda o áudio inteiro, então o MP3 que sai daqui é a primeira geração de compressão com perda desse material — a melhor situação possível para converter. Na taxa padrão, num arquivo bem masterizado, a diferença é sutil.',
            'A conversão existe pela mesma razão de sempre: tamanho e compatibilidade. O FLAC de um álbum ocupa várias vezes o MP3 equivalente, e continua sem abrir em parte dos tocadores de carro e aparelhos mais simples.',
          ],
        },
      ],
      faq: [
        {
          q: 'Dá para converter algo PARA FLAC aqui?',
          a: 'Não. O navegador decodifica FLAC mas não o codifica, e não existe encoder que caiba nas regras deste projeto — tudo roda no cliente, sem servidor. Uma versão antiga oferecia a opção e entregava um WAV com a extensão .flac, que nenhum decodificador de FLAC abre; ela foi removida por isso.',
        },
        {
          q: 'Como converter FLAC sem perder qualidade?',
          a: 'Escolhendo WAV como destino em vez de MP3. O WAV é PCM cru, sem compressão nenhuma, então o áudio atravessa a conversão bit a bit — o preço é o tamanho, que fica bem maior que o FLAC porque este comprime sem perder nada. Para MP3 a perda é inevitável, por definição do formato.',
        },
        {
          q: 'Quanto de qualidade se perde indo de FLAC para MP3?',
          a: 'Menos do que em qualquer outra conversão para MP3, porque o FLAC guarda o áudio inteiro: o encoder trabalha sobre o material completo, e o resultado é a primeira geração de perda. Em música bem masterizada, na taxa padrão, a diferença é sutil e a maioria dos equipamentos não a revela.',
        },
      ],
    },
    en: {
      h1: 'FLAC to MP3',
      sub: 'Convert FLAC to MP3 in the browser, with no upload.',
      title: 'Convert FLAC to MP3 Online (Free, Offline) — Nada Sai',
      description:
        'Convert FLAC to MP3 right in the browser. FLAC is read here; writing FLAC is what no browser does, and this page explains why.',
      sections: [
        {
          h: 'FLAC goes in; to come out lossless, the destination is WAV',
          p: [
            'The browser decodes FLAC, which is why this conversion works. What it cannot do is ENCODE FLAC, and there is no FLAC encoder that fits this project’s rules — everything runs on the client, with no server and without pulling down tens of megabytes of WASM.',
            'This product once offered FLAC as a destination and delivered a 16-bit PCM WAV with the extension swapped: the bytes of one format inside the name of another, which no FLAC decoder opens. The option was removed for that. Anyone who needs lossless output has WAV, which is genuinely lossless and comes out under the right name.',
          ],
        },
        {
          h: 'From lossless to lossy, exactly once',
          p: [
            'FLAC stores the audio whole, so the MP3 that comes out is the first generation of lossy compression for that material — the best possible situation to convert from. At the default bitrate, on a well-mastered file, the difference is subtle.',
            'The conversion exists for the usual reasons: size and compatibility. An album in FLAC takes several times the equivalent MP3, and still fails to open on some car players and simpler devices.',
          ],
        },
      ],
      faq: [
        {
          q: 'Can I convert something TO FLAC here?',
          a: 'No. The browser decodes FLAC but does not encode it, and there is no encoder that fits this project’s rules — everything runs on the client, with no server. An older version offered the option and delivered a WAV with a .flac extension, which no FLAC decoder opens; it was removed for that.',
        },
        {
          q: 'How do I convert FLAC without losing quality?',
          a: 'By choosing WAV as the destination instead of MP3. WAV is raw PCM with no compression at all, so the audio crosses the conversion bit for bit — the price is size, which lands well above the FLAC because FLAC compresses without losing anything. For MP3 the loss is unavoidable, by definition of the format.',
        },
        {
          q: 'How much quality is lost going from FLAC to MP3?',
          a: 'Less than in any other conversion to MP3, because FLAC stores the audio whole: the encoder works on complete material, and the result is the first generation of loss. On well-mastered music, at the default bitrate, the difference is subtle and most equipment does not reveal it.',
        },
      ],
    },
  },
  {
    id: 'mp3-to-wav',
    tool: 'convert-audio',
    target: 'wav',
    pathPt: 'audio/mp3-para-wav',
    pathEn: 'audio/mp3-to-wav',
    pt: {
      h1: 'MP3 para WAV',
      sub: 'Converta MP3 em WAV para editar sem acrescentar perda.',
      title: 'Converter MP3 para WAV Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta MP3 em WAV direto no navegador. O WAV é PCM cru: o arquivo cresce muito, e nada mais é descartado a partir daqui.',
      sections: [
        {
          h: 'Para que serve ir nesta direção',
          p: [
            'Ninguém converte para WAV por tamanho — o arquivo cresce muito. Converte-se para EDITAR. Toda regravação em MP3 acrescenta uma geração de perda, então cortar, juntar e normalizar em cima de MP3 e salvar em MP3 vai degradando a cada passo. Em WAV, nenhum passo custa nada.',
            'A outra razão é destino: parte dos programas de edição, de sistemas de telefonia e de equipamentos de estúdio só aceita PCM.',
          ],
        },
        {
          h: 'O WAV não devolve o que o MP3 tirou',
          p: [
            'A conversão grava sem perda o que sobrou, e o que sobrou é o áudio depois da compressão. O arquivo cresce porque o PCM não comprime nada — cerca de 10 MB por minuto em estéreo de qualidade de CD —, mas a qualidade é a mesma do MP3 de origem.',
            'Uma coisa muda de fato: a taxa de amostragem passa a ser a do dispositivo de saída do seu computador, porque é assim que a decodificação do navegador funciona. Um arquivo de 44,1 kHz num computador configurado a 48 kHz sai a 48 kHz. Não há API para decodificar na taxa nativa; é um piso da plataforma, não um defeito.',
          ],
        },
      ],
      faq: [
        {
          q: 'Converter MP3 para WAV melhora a qualidade?',
          a: 'Não. O WAV grava sem perda o que sobrou depois da compressão do MP3, e o que foi descartado não está mais no arquivo. O que você ganha é que, daqui para a frente, nenhuma edição acrescenta perda nova — o ganho é para o futuro do arquivo, não para o passado dele.',
        },
        {
          q: 'Por que o WAV ficou tão grande?',
          a: 'Porque não há compressão nenhuma: o WAV é PCM cru, cerca de 10 MB por minuto em estéreo de qualidade de CD. Um MP3 de 5 MB vira facilmente um WAV de 50 MB. É o preço de não descartar nada, e é a razão de o WAV ser um formato de trabalho e não de distribuição.',
        },
        {
          q: 'A taxa de amostragem é preservada?',
          a: 'Nem sempre. A decodificação do navegador reamostra para a taxa do dispositivo de saída do seu computador, então um arquivo de 44,1 kHz numa máquina configurada a 48 kHz sai a 48 kHz. Não existe API que permita decodificar na taxa nativa do arquivo — é um limite da plataforma, e preferimos dizê-lo a fingir que não existe.',
        },
      ],
    },
    en: {
      h1: 'MP3 to WAV',
      sub: 'Convert MP3 to WAV to edit without adding loss.',
      title: 'Convert MP3 to WAV Online (Free, Offline) — Nada Sai',
      description:
        'Convert MP3 to WAV right in the browser. WAV is raw PCM: the file grows a lot, and nothing more is discarded from here on.',
      sections: [
        {
          h: 'What going this direction is for',
          p: [
            'Nobody converts to WAV for size — the file grows a lot. People convert to EDIT. Every MP3 re-save adds a generation of loss, so cutting, joining and normalising on top of MP3 and saving as MP3 degrades at every step. In WAV, no step costs anything.',
            'The other reason is the destination: some editing software, telephony systems and studio equipment accept nothing but PCM.',
          ],
        },
        {
          h: 'WAV does not give back what MP3 took',
          p: [
            'The conversion losslessly records what survived, and what survived is the audio after compression. The file grows because PCM compresses nothing — around 10 MB per minute in CD-quality stereo — but the quality is the same as the source MP3.',
            'One thing does genuinely change: the sample rate becomes your computer’s output device rate, because that is how browser decoding works. A 44.1 kHz file on a machine set to 48 kHz comes out at 48 kHz. There is no API to decode at the file’s native rate; it is a platform floor, not a defect.',
          ],
        },
      ],
      faq: [
        {
          q: 'Does converting MP3 to WAV improve the quality?',
          a: 'No. WAV losslessly records what survived MP3 compression, and what was discarded is no longer in the file. What you gain is that from here on no edit adds new loss — the gain is for the file’s future, not its past.',
        },
        {
          q: 'Why did the WAV get so large?',
          a: 'Because there is no compression at all: WAV is raw PCM, around 10 MB per minute in CD-quality stereo. A 5 MB MP3 easily becomes a 50 MB WAV. That is the price of discarding nothing, and the reason WAV is a working format rather than a distribution one.',
        },
        {
          q: 'Is the sample rate preserved?',
          a: 'Not always. Browser decoding resamples to your computer’s output device rate, so a 44.1 kHz file on a machine set to 48 kHz comes out at 48 kHz. There is no API that allows decoding at the file’s native rate — it is a platform limit, and we would rather say so than pretend otherwise.',
        },
      ],
    },
  },
  {
    id: 'ogg-to-mp3',
    tool: 'convert-audio',
    target: 'mp3',
    pathPt: 'audio/ogg-para-mp3',
    pathEn: 'audio/ogg-to-mp3',
    pt: {
      h1: 'OGG para MP3',
      sub: 'Converta OGG em MP3 para tocar onde o formato livre não abre.',
      title: 'Converter OGG para MP3 Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta OGG Vorbis ou Opus em MP3 direto no navegador. É a saída para aparelho de som, carro e player que não conhecem o formato.',
      sections: [
        {
          h: 'Compatibilidade, e só',
          p: [
            'O OGG é tecnicamente melhor que o MP3 na mesma taxa, e mesmo assim quase ninguém converte para ele — converte-se para FORA dele. O motivo é sempre o mesmo: aparelho de som de carro, tocador portátil, sistema de som de igreja ou de academia, e uma quantidade grande de software corporativo simplesmente não abrem OGG.',
            'O MP3 abre em tudo. Esta conversão troca qualidade por alcance, de olhos abertos.',
          ],
        },
        {
          h: 'Vorbis ou Opus, e o que isso muda',
          p: [
            'Um arquivo .ogg pode carregar Vorbis, que é o codec clássico, ou Opus, que é o moderno e é o que o WhatsApp e boa parte dos gravadores de voz usam. O navegador decodifica os dois, então a conversão funciona igual nos dois casos.',
            'O que muda é o quanto se perde. O Opus é muito eficiente em voz, e recodificar uma nota de voz para MP3 numa taxa baixa perde mais do que o número sugere. Se o destino aceitar, manter o original é sempre melhor.',
          ],
        },
      ],
      faq: [
        {
          q: 'Por que converter OGG para MP3 se o OGG é melhor?',
          a: 'Porque melhor só vale onde o arquivo abre. O OGG entrega mais qualidade na mesma taxa, mas aparelho de som de carro, tocador portátil e boa parte do software corporativo não o reconhecem. A conversão é sobre onde o arquivo vai tocar, não sobre qual formato é superior.',
        },
        {
          q: 'Funciona com Opus, ou só com Vorbis?',
          a: 'Com os dois. Um arquivo .ogg pode carregar Vorbis, o codec clássico, ou Opus, o moderno — que é o que o WhatsApp e a maioria dos gravadores de voz usam. O navegador decodifica ambos, então a conversão é a mesma; o que muda é quanto se perde, porque o Opus é muito eficiente em voz.',
        },
        {
          q: 'Perde qualidade?',
          a: 'Sim, e inevitavelmente: os dois formatos são com perda, então a conversão decodifica o que sobrou do OGG e descarta mais um pouco ao gravar o MP3. Em voz a diferença é praticamente inaudível; em música ela existe e é maior quanto menor a taxa. Para não acrescentar geração nenhuma, o destino é WAV.',
        },
      ],
    },
    en: {
      h1: 'OGG to MP3',
      sub: 'Convert OGG to MP3 to play where the free format does not open.',
      title: 'Convert OGG to MP3 Online (Free, Offline) — Nada Sai',
      description:
        'Convert OGG Vorbis or Opus to MP3 right in the browser. It is the way out for stereos, car players and software that do not know the format.',
      sections: [
        {
          h: 'Compatibility, and nothing else',
          p: [
            'OGG is technically better than MP3 at the same bitrate, and yet almost nobody converts to it — people convert OUT of it. The reason is always the same: car stereos, portable players, church and gym sound systems, and a great deal of corporate software simply do not open OGG.',
            'MP3 opens in everything. This conversion trades quality for reach, with eyes open.',
          ],
        },
        {
          h: 'Vorbis or Opus, and what that changes',
          p: [
            'An .ogg file may carry Vorbis, the classic codec, or Opus, the modern one that WhatsApp and most voice recorders use. The browser decodes both, so the conversion works the same either way.',
            'What changes is how much is lost. Opus is very efficient on speech, and re-encoding a voice note to MP3 at a low bitrate loses more than the number suggests. If the destination accepts it, keeping the original is always better.',
          ],
        },
      ],
      faq: [
        {
          q: 'Why convert OGG to MP3 if OGG is better?',
          a: 'Because better only counts where the file opens. OGG delivers more quality at the same bitrate, but car stereos, portable players and much corporate software do not recognise it. The conversion is about where the file will play, not about which format is superior.',
        },
        {
          q: 'Does it work with Opus, or only Vorbis?',
          a: 'Both. An .ogg file may carry Vorbis, the classic codec, or Opus, the modern one — which is what WhatsApp and most voice recorders use. The browser decodes both, so the conversion is the same; what changes is how much is lost, because Opus is very efficient on speech.',
        },
        {
          q: 'Does it lose quality?',
          a: 'Yes, unavoidably: both formats are lossy, so the conversion decodes what is left of the OGG and discards a little more when writing the MP3. On speech the difference is effectively inaudible; on music it exists and grows as the bitrate falls. To add no generation at all, the destination is WAV.',
        },
      ],
    },
  },
  {
    id: 'aac-to-mp3',
    tool: 'convert-audio',
    target: 'mp3',
    pathPt: 'audio/aac-para-mp3',
    pathEn: 'audio/aac-to-mp3',
    pt: {
      h1: 'AAC para MP3',
      sub: 'Converta AAC em MP3 no navegador, sem enviar o arquivo.',
      title: 'Converter AAC para MP3 Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta AAC em MP3 direto no navegador. É uma conversão de compatibilidade: o AAC é melhor na mesma taxa, e o MP3 abre em mais lugares.',
      sections: [
        {
          h: 'Descendo de degrau, de propósito',
          p: [
            'O AAC é o sucessor técnico do MP3 e entrega mais qualidade na mesma taxa. Converter na direção contrária é sempre uma decisão de alcance: um aparelho antigo, um sistema de som que só lê MP3, um formulário que só aceita a extensão.',
            'Vale dizer com clareza porque muita gente faz esta conversão achando que está melhorando o arquivo. Não está — está trocando qualidade por compatibilidade, e é uma troca legítima quando o destino exige.',
          ],
        },
        {
          h: 'AAC solto e AAC dentro de M4A',
          p: [
            'O AAC costuma vir embrulhado num contêiner .m4a, e é assim que o iPhone e o Apple Music o entregam. Um arquivo .aac cru também existe, e o navegador decodifica os dois.',
            'Se o seu arquivo é .m4a, a página específica desse par explica a mesma conversão com o nome que você procurou. O resultado é idêntico: o que importa é o codec lá dentro, não a extensão em volta.',
          ],
        },
      ],
      faq: [
        {
          q: 'Converter AAC para MP3 melhora a qualidade?',
          a: 'Não, piora — e vale dizer com clareza porque muita gente faz esta conversão achando o contrário. O AAC é o sucessor técnico do MP3 e entrega mais qualidade na mesma taxa. Descer para MP3 é uma decisão de compatibilidade, não de qualidade, e é legítima quando o destino exige.',
        },
        {
          q: 'Qual a diferença entre .aac e .m4a?',
          a: 'O codec é o mesmo; muda o contêiner. Um .m4a é AAC embrulhado num contêiner MPEG-4, que é o que o iPhone e o Apple Music entregam, e o .aac é o fluxo cru. O navegador decodifica os dois e o resultado desta conversão é idêntico — o que importa é o codec lá dentro, não a extensão em volta.',
        },
        {
          q: 'Quanto se perde?',
          a: 'É uma segunda geração de compressão: o que o AAC já tinha descartado não volta, e o MP3 descarta mais um pouco por cima. Na taxa padrão, em música bem masterizada, a diferença é difícil de ouvir; em voz é praticamente inaudível. Se o arquivo ainda vai ser editado, o destino certo é WAV.',
        },
      ],
    },
    en: {
      h1: 'AAC to MP3',
      sub: 'Convert AAC to MP3 in the browser, with no upload.',
      title: 'Convert AAC to MP3 Online (Free, Offline) — Nada Sai',
      description:
        'Convert AAC to MP3 right in the browser. It is a compatibility conversion: AAC is better at the same bitrate, and MP3 opens in more places.',
      sections: [
        {
          h: 'Stepping down, on purpose',
          p: [
            'AAC is the technical successor to MP3 and delivers more quality at the same bitrate. Converting the other way is always a reach decision: an older device, a sound system that only reads MP3, a form that only accepts the extension.',
            'It is worth saying plainly because many people make this conversion believing they are improving the file. They are not — they are trading quality for compatibility, and that is a legitimate trade when the destination demands it.',
          ],
        },
        {
          h: 'Bare AAC and AAC inside M4A',
          p: [
            'AAC usually arrives wrapped in an .m4a container, which is how the iPhone and Apple Music deliver it. A raw .aac file also exists, and the browser decodes both.',
            'If your file is .m4a, the dedicated page for that pair explains the same conversion under the name you searched for. The result is identical: what matters is the codec inside, not the extension around it.',
          ],
        },
      ],
      faq: [
        {
          q: 'Does converting AAC to MP3 improve quality?',
          a: 'No, it lowers it — and that is worth saying plainly, because many people make this conversion believing the opposite. AAC is the technical successor to MP3 and delivers more quality at the same bitrate. Stepping down to MP3 is a compatibility decision, not a quality one, and it is legitimate when the destination demands it.',
        },
        {
          q: 'What is the difference between .aac and .m4a?',
          a: 'The codec is the same; the container differs. An .m4a is AAC wrapped in an MPEG-4 container, which is what the iPhone and Apple Music deliver, and .aac is the raw stream. The browser decodes both and the result of this conversion is identical — what matters is the codec inside, not the extension around it.',
        },
        {
          q: 'How much is lost?',
          a: 'It is a second generation of compression: what AAC already discarded does not come back, and MP3 discards a little more on top. At the default bitrate, on well-mastered music, the difference is hard to hear; on speech it is effectively inaudible. If the file will still be edited, the right destination is WAV.',
        },
      ],
    },
  },
  {
    id: 'webm-to-mp3',
    tool: 'convert-audio',
    target: 'mp3',
    pathPt: 'audio/webm-para-mp3',
    pathEn: 'audio/webm-to-mp3',
    pt: {
      h1: 'WebM para MP3',
      sub: 'Converta o áudio de um WebM em MP3, sem enviar o arquivo.',
      title: 'Converter WebM para MP3 Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta um WebM de áudio em MP3 direto no navegador. Se o seu WebM tiver vídeo, a ferramenta certa é a de extrair áudio de vídeo.',
      sections: [
        {
          h: 'Se o WebM tem VÍDEO, a ferramenta é outra',
          p: [
            'Esta é a distinção que mais importa aqui, e ela vem antes de tudo. O WebM é um contêiner que carrega áudio, vídeo ou os dois. Esta página trata do caso de ÁUDIO — uma gravação de voz, um trecho de som, um arquivo que só tem trilha sonora.',
            'Se o seu WebM tem imagem, o caminho é a ferramenta de extrair áudio de vídeo. Ela existe justamente para isso e lida com o caso que este não lida: o navegador demuxa o contêiner e devolve só a trilha, sem tocar o vídeo inteiro quando não precisa.',
          ],
        },
        {
          h: 'Opus dentro do contêiner',
          p: [
            'O áudio de um WebM é quase sempre Opus, que é o codec que o navegador usa para gravar — pelo gravador de tela, pelo microfone de uma página, por uma chamada. O navegador o decodifica sem dificuldade, e a conversão para MP3 é uma segunda geração de perda.',
            'Vale saber uma coisa sobre WebM gravado no navegador: ele quase nunca traz a duração no cabeçalho. Isso não é defeito nem arquivo corrompido — o gravador escreve o arquivo em fluxo e não volta para preencher o campo. As ferramentas daqui lidam com isso.',
          ],
        },
      ],
      faq: [
        {
          q: 'Meu WebM tem vídeo. Esta é a ferramenta certa?',
          a: 'Não, use a de extrair áudio de vídeo. O WebM é um contêiner que pode carregar áudio, vídeo ou os dois, e esta página trata do caso de áudio puro. A ferramenta de vídeo demuxa o contêiner e devolve só a trilha sonora, que é exatamente o que você quer quando há imagem no arquivo.',
        },
        {
          q: 'Que codec está dentro de um WebM de áudio?',
          a: 'Quase sempre Opus, que é o codec que o navegador usa ao gravar — pelo gravador de tela, pelo microfone de uma página ou por uma chamada. Vorbis também aparece em arquivos mais antigos. O navegador decodifica os dois, então a conversão funciona igual.',
        },
        {
          q: 'Por que alguns WebM aparecem sem duração?',
          a: 'Porque um arquivo gravado pelo navegador é escrito em fluxo, e o gravador não volta ao começo para preencher o campo de duração no cabeçalho. Não é arquivo corrompido, e é o comportamento de toda gravação de tela, de webcam e de reunião. As ferramentas daqui já contam com isso.',
        },
      ],
    },
    en: {
      h1: 'WebM to MP3',
      sub: 'Convert the audio of a WebM to MP3, with no upload.',
      title: 'Convert WebM to MP3 Online (Free, Offline) — Nada Sai',
      description:
        'Convert an audio WebM to MP3 right in the browser. If your WebM has video, the right tool is extract-audio-from-video.',
      sections: [
        {
          h: 'If the WebM has VIDEO, the tool is a different one',
          p: [
            'This is the distinction that matters most here, and it comes before everything else. WebM is a container that carries audio, video or both. This page covers the AUDIO case — a voice recording, a sound clip, a file with nothing but a soundtrack.',
            'If your WebM has picture in it, the path is the extract-audio-from-video tool. It exists precisely for that and handles the case this one does not: the browser demuxes the container and hands back only the track, without playing the whole video when it does not have to.',
          ],
        },
        {
          h: 'Opus inside the container',
          p: [
            'The audio in a WebM is almost always Opus, the codec the browser uses when recording — from the screen recorder, from a page microphone, from a call. The browser decodes it without trouble, and converting to MP3 is a second generation of loss.',
            'One thing worth knowing about browser-recorded WebM: it almost never carries a duration in its header. That is not a defect or a corrupt file — the recorder writes the file as a stream and does not go back to fill the field in. The tools here account for it.',
          ],
        },
      ],
      faq: [
        {
          q: 'My WebM has video. Is this the right tool?',
          a: 'No, use extract-audio-from-video. WebM is a container that can carry audio, video or both, and this page covers the pure-audio case. The video tool demuxes the container and hands back only the soundtrack, which is exactly what you want when there is picture in the file.',
        },
        {
          q: 'What codec is inside an audio WebM?',
          a: 'Almost always Opus, the codec the browser uses when recording — from the screen recorder, from a page microphone or from a call. Vorbis also shows up in older files. The browser decodes both, so the conversion works the same.',
        },
        {
          q: 'Why do some WebM files show no duration?',
          a: 'Because a browser-recorded file is written as a stream, and the recorder does not go back to the start to fill in the duration field in the header. It is not a corrupt file, and it is the behaviour of every screen, webcam and meeting recording. The tools here already account for it.',
        },
      ],
    },
  },
  {
    id: 'm4a-to-wav',
    tool: 'convert-audio',
    target: 'wav',
    pathPt: 'audio/m4a-para-wav',
    pathEn: 'audio/m4a-to-wav',
    pt: {
      h1: 'M4A para WAV',
      sub: 'Converta M4A em WAV para editar sem acrescentar perda.',
      title: 'Converter M4A para WAV Online (Grátis, Offline) — Nada Sai',
      description:
        'Converta M4A em WAV direto no navegador. O arquivo cresce muito, e a partir daí nenhuma edição acrescenta perda nova.',
      sections: [
        {
          h: 'Isto é para EDITAR, não para guardar',
          p: [
            'Ninguém converte para WAV por tamanho: um M4A de 5 MB vira facilmente um WAV de 50. Converte-se para trabalhar. Toda regravação em M4A ou MP3 acrescenta uma geração de perda, então cortar, juntar e normalizar em cima do arquivo comprimido e salvar comprimido degrada a cada passo. Em WAV, nenhum passo custa nada.',
            'A outra razão é destino: parte dos programas de edição, dos sistemas de telefonia e dos equipamentos de estúdio aceita apenas PCM.',
          ],
        },
        {
          h: 'O WAV não devolve o que o AAC tirou',
          p: [
            'A conversão grava sem perda o que sobrou, e o que sobrou é o áudio depois da compressão do AAC. O ganho é para o FUTURO do arquivo, não para o passado dele.',
            'Uma coisa muda de fato: a taxa de amostragem passa a ser a do dispositivo de saída do seu computador, porque é assim que a decodificação do navegador funciona. Um arquivo de 44,1 kHz numa máquina configurada a 48 kHz sai a 48 kHz. Não há API para decodificar na taxa nativa; é um piso da plataforma, e preferimos dizê-lo a fingir que não existe.',
          ],
        },
      ],
      faq: [
        {
          q: 'Converter M4A para WAV melhora a qualidade?',
          a: 'Não. O WAV grava sem perda o que sobrou depois da compressão do AAC, e o que foi descartado não está mais no arquivo. O que você ganha é que, daqui para a frente, nenhuma edição acrescenta perda nova — o ganho é para o futuro do arquivo, não para o passado dele.',
        },
        {
          q: 'Por que o WAV ficou tão grande?',
          a: 'Porque não há compressão nenhuma: o WAV é PCM cru, cerca de 10 MB por minuto em estéreo de qualidade de CD. Um M4A de 5 MB vira facilmente um WAV de 50 MB. É o preço de não descartar nada, e a razão de o WAV ser formato de trabalho e não de distribuição.',
        },
        {
          q: 'A taxa de amostragem é preservada?',
          a: 'Nem sempre. A decodificação do navegador reamostra para a taxa do dispositivo de saída do seu computador, então um arquivo de 44,1 kHz numa máquina configurada a 48 kHz sai a 48 kHz. Não existe API que permita decodificar na taxa nativa do arquivo — é um limite da plataforma, e preferimos dizê-lo a fingir que não existe.',
        },
      ],
    },
    en: {
      h1: 'M4A to WAV',
      sub: 'Convert M4A to WAV to edit without adding loss.',
      title: 'Convert M4A to WAV Online (Free, Offline) — Nada Sai',
      description:
        'Convert M4A to WAV right in the browser. The file grows a lot, and from there on no edit adds new loss.',
      sections: [
        {
          h: 'This is for EDITING, not for keeping',
          p: [
            'Nobody converts to WAV for size: a 5 MB M4A easily becomes a 50 MB WAV. People convert to work. Every re-save as M4A or MP3 adds a generation of loss, so cutting, joining and normalising on top of the compressed file and saving compressed degrades at every step. In WAV, no step costs anything.',
            'The other reason is the destination: some editing software, telephony systems and studio equipment accept nothing but PCM.',
          ],
        },
        {
          h: 'WAV does not give back what AAC took',
          p: [
            'The conversion losslessly records what survived, and what survived is the audio after AAC compression. The gain is for the file’s FUTURE, not its past.',
            'One thing does genuinely change: the sample rate becomes your computer’s output device rate, because that is how browser decoding works. A 44.1 kHz file on a machine set to 48 kHz comes out at 48 kHz. There is no API to decode at the native rate; it is a platform floor, and we would rather say so than pretend otherwise.',
          ],
        },
      ],
      faq: [
        {
          q: 'Does converting M4A to WAV improve the quality?',
          a: 'No. WAV losslessly records what survived AAC compression, and what was discarded is no longer in the file. What you gain is that from here on no edit adds new loss — the gain is for the file’s future, not its past.',
        },
        {
          q: 'Why did the WAV get so large?',
          a: 'Because there is no compression at all: WAV is raw PCM, around 10 MB per minute in CD-quality stereo. A 5 MB M4A easily becomes a 50 MB WAV. That is the price of discarding nothing, and the reason WAV is a working format rather than a distribution one.',
        },
        {
          q: 'Is the sample rate preserved?',
          a: 'Not always. Browser decoding resamples to your computer’s output device rate, so a 44.1 kHz file on a machine set to 48 kHz comes out at 48 kHz. There is no API that allows decoding at the file’s native rate — it is a platform limit, and we would rather say so than pretend otherwise.',
        },
      ],
    },
  },
  {
    id: 'flac-to-wav',
    tool: 'convert-audio',
    target: 'wav',
    pathPt: 'audio/flac-para-wav',
    pathEn: 'audio/flac-to-wav',
    pt: {
      h1: 'FLAC para WAV',
      sub: 'Sem perda de um lado ao outro — o áudio atravessa intacto.',
      title: 'Converter FLAC para WAV Online (Sem Perda) — Nada Sai',
      description:
        'Converta FLAC em WAV direto no navegador. Os dois são sem perda, então o áudio atravessa intacto; o que muda é o tamanho.',
      sections: [
        {
          h: 'A única conversão de áudio desta lista que não perde nada',
          p: [
            'FLAC e WAV são ambos sem perda. O FLAC comprime, o WAV não, mas nenhum dos dois descarta informação — então o áudio que sai é o mesmo que entrou. É a conversão de áudio equivalente ao BMP para PNG do lado da imagem: sem decisão de qualidade a tomar.',
            'O que muda é o tamanho, e na direção desconfortável: o WAV cresce, porque o FLAC guardava a mesma informação comprimida. Uma faixa em FLAC costuma virar um WAV de duas a três vezes o tamanho.',
          ],
        },
        {
          h: 'Por que trocar compressão sem perda por nenhuma',
          p: [
            'Compatibilidade. O WAV abre em qualquer programa de edição, em qualquer sistema de telefonia, em qualquer equipamento de estúdio, e em software antigo que nunca ouviu falar de FLAC. Alguns fluxos de trabalho profissionais exigem PCM cru e não aceitam nem FLAC.',
            'A única ressalva vale a pena saber: a taxa de amostragem passa a ser a do dispositivo de saída do seu computador, porque é assim que a decodificação do navegador funciona. Um FLAC de 44,1 kHz numa máquina configurada a 48 kHz sai a 48 kHz — que é uma reamostragem, e portanto a única alteração real nesta conversão.',
          ],
        },
      ],
      faq: [
        {
          q: 'Converter FLAC para WAV perde qualidade?',
          a: 'Não pela compressão: os dois formatos são sem perda, então o áudio atravessa intacto. A única alteração possível é a taxa de amostragem, que o navegador ajusta para a do dispositivo de saída do computador — um FLAC de 44,1 kHz numa máquina a 48 kHz sai reamostrado. É um limite da plataforma, não da conversão.',
        },
        {
          q: 'Por que o WAV ficou maior que o FLAC?',
          a: 'Porque o FLAC comprime sem perder nada e o WAV não comprime coisa nenhuma. Os dois carregam exatamente a mesma informação; um a guarda de forma compacta e o outro crua. Crescer duas a três vezes é o resultado normal.',
        },
        {
          q: 'Então por que não ficar no FLAC?',
          a: 'Se o destino aceita FLAC, fique. A conversão existe para os lugares que não aceitam: parte dos programas de edição, sistemas de telefonia, equipamentos de estúdio e software antigo pedem PCM cru. É uma troca de compressão por compatibilidade, sem custo de qualidade.',
        },
      ],
    },
    en: {
      h1: 'FLAC to WAV',
      sub: 'Lossless on both sides — the audio crosses over intact.',
      title: 'Convert FLAC to WAV Online (Lossless) — Nada Sai',
      description:
        'Convert FLAC to WAV right in the browser. Both are lossless, so the audio crosses over intact; what changes is the size.',
      sections: [
        {
          h: 'The one audio conversion here that loses nothing',
          p: [
            'FLAC and WAV are both lossless. FLAC compresses, WAV does not, but neither discards information — so the audio that comes out is the audio that went in. It is the audio equivalent of BMP to PNG on the image side: no quality decision to make.',
            'What changes is size, and in the uncomfortable direction: the WAV grows, because FLAC was holding the same information compressed. A track in FLAC usually becomes a WAV two to three times the size.',
          ],
        },
        {
          h: 'Why trade lossless compression for none',
          p: [
            'Compatibility. WAV opens in any editing program, any telephony system, any studio equipment, and in old software that never heard of FLAC. Some professional workflows require raw PCM and will not take FLAC either.',
            'The one caveat is worth knowing: the sample rate becomes your computer’s output device rate, because that is how browser decoding works. A 44.1 kHz FLAC on a machine set to 48 kHz comes out at 48 kHz — which is a resample, and therefore the only real alteration in this conversion.',
          ],
        },
      ],
      faq: [
        {
          q: 'Does converting FLAC to WAV lose quality?',
          a: 'Not through compression: both formats are lossless, so the audio crosses over intact. The only possible alteration is the sample rate, which the browser adjusts to the computer’s output device — a 44.1 kHz FLAC on a machine at 48 kHz comes out resampled. That is a platform limit, not a limit of the conversion.',
        },
        {
          q: 'Why is the WAV bigger than the FLAC?',
          a: 'Because FLAC compresses without losing anything and WAV compresses nothing at all. Both carry exactly the same information; one stores it compactly and the other raw. Growing two to three times is the normal outcome.',
        },
        {
          q: 'So why not stay in FLAC?',
          a: 'If the destination accepts FLAC, stay. The conversion exists for the places that do not: some editing programs, telephony systems, studio equipment and older software require raw PCM. It is a trade of compression for compatibility, at no cost in quality.',
        },
      ],
    },
  },
];

/** O par cujo caminho (pt ou en) casa com esta URL, ou `null`. */
export function pairFromUrl(url: string): FormatPair | null {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '');
  return (
    FORMAT_PAIRS.find((p) => path.endsWith(`/${p.pathPt}`) || path.endsWith(`/${p.pathEn}`)) ?? null
  );
}

export function pairById(id: string): FormatPair | null {
  return FORMAT_PAIRS.find((p) => p.id === id) ?? null;
}
