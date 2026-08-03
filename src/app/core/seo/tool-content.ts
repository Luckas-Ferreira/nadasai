import type { ToolId } from '../tools/tools';

/**
 * Long-form, per-tool copy: the FAQ that renders below a tool AND the source
 * the FAQPage markup is built from.
 *
 * WHY THIS IS NOT IN THE TRANSLATION DICTIONARY. Two reasons, and the second is
 * the decisive one:
 *
 *  - 31 tools x 4 Q&A x 2 keys x 2 languages is ~500 new keys, on a file that
 *    already holds ~630 per language.
 *  - Both dictionaries are static consts in a root-provided service, so they
 *    sit in the INITIAL bundle. This file is reached only from FaqComponent,
 *    which is reached only from ToolPageComponent, which is reached only from
 *    31 lazy routes — so esbuild puts it in a lazy chunk and it costs the home
 *    page nothing.
 *
 * The parity guarantee is not lost: `tool-content.spec.ts` asserts that every
 * entry has both languages and the same number of questions in each.
 *
 * COVERAGE IS DELIBERATELY PARTIAL. A tool with no entry here falls back to the
 * generic set, and the spec reports which tools are still missing rather than
 * letting the gap go unnoticed. Writing four *specific* answers per tool is the
 * whole point — four generic privacy answers repeated 31 times is thin
 * duplicate content, which is worse than none.
 */

export interface FaqEntry {
  readonly q: string;
  readonly a: string;
}

export interface LocalizedContent {
  readonly faq: readonly FaqEntry[];
  /** Feeds the per-tool SoftwareApplication node's featureList. */
  readonly features: readonly string[];
}

export type ToolContent = { readonly pt: LocalizedContent; readonly en: LocalizedContent };

export const TOOL_CONTENT: Partial<Record<ToolId, ToolContent>> = {
  'encrypt-file': {
    pt: {
      features: ['AES-256-GCM', 'PBKDF2', 'Qualquer formato de arquivo', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como criptografar um arquivo com senha?',
          a: 'Solte o arquivo, escolha "Criptografar", digite uma senha e baixe o arquivo .enc. Para abrir depois, solte o .enc de volta na mesma ferramenta, escolha "Descriptografar" e informe a mesma senha. O nome e o tipo do arquivo original ficam guardados dentro do envelope, então ele volta com o nome certo.',
        },
        {
          q: 'Que criptografia é usada?',
          a: 'AES-256 no modo GCM, com a chave derivada da sua senha por PBKDF2-SHA256. O GCM é autenticado, ou seja, ele também detecta se o arquivo foi alterado — por isso senha errada e arquivo corrompido produzem exatamente a mesma falha: a verificação é um único sim ou não.',
        },
        {
          q: 'Perdi a senha. Dá para recuperar o arquivo?',
          a: 'Não, e isso não é uma limitação da ferramenta — é o que criptografia significa. A senha nunca sai do seu navegador e não existe cópia dela em lugar nenhum, então não há a quem pedir. Guarde a senha antes de fechar a aba.',
        },
        {
          q: 'Qual o tamanho máximo?',
          a: '256 MB. O limite existe porque o navegador precisa segurar o arquivo aberto, o arquivo cifrado e o envelope montado na memória ao mesmo tempo.',
        },
      ],
    },
    en: {
      features: ['AES-256-GCM', 'PBKDF2', 'Any file format', 'Never uploaded'],
      faq: [
        {
          q: 'How do I password-protect a file?',
          a: 'Drop the file, pick "Encrypt", type a password and download the .enc file. To open it later, drop that .enc back into the same tool, pick "Decrypt" and give the same password. The original name and type are stored inside the envelope, so the file comes back correctly named.',
        },
        {
          q: 'What encryption is used?',
          a: 'AES-256 in GCM mode, with the key derived from your password using PBKDF2-SHA256. GCM is authenticated, so it also detects tampering — which is why a wrong password and a damaged file produce exactly the same failure: the check is a single yes or no.',
        },
        {
          q: 'I lost the password. Can the file be recovered?',
          a: 'No, and that is not a limitation of the tool — it is what encryption means. The password never leaves your browser and no copy of it exists anywhere, so there is nobody to ask. Save the password before you close the tab.',
        },
        {
          q: 'What is the size limit?',
          a: '256 MB. The limit exists because the browser has to hold the plaintext, the ciphertext and the assembled envelope in memory at the same time.',
        },
      ],
    },
  },

  'remove-exif': {
    pt: {
      features: ['GPS e câmera', 'Sem reencodar', 'JPEG, PNG, WebP', 'Mostra o que encontrou'],
      faq: [
        {
          q: 'Fotos guardam mesmo a localização?',
          a: 'Guardam, se o GPS estava ligado. As coordenadas ficam no bloco EXIF com precisão suficiente para identificar uma casa. A ferramenta mostra as coordenadas encontradas antes de remover, para você ver por conta própria em vez de acreditar na promessa.',
        },
        {
          q: 'Remover os metadados piora a qualidade da foto?',
          a: 'Não. Os dados comprimidos da imagem são copiados byte a byte — nada é decodificado nem recomprimido. Só os blocos de metadados saem do arquivo. É por isso que a ferramenta aceita JPEG, PNG e WebP e devolve o mesmo formato que entrou.',
        },
        {
          q: 'O que é a miniatura embutida?',
          a: 'Muitas câmeras gravam uma segunda cópia reduzida da foto dentro do próprio arquivo. Vários editores atualizam os pixels e esquecem essa miniatura, então uma foto recortada ou censurada pode ainda carregar o original lá dentro. A ferramenta avisa quando encontra uma, e ela é removida junto.',
        },
        {
          q: 'Por que manter a tag de orientação?',
          a: 'Porque sem ela uma foto tirada em pé aparece deitada em qualquer visualizador. É um único número que diz para que lado fica o topo — não revela câmera, lugar nem data. Dá para desmarcar a opção se você preferir remover absolutamente tudo.',
        },
      ],
    },
    en: {
      features: ['GPS and camera data', 'No re-encoding', 'JPEG, PNG, WebP', 'Shows what it found'],
      faq: [
        {
          q: 'Do photos really store my location?',
          a: 'They do, if GPS was on. The coordinates sit in the EXIF block, precise enough to identify a house. This tool shows you the coordinates it found before removing them, so you can see for yourself rather than take the promise on trust.',
        },
        {
          q: 'Does stripping metadata reduce image quality?',
          a: 'No. The compressed image data is copied byte for byte — nothing is decoded or recompressed. Only the metadata blocks leave the file. That is why the tool accepts JPEG, PNG and WebP and gives back the same format you put in.',
        },
        {
          q: 'What is the embedded thumbnail?',
          a: 'Many cameras write a second, smaller copy of the photo inside the file itself. Plenty of editors update the pixels and forget that thumbnail, so a cropped or redacted photo can still be carrying the original inside it. The tool warns you when it finds one, and removes it along with everything else.',
        },
        {
          q: 'Why keep the orientation tag?',
          a: 'Because without it a photo shot in portrait displays sideways in every viewer. It is a single number saying which way is up — it reveals no camera, place or date. You can untick the option if you would rather remove absolutely everything.',
        },
      ],
    },
  },

  'redact-image': {
    pt: {
      features: ['Tarja preta irreversível', 'Pixelização', 'Queimado nos pixels', 'Offline'],
      faq: [
        {
          q: 'A tarja pode ser removida depois?',
          a: 'A tarja preta, não. Os pixels que estavam ali são substituídos por preto no arquivo exportado — não existe uma camada por cima que alguém possa apagar, como acontece quando se desenha um retângulo no Word ou no PowerPoint e se exporta em PDF.',
        },
        {
          q: 'Pixelizar é tão seguro quanto a tarja preta?',
          a: 'Não, e vale dizer isso claramente: existem ataques publicados que recuperam texto pixelizado quando o conteúdo é curto e previsível, como um CPF ou o número de um cartão. Para esses casos use a tarja preta. A pixelização serve para rostos, onde o objetivo é não identificar e não há como testar todas as possibilidades.',
        },
        {
          q: 'Como censurar um CPF numa foto de documento?',
          a: 'Arraste sobre o número com o modo "Tarja Preta" ativo, confira a cobertura e baixe. Cada tarja pode ser removida pelo X no canto se você errar o enquadramento.',
        },
        {
          q: 'A foto perde qualidade?',
          a: 'A imagem é redesenhada em resolução natural e exportada no mesmo formato de entrada, então não há redução de tamanho. Um JPEG passa por uma reencodificação, o que é inerente a alterar os pixels de um formato com perdas.',
        },
      ],
    },
    en: {
      features: ['Irreversible black bar', 'Pixelation', 'Burned into pixels', 'Offline'],
      faq: [
        {
          q: 'Can the black bar be removed afterwards?',
          a: 'Not the black bar. The pixels that were there are replaced with black in the exported file — there is no layer on top for anyone to delete, which is what happens when you draw a rectangle in Word or PowerPoint and export to PDF.',
        },
        {
          q: 'Is pixelation as safe as a black bar?',
          a: 'No, and that is worth saying plainly: there are published attacks that recover pixelated text when the content is short and predictable, such as an ID or a card number. Use a black bar for those. Pixelation is for faces, where the goal is not identifying someone and there is no small set of possibilities to test.',
        },
        {
          q: 'How do I hide an ID number in a photo of a document?',
          a: 'Drag over the number with "Black Bar" selected, check the coverage and download. Each box can be removed with the X in its corner if you misjudge the framing.',
        },
        {
          q: 'Does the photo lose quality?',
          a: 'The image is redrawn at its natural resolution and exported in the same format it came in, so there is no downsizing. A JPEG goes through one re-encode, which is inherent to changing pixels in a lossy format.',
        },
      ],
    },
  },

  'redact-pdf': {
    pt: {
      features: ['Texto destruído', 'Várias páginas', 'PDF com senha', 'Offline'],
      faq: [
        {
          q: 'Por que não basta desenhar um retângulo preto no PDF?',
          a: 'Porque um retângulo é apenas mais um objeto desenhado por cima. O texto continua no arquivo e sai inteiro num copiar e colar, num extrator de texto ou num simples `strings`. Foi assim que documentos judiciais e diplomáticos "tarjados" vazaram. Aqui a página é reconstruída como imagem, então os objetos de texto deixam de existir.',
        },
        {
          q: 'O PDF continua pesquisável depois?',
          a: 'Não, e essa é a troca. Como todas as páginas viram imagem, o documento inteiro perde a camada de texto — não só o trecho tarjado. É o custo de uma censura que não dá para desfazer, e o painel avisa antes de você exportar.',
        },
        {
          q: 'Funciona com PDF protegido por senha?',
          a: 'Sim. Se o arquivo pedir senha, a ferramenta mostra o campo, abre o documento com ela e usa a mesma senha em todas as etapas seguintes.',
        },
        {
          q: 'Dá para tarjar páginas diferentes?',
          a: 'Sim. Cada página guarda as próprias tarjas — navegue entre elas e desenhe onde precisar antes de exportar uma única vez.',
        },
      ],
    },
    en: {
      features: ['Text destroyed', 'Multi-page', 'Password-protected PDFs', 'Offline'],
      faq: [
        {
          q: 'Why is drawing a black rectangle on a PDF not enough?',
          a: 'Because a rectangle is just another object drawn on top. The text is still in the file and comes straight out through copy-paste, a text extractor, or plain `strings`. That is how "redacted" court and diplomatic documents have leaked. Here the page is rebuilt as an image, so the text objects stop existing.',
        },
        {
          q: 'Is the PDF still searchable afterwards?',
          a: 'No, and that is the trade. Because every page becomes an image, the whole document loses its text layer — not only the redacted part. That is the cost of a redaction that cannot be undone, and the panel says so before you export.',
        },
        {
          q: 'Does it work with password-protected PDFs?',
          a: 'Yes. If the file asks for a password the tool shows the prompt, opens the document with it, and reuses that password for every later step.',
        },
        {
          q: 'Can I redact different pages?',
          a: 'Yes. Each page keeps its own boxes — move between pages, draw where you need to, and export once at the end.',
        },
      ],
    },
  },

  'clean-pdf-metadata': {
    pt: {
      features: ['Autor e software', 'Bloco XMP', 'Dados por página', 'Offline'],
      faq: [
        {
          q: 'Que informação um PDF carrega sem eu saber?',
          a: 'Normalmente o autor, o software que gerou o arquivo, as datas de criação e modificação e um bloco XMP. Programas como Illustrator e InDesign ainda gravam dados por página que costumam incluir o caminho local do arquivo e o nome de usuário do computador. A ferramenta lista tudo o que encontrou antes de remover.',
        },
        {
          q: 'O conteúdo do documento muda?',
          a: 'Não. As páginas, o texto e as imagens ficam exatamente como estavam — só os campos de metadados saem. O arquivo continua pesquisável e selecionável, ao contrário do que acontece na censura de PDF.',
        },
        {
          q: 'A remoção é definitiva ou só esconde?',
          a: 'Definitiva. Não basta apagar a referência: o objeto continuaria registrado no arquivo e o nome do autor ainda apareceria num `strings`. A ferramenta remove o objeto do documento, e há um teste automatizado que procura o nome original nos bytes da saída para garantir isso.',
        },
        {
          q: 'O que não é alcançado?',
          a: 'Metadados dentro de imagens embutidas — uma página escaneada mantém o EXIF do próprio JPEG — e o identificador do arquivo. Para o primeiro caso, limpe as imagens antes de montar o PDF.',
        },
      ],
    },
    en: {
      features: ['Author and software', 'XMP block', 'Per-page data', 'Offline'],
      faq: [
        {
          q: 'What does a PDF carry without me knowing?',
          a: 'Usually the author, the software that produced it, creation and modification dates, and an XMP block. Programs like Illustrator and InDesign also write per-page application data that routinely includes the local file path and the computer\'s username. The tool lists everything it found before removing any of it.',
        },
        {
          q: 'Does the document content change?',
          a: 'No. The pages, text and images stay exactly as they were — only the metadata fields go. The file remains searchable and selectable, unlike what happens with PDF redaction.',
        },
        {
          q: 'Is the removal permanent, or does it just hide the data?',
          a: 'Permanent. Deleting the reference is not enough: the object would stay registered in the file and the author\'s name would still show up in `strings`. The tool removes the object from the document, and an automated test greps the output bytes for the original name to keep it that way.',
        },
        {
          q: 'What is not covered?',
          a: 'Metadata inside embedded images — a scanned page keeps its own JPEG\'s EXIF — and the file identifier. For the first case, clean the images before assembling the PDF.',
        },
      ],
    },
  },

  'password-generator': {
    pt: {
      features: ['CSPRNG do navegador', 'Entropia real', 'Até 128 caracteres', 'Sem rede'],
      faq: [
        {
          q: 'As senhas geradas aqui são seguras?',
          a: 'Elas vêm de crypto.getRandomValues, o gerador criptográfico do próprio navegador, com amostragem por rejeição para não haver viés entre os caracteres. Nada é enviado, registrado ou guardado: feche a aba e a senha deixa de existir em qualquer lugar exceto onde você a colou.',
        },
        {
          q: 'O que significa o número de entropia?',
          a: 'É quantos bits de aleatoriedade a senha tem, calculado a partir do tamanho e do conjunto de caracteres realmente usado. Cada bit dobra o esforço de um ataque por força bruta. Abaixo de 40 bits é fraco; acima de 90 é inquebrável na prática.',
        },
        {
          q: 'Senha longa ou senha complicada?',
          a: 'Longa. Cada caractere a mais multiplica o espaço de busca pelo tamanho do alfabeto, enquanto trocar letras por símbolos parecidos acrescenta pouco e piora muito a memorização e a digitação.',
        },
        {
          q: 'Todos os tipos marcados aparecem mesmo na senha?',
          a: 'Sim. A ferramenta garante ao menos um caractere de cada categoria selecionada antes de embaralhar o resto, porque muitas políticas corporativas exigem isso — e porque, sem essa garantia, o número de entropia exibido estaria superestimando.',
        },
      ],
    },
    en: {
      features: ['Browser CSPRNG', 'Real entropy figure', 'Up to 128 characters', 'No network'],
      faq: [
        {
          q: 'Are the passwords generated here safe?',
          a: 'They come from crypto.getRandomValues, the browser\'s own cryptographic generator, with rejection sampling so no character is favoured over another. Nothing is sent, logged or stored: close the tab and the password stops existing anywhere except where you pasted it.',
        },
        {
          q: 'What does the entropy number mean?',
          a: 'It is how many bits of randomness the password has, computed from its length and the character set actually in use. Each bit doubles the work of a brute-force attack. Under 40 bits is weak; over 90 is unbreakable in practice.',
        },
        {
          q: 'Long password or complicated password?',
          a: 'Long. Every extra character multiplies the search space by the size of the alphabet, while swapping letters for lookalike symbols adds very little and makes the password much harder to remember and type.',
        },
        {
          q: 'Does every ticked character type actually appear?',
          a: 'Yes. The tool guarantees at least one character from each selected category before shuffling the rest, because many corporate policies require it — and because without that guarantee the entropy figure shown would be overstating things.',
        },
      ],
    },
  },

  'file-hash': {
    pt: {
      features: ['SHA-256, SHA-512, MD5', 'Lido em partes', 'Verificação de checksum', 'Offline'],
      faq: [
        {
          q: 'Para que serve o hash de um arquivo?',
          a: 'Para conferir se um download chegou íntegro e é exatamente o arquivo que o autor publicou. Você compara o hash calculado aqui com o que o site oficial divulga: se bater, os bytes são idênticos; se não bater, algo mudou no caminho.',
        },
        {
          q: 'Posso colar o checksum direto do arquivo .sha256sum?',
          a: 'Pode. Aquele formato traz o hash seguido do nome do arquivo, e a ferramenta ignora o resto da linha automaticamente. Ela também informa qual dos algoritmos foi o que bateu.',
        },
        {
          q: 'Qual algoritmo escolher?',
          a: 'SHA-256 para qualquer verificação séria. MD5 continua aqui porque muitos sites antigos ainda publicam só ele, mas não serve mais para segurança — é possível fabricar dois arquivos diferentes com o mesmo MD5.',
        },
        {
          q: 'Existe limite de tamanho?',
          a: 'SHA-256 e MD5 são lidos em pedaços de 4 MB, então funcionam com arquivos de qualquer tamanho e mostram progresso real. SHA-512 precisa ler o arquivo inteiro de uma vez e por isso fica limitado a 512 MB e é opcional.',
        },
      ],
    },
    en: {
      features: ['SHA-256, SHA-512, MD5', 'Read in chunks', 'Checksum verification', 'Offline'],
      faq: [
        {
          q: 'What is a file hash for?',
          a: 'To check that a download arrived intact and is exactly the file the author published. You compare the hash computed here with the one the official site lists: if they match, the bytes are identical; if not, something changed along the way.',
        },
        {
          q: 'Can I paste a checksum straight from a .sha256sum file?',
          a: 'Yes. That format puts the hash first and the filename after it, and the tool ignores the rest of the line automatically. It also tells you which algorithm matched.',
        },
        {
          q: 'Which algorithm should I use?',
          a: 'SHA-256 for any serious verification. MD5 is still here because plenty of older sites publish only that, but it is no longer fit for security — two different files can be constructed with the same MD5.',
        },
        {
          q: 'Is there a size limit?',
          a: 'SHA-256 and MD5 are read in 4 MB chunks, so they work on files of any size and show real progress. SHA-512 has to read the whole file at once, so it is capped at 512 MB and is opt-in.',
        },
      ],
    },
  },

  'encrypt-text': {
    pt: {
      features: ['AES-256-GCM', 'Bloco para colar', 'Compatível com o .enc', 'Offline'],
      faq: [
        {
          q: 'Como enviar uma mensagem criptografada?',
          a: 'Escreva o texto, defina uma senha e copie o bloco gerado. Ele é só texto, então passa por e-mail, chat ou qualquer campo de formulário sem se corromper. Quem receber cola o bloco aqui, informa a mesma senha e lê a mensagem.',
        },
        {
          q: 'E se o aplicativo quebrar as linhas do bloco?',
          a: 'Não tem problema. A leitura tolera quebras de linha diferentes, espaços a mais, texto em volta e até a ausência das linhas de início e fim — o conteúdo continua recuperável.',
        },
        {
          q: 'Como combino a senha com a outra pessoa?',
          a: 'Por um canal diferente daquele em que a mensagem vai. Mandar o bloco e a senha na mesma conversa anula a proteção, porque quem lê um lê o outro.',
        },
        {
          q: 'É o mesmo formato da criptografia de arquivos?',
          a: 'É o mesmo envelope, apenas convertido para texto. O conteúdo de um arquivo .enc pode ser colado aqui e vice-versa — existe uma implementação de criptografia só, não duas.',
        },
      ],
    },
    en: {
      features: ['AES-256-GCM', 'Pasteable block', 'Same format as .enc', 'Offline'],
      faq: [
        {
          q: 'How do I send an encrypted message?',
          a: 'Write the text, set a password and copy the block it produces. It is plain text, so it survives email, chat or any form field without corrupting. Whoever receives it pastes the block here, enters the same password and reads the message.',
        },
        {
          q: 'What if the app breaks the block across lines?',
          a: 'That is fine. Reading tolerates different line endings, extra spaces, surrounding text and even missing begin/end markers — the content is still recoverable.',
        },
        {
          q: 'How do I share the password?',
          a: 'Through a different channel from the one carrying the message. Sending the block and the password in the same conversation defeats the protection, because anyone who reads one reads the other.',
        },
        {
          q: 'Is this the same format as file encryption?',
          a: 'The same envelope, just rendered as text. The contents of a .enc file can be pasted here and the other way round — there is one encryption implementation, not two.',
        },
      ],
    },
  },

  'diff-checker': {
    pt: {
      features: ['Diff de Myers', 'Números de linha', 'Baixar patch', 'Offline'],
      faq: [
        {
          q: 'Como comparar dois textos?',
          a: 'Cole ou solte um arquivo de cada lado. A comparação roda sozinha e marca linhas adicionadas, removidas e inalteradas, com os números de linha dos dois lados para você localizar a mudança no seu editor.',
        },
        {
          q: 'Dá para comparar arquivos grandes?',
          a: 'Até 20 mil linhas de cada lado e 10 MB por arquivo. O algoritmo apara o começo e o fim iguais antes de comparar, então editar três linhas de um arquivo de dois mil é praticamente instantâneo.',
        },
        {
          q: 'Meus arquivos são enviados para algum lugar?',
          a: 'Não. A comparação acontece no seu navegador, o que torna a ferramenta utilizável com contratos, código proprietário e documentos internos — o caso em que um comparador online comum é justamente o que não se pode usar.',
        },
        {
          q: 'Posso salvar o resultado?',
          a: 'Pode baixar um patch em formato unified diff, que é o mesmo que ferramentas de versionamento entendem.',
        },
      ],
    },
    en: {
      features: ['Myers diff', 'Line numbers', 'Download patch', 'Offline'],
      faq: [
        {
          q: 'How do I compare two texts?',
          a: 'Paste or drop a file on each side. The comparison runs on its own and marks added, removed and unchanged lines, with line numbers from both sides so you can find the change in your editor.',
        },
        {
          q: 'Can it handle large files?',
          a: 'Up to 20,000 lines per side and 10 MB per file. The algorithm trims the matching start and end before comparing, so editing three lines of a two-thousand-line file is effectively instant.',
        },
        {
          q: 'Are my files uploaded anywhere?',
          a: 'No. The comparison happens in your browser, which is what makes the tool usable for contracts, proprietary code and internal documents — exactly the case where an ordinary online comparer is the thing you cannot use.',
        },
        {
          q: 'Can I save the result?',
          a: 'You can download a patch in unified diff format, which is what version-control tools understand.',
        },
      ],
    },
  },
};

/**
 * The generic fallback is NOT here: it already exists as faq.q1..q5 in the
 * translation dictionary, drives the /faq route and the home page, and would be
 * a second copy if duplicated. FaqComponent reads it from there when a tool has
 * no entry above.
 */
export const GENERIC_FAQ_KEYS = [
  { q: 'faq.q1', a: 'faq.a1' },
  { q: 'faq.q2', a: 'faq.a2' },
  { q: 'faq.q3', a: 'faq.a3' },
  { q: 'faq.q4', a: 'faq.a4' },
  { q: 'faq.q5', a: 'faq.a5' },
] as const;

export function toolsWithContent(): ToolId[] {
  return Object.keys(TOOL_CONTENT) as ToolId[];
}
