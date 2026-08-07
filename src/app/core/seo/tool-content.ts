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
 * ALL 31 TOOLS ARE COVERED, and the bar for adding the 32nd is the same one the
 * existing entries had to clear: four answers that are *specific* to that tool —
 * its real limits, its real trade-offs, the question someone actually arrives
 * with. Four generic privacy answers repeated 32 times is thin duplicate
 * content, which is worse than the fallback. A tool with no entry still falls
 * back to the generic set rather than breaking, and `jsonld.spec.ts` fails when
 * one is missing, so the gap cannot reopen quietly.
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

  'remove-bg': {
    pt: {
      features: ['Modelo IS-Net local', 'Pincel de retoque', 'Fundo transparente ou colorido', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como remover o fundo de uma imagem?',
          a: 'Solte a foto e a ferramenta já começa a rodar — não há botão intermediário, porque escolher esta ferramenta com um arquivo aberto já é o pedido. O modelo separa o assunto do fundo e devolve um PNG com transparência real.',
        },
        {
          q: 'Funciona com logotipos e imagens chapadas?',
          a: 'Sim, e por um caminho diferente. A ferramenta mede a imagem antes: foto vai para o modelo de IA, arte chapada vai para uma remoção por cor amostrada nas bordas. O modelo é a pior escolha para um logotipo (ele nunca viu algo assim e devolve borda serrilhada), e a remoção por cor é a pior escolha para cabelo — por isso as duas existem.',
        },
        {
          q: 'O recorte errou uma parte. Dá para corrigir?',
          a: 'Dá. O pincel de retoque apaga o que sobrou e devolve o que foi comido a mais — restaurar pinta de volta exatamente os pixels originais daquelas coordenadas, não uma aproximação. Cada traço pode ser desfeito.',
        },
        {
          q: 'A imagem é enviada para algum servidor?',
          a: 'Não. O modelo de 42 MB é baixado uma vez para o seu navegador e roda ali, em WebAssembly. A partir daí a ferramenta funciona até sem internet, o que é a prova mais direta de que a foto não vai a lugar nenhum.',
        },
      ],
    },
    en: {
      features: ['Local IS-Net model', 'Retouch brush', 'Transparent or solid backdrop', 'Never uploaded'],
      faq: [
        {
          q: 'How do I remove the background from an image?',
          a: 'Drop the photo and it starts on its own — there is no extra button, because picking this tool with a file already open is the request. The model separates subject from background and returns a PNG with real transparency.',
        },
        {
          q: 'Does it work on logos and flat graphics?',
          a: 'Yes, through a different path. The tool measures the image first: a photograph goes to the AI model, flat art goes to a border-sampled colour key. The model is the worst possible tool for a logo — it has never seen anything like one and returns speckled edges — and the colour key is the worst possible tool for hair. That is why both exist.',
        },
        {
          q: 'The cutout missed something. Can I fix it?',
          a: 'Yes. The retouch brush erases what was left behind and restores what was taken too much — restoring paints back the exact original pixels at those coordinates, not an approximation. Every stroke can be undone.',
        },
        {
          q: 'Is the image uploaded anywhere?',
          a: 'No. The 42 MB model is downloaded once into your browser and runs there, in WebAssembly. After that the tool works with no internet at all, which is the most direct proof that the photo goes nowhere.',
        },
      ],
    },
  },

  vectorize: {
    pt: {
      features: ['PNG e JPG para SVG', 'Curvas Bézier reais', 'Mantém a transparência', 'Sem costura entre cores'],
      faq: [
        {
          q: 'O que é vetorizar uma imagem?',
          a: 'É trocar uma grade de pixels por formas descritas matematicamente — curvas, e não pontos. Um SVG vetorizado pode ser ampliado para um outdoor sem serrilhar, porque não existe "resolução": as curvas são recalculadas em cada tamanho. É o formato que gráfica, corte a laser e bordado pedem.',
        },
        {
          q: 'Por que não aparece aquela linha fina entre as cores?',
          a: 'Porque as formas vizinhas não têm bordas parecidas — elas têm a MESMA borda. A ferramenta extrai o grafo de fronteiras da imagem e ajusta cada fronteira uma vez só; as duas regiões dos lados apontam para a mesma curva. A maioria dos vetorizadores traça cada forma isolada, e as duas versões da mesma fronteira nunca coincidem exatamente — a fresta que sobra é aquela linha.',
        },
        {
          q: 'Qual modo escolher?',
          a: 'A ferramenta mede a imagem e sugere. Traço para assinatura e digitalização em preto e branco; Logo para marca e ícone de poucas cores; Ilustração para desenho com sombreado, que é onde os degradês entram; Pixel art para sprite, onde suavizar destruiria o desenho. O modo define o regime, e o slider de detalhe anda dentro dele.',
        },
        {
          q: 'O PNG com fundo transparente continua transparente?',
          a: 'Continua. A área transparente é traçada como qualquer outra região e simplesmente não vira forma no SVG — o que sobra ali é vazio, não um retângulo branco. A silhueta é lida no canal alfa, então um recorte cuja forma só existe na transparência (o caso de quem acabou de remover o fundo) sai com o contorno certo, e a borda com antialiasing é posicionada em sub-pixel.',
        },
        {
          q: 'Dá para vetorizar uma foto?',
          a: 'Dá, e o resultado costuma decepcionar — não por defeito da ferramenta, mas porque foto não é arte vetorial. Uma foto tem textura contínua e milhões de transições, então qualquer vetorização honesta produz milhares de formas e um arquivo maior que o JPG original. Vetorizar vale para logo, ícone, desenho e traço: coisas que foram desenhadas com formas.',
        },
      ],
    },
    en: {
      features: ['PNG and JPG to SVG', 'Real Bézier curves', 'Keeps transparency', 'No seams between colours'],
      faq: [
        {
          q: 'What does vectorizing an image mean?',
          a: 'It replaces a grid of pixels with mathematically described shapes — curves, not dots. A vectorized SVG can be blown up to billboard size without jagged edges, because there is no "resolution": the curves are recomputed at every size. It is the format printers, laser cutters and embroidery machines ask for.',
        },
        {
          q: 'Why is there no hairline gap between the colours?',
          a: 'Because neighbouring shapes do not have similar edges — they have the SAME edge. The tool extracts the boundary graph of the image and fits each boundary exactly once; the two regions on either side point at the same curve. Most vectorizers trace each shape in isolation, and two independent fits of the same boundary never coincide exactly — the sliver left over is that line.',
        },
        {
          q: 'Which mode should I pick?',
          a: 'The tool measures the image and suggests one. Line art for signatures and black-and-white scans; Logo for brands and few-colour icons; Illustration for shaded drawings, which is where gradients come in; Pixel art for sprites, where smoothing would destroy the artwork. The mode sets the regime, and the detail slider moves within it.',
        },
        {
          q: 'Does a transparent PNG stay transparent?',
          a: 'It does. The transparent area is traced like any other region and simply never becomes a shape in the SVG — what is left there is emptiness, not a white rectangle. The silhouette is read from the alpha channel, so a cutout whose shape exists only in the transparency (the case of someone who has just removed the background) comes out with the right outline, and its anti-aliased edge is placed at sub-pixel accuracy.',
        },
        {
          q: 'Can I vectorize a photo?',
          a: 'You can, and the result usually disappoints — not because the tool fails, but because a photo is not vector art. A photo has continuous texture and millions of transitions, so any honest vectorization produces thousands of shapes and a file larger than the original JPG. Vectorizing pays off for logos, icons, drawings and line art: things that were drawn with shapes in the first place.',
        },
      ],
    },
  },

  upscale: {
    pt: {
      features: ['2x e 4x', 'Reconstrução de bordas', 'Controle de nitidez', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como aumentar uma imagem sem ficar borrada?',
          a: 'Escolha 2x ou 4x e ajuste a nitidez. O 4x é feito em duas passagens de 2x, e não em um salto único: ampliar de uma vez só espalha cada pixel por uma área grande demais e o resultado fica leitoso.',
        },
        {
          q: 'Isso é uma IA que inventa detalhe?',
          a: 'Não, e a distinção importa. É reamostragem de alta qualidade com reconstrução de borda e antisserrilhado — ela recupera a definição do que está na imagem, mas não cria textura que nunca foi capturada. Uma foto muito pequena e desfocada continua sendo uma foto desfocada, só que maior.',
        },
        {
          q: 'Qual o limite de tamanho?',
          a: 'O limite prático é a memória da aba: uma imagem de 12 MP ampliada em 4x tem quase 200 milhões de pixels, e cada um ocupa 4 bytes no canvas. Em imagens muito grandes, 2x costuma ser a escolha honesta.',
        },
        {
          q: 'A qualidade se mantém para impressão?',
          a: 'Aumentar a resolução não aumenta a informação original, então para impressão vale mais partir do maior arquivo que você tiver. A ampliação ajuda quando o original já é razoável e falta tamanho, não quando falta detalhe.',
        },
      ],
    },
    en: {
      features: ['2x and 4x', 'Edge reconstruction', 'Sharpness control', 'Never uploaded'],
      faq: [
        {
          q: 'How do I enlarge an image without it going blurry?',
          a: 'Pick 2x or 4x and set the sharpness. The 4x runs as two 2x passes rather than one jump: enlarging in a single step spreads each pixel over too large an area and the result goes milky.',
        },
        {
          q: 'Is this an AI that invents detail?',
          a: 'No, and the distinction matters. It is high-quality resampling with edge reconstruction and anti-aliasing — it recovers the definition of what is in the image, but it does not create texture that was never captured. A small, out-of-focus photo stays out of focus, only larger.',
        },
        {
          q: 'Is there a size limit?',
          a: 'The practical limit is the tab’s memory: a 12 MP image at 4x is nearly 200 million pixels, and each one costs 4 bytes on a canvas. For very large images, 2x is usually the honest choice.',
        },
        {
          q: 'Will the quality hold up in print?',
          a: 'Raising the resolution does not raise the original information, so for print it is always better to start from the largest file you have. Upscaling helps when the original is decent and merely small, not when the detail is missing.',
        },
      ],
    },
  },

  'extract-text': {
    pt: {
      features: ['OCR em português e inglês', 'Imagem ou PDF escaneado', 'Copiar ou baixar o texto', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como extrair texto de uma imagem?',
          a: 'Solte a foto ou o print e a ferramenta roda OCR nela. O reconhecimento acontece no seu navegador, com os dados de idioma baixados uma vez — nenhuma imagem é enviada para um serviço de OCR.',
        },
        {
          q: 'Reconhece português com acento?',
          a: 'Sim. Os modelos de português e inglês são carregados juntos, então um documento que mistura os dois é lido sem você precisar escolher.',
        },
        {
          q: 'Por que o texto saiu errado?',
          a: 'Quase sempre é resolução. O OCR precisa de algo em torno de 150 DPI para separar as letras; uma foto de celular tirada de longe, torta ou com sombra atravessando a página derruba o resultado. Reenquadrar a foto costuma render mais do que qualquer ajuste depois.',
        },
        {
          q: 'Funciona com escrita à mão?',
          a: 'Não de forma confiável. O motor é treinado para texto impresso; manuscrito, fontes decorativas e texto sobre fundo muito texturizado ficam fora do que ele faz bem.',
        },
      ],
    },
    en: {
      features: ['OCR in Portuguese and English', 'Images or scanned PDFs', 'Copy or download the text', 'Never uploaded'],
      faq: [
        {
          q: 'How do I extract text from an image?',
          a: 'Drop the photo or screenshot and the tool runs OCR on it. The recognition happens in your browser, with the language data downloaded once — no image is ever sent to an OCR service.',
        },
        {
          q: 'Does it handle accented Portuguese?',
          a: 'Yes. The Portuguese and English models are loaded together, so a document that mixes both is read without you having to choose.',
        },
        {
          q: 'Why did the text come out wrong?',
          a: 'It is almost always resolution. OCR needs roughly 150 DPI to separate letters; a phone photo taken from far away, at an angle, or with a shadow across the page will wreck the result. Reshooting the photo buys more than any setting afterwards.',
        },
        {
          q: 'Does it read handwriting?',
          a: 'Not reliably. The engine is trained on printed text; handwriting, decorative fonts and text over heavy texture are outside what it does well.',
        },
      ],
    },
  },

  crop: {
    pt: {
      features: ['Proporções fixas', 'Corte livre', 'Continua para outra ferramenta', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como cortar uma imagem online?',
          a: 'Solte a imagem, arraste a área que interessa e baixe. Há proporções prontas (1:1, 4:3, 16:9) para quando o destino exige um formato exato, além do corte livre.',
        },
        {
          q: 'O corte perde qualidade?',
          a: 'O corte em si não inventa nem descarta detalhe dentro da área escolhida, mas o arquivo é recodificado ao ser salvo. Em JPEG isso significa uma geração a mais de perda; em PNG, nenhuma.',
        },
        {
          q: 'Dá para cortar e depois comprimir sem baixar duas vezes?',
          a: 'Dá. "Continuar editando" leva o resultado direto para a próxima ferramenta, e o nome do arquivo acumula os passos — foto.jpg vira foto-crop.png e depois foto-min.png, sempre derivado do nome original e sempre no formato que a etapa anterior produziu.',
        },
      ],
    },
    en: {
      features: ['Fixed ratios', 'Free crop', 'Continues into another tool', 'Never uploaded'],
      faq: [
        {
          q: 'How do I crop an image online?',
          a: 'Drop the image, drag the area you want and download. There are ready-made ratios (1:1, 4:3, 16:9) for when the destination demands an exact shape, plus a free crop.',
        },
        {
          q: 'Does cropping lose quality?',
          a: 'The crop itself neither invents nor discards detail inside the chosen area, but the file is re-encoded when it is saved. In JPEG that means one more generation of loss; in PNG, none.',
        },
        {
          q: 'Can I crop and then compress without downloading twice?',
          a: 'Yes. "Keep editing" carries the result straight into the next tool, and the filename accumulates the steps — photo.jpg becomes photo-crop.png and then photo-min.png, always derived from the original name and always in the format the previous step produced.',
        },
      ],
    },
  },

  compress: {
    pt: {
      features: ['Mantém o formato de entrada', 'Qualidade ajustável', 'Mostra a economia real', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como reduzir o tamanho de uma imagem?',
          a: 'Solte a imagem e ajuste a qualidade. A ferramenta mostra o tamanho antes e depois, então a decisão é tomada com o número na frente e não no escuro.',
        },
        {
          q: 'A compressão muda o formato do arquivo?',
          a: 'Não. Um JPEG sai JPEG, um WebP sai WebP e um PNG sai PNG — comprimir não é converter. A única exceção é GIF, BMP e AVIF, que nenhum navegador sabe escrever: esses saem em WebP, e o painel avisa antes. Para trocar de formato de propósito existe a ferramenta Converter.',
        },
        {
          q: 'Por que não dá para escolher a qualidade de um PNG?',
          a: 'Porque PNG é um formato sem perdas: não existe qualidade para negociar. O arquivo é reescrito e, se não ficar menor, o original é devolvido intacto em vez de um arquivo maior. Para reduzir muito uma imagem PNG, converta para WebP ou JPEG.',
        },
        {
          q: 'Por que o arquivo comprimido ficou maior?',
          a: 'Porque nem toda imagem tem o que comprimir. Uma imagem já otimizada não tem folga — e nesse caso a ferramenta devolve o original e diz que devolveu, em vez de entregar um arquivo maior chamado de comprimido.',
        },
        {
          q: 'Dá para comprimir várias imagens de uma vez?',
          a: 'A compressão trabalha uma imagem por vez, porque cada uma merece a decisão de qualidade olhando o resultado. Para juntar várias num arquivo só, a ferramenta de imagens para PDF aceita o lote.',
        },
      ],
    },
    en: {
      features: ['Keeps the input format', 'Adjustable quality', 'Shows the real saving', 'Never uploaded'],
      faq: [
        {
          q: 'How do I reduce an image’s file size?',
          a: 'Drop the image and set the quality. The tool shows the size before and after, so the decision is made with the number in front of you rather than blind.',
        },
        {
          q: 'Does compressing change the file format?',
          a: 'No. A JPEG comes out JPEG, a WebP comes out WebP and a PNG comes out PNG — compressing is not converting. The one exception is GIF, BMP and AVIF, which no browser can write: those come out as WebP, and the panel says so beforehand. To change format on purpose, there is the Convert tool.',
        },
        {
          q: 'Why is there no quality setting for a PNG?',
          a: 'Because PNG is a lossless format: there is no quality to trade away. The file is rewritten and, if that does not come out smaller, the original is handed back untouched instead of a larger file. To shrink a PNG a lot, convert it to WebP or JPEG.',
        },
        {
          q: 'Why did the compressed file come out bigger?',
          a: 'Because not every image has anything left to compress. An already-optimised image has no slack — and in that case the tool hands the original back and says so, rather than delivering a bigger file called compressed.',
        },
        {
          q: 'Can I compress several images at once?',
          a: 'Compression works one image at a time, because each deserves its quality decision made against the result. To put several into a single file, the images-to-PDF tool takes the batch.',
        },
      ],
    },
  },

  convert: {
    pt: {
      features: ['WebP, JPEG, PNG', 'PDF e ICO', 'Achata transparência quando precisa', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Que formatos a ferramenta converte?',
          a: 'Entra JPEG, PNG, WebP, AVIF, GIF e BMP; sai WebP, JPEG, PNG, PDF e ICO. A lista de entrada é maior porque o navegador sabe decodificar mais formatos do que sabe escrever — e a ferramenta não oferece saída que ele não escreve de verdade.',
        },
        {
          q: 'Por que não dá para salvar em AVIF?',
          a: 'Porque o navegador não escreve AVIF, e o pior é como ele falha: pedir AVIF ao canvas devolve um PNG silenciosamente, com a extensão .avif. Preferimos não oferecer a opção a entregar um arquivo que mente sobre o próprio formato. AVIF continua sendo aceito na entrada.',
        },
        {
          q: 'O que acontece com a transparência ao converter para JPEG?',
          a: 'JPEG não tem canal alfa, então a imagem é achatada sobre branco antes de codificar. Sem isso a transparência viraria preto, que é como esse erro costuma aparecer em outras ferramentas.',
        },
        {
          q: 'Posso continuar editando depois de converter?',
          a: 'Sim para os formatos de imagem. PDF e ICO encerram a cadeia: são formatos de destino, não de trabalho, e reabri-los como imagem seria uma volta pela qualidade sem ganho nenhum.',
        },
      ],
    },
    en: {
      features: ['WebP, JPEG, PNG', 'PDF and ICO', 'Flattens transparency when needed', 'Never uploaded'],
      faq: [
        {
          q: 'Which formats does it convert?',
          a: 'In come JPEG, PNG, WebP, AVIF, GIF and BMP; out go WebP, JPEG, PNG, PDF and ICO. The input list is longer because browsers can decode more formats than they can write — and the tool does not offer an output it cannot genuinely produce.',
        },
        {
          q: 'Why can’t I save as AVIF?',
          a: 'Because browsers cannot write AVIF, and the way they fail is the problem: asking a canvas for AVIF silently returns a PNG, under an .avif extension. We would rather not offer the option than hand you a file that lies about its own format. AVIF is still accepted as input.',
        },
        {
          q: 'What happens to transparency when converting to JPEG?',
          a: 'JPEG has no alpha channel, so the image is flattened onto white before encoding. Without that step the transparent areas would serialise as black, which is how this bug usually shows up elsewhere.',
        },
        {
          q: 'Can I keep editing after converting?',
          a: 'Yes for the image formats. PDF and ICO end the chain: they are destination formats, not working ones, and reopening them as an image would cost quality for nothing.',
        },
      ],
    },
  },

  resize: {
    pt: {
      features: ['Por pixel ou porcentagem', 'Mantém a proporção', 'Presets de rede social', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como redimensionar uma imagem para um tamanho exato?',
          a: 'Digite a largura ou a altura em pixels — a outra dimensão acompanha sozinha para manter a proporção. Também dá para trabalhar em porcentagem quando o alvo é "metade disso".',
        },
        {
          q: 'Redimensionar distorce a imagem?',
          a: 'Não, enquanto a proporção estiver travada. Forçar largura e altura que não correspondem ao formato original é o que estica a imagem, e é por isso que o vínculo entre as duas é o comportamento padrão.',
        },
        {
          q: 'Dá para aumentar a imagem aqui?',
          a: 'Esta ferramenta é para reduzir e para acertar dimensões. Para ampliar com reconstrução de borda, a ferramenta de melhorar qualidade faz isso em duas passagens e cuida da nitidez.',
        },
      ],
    },
    en: {
      features: ['By pixels or percentage', 'Keeps the aspect ratio', 'Social media presets', 'Never uploaded'],
      faq: [
        {
          q: 'How do I resize an image to an exact size?',
          a: 'Type the width or the height in pixels — the other dimension follows on its own to keep the proportions. You can also work in percentages when the target is simply "half of this".',
        },
        {
          q: 'Does resizing distort the image?',
          a: 'Not while the ratio is locked. Forcing a width and height that do not match the original shape is what stretches an image, which is why linking the two is the default.',
        },
        {
          q: 'Can I enlarge an image here?',
          a: 'This tool is for shrinking and for hitting exact dimensions. To enlarge with edge reconstruction, the upscale tool does it in two passes and handles the sharpening.',
        },
      ],
    },
  },

  'img-to-pdf': {
    pt: {
      features: ['Várias imagens de uma vez', 'Ordem arrastável', 'Uma imagem por página', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como juntar várias fotos num PDF?',
          a: 'Solte todas de uma vez, arraste as miniaturas até a ordem certa e baixe. Cada imagem vira uma página, na ordem que estiver na tela.',
        },
        {
          q: 'Dá para reordenar sem mouse?',
          a: 'Dá. Cada miniatura tem setas de mover, e elas são o controle de verdade — arrastar é o atalho, e não funciona no toque nem pelo teclado.',
        },
        {
          q: 'O PDF fica muito pesado com fotos de celular?',
          a: 'Não, porque no lote as imagens têm o lado maior limitado antes de entrar na página. Sem esse limite, trinta fotos de celular viram um PDF de dezenas de megabytes, com 2 a 3 MB por página que ninguém pediu.',
        },
        {
          q: 'De onde vem o nome do arquivo final?',
          a: 'Da primeira imagem da lista. Reordenar muda o nome, o que é coerente: a primeira página é o que o documento é.',
        },
      ],
    },
    en: {
      features: ['Many images at once', 'Draggable order', 'One image per page', 'Never uploaded'],
      faq: [
        {
          q: 'How do I combine photos into a PDF?',
          a: 'Drop them all at once, drag the thumbnails into the order you want and download. Each image becomes one page, in the order shown on screen.',
        },
        {
          q: 'Can I reorder without a mouse?',
          a: 'Yes. Every thumbnail has move arrows, and those are the real control — dragging is the shortcut, and it does nothing on touch or from a keyboard.',
        },
        {
          q: 'Will the PDF be huge with phone photos?',
          a: 'No, because in a batch each image has its long side capped before it goes onto the page. Without that cap, thirty phone photos build a PDF of tens of megabytes, at 2–3 MB per page nobody asked for.',
        },
        {
          q: 'Where does the output filename come from?',
          a: 'From the first image in the list. Reordering changes it, which is consistent: the first page is what the document is.',
        },
      ],
    },
  },

  'edit-pdf': {
    pt: {
      features: ['Editar o texto existente', 'OCR em página escaneada', 'Inserir texto e imagem', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Dá para editar o texto de um PDF de verdade?',
          a: 'Dá. O editor lê os blocos de texto do documento e deixa você alterar o conteúdo no lugar, em vez de só desenhar uma caixa branca por cima.',
        },
        {
          q: 'E se o PDF for um escaneamento?',
          a: 'Aí o texto não existe como texto — a página é uma foto. O editor roda OCR nela, transforma o que reconheceu em blocos editáveis e, ao exportar, redesenha esse texto de forma invisível sobre a imagem, então o documento final passa a ser pesquisável com Ctrl+F.',
        },
        {
          q: 'A fonte original é mantida?',
          a: 'O editor aproxima a fonte, o corpo e a posição de cada bloco, mas um PDF só carrega os recortes de fonte que usa. Em documento escaneado não há fonte nenhuma para manter: o tamanho é estimado a partir da altura das letras reconhecidas.',
        },
        {
          q: 'Documento longo trava o navegador?',
          a: 'Não. Só as páginas perto da tela ficam rasterizadas; as demais são liberadas e redesenhadas quando você volta a elas. É isso que faz um documento de 200 páginas ficar tão nítido quanto um de duas.',
        },
      ],
    },
    en: {
      features: ['Edit the existing text', 'OCR for scanned pages', 'Insert text and images', 'Never uploaded'],
      faq: [
        {
          q: 'Can I really edit the text in a PDF?',
          a: 'Yes. The editor reads the document’s text blocks and lets you change the content in place, rather than merely painting a white box over it.',
        },
        {
          q: 'What if the PDF is a scan?',
          a: 'Then the text does not exist as text — the page is a photograph. The editor runs OCR on it, turns what it recognised into editable blocks, and on export redraws that text invisibly over the image, so the final document becomes searchable with Ctrl+F.',
        },
        {
          q: 'Is the original font preserved?',
          a: 'The editor approximates each block’s font, size and position, but a PDF only carries the font subsets it uses. In a scanned document there is no font to preserve at all: the size is estimated from the height of the recognised letters.',
        },
        {
          q: 'Will a long document freeze the browser?',
          a: 'No. Only the pages near the viewport hold a rendered canvas; the rest are released and redrawn when you scroll back. That is what makes a 200-page document as sharp as a two-page one.',
        },
      ],
    },
  },

  'merge-pdf': {
    pt: {
      features: ['Vários arquivos', 'Ordem arrastável', 'Preserva o texto', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como juntar dois ou mais PDFs?',
          a: 'Solte todos os arquivos, coloque na ordem desejada e baixe o documento único. As páginas são copiadas como estão — o texto continua sendo texto e continua selecionável.',
        },
        {
          q: 'O arquivo final fica maior que a soma dos originais?',
          a: 'Não deveria, e é por isso que a cópia é feita por arquivo e não por página: copiar página a página duplica as fontes e os perfis de cor compartilhados a cada chamada, e o resultado passa a ser maior que a soma das entradas.',
        },
        {
          q: 'Dá para juntar um PDF protegido por senha?',
          a: 'Dá, informando a senha quando a ferramenta pedir. Ela é usada só para abrir o documento no seu navegador e não é guardada em lugar nenhum.',
        },
        {
          q: 'Há limite de tamanho ou de quantidade?',
          a: 'Cada arquivo pode ter até 100 MB. A quantidade é limitada pela memória da aba, já que o documento final é montado inteiro antes de ser salvo.',
        },
      ],
    },
    en: {
      features: ['Many files', 'Draggable order', 'Text preserved', 'Never uploaded'],
      faq: [
        {
          q: 'How do I merge two or more PDFs?',
          a: 'Drop all the files, put them in the order you want and download the single document. Pages are copied as they are — text stays text and stays selectable.',
        },
        {
          q: 'Will the merged file be bigger than the sum of its parts?',
          a: 'It should not be, and that is why the copy is done per file rather than per page: copying page by page duplicates the shared fonts and colour profiles on every call, until the result is larger than everything that went into it.',
        },
        {
          q: 'Can I merge a password-protected PDF?',
          a: 'Yes, by entering the password when the tool asks. It is used only to open the document inside your browser and is never stored.',
        },
        {
          q: 'Is there a size or count limit?',
          a: 'Each file can be up to 100 MB. The count is limited by the tab’s memory, since the final document is assembled whole before it is saved.',
        },
      ],
    },
  },

  'compress-pdf': {
    pt: {
      features: ['Quatro níveis', 'Mantém o Ctrl+F', 'Mostra a economia real', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como reduzir o tamanho de um PDF?',
          a: 'Solte o arquivo e escolha o nível. O nível sem perdas apenas reorganiza o arquivo; os demais redesenham as páginas como imagem, que é de onde vem a economia grande em documentos escaneados.',
        },
        {
          q: 'Ainda vou conseguir pesquisar o texto depois?',
          a: 'Sim. Nos níveis com perdas a camada de texto original é redesenhada de forma invisível sobre a página rasterizada, então o Ctrl+F continua achando o que achava antes, mesmo que o texto tenha deixado de ser vetorial.',
        },
        {
          q: 'Meu PDF não diminuiu nada. Por quê?',
          a: 'Porque ele provavelmente já é um documento de texto vetorial, que é compacto por natureza. Transformar essas páginas em fotografia deixaria o arquivo maior, e nesse caso a ferramenta diz que o documento já está bem otimizado em vez de devolver algo pior.',
        },
        {
          q: 'A qualidade da leitura cai muito?',
          a: 'Nos níveis mais fortes as páginas viram imagem em torno de 150 DPI, o que continua confortável na tela e aceitável na impressão comum. Se o documento for para impressão gráfica, use o nível sem perdas.',
        },
      ],
    },
    en: {
      features: ['Four levels', 'Keeps Ctrl+F working', 'Shows the real saving', 'Never uploaded'],
      faq: [
        {
          q: 'How do I shrink a PDF?',
          a: 'Drop the file and pick a level. The lossless level only reorganises the file; the others redraw the pages as images, which is where the large savings on scanned documents come from.',
        },
        {
          q: 'Will the text still be searchable afterwards?',
          a: 'Yes. At the lossy levels the original text layer is redrawn invisibly over the rasterised page, so Ctrl+F still finds what it found before, even though the text is no longer vector.',
        },
        {
          q: 'My PDF barely shrank. Why?',
          a: 'Because it is probably already a vector text document, which is compact by nature. Turning those pages into photographs would make the file bigger, and in that case the tool says the document is already well optimised instead of handing back something worse.',
        },
        {
          q: 'How much reading quality is lost?',
          a: 'At the stronger levels pages become images at roughly 150 DPI, which stays comfortable on screen and acceptable for ordinary printing. If the document is going to a print shop, use the lossless level.',
        },
      ],
    },
  },

  'split-pdf': {
    pt: {
      features: ['Intervalos personalizados', 'Blocos de N páginas', 'Saída em ZIP', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como separar páginas de um PDF?',
          a: 'Escolha entre marcar páginas soltas, definir intervalos (1-3, 8, 12-20) ou fatiar em blocos de tamanho fixo. Cada trecho vira um PDF, e vários trechos saem juntos num ZIP.',
        },
        {
          q: 'Dá para extrair só uma página?',
          a: 'Dá — marque só ela. É o caso mais comum: tirar o comprovante, a nota ou a página assinada de dentro de um documento longo.',
        },
        {
          q: 'As páginas separadas perdem qualidade?',
          a: 'Não. As páginas são copiadas como objetos do PDF, sem rasterizar nada: o texto continua vetorial e as imagens continuam com os bytes originais.',
        },
        {
          q: 'Posso juntar tudo num arquivo só em vez de vários?',
          a: 'Pode. Existe a opção de reunir os trechos selecionados num único PDF, que é o caminho para "quero só as páginas 2, 5 e 9, juntas".',
        },
      ],
    },
    en: {
      features: ['Custom ranges', 'Fixed-size chunks', 'ZIP output', 'Never uploaded'],
      faq: [
        {
          q: 'How do I split a PDF?',
          a: 'Choose between picking individual pages, defining ranges (1-3, 8, 12-20), or slicing into fixed-size chunks. Each piece becomes a PDF, and several pieces come out together in a ZIP.',
        },
        {
          q: 'Can I extract a single page?',
          a: 'Yes — select just that one. It is the most common case: pulling the receipt, the invoice or the signed page out of a long document.',
        },
        {
          q: 'Do the split pages lose quality?',
          a: 'No. Pages are copied as PDF objects with nothing rasterised: the text stays vector and the images keep their original bytes.',
        },
        {
          q: 'Can I get one file instead of many?',
          a: 'Yes. There is an option to gather the selected pieces into a single PDF, which is the path for "I only want pages 2, 5 and 9, together".',
        },
      ],
    },
  },

  'pdf-to-img': {
    pt: {
      features: ['JPEG, PNG ou WebP', 'Três resoluções', 'Página avulsa ou ZIP', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como transformar um PDF em imagens?',
          a: 'Solte o arquivo, escolha o formato e a resolução, e selecione as páginas. Uma página baixa como imagem solta; várias saem num ZIP.',
        },
        {
          q: 'Qual resolução escolher?',
          a: '1x serve para visualizar, 2x é o meio-termo para a maioria dos usos e 3x é para quando a imagem vai ser ampliada ou impressa. Quanto maior a escala, maior o arquivo e mais memória a conversão consome.',
        },
        {
          q: 'Qual formato usar?',
          a: 'JPEG para páginas com foto, PNG quando o texto precisa ficar com as bordas perfeitamente limpas, WebP quando o destino aceita e o tamanho importa.',
        },
        {
          q: 'O texto continua selecionável nas imagens?',
          a: 'Não — uma imagem é uma imagem. Se o objetivo é manter o texto, o caminho é PDF para Word ou a extração de texto.',
        },
      ],
    },
    en: {
      features: ['JPEG, PNG or WebP', 'Three resolutions', 'Single image or ZIP', 'Never uploaded'],
      faq: [
        {
          q: 'How do I convert a PDF into images?',
          a: 'Drop the file, pick the format and resolution, and select the pages. One page downloads as a single image; several come out in a ZIP.',
        },
        {
          q: 'Which resolution should I pick?',
          a: '1x is for viewing, 2x is the middle ground for most uses, and 3x is for when the image will be enlarged or printed. The higher the scale, the larger the file and the more memory the conversion needs.',
        },
        {
          q: 'Which format should I pick?',
          a: 'JPEG for pages with photographs, PNG when text edges need to stay perfectly clean, WebP when the destination accepts it and size matters.',
        },
        {
          q: 'Is the text still selectable in the images?',
          a: 'No — an image is an image. If keeping the text is the point, PDF to Word or text extraction is the path.',
        },
      ],
    },
  },

  'pdf-to-word': {
    pt: {
      features: ['Saída .docx', 'OCR em escaneado', 'Ordem de leitura corrigida', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como converter PDF em Word?',
          a: 'Solte o PDF e baixe um .docx. A leitura usa o mesmo mecanismo do editor: texto nativo quando o documento tem texto, OCR quando ele é um escaneamento.',
        },
        {
          q: 'O layout fica idêntico ao PDF?',
          a: 'Não, e nenhuma conversão honesta fica. Um PDF posiciona cada trecho em coordenadas absolutas; um .docx é um fluxo linear de parágrafos. A conversão entrega o conteúdo na ordem de leitura correta, não uma réplica visual da página.',
        },
        {
          q: 'Funciona com PDF escaneado?',
          a: 'Funciona, via OCR — e é aí que a ordem de leitura importa mais: sem ordenar os blocos por linha, um escaneamento sai com a metade direita de cada linha antes da esquerda, com todas as palavras presentes e o texto ilegível.',
        },
        {
          q: 'Tabelas são convertidas?',
          a: 'O conteúdo das células vem, mas a estrutura da tabela não é reconstruída como tabela do Word. Um PDF não marca o que é tabela: ele só desenha linhas e posiciona texto.',
        },
      ],
    },
    en: {
      features: ['.docx output', 'OCR for scans', 'Reading order fixed', 'Never uploaded'],
      faq: [
        {
          q: 'How do I convert a PDF to Word?',
          a: 'Drop the PDF and download a .docx. The reading uses the same machinery as the editor: native text when the document has text, OCR when it is a scan.',
        },
        {
          q: 'Will the layout match the PDF exactly?',
          a: 'No, and no honest conversion does. A PDF places every fragment at absolute coordinates; a .docx is a linear flow of paragraphs. The conversion delivers the content in the correct reading order, not a visual replica of the page.',
        },
        {
          q: 'Does it work on scanned PDFs?',
          a: 'It does, through OCR — and that is where reading order matters most: without sorting the blocks into lines, a scan comes out with the right half of every line before its left half, every word present and the text unreadable.',
        },
        {
          q: 'Are tables converted?',
          a: 'The cell contents come through, but the table structure is not rebuilt as a Word table. A PDF does not mark what is a table: it only draws lines and places text.',
        },
      ],
    },
  },

  'organize-pdf': {
    pt: {
      features: ['Reordenar páginas', 'Girar e excluir', 'Miniaturas de todas as páginas', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como reordenar as páginas de um PDF?',
          a: 'As páginas aparecem como miniaturas: arraste para mudar a ordem, ou use as setas de cada página. Dá também para girar e excluir antes de exportar.',
        },
        {
          q: 'Como consertar páginas de cabeça para baixo?',
          a: 'Gire a página nas miniaturas. A rotação é gravada no PDF, e não simulada na tela — abre girada em qualquer leitor.',
        },
        {
          q: 'A reorganização mexe no conteúdo?',
          a: 'Não. As páginas são movidas como objetos: o texto continua vetorial, as imagens mantêm os bytes originais e nada é rasterizado.',
        },
      ],
    },
    en: {
      features: ['Reorder pages', 'Rotate and delete', 'Thumbnails of every page', 'Never uploaded'],
      faq: [
        {
          q: 'How do I reorder the pages of a PDF?',
          a: 'The pages appear as thumbnails: drag to change the order, or use each page’s arrows. You can also rotate and delete before exporting.',
        },
        {
          q: 'How do I fix upside-down pages?',
          a: 'Rotate the page in the thumbnail strip. The rotation is written into the PDF rather than simulated on screen — it opens rotated in any reader.',
        },
        {
          q: 'Does reorganising touch the content?',
          a: 'No. Pages are moved as objects: text stays vector, images keep their original bytes, and nothing is rasterised.',
        },
      ],
    },
  },

  'protect-pdf': {
    pt: {
      features: ['Senha de abertura', 'Criptografia no navegador', 'Sem envio para servidor', 'Sem cadastro'],
      faq: [
        {
          q: 'Como colocar senha num PDF?',
          a: 'Solte o arquivo, escolha a senha e baixe. Sem ela o documento não abre — nem aqui, nem em nenhum outro leitor.',
        },
        {
          q: 'A senha é enviada para algum lugar?',
          a: 'Não. A criptografia acontece dentro do seu navegador, que é o ponto: mandar um documento confidencial e a senha dele para um servidor desconhecido anula o motivo de proteger.',
        },
        {
          q: 'Esqueci a senha. Dá para abrir?',
          a: 'Não. Não existe cópia da senha em lugar nenhum, então não há a quem pedir. Guarde antes de fechar a aba.',
        },
        {
          q: 'O texto continua selecionável no documento protegido?',
          a: 'Não. Para criptografar, as páginas são reconstruídas como imagem, então o documento protegido perde a camada de texto. É a troca que essa proteção custa, e vale saber antes se o Ctrl+F importa para quem vai receber.',
        },
      ],
    },
    en: {
      features: ['Open password', 'Encrypted in the browser', 'Never uploaded', 'No account'],
      faq: [
        {
          q: 'How do I password-protect a PDF?',
          a: 'Drop the file, choose a password and download. Without it the document will not open — not here, and not in any other reader.',
        },
        {
          q: 'Is the password sent anywhere?',
          a: 'No. The encryption happens inside your browser, which is the whole point: sending a confidential document and its password to an unknown server defeats the reason for protecting it.',
        },
        {
          q: 'I forgot the password. Can it be opened?',
          a: 'No. No copy of the password exists anywhere, so there is nobody to ask. Save it before closing the tab.',
        },
        {
          q: 'Is text still selectable in the protected document?',
          a: 'No. To encrypt, the pages are rebuilt as images, so the protected document loses its text layer. That is the trade this protection costs, and it is worth knowing in advance whether Ctrl+F matters to whoever receives it.',
        },
      ],
    },
  },

  'sign-pdf': {
    pt: {
      features: ['Assinatura desenhada ou em imagem', 'Posição livre', 'Várias páginas', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como assinar um PDF?',
          a: 'Desenhe a assinatura ou envie uma imagem dela, posicione sobre a página e ajuste o tamanho. Dá para colocar em quantas páginas precisar antes de exportar.',
        },
        {
          q: 'Essa assinatura tem valor jurídico?',
          a: 'É uma assinatura visual, equivalente a assinar uma via impressa e digitalizar. Não é assinatura digital com certificado ICP-Brasil, que exige um certificado emitido por uma autoridade certificadora.',
        },
        {
          q: 'A assinatura pode ser removida do arquivo depois?',
          a: 'Ela é desenhada no conteúdo da página, e não colada como um comentário que qualquer leitor descola em um clique.',
        },
        {
          q: 'Minha assinatura é guardada?',
          a: 'Não. Ela existe apenas na aba aberta e some quando você fecha ou recomeça — não há conta, nem servidor, nem histórico.',
        },
      ],
    },
    en: {
      features: ['Drawn or uploaded signature', 'Free placement', 'Multiple pages', 'Never uploaded'],
      faq: [
        {
          q: 'How do I sign a PDF?',
          a: 'Draw your signature or upload an image of it, place it on the page and adjust the size. You can put it on as many pages as you need before exporting.',
        },
        {
          q: 'Is this signature legally binding?',
          a: 'It is a visual signature, equivalent to signing a printout and scanning it. It is not a certificate-based digital signature, which requires a certificate issued by a certification authority.',
        },
        {
          q: 'Can the signature be removed from the file afterwards?',
          a: 'It is drawn into the page content, not attached as an annotation that any reader can peel off in one click.',
        },
        {
          q: 'Is my signature stored?',
          a: 'No. It exists only in the open tab and disappears when you close it or start over — there is no account, no server and no history.',
        },
      ],
    },
  },

  'watermark-pdf': {
    pt: {
      features: ['Texto, cor e opacidade', 'Ângulo ajustável', 'Todas as páginas', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como colocar marca d’água num PDF?',
          a: 'Digite o texto — CONFIDENCIAL, RASCUNHO, o nome de quem recebe — e ajuste tamanho, cor, opacidade e ângulo. A marca é aplicada em todas as páginas.',
        },
        {
          q: 'A marca d’água some se a pessoa imprimir?',
          a: 'Não. Ela faz parte do conteúdo da página, então aparece na impressão e em qualquer leitor, exatamente como na tela.',
        },
        {
          q: 'Dá para tirar a marca depois?',
          a: 'Não a partir do arquivo marcado — guarde o original. É justamente por isso que a marca serve para controlar cópias que circulam.',
        },
        {
          q: 'O texto do documento continua selecionável?',
          a: 'Continua. A marca é desenhada por cima como conteúdo vetorial, sem rasterizar a página, então nada do documento original é perdido.',
        },
      ],
    },
    en: {
      features: ['Text, colour and opacity', 'Adjustable angle', 'Every page', 'Never uploaded'],
      faq: [
        {
          q: 'How do I add a watermark to a PDF?',
          a: 'Type the text — CONFIDENTIAL, DRAFT, the recipient’s name — and set size, colour, opacity and angle. The mark is applied to every page.',
        },
        {
          q: 'Does the watermark disappear when printed?',
          a: 'No. It is part of the page content, so it shows up in print and in any reader, exactly as it does on screen.',
        },
        {
          q: 'Can the watermark be removed later?',
          a: 'Not from the marked file — keep the original. That is precisely what makes a watermark useful for copies that circulate.',
        },
        {
          q: 'Is the document text still selectable?',
          a: 'Yes. The mark is drawn on top as vector content, with no rasterising, so nothing of the original document is lost.',
        },
      ],
    },
  },

  'cut-audio': {
    pt: {
      features: ['Forma de onda com zoom', 'Cortar ou remover trecho', 'Fade in e fade out', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como cortar um áudio online?',
          a: 'Solte o arquivo, arraste a seleção sobre a forma de onda e escolha entre ficar com o trecho selecionado ou removê-lo. Dá para aproximar o zoom até acertar o ponto no detalhe.',
        },
        {
          q: 'O corte perde qualidade?',
          a: 'Não. O trecho é escrito em WAV a partir das amostras decodificadas, sem recodificar — cortar um MP3 aqui não acrescenta uma segunda geração de perda.',
        },
        {
          q: 'Por que o arquivo cortado ficou maior que o original?',
          a: 'Porque a saída é WAV, que é áudio sem compressão. É uma decisão de licença: todo codificador de MP3 em JavaScript que presta é um port do LAME sob LGPL, e um trecho recodificado perderia qualidade de novo. Se o tamanho importa mais, a ferramenta de comprimir áudio reencoda para MP3.',
        },
        {
          q: 'Que formatos posso abrir?',
          a: 'MP3, WAV, OGG, M4A, AAC e FLAC — tudo que o seu navegador sabe decodificar. O limite é de 100 MB e 30 minutos, porque o áudio decodificado ocupa muito mais memória que o arquivo: meia hora em estéreo passa de meio gigabyte.',
        },
      ],
    },
    en: {
      features: ['Zoomable waveform', 'Keep or remove a slice', 'Fade in and out', 'Never uploaded'],
      faq: [
        {
          q: 'How do I cut an audio file online?',
          a: 'Drop the file, drag a selection across the waveform and choose whether to keep that slice or remove it. You can zoom in until the edit point is exactly where you want it.',
        },
        {
          q: 'Does cutting lose quality?',
          a: 'No. The slice is written as WAV from the decoded samples, with no re-encoding — cutting an MP3 here does not add a second generation of loss.',
        },
        {
          q: 'Why is the cut file bigger than the original?',
          a: 'Because the output is WAV, which is uncompressed. It is a licensing decision: every JavaScript MP3 encoder worth using is a LAME port under the LGPL, and a re-encoded slice would lose quality again. If size matters more, the compress-audio tool re-encodes to MP3.',
        },
        {
          q: 'Which formats can I open?',
          a: 'MP3, WAV, OGG, M4A, AAC and FLAC — whatever your browser can decode. The limit is 100 MB and 30 minutes, because decoded audio takes far more memory than the file does: half an hour of stereo is over half a gigabyte.',
        },
      ],
    },
  },

  'merge-audio': {
    pt: {
      features: ['Várias faixas', 'Crossfade', 'Ordem arrastável', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como juntar dois áudios num arquivo só?',
          a: 'Solte as faixas, coloque na ordem certa arrastando as miniaturas — cada uma mostra a própria forma de onda — e baixe. Também dá para reordenar pelas setas.',
        },
        {
          q: 'O que é o crossfade?',
          a: 'É a sobreposição entre o fim de uma faixa e o começo da seguinte, para a emenda não estalar. Ele é de potência constante: duas rampas lineares se cruzando somam metade do nível no meio, cerca de -6 dB, que é um buraco audível em toda transição.',
        },
        {
          q: 'Dá para juntar um áudio mono com um estéreo?',
          a: 'Dá. O mono é alargado para estéreo, nunca o contrário — juntar um recado de voz com uma música é justamente o caso de uso, e reduzir tudo ao mais estreito transformaria a música em mono por causa do recado.',
        },
        {
          q: 'Em que formato sai o resultado?',
          a: 'WAV, pelo mesmo motivo do cortador: nada é recodificado, então não há uma segunda geração de perda. Para reduzir o tamanho depois, use a ferramenta de comprimir áudio.',
        },
      ],
    },
    en: {
      features: ['Many tracks', 'Crossfade', 'Draggable order', 'Never uploaded'],
      faq: [
        {
          q: 'How do I join two audio files into one?',
          a: 'Drop the tracks, drag the thumbnails into the order you want — each one shows its own waveform — and download. The arrows reorder them too.',
        },
        {
          q: 'What does the crossfade do?',
          a: 'It overlaps the end of one track with the start of the next so the join does not click. It is equal-power: two linear ramps crossing sum to half the level at the midpoint, about -6 dB, which is an audible hole in every transition.',
        },
        {
          q: 'Can I join a mono file with a stereo one?',
          a: 'Yes. The mono track is widened to stereo, never the other way round — joining a voice note to a song is exactly the use case, and taking the narrowest would turn the song mono because of the voice note.',
        },
        {
          q: 'What format is the result?',
          a: 'WAV, for the same reason as the cutter: nothing is re-encoded, so there is no second generation of loss. To shrink it afterwards, use the compress-audio tool.',
        },
      ],
    },
  },

  'convert-audio': {
    pt: {
      features: ['MP3, WAV, OGG, M4A', 'Mono ou estéreo', 'Taxa de bits ajustável', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como converter áudio de um formato para outro?',
          a: 'Solte o arquivo, escolha o formato de saída e ajuste canais e taxa de bits se precisar. Tudo acontece no navegador, sem fila de servidor e sem limite de conversões por dia.',
        },
        {
          q: 'Como o MP3 é gerado sem servidor?',
          a: 'Por um codificador LAME em JavaScript que roda na sua aba. Para OGG e M4A a conversão usa o próprio gravador do navegador quando ele suporta o codec, e cai para MP3 quando não suporta.',
        },
        {
          q: 'Converter de MP3 para WAV melhora a qualidade?',
          a: 'Não. O que foi descartado na compressão original não volta — o WAV só deixa de perder mais dali em diante. Converter para WAV faz sentido antes de editar, não para "recuperar" um arquivo.',
        },
        {
          q: 'Por que a taxa de amostragem mudou?',
          a: 'Porque o navegador decodifica na taxa do dispositivo de saída: um arquivo de 44,1 kHz num aparelho de 48 kHz sai em 48 kHz. Não existe API para decodificar na taxa nativa do arquivo — é um piso do navegador, não uma escolha da ferramenta.',
        },
      ],
    },
    en: {
      features: ['MP3, WAV, OGG, M4A', 'Mono or stereo', 'Adjustable bitrate', 'Never uploaded'],
      faq: [
        {
          q: 'How do I convert audio from one format to another?',
          a: 'Drop the file, pick the output format and adjust channels and bitrate if you need to. It all happens in the browser — no server queue and no daily conversion limit.',
        },
        {
          q: 'How is MP3 produced with no server?',
          a: 'By a LAME encoder in JavaScript running in your tab. For OGG and M4A the conversion uses the browser’s own recorder when it supports the codec, and falls back to MP3 when it does not.',
        },
        {
          q: 'Does converting MP3 to WAV improve the quality?',
          a: 'No. What the original compression discarded does not come back — WAV only stops losing more from here on. Converting to WAV makes sense before editing, not to "restore" a file.',
        },
        {
          q: 'Why did the sample rate change?',
          a: 'Because the browser decodes at the output device’s rate: a 44.1 kHz file on a 48 kHz device comes out at 48 kHz. There is no API to decode at the file’s native rate — it is a browser floor, not a choice the tool makes.',
        },
      ],
    },
  },

  'compress-audio': {
    pt: {
      features: ['32 a 320 kbps', 'Mono para reduzir pela metade', 'Estimativa antes de rodar', 'Sem envio para servidor'],
      faq: [
        {
          q: 'Como reduzir o tamanho de um arquivo de áudio?',
          a: 'Escolha a taxa de bits e, se fizer sentido, converta para mono. A ferramenta mostra o tamanho estimado antes de rodar, então dá para decidir com o número na frente.',
        },
        {
          q: 'Qual taxa de bits usar?',
          a: '128 kbps é o meio-termo confortável para música; 64 kbps costuma bastar para voz — podcast, aula, gravação de reunião — e corta o arquivo pela metade de novo. 320 kbps só faz sentido a partir de um original de alta qualidade.',
        },
        {
          q: 'Comprimir de novo um MP3 piora o som?',
          a: 'Piora, sim: cada recodificação joga fora um pouco mais e o que se perde não volta. Comprima sempre a partir do melhor original que você tiver, não a partir de uma cópia já reduzida.',
        },
        {
          q: 'Converter para mono ajuda muito?',
          a: 'Corta praticamente metade do tamanho, e para voz gravada em um microfone só não há informação estéreo real a perder. Para música, mono é audível.',
        },
      ],
    },
    en: {
      features: ['32 to 320 kbps', 'Mono to halve the size', 'Estimate before running', 'Never uploaded'],
      faq: [
        {
          q: 'How do I make an audio file smaller?',
          a: 'Pick the bitrate and, where it makes sense, convert to mono. The tool shows the estimated size before running, so the decision is made with the number in front of you.',
        },
        {
          q: 'Which bitrate should I use?',
          a: '128 kbps is the comfortable middle ground for music; 64 kbps is usually enough for speech — podcasts, lectures, meeting recordings — and halves the file again. 320 kbps only makes sense starting from a high-quality original.',
        },
        {
          q: 'Does re-compressing an MP3 make it worse?',
          a: 'It does: every re-encode throws away a little more, and what is lost does not come back. Always compress from the best original you have, not from a copy that was already reduced.',
        },
        {
          q: 'Does converting to mono help much?',
          a: 'It cuts roughly half the size, and for speech recorded on a single microphone there is no real stereo information to lose. For music, mono is audible.',
        },
      ],
    },
  },

  'video-to-audio': {
    pt: {
      features: ['MP4, MOV, WebM, MKV', 'MP3 ou WAV sem perda', 'Até 500 MB e 30 minutos', 'O vídeo não é enviado'],
      faq: [
        {
          q: 'Como extrair o áudio de um vídeo sem enviar o arquivo?',
          a: 'Solte o vídeo, escolha MP3 ou WAV e baixe. A trilha é lida pelo próprio decodificador do navegador, na sua máquina — um vídeo de 400 MB não sobe para lugar nenhum, o que também explica por que aqui não há fila nem limite diário.',
        },
        {
          q: 'Extrair o áudio piora a qualidade?',
          a: 'A trilha sai do vídeo exatamente como estava. Escolhendo WAV, é isso que você baixa, sem nenhuma perda nova. Escolhendo MP3 há uma recodificação: como o áudio dentro de um MP4 quase sempre já é AAC comprimido, é uma segunda geração de perda — a 192 kbps ou mais ela é inaudível na prática, e o WAV está ali para quem não quiser nenhuma.',
        },
        {
          q: 'Por que às vezes ele avisa que vai levar o tempo do vídeo?',
          a: 'Porque nem todo navegador entrega a trilha de um container de vídeo diretamente. Quando o caminho rápido é recusado, a ferramenta cai para o modo compatível: toca o vídeo em silêncio e captura o som amostra por amostra. O resultado é o mesmo PCM exato, mas leva a duração do arquivo. Chrome e Edge quase sempre usam o caminho rápido, que é quase instantâneo.',
        },
        {
          q: 'Por que o limite é 30 minutos?',
          a: 'É memória, não política. O áudio decodificado vira float de 32 bits: meia hora de estéreo a 48 kHz ocupa cerca de 690 MB de RAM, e a codificação aloca a saída por cima disso. A duração é medida antes de o arquivo ser lido inteiro, então um vídeo longo demais é recusado na hora, sem travar a aba.',
        },
      ],
    },
    en: {
      features: ['MP4, MOV, WebM, MKV', 'MP3 or lossless WAV', 'Up to 500 MB and 30 minutes', 'The video is never uploaded'],
      faq: [
        {
          q: 'How do I extract audio from a video without uploading the file?',
          a: 'Drop the video, pick MP3 or WAV and download. The track is read by your browser own decoder, on your machine — a 400 MB video goes nowhere, which is also why there is no queue and no daily limit here.',
        },
        {
          q: 'Does extracting the audio hurt quality?',
          a: 'The track comes out of the video exactly as it was. Pick WAV and that is what you download, with no new loss at all. Pick MP3 and there is a re-encode: since the audio inside an MP4 is almost always compressed AAC already, that is a second generation of loss — inaudible in practice at 192 kbps and above, and WAV is there for anyone who wants none.',
        },
        {
          q: 'Why does it sometimes warn that it will take as long as the video?',
          a: 'Because not every browser hands over the track of a video container directly. When the fast path is refused, the tool falls back to compatibility mode: it plays the video silently and captures the sound sample by sample. The result is the same exact PCM, but it takes the length of the file. Chrome and Edge almost always take the fast path, which is near instant.',
        },
        {
          q: 'Why is the limit 30 minutes?',
          a: 'It is memory, not policy. Decoded audio becomes 32-bit float: half an hour of stereo at 48 kHz is around 690 MB of RAM, and encoding allocates the output on top of that. The duration is measured before the file is read in full, so a video that is too long is refused immediately instead of freezing the tab.',
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
