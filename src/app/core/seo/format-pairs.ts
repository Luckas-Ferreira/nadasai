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
