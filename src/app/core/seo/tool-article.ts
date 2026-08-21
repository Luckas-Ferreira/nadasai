import type { ToolId } from '../tools/tools';

/**
 * O texto longo que fica ENTRE a ferramenta e o FAQ.
 *
 * POR QUE ISTO EXISTE. Medido no build de 19/08, `/pt/imagem/cortar` servia 223
 * palavras visíveis, um h1 e um h2 — e o h2 era o título do FAQ. As consultas
 * que essas páginas disputam ("cortar imagem online", "juntar pdf", "comprimir
 * pdf") são comerciais e dominadas por páginas de 800 a 2000 palavras; com 223 e
 * nenhuma hierarquia abaixo do h1, não há do que ranquear, por melhor que seja a
 * técnica em volta.
 *
 * POR QUE NÃO ESTÁ NO DICIONÁRIO, e nem no `tool-content.ts`: mesmo argumento do
 * FAQ, uma vez cada. Os dois dicionários são consts estáticas de um serviço
 * root-provided e portanto moram no bundle INICIAL — texto longo ali custa a
 * home inteira. Este arquivo só é alcançado pelo `ToolArticleComponent`, que só
 * é alcançado pelo `ToolPageComponent`, que só é alcançado por rota lazy.
 * Separado do `tool-content.ts` porque aquele já tem 1691 linhas e os dois têm
 * ciclos de edição diferentes.
 *
 * A REGRA DO CONTEÚDO, e é ela que separa isto de encher linguiça: cada
 * parágrafo diz algo que só vale para ESTA ferramenta — o limite real que o
 * código impõe, o formato que ela de fato escreve, a troca que ela de fato faz.
 * Quatro parágrafos genéricos sobre privacidade repetidos em 36 páginas são
 * conteúdo duplicado fino, que é pior do que não ter seção nenhuma. Onde há
 * número, ele saiu do código (`MAX_UPLOAD_BYTES`, `RASTER`, `MAX_FILES`,
 * `PDF_MAX_LONG_SIDE`) e muda quando o código mudar.
 *
 * `tool-article.spec.ts` trava as duas coisas que apodrecem sozinhas: paridade
 * de seções entre PT e EN, e um piso de palavras por língua — uma entrada pela
 * metade falha em vez de passar despercebida.
 */

export interface ArticleSection {
  /** Vira um h2. O h1 é o nome da ferramenta, no cabeçalho da página. */
  readonly h: string;
  readonly p: readonly string[];
  /** Lista ordenada, quando a seção descreve um passo a passo. */
  readonly steps?: readonly string[];
}

export type ToolArticle = {
  readonly pt: readonly ArticleSection[];
  readonly en: readonly ArticleSection[];
};

export const TOOL_ARTICLE: Partial<Record<ToolId, ToolArticle>> = {
  crop: {
    pt: [
      {
        h: 'Como cortar uma imagem',
        p: [
          'O corte acontece sobre a imagem em tamanho natural, não sobre a miniatura que aparece na tela. A área marcada é convertida para as coordenadas reais do arquivo antes de qualquer pixel ser escrito, então o resultado tem a resolução do original dentro do recorte — cortar 40% de uma foto de 12 megapixels devolve uma imagem de cerca de 7 megapixels, e não uma versão reduzida dela.',
        ],
        steps: [
          'Arraste a imagem para a área de upload, ou clique para escolher no disco.',
          'Arraste sobre a foto para marcar a área. As alças nos cantos ajustam a seleção depois de feita.',
          'Se o destino exige um formato exato, trave uma proporção: 1:1, 16:9, 4:3 ou 3:2. Sem proporção, o corte é livre.',
          'Gire ou espelhe a imagem, se precisar — os botões agem sobre o mesmo recorte.',
          'Baixe o resultado, ou mande direto para outra ferramenta pelo atalho de enviar para.',
        ],
      },
      {
        h: 'Formatos, limites e o que acontece com a qualidade',
        p: [
          'Entram PNG, JPEG, WebP, GIF, BMP e AVIF, até 50 MB por arquivo. O AVIF é aceito porque o navegador sabe decodificá-lo, ainda que não saiba escrevê-lo. Há também um teto de área: o navegador se recusa a alocar telas muito acima de 40 milhões de pixels, então uma imagem gigantesca é recusada na entrada, e não no meio da operação.',
          'A saída é PNG, e essa escolha é sobre gerações de perda. O corte em si não inventa nem descarta detalhe dentro da área escolhida, mas salvar exige recodificar, e recodificar um JPEG como JPEG empilha uma segunda geração de perda sobre a que o arquivo já trazia. Em PNG não há perda nenhuma. O preço é o tamanho — e se ele importa mais que o último grau de fidelidade, corte aqui e passe o resultado para a ferramenta de comprimir, que fica a uma navegação de distância e não a um segundo upload.',
        ],
      },
      {
        h: 'Quando esta não é a ferramenta certa',
        p: [
          'Para mudar as dimensões sem descartar nada da cena, o certo é redimensionar: cortar joga pixels fora de propósito, redimensionar reamostra a imagem inteira. Para tirar o fundo em vez de aparar as bordas, existe a remoção de fundo, que devolve canal alfa de verdade em vez de um retângulo. E para aparar a margem de um documento, fique no módulo de PDF: rasterizar uma página só para cortá-la como imagem custa a camada de texto do arquivo inteiro.',
          'Também não é a ferramenta para cortar cem fotos de uma vez. Cada arquivo é uma sessão, e o produto foi desenhado em torno de uma cadeia de edições sobre um arquivo, não em torno de um lote.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Um site de corte convencional recebe o upload da foto, corta no servidor e devolve o resultado — o que significa que a foto existiu, ainda que por minutos, num disco que não é seu. Aqui o arquivo é lido pela aba, desenhado numa tela em memória e escrito de volta pela mesma aba. Nenhuma requisição de rede participa do corte, e o medidor no topo da página mostra isso ao vivo: ele conta bytes de arquivo saindo, e o número fica em zero enquanto você trabalha.',
          'A consequência prática é que a ferramenta continua funcionando com o Wi-Fi desligado depois da primeira visita, porque o que precisava ser baixado já foi. É também o que torna razoável cortar um documento com dados pessoais, um comprovante ou uma foto de família sem pensar duas vezes.',
        ],
      },
    ],
    en: [
      {
        h: 'How to crop an image',
        p: [
          'The crop runs against the image at natural size, not against the thumbnail on screen. The area you mark is converted to the real coordinates of the file before a single pixel is written, so the result keeps the original resolution inside the selection — cropping 40% out of a 12-megapixel photo gives back roughly a 7-megapixel image, not a shrunken copy of one.',
        ],
        steps: [
          'Drop the image on the upload area, or click to pick one from disk.',
          'Drag across the photo to mark the area. The corner handles adjust the selection afterwards.',
          'If the destination demands an exact shape, lock a ratio: 1:1, 16:9, 4:3 or 3:2. With no ratio, the crop is free.',
          'Rotate or flip if you need to — the buttons act on the same selection.',
          'Download the result, or send it straight to another tool through the send-to shortcut.',
        ],
      },
      {
        h: 'Formats, limits and what happens to quality',
        p: [
          'PNG, JPEG, WebP, GIF, BMP and AVIF go in, up to 50 MB per file. AVIF is accepted because the browser can decode it, even though it cannot write it. There is also an area ceiling: browsers refuse to allocate canvases much beyond 40 million pixels, so an enormous image is refused at the door rather than freezing the tab halfway through.',
          'The output is PNG, and that choice is about generations of loss. The crop itself neither invents nor discards detail inside the selected area, but saving means re-encoding, and re-encoding a JPEG as JPEG stacks a second generation of loss on whatever the file already carried. PNG adds none. The price is file size — and if size matters more than the last degree of fidelity, crop here and pass the result to the compressor, which is one navigation away rather than a second upload.',
        ],
      },
      {
        h: 'When this is the wrong tool',
        p: [
          'To change dimensions without throwing any of the scene away, resize instead of cropping: cropping discards pixels on purpose, resizing resamples the whole image. To cut the background out rather than trim the edges, use background removal, which returns real alpha instead of a rectangle. And to trim the margin of a document, stay in the PDF module: rasterising a page only to crop it as an image costs the text layer of the entire file.',
          'It is also not the tool for cropping a hundred photos at once. Each file is a session, and the product is built around a chain of edits on one file, not around a batch.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'A conventional cropping site takes the upload, crops on a server and hands the result back — which means your photo existed, if only for minutes, on a disk that is not yours. Here the file is read by the tab, drawn onto an in-memory canvas and written back by that same tab. No network request takes part in the crop, and the meter at the top of the page shows it live: it counts file bytes leaving, and the number stays at zero while you work.',
          'The practical consequence is that the tool keeps working with Wi-Fi switched off after the first visit, because everything that had to be downloaded already was. It is also what makes it reasonable to crop a document with personal data, a receipt or a family photo without thinking twice.',
        ],
      },
    ],
  },
  favicon: {
    pt: [
      {
        h: 'O que este gerador escreve',
        p: [
          'Um arquivo .ico de verdade, com estrutura ICONDIR: um diretório no começo e, depois dele, uma imagem PNG completa por resolução escolhida. Não é um PNG renomeado. O navegador lê o diretório, descobre quais tamanhos existem e pede o que precisa — que é o motivo de o formato ainda existir depois de trinta anos.',
          'Os tamanhos disponíveis são 16, 32, 48, 64, 128 e 256 pixels, e vêm marcados os quatro que um site de fato usa: 16 e 32 para a aba, 48 para o atalho do Windows e 256 para o ícone grande. Desmarcar os outros deixa o arquivo menor sem tirar nada que alguém vá pedir.',
        ],
      },
      {
        h: 'Como gerar',
        p: [
          'A imagem de origem pode ser PNG, JPEG ou WebP. O ideal é um PNG quadrado com fundo transparente, porque é o único caso em que nada precisa ser inventado nem descartado.',
        ],
        steps: [
          'Solte a imagem na área de upload, ou traga o resultado de outra ferramenta pela cadeia.',
          'Marque as resoluções que devem entrar no arquivo. Pelo menos uma é obrigatória.',
          'Gere o .ico e baixe. O botão volta a aparecer sempre que você mudar a seleção de tamanhos, e some quando o arquivo na tela já é exatamente o que a seleção pede.',
          'No seu HTML, aponte <link rel="icon" href="/favicon.ico"> para ele — ou simplesmente coloque o arquivo na raiz do site com esse nome.',
        ],
      },
      {
        h: 'Retângulo entra, retângulo continua',
        p: [
          'Um ícone é quadrado por definição, e a maioria dos logotipos não é. Aqui a imagem é encaixada por proporção: ela é reduzida até caber inteira no quadrado e o que sobra fica transparente. A alternativa — esticar até preencher — foi rejeitada porque produz um resultado que ninguém aceita: uma foto 1600x900 espremida num 256x256 fica visivelmente achatada, e no tamanho de 16 pixels isso vira uma mancha.',
          'Quando a imagem não é quadrada, a página avisa antes de gerar. Se o que você quer é o logotipo preenchendo o quadrado inteiro, o caminho é cortar antes — e a ferramenta de cortar entrega o recorte direto aqui, sem baixar e subir de novo.',
        ],
      },
      {
        h: 'Transparência e cor',
        p: [
          'Cada entrada do arquivo é gravada como PNG de 32 bits, então o canal alfa do original passa inteiro: um logotipo com fundo transparente continua transparente sobre a barra de abas, seja ela clara ou escura. É a razão de o PNG ser o formato certo para trazer aqui.',
          'Um JPEG não tem transparência para preservar. O fundo dele — branco, quase sempre — vira parte do ícone, e aparece como um quadrado sólido em volta do desenho. Se a sua arte está em JPEG e você precisa do fundo fora, passe pela remoção de fundo antes: ela devolve um PNG com alfa de verdade, e esse PNG chega aqui pela cadeia.',
        ],
      },
      {
        h: 'Por que continua sendo .ico',
        p: [
          'Um <link rel="icon"> apontando para PNG funciona em todo navegador atual, e para muitos sites isso basta. O .ico ganha em dois pontos concretos: é o que o navegador procura sozinho em /favicon.ico quando o HTML não declara nada — inclusive ao abrir uma página sua que veio de um cache antigo — e é o único formato que responde a todos os contextos com um arquivo só, porque carrega várias resoluções dentro de si.',
          'Também é o que o Windows espera ao criar um atalho da página, e o que ferramentas de leitura de feed e agregadores mais antigos sabem ler. Nada disso é decisivo isoladamente; junto, é o motivo de o .ico continuar sendo o padrão que não dá trabalho.',
        ],
      },
      {
        h: 'Onde ele para',
        p: [
          'O .ico é o fim da cadeia: nenhuma ferramenta daqui abre um de volta, e por isso a página não oferece um próximo passo depois de gerar. O caminho útil é o contrário — chegar aqui vindo de outra ferramenta. Remover fundo, cortar num quadrado e então gerar o ícone é a sequência inteira, e nenhum dos três passos manda o arquivo para lugar nenhum.',
          'Todo o trabalho acontece no seu navegador: a imagem é decodificada, redesenhada em cada tamanho e codificada em PNG na sua máquina, e o arquivo que você baixa foi montado ali. Nada é enviado, e o medidor no topo da página mostra isso enquanto você trabalha.',
        ],
      },
    ],
    en: [
      {
        h: 'What this generator writes',
        p: [
          'A real .ico file, with ICONDIR structure: a directory at the front and, after it, one complete PNG image per chosen resolution. It is not a renamed PNG. The browser reads the directory, learns which sizes exist and asks for the one it needs — which is why the format still exists thirty years on.',
          'The available sizes are 16, 32, 48, 64, 128 and 256 pixels, and the four a site actually uses come pre-selected: 16 and 32 for the tab, 48 for the Windows shortcut and 256 for the large icon. Unticking the rest makes the file smaller without dropping anything anyone will ask for.',
        ],
      },
      {
        h: 'How to generate one',
        p: [
          'The source image can be PNG, JPEG or WebP. The ideal input is a square PNG with a transparent background, because it is the only case where nothing has to be invented or thrown away.',
        ],
        steps: [
          'Drop the image on the upload area, or bring another tool’s result in through the chain.',
          'Tick the resolutions that should go into the file. At least one is required.',
          'Build the .ico and download it. The button comes back whenever you change the size selection, and disappears when the file on screen is already exactly what the selection asks for.',
          'In your HTML, point <link rel="icon" href="/favicon.ico"> at it — or simply drop the file at the site root under that name.',
        ],
      },
      {
        h: 'A rectangle goes in, a rectangle stays',
        p: [
          'An icon is square by definition, and most logos are not. Here the image is fitted by aspect ratio: it shrinks until it fits inside the square whole, and what is left over stays transparent. The alternative — stretching to fill — was rejected because it produces a result nobody accepts: a 1600x900 photo squeezed into 256x256 is visibly flattened, and at 16 pixels that becomes a smudge.',
          'When the image is not square, the page says so before you generate. If what you want is the logo filling the whole square, crop first — and the crop tool hands its result straight here, with no download and re-upload in between.',
        ],
      },
      {
        h: 'Transparency and colour',
        p: [
          'Every entry in the file is written as a 32-bit PNG, so the original alpha channel passes through whole: a logo with a transparent background stays transparent against the tab bar, light or dark. That is why PNG is the right format to bring here.',
          'A JPEG has no transparency to keep. Its background — white, almost always — becomes part of the icon and shows up as a solid square around the artwork. If your art is a JPEG and you need the background gone, run it through background removal first: it returns a PNG with real alpha, and that PNG reaches this tool through the chain.',
        ],
      },
      {
        h: 'Why it is still .ico',
        p: [
          'A <link rel="icon"> pointing at a PNG works in every current browser, and for many sites that is enough. The .ico wins on two concrete points: it is what the browser looks for on its own at /favicon.ico when the HTML declares nothing — including when opening a page of yours served from an old cache — and it is the only format that answers every context with one file, because it carries several resolutions inside itself.',
          'It is also what Windows expects when creating a shortcut to the page, and what older feed readers and aggregators know how to read. None of that is decisive on its own; together it is why .ico remains the standard that gives no trouble.',
        ],
      },
      {
        h: 'Where it stops',
        p: [
          'The .ico is the end of the chain: no tool here opens one back up, which is why the page offers no next step after generating. The useful path runs the other way — arriving here from another tool. Remove the background, crop to a square and then build the icon is the whole sequence, and none of the three steps sends the file anywhere.',
          'All of the work happens in your browser: the image is decoded, redrawn at each size and encoded to PNG on your machine, and the file you download was assembled right there. Nothing is uploaded, and the meter at the top of the page shows that while you work.',
        ],
      },
    ],
  },
  resize: {
    pt: [
      {
        h: 'Como redimensionar uma imagem',
        p: [
          'Redimensionar reamostra a imagem inteira: nada da cena é descartado, todos os pixels são recalculados para o novo tamanho. É o oposto de cortar, e a diferença importa quando o destino pede uma dimensão exata — um limite de upload, uma miniatura, uma foto que precisa caber numa largura de coluna.',
        ],
        steps: [
          'Solte a imagem na área de upload. A largura e a altura originais aparecem preenchidas.',
          'Escolha um dos atalhos de largura (1920, 1280, 800 ou 400 pixels) ou digite a dimensão que você precisa.',
          'Deixe a proporção travada para que a altura acompanhe a largura. Destrave apenas se o destino exigir uma deformação deliberada.',
          'Baixe o resultado ou mande para a próxima ferramenta da cadeia.',
        ],
      },
      {
        h: 'Reduzir, ampliar e o limite honesto de cada um',
        p: [
          'Reduzir é seguro: há mais informação na origem do que o destino comporta, e a reamostragem tem de onde escolher. É o caso de quase todo redimensionamento real — foto de celular de 4032 pixels de largura indo para os 1200 de um site.',
          'Ampliar é diferente, e nenhuma interpolação resolve isso: o detalhe que não foi capturado não existe em lugar nenhum do arquivo. Esticar 400 para 1600 devolve uma imagem maior e mais macia, não uma imagem com mais detalhe. Quando o objetivo é de fato recuperar nitidez ao ampliar, a ferramenta certa é a de melhorar qualidade, que trabalha com um modelo treinado para isso em vez de espalhar os mesmos pixels por uma área maior.',
          'Os limites de entrada são os do módulo de imagem: PNG, JPEG, WebP, GIF, BMP e AVIF, até 50 MB, e um teto de cerca de 40 milhões de pixels que o próprio navegador impõe a qualquer tela.',
        ],
      },
      {
        h: 'Proporção travada e o que acontece ao destravar',
        p: [
          'Com a proporção travada, digitar a largura calcula a altura, e vice-versa — é o comportamento que preserva a geometria da cena. Destravar existe porque há casos legítimos de deformação (um banner que precisa de uma medida fixa nos dois eixos), mas o efeito colateral é que rostos e círculos deixam de ser o que eram. Se o objetivo é caber numa caixa sem distorcer, redimensione pela maior dimensão e resolva o resto com o corte.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Redimensionar é a operação que mais gente faz em serviço online, e é também a que menos justifica um upload: a conta é aritmética sobre pixels que já estão na sua máquina. Aqui ela roda na aba, sem enviar nada, o que se aplica igualmente a uma foto de produto e a um documento digitalizado com dados pessoais.',
          'Como a página fica em cache depois da primeira visita, a ferramenta continua funcionando offline, e o medidor de rede na barra superior segue mostrando zero byte de arquivo saindo enquanto você trabalha.',
        ],
      },
    ],
    en: [
      {
        h: 'How to resize an image',
        p: [
          'Resizing resamples the whole image: nothing in the scene is discarded, every pixel is recomputed for the new size. It is the opposite of cropping, and the difference matters when the destination demands an exact dimension — an upload limit, a thumbnail, a photo that has to fit a column width.',
        ],
        steps: [
          'Drop the image on the upload area. The original width and height come in already filled.',
          'Pick one of the width shortcuts (1920, 1280, 800 or 400 pixels) or type the dimension you need.',
          'Leave the ratio locked so height follows width. Unlock only when the destination demands a deliberate distortion.',
          'Download the result or send it on to the next tool in the chain.',
        ],
      },
      {
        h: 'Shrinking, enlarging, and the honest limit of each',
        p: [
          'Shrinking is safe: there is more information in the source than the destination can hold, so the resampling has something to choose from. That covers almost every real resize — a phone photo 4032 pixels wide heading for the 1200 a website wants.',
          'Enlarging is a different matter, and no interpolation fixes it: detail that was never captured exists nowhere in the file. Stretching 400 to 1600 returns a larger, softer image, not one with more detail. When the goal really is to recover sharpness while enlarging, the right tool is the quality enhancer, which runs a model trained for it instead of spreading the same pixels over a wider area.',
          'Input limits are the ones the image module sets everywhere: PNG, JPEG, WebP, GIF, BMP and AVIF, up to 50 MB, plus the ceiling of roughly 40 million pixels that the browser itself imposes on any canvas.',
        ],
      },
      {
        h: 'Locked ratio, and what unlocking does',
        p: [
          'With the ratio locked, typing a width computes the height and the other way round — that is the behaviour that preserves the geometry of the scene. Unlocking exists because there are legitimate distortions (a banner that needs a fixed measure on both axes), but the side effect is that faces and circles stop being what they were. If the goal is to fit a box without distorting, resize by the larger dimension and let the crop handle the rest.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Resizing is the operation most people hand to an online service, and the one that least justifies an upload: it is arithmetic over pixels that are already on your machine. Here it runs in the tab, sending nothing, which applies equally to a product photo and to a scanned document full of personal data.',
          'Because the page is cached after the first visit, the tool keeps working offline, and the network meter in the top bar keeps showing zero file bytes leaving while you work.',
        ],
      },
    ],
  },
  compress: {
    pt: [
      {
        h: 'Como comprimir uma imagem',
        p: [
          'A compressão aqui é uma recodificação com qualidade controlada por você, no MESMO formato do arquivo original. Um JPEG volta JPEG, um PNG volta PNG, um WebP volta WebP — o que a ferramenta muda é o tamanho em bytes, nunca o que o arquivo é. Isso importa porque um destino que aceita apenas JPEG não vai aceitar um WebP menor, por mais eficiente que ele seja.',
        ],
        steps: [
          'Solte a imagem. O tamanho original aparece ao lado do resultado, para comparação.',
          'Ajuste o controle de qualidade. O padrão é 75, a faixa em que a maioria das fotos perde peso sem artefato visível.',
          'Compare o antes e o depois no comparador da tela antes de decidir.',
          'Baixe, ou envie o resultado para a próxima ferramenta sem passar pelo disco.',
        ],
      },
      {
        h: 'O que a qualidade significa em cada formato',
        p: [
          'Em JPEG e WebP a qualidade controla quanta informação de alta frequência é descartada — bordas finas, textura, ruído. Abaixo de 60 a diferença começa a aparecer em áreas de céu e de pele; acima de 90 o arquivo cresce rápido sem ganho visível. É por isso que o padrão fica no meio.',
          'PNG não tem modo com perda. O controle continua ali porque a recodificação ainda vale para arquivos gravados de forma ineficiente por alguns programas, mas o resultado é uma reescrita sem perda: às vezes menor, às vezes maior. Quando a recodificação cresce o arquivo, a ferramenta devolve os bytes ORIGINAIS em vez do resultado inflado — um compressor que entrega um arquivo maior é a única falha que ninguém perdoa.',
          'GIF, BMP e AVIF são um caso à parte: o navegador decodifica os três e não escreve nenhum deles. Para esses, a saída sai em WebP, porque não existe alternativa que preserve o formato — e a mudança é anunciada, em vez de acontecer no silêncio da extensão.',
        ],
      },
      {
        h: 'Quando comprimir não é o que você quer',
        p: [
          'Se a imagem vai ser exibida a 800 pixels de largura, comprimir uma foto de 4000 pixels é otimizar o arquivo errado: redimensionar primeiro corta muito mais peso do que qualquer ajuste de qualidade, e sem artefato nenhum. O caminho útil é redimensionar e depois comprimir, que aqui é uma navegação e não dois uploads.',
          'Se o objetivo é trocar de formato, de PNG para JPEG ou de JPEG para WebP, a ferramenta é a de converter. E se a imagem vai para impressão, comprimir com perda antes de enviar é uma decisão sem volta — o arquivo original é o único lugar onde aquele detalhe ainda existe.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Compressores online recebem o arquivo, recodificam num servidor e devolvem o menor — e é comum que fiquem com uma cópia por tempo indeterminado. Como a conta é feita pelo codificador que já vem no navegador, ela não precisa de servidor nenhum: a imagem é decodificada para uma tela em memória e escrita de volta pela mesma aba.',
          'O medidor no alto da página conta bytes de arquivo saindo pela rede, e ele fica em zero durante toda a operação. Depois da primeira visita a ferramenta funciona offline, o que é fácil de verificar: desligue o Wi-Fi e comprima outra imagem.',
        ],
      },
    ],
    en: [
      {
        h: 'How to compress an image',
        p: [
          'Compression here is a re-encode at a quality you control, in the SAME format as the original file. A JPEG comes back JPEG, a PNG comes back PNG, a WebP comes back WebP — what the tool changes is the size in bytes, never what the file is. That matters because a destination that only accepts JPEG will not take a smaller WebP, however efficient it is.',
        ],
        steps: [
          'Drop the image. The original size sits next to the result for comparison.',
          'Move the quality control. The default is 75, the range where most photos lose weight with no visible artefact.',
          'Compare before and after in the on-screen slider before deciding.',
          'Download, or send the result to the next tool without going through disk.',
        ],
      },
      {
        h: 'What quality means in each format',
        p: [
          'In JPEG and WebP, quality controls how much high-frequency information is thrown away — fine edges, texture, noise. Below 60 the difference starts to show in skies and skin; above 90 the file grows fast for no visible gain. That is why the default sits in the middle.',
          'PNG has no lossy mode. The control stays because a re-encode is still worth it for files written inefficiently by some exporters, but the result is a lossless rewrite: sometimes smaller, sometimes larger. When the re-encode grows the file, the tool hands back the ORIGINAL bytes instead of the inflated result — a compressor that returns a bigger file is the one failure nobody forgives.',
          'GIF, BMP and AVIF are a separate case: the browser decodes all three and writes none of them. For those the output comes out as WebP, because no alternative preserves the format — and the change is announced rather than hidden inside the extension.',
        ],
      },
      {
        h: 'When compression is not what you want',
        p: [
          'If the image will be displayed 800 pixels wide, compressing a 4000-pixel photo optimises the wrong thing: resizing first removes far more weight than any quality setting, and with no artefacts at all. The useful path is resize, then compress — one navigation here, not two uploads.',
          'If the goal is to change format, PNG to JPEG or JPEG to WebP, the converter is the tool. And if the image is headed for print, compressing it lossily beforehand is a decision with no way back — the original file is the only place that detail still exists.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Online compressors take the file, re-encode it on a server and hand back the smaller one — often keeping a copy for an unspecified time. Because the arithmetic is done by the encoder the browser already ships, it needs no server at all: the image is decoded onto an in-memory canvas and written back by the same tab.',
          'The meter at the top of the page counts file bytes leaving over the network, and it stays at zero for the whole operation. After the first visit the tool works offline, which is easy to check: turn off Wi-Fi and compress another image.',
        ],
      },
    ],
  },
  convert: {
    pt: [
      {
        h: 'Como converter uma imagem',
        p: [
          'A conversão decodifica a imagem para uma tela em memória e a escreve de novo no formato escolhido. Saem WebP, JPEG, PNG, PDF e ICO. O AVIF entra mas não sai, e isso é uma limitação honesta do navegador: não existe codificador AVIF nativo, e pedir um a uma tela faz o navegador devolver PNG em silêncio, com o nome errado.',
        ],
        steps: [
          'Solte a imagem na área de upload.',
          'Escolha o formato de saída. Cada um traz os próprios controles quando faz sentido — a cor de fundo, no caso do PDF.',
          'Confira o tamanho do resultado ao lado do original.',
          'Baixe o arquivo, já com o nome derivado do original.',
        ],
      },
      {
        h: 'Qual formato escolher',
        p: [
          'WebP é o padrão porque entrega o menor arquivo com a mesma qualidade visível, e hoje é aceito por todos os navegadores em uso. JPEG é a escolha quando o destino é antigo ou rígido: um sistema de RH, um formulário de concurso público, a impressora velha da copiadora. PNG é para quando a transparência ou a ausência total de perda importam mais que o tamanho.',
          'PDF e ICO são terminais — o resultado deixa de ser uma imagem que a cadeia consegue continuar editando. O PDF serve para enviar uma foto onde só se aceita documento; o ICO existe para favicon e atalho de aplicativo, e escreve os tamanhos que um ícone precisa em vez de um PNG renomeado.',
          'Uma regra que evita retrabalho: converter não muda dimensão nem qualidade percebida por conta própria. Se o arquivo continua grande depois da conversão, o que falta é redimensionar ou comprimir, e as duas ficam a um clique daqui.',
        ],
      },
      {
        h: 'Transparência, fundo, e o preto que aparece do nada',
        p: [
          'JPEG e PDF não têm canal alfa. Converter um PNG transparente para um deles sem tratar o fundo produz preto onde havia transparência — é assim que a especificação define, e é o defeito clássico do conversor apressado. Aqui a imagem é achatada sobre um fundo antes de ser escrita, e no caso do PDF esse fundo é uma escolha sua, não um padrão escondido.',
          'Se a transparência precisa sobreviver, os formatos possíveis são PNG e WebP. Converter para JPEG é uma decisão de descartar o alfa, e vale saber disso antes, não depois.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Conversores online são o caso em que o upload é mais difícil de justificar: a imagem que você quer converter já está decodificada na sua máquina no instante em que aparece na tela. Aqui a conversão usa o mesmo codificador que o navegador usa para todo o resto — nenhum byte do arquivo sai, e o medidor da barra superior mostra o número em tempo real.',
          'A consequência é que dá para converter um documento digitalizado, uma foto de documento ou um contrato sem que ele passe por servidor nenhum. E, depois da primeira visita, sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to convert an image',
        p: [
          'Conversion decodes the image onto an in-memory canvas and writes it back out in the format you pick. WebP, JPEG, PNG, PDF and ICO come out. AVIF goes in but does not come out, and that is an honest browser limitation: there is no native AVIF encoder, and asking a canvas for one makes the browser silently return PNG under the wrong name.',
        ],
        steps: [
          'Drop the image on the upload area.',
          'Choose the output format. Each brings its own controls where they make sense — background colour, in the case of PDF.',
          'Check the size of the result next to the original.',
          'Download the file, already named after the original.',
        ],
      },
      {
        h: 'Which format to choose',
        p: [
          'WebP is the default because it gives the smallest file at the same visible quality, and every browser in use today accepts it. JPEG is the choice when the destination is old or rigid: an HR system, a government form, the ageing printer at a copy shop. PNG is for when transparency or the complete absence of loss matters more than size.',
          'PDF and ICO are terminal — the result stops being an image the chain can keep editing. PDF is for sending a photo where only a document is accepted; ICO exists for favicons and app shortcuts, and writes the sizes an icon actually needs instead of a renamed PNG.',
          'One rule that saves rework: conversion changes neither dimensions nor perceived quality on its own. If the file is still large afterwards, what you need is resize or compress, and both are one click from here.',
        ],
      },
      {
        h: 'Transparency, background, and the black that appears from nowhere',
        p: [
          'JPEG and PDF have no alpha channel. Converting a transparent PNG into either without handling the background produces black where the transparency was — that is what the specification says, and it is the classic defect of a careless converter. Here the image is flattened onto a background before writing, and for PDF that background is your choice rather than a hidden default.',
          'If transparency has to survive, the possible formats are PNG and WebP. Converting to JPEG is a decision to discard the alpha, and it is worth knowing that before rather than after.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Converters are the case where an upload is hardest to justify: the image you want to convert is already decoded on your machine the moment it appears on screen. Here the conversion uses the same encoder the browser uses for everything else — no byte of the file leaves, and the meter in the top bar shows the number in real time.',
          'The consequence is that you can convert a scanned document, a photo of an ID or a contract without it passing through any server. And after the first visit, with no internet at all.',
        ],
      },
    ],
  },
  'compress-pdf': {
    pt: [
      {
        h: 'Como comprimir um PDF',
        p: [
          'Um PDF pesado quase nunca é pesado por causa do texto: são as imagens dentro dele. Por isso a compressão aqui tem quatro níveis, e três deles trabalham exatamente nesse ponto — cada página é rasterizada numa resolução alvo e regravada como JPEG. O quarto nível não rasteriza nada.',
        ],
        steps: [
          'Solte o PDF. Se ele tiver senha, a ferramenta pede a senha antes de abrir, e a usa em todas as etapas seguintes.',
          'Escolha o nível: leve (200 dpi), equilibrado (150 dpi), forte (110 dpi) ou sem perdas.',
          'Acompanhe o progresso página a página. Documentos longos levam alguns segundos por página em máquinas modestas.',
          'Compare o tamanho final com o original antes de baixar.',
        ],
      },
      {
        h: 'O que cada nível faz, em números',
        p: [
          'Leve rasteriza a 200 dpi com qualidade JPEG de 85%: é a faixa em que um documento digitalizado continua confortável de ler na tela e ainda imprime bem. Equilibrado usa 150 dpi e 72%, que é a escolha padrão para anexar em e-mail. Forte desce para 110 dpi e 60%, e aí a intenção é caber num limite de upload, não preservar a aparência.',
          'Sem perdas é outra operação: o arquivo é reescrito sem tocar nas páginas, o que remove sobras estruturais e nada mais. O ganho costuma ser modesto, e às vezes é zero — quando a recodificação não diminui o arquivo, os bytes originais voltam em vez de um resultado maior.',
          'O teto de entrada é 100 MB por arquivo, que é o limite do módulo de PDF inteiro. Ele não é arbitrário: rasterizar uma página aloca uma tela na memória da aba, e um documento acima disso derruba a aba antes de terminar.',
        ],
      },
      {
        h: 'O que a rasterização custa, e o que foi feito para doer menos',
        p: [
          'Rasterizar destrói o texto vetorial: a página vira uma imagem, então o texto deixa de ser selecionável e a nitidez passa a depender do zoom. É uma troca real, e o painel avisa antes.',
          'O que a ferramenta faz para reduzir o dano é redesenhar a camada de texto original por cima da imagem, invisível. O resultado é um documento que parece uma imagem mas continua respondendo a Ctrl+F e a copiar e colar — o mesmo recurso que a exportação de OCR usa para deixar um documento digitalizado pesquisável.',
          'Se a fidelidade vetorial importa mais que o tamanho (um contrato que vai ser lido no celular, um material que vai para impressão), o nível sem perdas é o único que não faz essa troca.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Comprimir PDF é a operação em que o upload é mais arriscado, porque o arquivo típico é justamente o documento que ninguém deveria mandar para lugar nenhum: contrato, holerite, laudo, procuração. Um serviço convencional recebe esse arquivo num servidor e o mantém pelo tempo que a política dele disser.',
          'Aqui o PDF é aberto pelo pdf.js dentro da própria aba, rasterizado numa tela em memória e regravado pela mesma aba. O medidor no topo da página conta bytes de arquivo saindo, e ele permanece em zero do começo ao fim.',
        ],
      },
    ],
    en: [
      {
        h: 'How to compress a PDF',
        p: [
          'A heavy PDF is almost never heavy because of its text: it is the images inside it. That is why compression here has four levels, and three of them work exactly on that point — each page is rasterised at a target resolution and rewritten as JPEG. The fourth level rasterises nothing.',
        ],
        steps: [
          'Drop the PDF. If it is password-protected, the tool asks for the password before opening and reuses it for every later step.',
          'Pick a level: light (200 dpi), balanced (150 dpi), strong (110 dpi) or lossless.',
          'Watch the progress page by page. Long documents take a few seconds per page on modest machines.',
          'Compare the final size with the original before downloading.',
        ],
      },
      {
        h: 'What each level does, in numbers',
        p: [
          'Light rasterises at 200 dpi with JPEG quality 85%: the range where a scanned document stays comfortable to read on screen and still prints well. Balanced uses 150 dpi and 72%, the default choice for attaching to an email. Strong drops to 110 dpi and 60%, and at that point the intent is to fit an upload limit, not to preserve appearance.',
          'Lossless is a different operation: the file is rewritten without touching the pages, which removes structural leftovers and nothing else. The gain is usually modest and sometimes zero — when the rewrite does not shrink the file, the original bytes come back instead of a larger result.',
          'The input ceiling is 100 MB per file, the limit of the whole PDF module. It is not arbitrary: rasterising a page allocates a canvas in the memory of the tab, and a document past that point takes the tab down before it finishes.',
        ],
      },
      {
        h: 'What rasterising costs, and what was done to soften it',
        p: [
          'Rasterising destroys vector text: the page becomes an image, so the text stops being selectable and sharpness starts to depend on zoom. It is a real trade, and the panel says so beforehand.',
          'What the tool does to limit the damage is redraw the original text layer over the image, invisibly. The result is a document that looks like an image but still answers Ctrl+F and copy-paste — the same trick the OCR export uses to make a scanned document searchable.',
          'If vector fidelity matters more than size (a contract that will be read on a phone, artwork headed for print), the lossless level is the only one that does not make that trade.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Compressing a PDF is the operation where uploading is riskiest, because the typical file is precisely the document nobody should send anywhere: a contract, a payslip, a medical report, a power of attorney. A conventional service receives that file on a server and keeps it for as long as its policy says.',
          'Here the PDF is opened by pdf.js inside the tab itself, rasterised onto an in-memory canvas and rewritten by that same tab. The meter at the top of the page counts file bytes leaving, and it stays at zero from beginning to end.',
        ],
      },
    ],
  },
  'merge-pdf': {
    pt: [
      {
        h: 'Como juntar PDFs',
        p: [
          'A junção copia as páginas dos arquivos de origem para um documento novo, na ordem que você definir. Não há recodificação: uma página que entra vetorial sai vetorial, com as mesmas fontes e a mesma resolução de imagem. O arquivo final é o mesmo conteúdo em um invólucro só.',
        ],
        steps: [
          'Solte vários PDFs de uma vez, ou adicione um por um — a lista aceita até 20 arquivos e 300 páginas no total.',
          'Arraste as miniaturas para reordenar. Os botões de seta fazem o mesmo, e são o controle de verdade no celular e no teclado.',
          'Confira a sequência inteira na tira de páginas antes de gerar.',
          'Baixe o PDF resultante, ou mande direto para outra ferramenta do módulo.',
        ],
      },
      {
        h: 'Limites, ordem e por que eles existem',
        p: [
          'Os limites de 20 arquivos e 300 páginas são de memória, não de política: cada origem é aberta e mantida disponível enquanto a montagem acontece, e o navegador tem um teto para isso. Quando um deles é atingido, a ferramenta avisa qual foi e o que sobrou de fora, em vez de truncar em silêncio.',
          'A ordem é o único dado que a ferramenta não deriva sozinha, e é por isso que a lista de origens vive só dentro desta tela: ela não acompanha o arquivo da sessão. Se acompanhasse, qualquer mudança na sessão jogaria fora a ordem que você acabou de arrumar.',
          'A cópia é feita por arquivo de origem, e não por página. Copiar página a página duplicaria as fontes e os perfis de cor compartilhados a cada chamada, e o resultado ficaria maior que a soma das entradas.',
        ],
      },
      {
        h: 'Quando juntar não resolve',
        p: [
          'Para tirar páginas de um documento, a ferramenta é dividir; para reordenar ou girar dentro de um único arquivo, é organizar. Juntar é para reunir arquivos diferentes.',
          'Se as origens têm tamanhos de página diferentes (um A4 e um ofício, por exemplo), o resultado preserva cada página como ela era — o documento final tem páginas de tamanhos distintos, o que é o comportamento correto e às vezes surpreende na impressão. Uniformizar exige rasterizar, que é o que a compressão faz, com o custo que ela anuncia.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Juntar PDFs é o serviço online mais buscado do mundo dos documentos, e quase sempre envolve papelada que não deveria circular: propostas, prontuários, documentação de processo. A operação em si não precisa de servidor — é manipulação de estrutura de arquivo, e a biblioteca que faz isso roda inteira em JavaScript.',
          'Aqui os arquivos são lidos pela aba e o documento final é montado na memória dela. Nada é enviado, e o medidor na barra superior mostra isso enquanto você trabalha. Depois da primeira visita, funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to merge PDFs',
        p: [
          'Merging copies the pages of the source files into a new document, in the order you set. There is no re-encode: a page that goes in vector comes out vector, with the same fonts and the same image resolution. The final file is the same content in a single wrapper.',
        ],
        steps: [
          'Drop several PDFs at once, or add them one at a time — the list takes up to 20 files and 300 pages in total.',
          'Drag the thumbnails to reorder. The arrow buttons do the same, and they are the real control on a phone and from a keyboard.',
          'Check the whole sequence in the page strip before generating.',
          'Download the resulting PDF, or send it straight to another tool in the module.',
        ],
      },
      {
        h: 'Limits, order, and why they exist',
        p: [
          'The 20-file and 300-page limits are about memory, not policy: every source is opened and kept available while the assembly runs, and the browser has a ceiling for that. When one is reached, the tool says which one and what was left out, instead of truncating silently.',
          'Order is the one piece of data the tool cannot derive on its own, which is why the source list lives only inside this screen: it does not follow the session file. If it did, any change to the session would throw away the order you just arranged.',
          'Copying happens per source file, not per page. Copying page by page would duplicate shared fonts and colour profiles on every call, and the result would end up larger than the sum of its inputs.',
        ],
      },
      {
        h: 'When merging is not the answer',
        p: [
          'To take pages out of a document, the tool is split; to reorder or rotate inside a single file, it is organise. Merging is for bringing different files together.',
          'If the sources have different page sizes (A4 and legal, say), the result preserves each page as it was — the final document has pages of different sizes, which is the correct behaviour and occasionally surprises at the printer. Making them uniform requires rasterising, which is what compression does, at the cost it announces.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Merging PDFs is the most searched-for service in the document world, and it almost always involves paperwork that should not circulate: proposals, medical records, case files. The operation itself needs no server — it is file-structure manipulation, and the library that does it runs entirely in JavaScript.',
          'Here the files are read by the tab and the final document is assembled in its memory. Nothing is sent, and the meter in the top bar shows that while you work. After the first visit, it works with no internet.',
        ],
      },
    ],
  },
  'split-pdf': {
    pt: [
      {
        h: 'Como dividir um PDF',
        p: [
          'Dividir tem dois modos, e escolher o certo economiza retrabalho. O modo de intervalos produz documentos com faixas de páginas — capítulos, anexos, um lote fixo a cada N páginas. O modo de páginas extrai páginas avulsas, cada uma virando um arquivo.',
        ],
        steps: [
          'Solte o PDF. As miniaturas aparecem para você conferir a numeração real do documento.',
          'Escolha o modo: intervalos ou páginas.',
          'Em intervalos, escreva as faixas (por exemplo 1-3, 8, 12-20) ou peça blocos de tamanho fixo.',
          'Decida se quer os resultados como arquivos separados ou reunidos num só documento.',
          'Baixe. Quando a divisão gera mais de um arquivo, o download vem como um zip.',
        ],
      },
      {
        h: 'Intervalos, blocos fixos e o zip',
        p: [
          'As faixas seguem a numeração das páginas do próprio PDF, que nem sempre é a numeração impressa no rodapé — a tira de miniaturas existe justamente para você conferir antes de digitar.',
          'Blocos de tamanho fixo servem a um caso comum e chato: separar um documento longo em pedaços de duas, cinco ou dez páginas para enviar dentro de um limite de anexo. É a mesma operação repetida, e escrever cada faixa à mão é onde o erro aparece.',
          'Quando a saída tem vários arquivos, ela sai zipada — e a ferramenta sabe disso: a lista do que fazer a seguir muda de acordo, porque oferecer assinar PDF para um zip é pior do que não oferecer nada.',
        ],
      },
      {
        h: 'O que a divisão preserva e o que ela não resolve',
        p: [
          'As páginas extraídas são cópias das originais, sem recodificação: o texto continua vetorial e selecionável, as imagens continuam na resolução em que estavam. Um documento assinado digitalmente, porém, perde a validade da assinatura ao ser dividido — isso vale para qualquer ferramenta, aqui inclusive, porque a assinatura cobre o arquivo inteiro.',
          'Se a intenção é apagar informação de uma página em vez de separar páginas, dividir não serve: a página continua inteira dentro do pedaço extraído. Para isso existe a censura de PDF, que rasteriza a página e elimina o texto por baixo da tarja.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Dividir é uma operação de estrutura: nada precisa ser recalculado, apenas copiado para um documento novo. Ela cabe inteira no navegador, e é o tipo de coisa que ninguém deveria enviar para um servidor — a razão mais comum para dividir um PDF é justamente separar o que pode ser mostrado do que não pode.',
          'O arquivo é lido pela aba, e os pedaços são montados e zipados ali mesmo. O medidor de rede continua em zero, e a ferramenta funciona offline depois da primeira visita.',
        ],
      },
    ],
    en: [
      {
        h: 'How to split a PDF',
        p: [
          'Splitting has two modes, and picking the right one saves rework. Range mode produces documents made of page spans — chapters, appendices, a fixed batch every N pages. Page mode extracts individual pages, each one becoming a file.',
        ],
        steps: [
          'Drop the PDF. Thumbnails appear so you can check the real page numbering of the document.',
          'Choose the mode: ranges or pages.',
          'In range mode, write the spans (1-3, 8, 12-20, for instance) or ask for fixed-size blocks.',
          'Decide whether you want the results as separate files or gathered into a single document.',
          'Download. When the split produces more than one file, the download arrives as a zip.',
        ],
      },
      {
        h: 'Ranges, fixed blocks and the zip',
        p: [
          'Spans follow the page numbering of the PDF itself, which is not always the numbering printed in the footer — the thumbnail strip exists precisely so you can check before typing.',
          'Fixed-size blocks serve a common, tedious case: breaking a long document into two, five or ten-page pieces to send within an attachment limit. It is the same operation repeated, and writing each span by hand is where mistakes appear.',
          'When the output has several files it comes out zipped — and the tool knows it: the list of what to do next changes accordingly, because offering to sign a PDF when the result is a zip is worse than offering nothing.',
        ],
      },
      {
        h: 'What splitting preserves and what it does not solve',
        p: [
          'Extracted pages are copies of the originals, with no re-encode: text stays vector and selectable, images stay at the resolution they were. A digitally signed document, however, loses the validity of its signature when split — that holds for any tool, this one included, because the signature covers the whole file.',
          'If the intent is to erase information on a page rather than separate pages, splitting does not help: the page is still whole inside the extracted piece. That is what PDF redaction is for, which rasterises the page and removes the text under the bar.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Splitting is a structural operation: nothing has to be recomputed, only copied into a new document. It fits entirely in the browser, and it is exactly the kind of thing nobody should send to a server — the most common reason to split a PDF is to separate what may be shown from what may not.',
          'The file is read by the tab, and the pieces are assembled and zipped right there. The network meter stays at zero, and the tool works offline after the first visit.',
        ],
      },
    ],
  },
  'img-to-pdf': {
    pt: [
      {
        h: 'Como transformar imagens em PDF',
        p: [
          'Esta ferramenta monta um PDF a partir de várias imagens, uma por página, na ordem que você definir. É o caminho para entregar fotos de documentos onde só se aceita PDF — cartório, RH, matrícula, prestação de contas.',
        ],
        steps: [
          'Solte várias imagens de uma vez, ou vá adicionando aos poucos.',
          'Arraste as miniaturas para definir a ordem das páginas, ou use os botões de seta.',
          'Escolha o formato da página: A4, que centraliza cada imagem numa folha padrão, ou o tamanho da própria imagem.',
          'Ajuste a cor de fundo, que é o que aparece nas sobras quando a imagem não preenche a folha.',
          'Gere e baixe. O nome do arquivo vem da primeira página.',
        ],
      },
      {
        h: 'A4 ou tamanho da imagem, e o teto de resolução',
        p: [
          'A4 é a escolha certa quando o PDF vai ser impresso ou anexado a um processo: todas as páginas ficam do mesmo tamanho, e cada foto entra centralizada com margem. O tamanho da imagem serve para quando o PDF é só um invólucro e a proporção original importa mais do que a folha.',
          'Em lote, o lado maior de cada imagem é limitado a 2400 pixels antes de entrar na página. Sem esse teto, trinta fotos de celular produzem um PDF de dezenas de megabytes, com 2 a 3 MB por página, que é grande demais para o uso real — anexar, enviar, arquivar. Quando a conversão é de uma imagem só, esse teto não se aplica: ali você pediu aquela imagem naquela resolução.',
          'As imagens são processadas uma de cada vez, e não todas em paralelo. Trinta fotos de 12 megapixels decodificadas ao mesmo tempo são gigabytes de memória, e a aba morre antes de terminar.',
        ],
      },
      {
        h: 'O que entra e o que sai',
        p: [
          'Entram PNG, JPEG, WebP, GIF, BMP e AVIF, até 50 MB por imagem. Sai um PDF de verdade, que os leitores abrem e as impressoras aceitam.',
          'Como o PDF não tem canal alfa, imagens com transparência são achatadas sobre a cor de fundo escolhida antes de entrar na página — sem isso, a transparência viraria preto, que é o defeito clássico dessa conversão.',
          'O resultado entra na cadeia do módulo de PDF: dá para seguir direto para juntar, comprimir, proteger com senha ou assinar, sem baixar e subir de novo.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'A foto de documento é o arquivo mais sensível que a maioria das pessoas converte, e é justamente o que se manda para um conversor online sem pensar. Aqui as imagens são decodificadas e desenhadas no PDF pela própria aba; nenhuma delas passa por servidor.',
          'O medidor no topo mostra zero byte de arquivo saindo durante toda a montagem, e a ferramenta continua funcionando com a rede desligada depois da primeira visita.',
        ],
      },
    ],
    en: [
      {
        h: 'How to turn images into a PDF',
        p: [
          'This tool assembles a PDF from several images, one per page, in the order you set. It is the path for delivering photos of documents where only a PDF is accepted — a registry office, HR, an enrolment, an expense report.',
        ],
        steps: [
          'Drop several images at once, or add them gradually.',
          'Drag the thumbnails to set page order, or use the arrow buttons.',
          'Choose the page format: A4, which centres each image on a standard sheet, or the size of the image itself.',
          'Set the background colour, which is what shows in the margins when an image does not fill the sheet.',
          'Generate and download. The filename comes from the first page.',
        ],
      },
      {
        h: 'A4 or image size, and the resolution ceiling',
        p: [
          'A4 is the right choice when the PDF will be printed or attached to a case file: every page is the same size, and each photo sits centred with a margin. Image size is for when the PDF is only a wrapper and the original proportion matters more than the sheet.',
          'In a batch, the long side of each image is capped at 2400 pixels before it enters the page. Without that ceiling, thirty phone photos produce a PDF of tens of megabytes at 2 to 3 MB per page, which is too large for the real use — attaching, sending, filing. When the conversion is a single image, the cap does not apply: there you asked for that image at that resolution.',
          'Images are processed one at a time, not all in parallel. Thirty 12-megapixel photos decoded at once are gigabytes of memory, and the tab dies before finishing.',
        ],
      },
      {
        h: 'What goes in and what comes out',
        p: [
          'PNG, JPEG, WebP, GIF, BMP and AVIF go in, up to 50 MB per image. A real PDF comes out, one that readers open and printers accept.',
          'Because PDF has no alpha channel, images with transparency are flattened onto the chosen background colour before entering the page — without that, transparency would turn black, the classic defect of this conversion.',
          'The result joins the PDF module chain: you can go straight on to merge, compress, password-protect or sign, with no download and re-upload in between.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'A photo of an identity document is the most sensitive file most people ever convert, and it is exactly what gets handed to an online converter without a second thought. Here the images are decoded and drawn into the PDF by the tab itself; none of them passes through a server.',
          'The meter at the top shows zero file bytes leaving for the whole assembly, and the tool keeps working with the network off after the first visit.',
        ],
      },
    ],
  },
  'remove-bg': {
    pt: [
      {
        h: 'Como remover o fundo de uma imagem',
        p: [
          'A ferramenta roda sozinha assim que a imagem entra: escolher "remover fundo" com uma foto na mão já é o pedido, e o clique a mais não significava nada. O resultado é um PNG com canal alfa de verdade — transparência, não um retângulo branco por baixo.',
        ],
        steps: [
          'Solte a foto. Na primeira vez o modelo é baixado (42 MB) e fica guardado para as próximas.',
          'Espere a segmentação. Numa foto de celular são poucos segundos em máquina comum.',
          'Confira as bordas no comparador. Cabelo, pelo e vidro são onde qualquer recorte erra.',
          'Se sobrou ou faltou pedaço, use o pincel de retoque: apagar tira, restaurar traz de volta o pixel original.',
          'Baixe o PNG, ou mande para outra ferramenta pelo atalho de enviar para.',
        ],
      },
      {
        h: 'Dois caminhos, escolhidos pela imagem',
        p: [
          'Foto e arte plana são problemas diferentes, e a ferramenta mede a imagem antes de decidir qual usar. Foto vai para a rede neural IS-Net, treinada para separar objeto de fundo em cena real. Logo, ícone e desenho de cor chapada vão para um recorte por cor, que amostra as bordas da imagem e derruba o que casa com elas.',
          'A troca não é preguiça, é o contrário: a rede é a PIOR ferramenta para arte plana. Um logo é justamente o tipo de imagem que ela nunca viu no treino, e o resultado vem salpicado de pixel solto na borda. O recorte por cor, por sua vez, é péssimo em cabelo, onde não existe uma cor de fundo única para derrubar.',
          'O modelo pesa 42 MB e é baixado uma vez só, em pedaços, ficando disponível offline depois disso. Ele roda em várias threads quando o navegador libera memória compartilhada; num servidor mal configurado cai para uma thread e fica cerca de seis vezes mais lento, sem erro nenhum na tela.',
        ],
      },
      {
        h: 'Onde o recorte erra, e o que fazer',
        p: [
          'Fio de cabelo solto, tule, fumaça e vidro são semitransparentes: nenhum recorte automático resolve isso bem, aqui ou em qualquer outro lugar. O pincel de retoque existe exatamente para essa faixa — ele trabalha sobre o recorte já pronto, então restaurar devolve o pixel que estava naquela coordenada na foto original, não uma cor aproximada.',
          'Fundo da mesma cor do objeto é o segundo caso difícil: uma camisa branca contra parede branca não tem borda para achar. Aí vale cortar antes, para tirar o que não interessa, e retocar depois.',
          'Entram PNG, JPEG, WebP, GIF, BMP e AVIF, até 50 MB. Sai sempre PNG, porque é o formato da lista que carrega transparência sem perda — salvar como JPEG jogaria fora justamente o que a ferramenta produziu.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Todo serviço de remover fundo conhecido manda a sua foto para um servidor, e a foto costuma ser de uma pessoa — produto com modelo, foto de perfil, documento. Aqui o modelo é baixado para a sua máquina e a inferência acontece dentro da aba, o que inverte a direção: o programa vem até o arquivo, em vez de o arquivo ir até o programa.',
          'O medidor no alto da página conta bytes de arquivo saindo e fica em zero durante todo o processamento — o download do modelo aparece como o que é, um download. Depois da primeira visita, a ferramenta funciona com a internet desligada.',
        ],
      },
    ],
    en: [
      {
        h: 'How to remove an image background',
        p: [
          'The tool runs the moment the image arrives: choosing "remove background" with a photo in hand is already the request, and the extra click meant nothing. The result is a PNG with a real alpha channel — transparency, not a white rectangle underneath.',
        ],
        steps: [
          'Drop the photo. The first time, the model is downloaded (42 MB) and kept for later runs.',
          'Wait for the segmentation. On a phone photo it is a few seconds on an ordinary machine.',
          'Check the edges in the comparison slider. Hair, fur and glass are where every cutout goes wrong.',
          'If something was left in or taken out, use the retouch brush: erase removes, restore brings the original pixel back.',
          'Download the PNG, or send it to another tool through the send-to shortcut.',
        ],
      },
      {
        h: 'Two paths, chosen by the image itself',
        p: [
          'Photographs and flat artwork are different problems, and the tool measures the image before deciding. A photograph goes to the IS-Net neural network, trained to separate subject from background in a real scene. A logo, an icon or flat-colour artwork goes to a colour key that samples the image borders and drops whatever matches them.',
          'That split is not laziness, it is the opposite: the network is the WORST tool for flat art. A logo is exactly the kind of image it never saw in training, and the result comes back speckled with stray pixels along the edge. The colour key, in turn, is hopeless on hair, where there is no single background colour to drop.',
          'The model weighs 42 MB and is downloaded once, in parts, staying available offline afterwards. It runs across several threads when the browser grants shared memory; on a badly configured host it falls back to a single thread and gets about six times slower, with no error on screen.',
        ],
      },
      {
        h: 'Where the cutout fails, and what to do',
        p: [
          'Loose hair, tulle, smoke and glass are semi-transparent: no automatic cutout handles that well, here or anywhere else. The retouch brush exists for exactly that band — it works on the finished cutout, so restoring gives back the pixel that was at that coordinate in the original photo, not an approximated colour.',
          'A background the same colour as the subject is the second hard case: a white shirt against a white wall has no edge to find. There it pays to crop first, removing what does not matter, and retouch afterwards.',
          'PNG, JPEG, WebP, GIF, BMP and AVIF go in, up to 50 MB. PNG always comes out, because it is the format on that list that carries transparency losslessly — saving as JPEG would throw away precisely what the tool produced.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Every well-known background remover sends your photo to a server, and the photo is usually of a person — a product shot with a model, a profile picture, an identity document. Here the model is downloaded to your machine and the inference happens inside the tab, which reverses the direction: the program comes to the file instead of the file going to the program.',
          'The meter at the top of the page counts file bytes leaving and stays at zero throughout the processing — the model download shows up as what it is, a download. After the first visit, the tool works with the internet switched off.',
        ],
      },
    ],
  },
  upscale: {
    pt: [
      {
        h: 'Como ampliar uma imagem sem borrar',
        p: [
          'A ampliação é feita por reamostragem multipasso: em 4x a imagem passa primeiro por 2x e só então pelo dobro de novo, porque dois saltos curtos preservam mais estrutura do que um salto longo. Sobre isso vêm reconstrução de borda, antisserrilhado e um controle de nitidez em três níveis, mais uma redução de ruído opcional.',
        ],
        steps: [
          'Solte a imagem. A ampliação roda sozinha, no fator padrão de 2x.',
          'Escolha 2x ou 4x. A resolução final aparece no painel antes e depois de rodar.',
          'Ajuste a nitidez entre suave, equilibrado e máximo — quanto mais alto, mais realce de borda e mais chance de halo.',
          'Deixe a redução de ruído ligada em foto de celular e em imagem salva de aplicativo de mensagem; desligue em desenho e captura de tela.',
          'Baixe o resultado. PNG entra e sai PNG; JPEG, WebP e os demais saem em JPEG de alta qualidade, porque reescrever uma foto como PNG multiplicaria o tamanho sem ganho.',
        ],
      },
      {
        h: 'O que a ferramenta faz, e o que nenhuma ferramenta faz',
        p: [
          'Ampliar não cria informação. O detalhe que a câmera não capturou não está em lugar nenhum do arquivo, e nenhum algoritmo o traz de volta — o que existe é reconstrução plausível de borda, que é outra coisa. O ganho real aqui é uma imagem maior com transição limpa entre áreas, sem o serrilhado e o embaçado que um esticão simples produz.',
          'Onde isso vale muito: logo, captura de tela, desenho de linha e qualquer arte com contorno definido. Onde vale pouco: foto pequena e desfocada de textura fina — pele, tecido, folhagem —, em que não há borda a reconstruir e o resultado fica maior sem ficar melhor.',
          'Um aviso prático de tamanho: 4x multiplica a contagem de pixels por dezesseis, e o navegador tem um teto para o tamanho de uma tela em memória (por volta de 40 milhões de pixels). Ampliar 4x uma foto grande de celular chega perto desse limite. Por isso o padrão é 2x, que resolve a maioria dos casos com folga.',
        ],
      },
      {
        h: 'Quando esta não é a ferramenta certa',
        p: [
          'Para diminuir uma imagem, use redimensionar: reduzir é seguro e não precisa de reconstrução nenhuma. Para caber num limite de upload, comprimir tira muito mais peso.',
          'E para recuperar uma foto muito degradada — comprimida várias vezes, cheia de artefato de JPEG — nada disso resolve: a ampliação vai realçar o artefato junto com o detalhe. Nesse caso o caminho honesto é procurar o arquivo original em vez de tentar salvar a cópia.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'A conta inteira é aritmética sobre os pixels que já estão na sua máquina, e o navegador já traz o rasterizador que a executa. Não há nada aqui que precise de servidor, e por isso não há upload — o medidor da barra superior mostra zero byte de arquivo saindo enquanto a ampliação roda.',
          'Depois da primeira visita a ferramenta funciona sem internet, o que também significa que nenhuma foto sua fica hospedada em lugar nenhum esperando uma política de retenção.',
        ],
      },
    ],
    en: [
      {
        h: 'How to enlarge an image without blurring it',
        p: [
          'Enlargement is done by multi-pass resampling: at 4x the image goes through 2x first and only then doubles again, because two short jumps preserve more structure than one long one. On top of that come edge reconstruction, anti-aliasing and a three-level sharpness control, plus optional noise reduction.',
        ],
        steps: [
          'Drop the image. Enlargement runs on its own at the default 2x factor.',
          'Choose 2x or 4x. The final resolution is shown in the panel before and after the run.',
          'Set sharpness to soft, balanced or maximum — the higher it goes, the more edge emphasis and the more chance of haloing.',
          'Leave noise reduction on for phone photos and images saved from messaging apps; turn it off for drawings and screenshots.',
          'Download the result. PNG goes in and comes out PNG; JPEG, WebP and the rest come out as high-quality JPEG, because rewriting a photograph as PNG would multiply the size for no gain.',
        ],
      },
      {
        h: 'What the tool does, and what no tool does',
        p: [
          'Enlarging does not create information. Detail the camera never captured is nowhere in the file, and no algorithm brings it back — what exists is plausible edge reconstruction, which is a different thing. The real gain here is a larger image with clean transitions between areas, without the stair-stepping and mush a plain stretch produces.',
          'Where it pays off: logos, screenshots, line art and any artwork with defined contours. Where it does not: a small, soft photograph of fine texture — skin, fabric, foliage — where there is no edge to reconstruct and the result gets bigger without getting better.',
          'A practical size warning: 4x multiplies the pixel count by sixteen, and the browser has a ceiling for an in-memory canvas (around 40 million pixels). Enlarging a large phone photo 4x comes close to that limit. That is why 2x is the default, and it covers most cases comfortably.',
        ],
      },
      {
        h: 'When this is the wrong tool',
        p: [
          'To make an image smaller, use resize: shrinking is safe and needs no reconstruction at all. To fit an upload limit, compression removes far more weight.',
          'And to rescue a badly degraded photo — compressed several times, full of JPEG artefacts — none of this helps: enlarging will emphasise the artefacts along with the detail. The honest path there is to look for the original file instead of trying to save the copy.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'The whole computation is arithmetic over pixels already on your machine, and the browser already ships the rasteriser that runs it. Nothing here needs a server, so there is no upload — the meter in the top bar shows zero file bytes leaving while the enlargement runs.',
          'After the first visit the tool works with no internet, which also means none of your photos sit hosted somewhere waiting on a retention policy.',
        ],
      },
    ],
  },
  vectorize: {
    pt: [
      {
        h: 'Como transformar uma imagem em SVG',
        p: [
          'Vetorizar é reescrever a imagem como formas com contorno matemático, em vez de uma grade de pixels. O arquivo resultante escala para qualquer tamanho sem perder nitidez, abre no Illustrator, no Inkscape e no Figma, e costuma ficar menor que o original quando a arte é chapada.',
        ],
        steps: [
          'Solte a imagem — logo, ícone, desenho ou foto.',
          'Escolha o modo. Cada um resolve um tipo de arte, e a ferramenta sugere um ao abrir.',
          'Ajuste a tolerância se precisar: mais baixa segue o traçado com mais fidelidade e gera mais nós; mais alta simplifica.',
          'Compare o SVG com o original na tela antes de baixar.',
          'Baixe o .svg.',
        ],
      },
      {
        h: 'Por que a maioria dos vetorizadores deixa costura',
        p: [
          'O jeito comum de vetorizar é traçar o contorno de cada região de cor separadamente. Como cada contorno é calculado por conta própria, duas regiões vizinhas terminam com duas curvas quase iguais — e quase não basta: entre elas sobra um fio de fundo aparecendo, a costura que se vê ao ampliar qualquer resultado desses.',
          'Aqui a fronteira entre duas regiões é UM arco só, referenciado pelas duas. Não existe "quase igual" porque não existem duas cópias. O teste que trava isso mede a fração de pixel translúcido no SVG renderizado, e o número é zero.',
          'Sobre o degradê: em vez de aproximar uma transição suave com dezenas de faixas de cor chapada, a ferramenta ajusta um degradê linear ou radial por mínimos quadrados, em luz linear. É o que separa um céu vetorizado em quinze listras de um céu com uma transição só.',
        ],
      },
      {
        h: 'Escolhendo o modo e a tolerância',
        p: [
          'Arte chapada (logo, ícone, ilustração vetorial que virou PNG) é o caso em que a vetorização é quase perfeita — as bordas são reais e o número de cores é pequeno. Traço e desenho a lápis pedem o modo de traço, que binariza a imagem antes de contornar. Foto sempre gera um arquivo grande e uma aparência estilizada: é um efeito, não uma recuperação.',
          'A tolerância tem um piso que vale conhecer: o contorno traçado sobre uma grade de pixels tem escada intrínseca de meio pixel, então pedir precisão abaixo disso faz o ajuste reproduzir o ruído da amostragem. Medido no mesmo desenho: tolerância 0,7 produziu 936 nós e 17,7 kB; 1,2 produziu 112 nós e 3,1 kB, com o mesmo resultado visual.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Vetorizadores online cobram por arquivo ou por assinatura justamente porque o processamento roda no servidor deles. Aqui ele roda numa thread separada dentro da sua aba, e a imagem é transferida para essa thread sem ser copiada — o que evita duplicar dezenas de megabytes de pixels.',
          'O SVG resultante fica de fora da cadeia de edição raster de propósito: reabrir um vetor num editor de imagem o rasterizaria de volta, destruindo exatamente o que a ferramenta acabou de produzir.',
        ],
      },
    ],
    en: [
      {
        h: 'How to turn an image into SVG',
        p: [
          'Vectorising rewrites the image as shapes with mathematical outlines instead of a grid of pixels. The resulting file scales to any size without losing sharpness, opens in Illustrator, Inkscape and Figma, and is usually smaller than the original when the artwork is flat.',
        ],
        steps: [
          'Drop the image — a logo, an icon, a drawing or a photo.',
          'Choose the mode. Each one suits a kind of artwork, and the tool suggests one on arrival.',
          'Adjust tolerance if needed: lower follows the traced outline more closely and produces more nodes; higher simplifies.',
          'Compare the SVG with the original on screen before downloading.',
          'Download the .svg.',
        ],
      },
      {
        h: 'Why most vectorisers leave seams',
        p: [
          'The common way to vectorise is to trace the outline of each colour region separately. Because each outline is computed on its own, two neighbouring regions end up with two nearly identical curves — and nearly is not enough: a thread of background shows through between them, the seam you see when zooming into any such result.',
          'Here the boundary between two regions is ONE arc, referenced by both. There is no "nearly identical" because there are no two copies. The test that pins this measures the fraction of translucent pixels in the rendered SVG, and the number is zero.',
          'On gradients: instead of approximating a smooth transition with dozens of flat colour bands, the tool fits a linear or radial gradient by least squares, in linear light. That is what separates a sky vectorised into fifteen stripes from a sky with a single transition.',
        ],
      },
      {
        h: 'Choosing the mode and the tolerance',
        p: [
          'Flat artwork (a logo, an icon, vector illustration that became a PNG) is the case where vectorising is nearly perfect — the edges are real and the colour count is small. Line work and pencil drawings want the stroke mode, which binarises the image before outlining. A photograph always produces a large file and a stylised look: that is an effect, not a recovery.',
          'Tolerance has a floor worth knowing: an outline traced over a pixel grid carries an intrinsic half-pixel staircase, so asking for precision below that makes the fit reproduce sampling noise. Measured on the same drawing: tolerance 0.7 produced 936 nodes and 17.7 kB; 1.2 produced 112 nodes and 3.1 kB, with the same visual result.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Online vectorisers charge per file or per subscription precisely because the processing runs on their servers. Here it runs on a separate thread inside your tab, and the image is transferred to that thread rather than copied — which avoids duplicating tens of megabytes of pixels.',
          'The resulting SVG deliberately stays out of the raster editing chain: reopening a vector in an image editor would rasterise it back, destroying exactly what the tool just produced.',
        ],
      },
    ],
  },
  'extract-text': {
    pt: [
      {
        h: 'Como extrair texto de uma imagem ou PDF',
        p: [
          'O reconhecimento dispara sozinho quando o arquivo entra: escolher a ferramenta com a foto na mão já é o pedido. Entram imagem e PDF, e o texto lido aparece numa caixa editável, com contagem de caracteres, contagem de palavras e a precisão que o próprio reconhecedor reporta.',
        ],
        steps: [
          'Solte a foto do documento, o print ou o PDF digitalizado.',
          'Na primeira execução, os dados de idioma são baixados (cerca de 4 MB) e ficam guardados para as próximas.',
          'Escolha o idioma: português, ou português mais inglês para documento misturado.',
          'Corrija o que ficou errado direto na caixa de texto — ela é editável de propósito.',
          'Copie o texto ou baixe como .txt.',
        ],
      },
      {
        h: 'O que decide a qualidade do resultado',
        p: [
          'Resolução, antes de qualquer outra coisa. O reconhecedor precisa de uns 150 pontos por polegada para trabalhar; abaixo disso ele não erra só letras, ele erra a GEOMETRIA — junta linhas, parte palavras e devolve blocos fora de lugar. Uma foto de celular bem enquadrada costuma passar folgado; um print de tela pequena, não.',
          'Depois vêm contraste e enquadramento. Papel branco com texto preto, sem sombra da própria mão em cima, alinhado o mais reto possível. Documento fotografado torto é o caso em que quase todo reconhecedor perde linhas inteiras.',
          'Por fim, o tipo de letra. Impresso é confiável; manuscrito não é, aqui nem nos serviços pagos que anunciam o contrário. Fonte com serifa muito fina e texto sobre imagem de fundo também derrubam a precisão, e é exatamente para isso que o número de precisão aparece na tela: ele diz quando desconfiar.',
        ],
      },
      {
        h: 'Quando usar o editor de PDF em vez desta ferramenta',
        p: [
          'Aqui a saída é texto corrido, para copiar e colar em outro lugar. Se o objetivo é continuar com o DOCUMENTO — corrigir uma palavra e devolver o PDF, ou tornar um digitalizado pesquisável mantendo a aparência da página —, o caminho é o editor de PDF, que faz o reconhecimento por página e redesenha o texto por cima do original.',
          'E se o PDF já for digital (gerado por computador, não escaneado), nenhum reconhecimento é necessário: o texto já está lá como texto, e o PDF para Word extrai tudo sem passar por imagem.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Reconhecimento de texto é a operação que mais atrai upload de documento sensível: contrato, holerite, laudo, carteira de identidade. Todo serviço online recebe esse arquivo num servidor — e ele é justamente o tipo de arquivo que não deveria sair da sua máquina.',
          'Aqui o reconhecedor inteiro é baixado e roda dentro da aba, em WebAssembly. O medidor no alto da página conta bytes de arquivo saindo e permanece em zero durante a leitura, e depois da primeira visita tudo funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to extract text from an image or PDF',
        p: [
          'Recognition starts on its own when the file arrives: choosing the tool with the photo in hand is already the request. Images and PDFs go in, and the text read comes back in an editable box, with character count, word count and the confidence the recogniser itself reports.',
        ],
        steps: [
          'Drop the photo of the document, the screenshot or the scanned PDF.',
          'On the first run the language data is downloaded (about 4 MB) and kept for later.',
          'Choose the language: Portuguese, or Portuguese plus English for a mixed document.',
          'Fix whatever came out wrong directly in the text box — it is editable on purpose.',
          'Copy the text or download it as .txt.',
        ],
      },
      {
        h: 'What decides the quality of the result',
        p: [
          'Resolution, before anything else. The recogniser needs around 150 dots per inch to work; below that it does not only get letters wrong, it gets the GEOMETRY wrong — merging lines, splitting words and returning blocks out of place. A well-framed phone photo usually clears that comfortably; a screenshot of a small screen does not.',
          'Then come contrast and framing. White paper with black text, no shadow of your own hand across it, as square as you can manage. A document photographed at an angle is the case where almost every recogniser loses whole lines.',
          'Finally, the typeface. Print is reliable; handwriting is not, here or in the paid services that claim otherwise. Very thin serifs and text over a background image also drag accuracy down, and that is exactly why the confidence number is on screen: it tells you when to doubt the result.',
        ],
      },
      {
        h: 'When to use the PDF editor instead',
        p: [
          'Here the output is running text, to paste somewhere else. If the goal is to continue with the DOCUMENT — fix a word and get the PDF back, or make a scan searchable while keeping the look of the page — the path is the PDF editor, which recognises page by page and redraws the text over the original.',
          'And if the PDF is already digital (computer-generated rather than scanned), no recognition is needed at all: the text is already there as text, and PDF to Word extracts it without going through an image.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Text recognition is the operation that most attracts uploads of sensitive documents: contracts, payslips, medical reports, identity cards. Every online service takes that file onto a server — and it is precisely the kind of file that should not leave your machine.',
          'Here the whole recogniser is downloaded and runs inside the tab, in WebAssembly. The meter at the top of the page counts file bytes leaving and stays at zero during the read, and after the first visit everything works with no internet.',
        ],
      },
    ],
  },
  'edit-pdf': {
    pt: [
      {
        h: 'Como editar o texto de um PDF',
        p: [
          'O editor abre o documento, encontra os blocos de texto que existem nele e deixa você digitar por cima. Não é um visualizador com caixa de comentário: o texto alterado é reescrito no PDF exportado, no lugar do original.',
        ],
        steps: [
          'Solte o PDF. Se ele tiver senha, a ferramenta pede antes de abrir.',
          'Clique num bloco de texto para editá-lo. As alças permitem mover e redimensionar.',
          'Em documento digitalizado, rode o reconhecimento de texto: sem ele não há bloco nenhum para editar, porque a página é uma foto.',
          'Use o zoom e a navegação de páginas para conferir o resultado no tamanho real.',
          'Exporte o PDF. O arquivo é montado e baixado num passo só.',
        ],
      },
      {
        h: 'Documento digital e documento digitalizado são casos diferentes',
        p: [
          'Num PDF gerado por computador o texto já está lá como texto, com posição e tamanho declarados. A edição é direta e a fidelidade é alta, porque o editor lê do próprio arquivo o estilo, o corpo e o peso aproximados de cada bloco.',
          'Num PDF que é foto de papel não existe texto nenhum — existe uma imagem. Aí o reconhecimento roda página a página e a página é rasterizada a três vezes o tamanho antes de ir para o reconhecedor, o que dá cerca de 216 pontos por polegada. Isso não é capricho: abaixo de uns 150 o reconhecedor erra a geometria dos blocos, não só as letras, e o texto sai com corpo errado e fora de lugar.',
          'A consequência prática: em digitalizado, espere corrigir tamanho e posição de alguns blocos na mão. É o preço de editar um documento que nasceu como imagem, e ele existe em qualquer ferramenta que faça isso.',
        ],
      },
      {
        h: 'Fontes, páginas longas e o que esperar',
        p: [
          'O editor aproxima estilo, corpo e peso; ele não embute a fonte exata do documento original. Num texto de corpo comum a diferença é pequena; num material com tipografia autoral ela aparece. Para mudar uma palavra num contrato, funciona; para reeditar uma peça de design, o arquivo certo é o de origem.',
          'Documento longo é tratado por janela: só as páginas perto do que você está vendo mantêm imagem na memória, e as outras são liberadas e redesenhadas quando você volta. É isso que faz um documento de duzentas páginas ficar tão nítido quanto um de duas — sem essa janela, a nitidez teria de ser dividida entre todas as páginas de uma vez.',
          'O teto de entrada é 100 MB por arquivo, que vale para todo o módulo de PDF.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Editar PDF online é o serviço que mais recebe documento que não devia circular: contrato assinado, procuração, laudo, folha de pagamento. Em qualquer serviço convencional esse arquivo chega inteiro a um servidor e fica sujeito à política de retenção dele.',
          'Aqui o documento é aberto e reescrito dentro da própria aba, e o medidor no alto da página conta bytes de arquivo saindo — ele fica em zero do começo ao fim, inclusive durante o reconhecimento de texto. Depois da primeira visita, funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to edit the text in a PDF',
        p: [
          'The editor opens the document, finds the text blocks in it and lets you type over them. It is not a viewer with a comment box: the changed text is written back into the exported PDF, in place of the original.',
        ],
        steps: [
          'Drop the PDF. If it is password-protected, the tool asks before opening.',
          'Click a text block to edit it. The handles let you move and resize.',
          'On a scanned document, run text recognition first: without it there are no blocks to edit, because the page is a photograph.',
          'Use zoom and page navigation to check the result at real size.',
          'Export the PDF. The file is assembled and downloaded in one step.',
        ],
      },
      {
        h: 'Digital and scanned documents are different cases',
        p: [
          'In a computer-generated PDF the text is already there as text, with declared position and size. Editing is direct and fidelity is high, because the editor reads the approximate style, body size and weight of each block from the file itself.',
          'In a PDF that is a photograph of paper there is no text at all — there is an image. Recognition then runs page by page, and the page is rasterised at three times its size before reaching the recogniser, which gives about 216 dots per inch. That is not fussiness: below roughly 150, the recogniser gets block geometry wrong, not just letters, and the text comes out at the wrong size and in the wrong place.',
          'The practical consequence: on a scan, expect to fix the size and position of a few blocks by hand. That is the price of editing a document that began life as an image, and it exists in every tool that does this.',
        ],
      },
      {
        h: 'Fonts, long documents, and what to expect',
        p: [
          'The editor approximates style, body size and weight; it does not embed the exact font of the original document. In ordinary body text the difference is small; in material with distinctive typography it shows. To change a word in a contract, it works; to re-edit a design piece, the right file is the source one.',
          'A long document is handled by window: only the pages near what you are looking at keep an image in memory, and the rest are released and redrawn when you scroll back. That is what makes a two-hundred-page document as sharp as a two-page one — without that window, sharpness would have to be divided across every page at once.',
          'The input ceiling is 100 MB per file, which holds for the whole PDF module.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Editing PDFs online is the service that most often receives documents that should not circulate: signed contracts, powers of attorney, medical reports, payroll. In any conventional service that file reaches a server whole and becomes subject to its retention policy.',
          'Here the document is opened and rewritten inside the tab itself, and the meter at the top of the page counts file bytes leaving — it stays at zero from beginning to end, text recognition included. After the first visit, it works with no internet.',
        ],
      },
    ],
  },
  'pdf-to-img': {
    pt: [
      {
        h: 'Como converter páginas de PDF em imagem',
        p: [
          'Cada página escolhida é desenhada numa tela e salva como imagem. Serve para colar uma página em apresentação, mandar num aplicativo de mensagem que não abre PDF, ou publicar um trecho onde só se aceita foto.',
        ],
        steps: [
          'Solte o PDF. As miniaturas aparecem para você escolher as páginas.',
          'Selecione as páginas que interessam, ou deixe todas.',
          'Escolha o formato: PNG, JPG ou WebP.',
          'Escolha a resolução: 1x, 2x ou 3x o tamanho da página.',
          'Baixe. Uma página vira uma imagem; várias vêm num zip.',
        ],
      },
      {
        h: 'Qual resolução e qual formato escolher',
        p: [
          'A escala multiplica o tamanho natural da página. Em 1x, uma página A4 sai perto de 595 por 842 pixels — bom para miniatura, ruim para ler. Em 2x o texto de corpo já fica confortável na tela, e é a escolha padrão. Em 3x a página serve para impressão ou para dar zoom, ao custo de um arquivo bem maior.',
          'PNG é sem perda e o certo para página de texto, tabela e traço: as bordas das letras ficam limpas. JPG comprime bem página que é foto de ponta a ponta, e é onde ele vale. WebP fica menor que os dois com qualidade parecida, quando o destino aceita.',
          'A saída muda de tipo conforme a quantidade: uma imagem só vem como imagem, várias vêm zipadas. As sugestões do que fazer a seguir acompanham isso — oferecer "cortar imagem" para um zip seria pior do que não oferecer nada.',
        ],
      },
      {
        h: 'O que se perde ao virar imagem',
        p: [
          'Tudo o que fazia daquilo um documento: o texto deixa de ser selecionável e pesquisável, os links param de funcionar e o arquivo cresce. É uma conversão de mão única — a imagem não volta a ser PDF de texto, e nenhum reconhecimento devolve exatamente o original.',
          'Se o objetivo é só reduzir tamanho, comprimir PDF faz isso mantendo o documento. Se é extrair o conteúdo escrito, o caminho é PDF para Word ou o extrator de texto. Virar imagem é para quando o DESTINO exige imagem.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'A rasterização acontece no mesmo motor que o navegador usa para mostrar o PDF na tela, dentro da sua aba. Não há servidor no caminho, e por isso um documento com dado pessoal pode virar imagem sem passar por lugar nenhum.',
          'O medidor da barra superior mostra zero byte de arquivo saindo durante toda a conversão, e depois da primeira visita a ferramenta funciona offline.',
        ],
      },
    ],
    en: [
      {
        h: 'How to turn PDF pages into images',
        p: [
          'Each selected page is drawn onto a canvas and saved as an image. It is for pasting a page into a deck, sending it through an app that will not open a PDF, or publishing an excerpt where only pictures are accepted.',
        ],
        steps: [
          'Drop the PDF. Thumbnails appear so you can pick pages.',
          'Select the pages you want, or keep them all.',
          'Choose the format: PNG, JPG or WebP.',
          'Choose the resolution: 1x, 2x or 3x the page size.',
          'Download. One page comes back as an image; several come back as a zip.',
        ],
      },
      {
        h: 'Which resolution and which format',
        p: [
          'The scale multiplies the natural size of the page. At 1x an A4 page comes out near 595 by 842 pixels — fine for a thumbnail, poor for reading. At 2x body text is already comfortable on screen, and that is the default. At 3x the page is good for printing or zooming, at the cost of a much larger file.',
          'PNG is lossless and the right choice for pages of text, tables and line work: letter edges stay clean. JPG compresses edge-to-edge photographic pages well, and that is where it pays. WebP lands smaller than both at similar quality, when the destination accepts it.',
          'The output changes type with the count: a single image comes back as an image, several come back zipped. The suggestions for what to do next follow that — offering "crop image" for a zip would be worse than offering nothing.',
        ],
      },
      {
        h: 'What is lost when a page becomes a picture',
        p: [
          'Everything that made it a document: the text stops being selectable and searchable, links stop working, and the file grows. It is a one-way conversion — the image does not become a text PDF again, and no recognition gives back exactly the original.',
          'If the goal is only to reduce size, compressing the PDF does that while keeping the document. If it is to extract the written content, the path is PDF to Word or the text extractor. Turning pages into pictures is for when the DESTINATION demands pictures.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Rasterising happens in the same engine the browser uses to show the PDF on screen, inside your tab. There is no server in the path, so a document with personal data can become an image without passing through anywhere.',
          'The meter in the top bar shows zero file bytes leaving for the whole conversion, and after the first visit the tool works offline.',
        ],
      },
    ],
  },
  'pdf-to-word': {
    pt: [
      {
        h: 'Como converter um PDF em documento do Word',
        p: [
          'A conversão extrai o conteúdo do PDF e escreve um .docx de verdade, que o Word, o LibreOffice e o Google Docs abrem e deixam editar. O texto vira parágrafo editável, não uma caixa de imagem em cima da página.',
        ],
        steps: [
          'Solte o PDF, digital ou digitalizado.',
          'Se ele for digitalizado, o reconhecimento de texto roda antes da conversão.',
          'Acompanhe o progresso por página.',
          'Baixe o .docx e continue no editor que você já usa.',
        ],
      },
      {
        h: 'Ordem de leitura, e por que ela é o problema difícil',
        p: [
          'Um PDF não guarda parágrafos: guarda pedaços de texto com coordenadas. Reconstruir a ordem em que uma pessoa leria é a parte que os conversores erram — e o erro típico é entregar todas as palavras da página na sequência errada, o que parece falha de reconhecimento mas é falha de ordenação.',
          'Aqui os blocos são agrupados em faixas por sobreposição vertical e ordenados dentro de cada faixa. É o que mantém um documento em duas colunas legível, e o que impede que a metade direita de cada linha venha antes da esquerda numa digitalização.',
          'O corpo da letra também é tratado: num documento digitalizado, a estimativa vinda da altura dos caracteres varia demais, e valores absurdos são limitados em relação à mediana da página. Sem isso, uma página ruim produzia texto de 1 ponto — invisível no Word, e sem nada na tela que explicasse por quê.',
        ],
      },
      {
        h: 'O que sobrevive e o que não sobrevive',
        p: [
          'Sobrevive o conteúdo escrito, a quebra em parágrafos e uma aproximação de tamanho e posição. Não sobrevivem: layout de coluna complexo, tabela com célula mesclada, caixa de texto ancorada em imagem e a tipografia exata do original.',
          'Isso vale para qualquer conversor, pago ou não, porque a informação que falta não está no arquivo. A diferença prática é o que você faz depois: para um texto que precisa ser reescrito, o .docx economiza a digitação inteira; para reproduzir um layout fielmente, o caminho é editar o PDF em vez de convertê-lo.',
          'Documento digitalizado depende da qualidade da imagem, como todo reconhecimento: foto reta, boa iluminação e resolução acima de uns 150 pontos por polegada.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Converter PDF em Word é, junto com juntar PDF, o serviço online mais usado do mundo dos documentos — e o arquivo típico é currículo, contrato, proposta ou relatório médico. Todos eles chegam inteiros ao servidor de quem oferece a conversão.',
          'Aqui a extração e a escrita do .docx acontecem na sua aba. O medidor no alto da página mostra zero byte de arquivo saindo, e depois da primeira visita a conversão funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to convert a PDF into a Word document',
        p: [
          'The conversion extracts the content of the PDF and writes a real .docx, which Word, LibreOffice and Google Docs open and let you edit. Text becomes editable paragraphs, not an image box laid over the page.',
        ],
        steps: [
          'Drop the PDF, digital or scanned.',
          'If it is scanned, text recognition runs before the conversion.',
          'Watch the progress page by page.',
          'Download the .docx and carry on in the editor you already use.',
        ],
      },
      {
        h: 'Reading order, and why it is the hard problem',
        p: [
          'A PDF does not store paragraphs: it stores fragments of text with coordinates. Reconstructing the order a person would read them in is the part converters get wrong — and the typical failure hands you every word on the page in the wrong sequence, which looks like a recognition fault but is an ordering fault.',
          'Here blocks are grouped into bands by vertical overlap and ordered within each band. That is what keeps a two-column document readable, and what stops the right half of every line arriving before the left half on a scan.',
          'Body size is handled too: on a scanned document the estimate taken from character height varies wildly, and absurd values are bounded against the page median. Without that, a poor page produced 1-point text — invisible in Word, with nothing on screen to explain why.',
        ],
      },
      {
        h: 'What survives and what does not',
        p: [
          'The written content survives, along with paragraph breaks and an approximation of size and position. What does not: complex column layouts, tables with merged cells, text boxes anchored to images, and the exact typography of the original.',
          'That holds for every converter, paid or not, because the missing information is not in the file. The practical difference is what you do next: for text that has to be rewritten, the .docx saves all the typing; to reproduce a layout faithfully, the path is editing the PDF rather than converting it.',
          'A scanned document depends on image quality, like all recognition: square framing, good light, and resolution above roughly 150 dots per inch.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'PDF to Word is, alongside merging PDFs, the most used online service in the document world — and the typical file is a CV, a contract, a proposal or a medical report. All of them reach the server of whoever offers the conversion, whole.',
          'Here the extraction and the .docx writing happen in your tab. The meter at the top of the page shows zero file bytes leaving, and after the first visit the conversion works with no internet.',
        ],
      },
    ],
  },
  'organize-pdf': {
    pt: [
      {
        h: 'Como reordenar, girar e apagar páginas',
        p: [
          'A ferramenta mostra o documento inteiro como uma tira de miniaturas e deixa você mexer na sequência. As páginas são copiadas para o arquivo novo sem recodificação: o que era texto vetorial continua vetorial, e as imagens continuam na resolução em que estavam.',
        ],
        steps: [
          'Solte o PDF. Todas as páginas aparecem como miniaturas.',
          'Arraste para reordenar. Os botões de seta fazem o mesmo — e são o controle que funciona no celular e pelo teclado.',
          'Gire as páginas que vieram deitadas, uma a uma.',
          'Remova o que não deve ficar no documento final.',
          'Gere o PDF organizado e baixe.',
        ],
      },
      {
        h: 'Girar de verdade, e não só na tela',
        p: [
          'Página escaneada de cabeça para baixo é o caso mais comum aqui. A rotação aplicada é gravada no documento, então ela vale em qualquer leitor e na impressão — diferente do botão de girar de alguns visualizadores, que só muda a exibição e some quando o arquivo é aberto em outro lugar.',
          'Quem digitalizou um lote com o alimentador do scanner costuma ter metade das páginas viradas. Nesse caso vale girar antes de qualquer outra coisa: com as páginas na orientação certa, dá para conferir a ordem lendo as miniaturas.',
        ],
      },
      {
        h: 'Quando a ferramenta certa é outra',
        p: [
          'Para separar um documento em vários arquivos, use dividir. Para reunir arquivos diferentes num só, use juntar. Organizar é para mexer DENTRO de um documento e sair com um documento.',
          'Uma observação que vale para as três: um PDF assinado digitalmente perde a validade da assinatura quando as páginas mudam, aqui e em qualquer ferramenta, porque a assinatura cobre o arquivo inteiro. Se o documento precisa continuar assinado, a reorganização tem de acontecer antes da assinatura.',
          'Apagar página aqui remove a página do arquivo — não é tarja nem ocultação. Para tirar informação de uma página que precisa continuar existindo, a ferramenta é a censura de PDF.',
          'Uma coisa não sobrevive à reorganização, e é melhor saber antes: o índice de marcadores. O documento final é montado do zero a partir das páginas escolhidas, então marcadores e links internos que apontavam para números de página deixam de fazer sentido e não são copiados. O conteúdo das páginas vem inteiro; a navegação construída em volta delas, não. Em documento longo com sumário clicável, vale reorganizar antes de gerar o sumário, e não depois.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Reorganizar páginas é manipulação de estrutura: nada precisa ser recalculado, só copiado na ordem nova. Cabe inteiro no navegador, e é o tipo de tarefa em que o arquivo costuma ser justamente o que não deveria subir para lugar nenhum — processo, prontuário, documentação pessoal.',
          'O medidor da barra superior fica em zero durante todo o trabalho, e depois da primeira visita a ferramenta funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to reorder, rotate and delete pages',
        p: [
          'The tool shows the whole document as a strip of thumbnails and lets you rearrange it. Pages are copied into the new file without re-encoding: what was vector text stays vector, and images stay at the resolution they were.',
        ],
        steps: [
          'Drop the PDF. Every page appears as a thumbnail.',
          'Drag to reorder. The arrow buttons do the same — and they are the control that works on a phone and from a keyboard.',
          'Rotate the pages that came in sideways, one by one.',
          'Remove whatever should not be in the final document.',
          'Generate the organised PDF and download it.',
        ],
      },
      {
        h: 'Rotating for real, not just on screen',
        p: [
          'A page scanned upside down is the most common case here. The rotation applied is written into the document, so it holds in any reader and in print — unlike the rotate button in some viewers, which only changes the display and disappears when the file is opened elsewhere.',
          'Anyone who scanned a batch through a feeder usually has half the pages flipped. There it pays to rotate first: with the pages the right way up, you can check the order by reading the thumbnails.',
        ],
      },
      {
        h: 'When the right tool is another one',
        p: [
          'To break a document into several files, use split. To bring different files into one, use merge. Organise is for rearranging INSIDE a document and coming out with a document.',
          'One note that holds for all three: a digitally signed PDF loses the validity of its signature when pages change, here and in any tool, because the signature covers the whole file. If the document has to stay signed, the rearranging has to happen before signing.',
          'Deleting a page here removes the page from the file — it is not a bar or a hidden layer. To take information out of a page that must still exist, the tool is PDF redaction.',
          'One thing does not survive the rearranging, and it is better known beforehand: the bookmark outline. The final document is assembled from scratch out of the chosen pages, so bookmarks and internal links that pointed at page numbers stop making sense and are not copied over. Page content comes across whole; the navigation built around it does not. In a long document with a clickable table of contents, it pays to rearrange before generating that contents page, not after.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Rearranging pages is structural manipulation: nothing has to be recomputed, only copied in the new order. It fits entirely in the browser, and it is the kind of task where the file is usually exactly what should not be uploaded anywhere — case files, medical records, personal paperwork.',
          'The meter in the top bar stays at zero throughout, and after the first visit the tool works with no internet.',
        ],
      },
    ],
  },
  'protect-pdf': {
    pt: [
      {
        h: 'Como pôr senha num PDF',
        p: [
          'A ferramenta gera um novo PDF criptografado com senha de abertura: quem receber o arquivo precisa digitar a senha para ver qualquer coisa. A senha é pedida duas vezes, e é essa segunda vez que impede o erro que só aparece dias depois, quando ninguém consegue abrir o documento.',
        ],
        steps: [
          'Solte o PDF. A primeira página é mostrada como conferência.',
          'Digite a senha e repita no campo de confirmação.',
          'Gere o arquivo protegido e baixe.',
          'Guarde a senha num gerenciador antes de fechar a aba — não existe recuperação.',
        ],
      },
      {
        h: 'O que a proteção custa, e por quê',
        p: [
          'Cada página é rasterizada e regravada como imagem dentro do PDF cifrado. Isso tem uma consequência que precisa ser dita antes e não depois: o documento protegido não tem mais camada de texto. Não dá para selecionar, copiar nem buscar dentro dele, e o tamanho do arquivo muda.',
          'A razão é técnica e específica: a biblioteca que reescreve páginas preservando o vetor não sabe cifrar, e a que cifra monta o PDF a partir de imagens. Entre entregar um arquivo realmente cifrado e um arquivo pesquisável, a ferramenta escolhe o cifrado — é o que a pessoa veio buscar.',
          'Por isso a ordem importa: proteja por último. Se o documento ainda vai ser assinado, marcado, comprimido ou lido por busca, faça tudo isso antes e deixe a senha para o final.',
        ],
      },
      {
        h: 'O que a senha protege e o que ela não protege',
        p: [
          'Ela protege contra quem recebe o arquivo e não tem a senha: sem ela, o conteúdo não abre. Não protege contra quem TEM a senha — depois de aberto, o documento pode ser salvo, impresso e fotografado como qualquer outro. Restrição de impressão e de cópia dentro do PDF é uma convenção que o leitor decide respeitar, não uma barreira.',
          'E não protege o envio: mandar o PDF cifrado e a senha na mesma conversa anula a proteção inteira. Mande a senha por outro caminho, de preferência outro aplicativo.',
          'Se o que você quer é esconder um trecho específico e não o documento todo, a ferramenta é a censura de PDF. Se quer garantir que o conteúdo não seja lido nem por quem tem o arquivo, sem depender do leitor de PDF, criptografar arquivo produz um envelope que só esta ferramenta abre.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Mandar um documento sigiloso para um site pôr senha nele é uma contradição em termos: o arquivo chega aberto ao servidor, que é justamente o que a senha deveria evitar. Aqui a cifragem acontece na sua aba, e a senha nunca sai do teclado.',
          'O medidor no alto da página conta bytes de arquivo saindo e fica em zero enquanto o PDF é protegido, e depois da primeira visita a ferramenta funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to password-protect a PDF',
        p: [
          'The tool produces a new PDF encrypted with an open password: whoever receives the file has to type it to see anything at all. The password is asked twice, and that second field is what prevents the mistake that only surfaces days later, when nobody can open the document.',
        ],
        steps: [
          'Drop the PDF. The first page is shown as a check.',
          'Type the password and repeat it in the confirmation field.',
          'Generate the protected file and download it.',
          'Save the password in a manager before closing the tab — there is no recovery.',
        ],
      },
      {
        h: 'What the protection costs, and why',
        p: [
          'Every page is rasterised and rewritten as an image inside the encrypted PDF. That has a consequence which needs saying beforehand rather than after: the protected document no longer has a text layer. You cannot select, copy or search inside it, and the file size changes.',
          'The reason is technical and specific: the library that rewrites pages while preserving vectors cannot encrypt, and the one that encrypts assembles the PDF from images. Between handing back a genuinely encrypted file and a searchable one, the tool picks encrypted — that is what the person came for.',
          'So order matters: protect last. If the document is still going to be signed, watermarked, compressed or searched, do all of that first and leave the password for the end.',
        ],
      },
      {
        h: 'What the password protects, and what it does not',
        p: [
          'It protects against whoever receives the file without the password: the content will not open. It does not protect against someone who HAS it — once open, the document can be saved, printed and photographed like any other. Print and copy restrictions inside a PDF are a convention the reader chooses to honour, not a barrier.',
          'And it does not protect the delivery: sending the encrypted PDF and the password in the same conversation cancels the whole thing. Send the password by another route, preferably another app.',
          'If what you want is to hide one passage rather than the whole document, the tool is PDF redaction. If you want the content unreadable even to whoever holds the file, without depending on a PDF reader, encrypt file produces an envelope only this tool opens.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Sending a confidential document to a website so it can put a password on it is a contradiction in terms: the file reaches the server open, which is exactly what the password was meant to prevent. Here the encryption happens in your tab, and the password never leaves the keyboard.',
          'The meter at the top of the page counts file bytes leaving and stays at zero while the PDF is protected, and after the first visit the tool works with no internet.',
        ],
      },
    ],
  },
  'sign-pdf': {
    pt: [
      {
        h: 'Como assinar um PDF',
        p: [
          'A assinatura pode ser desenhada com o dedo ou o mouse, carregada como imagem, ou digitada como nome. Ela é desenhada dentro do PDF, na página e na posição que você escolher — o documento continua sendo um PDF de texto, sem virar foto.',
        ],
        steps: [
          'Solte o PDF.',
          'Escolha como assinar: desenhar, carregar imagem ou digitar o nome.',
          'Ajuste posição e tamanho da assinatura sobre a página.',
          'Coloque na página atual, ou aplique como rubrica em todas as páginas.',
          'Gere o PDF assinado e baixe.',
        ],
      },
      {
        h: 'Assinatura de imagem e assinatura digital não são a mesma coisa',
        p: [
          'O que esta ferramenta produz é uma assinatura visual: o desenho do seu nome aparece no documento, como aconteceria se você imprimisse, assinasse e digitalizasse de volta — só que sem perder a qualidade do arquivo e sem impressora.',
          'Isso é o suficiente para a maior parte do uso cotidiano: recibo, autorização, formulário interno, contrato entre partes que se conhecem. Não é o suficiente onde a lei ou a contraparte exige certificado digital — ICP-Brasil, e-CPF, e-CNPJ ou equivalente. Esse tipo de assinatura precisa de uma chave criptográfica emitida por autoridade certificadora, e nenhuma ferramenta que apenas desenha no PDF a substitui.',
          'A distinção é sobre o que se pode provar: a assinatura visual mostra intenção; a assinatura com certificado prova quem assinou e que o arquivo não mudou depois.',
        ],
      },
      {
        h: 'Rubrica em todas as páginas, e a ordem das operações',
        p: [
          'Contrato de várias páginas costuma pedir rubrica em cada uma. O botão de aplicar em todas resolve isso de uma vez, mantendo a mesma posição relativa em cada página — o que é diferente de arrastar a assinatura vinte vezes e conseguir vinte posições ligeiramente diferentes.',
          'Duas ordens que evitam retrabalho: assine depois de organizar e juntar, porque mudar páginas depois desloca a lógica do documento; e assine ANTES de proteger com senha, já que a proteção rasteriza o arquivo.',
          'Uma assinatura desenhada com o dedo em tela pequena costuma sair grande e tremida. Vale desenhar devagar, conferir no tamanho real com o zoom e, se preciso, refazer — a assinatura fica guardada na sessão para reaproveitar nas outras páginas.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'A imagem da sua assinatura é um dado biométrico simples: quem a tem pode colá-la em qualquer documento. Serviços online de assinatura recebem esse desenho e o documento junto, e guardam os dois.',
          'Aqui o traço nunca sai da aba — ele é desenhado num canvas e embutido no PDF ali mesmo. O medidor no alto da página fica em zero durante todo o processo, e depois da primeira visita a ferramenta funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to sign a PDF',
        p: [
          'The signature can be drawn with a finger or a mouse, uploaded as an image, or typed as a name. It is drawn inside the PDF, on the page and at the position you choose — the document stays a text PDF instead of becoming a photograph.',
        ],
        steps: [
          'Drop the PDF.',
          'Choose how to sign: draw, upload an image, or type your name.',
          'Adjust the position and size of the signature over the page.',
          'Place it on the current page, or apply it as an initial on every page.',
          'Generate the signed PDF and download it.',
        ],
      },
      {
        h: 'A drawn signature and a digital signature are not the same thing',
        p: [
          'What this tool produces is a visual signature: the drawing of your name appears in the document, as it would if you printed it, signed it and scanned it back — except without losing file quality and without a printer.',
          'That is enough for most everyday use: a receipt, an authorisation, an internal form, a contract between parties who know each other. It is not enough where the law or the counterparty requires a digital certificate. That kind of signature needs a cryptographic key issued by a certificate authority, and no tool that merely draws on the PDF replaces it.',
          'The distinction is about what can be proven: a visual signature shows intent; a certificate-backed signature proves who signed and that the file has not changed since.',
        ],
      },
      {
        h: 'Initialling every page, and the order of operations',
        p: [
          'A multi-page contract usually asks for initials on each page. The apply-to-all button does that in one go, keeping the same relative position on every page — which is different from dragging the signature twenty times and getting twenty slightly different positions.',
          'Two orderings that save rework: sign after organising and merging, because changing pages afterwards shifts the logic of the document; and sign BEFORE password-protecting, since protection rasterises the file.',
          'A signature drawn with a finger on a small screen usually comes out large and shaky. It pays to draw slowly, check it at real size with the zoom and redo it if needed — the signature is kept in the session so you can reuse it on the other pages.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'The image of your signature is a simple piece of biometric data: whoever has it can paste it onto any document. Online signing services receive that drawing and the document together, and keep both.',
          'Here the stroke never leaves the tab — it is drawn on a canvas and embedded into the PDF right there. The meter at the top of the page stays at zero throughout, and after the first visit the tool works with no internet.',
        ],
      },
    ],
  },
  'watermark-pdf': {
    pt: [
      {
        h: 'Como pôr marca dágua num PDF',
        p: [
          'A marca pode ser um texto ou o seu logo, e é desenhada em todas as páginas do documento. A prévia na tela usa exatamente a mesma conta que gera o arquivo final — mesma posição, mesmo ângulo, mesma repetição —, então o que você vê antes de baixar é o resultado.',
        ],
        steps: [
          'Solte o PDF.',
          'Escolha entre texto e logo. O texto padrão é CONFIDENCIAL.',
          'Ajuste tamanho, opacidade, ângulo e posição.',
          'Se quiser cobrir a página inteira, aumente a repetição e regule o espaçamento.',
          'Gere o PDF marcado e baixe.',
        ],
      },
      {
        h: 'Ajustes que fazem diferença de verdade',
        p: [
          'Opacidade é o parâmetro mais importante e o mais errado: marca muito forte impede a leitura do documento, marca fraca demais some numa impressão em preto e branco. Por volta de 30% costuma ser o ponto em que a marca é inegável e o texto continua legível.',
          'O ângulo padrão é diagonal porque marca na diagonal atravessa linhas de texto e é mais difícil de recortar. Repetição em grade cobre a página toda e é o que dificulta recorte de trecho — mas tem custo: cada marca é um comando desenhado no arquivo, então texto pequeno lado a lado pode passar de mil marcas por página, engordar o PDF e virar um borrão. A ferramenta limita isso e AVISA quando apertou o espaçamento, em vez de entregar em silêncio algo diferente do que você pediu.',
          'Logo é embutido uma vez e desenhado muitas — usar uma imagem grande demais só aumenta o arquivo, já que ela vai aparecer reduzida de qualquer jeito.',
        ],
      },
      {
        h: 'O que a marca dágua resolve e o que ela não resolve',
        p: [
          'Ela resolve atribuição e dissuasão: deixa claro que o documento é rascunho, cópia, ou de propriedade de alguém, e torna o vazamento constrangedor de circular. É por isso que ela é padrão em proposta comercial, laudo preliminar e material enviado para avaliação.',
          'Não resolve confidencialidade: a marca fica POR CIMA do conteúdo, e o conteúdo continua todo lá, selecionável e copiável. Quem quiser o texto, tem o texto. Para esconder informação de verdade, o caminho é a censura de PDF, que rasteriza a página e apaga o texto por baixo da tarja; para impedir a abertura, é a proteção por senha.',
          'A marca também não é uma assinatura, e uma boa prática é não usar a palavra "assinado" nela — o que ela comunica é origem, não consentimento.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'O documento que mais recebe marca dágua é justamente o que ainda não pode circular: proposta em negociação, laudo em revisão, material sob acordo de confidencialidade. Mandá-lo para um site marcar é entregar a versão sem marca para um servidor.',
          'Aqui a marca é desenhada dentro da aba, sobre o PDF que nunca sai da sua máquina. O medidor no alto da página fica em zero enquanto o arquivo é gerado.',
        ],
      },
    ],
    en: [
      {
        h: 'How to watermark a PDF',
        p: [
          'The mark can be text or your logo, and it is drawn on every page of the document. The on-screen preview uses exactly the same computation that generates the final file — same position, same angle, same repetition — so what you see before downloading is the result.',
        ],
        steps: [
          'Drop the PDF.',
          'Choose between text and a logo. The default text is CONFIDENCIAL.',
          'Adjust size, opacity, angle and position.',
          'To cover the whole page, increase the repetition and tune the spacing.',
          'Generate the watermarked PDF and download it.',
        ],
      },
      {
        h: 'The settings that actually matter',
        p: [
          'Opacity is the most important parameter and the one most often wrong: too strong and the document cannot be read, too faint and the mark vanishes in a black-and-white print. Around 30% is usually the point where the mark is undeniable and the text is still legible.',
          'The default angle is diagonal because a diagonal mark crosses lines of text and is harder to crop out. A repeated grid covers the whole page and is what makes cropping a passage difficult — but it has a cost: each mark is a drawing command in the file, so small text side by side can pass a thousand marks per page, inflate the PDF and turn into a smear. The tool caps that and SAYS when it tightened the spacing, rather than quietly handing back something other than what you asked for.',
          'A logo is embedded once and drawn many times — using an oversized image only grows the file, since it will be shown reduced anyway.',
        ],
      },
      {
        h: 'What a watermark solves, and what it does not',
        p: [
          'It solves attribution and deterrence: it makes clear that the document is a draft, a copy, or somebody property, and makes a leak awkward to circulate. That is why it is standard on commercial proposals, preliminary reports and material sent out for review.',
          'It does not solve confidentiality: the mark sits ON TOP of the content, and the content is all still there, selectable and copyable. Anyone who wants the text has the text. To genuinely hide information, the path is PDF redaction, which rasterises the page and removes the text under the bar; to prevent opening at all, it is password protection.',
          'A watermark is also not a signature, and a good practice is to keep the word "signed" out of it — what it communicates is origin, not consent.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'The document that most often gets watermarked is precisely the one that cannot circulate yet: a proposal under negotiation, a report under review, material under an NDA. Sending it to a website to be marked means handing the unmarked version to a server.',
          'Here the mark is drawn inside the tab, over a PDF that never leaves your machine. The meter at the top of the page stays at zero while the file is generated.',
        ],
      },
    ],
  },
  'cut-audio': {
    pt: [
      {
        h: 'Como cortar um áudio',
        p: [
          'A ferramenta desenha a onda do arquivo inteiro e deixa você marcar um trecho sobre ela. Dá para tirar o pedaço marcado ou ficar só com ele — e o corte vira o arquivo de trabalho, então você pode cortar de novo em cima do resultado sem baixar e subir nada.',
        ],
        steps: [
          'Solte o áudio. A onda aparece assim que a decodificação termina.',
          'Arraste sobre a onda para marcar o trecho. Use o zoom para achar o ponto exato.',
          'Ouça a seleção antes de decidir — o player toca só o trecho marcado.',
          'Escolha entre remover o trecho ou manter só ele.',
          'Baixe o resultado, ou corte outra vez em cima dele.',
        ],
      },
      {
        h: 'Por que o corte não recodifica o áudio',
        p: [
          'Cortar não muda o som, muda onde ele começa e termina. Recodificar um MP3 para salvar o corte acrescentaria uma segunda geração de perda em cima da que o arquivo já traz — barulho a mais em troca de nada. Por isso a saída é WAV: as amostras que sobrevivem ao corte saem exatamente como entraram.',
          'O efeito colateral é o tamanho. WAV não comprime, então um corte de três minutos ocupa dezenas de megabytes. Se o destino exige arquivo pequeno, o caminho é cortar aqui e passar por comprimir áudio, que fica a um clique — assim a compressão acontece uma vez só, no fim.',
          'Um detalhe do navegador que vale saber: a decodificação acontece na taxa de amostragem do seu aparelho de saída. Um arquivo de 44,1 kHz numa placa configurada em 48 kHz sai em 48 kHz. Não existe API para decodificar na taxa original — é um piso do navegador, não uma escolha da ferramenta.',
        ],
      },
      {
        h: 'O clique na emenda, e por que ele não acontece aqui',
        p: [
          'Quando você remove um trecho do meio, as duas pontas que se juntam nunca foram vizinhas. Se as amostras nas duas bordas estiverem em alturas diferentes da onda, o salto instantâneo entre elas é audível — aquele "toc" que denuncia corte malfeito em quase todo editor simples.',
          'Aqui a emenda recebe uma queda de volume de poucos milissegundos descendo até o ponto de junção e subindo de volta. É curto demais para se ouvir como fade e longo o bastante para eliminar o salto.',
          'Os limites são de memória, não de política: até 100 MB por arquivo e 30 minutos de duração. Áudio decodificado vira ponto flutuante de 32 bits — meia hora em estéreo já ocupa perto de 700 MB de memória, e o corte precisa alocar o resultado em cima disso.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'O áudio que as pessoas cortam costuma ser gravação de reunião, entrevista, aula ou consulta — conteúdo que muitas vezes nem pode ser compartilhado por contrato. Todo editor online recebe esse arquivo num servidor.',
          'Aqui o arquivo é decodificado e reescrito dentro da aba, e o medidor no alto da página conta bytes de arquivo saindo — ele fica em zero do começo ao fim. Depois da primeira visita, funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to cut an audio file',
        p: [
          'The tool draws the waveform of the whole file and lets you mark a stretch on it. You can remove the marked stretch or keep only it — and the cut becomes the working file, so you can cut again on top of the result without downloading and re-uploading anything.',
        ],
        steps: [
          'Drop the audio. The waveform appears as soon as decoding finishes.',
          'Drag across the waveform to mark the stretch. Use the zoom to find the exact point.',
          'Listen to the selection before deciding — the player plays only the marked stretch.',
          'Choose between removing the stretch and keeping only it.',
          'Download the result, or cut again on top of it.',
        ],
      },
      {
        h: 'Why the cut does not re-encode the audio',
        p: [
          'Cutting does not change the sound, it changes where it starts and ends. Re-encoding an MP3 to save the cut would add a second generation of loss on top of the one the file already carries — more noise in exchange for nothing. So the output is WAV: the samples that survive the cut come out exactly as they went in.',
          'The side effect is size. WAV does not compress, so a three-minute cut takes tens of megabytes. If the destination needs a small file, cut here and pass through audio compression, one click away — that way compression happens once, at the end.',
          'One browser detail worth knowing: decoding happens at the sample rate of your output device. A 44.1 kHz file on a card set to 48 kHz comes out at 48 kHz. There is no API to decode at the original rate — that is a browser floor, not a choice of the tool.',
        ],
      },
      {
        h: 'The click at the join, and why it does not happen here',
        p: [
          'When you remove a stretch from the middle, the two ends that meet were never neighbours. If the samples at those two edges sit at different heights of the wave, the instant jump between them is audible — the "tock" that gives away a sloppy cut in almost every simple editor.',
          'Here the join gets a volume dip of a few milliseconds, sloping down into the junction and back up. It is far too short to hear as a fade and long enough to remove the jump.',
          'The limits are about memory, not policy: up to 100 MB per file and 30 minutes of duration. Decoded audio becomes 32-bit floating point — half an hour in stereo already takes close to 700 MB of memory, and the cut has to allocate the result on top of that.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'The audio people cut is usually a recording of a meeting, an interview, a lecture or a consultation — content that often cannot be shared at all under contract. Every online editor takes that file onto a server.',
          'Here the file is decoded and rewritten inside the tab, and the meter at the top of the page counts file bytes leaving — it stays at zero from beginning to end. After the first visit, it works with no internet.',
        ],
      },
    ],
  },
  'merge-audio': {
    pt: [
      {
        h: 'Como juntar vários áudios num só',
        p: [
          'Os arquivos entram como faixas numa lista, cada uma com a própria onda desenhada, e você define a ordem. O resultado é um arquivo só, com as faixas emendadas na sequência escolhida.',
        ],
        steps: [
          'Solte os arquivos de áudio, de uma vez ou aos poucos.',
          'Arraste as miniaturas para ordenar. Os botões de seta fazem o mesmo, e funcionam no celular e pelo teclado.',
          'Ajuste o crossfade se quiser transição suave entre as faixas.',
          'Ouça o resultado antes de gerar.',
          'Baixe o arquivo final.',
        ],
      },
      {
        h: 'Crossfade: por que ele não é um fade comum',
        p: [
          'Quando duas faixas se sobrepõem numa transição, elas somam. Se as duas usarem uma rampa reta — uma caindo, a outra subindo —, no meio do caminho cada uma está na metade e a soma dá cerca de menos 6 decibéis: um buraco audível bem no meio de cada transição.',
          'Por isso o crossfade aqui usa curvas de potência constante (seno e cosseno), em que a soma da energia se mantém e o volume não afunda. Já o fade simples de entrada e saída, que não soma com nada, é linear — porque é isso que o número no painel promete: dois segundos de fade significam metade do nível a um segundo.',
          'O crossfade é limitado à metade da faixa mais curta. Mais que isso faria a entrada e a saída da mesma faixa colidirem, e a ferramenta avisa quando limitou, em vez de aplicar em silêncio um número diferente do que está escrito no campo.',
        ],
      },
      {
        h: 'Faixas com formatos diferentes',
        p: [
          'É normal juntar coisas desencontradas: um áudio de mensagem gravado em mono, uma música em estéreo, um trecho de aula em outra taxa. A ferramenta alarga o mono até a largura da faixa mais larga, nunca o contrário — rebaixar tudo para mono porque uma das entradas era mensagem de voz estragaria a mistura das outras, e é justamente o oposto do que um juntador deveria fazer.',
          'A saída é WAV pelo mesmo motivo do cortador: emendar não é razão para recodificar tudo e acrescentar uma geração de perda. Se o resultado precisa ser pequeno, comprima depois, uma vez só.',
          'Os limites do módulo valem aqui também: 100 MB por arquivo e 30 minutos, que é o teto de memória para áudio decodificado.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Juntar áudios é rotina de podcast, de aula gravada e de material de processo — gravação de reunião, depoimento, atendimento. Um serviço online recebe todos os arquivos, não só o resultado.',
          'Aqui as faixas são decodificadas e misturadas na sua aba, e o medidor no alto da página fica em zero durante todo o trabalho. Depois da primeira visita, funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to merge several audio files into one',
        p: [
          'The files arrive as tracks in a list, each with its own waveform drawn, and you set the order. The result is a single file with the tracks joined in the sequence you chose.',
        ],
        steps: [
          'Drop the audio files, all at once or gradually.',
          'Drag the thumbnails to order them. The arrow buttons do the same, and they work on a phone and from a keyboard.',
          'Set a crossfade if you want a smooth transition between tracks.',
          'Listen to the result before generating.',
          'Download the final file.',
        ],
      },
      {
        h: 'Crossfade: why it is not an ordinary fade',
        p: [
          'When two tracks overlap in a transition, they add together. If both use a straight ramp — one falling, one rising — halfway through each is at half level and the sum lands around minus 6 decibels: an audible hole in the middle of every transition.',
          'So the crossfade here uses constant-power curves (sine and cosine), where the summed energy holds and the volume does not sag. The plain fade in and fade out, which sums with nothing, is linear instead — because that is what the number in the panel promises: two seconds of fade means half level at one second.',
          'The crossfade is capped at half the shortest track. Longer than that would make one track fade-in and fade-out collide, and the tool says when it capped, instead of quietly applying a different number from the one in the field.',
        ],
      },
      {
        h: 'Tracks in different formats',
        p: [
          'Merging mismatched things is normal: a voice note recorded in mono, a song in stereo, a lecture excerpt at another rate. The tool widens mono up to the widest track, never the other way round — folding everything to mono because one input was a voice note would ruin the mix of the others, and it is precisely the opposite of what a merger should do.',
          'The output is WAV for the same reason as the cutter: joining files is no reason to re-encode everything and add a generation of loss. If the result has to be small, compress afterwards, once.',
          'The module limits hold here too: 100 MB per file and 30 minutes, which is the memory ceiling for decoded audio.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Merging audio is routine for podcasts, recorded classes and case material — meeting recordings, statements, support calls. An online service receives every file, not just the result.',
          'Here the tracks are decoded and mixed in your tab, and the meter at the top of the page stays at zero throughout. After the first visit, it works with no internet.',
        ],
      },
    ],
  },
  'convert-audio': {
    pt: [
      {
        h: 'Como converter um arquivo de áudio',
        p: [
          'O arquivo é decodificado pelo próprio navegador e reescrito no formato que você escolher, com controle de taxa de bits, de canais e de taxa de amostragem. Entram MP3, WAV, OGG, M4A, AAC, FLAC e WebM, até 100 MB.',
        ],
        steps: [
          'Solte o áudio.',
          'Escolha o formato de destino.',
          'Ajuste a taxa de bits (320, 192 ou 128 kbps), os canais e a taxa de amostragem, se precisar.',
          'Ouça o resultado antes de baixar.',
          'Baixe o arquivo convertido.',
        ],
      },
      {
        h: 'O que o navegador sabe escrever, e o que ele improvisa',
        p: [
          'Ler e escrever áudio são capacidades diferentes. O navegador decodifica praticamente tudo, mas escreve pouca coisa: MP3 sai de um codificador embutido na própria ferramenta, e WAV sai direto das amostras, sem codificação nenhuma.',
          'OGG, M4A e WebM dependem do gravador nativo do seu navegador, e a disponibilidade muda entre Chrome, Firefox e Safari. Quando o seu não sabe escrever o formato pedido, a ferramenta entrega MP3 e corrige a extensão do arquivo — porque um arquivo com a extensão errada é pior do que um formato diferente: ele quebra no destino, sem explicação.',
          'A conversão mais comum, de WAV para MP3, é também a mais útil: um WAV de dez minutos ocupa mais de 100 MB, e o mesmo material em MP3 de 192 kbps fica perto de 14 MB, com diferença que a maioria dos ouvintes não percebe em fala.',
        ],
      },
      {
        h: 'Taxa de bits, canais e taxa de amostragem',
        p: [
          'Taxa de bits é o parâmetro que decide tamanho e qualidade. Para voz — aula, reunião, podcast falado —, 128 kbps já é confortável. Para música, 192 é o meio-termo comum e 320 é o topo do formato, com ganho pequeno e arquivo bem maior.',
          'Canais: converter estéreo para mono corta o arquivo quase pela metade e é a escolha certa em gravação de voz, onde os dois canais carregam praticamente a mesma coisa. Em música, é perda real de imagem estéreo.',
          'Taxa de amostragem raramente precisa ser mexida. 44,1 kHz é o padrão de música e 48 kHz o de vídeo; descer para 22 kHz corta agudos e só faz sentido em voz falada quando o tamanho é crítico. Vale lembrar que a decodificação já acontece na taxa do seu aparelho de saída, então converter para cima não recupera o que não foi capturado.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Conversores online de áudio são o exemplo clássico de serviço que pede upload para fazer uma conta que o seu próprio aparelho faria. E o arquivo costuma ser gravação de voz — reunião, entrevista, mensagem — que é conteúdo pessoal por definição.',
          'Aqui o codificador roda dentro da aba. O medidor no alto da página fica em zero durante toda a conversão, e depois da primeira visita a ferramenta funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to convert an audio file',
        p: [
          'The file is decoded by the browser itself and rewritten in the format you choose, with control over bitrate, channels and sample rate. MP3, WAV, OGG, M4A, AAC, FLAC and WebM go in, up to 100 MB.',
        ],
        steps: [
          'Drop the audio.',
          'Choose the target format.',
          'Adjust the bitrate (320, 192 or 128 kbps), the channels and the sample rate if needed.',
          'Listen to the result before downloading.',
          'Download the converted file.',
        ],
      },
      {
        h: 'What the browser can write, and what it improvises',
        p: [
          'Reading and writing audio are different capabilities. The browser decodes practically everything, but writes little: MP3 comes from an encoder built into the tool itself, and WAV comes straight from the samples, with no encoding at all.',
          'OGG, M4A and WebM depend on your browser native recorder, and availability differs between Chrome, Firefox and Safari. When yours cannot write the requested format, the tool hands back MP3 and corrects the file extension — because a file with the wrong extension is worse than a different format: it breaks at the destination, with no explanation.',
          'The most common conversion, WAV to MP3, is also the most useful: a ten-minute WAV takes more than 100 MB, and the same material as a 192 kbps MP3 lands near 14 MB, with a difference most listeners cannot hear in speech.',
        ],
      },
      {
        h: 'Bitrate, channels and sample rate',
        p: [
          'Bitrate is the parameter that decides size and quality. For voice — lectures, meetings, spoken podcasts — 128 kbps is already comfortable. For music, 192 is the common middle ground and 320 is the top of the format, with a small gain and a much larger file.',
          'Channels: converting stereo to mono nearly halves the file and is the right choice for voice recordings, where both channels carry practically the same thing. In music, it is a real loss of stereo image.',
          'Sample rate rarely needs touching. 44.1 kHz is the music standard and 48 kHz the video one; dropping to 22 kHz cuts the highs and only makes sense for speech when size is critical. Worth remembering that decoding already happens at the rate of your output device, so converting upwards does not recover what was never captured.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Online audio converters are the classic example of a service that asks for an upload to do arithmetic your own device could do. And the file is usually a voice recording — a meeting, an interview, a message — which is personal content by definition.',
          'Here the encoder runs inside the tab. The meter at the top of the page stays at zero for the whole conversion, and after the first visit the tool works with no internet.',
        ],
      },
    ],
  },
  'compress-audio': {
    pt: [
      {
        h: 'Como reduzir o tamanho de um áudio',
        p: [
          'A compressão aqui é uma recodificação em MP3 na taxa de bits que você escolher, com o tamanho estimado aparecendo antes de gerar o arquivo. É a diferença entre escolher e chutar: dá para ver quanto cada opção custa antes de baixar.',
        ],
        steps: [
          'Solte o áudio. A onda aparece e o tamanho original fica visível.',
          'Escolha a taxa de bits. O tamanho estimado do resultado acompanha a escolha.',
          'Ajuste os canais se for gravação de voz — mono corta quase metade.',
          'Ouça antes, se a qualidade for crítica.',
          'Gere e baixe.',
        ],
      },
      {
        h: 'Quanto cada taxa de bits custa em qualidade',
        p: [
          'Voz falada é o caso fácil: em 128 kbps a diferença para o original é difícil de notar, e em 96 ainda é perfeitamente inteligível. Uma hora de reunião em 128 kbps fica em torno de 55 MB, contra centenas em WAV.',
          'Música é mais exigente. Em 192 kbps a maior parte do material passa sem incômodo; em 128 começam a aparecer artefatos em pratos, cordas e agudos sustentados. Abaixo disso o objetivo já não é qualidade, é caber num limite.',
          'A regra que evita frustração: recomprimir um MP3 nunca melhora nada, e cada passagem acrescenta perda. Se você tem o arquivo original em WAV ou vindo do gravador, comprima a partir DELE, e não da cópia que já foi comprimida uma vez.',
        ],
      },
      {
        h: 'Quando o problema não é a taxa de bits',
        p: [
          'Arquivo grande costuma ser arquivo longo. Se o objetivo é enviar por e-mail ou por um aplicativo com limite, cortar o silêncio do começo e do fim, ou separar em partes, resolve mais que qualquer ajuste de qualidade — e sem tocar no som que interessa.',
          'Se o áudio veio de vídeo, extrair antes é o caminho: um arquivo de vídeo carrega a imagem inteira junto, e ela é quase todo o peso.',
          'E se o que incomoda é volume irregular e não tamanho, a ferramenta certa é a de normalizar, que ajusta o nível sem mexer na compressão.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Comprimir áudio é uma operação de codificador, e o codificador está aqui, na sua aba. Não há nada nessa conta que precise de servidor — o upload existe nos serviços online porque o processamento é deles, não porque a tarefa exige.',
          'O medidor da barra superior mostra zero byte de arquivo saindo enquanto a compressão roda. Depois da primeira visita, tudo funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to make an audio file smaller',
        p: [
          'Compression here is a re-encode to MP3 at the bitrate you pick, with the estimated size shown before the file is generated. That is the difference between choosing and guessing: you can see what each option costs before downloading.',
        ],
        steps: [
          'Drop the audio. The waveform appears and the original size is shown.',
          'Pick the bitrate. The estimated result size follows your choice.',
          'Adjust the channels if it is a voice recording — mono cuts nearly half.',
          'Listen first, if quality is critical.',
          'Generate and download.',
        ],
      },
      {
        h: 'What each bitrate costs in quality',
        p: [
          'Speech is the easy case: at 128 kbps the difference from the original is hard to notice, and at 96 it is still perfectly intelligible. An hour of meeting at 128 kbps lands around 55 MB, against hundreds as WAV.',
          'Music is more demanding. At 192 kbps most material passes without discomfort; at 128 artefacts start to show on cymbals, strings and sustained highs. Below that the goal is no longer quality, it is fitting a limit.',
          'The rule that avoids frustration: recompressing an MP3 never improves anything, and every pass adds loss. If you have the original file as WAV or straight from the recorder, compress from THAT, not from the copy that was already compressed once.',
          'The size estimate shown next to each option is not a guess: at a constant bitrate the result is bitrate multiplied by duration, so the number on screen is what the file will weigh, give or take the header. That is what turns picking a bitrate into a decision — you can see whether 128 clears the limit before spending time on the encode, instead of generating, checking and going back.',
        ],
      },
      {
        h: 'When the bitrate is not the problem',
        p: [
          'A large file is usually a long file. If the goal is to send it by email or through an app with a limit, trimming the silence at the start and end, or splitting it into parts, does more than any quality setting — and without touching the sound that matters.',
          'If the audio came from a video, extracting it first is the path: a video file carries the whole picture along, and the picture is almost all of the weight.',
          'And if what bothers you is uneven volume rather than size, the right tool is normalisation, which adjusts the level without touching compression.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Compressing audio is an encoder operation, and the encoder is right here, in your tab. Nothing in that computation needs a server — the upload exists in online services because the processing is theirs, not because the task requires it.',
          'The meter in the top bar shows zero file bytes leaving while compression runs. After the first visit, everything works with no internet.',
        ],
      },
    ],
  },
  'normalize-audio': {
    pt: [
      {
        h: 'Como deixar o volume parelho',
        p: [
          'A ferramenta MEDE o áudio antes de oferecer qualquer coisa, e a medição é a mesma que rádio, TV e as plataformas de streaming usam: LUFS, pela recomendação BS.1770. O painel mostra o que o arquivo tem hoje, e você escolhe o alvo.',
        ],
        steps: [
          'Solte o áudio e espere a medição.',
          'Escolha o modo: por loudness (LUFS), que é o que iguala a sensação de volume, ou por pico.',
          'Defina o alvo. Menos 14 LUFS é o comum para streaming; menos 16 para podcast falado.',
          'Confira o ganho calculado e se o limitador precisou entrar.',
          'Gere e baixe.',
        ],
      },
      {
        h: 'Por que LUFS e não simplesmente volume',
        p: [
          'Volume de pico diz qual foi a amostra mais alta do arquivo, e isso quase não tem relação com o quanto ele SOA alto. Um arquivo com um estouro isolado e o resto baixo tem pico alto e volume percebido baixo; é por isso que normalizar por pico deixa faixas ainda desiguais entre si.',
          'A medição em LUFS aplica uma ponderação parecida com a sensibilidade do ouvido e depois faz uma média com portas. As portas são o que torna o número utilizável: sem elas, meia hora de silêncio no fim de uma gravação derruba a média em cerca de 10 decibéis, e a ferramenta responderia com um ganho absurdo. A porta absoluta descarta o que está abaixo de menos 70 LUFS; a relativa descarta o que está muito abaixo da própria média.',
          'Na prática: é isso que faz três episódios gravados em dias diferentes soarem no mesmo volume, e é exatamente o que o botão de "aumentar volume" de um editor comum não faz.',
        ],
      },
      {
        h: 'O limitador, o teto e o que a ferramenta reporta',
        p: [
          'Aumentar o volume pode levar picos acima do teto digital, e cortar o que passa é distorção — o único som que uma ferramenta de "deixar mais alto" não pode produzir. Por isso existe um limitador que constrói o ganho de forma a caber sob o teto, com ataque e liberação suaves, em vez de simplesmente cortar a onda.',
          'O teto padrão é menos 1 dBFS. Essa folga de um decibel cobre os picos que aparecem entre amostras depois da conversão para analógico ou para MP3, que uma medição de pico simples não enxerga — o painel diz que é pico de amostra, em vez de deixar o número sugerir uma precisão que ele não tem.',
          'E quando o limitador entra, a ferramenta REMEDE o resultado, porque limitar tira energia: reportar o alvo pedido nesse caso seria informar um número que o arquivo não tem. Quando nada foi contido, a resposta é exatamente a medição inicial mais o ganho.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Toda a normalização é aritmética sobre as amostras, sem dependência externa. O arquivo é decodificado, medido e reescrito na sua aba — e o material típico aqui é episódio inédito, aula gravada ou entrevista com fonte, que são justamente os arquivos que não deveriam circular antes da publicação.',
          'O medidor no alto da página fica em zero durante a medição e a aplicação do ganho, e depois da primeira visita a ferramenta funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to even out the volume',
        p: [
          'The tool MEASURES the audio before offering anything, and the measurement is the one radio, TV and streaming platforms use: LUFS, following the BS.1770 recommendation. The panel shows what the file has today, and you choose the target.',
        ],
        steps: [
          'Drop the audio and wait for the measurement.',
          'Choose the mode: loudness (LUFS), which is what evens out perceived volume, or peak.',
          'Set the target. Minus 14 LUFS is common for streaming; minus 16 for spoken podcasts.',
          'Check the computed gain and whether the limiter had to engage.',
          'Generate and download.',
        ],
      },
      {
        h: 'Why LUFS and not simply volume',
        p: [
          'Peak volume tells you the loudest single sample in the file, and that has almost no relation to how loud it SOUNDS. A file with one isolated burst and quiet everywhere else has a high peak and low perceived volume; that is why peak normalisation leaves tracks still uneven against each other.',
          'LUFS measurement applies a weighting close to the sensitivity of the ear and then averages with gates. The gates are what make the number usable: without them, half an hour of silence at the end of a recording drops the average by around 10 decibels, and the tool would answer with an absurd gain. The absolute gate discards anything below minus 70 LUFS; the relative one discards whatever sits far below the average itself.',
          'In practice: that is what makes three episodes recorded on different days sound at the same volume, and exactly what the "increase volume" button of an ordinary editor does not do.',
        ],
      },
      {
        h: 'The limiter, the ceiling, and what the tool reports',
        p: [
          'Raising the volume can push peaks above the digital ceiling, and clipping what passes is distortion — the one sound a "make it louder" tool must not produce. So there is a limiter that builds the gain to fit under the ceiling, with smooth attack and release, instead of simply chopping the wave.',
          'The default ceiling is minus 1 dBFS. That decibel of headroom covers the peaks that appear between samples after conversion to analogue or to MP3, which a plain peak measurement cannot see — the panel says it is sample peak, rather than letting the number imply a precision it does not have.',
          'And when the limiter engages, the tool RE-MEASURES the result, because limiting removes energy: reporting the requested target in that case would state a number the file does not have. When nothing was held back, the answer is exactly the initial measurement plus the gain.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'The whole normalisation is arithmetic over the samples, with no external dependency. The file is decoded, measured and rewritten in your tab — and the typical material here is an unreleased episode, a recorded class or an interview with a source, precisely the files that should not circulate before publication.',
          'The meter at the top of the page stays at zero during measurement and gain, and after the first visit the tool works with no internet.',
        ],
      },
    ],
  },
  'screen-recorder': {
    pt: [
      {
        h: 'Como gravar a tela',
        p: [
          'Esta é a única ferramenta do produto que não recebe arquivo: ela cria um. A escolha do que gravar — tela inteira, uma janela ou uma aba — é feita pelo seletor do próprio navegador, então nada aqui consegue capturar algo que você não tenha escolhido explicitamente.',
        ],
        steps: [
          'Escolha o formato do arquivo e as fontes de áudio antes de começar.',
          'Clique em gravar e selecione, na janela do navegador, o que será capturado.',
          'Faça o que precisa ser gravado. O tempo aparece na tela durante a captura.',
          'Pare pelo botão da ferramenta ou pelo aviso de compartilhamento do próprio navegador.',
          'Baixe o vídeo, ou mande direto para extrair o áudio.',
        ],
      },
      {
        h: 'Formato e áudio: as duas escolhas que importam',
        p: [
          'O formato oferecido é só o que o SEU navegador sabe gravar, porque não existe reconversão depois: o arquivo sai no formato com que o gravador foi construído. Anunciar MP4 num navegador que só escreve WebM seria prometer um arquivo que nunca apareceria. Quando há um formato só, o painel diz o nome dele em vez de mostrar um seletor de uma opção.',
          'No áudio, a diferença entre uma e duas fontes é técnica: um fluxo aceita várias trilhas de áudio, mas o gravador registra apenas a primeira. Entregar a ele o som do sistema e o microfone juntos produziria um vídeo com o som do sistema e sem a sua voz — e você só descobriria depois de gravar. Por isso, com as duas fontes ligadas, elas são misturadas antes; com uma só, nada é misturado, porque reprocessar à toa é perda de qualidade de graça.',
          'O limite é uma hora por gravação, e ele é sobre tamanho, não sobre memória: os pedaços do vídeo vão para o disco enquanto a gravação corre. A uma qualidade comum, uma hora dá perto de 1 GB para baixar — o painel avisa disso antes, em vez de deixar a surpresa para o fim.',
        ],
      },
      {
        h: 'O que gravar, e o que não gravar',
        p: [
          'Aba do navegador é a escolha mais limpa para tutorial e demonstração de site: pega só o conteúdo, sem barra de tarefas, notificação nem o resto da sua área de trabalho. Janela isola um aplicativo. Tela inteira é o que vaza informação sem querer — notificação de mensagem, aba aberta, nome de arquivo no rodapé.',
          'Antes de gravar a tela inteira, vale fechar o que não deve aparecer e silenciar notificações. Nenhuma ferramenta desfaz isso depois: o que entrou no vídeo está no vídeo.',
          'A gravação termina também pelo aviso do navegador ("parar de compartilhar"), e não só pelo botão daqui — esse aviso fica na frente da pessoa o tempo todo, e é assim que a maioria das gravações acaba.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Gravador de tela é software que enxerga tudo o que você faz. Instalar um programa desses é dar essa visão a um binário que atualiza sozinho; usar um serviço online costuma significar que o vídeo sobe para a nuvem de alguém enquanto é gravado.',
          'Aqui a captura acontece pela API do próprio navegador e o arquivo é montado na aba. Junto com o medidor no alto da página, é provavelmente a demonstração mais direta da tese do produto que existe: uma gravação de tela inteira que produz zero byte de saída.',
        ],
      },
    ],
    en: [
      {
        h: 'How to record your screen',
        p: [
          'This is the only tool in the product that takes no file: it creates one. What gets recorded — the whole screen, a window or a tab — is chosen in the browser own picker, so nothing here can capture anything you did not explicitly select.',
        ],
        steps: [
          'Choose the file format and the audio sources before starting.',
          'Click record and select, in the browser window, what will be captured.',
          'Do whatever needs recording. The elapsed time is shown during the capture.',
          'Stop from the tool button or from the browser own sharing notice.',
          'Download the video, or send it straight on to extract the audio.',
        ],
      },
      {
        h: 'Format and audio: the two choices that matter',
        p: [
          'The formats offered are only what YOUR browser can record, because there is no re-encode afterwards: the file comes out in the format the recorder was built with. Announcing MP4 on a browser that only writes WebM would promise a file that never appears. When there is only one format, the panel names it instead of showing a one-option selector.',
          'On audio, the difference between one and two sources is technical: a stream accepts several audio tracks, but the recorder only records the first. Handing it system sound and microphone together would produce a video with the system sound and none of your voice — and you would find out after recording. So with both sources on, they are mixed beforehand; with only one, nothing is mixed, because reprocessing for nothing is free quality loss.',
          'The limit is one hour per recording, and it is about size rather than memory: the video chunks go to disk while the recording runs. At ordinary quality, an hour is close to 1 GB to download — the panel says so beforehand instead of leaving the surprise for the end.',
        ],
      },
      {
        h: 'What to record, and what not to',
        p: [
          'A browser tab is the cleanest choice for tutorials and website demos: it captures only the content, with no taskbar, no notifications and none of the rest of your desktop. A window isolates one application. The whole screen is what leaks information by accident — a message notification, an open tab, a filename in the corner.',
          'Before recording the whole screen, it pays to close whatever should not appear and silence notifications. No tool undoes that afterwards: what went into the video is in the video.',
          'A recording also ends from the browser notice ("stop sharing"), not only from the button here — that notice sits in front of the person the whole time, and it is how most recordings end.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'A screen recorder is software that sees everything you do. Installing one hands that view to a binary that updates itself; using an online service usually means the video is uploaded to somebody cloud while it is being recorded.',
          'Here the capture happens through the browser own API and the file is assembled in the tab. Together with the meter at the top of the page, it is probably the most direct demonstration of the product thesis there is: a full-screen recording that produces zero bytes of outbound traffic.',
        ],
      },
    ],
  },
  'video-to-audio': {
    pt: [
      {
        h: 'Como extrair o áudio de um vídeo',
        p: [
          'A ferramenta separa a trilha de áudio do arquivo de vídeo e devolve só o som, em WAV. Serve para transcrever depois, para aproveitar a gravação de uma reunião sem carregar a imagem junto, ou para pegar a narração de uma aula.',
        ],
        steps: [
          'Solte o vídeo. A duração é conferida antes de qualquer leitura pesada.',
          'Espere a extração. No caminho rápido, ela leva segundos.',
          'Se o seu navegador precisar do caminho lento, a tela avisa, mostra o tempo restante e oferece cancelar.',
          'Baixe o áudio, ou mande direto para cortar, comprimir ou normalizar.',
        ],
      },
      {
        h: 'Dois caminhos, e por que o lento existe',
        p: [
          'No caminho rápido, o próprio navegador abre o container do vídeo e devolve só a trilha de áudio — sem perda e na velocidade do disco. É o que acontece no Chrome, no Edge e no Safari, e a extração fica mais rápida que a duração do vídeo por uma ordem de grandeza.',
          'O Firefox recusa esse atalho em vários formatos que carregam vídeo. Nesses casos a ferramenta cai para o outro caminho: tocar o vídeo do início ao fim e capturar as amostras conforme elas passam. Isso demora exatamente o tempo do vídeo, e é por isso que a tela mostra quanto falta e deixa cancelar — um vídeo de trinta minutos leva trinta minutos.',
          'Uma alternativa foi recusada de propósito: gravar a captura com o gravador do navegador seria mais simples, mas ele codificaria em Opus, e um arquivo WAV feito a partir de Opus é a mesma mentira que um PNG com nome .avif. Melhor demorar e entregar o som como ele é.',
        ],
      },
      {
        h: 'Limites, e o vídeo sem duração declarada',
        p: [
          'Os tetos são 500 MB por arquivo e 30 minutos de duração, e os dois são sobre memória: áudio decodificado vira ponto flutuante de 32 bits, e meia hora em estéreo já ocupa perto de 700 MB. A duração é conferida ANTES de ler o arquivo, num teste que custa quase nada — é o que evita alocar meio gigabyte para descobrir depois que o vídeo tem três horas.',
          'Um caso que parece defeito e não é: gravação feita pelo próprio navegador — captura de tela, webcam, reunião gravada — costuma vir sem duração no cabeçalho, e um leitor apressado a rejeitaria como arquivo corrompido. A ferramenta força o vídeo a assumir a duração real antes de continuar, porque esse é justamente o arquivo que mais gente traz para extrair áudio.',
          'A saída é WAV, sem recodificação. Se o destino pede arquivo pequeno, converter ou comprimir depois fica a um clique — e aí a perda acontece uma vez só.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Vídeo é o arquivo mais pesado e mais sensível que a maioria das pessoas manipula: reunião gravada, consulta, aula, entrevista. Subir um arquivo de centenas de megabytes para um servidor só para pegar o áudio é caro e desnecessário.',
          'Aqui a extração acontece na sua aba, e o medidor no alto da página fica em zero. Como o gravador de tela também está no produto, dá para gravar e extrair sem que nenhum dos dois arquivos toque a rede.',
        ],
      },
    ],
    en: [
      {
        h: 'How to extract the audio from a video',
        p: [
          'The tool separates the audio track from the video file and returns only the sound, as WAV. It is for transcribing later, for keeping the recording of a meeting without carrying the picture along, or for taking the narration out of a class.',
        ],
        steps: [
          'Drop the video. Its duration is checked before any heavy reading.',
          'Wait for the extraction. On the fast path it takes seconds.',
          'If your browser needs the slow path, the screen says so, shows the time remaining and offers to cancel.',
          'Download the audio, or send it straight on to cut, compress or normalise.',
        ],
      },
      {
        h: 'Two paths, and why the slow one exists',
        p: [
          'On the fast path the browser itself opens the video container and hands back only the audio track — losslessly and at disk speed. That is what happens in Chrome, Edge and Safari, and the extraction ends up an order of magnitude faster than the video duration.',
          'Firefox refuses that shortcut on several containers that carry video. In those cases the tool falls back to the other path: playing the video from start to finish and capturing the samples as they go by. That takes exactly the length of the video, which is why the screen shows the time remaining and allows cancelling — a thirty-minute video takes thirty minutes.',
          'One alternative was rejected on purpose: recording the capture with the browser recorder would be simpler, but it would encode to Opus, and a WAV built from Opus is the same lie as a PNG named .avif. Better to take the time and hand back the sound as it is.',
        ],
      },
      {
        h: 'Limits, and the video with no declared duration',
        p: [
          'The ceilings are 500 MB per file and 30 minutes of duration, and both are about memory: decoded audio becomes 32-bit floating point, and half an hour in stereo already takes close to 700 MB. Duration is checked BEFORE reading the file, in a probe that costs almost nothing — that is what avoids allocating half a gigabyte only to discover the video is three hours long.',
          'One case that looks like a defect and is not: a recording made by the browser itself — screen capture, webcam, a recorded meeting — usually arrives with no duration in its header, and a hasty reader would reject it as corrupt. The tool forces the video to settle on its real duration before continuing, because that is precisely the file most people bring here to extract audio from.',
          'The output is WAV, with no re-encode. If the destination needs a small file, converting or compressing afterwards is one click away — and the loss then happens only once.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Video is the heaviest and most sensitive file most people handle: a recorded meeting, a consultation, a class, an interview. Uploading hundreds of megabytes to a server just to take the audio out is expensive and unnecessary.',
          'Here the extraction happens in your tab, and the meter at the top of the page stays at zero. Since the screen recorder is in the product too, you can record and extract without either file touching the network.',
        ],
      },
    ],
  },
  'encrypt-file': {
    pt: [
      {
        h: 'Como criptografar um arquivo com senha',
        p: [
          'Qualquer arquivo entra e sai como um envelope .enc que só abre com a senha. Para reabrir, é a mesma ferramenta: arraste o .enc de volta, escolha descriptografar e informe a senha — o nome e a extensão originais estão guardados dentro do envelope e voltam junto.',
        ],
        steps: [
          'Solte o arquivo, de qualquer tipo e até 256 MB.',
          'Escolha criptografar e defina uma senha forte.',
          'Baixe o .enc e guarde a senha num gerenciador.',
          'Para abrir depois: solte o .enc aqui, escolha descriptografar e informe a mesma senha.',
        ],
      },
      {
        h: 'O que roda por baixo, em termos concretos',
        p: [
          'A cifra é AES-256 no modo GCM, que é criptografia autenticada: além de esconder o conteúdo, ela detecta qualquer alteração nos bytes. A chave não é a sua senha — ela é derivada da senha com PBKDF2-SHA256, 100 mil iterações e um salt aleatório por arquivo, o que torna caro testar senhas em lote.',
          'O salt aleatório também é o motivo de dois envelopes do mesmo arquivo, com a mesma senha, saírem diferentes: não dá para saber, olhando dois .enc, que eles guardam a mesma coisa.',
          'O formato do envelope é fixo e documentado no código, e continua lendo as versões antigas. Isso não é detalhe de implementação: um arquivo cifrado hoje precisa abrir daqui a dois anos, e um formato que muda em silêncio transforma backup em lixo.',
        ],
      },
      {
        h: 'A senha é a única chave, e isso é literal',
        p: [
          'Não existe recuperação. Não há servidor com uma cópia, não há chave-mestra, não há e-mail de redefinição — é essa ausência que torna a criptografia real. Esquecer a senha é perder o arquivo, e nenhuma força bruta prática resolve isso.',
          'Por isso, duas recomendações que valem mais que qualquer configuração: guarde a senha num gerenciador antes de fechar a aba, e teste a descriptografia uma vez, com o arquivo original ainda no lugar, antes de confiar o backup ao envelope.',
          'Uma consequência útil da autenticação: senha errada e arquivo corrompido produzem exatamente a mesma recusa, porque matematicamente são a mesma coisa — a verificação falhou. A ferramenta separa apenas o que dá para separar de verdade: se o cabeçalho do envelope faz sentido ou não.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Mandar um arquivo para um site criptografar é entregar o conteúdo aberto e a senha ao mesmo servidor. É a contradição mais direta que existe nesse tipo de serviço, e vale para qualquer um deles.',
          'Aqui a cifragem usa a implementação criptográfica do próprio navegador, dentro da aba. Nem o arquivo nem a senha saem, e o medidor no alto da página mostra isso em tempo real. Como esta ferramenta aceita qualquer tipo de arquivo, ela também é o fim natural de qualquer cadeia daqui: corte, censure, limpe os metadados e cifre o resultado, sem nada tocar a rede.',
        ],
      },
    ],
    en: [
      {
        h: 'How to encrypt a file with a password',
        p: [
          'Any file goes in and comes out as an .enc envelope that only opens with the password. To reopen it, use the same tool: drop the .enc back, choose decrypt and give the password — the original name and extension are stored inside the envelope and come back with it.',
        ],
        steps: [
          'Drop the file, of any type and up to 256 MB.',
          'Choose encrypt and set a strong password.',
          'Download the .enc and store the password in a manager.',
          'To open it later: drop the .enc here, choose decrypt and give the same password.',
        ],
      },
      {
        h: 'What runs underneath, in concrete terms',
        p: [
          'The cipher is AES-256 in GCM mode, which is authenticated encryption: besides hiding the content, it detects any change to the bytes. The key is not your password — it is derived from it with PBKDF2-SHA256, 100 thousand iterations and a random salt per file, which makes testing passwords in bulk expensive.',
          'That random salt is also why two envelopes of the same file, with the same password, come out different: you cannot tell, looking at two .enc files, that they hold the same thing.',
          'The envelope format is fixed and documented in the code, and it still reads the older versions. That is not an implementation detail: a file encrypted today has to open two years from now, and a format that changes silently turns a backup into rubbish.',
        ],
      },
      {
        h: 'The password is the only key, and that is literal',
        p: [
          'There is no recovery. No server holds a copy, there is no master key, there is no reset email — that absence is what makes the encryption real. Forgetting the password means losing the file, and no practical brute force fixes that.',
          'So two recommendations worth more than any setting: store the password in a manager before closing the tab, and test decryption once, with the original file still in place, before trusting a backup to the envelope.',
          'One useful consequence of the authentication: a wrong password and a corrupt file produce exactly the same refusal, because mathematically they are the same thing — verification failed. The tool distinguishes only what can genuinely be distinguished: whether the envelope header makes sense or not.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Sending a file to a website to be encrypted hands the open content and the password to the same server. It is the most direct contradiction there is in that kind of service, and it holds for every one of them.',
          'Here the encryption uses the browser own cryptographic implementation, inside the tab. Neither the file nor the password leaves, and the meter at the top of the page shows it in real time. Since this tool accepts any file type, it is also the natural end of any chain here: crop, redact, clean the metadata and encrypt the result, with nothing touching the network.',
        ],
      },
    ],
  },
  'encrypt-text': {
    pt: [
      {
        h: 'Como criptografar uma mensagem de texto',
        p: [
          'Você escreve ou cola o texto, define uma senha, e recebe um bloco de caracteres que pode ser colado em qualquer lugar que aceite texto — e-mail, mensagem, bilhete, campo de formulário. Para ler de volta, cole o bloco aqui e informe a senha.',
        ],
        steps: [
          'Escreva ou cole a mensagem.',
          'Defina uma senha e combine com quem vai ler — por outro canal, nunca junto com a mensagem.',
          'Copie o bloco cifrado.',
          'Do outro lado: cole o bloco aqui, informe a senha e leia o texto.',
        ],
      },
      {
        h: 'O mesmo envelope da criptografia de arquivo, em outra embalagem',
        p: [
          'Por baixo, esta ferramenta usa exatamente o mesmo envelope da criptografia de arquivo: AES-256-GCM com chave derivada por PBKDF2-SHA256 e salt aleatório. A diferença é a embalagem — em vez de bytes num arquivo, o resultado é embrulhado em texto imprimível, com marcadores de início e fim.',
          'Ser o mesmo envelope tem uma consequência prática: uma mensagem salva como arquivo continua abrindo na ferramenta de arquivo, e vice-versa. Duas ferramentas, um formato só.',
          'O texto é preservado como está: acentos, emoji e quebras de linha voltam idênticos. Isso importa mais do que parece, porque é justamente onde muita implementação caseira estraga a mensagem sem avisar.',
        ],
      },
      {
        h: 'Onde isso é útil e onde não é',
        p: [
          'É útil para mandar uma senha, uma chave, um endereço ou um dado sensível por um canal que você não controla — o time do trabalho, um grupo, um e-mail corporativo que passa por filtros. Quem interceptar vê um bloco inútil.',
          'Não substitui mensageiro com criptografia ponta a ponta para conversa contínua, e não protege contra quem já tem a senha. Também não esconde que existe uma mensagem: o bloco é visivelmente cifrado, o que em alguns contextos é justamente o que você não quer.',
          'A regra que decide o resultado é sempre a mesma: senha por outro caminho. Mensagem cifrada e senha na mesma conversa não protegem nada.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Ferramentas online de cifrar texto pedem que você COLE o segredo no formulário delas. É o pedido mais estranho que existe nesse mercado: o conteúdo chega em claro ao servidor, e é justamente o conteúdo que você queria esconder.',
          'Aqui o texto nunca sai do campo. A cifragem acontece na aba, com a implementação criptográfica do navegador, e o medidor no alto da página fica em zero — inclusive porque não há arquivo nenhum para sair.',
        ],
      },
    ],
    en: [
      {
        h: 'How to encrypt a text message',
        p: [
          'You write or paste the text, set a password, and get a block of characters you can paste anywhere text is accepted — email, messaging, a note, a form field. To read it back, paste the block here and give the password.',
        ],
        steps: [
          'Write or paste the message.',
          'Set a password and agree it with the reader — through another channel, never alongside the message.',
          'Copy the encrypted block.',
          'On the other side: paste the block here, give the password and read the text.',
        ],
      },
      {
        h: 'The same envelope as file encryption, in another wrapper',
        p: [
          'Underneath, this tool uses exactly the same envelope as file encryption: AES-256-GCM with a key derived by PBKDF2-SHA256 and a random salt. The difference is the wrapper — instead of bytes in a file, the result is wrapped in printable text, with begin and end markers.',
          'Being the same envelope has a practical consequence: a message saved as a file still opens in the file tool, and the other way round. Two tools, one format.',
          'The text is preserved as it is: accents, emoji and line breaks come back identical. That matters more than it sounds, because it is exactly where many home-grown implementations mangle the message without warning.',
        ],
      },
      {
        h: 'Where this helps and where it does not',
        p: [
          'It helps for sending a password, a key, an address or a sensitive detail through a channel you do not control — a work chat, a group, a corporate email that passes through filters. Whoever intercepts it sees a useless block.',
          'It does not replace an end-to-end encrypted messenger for ongoing conversation, and it does not protect against someone who already has the password. It also does not hide that a message exists: the block is visibly encrypted, which in some contexts is precisely what you do not want.',
          'The rule that decides the outcome is always the same: the password goes by another route. An encrypted message and its password in the same conversation protect nothing.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Online text-encryption tools ask you to PASTE the secret into their form. It is the strangest request in that market: the content reaches the server in the clear, and it is precisely the content you wanted to hide.',
          'Here the text never leaves the field. Encryption happens in the tab, with the browser cryptographic implementation, and the meter at the top of the page stays at zero — not least because there is no file to leave at all.',
        ],
      },
    ],
  },
  'file-hash': {
    pt: [
      {
        h: 'Como conferir o hash de um arquivo',
        p: [
          'O hash é uma impressão digital do conteúdo: os mesmos bytes produzem sempre o mesmo código, e um único bit diferente produz um código completamente diferente. Serve para provar que um download chegou inteiro, que dois arquivos são idênticos, ou que um arquivo não foi alterado.',
        ],
        steps: [
          'Solte o arquivo, de qualquer tipo.',
          'Escolha os algoritmos: SHA-256, SHA-512 e MD5 podem ser calculados de uma vez.',
          'Espere o progresso terminar — arquivo grande é lido em pedaços.',
          'Compare com o valor que o fornecedor publicou, ou com o hash do outro arquivo.',
        ],
      },
      {
        h: 'Qual algoritmo usar',
        p: [
          'SHA-256 é o padrão atual e a escolha certa quando você tem escolha: é o que distribuições de sistema, repositórios e fornecedores publicam ao lado dos downloads. SHA-512 é da mesma família, com saída maior.',
          'MD5 continua aqui por um motivo prático: muita coisa antiga ainda publica só MD5, e conferir contra o que existe é melhor do que não conferir. Mas é preciso saber o que ele significa hoje — MD5 é quebrado para uso de segurança, no sentido de que é possível construir dois arquivos diferentes com o mesmo MD5 de propósito. Ele ainda serve para detectar corrupção acidental; não serve para provar que ninguém adulterou o arquivo com intenção.',
          'Na leitura, os arquivos são processados em pedaços de 4 MB, então a memória fica estável e o progresso na tela é real. SHA-512 é a exceção que precisa do arquivo inteiro de uma vez, e por isso tem um teto próprio de 512 MB.',
        ],
      },
      {
        h: 'O que o hash prova, e o que não prova',
        p: [
          'Prova integridade quando você tem um valor de referência confiável. Se você baixou o arquivo E o hash do mesmo site invadido, os dois batem e não provam nada — a referência precisa vir de outro lugar ou estar assinada.',
          'Prova igualdade entre arquivos: dois arquivos com o mesmo SHA-256 são o mesmo conteúdo, mesmo com nomes e datas diferentes. É a forma rápida de descobrir duplicata em backup, ou de confirmar que a cópia que você mandou chegou igual.',
          'Não prova autoria nem tempo, e não é criptografia: hash não esconde nada e não tem volta. Para esconder o conteúdo, a ferramenta é a de criptografar arquivo.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Calcular hash online costuma exigir subir o arquivo — o que é especialmente absurdo aqui, já que o motivo mais comum para calcular um hash é justamente desconfiar do caminho por onde o arquivo passou.',
          'Aqui a leitura é feita em pedaços dentro da aba, e nenhum byte sai. Como esta ferramenta aceita qualquer tipo de arquivo, ela também fecha qualquer cadeia do produto: dá para tratar um documento e conferir a impressão digital do resultado sem nada tocar a rede.',
        ],
      },
    ],
    en: [
      {
        h: 'How to check a file hash',
        p: [
          'A hash is a fingerprint of the content: the same bytes always produce the same code, and a single different bit produces a completely different one. It is for proving a download arrived intact, that two files are identical, or that a file has not been altered.',
        ],
        steps: [
          'Drop the file, of any type.',
          'Choose the algorithms: SHA-256, SHA-512 and MD5 can be computed in one pass.',
          'Wait for the progress to finish — large files are read in chunks.',
          'Compare with the value the supplier published, or with the hash of the other file.',
        ],
      },
      {
        h: 'Which algorithm to use',
        p: [
          'SHA-256 is the current standard and the right choice when you have one: it is what operating system distributions, repositories and vendors publish next to their downloads. SHA-512 is from the same family, with a longer output.',
          'MD5 is still here for a practical reason: plenty of older material publishes only MD5, and checking against what exists beats not checking. But it is worth knowing what it means today — MD5 is broken for security use, in the sense that two different files can be built with the same MD5 on purpose. It still detects accidental corruption; it does not prove that nobody tampered with the file deliberately.',
          'While reading, files are processed in 4 MB chunks, so memory stays flat and the progress on screen is real. SHA-512 is the exception that needs the whole file at once, which is why it has its own 512 MB ceiling.',
        ],
      },
      {
        h: 'What a hash proves, and what it does not',
        p: [
          'It proves integrity when you have a trustworthy reference value. If you downloaded the file AND the hash from the same compromised site, the two match and prove nothing — the reference has to come from elsewhere or be signed.',
          'It proves equality between files: two files with the same SHA-256 are the same content, even with different names and dates. It is the quick way to find duplicates in a backup, or to confirm that the copy you sent arrived unchanged.',
          'It does not prove authorship or time, and it is not encryption: a hash hides nothing and has no way back. To hide the content, the tool is file encryption.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Computing a hash online usually requires uploading the file — which is especially absurd here, since the most common reason to compute one is precisely distrust of the path the file travelled.',
          'Here the reading happens in chunks inside the tab, and no byte leaves. Since this tool accepts any file type, it also closes any chain in the product: you can process a document and check the fingerprint of the result with nothing touching the network.',
        ],
      },
    ],
  },
  'password-generator': {
    pt: [
      {
        h: 'Como gerar uma senha forte',
        p: [
          'A senha aparece pronta assim que a página abre — abrir com um campo vazio e um botão transformaria o caso mais comum em dois passos. Ao lado dela fica a entropia em bits, que é a medida honesta de quanto ela resiste a tentativa e erro.',
        ],
        steps: [
          'Ajuste o tamanho, de 8 a 128 caracteres.',
          'Escolha as classes: maiúsculas, minúsculas, números e símbolos.',
          'Confira a entropia e a força ao lado da senha.',
          'Copie e cole direto no cadastro ou no gerenciador.',
          'Gere outra quantas vezes quiser — cada clique produz uma senha diferente.',
        ],
      },
      {
        h: 'Entropia em bits, e por que tamanho vence complexidade',
        p: [
          'Entropia mede quantas senhas diferentes poderiam ter saído da mesma configuração. Cada bit dobra esse número, então a comparação entre duas senhas é direta: 60 bits é um milhão de vezes mais difícil que 40.',
          'A conta tem duas variáveis, e elas não pesam igual. Aumentar o tamanho multiplica as possibilidades a cada caractere novo; acrescentar uma classe aumenta só a base. Na prática, uma senha longa com letras minúsculas bate uma senha curta cheia de símbolos, e é mais fácil de digitar quando você precisa digitá-la.',
          'A aleatoriedade vem do gerador criptográfico do navegador, não do sorteio comum de JavaScript — que é previsível o bastante para ser reconstruído por quem observa a saída. E o sorteio é feito de forma uniforme, sem o viés que um resto de divisão introduziria: sem esse cuidado, alguns caracteres do alfabeto sairiam com mais frequência que outros, e a entropia impressa na tela seria maior que a real.',
        ],
      },
      {
        h: 'Escolhendo o tamanho pelo uso',
        p: [
          'Para conta comum guardada em gerenciador, 20 caracteres com todas as classes resolve com folga e você nunca vai digitá-la. Para senha que precisa ser digitada em teclado de TV ou ditada por telefone, vale subir o tamanho e tirar os símbolos — o ganho de entropia compensa e o erro de digitação despenca.',
          'Para senha-mestra de gerenciador, o critério muda: ela precisa ser memorizável e longa, e uma sequência de palavras aleatórias costuma servir melhor que um bloco de caracteres.',
          'Um cuidado que independe da senha: senha forte reusada em vários sites vira senha fraca no instante em que um deles vaza. O valor de gerar uma nova a cada cadastro é exatamente esse.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Um gerador de senhas online é a ferramenta em que confiar no servidor faz menos sentido: você estaria pedindo a um terceiro que sorteasse — e conhecesse — o segredo que vai proteger a sua conta. Mesmo com boa intenção, o registro dessa requisição existe em algum lugar.',
          'Aqui o sorteio acontece no seu aparelho e nada é transmitido. O medidor no alto da página fica em zero, e a ferramenta funciona com a internet desligada — o que também é o jeito mais simples de verificar que a senha não foi a lugar nenhum.',
        ],
      },
    ],
    en: [
      {
        h: 'How to generate a strong password',
        p: [
          'A password is ready the moment the page opens — opening with an empty field and a button would turn the most common case into two steps. Beside it sits the entropy in bits, the honest measure of how well it resists trial and error.',
        ],
        steps: [
          'Set the length, from 8 to 128 characters.',
          'Choose the classes: uppercase, lowercase, digits and symbols.',
          'Check the entropy and the strength shown next to the password.',
          'Copy and paste it straight into the signup form or your manager.',
          'Generate another as many times as you like — every click produces a different one.',
        ],
      },
      {
        h: 'Entropy in bits, and why length beats complexity',
        p: [
          'Entropy measures how many different passwords could have come out of the same configuration. Each bit doubles that number, so comparing two passwords is direct: 60 bits is a million times harder than 40.',
          'The calculation has two variables, and they do not weigh the same. Increasing the length multiplies the possibilities with every new character; adding a class only widens the base. In practice, a long lowercase password beats a short one full of symbols, and it is easier to type when you have to type it.',
          'The randomness comes from the browser cryptographic generator, not from ordinary JavaScript randomness — which is predictable enough to be reconstructed by someone watching the output. And the draw is uniform, without the bias a remainder operation would introduce: without that care, some characters of the alphabet would come up more often than others, and the entropy printed on screen would be higher than the real one.',
        ],
      },
      {
        h: 'Choosing the length by use',
        p: [
          'For an ordinary account kept in a manager, 20 characters with every class is comfortably enough and you will never type it. For a password that has to be typed on a TV keyboard or dictated over the phone, it pays to raise the length and drop the symbols — the entropy gain compensates and typing errors collapse.',
          'For a manager master password the criterion changes: it has to be memorable and long, and a sequence of random words usually serves better than a block of characters.',
          'One precaution independent of the password itself: a strong password reused across sites becomes a weak one the moment any of them leaks. Generating a new one per signup is worth exactly that.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'An online password generator is the tool where trusting a server makes least sense: you would be asking a third party to draw — and know — the secret that will protect your account. Even with good intentions, a record of that request exists somewhere.',
          'Here the draw happens on your device and nothing is transmitted. The meter at the top of the page stays at zero, and the tool works with the internet switched off — which is also the simplest way to verify that the password went nowhere.',
        ],
      },
    ],
  },
  'remove-exif': {
    pt: [
      {
        h: 'Como remover os metadados de uma foto',
        p: [
          'A ferramenta primeiro MOSTRA o que está escondido no arquivo — modelo da câmera, data, coordenadas de GPS, software usado — e só então remove. Ver antes importa: é o que transforma "acho que não tem nada" em uma decisão informada.',
        ],
        steps: [
          'Solte a foto (JPEG, PNG ou WebP).',
          'Leia o que foi encontrado, especialmente localização e data.',
          'Decida se quer manter a orientação (recomendado para foto de celular).',
          'Baixe a versão limpa.',
        ],
      },
      {
        h: 'A limpeza não recodifica a imagem',
        p: [
          'Esta é a diferença que separa esta ferramenta de quase todas as outras. O caminho comum é abrir a imagem, redesenhá-la e salvar de novo — o que apaga os metadados junto com uma geração de qualidade, destrói o perfil de cor e, em muitos casos, devolve um JPEG com o nome do arquivo original.',
          'Aqui os dados da imagem não são tocados. Em JPEG, os blocos de metadados são retirados e os dados comprimidos da foto são copiados byte a byte. Em PNG, os blocos de texto são removidos — a estrutura do formato permite isso sem recalcular nada. Em WebP, os blocos de EXIF e XMP saem e os campos de tamanho do arquivo são reescritos.',
          'O teste que trava esse comportamento verifica duas coisas ao mesmo tempo: que os pixels decodificados continuam idênticos e que os bytes comprimidos são os mesmos. Só a primeira passaria também numa recodificação de altíssima qualidade — são as duas juntas que provam que nada foi refeito.',
        ],
      },
      {
        h: 'Orientação, e o que fica de fora',
        p: [
          'Foto de celular guarda a orientação como metadado. Remover tudo faz a foto vertical aparecer deitada em muitos programas — é o mesmo efeito de limpar metadados com as ferramentas de linha de comando mais conhecidas. Por isso existe a opção de manter só esse campo: ele é reescrito num bloco de poucas dezenas de bytes que não diz nada sobre câmera, lugar ou data.',
          'Blocos proprietários de fabricante são reportados em tamanho e removidos junto, mas o conteúdo deles não é interpretado — é formato fechado, e ler não muda o resultado, já que a remoção acontece de qualquer jeito.',
          'TIFF é recusado em vez de tratado pela metade. Suporte incompleto num formato assim é pior que ausência: a pessoa acharia que limpou.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'A foto que mais precisa de limpeza é a que carrega coordenadas de GPS de casa, da escola do filho, do endereço do trabalho. Mandá-la para um serviço online para tirar essa informação é entregar exatamente ela, junto com a foto.',
          'Aqui a leitura e a remoção acontecem na aba, sem upload, e o medidor no alto da página fica em zero. Um detalhe da cadeia vale saber: como a limpeza é byte a byte, esta ferramenta só oferece adiante os destinos que não redesenham a imagem — mandá-la para um editor raster desfaria em silêncio o que ela acabou de fazer.',
        ],
      },
    ],
    en: [
      {
        h: 'How to strip the metadata from a photo',
        p: [
          'The tool first SHOWS what is hidden in the file — camera model, date, GPS coordinates, software used — and only then removes it. Seeing first matters: it turns "I do not think there is anything" into an informed decision.',
        ],
        steps: [
          'Drop the photo (JPEG, PNG or WebP).',
          'Read what was found, especially location and date.',
          'Decide whether to keep the orientation (recommended for phone photos).',
          'Download the cleaned version.',
        ],
      },
      {
        h: 'The cleaning does not re-encode the image',
        p: [
          'This is the difference that separates this tool from nearly every other. The common path is to open the image, redraw it and save it again — which erases the metadata along with a generation of quality, destroys the colour profile and, in many cases, hands back a JPEG under the original filename.',
          'Here the image data is never touched. In JPEG, the metadata blocks are taken out and the compressed photo data is copied byte for byte. In PNG, the text blocks are removed — the structure of the format allows that without recomputing anything. In WebP, the EXIF and XMP blocks come out and the file size fields are rewritten.',
          'The test that pins this behaviour checks two things at once: that the decoded pixels are still identical and that the compressed bytes are the same. Only the first would also pass for a very high quality re-encode — it is the two together that prove nothing was remade.',
        ],
      },
      {
        h: 'Orientation, and what is left out',
        p: [
          'Phone photos store their orientation as metadata. Removing everything makes a portrait photo appear sideways in many programs — the same effect as cleaning metadata with the best-known command line tools. So there is an option to keep just that field: it is rewritten in a block of a few dozen bytes that says nothing about camera, place or date.',
          'Vendor-proprietary blocks are reported by size and removed along with the rest, but their content is not interpreted — the format is closed, and reading it would not change the outcome, since removal happens either way.',
          'TIFF is refused rather than half-handled. Incomplete support in a format like that is worse than none: the person would believe it had been cleaned.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'The photo that most needs cleaning is the one carrying GPS coordinates of a home, a child school, a workplace. Sending it to an online service to take that information out means handing over exactly that, along with the photo.',
          'Here the reading and the removal happen in the tab, with no upload, and the meter at the top of the page stays at zero. One chain detail is worth knowing: because the cleaning is byte for byte, this tool only offers onward destinations that do not redraw the image — sending it to a raster editor would silently undo what it just did.',
        ],
      },
    ],
  },
  'redact-image': {
    pt: [
      {
        h: 'Como censurar parte de uma imagem',
        p: [
          'Você arrasta retângulos sobre o que precisa sumir — número de documento, endereço, rosto, valor — e baixa a imagem com essas áreas cobertas. As áreas são marcadas em proporção da imagem, então o resultado é o mesmo independentemente do zoom em que você desenhou.',
        ],
        steps: [
          'Solte a imagem.',
          'Arraste sobre cada trecho que precisa ser coberto.',
          'Use a tarja preta para o que é sigiloso de verdade.',
          'Confira o resultado antes de baixar — o que ficou de fora da tarja continua visível.',
          'Baixe a imagem censurada.',
        ],
      },
      {
        h: 'Tarja preta é garantia; mosaico não é',
        p: [
          'A tarja preta substitui os pixels por preto sólido: a informação que estava ali deixa de existir no arquivo. É irreversível por construção, e é a única opção aqui que oferece garantia.',
          'Mosaico e desfoque parecem mais elegantes e são muito piores. Os dois preservam informação estatística do que estava embaixo, e existem ataques publicados que recuperam conteúdo de baixa entropia a partir dessas máscaras — justamente o tipo de conteúdo que se costuma censurar: um número de documento, um cartão, uma data de nascimento, um valor. Como o conjunto de possibilidades é pequeno, dá para testar todas e comparar com o borrão.',
          'Por isso o preto é o padrão, e o aviso está no painel e não escondido num comentário de código. Se a censura é decorativa (uma foto para rede social), mosaico serve; se é sigilo, tarja.',
        ],
      },
      {
        h: 'O que conferir antes de publicar',
        p: [
          'Reflexo e sobra: crachá refletido no vidro, tela ligada ao fundo, papel debaixo do papel principal. É o vazamento mais comum em foto de documento.',
          'Bordas: um retângulo curto deixa a última letra ou o último dígito aparecendo, e um dígito às vezes basta para confirmar um palpite.',
          'Metadados: a imagem censurada continua com os dados de câmera e localização do original. Se o objetivo é publicar, vale passar por remover metadados depois — os dois passos resolvem coisas diferentes, e é fácil achar que um cobre o outro.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'A imagem que precisa de tarja é, por definição, a que não deveria circular sem tarja — comprovante, documento, contracheque, print de conversa. Mandá-la para um site censurar entrega a versão ORIGINAL, sem tarja, ao servidor.',
          'Aqui a imagem é aberta e reescrita na sua aba, com o medidor no alto da página em zero. Depois da primeira visita, funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to redact part of an image',
        p: [
          'You drag rectangles over whatever has to disappear — an ID number, an address, a face, an amount — and download the image with those areas covered. Areas are marked as proportions of the image, so the result is the same regardless of the zoom you drew at.',
        ],
        steps: [
          'Drop the image.',
          'Drag over each passage that needs covering.',
          'Use the black bar for anything genuinely confidential.',
          'Check the result before downloading — whatever fell outside the bar is still visible.',
          'Download the redacted image.',
        ],
      },
      {
        h: 'A black bar is a guarantee; a mosaic is not',
        p: [
          'The black bar replaces the pixels with solid black: the information that was there stops existing in the file. It is irreversible by construction, and it is the only option here that offers a guarantee.',
          'Mosaic and blur look more elegant and are far worse. Both preserve statistical information about what was underneath, and there are published attacks that recover low-entropy content from such masks — precisely the kind of content people redact: an ID number, a card, a date of birth, an amount. Because the set of possibilities is small, an attacker can try them all and compare against the smear.',
          'So black is the default, and the warning is in the panel rather than hidden in a code comment. If the redaction is decorative (a photo for social media), a mosaic will do; if it is confidentiality, use the bar.',
        ],
      },
      {
        h: 'What to check before publishing',
        p: [
          'Reflections and leftovers: a badge reflected in glass, a screen on in the background, a sheet of paper under the main one. That is the most common leak in photos of documents.',
          'Edges: a rectangle that falls short leaves the last letter or digit showing, and one digit is sometimes enough to confirm a guess.',
          'Metadata: the redacted image still carries the camera and location data of the original. If the goal is to publish, it pays to pass through metadata removal afterwards — the two steps solve different things, and it is easy to assume one covers the other.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'An image that needs a bar is, by definition, one that should not circulate without it — a receipt, a document, a payslip, a screenshot of a conversation. Sending it to a website to be redacted hands the ORIGINAL, unredacted version to the server.',
          'Here the image is opened and rewritten in your tab, with the meter at the top of the page at zero. After the first visit, it works with no internet.',
        ],
      },
    ],
  },
  'redact-pdf': {
    pt: [
      {
        h: 'Como censurar um trecho de PDF',
        p: [
          'Você desenha tarjas sobre o que precisa sumir e a ferramenta gera um PDF novo em que aquele conteúdo não existe mais — não é um retângulo desenhado por cima do texto, é a remoção do texto que estava embaixo.',
        ],
        steps: [
          'Solte o PDF.',
          'Navegue até a página e use o zoom para mirar em letra pequena.',
          'Arraste as tarjas sobre o que precisa ser coberto.',
          'Confira todas as páginas — o que não foi coberto continua no arquivo.',
          'Gere o PDF censurado e baixe.',
        ],
      },
      {
        h: 'Por que a página inteira é rasterizada',
        p: [
          'É assim que documentos "censurados" vazam no mundo real: alguém desenha um retângulo preto sobre o texto e o texto continua no arquivo, selecionável, copiável e recuperável em segundos. O retângulo é só uma camada de desenho.',
          'Para que a remoção seja real, esta ferramenta transforma cada página em imagem e desenha a tarja sobre a imagem. Não sobra objeto de texto nenhum — nem sob a tarja, nem em volta dela.',
          'O preço está declarado no painel, e não escondido: o documento inteiro perde a camada de texto, não só o trecho tarjado. Ele deixa de ser pesquisável e o arquivo fica maior. É a troca que a garantia exige, e por isso a censura deve ser o ÚLTIMO passo — depois dela, editar, extrair texto ou converter para Word já não vão funcionar como antes.',
        ],
      },
      {
        h: 'Onde a censura costuma falhar',
        p: [
          'No que ficou fora da tarja. Nome que aparece de novo no rodapé, número repetido no cabeçalho, assinatura na última página, mesmo dado citado no meio de um parágrafo. Vale ler o documento inteiro procurando o dado, e não só cobrir o lugar óbvio.',
          'Nos metadados. Título, autor e software ficam fora da página e sobrevivem à rasterização — para limpá-los existe a ferramenta de metadados de PDF, que é um passo separado e complementar.',
          'E no arquivo de origem: o PDF original continua no seu computador e continua completo. A censura produz uma cópia; guardar as duas com nomes parecidos é como o arquivo errado acaba sendo enviado.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'O documento que precisa de tarja é o mais sensível que existe no fluxo de qualquer escritório: processo, prontuário, contrato, laudo. Um serviço online recebe a versão íntegra, sem tarja — que é exatamente a que não deveria sair do lugar.',
          'Aqui a rasterização e a montagem do novo PDF acontecem na aba, e o medidor no alto da página fica em zero do começo ao fim.',
        ],
      },
    ],
    en: [
      {
        h: 'How to redact part of a PDF',
        p: [
          'You draw bars over whatever has to disappear and the tool produces a new PDF in which that content no longer exists — not a rectangle drawn over the text, but the removal of the text that was underneath.',
        ],
        steps: [
          'Drop the PDF.',
          'Navigate to the page and use the zoom to aim at small print.',
          'Drag bars over what needs covering.',
          'Check every page — whatever was not covered is still in the file.',
          'Generate the redacted PDF and download it.',
        ],
      },
      {
        h: 'Why the whole page is rasterised',
        p: [
          'This is how "redacted" documents leak in the real world: someone draws a black rectangle over the text and the text stays in the file, selectable, copyable and recoverable in seconds. The rectangle is only a drawing layer.',
          'For the removal to be real, this tool turns every page into an image and draws the bar over the image. No text object is left — neither under the bar nor around it.',
          'The price is stated in the panel rather than hidden: the entire document loses its text layer, not just the redacted passage. It stops being searchable and the file grows. That is the trade the guarantee demands, and it is why redaction should be the LAST step — after it, editing, extracting text or converting to Word will no longer work as before.',
        ],
      },
      {
        h: 'Where redaction usually fails',
        p: [
          'In whatever fell outside the bar. A name that appears again in the footer, a number repeated in the header, a signature on the last page, the same detail quoted mid-paragraph. It pays to read the whole document hunting for the detail, not just to cover the obvious place.',
          'In the metadata. Title, author and software live outside the page and survive rasterisation — the PDF metadata tool exists to clean those, as a separate and complementary step.',
          'And in the source file: the original PDF is still on your computer and still complete. Redaction produces a copy; keeping both under similar names is how the wrong file ends up being sent.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'A document that needs a bar is the most sensitive thing in any office workflow: a case file, a medical record, a contract, a report. An online service receives the intact, unredacted version — precisely the one that should not leave the building.',
          'Here the rasterising and the assembly of the new PDF happen in the tab, and the meter at the top of the page stays at zero from beginning to end.',
        ],
      },
    ],
  },
  'clean-pdf-metadata': {
    pt: [
      {
        h: 'Como limpar os metadados de um PDF',
        p: [
          'Um PDF carrega, fora do conteúdo das páginas, um conjunto de campos que quase ninguém olha: autor, título, assunto, palavras-chave, software que gerou o arquivo, data de criação e de modificação. A ferramenta mostra o que existe e devolve o documento sem esses campos.',
        ],
        steps: [
          'Solte o PDF.',
          'Leia o que foi encontrado — o campo de autor costuma ser o nome de usuário de quem gerou o arquivo.',
          'Gere a versão limpa.',
          'Baixe e confira que o conteúdo das páginas continua igual.',
        ],
      },
      {
        h: 'O que costuma estar escondido lá',
        p: [
          'Autor com nome completo ou login corporativo, porque o campo é preenchido pelo Word, pelo editor ou pelo sistema. Software e versão, que dizem qual ferramenta a empresa usa. Datas de criação e modificação, que revelam quando aquele "documento novo" foi de fato escrito — e às vezes que ele é a mesma proposta que foi enviada a outro cliente semanas antes.',
          'Além do bloco clássico de informações, existe um segundo, em XML, que muitas ferramentas de limpeza esquecem: apagar o primeiro e deixar o segundo faz o autor continuar aparecendo para qualquer um que abra o arquivo com um editor de texto. Aqui os dois são removidos, e o teste que trava isso procura o nome do autor nos bytes DESCOMPRIMIDOS do resultado — porque a compressão interna do PDF esconderia um resto sobrevivente de qualquer busca ingênua.',
          'Uma armadilha específica da biblioteca usada merece registro: ao abrir o arquivo, ela grava o próprio nome no campo de software e atualiza a data de modificação. Um limpador de metadados que assina o próprio trabalho seria a ironia perfeita — e é o comportamento padrão, desligado explicitamente.',
        ],
      },
      {
        h: 'O que a limpeza não faz',
        p: [
          'Não mexe no conteúdo das páginas. Se o seu nome está escrito no cabeçalho do documento, ele continua lá — para isso existe a censura de PDF.',
          'Não remove marca dágua, comentário, anotação nem histórico de revisão, quando existirem como objetos da página.',
          'E não altera o arquivo original: o resultado é uma cópia limpa. Antes de publicar, vale abrir a cópia e conferir as propriedades do documento no seu leitor de PDF — leva dez segundos e é a verificação que fecha o ciclo.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'O caso típico é enviar uma proposta, um currículo ou um documento para fora da empresa. Mandar o arquivo para um site limpar os dados de identificação entrega justamente o arquivo identificado para um terceiro.',
          'Aqui a leitura e a reescrita acontecem na sua aba. O medidor no alto da página fica em zero, e depois da primeira visita a ferramenta funciona sem internet.',
        ],
      },
    ],
    en: [
      {
        h: 'How to clean the metadata from a PDF',
        p: [
          'Beyond the content of its pages, a PDF carries a set of fields almost nobody looks at: author, title, subject, keywords, the software that produced the file, creation and modification dates. The tool shows what is there and hands back the document without those fields.',
        ],
        steps: [
          'Drop the PDF.',
          'Read what was found — the author field is usually the username of whoever produced the file.',
          'Generate the cleaned version.',
          'Download it and check that the page content is unchanged.',
        ],
      },
      {
        h: 'What tends to be hiding in there',
        p: [
          'An author with a full name or a corporate login, because the field is filled in by Word, by the editor or by the system. Software and version, which reveal which tool the company uses. Creation and modification dates, which show when that "new document" was actually written — and sometimes that it is the same proposal sent to another client weeks earlier.',
          'Besides the classic information block there is a second one, in XML, that many cleaning tools forget: deleting the first and leaving the second keeps the author visible to anyone who opens the file in a text editor. Here both are removed, and the test that pins it searches for the author name in the DECOMPRESSED bytes of the result — because the internal compression of a PDF would hide a surviving remnant from any naive search.',
          'One trap specific to the library used deserves recording: on opening the file, it writes its own name into the software field and updates the modification date. A metadata cleaner that signs its own work would be the perfect irony — and that is the default behaviour, explicitly turned off.',
        ],
      },
      {
        h: 'What the cleaning does not do',
        p: [
          'It does not touch the content of the pages. If your name is written in the document header, it is still there — that is what PDF redaction is for.',
          'It does not remove watermarks, comments, annotations or revision history when those exist as page objects.',
          'And it does not alter the original file: the result is a cleaned copy. Before publishing, it pays to open the copy and check the document properties in your PDF reader — it takes ten seconds and it is the check that closes the loop.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'The typical case is sending a proposal, a CV or a document outside the company. Sending the file to a website to have its identifying data cleaned hands exactly the identified file to a third party.',
          'Here the reading and rewriting happen in your tab. The meter at the top of the page stays at zero, and after the first visit the tool works with no internet.',
        ],
      },
    ],
  },
  'diff-checker': {
    pt: [
      {
        h: 'Como comparar dois textos',
        p: [
          'Cole os dois textos, ou carregue dois arquivos, e a comparação aparece linha a linha: o que foi adicionado, o que foi removido e o que ficou igual. Quando os dois são idênticos, a ferramenta diz isso em vez de mostrar um resultado vazio que se confunde com erro.',
        ],
        steps: [
          'Cole o texto original no primeiro campo.',
          'Cole a versão modificada no segundo.',
          'Leia o resultado — as linhas adicionadas e removidas ficam destacadas.',
          'Use a contagem de linhas e caracteres para dimensionar a mudança.',
        ],
      },
      {
        h: 'Onde isso resolve o dia',
        p: [
          'Contrato que voltou "com pequenos ajustes". A comparação mostra em segundos o que mudou de verdade, incluindo a cláusula que ninguém mencionou no e-mail.',
          'Duas versões de um mesmo arquivo de configuração, de log ou de planilha exportada em texto, quando o problema apareceu entre uma e outra.',
          'Texto reescrito por outra pessoa ou por uma ferramenta de escrita: dá para ver exatamente o que foi alterado, em vez de reler tudo desconfiando.',
        ],
      },
      {
        h: 'Como a comparação é feita',
        p: [
          'O algoritmo é o de Myers, o mesmo que ferramentas de controle de versão usam. Ele procura a menor sequência de edições que transforma um texto no outro — é isso que faz uma linha inserida no meio deslocar o resto sem marcar todo o restante como diferente, que é o erro clássico de comparadores simples.',
          'Antes da comparação, o começo e o fim iguais são descartados e as linhas são convertidas em identificadores. Sem esses dois passos, comparar arquivos grandes ficaria lento a ponto de travar a página — com eles, milhares de linhas são comparadas sem trancar a interface.',
          'A comparação é por LINHA. Uma vírgula trocada marca a linha inteira como alterada, o que é o comportamento certo para contrato e configuração; para comparar uma frase palavra a palavra, um texto curto nos dois campos resolve melhor.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Comparadores de texto online são usados justamente com o material mais delicado que passa por um escritório: minuta de contrato, cláusula em negociação, trecho de código, credencial em arquivo de configuração. Tudo isso é colado no formulário de um site, e cai no servidor dele.',
          'Aqui a comparação roda inteira na sua aba, sem nada ser transmitido. O medidor no alto da página fica em zero, e a ferramenta funciona com a internet desligada — que é a forma mais simples de conferir isso.',
        ],
      },
    ],
    en: [
      {
        h: 'How to compare two texts',
        p: [
          'Paste both texts, or load two files, and the comparison appears line by line: what was added, what was removed and what stayed the same. When the two are identical, the tool says so instead of showing an empty result that looks like a failure.',
        ],
        steps: [
          'Paste the original text in the first field.',
          'Paste the modified version in the second.',
          'Read the result — added and removed lines are highlighted.',
          'Use the line and character counts to size up the change.',
        ],
      },
      {
        h: 'Where this saves the day',
        p: [
          'A contract that came back "with minor adjustments". The comparison shows in seconds what actually changed, including the clause nobody mentioned in the email.',
          'Two versions of the same configuration file, log or spreadsheet exported as text, when the problem appeared between one and the other.',
          'Text rewritten by another person or by a writing tool: you can see exactly what was altered, instead of rereading everything suspiciously.',
        ],
      },
      {
        h: 'How the comparison works',
        p: [
          'The algorithm is Myers, the same one version control tools use. It looks for the shortest sequence of edits that turns one text into the other — that is what lets a line inserted in the middle shift the rest without marking everything after it as different, the classic failure of simple comparers.',
          'Before comparing, identical beginnings and endings are discarded and lines are converted into identifiers. Without those two steps, comparing large files would get slow enough to freeze the page — with them, thousands of lines are compared without locking the interface.',
          'The comparison is by LINE. A changed comma marks the whole line as altered, which is the right behaviour for contracts and configuration; to compare a sentence word by word, short text in both fields works better.',
          'Both sides also accept files rather than pasted text — .txt, .md, .json, .csv and source files, up to 10 MB each — which matters when the material is a configuration file or an export nobody wants to open, select and copy by hand. Whatever you load stays in the field, editable, so you can trim the parts that do not matter before comparing.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Online text comparers are used with the most delicate material passing through an office: a draft contract, a clause under negotiation, a snippet of code, a credential in a configuration file. All of it is pasted into a website form and lands on its server.',
          'Here the comparison runs entirely in your tab, with nothing transmitted. The meter at the top of the page stays at zero, and the tool works with the internet switched off — which is the simplest way to check that.',
        ],
      },
    ],
  },
  'qr-code': {
    pt: [
      {
        h: 'Como gerar e ler QR Code offline',
        p: [
          'A mesma tela faz as duas coisas: cria um QR Code a partir do que você digitar e lê um QR Code de uma imagem ou da câmera. O código é gerado no seu aparelho, e a leitura também — nada do conteúdo é enviado para lugar nenhum.',
        ],
        steps: [
          'Escolha o tipo de conteúdo: link, texto, rede Wi-Fi, Pix, contato, e-mail ou WhatsApp.',
          'Preencha os campos. O código é redesenhado a cada alteração.',
          'Ajuste cores, margem e correção de erro se precisar.',
          'Baixe em PNG para uso comum, ou em SVG para impressão em qualquer tamanho.',
          'Para ler: mude para a aba de leitura e solte a imagem do código.',
        ],
      },
      {
        h: 'Correção de erro, logo e impressão',
        p: [
          'Todo QR Code carrega redundância, e o nível dela é escolhido: quanto mais alto, mais dano o código suporta antes de parar de funcionar — e maior ele fica para o mesmo conteúdo. Para tela e para adesivo protegido, o nível baixo basta. Para etiqueta que vai sujar, embalagem que amassa ou cartaz exposto ao tempo, vale subir.',
          'Pôr um logo no meio consome parte dessa redundância, já que o logo cobre módulos do código. Por isso a correção de erro é ajustada junto quando você adiciona um — sem isso, um logo grande transforma um código válido num código que só metade dos aparelhos lê.',
          'Para impressão, escolha SVG: ele é vetor e sai nítido em qualquer tamanho, do cartão de visita ao banner. E respeite a margem branca em volta — leitor nenhum acha o código colado na borda de um fundo colorido.',
        ],
      },
      {
        h: 'Wi-Fi, Pix e por que isso importa',
        p: [
          'Os tipos prontos existem porque cada um tem um formato específico que precisa estar exatamente certo para o celular reconhecer. Um QR de Wi-Fi carrega o nome da rede, o tipo de segurança e a SENHA em texto; um QR de Pix carrega chave, nome, cidade e valor no padrão do arranjo.',
          'Repare no que isso significa: gerar esses códigos num site qualquer é digitar a senha do seu Wi-Fi ou a sua chave Pix no formulário de um terceiro. Não existe versão boa disso — é literalmente entregar o dado para gerar a imagem dele.',
          'Do lado da leitura, o cuidado é o mesmo em qualquer lugar: QR não mostra para onde leva. Ler aqui, ver o conteúdo em texto e só então decidir se vale abrir é mais seguro do que apontar a câmera do banco para um adesivo colado numa maquininha.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Praticamente todo gerador de QR online envia o conteúdo para o servidor — e uma parte deles gera código de redirecionamento, que passa a depender do domínio de terceiro para sempre: se o serviço sair do ar, todos os códigos impressos morrem juntos.',
          'Aqui o código é montado inteiro na sua aba, sem intermediário: o que está no papel é o seu conteúdo, não um endereço de rastreamento. O medidor no alto da página fica em zero, e a ferramenta funciona offline — inclusive na hora de ler.',
        ],
      },
    ],
    en: [
      {
        h: 'How to generate and read QR codes offline',
        p: [
          'The same screen does both: it creates a QR code from whatever you type and reads a QR code from an image or the camera. The code is generated on your device, and so is the reading — none of the content is sent anywhere.',
        ],
        steps: [
          'Choose the content type: link, text, Wi-Fi network, Pix, contact, email or WhatsApp.',
          'Fill in the fields. The code is redrawn on every change.',
          'Adjust colours, margin and error correction if needed.',
          'Download PNG for ordinary use, or SVG to print at any size.',
          'To read: switch to the reading tab and drop the image of the code.',
        ],
      },
      {
        h: 'Error correction, logos and printing',
        p: [
          'Every QR code carries redundancy, and its level is a choice: the higher it goes, the more damage the code survives before failing — and the larger it gets for the same content. For screens and protected stickers, the low level is enough. For labels that will get dirty, packaging that creases or posters left outdoors, it pays to raise it.',
          'Putting a logo in the middle consumes part of that redundancy, since the logo covers modules of the code. That is why error correction is adjusted along with it when you add one — without that, a large logo turns a valid code into one that only half the devices can read.',
          'For printing, choose SVG: it is a vector and stays sharp at any size, from a business card to a banner. And respect the white margin around it — no reader finds a code pressed against the edge of a coloured background.',
        ],
      },
      {
        h: 'Wi-Fi, Pix, and why that matters',
        p: [
          'The ready-made types exist because each has a specific format that has to be exactly right for a phone to recognise it. A Wi-Fi QR carries the network name, the security type and the PASSWORD as text; a Pix QR carries key, name, city and amount in the scheme standard.',
          'Notice what that means: generating those codes on any random website means typing your Wi-Fi password or your Pix key into a third party form. There is no good version of that — it is literally handing over the data in order to get a picture of it.',
          'On the reading side, the caution is the same anywhere: a QR code does not show where it leads. Reading it here, seeing the content as text and only then deciding whether to open it is safer than pointing your banking camera at a sticker glued to a card reader.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Practically every online QR generator sends the content to its server — and some of them produce redirect codes, which then depend on a third-party domain forever: if the service goes down, every printed code dies with it.',
          'Here the code is assembled entirely in your tab, with no intermediary: what is on the paper is your content, not a tracking address. The meter at the top of the page stays at zero, and the tool works offline — including when reading.',
        ],
      },
    ],
  },
  'video-to-gif': {
    pt: [
      {
        h: 'Como transformar um vídeo em GIF',
        p: [
          'Você marca um trecho do vídeo, escolhe largura, quadros por segundo e número de cores, e recebe um GIF animado — sem marca dágua, sem cadastro e sem que o arquivo saia do seu aparelho. O resultado aparece na tela antes do download, então dá para ajustar e refazer.',
        ],
        steps: [
          'Solte o vídeo (MP4, WebM, MOV ou MKV).',
          'Arraste os controles de início e fim para marcar o trecho, de até 30 segundos.',
          'Escolha a largura e os quadros por segundo — são os dois controles que mais mexem no tamanho.',
          'Ajuste as cores e, se o vídeo tiver degradê, experimente ligar o dithering.',
          'Gere, confira o GIF na tela e baixe.',
        ],
      },
      {
        h: 'Por que GIF pesa tanto, e o que realmente diminui',
        p: [
          'O GIF não tem compressão entre quadros. Cada quadro é uma imagem inteira comprimida sozinha, então dois quadros idênticos ocupam o dobro de um. É por isso que esta ferramenta não tem um controle de "qualidade": no GIF, tamanho é contagem de quadros vezes contagem de pixels, e é isso que os controles ajustam.',
          'Em ordem de eficácia: encurtar o trecho, reduzir a largura e baixar os quadros por segundo. Doze por segundo já dão movimento fluido em captura de tela; vinte só valem para movimento rápido de câmera. Reduzir de 256 para 128 cores ajuda, sobretudo em interface chapada, e costuma ser invisível.',
          'O painel mostra quantos quadros vão ser escritos e em que resolução, e NÃO promete um tamanho em megabytes antes de gerar. O motivo é honesto: o peso final depende do conteúdo, porque a compressão do formato lida muito melhor com uma tela chapada do que com uma cena de câmera. Quadros e pixels são exatos; bytes, só depois de escrever.',
        ],
      },
      {
        h: 'A paleta é o que separa um GIF bom de um GIF de 2005',
        p: [
          'O formato guarda no máximo 256 cores por arquivo, então converter um vídeo é, antes de tudo, escolher quais 256. A maioria dos conversores agrupa cores em RGB, onde a mesma distância numérica significa coisas diferentes em cada faixa — o resultado é aquela cor lavada e o degradê em faixas.',
          'Aqui o agrupamento acontece em CIELAB, um espaço em que distância corresponde à diferença que o olho enxerga. É a mesma base de cor que o vetorizador do produto usa. As cores são escolhidas a partir de quadros espalhados pelo trecho inteiro, e não só do primeiro — uma paleta tirada do começo erra inteira quando a cena muda.',
          'E há o caso em que não há perda nenhuma: quando o vídeo tem menos de 256 cores distintas, a paleta é a lista exata delas e a ferramenta diz isso na tela. Vale menos vezes do que parece, e o motivo é o próprio vídeo — a compressão que o gerou espalha variação em volta de cada cor chapada, então uma captura de tela que "tem quatro cores" costuma chegar aqui com milhares. Interface chapada continua sendo o material que melhor se agrupa, mesmo quando a paleta não sai exata.',
          'O dithering é uma troca, não uma melhoria. Ele quebra a faixa do degradê espalhando o erro entre pixels vizinhos, e ao mesmo tempo enche a imagem de ruído fino — que é justamente o que a compressão do GIF não consegue reduzir, e que ainda muda de lugar a cada quadro. Ligado, o arquivo pode mais que dobrar. Vale para vídeo de câmera com céu, pele e sombra; não vale para captura de tela.',
        ],
      },
      {
        h: 'Quando GIF não é o formato certo',
        p: [
          'Para qualquer coisa acima de meio minuto, ou com som, o formato certo continua sendo o vídeo. Um MP4 de trinta segundos pesa uma fração de um GIF equivalente e toca em todo lugar. GIF ganha em três situações específicas: onde vídeo não é aceito, onde ele precisa tocar sozinho em repetição sem controles, e onde a imagem precisa aparecer inteira dentro de um comentário — ticket, pull request, chat, documentação.',
          'Se o objetivo é só mostrar um erro para o time, considere também mandar o vídeo direto: a ferramenta de gravar tela do produto entrega um arquivo pronto, e a conversão para GIF é um passo a mais que só existe por causa do destino.',
          'E se o que você quer é um quadro parado, não precisa de GIF: use PDF para imagem se for documento, ou tire a foto da tela mesmo.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'Praticamente todo conversor de vídeo para GIF é um serviço pago disfarçado: ou impõe marca dágua, ou limita a duração, ou pede cadastro — e os três existem pelo mesmo motivo, que é o vídeo estar sendo processado no servidor de alguém. Você entrega o arquivo inteiro para receber de volta uma versão carimbada.',
          'Aqui o vídeo é lido pelo próprio navegador, os quadros são desenhados numa tela em memória e o GIF é escrito byte a byte na mesma aba. O medidor no alto da página conta bytes de arquivo saindo e fica em zero do começo ao fim, e depois da primeira visita tudo funciona com a internet desligada.',
          'Isso importa mais do que parece nesta ferramenta em particular: o vídeo que mais vira GIF é gravação de tela — com sistema interno, dados de cliente, nome de arquivo e aba aberta à vista. É exatamente o material que não deveria subir para um site gratuito em troca de uma animação.',
        ],
      },
    ],
    en: [
      {
        h: 'How to turn a video into a GIF',
        p: [
          'You mark a stretch of the video, choose the width, the frames per second and the number of colours, and get an animated GIF — with no watermark, no signup and without the file leaving your device. The result appears on screen before the download, so you can adjust and redo it.',
        ],
        steps: [
          'Drop the video (MP4, WebM, MOV or MKV).',
          'Drag the start and end controls to mark the stretch, up to 30 seconds.',
          'Choose the width and the frames per second — the two controls that most affect size.',
          'Adjust the colours and, if the video has gradients, try turning dithering on.',
          'Generate, check the GIF on screen and download it.',
        ],
      },
      {
        h: 'Why GIFs are so heavy, and what actually shrinks them',
        p: [
          'GIF has no compression between frames. Each frame is a whole image compressed on its own, so two identical frames take twice the space of one. That is why this tool has no "quality" control: in GIF, size is frame count times pixel count, and that is what the controls adjust.',
          'In order of effectiveness: shorten the stretch, lower the width, reduce the frames per second. Twelve per second already looks fluid for screen capture; twenty is only worth it for fast camera motion. Dropping from 256 to 128 colours helps as well, especially on flat interface content, and is usually invisible.',
          'The panel shows how many frames will be written and at what resolution, and does NOT promise a size in megabytes beforehand. The reason is honest: the final weight depends on the content, because the compression in the format handles a flat screen far better than a camera scene. Frames and pixels are exact; bytes, only after writing.',
        ],
      },
      {
        h: 'The palette is what separates a good GIF from a 2005 one',
        p: [
          'The format holds at most 256 colours per file, so converting a video is first of all choosing which 256. Most converters cluster colours in RGB, where the same numeric distance means different things in different ranges — the result is that washed-out look and banded gradients.',
          'Here the clustering happens in CIELAB, a space where distance matches the difference the eye sees. It is the same colour foundation the product vectoriser uses. Colours are chosen from frames spread across the whole stretch, not just the first one — a palette taken from the beginning is completely wrong once the scene changes.',
          'And there is the case with no loss at all: when the video has fewer than 256 distinct colours, the palette is the exact list of them and the tool says so on screen. It happens less often than it sounds, and the reason is the video itself — the compression that produced it scatters variation around every flat colour, so a screen capture that "has four colours" usually arrives here with thousands. Flat interface content is still the material that clusters best, even when the palette does not come out exact.',
          'Dithering is a trade, not an improvement. It breaks gradient banding by spreading the error between neighbouring pixels, and at the same time fills the image with fine noise — precisely what GIF compression cannot reduce, and which moves around from frame to frame. Turned on, the file can more than double. It is worth it for camera footage with sky, skin and shadow; it is not for screen capture.',
        ],
      },
      {
        h: 'When GIF is the wrong format',
        p: [
          'For anything over half a minute, or with sound, the right format is still video. A thirty-second MP4 weighs a fraction of an equivalent GIF and plays everywhere. GIF wins in three specific situations: where video is not accepted, where it has to loop on its own without controls, and where the image has to appear inline inside a comment — a ticket, a pull request, a chat, documentation.',
          'If the goal is only to show a bug to your team, consider sending the video instead: the screen recorder in this product hands back a ready file, and converting to GIF is an extra step that only exists because of the destination.',
          'And if what you want is a still frame, you do not need a GIF: use PDF to image for a document, or simply take a screenshot.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'Practically every video-to-GIF converter is a paid service in disguise: it either stamps a watermark, or caps the duration, or asks for a signup — and all three exist for the same reason, which is that the video is being processed on somebody server. You hand over the whole file to get back a branded version.',
          'Here the video is read by the browser itself, the frames are drawn onto an in-memory canvas, and the GIF is written byte by byte in the same tab. The meter at the top of the page counts file bytes leaving and stays at zero from beginning to end, and after the first visit everything works with the internet switched off.',
          'That matters more than usual in this particular tool: the video most often turned into a GIF is a screen recording — with internal systems, client data, filenames and open tabs in view. It is exactly the material that should not be uploaded to a free website in exchange for an animation.',
        ],
      },
    ],
  },
  'video-to-frames': {
    pt: [
      {
        h: 'Como tirar um quadro de um vídeo',
        p: [
          'O player da própria página é o controle: você para no quadro que interessa e captura. A imagem sai na resolução do vídeo, lida do arquivo — não é uma foto da tela, não tem barra de controle no meio e não depende do tamanho da sua janela.',
        ],
        steps: [
          'Solte o vídeo (MP4, WebM, MOV ou MKV).',
          'Use o player para parar exatamente no quadro que você quer.',
          'Escolha o formato: PNG para tela e texto, JPG para cena de câmera.',
          'Capture e confira a imagem antes de baixar.',
          'Para vários quadros, troque o modo e escolha o intervalo — o resultado vem num zip.',
        ],
      },
      {
        h: 'Um quadro ou um contato de folha',
        p: [
          'O modo de quadro único resolve o caso comum: a capa de um vídeo, o print de um erro que aparece por meio segundo, o momento que ninguém fotografou porque só havia a filmagem. Como o instante vem do player, não é preciso saber em que segundo aquilo acontece — basta parar ali.',
          'O modo de intervalo percorre o vídeo inteiro e salva um quadro a cada meio segundo, um, dois, cinco ou dez. É o contato de folha: dá para escolher a melhor imagem depois, com calma, sem voltar ao vídeo. Serve também para documentar um passo a passo e para conferir se algo aparece em algum ponto da gravação.',
          'O teto é de 100 quadros, e ele é de memória: o zip é montado inteiro na RAM da aba, com todas as imagens já codificadas dentro. Por isso o painel mostra quantos quadros o intervalo escolhido produz ANTES de rodar, e a ferramenta pede um intervalo maior em vez de travar no meio do trabalho.',
        ],
      },
      {
        h: 'Formato, tamanho e o que esperar da nitidez',
        p: [
          'PNG é sem perda: letras, interface e traço saem exatamente como estão no quadro. É o formato certo para gravação de tela, e é o padrão aqui por isso. JPG fica muito mais leve em cena de câmera, onde a perda não aparece, e a diferença importa quando são dezenas de imagens no mesmo zip. WebP fica menor que os dois com qualidade parecida.',
          'A largura padrão é a do próprio vídeo. Reduzir só faz sentido quando o destino é web ou quando o zip precisa caber num anexo — ampliar não é oferecido, porque não há detalhe a acrescentar.',
          'Uma expectativa que vale ajustar: um quadro isolado de vídeo comprimido nem sempre é tão nítido quanto uma foto. A compressão de vídeo guarda alguns quadros inteiros e descreve os outros como diferença em relação a eles, então cena com movimento rápido produz quadro mais borrado. Isso vem do arquivo de origem, e nenhuma ferramenta recupera o que o codificador jogou fora — inclusive esta.',
        ],
      },
      {
        h: 'Onde isso se encaixa no resto',
        p: [
          'O quadro sai como imagem e entra na cadeia do módulo de imagem: dá para seguir direto para cortar, comprimir, redimensionar, remover fundo ou censurar, sem baixar e subir de novo. Capturar o quadro de uma gravação de tela e tarjar um dado sensível antes de mandar para o time é um caminho de dois cliques.',
          'Quando são vários quadros, a saída é um zip — e a ferramenta avisa a barra de ações sobre isso, porque oferecer "cortar imagem" para um arquivo compactado seria pior do que não oferecer nada.',
          'Se o que você quer é movimento e não um instante, a ferramenta ao lado transforma o mesmo trecho em GIF animado. As duas leem os quadros pela mesma máquina; muda o destino.',
        ],
      },
      {
        h: 'Por que fazer isso no navegador',
        p: [
          'A alternativa de sempre é a tecla de print: ela captura a janela, com barra de controle por cima, na resolução da tela e não na do vídeo. A outra alternativa é subir o arquivo para um site — um vídeo inteiro, de centenas de megabytes, para receber de volta uma imagem.',
          'Aqui o vídeo é lido pelo próprio navegador e o quadro é desenhado num canvas dentro da aba. O medidor no alto da página conta bytes de arquivo saindo e fica em zero durante toda a extração, e depois da primeira visita a ferramenta funciona com a internet desligada.',
          'Isso importa especialmente pelo tipo de vídeo que costuma passar por aqui: gravação de reunião, captura de tela com sistema interno à vista, filmagem pessoal. É material que não deveria virar upload em troca de uma imagem.',
        ],
      },
    ],
    en: [
      {
        h: 'How to take a frame out of a video',
        p: [
          'The player on the page is the control: you land on the frame you want and capture it. The image comes out at the resolution of the video, read from the file — it is not a screenshot, it has no control bar across it, and it does not depend on the size of your window.',
        ],
        steps: [
          'Drop the video (MP4, WebM, MOV or MKV).',
          'Use the player to land exactly on the frame you want.',
          'Choose the format: PNG for screens and text, JPG for camera footage.',
          'Capture and check the image before downloading.',
          'For several frames, switch the mode and pick an interval — the result comes back as a zip.',
        ],
      },
      {
        h: 'One frame, or a contact sheet',
        p: [
          'Single-frame mode covers the common case: a video cover, a screenshot of an error that shows for half a second, the moment nobody photographed because there was only the recording. Because the instant comes from the player, you do not need to know which second it happens at — you just stop there.',
          'Interval mode walks the whole video and saves a frame every half second, one, two, five or ten. It is a contact sheet: you can pick the best image afterwards, at your own pace, without going back to the video. It also works for documenting a step-by-step and for checking whether something appears anywhere in the recording.',
          'The ceiling is 100 frames, and it is about memory: the zip is assembled entirely in the RAM of the tab, with every image already encoded inside. That is why the panel shows how many frames the chosen interval produces BEFORE you run it, and why the tool asks for a longer interval instead of freezing mid-job.',
        ],
      },
      {
        h: 'Format, size, and what to expect of sharpness',
        p: [
          'PNG is lossless: letters, interfaces and line work come out exactly as they are in the frame. It is the right format for screen recordings, and that is why it is the default here. JPG is much lighter for camera footage, where the loss does not show, and the difference matters when there are dozens of images in the same zip. WebP lands smaller than both at similar quality.',
          'The default width is the one the video has. Reducing only makes sense when the destination is the web or when the zip has to fit an attachment — enlarging is not offered, because there is no detail to add.',
          'One expectation worth adjusting: a single frame from compressed video is not always as sharp as a photograph. Video compression stores some frames whole and describes the others as differences from them, so fast motion produces blurrier frames. That comes from the source file, and no tool recovers what the encoder threw away — this one included.',
        ],
      },
      {
        h: 'Where this fits with the rest',
        p: [
          'The frame comes out as an image and joins the image module chain: you can go straight on to crop, compress, resize, remove the background or redact, with no download and re-upload in between. Capturing a frame from a screen recording and blacking out a sensitive detail before sending it to your team is a two-click path.',
          'When there are several frames the output is a zip — and the tool tells the action bar so, because offering "crop image" for an archive would be worse than offering nothing.',
          'If what you want is motion rather than an instant, the tool next door turns the same stretch into an animated GIF. Both read frames through the same machinery; only the destination differs.',
        ],
      },
      {
        h: 'Why do this in the browser',
        p: [
          'The usual alternative is the print key: it captures the window, with the control bar on top, at screen resolution rather than video resolution. The other alternative is uploading the file to a website — a whole video, hundreds of megabytes, to get one image back.',
          'Here the video is read by the browser itself and the frame is drawn onto a canvas inside the tab. The meter at the top of the page counts file bytes leaving and stays at zero for the whole extraction, and after the first visit the tool works with the internet switched off.',
          'That matters especially given the kind of video that passes through here: meeting recordings, screen captures with internal systems in view, personal footage. It is material that should not become an upload in exchange for a picture.',
        ],
      },
    ],
  },
};
