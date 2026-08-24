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
 * ALL 36 TOOLS ARE COVERED, and the bar for adding the next is the same one the
 * existing entries had to clear: four answers that are *specific* to that tool —
 * its real limits, its real trade-offs, the question someone actually arrives
 * with. Four generic privacy answers repeated 36 times is thin duplicate
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
      features: ['AES-256-GCM autenticado', 'Derivação de chave PBKDF2', 'Qualquer formato de arquivo', 'Processamento 100% no navegador'],
      faq: [
        {
          q: 'Como criptografar um arquivo com senha no navegador?',
          a: 'Para criptografar, selecione ou arraste qualquer arquivo para o dropzone, escolha a operação "Criptografar", defina uma senha forte e clique para baixar o envelope criptografado com extensão .enc. O processo roda integralmente na memória da sua aba: os bytes do arquivo original são cifrados em blocos e empacotados com seus metadados de nome e extensão original. Para abrir posteriormente, basta arrastar o arquivo .enc de volta nesta ferramenta, selecionar "Descriptografar", fornecer a mesma senha exata e salvar o arquivo restaurado.',
        },
        {
          q: 'Que padrão e algoritmo de criptografia são utilizados?',
          a: 'Utilizamos o padrão militar AES-256 no modo GCM (Galois/Counter Mode), complementado por derivação de chave com PBKDF2-SHA256 utilizando 100.000 iterações e salt aleatório criptograficamente seguro gerado por crypto.getRandomValues. O modo GCM oferece criptografia autenticada (AEAD), o que significa que qualquer tentativa de adulteração de bytes, arquivo corrompido ou senha incorreta resultará na rejeição imediata da descriptografia, garantindo integridade e confidencialidade absolutas.',
        },
        {
          q: 'Perdi ou esqueci a senha definida. É possível recuperar o arquivo?',
          a: 'Não. Pela própria arquitetura matemática da criptografia simétrica de chave zero-knowledge, a senha nunca é enviada para nenhum servidor e não existe nenhuma chave mestra, backdoor ou mecanismo de recuperação. Se você esquecer a senha, os dados criptografados se tornam matematicamente irrecuperáveis por força bruta prática. Recomendamos sempre armazenar a senha em um gerenciador de senhas confiável antes de fechar a aba do navegador.',
        },
        {
          q: 'Qual é o limite de tamanho de arquivo suportado e por quê?',
          a: 'O limite recomendado é de até 256 MB por arquivo. Esse teto existe porque a Web Cryptography API do navegador precisa alocar e manter na memória RAM simultaneamente o ArrayBuffer original, o vetor de inicialização (IV), o ciphertext cifrado e o envelope final montado. Processar arquivos muito maiores que isso diretamente no heap do JavaScript da aba poderia causar estouro de memória no navegador.',
        },
      ],
    },
    en: {
      features: ['Authenticated AES-256-GCM', 'PBKDF2 key derivation', 'Any file format supported', '100% in-browser processing'],
      faq: [
        {
          q: 'How do I password-protect and encrypt a file in the browser?',
          a: 'To encrypt, drag and drop any file into the upload zone, select "Encrypt", choose a strong password, and download the encrypted .enc envelope. The entire process runs strictly in local browser memory: the raw byte stream is ciphered and bundled alongside original filename and MIME type headers. To open it later, drop that .enc envelope back into this tool, select "Decrypt", enter the exact same password, and save your restored file.',
        },
        {
          q: 'What cryptographic algorithms and standards are used?',
          a: 'We use military-grade AES-256 in GCM mode (Galois/Counter Mode), combined with PBKDF2-SHA256 key derivation running 100,000 iterations with a cryptographically secure random salt from crypto.getRandomValues. AES-GCM provides authenticated encryption (AEAD), meaning it verifies integrity alongside secrecy — any damaged byte, altered payload, or incorrect password triggers immediate authentication failure.',
        },
        {
          q: 'I lost or forgot my password. Can the encrypted file be recovered?',
          a: 'No. Under the mathematical guarantees of zero-knowledge client-side encryption, your password is never transmitted across the network and no backdoors, master keys, or recovery mechanisms exist. If you lose your password, the ciphertext cannot be reversed by any practical computation. Always store your passphrase in a secure password manager before closing the browser tab.',
        },
        {
          q: 'What is the maximum supported file size and why?',
          a: 'The recommended ceiling is 256 MB per file. This limit is dictated by the browser’s Web Cryptography API and JavaScript heap allocation, which must concurrently hold the plaintext ArrayBuffer, the initialization vector (IV), the encrypted ciphertext, and the structured envelope in memory. Exceeding this boundary could exhaust browser tab RAM.',
        },
      ],
    },
  },

  'remove-exif': {
    pt: {
      features: ['Remoção de GPS e dados de câmera', 'Cópia binária sem recompressão', 'Compatível com JPEG, PNG e WebP', 'Auditoria de metadados antes de limpar'],
      faq: [
        {
          q: 'Fotos tiradas no celular ou câmera guardam minha localização exata?',
          a: 'Sim. Se a geolocalização da câmera ou do celular estava ativada, as coordenadas de latitude, longitude e altitude são gravadas nos cabeçalhos EXIF da foto com precisão milimétrica, capaz de identificar a rua e a residência onde a imagem foi capturada. O Nada Sai analisa os blocos de metadados e exibe todas as coordenadas e informações encontradas para que você audite os dados antes de prosseguir com a higienização.',
        },
        {
          q: 'Remover os metadados EXIF reduz a qualidade ou altera a imagem?',
          a: 'Não. Nossa ferramenta opera diretamente no nível binário dos segmentos do arquivo (como marcadores APP1 em JPEG e chunks eXIf em PNG/WebP). O fluxo de pixels comprimido da imagem é preservado e copiado byte a byte, sem decodificar em canvas nem aplicar recompressão com perdas. A foto limpa mantém 100% da nitidez e das cores originais, apenas sem os dados de privacidade.',
        },
        {
          q: 'O que é a miniatura oculta (thumbnail embutida) nos arquivos EXIF?',
          a: 'Muitas câmeras e smartphones geram automaticamente uma versão reduzida da foto em baixa resolução e a embutem dentro do bloco EXIF para agilizar pré-visualizações na galeria. Quando uma foto é cortada ou tem rostos censurados em editores comuns, essa miniatura interna muitas vezes não é atualizada, mantendo a foto original visível. O Nada Sai detecta e elimina sumariamente qualquer miniatura embutida.',
        },
        {
          q: 'Por que manter ou descartar a tag de orientação da imagem?',
          a: 'A tag de orientação (EXIF Orientation) informa ao visualizador se a foto foi tirada na vertical ou horizontal. Se ela for removida, fotos tiradas em pé podem aparecer deitadas em alguns leitores mais antigos. Por padrão, mantemos essa tag numérica inofensiva para preservar a visualização correta, mas você pode desmarcá-la para expurgar 100% de qualquer cabeçalho adicional.',
        },
      ],
    },
    en: {
      features: ['GPS and camera metadata stripping', 'Zero re-compression byte copy', 'JPEG, PNG and WebP compatible', 'Live metadata preview before clean'],
      faq: [
        {
          q: 'Do smartphone and camera photos really store my exact location?',
          a: 'Yes. When location services are enabled on your camera or phone, exact GPS coordinates (latitude, longitude, altitude) are written directly into the image EXIF tags with enough precision to pinpoint a specific doorstep. Nada Sai parses these metadata blocks and displays all detected coordinates and camera hardware tags so you can verify what is stored before scrubbing.',
        },
        {
          q: 'Does stripping EXIF metadata degrade image quality or compress pixels?',
          a: 'No. Our tool operates at the raw binary container level (such as APP1 segments in JPEG or eXIf chunks in PNG and WebP). The compressed image raster payload is copied verbatim byte for byte without canvas re-rasterization or lossy re-encoding. The resulting photo retains 100% of its original pixel clarity and visual fidelity.',
        },
        {
          q: 'What is the hidden embedded thumbnail found inside EXIF headers?',
          a: 'Many camera apps generate a tiny, low-resolution thumbnail preview of the scene and pack it into the EXIF header. When an image is cropped or redacted using typical graphic editors, that embedded thumbnail is frequently left untouched, meaning the full uncensored original picture remains recoverable. Nada Sai flags and strips all embedded thumbnails completely.',
        },
        {
          q: 'Why should I choose to keep or strip the orientation tag?',
          a: 'The EXIF orientation tag is a single integer that indicates whether a photo was shot in portrait or landscape. Stripping it may cause portrait photos to rotate sideways in certain third-party viewers. We retain this harmless tag by default to preserve display orientation, but you can opt to strip it along with every other header.',
        },
      ],
    },
  },

  'redact-image': {
    pt: {
      features: ['Tarja preta destrutiva irreversível', 'Pixelização para rostos e cenários', 'Queima direta nos pixels', 'Sem envio para servidores'],
      faq: [
        {
          q: 'A tarja preta pode ser removida ou desfeita por terceiros?',
          a: 'Não. Quando você aplica uma tarja preta e baixa a imagem, os valores RGB de todos os pixels sob aquela área são permanentemente substituídos por preto puro (RGB 0,0,0) no novo raster. Não se trata de uma camada flutuante, anotação vetorial ou máscara oculta que possa ser deletada no Photoshop ou visualizador: a informação original é totalmente destruída e irrecuperável.',
        },
        {
          q: 'A pixelização é tão segura quanto a tarja preta para ocultar dados?',
          a: 'Não para textos curtos e previsíveis. Pesquisas de segurança demonstraram que textos pixelizados com números de cartão, CPF, RG ou senhas podem ser reconstruídos por algoritmos de despixelização (como Depix) que testam padrões de fontes conhecidas. Para dados alfanuméricos e documentos confidenciais, use sempre a Tarja Preta. A pixelização é indicada para desfocar rostos, placas e planos de fundo.',
        },
        {
          q: 'Como censurar CPF, RG, cartão de crédito ou dados sensíveis em documentos?',
          a: 'Arraste a foto do documento para a ferramenta, selecione a ferramenta "Tarja Preta", clique e arraste sobre o número do documento, código de segurança (CVV) ou assinatura garantindo que a caixa cubra toda a área com margem. Se errar a posição, basta clicar no ícone de exclusão da tarja para refazer antes de baixar.',
        },
        {
          q: 'A resolução ou a nitidez da imagem é afetada durante a censura?',
          a: 'A imagem é redesenhada nas dimensões e resolução nativa em canvas de alta definição e exportada no mesmo formato de origem. Para arquivos PNG a exportação é sem perdas; para arquivos JPEG, ocorre uma recodificação com fator de qualidade alto (92%) inerente à alteração dos pixels da imagem.',
        },
      ],
    },
    en: {
      features: ['Irreversible destructive black bar', 'Pixelation for faces and background', 'Burned directly into raster pixels', 'Zero server transmission'],
      faq: [
        {
          q: 'Can a black bar applied here be undone or removed by someone else?',
          a: 'No. When you apply a solid black bar and export the image, the underlying RGB values of those pixels are permanently overwritten with solid black (RGB 0,0,0) on the raster canvas. There is no floating annotation layer, vector object, or hidden mask that can be peeled away in Photoshop or preview tools — the original data is destroyed.',
        },
        {
          q: 'Is pixelation as secure as a solid black bar for hiding confidential data?',
          a: 'No for short or predictable text. Modern security research shows that pixelated ID numbers, credit card digits, and passwords can sometimes be reconstructed using automated matching attacks against standard font sets. Always use a solid Black Bar for sensitive text and numbers. Pixelation is designed for faces, license plates, and background scenery.',
        },
        {
          q: 'How do I safely redact an ID card, CPF, credit card, or sensitive document?',
          a: 'Drop the document photo into the editor, activate "Black Bar" mode, and drag rectangles over sensitive numbers, signatures, or personal identifiers. Ensure full boundary coverage. If you misjudge a box, click the X icon on that specific box to delete and redraw before exporting.',
        },
        {
          q: 'Does redacting an image reduce its original resolution or clarity?',
          a: 'The redacted image is rendered at full native resolution on a high-precision canvas and exported in your original container format. PNG files export losslessly; JPEG files undergo a single high-quality re-encode (92%) which is standard when modifying raster pixel data.',
        },
      ],
    },
  },

  'redact-pdf': {
    pt: {
      features: ['Destruição permanente da camada de texto', 'Suporte a múltiplas páginas', 'Compatível com PDF protegido por senha', 'Processamento 100% offline'],
      faq: [
        {
          q: 'Por que apenas desenhar um retângulo preto sobre o PDF é perigoso?',
          a: 'Porque em editores comuns de PDF um retângulo preto é apenas um elemento gráfico desenhado por cima da página. O texto original continua existindo na camada vetorial subjacente e pode ser facilmente lido com Ctrl+C / Ctrl+V, ferramentas de OCR, leitores de tela ou comandos como "strings". No Nada Sai, a página censurada é reconstruída como uma imagem rasterizada em alta resolução, destruindo fisicamente a camada de texto sensível.',
        },
        {
          q: 'O PDF continuará pesquisável com Ctrl+F após a censura?',
          a: 'Não, e essa é a garantia fundamental de segurança contra vazamentos. Como a página inteira é convertida em imagem rasterizada com os pixels sensíveis queimados em preto, a camada de texto oculta deixa de existir no arquivo exportado. Isso impede que robôs, indexadores ou pessoas extraiam o conteúdo tarjado.',
        },
        {
          q: 'A ferramenta funciona com arquivos PDF protegidos por senha?',
          a: 'Sim. Se o arquivo estiver protegido com senha de abertura ou de permissão, a interface solicitará a chave correta, desbloqueará o documento localmente no navegador e permitirá aplicar as tarjas normalmente em todas as páginas.',
        },
        {
          q: 'Posso aplicar tarjas em diferentes páginas antes de exportar o arquivo?',
          a: 'Sim. Você pode navegar livremente entre todas as páginas do documento, desenhar múltiplas tarjas pretas em cada uma delas e revisar todo o trabalho no painel antes de acionar a exportação única do PDF final.',
        },
      ],
    },
    en: {
      features: ['Permanent text layer destruction', 'Multi-page document support', 'Password-protected PDF compatible', '100% offline local execution'],
      faq: [
        {
          q: 'Why is simply drawing a black box on a PDF insecure and dangerous?',
          a: 'Because standard PDF editors simply place a visual vector rectangle on top of the existing text. The underlying text remains completely intact in the document stream and can be revealed by copy-pasting, screen readers, or text extraction utilities. In Nada Sai, redacted pages are rendered to high-resolution raster images, physically destroying the underlying text stream.',
        },
        {
          q: 'Will the PDF remain searchable with Ctrl+F after redaction?',
          a: 'No, and that is the critical security trade-off. Because the document pages are converted to pure raster images with redacted pixels burned into black, the machine-readable text stream is stripped entirely. This guarantees that no search tool or string extractor can recover the hidden information.',
        },
        {
          q: 'Does the redaction tool work on password-protected PDF files?',
          a: 'Yes. If your document requires a password to open, the tool prompts for the password, decrypts the document in local memory, and allows you to apply redaction boxes across any page without uploading anything.',
        },
        {
          q: 'Can I redact different sections across multiple pages before exporting?',
          a: 'Yes. You can paginate through the entire PDF, draw distinct redaction boxes across separate pages, review the coverage in the thumbnail view, and download the finished redacted document in a single export.',
        },
      ],
    },
  },

  'clean-pdf-metadata': {
    pt: {
      features: ['Limpeza de autor, software e datas', 'Remoção completa do bloco XMP', 'Expurgo de caminhos locais e usuário', 'Preservação do texto vetorial'],
      faq: [
        {
          q: 'Que tipos de informações ocultas um PDF armazena sem o meu conhecimento?',
          a: 'Documentos PDF costumam carregar metadados como nome do autor, empresa, aplicativo gerador (Word, InDesign, Canva), versão do sistema operacional, datas exatas de criação e modificação, título do documento e um bloco XML XMP completo. Programas gráficos ainda gravam histórico de revisões, nomes de usuário e caminhos de pastas locais da máquina do criador. O Nada Sai lista todos os dados encontrados antes de expurgá-los.',
        },
        {
          q: 'A limpeza de metadados altera a formatação ou o texto do documento?',
          a: 'Não. O texto vetorial, as imagens embutidas, os formulários e a paginação permanecem 100% inalterados e totalmente pesquisáveis via Ctrl+F. Apenas os dicionários de metadados (/Info, /Metadata e pacotes XMP) são removidos da estrutura interna do PDF.',
        },
        {
          q: 'A remoção de metadados é definitiva ou apenas oculta os campos?',
          a: 'É uma remoção física e definitiva. O objeto de metadados é desvinculado da árvore do catálogo do PDF e seus bytes são eliminados do arquivo exportado. Se alguém abrir o documento em um editor hexadecimal ou utilitário de inspeção, o nome do autor e os metadados anteriores não estarão presentes.',
        },
        {
          q: 'O que não é removido durante a limpeza de metadados do PDF?',
          a: 'Metadados proprietários embutidos diretamente dentro de imagens internas do PDF (como dados EXIF de fotos JPEG inseridas nas páginas) pertencem ao fluxo da própria imagem. Para máxima confidencialidade, recomendamos limpar as imagens com o Removedor de EXIF antes de adicioná-las ao PDF.',
        },
      ],
    },
    en: {
      features: ['Cleans author, software and dates', 'Complete XMP block purge', 'Scrubs device paths and username', 'Full vector text preservation'],
      faq: [
        {
          q: 'What hidden metadata does a PDF file store without my knowledge?',
          a: 'PDF files routinely embed the creator’s real name, organization, authoring software (e.g. Word, Illustrator), operating system version, creation and modification timestamps, and full XMP metadata trees. Graphic suites often append device usernames, local file paths, and edit histories. Nada Sai lists all discovered fields before purging them.',
        },
        {
          q: 'Does cleaning metadata alter the formatting or text content of the PDF?',
          a: 'No. Vector text, typography, fonts, embedded images, and layout remain completely intact, and the document stays fully searchable with Ctrl+F. Only document dictionary metadata blocks (/Info, /Metadata, and XMP streams) are removed from the PDF structure.',
        },
        {
          q: 'Is the metadata removal permanent or does it simply hide the properties?',
          a: 'It is a permanent binary removal. The metadata objects are unlinked from the PDF trailer catalog and their byte streams are purged from the output file. Inspecting the exported PDF with hexadecimal viewers or forensic string tools confirms the author and software tags are gone.',
        },
        {
          q: 'What metadata is not covered during document-level PDF sanitization?',
          a: 'Metadata embedded inside internal image streams (such as EXIF headers inside JPEG photos embedded on a page) resides inside the image data rather than the PDF header. For complete sanitization of scanned photos, scrub image EXIF before creating the PDF.',
        },
      ],
    },
  },

  'password-generator': {
    pt: {
      features: ['Gerador CSPRNG criptográfico', 'Cálculo real de entropia em bits', 'Tamanho de até 128 caracteres', 'Garantia de regras e sem envio à rede'],
      faq: [
        {
          q: 'As senhas geradas nesta ferramenta são realmente seguras e imprevisíveis?',
          a: 'Sim. A geração utiliza exclusivamente crypto.getRandomValues, o gerador de números pseudoaleatórios criptograficamente seguro (CSPRNG) integrado ao núcleo do navegador, com algoritmo de amostragem por rejeição para evitar qualquer viés estatístico na distribuição dos caracteres. Nenhuma senha gerada é gravada em histórico, cookies ou transmitida pela rede.',
        },
        {
          q: 'O que representa o cálculo de entropia exibido na ferramenta?',
          a: 'A entropia mede a quantidade de aleatoriedade da senha em bits (calculada pela fórmula H = L × log2(N), onde L é o comprimento e N é o tamanho do conjunto de caracteres selecionado). Cada bit adicional dobra o número de tentativas necessárias para um ataque de força bruta. Senhas acima de 80 bits são computacionalmente invulneráveis a ataques práticos modernos.',
        },
        {
          q: 'É melhor criar uma senha muito longa ou uma senha com caracteres complexos?',
          a: 'Aumentar o comprimento da senha é infinitamente mais eficaz do que apenas adicionar símbolos complexos. Uma senha com 20 caracteres simples oferece um espaço combinatório astronômico muito superior a uma senha curta de 8 caracteres cheia de símbolos difíceis de memorizar e digitar.',
        },
        {
          q: 'A ferramenta garante a presença de todos os tipos de caracteres selecionados?',
          a: 'Sim. Nosso gerador garante que ao menos um caractere de cada categoria marcada (maiúsculas, minúsculas, números e símbolos) seja obrigatoriamente incluído e distribuído aleatoriamente na senha, atendendo a políticas corporativas rígidas de segurança sem comprometer a entropia matemática.',
        },
      ],
    },
    en: {
      features: ['Cryptographic CSPRNG generator', 'Real entropy calculation in bits', 'Length up to 128 characters', 'Rule-enforced with zero network use'],
      faq: [
        {
          q: 'Are the passwords generated here truly random and secure?',
          a: 'Yes. Generation relies exclusively on crypto.getRandomValues, the browser’s native Cryptographically Secure Pseudo-Random Number Generator (CSPRNG), paired with unbiased rejection sampling. Generated passphrases never leave local RAM, are never logged in history or cookies, and disappear when the tab closes.',
        },
        {
          q: 'What does the entropy score in bits mean for password strength?',
          a: 'Entropy quantifies the mathematical unpredictability of the password in bits, calculated as H = L × log2(N) where L is length and N is the character pool size. Each additional bit doubles the brute-force search space. Passwords above 80 bits of entropy are virtually impossible to crack with current supercomputing hardware.',
        },
        {
          q: 'Is it better to create a longer password or a more complex one?',
          a: 'Length is significantly more effective than complex character substitution. A 20-character password drawn from alphanumeric characters provides a vastly larger search space than an 8-character password packed with obscure symbols that is difficult to remember and type.',
        },
        {
          q: 'Does the generator guarantee every selected character type appears?',
          a: 'Yes. The algorithm enforces at least one character from each checked category (uppercase, lowercase, digits, symbols) before performing a cryptographic shuffle, satisfying enterprise password complexity policies without overstating the true entropy.',
        },
      ],
    },
  },

  'file-hash': {
    pt: {
      features: ['Cálculo SHA-256, SHA-512 e MD5', 'Leitura streaming em blocos de 4 MB', 'Verificação automática de checksum', 'Suporte a arquivos gigabytes'],
      faq: [
        {
          q: 'O que é e para que serve o hash criptográfico de um arquivo?',
          a: 'O hash é uma impressão digital matemática única calculada a partir dos bytes exatos de um arquivo. Qualquer alteração em um único bit do arquivo — seja por download corrompido, vírus ou adulteração maliciosa — altera completamente o hash gerado. Ele serve para auditar a autenticidade e a integridade de softwares, ISOs e documentos.',
        },
        {
          q: 'Posso colar diretamente uma linha de arquivo .sha256sum para comparar?',
          a: 'Sim. A ferramenta possui um analisador inteligente no campo de comparação: você pode colar hashes simples ou linhas inteiras de arquivos de manifesto (formato "hash  nome_do_arquivo"). Ela extrai automaticamente o hash, compara com o valor calculado e sinaliza em verde quando há correspondência exata.',
        },
        {
          q: 'Qual algoritmo de hash devo escolher entre SHA-256, SHA-512 e MD5?',
          a: 'Para verificações de segurança e integridade modernas, use sempre SHA-256 ou SHA-512. O algoritmo MD5 é mantido apenas por compatibilidade com sistemas legados e checksums antigos, mas é considerado criptograficamente vulnerável a colisões intencionais.',
        },
        {
          q: 'Existe limite de tamanho para calcular o hash de arquivos grandes?',
          a: 'Para SHA-256 e MD5, a leitura é feita em streaming incremental por blocos de 4 MB via FileReader, permitindo processar arquivos de múltiplos gigabytes sem esgotar a memória RAM do computador. Para SHA-512, que exige o buffer integral na Web Crypto API, o limite recomendado é de até 512 MB.',
        },
      ],
    },
    en: {
      features: ['SHA-256, SHA-512 and MD5 hashing', '4 MB chunked stream processing', 'Automated checksum comparison', 'Multi-gigabyte file support'],
      faq: [
        {
          q: 'What is a cryptographic file hash and why is it useful?',
          a: 'A cryptographic hash is a unique digital fingerprint computed from a file’s exact byte sequence. Changing even a single bit in the file completely changes the resulting hash digest. Hashes allow you to verify that downloaded software, disk images, or documents have arrived intact and free from tampering or corruption.',
        },
        {
          q: 'Can I paste a checksum directly from a .sha256sum or md5 file?',
          a: 'Yes. The comparison tool automatically parses standard manifesto formats (e.g. "hash  filename.iso"). It extracts the hex hash string, matches it against all computed algorithms, and displays a green match indicator when identical.',
        },
        {
          q: 'Which hashing algorithm should I choose between SHA-256, SHA-512, and MD5?',
          a: 'Always choose SHA-256 or SHA-512 for modern verification and security tasks. MD5 is provided strictly for backwards compatibility with legacy file repositories, as it is vulnerable to collision attacks and is no longer recommended for cryptographic security.',
        },
        {
          q: 'Is there a file size limit when calculating hashes on large files?',
          a: 'SHA-256 and MD5 are processed using incremental 4 MB streaming chunks via the browser FileReader API, allowing seamless calculation on multi-gigabyte ISOs and videos without memory strain. SHA-512 uses Web Crypto in-memory buffers and is recommended for files up to 512 MB.',
        },
      ],
    },
  },

  'encrypt-text': {
    pt: {
      features: ['Criptografia AES-256-GCM', 'Bloco de texto blindado para mensagens', 'Envelope compatível com arquivos .enc', 'Sem servidores e sem logs'],
      faq: [
        {
          q: 'Como funciona o envio de mensagens e textos criptografados com senha?',
          a: 'Você escreve ou cola o texto desejado, define uma senha secreta e a ferramenta gera um bloco de texto blindado codificado em Base64 com marcadores de início e fim. Esse bloco pode ser copiado e enviado com segurança por qualquer canal comum (WhatsApp, Telegram, e-mail, notas ou comentários). Quem receber a mensagem cola o bloco nesta ferramenta, digita a senha acordada e lê o conteúdo descriptografado.',
        },
        {
          q: 'O que acontece se o aplicativo de mensagens quebrar as linhas do bloco?',
          a: 'O decodificador do Nada Sai foi projetado com tolerância a formatações: ele remove automaticamente quebras de linha indesejadas, espaços extras, tabulações e até textos ou saudações adicionadas ao redor do envelope criptografado, recuperando o conteúdo original sem erros de decodificação.',
        },
        {
          q: 'Como devo combinar e compartilhar a senha com o destinatário da mensagem?',
          a: 'A senha nunca deve ser enviada pelo mesmo canal em que a mensagem criptografada está sendo transmitida. Combine a senha pessoalmente, por ligação telefônica ou por outro aplicativo seguro. Enviar a mensagem e a senha na mesma conversa anula toda a proteção criptográfica.',
        },
        {
          q: 'Este formato de texto criptografado é compatível com a ferramenta de arquivos?',
          a: 'Sim. A estrutura de dados e os parâmetros criptográficos (AES-256-GCM com PBKDF2) são idênticos aos utilizados na ferramenta de criptografia de arquivos do Nada Sai. Você pode inclusive descriptografar o conteúdo de um arquivo .enc colando seu texto nesta ferramenta e vice-versa.',
        },
      ],
    },
    en: {
      features: ['AES-256-GCM cipher encryption', 'Armored pasteable text envelope', 'Compatible with .enc file format', 'Zero server logs or relays'],
      faq: [
        {
          q: 'How do I send encrypted notes and messages safely?',
          a: 'Type your message, enter a secret password, and click to generate a Base64-armored text envelope with header tags. This plain text block can be sent over any ordinary communication channel (email, chat, SMS, forums). The recipient simply pastes the block back into this tool, supplies the shared password, and reads the original decrypted text.',
        },
        {
          q: 'What happens if an email or chat client line-breaks the encrypted block?',
          a: 'Nada Sai’s payload parser is resilient against formatting changes: it cleans extraneous whitespace, carriage returns, tab characters, and surrounding greeting text, recovering the core ciphertext envelope cleanly.',
        },
        {
          q: 'How should I securely exchange the decryption password with the recipient?',
          a: 'Never send the password through the same chat or email thread where the encrypted block travels. Share the password via a separate out-of-band channel (such as a voice call, in-person meeting, or encrypted signal app). Sharing both together negates the security guarantee.',
        },
        {
          q: 'Is this encrypted text format compatible with the file encryption tool?',
          a: 'Yes. The underlying cryptographic schema (AES-256-GCM with PBKDF2-SHA256) is identical to Nada Sai’s file encryption engine. You can paste the raw contents of a .enc file into this tool or convert text envelopes interchangeably.',
        },
      ],
    },
  },

  'diff-checker': {
    pt: {
      features: ['Algoritmo de Myers otimizado', 'Numeração de linhas e destaque visual', 'Exportação de patch Unified Diff', 'Até 20.000 linhas 100% offline'],
      faq: [
        {
          q: 'Como comparar dois textos ou arquivos de código para encontrar diferenças?',
          a: 'Cole ou arraste os dois arquivos (original à esquerda e modificado à direita). O comparador executa o algoritmo de diff em tempo real e destaca visualmente as linhas adicionadas (em verde), removidas (em vermelho) e modificadas, mantendo a numeração de linhas sincronizada para fácil localização no seu editor.',
        },
        {
          q: 'A ferramenta suporta arquivos extensos com milhares de linhas?',
          a: 'Sim. A ferramenta suporta arquivos com até 20.000 linhas por lado e cerca de 10 MB de texto. O motor aplica pré-processamento para aparar prefixos e sufixos idênticos antes de calcular o grafo de edições de Myers, tornando a comparação praticamente instantânea mesmo em códigos volumosos.',
        },
        {
          q: 'É seguro comparar contratos confidenciais, termos legais e código proprietário?',
          a: 'Sim, 100% seguro. Como toda a lógica de comparação roda exclusivamente dentro do seu navegador via JavaScript, nenhum caractere de texto ou trecho de código é enviado para servidores externos. É a ferramenta ideal para advogados, auditores e programadores que não podem usar comparadores online convencionais.',
        },
        {
          q: 'Posso exportar e salvar o relatório das alterações encontradas?',
          a: 'Sim. Você pode baixar um arquivo de patch no formato padronizado Unified Diff (.diff/.patch), compatível com Git, SVN e sistemas de controle de versão, ou copiar o resumo das modificações diretamente para a área de transferência.',
        },
      ],
    },
    en: {
      features: ['Optimized Myers diff algorithm', 'Line numbering & visual highlights', 'Unified Diff patch download', 'Up to 20,000 lines 100% offline'],
      faq: [
        {
          q: 'How do I compare two texts or code files to highlight differences?',
          a: 'Paste or drop your two texts into the side-by-side comparison panes (original on the left, modified on the right). The engine calculates the diff in real time, color-coding added lines in green, deleted lines in red, and syncing line numbers for easy review in your IDE or text editor.',
        },
        {
          q: 'Can the diff checker handle large documents with thousands of lines?',
          a: 'Yes. The tool handles up to 20,000 lines per side and 10 MB per file. It utilizes prefix and suffix pruning before executing Myers shortest-edit-path algorithm, making diff calculations near instantaneous even on large source code repositories.',
        },
        {
          q: 'Is it safe to compare proprietary code and confidential legal contracts?',
          a: 'Yes, 100% private and secure. All text parsing and comparison happens strictly within your local browser sandbox. No proprietary code, intellectual property, or confidential legal clauses are ever uploaded to cloud servers.',
        },
        {
          q: 'Can I export and download a unified patch of the differences?',
          a: 'Yes. You can download a standard Unified Diff patch file (.diff/.patch), fully compatible with Git and version control patch tools, or copy the formatted difference summary directly to your clipboard.',
        },
      ],
    },
  },

  'remove-bg': {
    pt: {
      features: ['Modelo de IA IS-Net executado localmente', 'Pincel de retoque de precisão', 'Recorte com transparência real em PNG', 'Sem limite de imagens e sem upload'],
      faq: [
        {
          q: 'Como remover o fundo de uma foto automaticamente com inteligência artificial?',
          a: 'Basta soltar a foto no dropzone: a ferramenta inicializa automaticamente o modelo neural IS-Net compilado em WebAssembly/WebGPU, detecta o objeto ou pessoa principal e separa o primeiro plano do fundo em segundos, gerando um arquivo PNG com canal alfa de transparência real de alta fidelidade.',
        },
        {
          q: 'A ferramenta funciona bem para logotipos, assinaturas e ilustrações gráficas?',
          a: 'Sim. A ferramenta conta com dois motores complementares: para fotografias e retratos, utiliza a rede neural de IA; para artes gráficas, assinaturas e logotipos com cores sólidas, aciona o algoritmo de amostragem por cor nas bordas. Isso garante que logos não sofram com bordas serrilhadas e assinaturas fiquem perfeitamente limpas.',
        },
        {
          q: 'Como corrigir pequenos detalhes ou áreas que o recorte automático cortou errado?',
          a: 'A ferramenta disponibiliza um pincel de retoque interativo com controle de espessura e zoom: você pode alternar entre os modos "Apagar" (para remover sobras de fundo) e "Restaurar" (que pinta de volta os pixels exatos da foto original). Cada traço do pincel possui histórico com suporte a desfazer e refazer (Ctrl+Z).',
        },
        {
          q: 'A foto precisa ser enviada para algum servidor de inteligência artificial?',
          a: 'Não. O modelo de inteligência artificial de ~42 MB é baixado uma única vez pelo navegador e executado diretamente na GPU/CPU do seu dispositivo. Após o primeiro carregamento, você pode inclusive desligar a internet e continuar removendo o fundo de quantas fotos quiser offline e sem mensalidade.',
        },
      ],
    },
    en: {
      features: ['Local in-browser IS-Net AI model', 'Precision retouch restore/erase brush', 'Full PNG alpha transparency export', 'Unlimited images with zero uploads'],
      faq: [
        {
          q: 'How do I remove the background from an image automatically with AI?',
          a: 'Simply drop your image into the dropzone: the app automatically loads the neural IS-Net model compiled in WebAssembly/WebGPU, segments the primary foreground subject, and generates a transparent PNG with real alpha channel in seconds, all within your browser tab.',
        },
        {
          q: 'Does background removal work well for logos, line art, and graphics?',
          a: 'Yes. The tool features two specialized engines: photographs run through the deep learning AI model, while flat graphic logos, signatures, and icons process through edge-sampled chroma keying. This prevents speckled edges on sharp graphics while preserving delicate hair details on portraits.',
        },
        {
          q: 'How can I touch up or restore parts of the image that were cut incorrectly?',
          a: 'Use the built-in interactive Retouch Brush: zoom into the canvas and toggle between "Erase" (to clean up remaining backdrop) and "Restore" (which paints back the exact raw pixels from the original photo). Every brush stroke is tracked in an undo/redo history stack.',
        },
        {
          q: 'Does the image get uploaded to an external AI cloud processing server?',
          a: 'No. The ~42 MB ONNX neural network model is downloaded once into your browser cache and runs entirely client-side. You can disconnect your Wi-Fi and continue segmenting unlimited high-resolution photos completely offline without subscriptions or quotas.',
        },
      ],
    },
  },

  vectorize: {
    pt: {
      features: ['Conversão raster para SVG vetorial', 'Ajuste de curvas Bézier sem frestas', 'Preservação de transparência alfa', 'Modos para Logo, Traço e Ilustração'],
      faq: [
        {
          q: 'O que significa vetorizar uma imagem e quais as vantagens do formato SVG?',
          a: 'Vetorizar é o processo matemático de converter uma grade de pixels estática (PNG ou JPG) em fórmulas geométricas e curvas Bézier vetoriais (SVG). A grande vantagem é a escalabilidade infinita: um arquivo SVG pode ser ampliado para o tamanho de um outdoor ou fachada comercial sem perder nitidez ou pixelar, sendo o formato exigido por gráficas, corte a laser, bordados e design profissional.',
        },
        {
          q: 'Por que o vetorizador do Nada Sai não deixa linhas brancas entre as cores?',
          a: 'A maioria dos conversores traça cada forma colorida individualmente, criando pequenas discrepâncias de arredondamento que geram frestas brancas visíveis entre as cores. Nosso motor extrai o grafo de fronteiras topológico da imagem e ajusta cada fronteira uma única vez: as regiões vizinhas compartilham exatamente a mesma curva geométrica, eliminando qualquer costura.',
        },
        {
          q: 'Como escolher o melhor modo entre Traço, Logo, Ilustração e Pixel Art?',
          a: 'O modo Traço é perfeito para assinaturas digitalizadas e desenhos em preto e branco; Logo é otimizado para marcas com paleta de poucas cores e formas limpas; Ilustração preserva degradês suaves e sombreamento; e Pixel Art mantém os cantos retos de sprites de jogos sem suavização indesejada. O controle de detalhes permite calibrar o número de curvas geradas.',
        },
        {
          q: 'Uma imagem PNG com fundo transparente permanece transparente após vetorizar?',
          a: 'Sim. As áreas com canal alfa transparente são identificadas e descartadas na geração das formas, resultando em um SVG com fundo verdadeiramente vazado e contornos nítidos calculados com precisão sub-pixel.',
        },
        {
          q: 'É recomendável vetorizar fotos de pessoas ou paisagens reais?',
          a: 'Não é o uso ideal. Fotografias contêm milhões de variações de cor contínuas e texturas orgânicas; vetorizá-las gera milhares de polígonos complexos, resultando em um arquivo SVG excessivamente pesado e visualmente estilizado. Vetorização é recomendada para logotipos, ícones, traços, tipografia e ilustrações.',
        },
      ],
    },
    en: {
      features: ['Raster to vector SVG conversion', 'Seamless single-pass Bézier curves', 'Alpha transparency preservation', 'Presets for Logos, Line Art & Art'],
      faq: [
        {
          q: 'What does vectorizing an image mean and what are the advantages of SVG?',
          a: 'Vectorizing converts a fixed raster pixel grid (PNG or JPG) into mathematically defined geometric paths and Bézier curves (SVG). The primary benefit is infinite scalability: an SVG can be scaled up to billboard size without pixelation or blur, making it the mandatory standard for printing presses, laser cutters, embroidery machines, and graphic branding.',
        },
        {
          q: 'Why does Nada Sai avoid the white hairline gaps between adjacent colors?',
          a: 'Standard vectorizers trace each colored region in isolation, producing subtle fitting rounding errors that leave visible hairline gaps between touching boundaries. Our vector engine extracts a unified boundary graph, fitting each shared edge exactly once so adjacent colored paths snap together seamlessly.',
        },
        {
          q: 'How should I select between Line Art, Logo, Illustration, and Pixel Art modes?',
          a: 'Line Art is ideal for scanned signatures and monochrome schematics; Logo is tuned for flat branding icons and distinct color palettes; Illustration preserves subtle gradients; and Pixel Art locks sharp square pixel boundaries for game assets. The detail slider fine-tunes path complexity.',
        },
        {
          q: 'Does a transparent PNG retain its transparent background when converted to SVG?',
          a: 'Yes. Alpha transparency channels are detected during boundary extraction and omitted from SVG path generation, leaving pure transparent negative space around the vectorized subject with sub-pixel boundary accuracy.',
        },
        {
          q: 'Is it recommended to vectorize realistic photographs of people or landscapes?',
          a: 'Generally no. Continuous-tone photographs contain millions of subtle gradients; vectorizing photographic scenes produces tens of thousands of heavy paths resulting in massive SVG file sizes. Vectorization is engineered for logos, icons, line art, lettering, and graphic illustrations.',
        },
      ],
    },
  },

  upscale: {
    pt: {
      features: ['Ampliação 2x e 4x de alta fidelidade', 'Reconstrução de bordas sem borrão', 'Ajuste fino de nitidez e clareza', 'Canvas de alta performance no cliente'],
      faq: [
        {
          q: 'Como aumentar o tamanho e a resolução de uma imagem sem deixá-la borrada?',
          a: 'Selecione o fator de escala desejado (2x ou 4x) e ajuste o controle de nitidez. Para ampliações de 4x, o processamento é executado em duas passagens sequenciais de 2x com interpolação de alta precisão e filtro de reconstrução de bordas, evitando o aspecto leitoso e desfocado de redimensionamentos comuns.',
        },
        {
          q: 'O algoritmo inventa novos detalhes que não existiam na foto original?',
          a: 'Não. Nossa abordagem foca em reamostragem matemática avançada com preservação de gradientes, realce de contornos e antisserrilhamento de alta fidelidade. Ela recupera a nitidez e a definição do conteúdo real da foto, sem inventar alucinações artificiais ou distorcer feições faciais.',
        },
        {
          q: 'Qual é o limite de tamanho para aumentar imagens na ferramenta?',
          a: 'O limite prático depende da memória RAM disponível na aba do navegador. Uma foto de 12 megapixels ampliada em 4x resulta em quase 200 milhões de pixels, demandando centenas de megabytes em memória de canvas. Para imagens já muito grandes, a opção 2x oferece o melhor equilíbrio de nitidez e estabilidade.',
        },
        {
          q: 'A imagem ampliada mantém a qualidade adequada para impressão gráfica?',
          a: 'Sim, a ampliação com reconstrução de bordas suaviza a pixelização em ampliações moderadas, permitindo alcançar resoluções de 300 DPI adequadas para impressão em papel, banners e materiais promocionais.',
        },
      ],
    },
    en: {
      features: ['High-fidelity 2x and 4x upscaling', 'Edge reconstruction with no blur', 'Fine-tuned sharpness controls', 'High-performance client-side Canvas'],
      faq: [
        {
          q: 'How do I increase image size and resolution without making it blurry?',
          a: 'Select your preferred upscale multiplier (2x or 4x) and fine-tune the sharpness slider. For 4x enlargement, the engine processes two sequential 2x passes with high-precision interpolation and edge-sharpening filters, preventing the milky, blurry artifacts typical of basic bicubic resizing.',
        },
        {
          q: 'Does this upscaler hallucinate synthetic details not in the original photo?',
          a: 'No. Our algorithm emphasizes deterministic edge reconstruction, contrast preservation, and anti-aliasing. It maximizes the clarity and definition of genuine image details without hallucinating synthetic textures or distorting facial features.',
        },
        {
          q: 'What is the maximum resolution and size limit when upscaling photos?',
          a: 'The limit is bounded by your browser tab’s canvas memory allocation. Upscaling a 12 MP photo by 4x yields nearly 200 million pixels (around 800 MB in uncompressed RGBA canvas memory). For already large photos, 2x upscaling provides optimal sharpness and performance.',
        },
        {
          q: 'Will the enlarged image maintain sufficient sharpness for physical printing?',
          a: 'Yes. The edge-reconstruction engine eliminates visible pixel stepping, bringing medium-resolution graphics and photos closer to the 300 DPI print threshold required for brochures, posters, and physical prints.',
        },
      ],
    },
  },

  'extract-text': {
    pt: {
      features: ['OCR em português, inglês e caracteres especiais', 'Extração de fotos, prints e escaneamentos', 'Cópia direta e download em TXT', 'Reconhecimento 100% no navegador'],
      faq: [
        {
          q: 'Como extrair texto de fotos, capturas de tela e documentos escaneados?',
          a: 'Arraste a imagem ou print para a ferramenta: o motor de OCR Tesseract baseado em WebAssembly é carregado na aba, analisa a distribuição geométrica das linhas e caracteres e extrai todo o texto em formato editável, permitindo copiar com um clique ou baixar como arquivo .txt.',
        },
        {
          q: 'O leitor de OCR reconhece caracteres com acentuação e pontuação em português?',
          a: 'Sim. Os dicionários treinados para português (com suporte completo a cedilha, acento agudo, circunflexo, til e crase) e inglês são carregados simultaneamente, garantindo alta precisão no reconhecimento de documentos brasileiros, notas fiscais e contratos bilíngues.',
        },
        {
          q: 'Por que algumas palavras podem ser reconhecidas com erros ou trocar letras?',
          a: 'A precisão do OCR depende diretamente da resolução e do contraste da imagem. Fotos borradas, com baixa iluminação, sombras sobre o papel, ângulos tortos ou resolução abaixo de 150 DPI dificultam a segmentação de caracteres. Garantir um bom enquadramento e iluminação melhora drasticamente a extração.',
        },
        {
          q: 'A ferramenta é capaz de reconhecer e transcrever escrita manual à mão?',
          a: 'O motor é otimizado para caracteres tipográficos e textos impressos. Textos escritos à mão (cursivos ou caligrafia livre) e fontes excessivamente decorativas possuem variações que podem reduzir a taxa de acerto do OCR automático.',
        },
      ],
    },
    en: {
      features: ['OCR in Portuguese, English & accents', 'Extracts from photos, screens & scans', 'Direct copy & TXT file download', '100% client-side recognition'],
      faq: [
        {
          q: 'How do I extract editable text from photos, screenshots, and scanned pages?',
          a: 'Drop your photo or screenshot into the tool: the WebAssembly-powered Tesseract OCR engine scans the pixel layout, identifies text lines, and extracts readable text directly in your browser. You can copy the result with one click or download it as a .txt file.',
        },
        {
          q: 'Does the OCR engine recognize accented Portuguese and special characters?',
          a: 'Yes. Trained language datasets for both Portuguese (including full diacritics like ç, ã, é, ó) and English load concurrently, ensuring reliable character recognition across invoices, receipts, and multilingual legal contracts.',
        },
        {
          q: 'Why might some words be misrecognized or contain typographical errors?',
          a: 'OCR accuracy correlates directly with image sharpness, contrast, and resolution. Low-light phone photos, angled shots, shadows across text, or images under 150 DPI can cause letter confusion. Straightening and increasing contrast yields optimal extraction.',
        },
        {
          q: 'Can the OCR tool reliably transcribe handwritten notes or cursive text?',
          a: 'The engine is trained specifically for printed typography, machine fonts, and digital screens. Freeform cursive handwriting and decorative scripts are outside standard OCR models and may show lower transcription accuracy.',
        },
      ],
    },
  },

  crop: {
    pt: {
      features: ['Proporções fixas (1:1, 4:3, 16:9) e corte livre', 'Navegação fluida entre ferramentas', 'Preservação de qualidade nativa', 'Execução instantânea sem servidor'],
      faq: [
        {
          q: 'Como cortar uma imagem ou foto online mantendo as proporções exatas?',
          a: 'Solte a imagem no editor e ajuste o enquadramento arrastando as alças. Você pode escolher proporções padronizadas pré-definidas (como 1:1 para avatar/Instagram, 4:3, 16:9 para banners ou corte livre) e baixar o recorte com um clique.',
        },
        {
          q: 'O processo de recorte reduz a resolução ou degrada a qualidade da foto?',
          a: 'O recorte apenas descarta os pixels fora da área selecionada, mantendo os pixels internos na resolução nativa original. Arquivos PNG são exportados sem qualquer perda; para arquivos JPEG, a imagem recortada é salva com qualidade máxima.',
        },
        {
          q: 'Posso cortar uma foto e enviá-la para outra ferramenta sem precisar baixar?',
          a: 'Sim. Ao concluir o corte, os atalhos de "Enviar para outra ferramenta" permitem transferir a imagem recortada diretamente para o removedor de fundo, compressor, conversor ou gerador de PDF sem downloads intermediários.',
        },
      ],
    },
    en: {
      features: ['Fixed aspect ratios (1:1, 4:3, 16:9) & freeform', 'Smooth multi-tool pipeline flow', 'Native pixel clarity preservation', 'Instant execution without servers'],
      faq: [
        {
          q: 'How do I crop an image online while maintaining exact aspect ratios?',
          a: 'Drop your image into the canvas and drag the framing handles. Select standard presets (such as 1:1 square for profile pictures, 4:3, 16:9 for banners, or freeform) and export your cropped area instantly.',
        },
        {
          q: 'Does cropping an image reduce resolution or degrade pixel quality?',
          a: 'Cropping only removes pixels outside the selected bounding box, retaining all interior pixels at their 100% native resolution. PNG exports are completely lossless, while JPEGs encode at top quality.',
        },
        {
          q: 'Can I crop an image and send it directly to another tool without downloading?',
          a: 'Yes. Use the "Send to tool" shortcuts upon completing your crop to route the cropped file straight into background removal, compression, format conversion, or PDF assembly without downloading and re-uploading.',
        },
      ],
    },
  },

  compress: {
    pt: {
      features: ['Compressão mantendo o formato original', 'Controle deslizante de qualidade visual', 'Comparativo visual de economia em KB/MB', 'Garantia contra aumento de tamanho'],
      faq: [
        {
          q: 'Como reduzir o peso em KB/MB de uma imagem sem perder qualidade visível?',
          a: 'Solte a imagem e regule o seletor de qualidade. A ferramenta calcula a recompressão no cliente e exibe lado a lado o tamanho original, o novo tamanho e a porcentagem exata de economia antes de você baixar.',
        },
        {
          q: 'A compressão de imagem altera o formato ou a extensão do arquivo original?',
          a: 'Não. Um arquivo JPEG permanece JPEG, PNG permanece PNG e WebP permanece WebP. A única exceção ocorre para formatos legados que os navegadores não codificam diretamente (como BMP e GIF), que são convertidos de forma limpa para WebP moderno.',
        },
        {
          q: 'Por que imagens no formato PNG não possuem seletor de qualidade percentual?',
          a: 'O formato PNG é estritamente sem perdas (lossless): ele não descarta dados visuais por aproximação como o JPEG. A ferramenta otimiza as tabelas de compressão Deflate do PNG e, se a imagem for fotográfica, recomenda converter para WebP para obter economias de até 80%.',
        },
        {
          q: 'O que fazer se o arquivo comprimido ficar maior do que o arquivo original?',
          a: 'Se uma imagem já estiver altamente otimizada, tentar recompactá-la pode gerar bytes adicionais. O Nada Sai detecta isso automaticamente e devolve o arquivo original intacto, garantindo que você nunca baixe um arquivo maior.',
        },
        {
          q: 'É possível comprimir várias imagens simultaneamente em lote?',
          a: 'A compressão de imagem individual foca no controle visual fino de cada foto. Para comprimir e empacotar várias fotos juntas, você pode utilizar a ferramenta Imagem para PDF ou processar as fotos em sequência pelo pipeline.',
        },
      ],
    },
    en: {
      features: ['Retains original image file format', 'Precision visual quality slider', 'Real-time KB/MB savings readout', 'Prevents accidental file size increase'],
      faq: [
        {
          q: 'How do I reduce image file size without noticeable quality loss?',
          a: 'Drop your image and adjust the quality slider. The browser computes the compression in real time, displaying the before/after byte count and exact percentage savings before you download.',
        },
        {
          q: 'Does compressing an image change its file format or file extension?',
          a: 'No. JPEGs remain JPEG, PNGs stay PNG, and WebPs remain WebP. The only exception is legacy formats that browsers cannot natively encode (such as BMP or static GIF), which output as efficient modern WebP.',
        },
        {
          q: 'Why is there no percentage quality slider when compressing PNG images?',
          a: 'PNG is an inherently lossless format that preserves every pixel value without lossy quantization. Our compressor optimizes PNG Deflate streams; for drastic file size reductions on photos, convert to WebP or JPEG.',
        },
        {
          q: 'Why might a compressed file occasionally come out larger than the original?',
          a: 'If an image has already been aggressively compressed by camera software, re-encoding can introduce overhead. Nada Sai automatically detects this and returns your original untouched file to prevent size inflation.',
        },
        {
          q: 'Can I compress multiple images simultaneously in a single batch?',
          a: 'Image compression focuses on fine per-image quality inspection. To combine and compress multiple photos together, use our Images-to-PDF tool or pass files sequentially through the tool chain.',
        },
      ],
    },
  },

  convert: {
    pt: {
      features: ['Conversão entre JPEG, PNG e WebP, com saída também em PDF', 'Tratamento automático de fundo transparente', 'Compatibilidade universal sem distorção', 'Processamento local sem perda de privacidade'],
      faq: [
        {
          q: 'Quais formatos de imagem são suportados para conversão de entrada e saída?',
          a: 'Você pode importar arquivos JPEG, PNG, WebP, AVIF, GIF e BMP e exportá-los instantaneamente para WebP, JPEG, PNG ou PDF. A lista de entrada é bem maior que a de saída porque os navegadores modernos decodificam muito mais formatos do que gravam nativamente. Ícone .ico não sai daqui: ele tem ferramenta própria, o gerador de favicon, onde você escolhe quais resoluções vão dentro do arquivo.',
        },
        {
          q: 'Por que a ferramenta não oferece a opção de exportar imagens em AVIF?',
          a: 'Nenhum navegador atual possui suporte nativo para codificar e escrever arquivos AVIF via Canvas API — solicitar AVIF silenciosamente devolve um PNG disfarçado. Preferimos oferecer formatos suportados de verdade (como WebP e JPEG) do que gerar arquivos com extensões enganosas.',
        },
        {
          q: 'O que acontece com as áreas transparentes ao converter PNG para JPEG?',
          a: 'Como o padrão JPEG não suporta canal alfa (transparência), a ferramenta achata automaticamente o fundo transparente sobre um fundo branco neutro antes de codificar, evitando que a imagem fique com manchas pretas.',
        },
        {
          q: 'Posso continuar editando a imagem em outras ferramentas após a conversão?',
          a: 'Sim para formatos de imagem (PNG, JPEG, WebP): o resultado entra na sessão e segue para redimensionar, cortar ou comprimir sem novo upload. O PDF encerra o caminho por ser um contêiner final de distribuição, e não uma imagem que as ferramentas seguintes saibam abrir.',
        },
      ],
    },
    en: {
      features: ['Converts JPEG, PNG and WebP, with PDF output too', 'Automatic alpha transparency handling', 'Universal cross-platform output', 'Local processing with full privacy'],
      faq: [
        {
          q: 'Which image formats are supported for input import and export output?',
          a: 'You can import JPEG, PNG, WebP, AVIF, GIF, and BMP files and export them to WebP, JPEG, PNG, or PDF. The input list is far longer than the output one because modern browsers decode many more formats than they can natively write. An .ico icon does not come out of here: it has its own tool, the favicon generator, where you choose which resolutions go inside the file.',
        },
        {
          q: 'Why does the converter not offer export to the AVIF format?',
          a: 'Browsers cannot natively encode AVIF through the standard Canvas API; requesting AVIF secretly outputs a PNG with an .avif extension. We strictly avoid generating misleading file formats, offering full WebP and PNG instead.',
        },
        {
          q: 'What happens to transparent backgrounds when converting PNG or WebP to JPEG?',
          a: 'Because JPEG does not support alpha transparency channels, the image is cleanly flattened onto a pure white background before encoding, preventing black artifact boxes from appearing behind transparent cutouts.',
        },
        {
          q: 'Can I continue editing the image in other tools after conversion?',
          a: 'Yes for standard image formats (PNG, JPEG, WebP): the result stays in the session and carries on to resize, crop or compress with no second upload. PDF ends that path, because it is a final distribution container rather than an image the next tools know how to open.',
        },
      ],
    },
  },

  favicon: {
    pt: {
      features: [
        'Um .ico com 16, 32, 48, 64, 128 e 256 px dentro do mesmo arquivo',
        'Encaixe por proporção, sem esticar imagem retangular',
        'Entradas comprimidas em PNG, com transparência preservada',
        'Escolha de quais resoluções entram',
      ],
      faq: [
        {
          q: 'Por que um favicon precisa de vários tamanhos dentro do mesmo arquivo?',
          a: 'Porque quem escolhe é o sistema, não você. A aba do navegador pede 16 ou 32 px, o atalho da barra de tarefas do Windows pede 48, e a tela de favoritos em alta densidade pede 256. Um .ico guarda todas essas resoluções de uma vez e cada contexto retira a que serve. Com um tamanho só, o navegador reamostra o que tem — e uma redução de 256 para 16 feita na hora borra exatamente os detalhes que um ícone pequeno precisa ter nítidos.',
        },
        {
          q: 'O que acontece se a minha imagem não for quadrada?',
          a: 'Ela é encaixada dentro do quadrado mantendo a proporção, com margem transparente nas laterais que sobram — nunca esticada. Um logotipo largo continua largo, só passa a ter espaço vazio acima e abaixo. Se você preferir que ele ocupe o quadrado inteiro, corte a imagem antes: a ferramenta de cortar entrega o resultado direto aqui sem passar pelo disco.',
        },
        {
          q: 'O .ico gerado preserva transparência?',
          a: 'Sim. Cada resolução dentro do arquivo é uma imagem PNG de 32 bits, então o canal alfa do original chega intacto. É por isso que o formato certo para trazer aqui é um PNG com fundo transparente — um JPEG não tem transparência para preservar, e o fundo dele vira parte do ícone.',
        },
        {
          q: 'Preciso mesmo de .ico, ou um PNG resolve?',
          a: 'Os navegadores atuais aceitam PNG num link rel="icon", mas o .ico continua sendo o que funciona sem exceção: é o formato que o Internet Explorer, os leitores de feed antigos e o próprio Windows esperam, e é o único que o navegador encontra sozinho em /favicon.ico quando o HTML não declara nada. Como ele carrega várias resoluções, também é o único que resolve todos os contextos com um arquivo só.',
        },
      ],
    },
    en: {
      features: [
        'One .ico holding 16, 32, 48, 64, 128 and 256 px at once',
        'Aspect-preserving fit, never a stretched rectangle',
        'PNG-compressed entries, transparency kept',
        'Pick exactly which resolutions go in',
      ],
      faq: [
        {
          q: 'Why does a favicon need several sizes inside one file?',
          a: 'Because the system picks, not you. The browser tab asks for 16 or 32 px, the Windows taskbar shortcut asks for 48, and a high-density bookmarks screen asks for 256. An .ico holds all of those at once and each context pulls the one it needs. With a single size, the browser resamples whatever it has — and downscaling 256 to 16 on the fly blurs exactly the details a small icon needs sharp.',
        },
        {
          q: 'What happens if my image is not square?',
          a: 'It is fitted inside the square with its aspect ratio intact, with transparent margins on the leftover sides — never stretched. A wide logo stays wide, it just gains empty space above and below. If you would rather it fill the square, crop first: the crop tool hands its result straight here without touching the disk.',
        },
        {
          q: 'Does the generated .ico keep transparency?',
          a: 'Yes. Every resolution inside the file is a 32-bit PNG image, so the original alpha channel arrives intact. That is why a PNG with a transparent background is the right thing to bring here — a JPEG has no transparency to keep, and its background becomes part of the icon.',
        },
        {
          q: 'Do I actually need .ico, or will a PNG do?',
          a: 'Current browsers accept a PNG in a link rel="icon", but .ico is still the one that works everywhere: it is what Internet Explorer, older feed readers and Windows itself expect, and it is the only format a browser finds on its own at /favicon.ico when the HTML declares nothing. Because it carries several resolutions, it is also the only one that answers every context with a single file.',
        },
      ],
    },
  },
  'page-numbers': {
    pt: {
      features: [
        'Número em seis posições, no topo ou no rodapé',
        'Quatro formatos: 1, 1 de 10, Página 1 e — 1 —',
        'Pular a capa e escolher em que número a contagem começa',
        'Sem rasterizar: o texto do documento continua vetorial e pesquisável',
      ],
      faq: [
        {
          q: 'Numerar as páginas estraga o texto do PDF?',
          a: 'Não. O número entra como mais um comando de texto no arquivo, e nada da página é redesenhado como imagem. O texto original continua vetorial, continua selecionável e continua sendo achado pelo Ctrl+F. É a diferença entre esta ferramenta e comprimir ou proteger um PDF, que precisam rasterizar as páginas e por isso destroem o texto vetorial.',
        },
        {
          q: 'Como não numerar a capa?',
          a: 'Use o campo "pular as primeiras" com o valor 1. Ele decide quantas folhas do começo ficam sem número impresso; o campo ao lado, "começar em", decide qual número a primeira folha numerada recebe. São perguntas diferentes de propósito: pular a capa e começar do 1 trata a capa como folha avulsa, e pular a capa e começar do 2 trata a capa como página 1 sem número.',
        },
        {
          q: 'No formato "1 de 10", o total conta a capa?',
          a: 'Não: conta as páginas que estão sendo numeradas. Num documento de 11 folhas com a capa pulada, a primeira numerada diz "1 de 10". Dizer "1 de 11" numa folha rotulada 1 seria uma aritmética que não fecha para quem lê — e é o comportamento que a maioria das ferramentas entrega sem avisar.',
        },
        {
          q: 'Funciona em PDF protegido por senha?',
          a: 'Sim, desde que você tenha a senha de abertura: o arquivo é aberto com ela, numerado e gravado. A senha fica na sessão do navegador enquanto você encadeia ferramentas, então numerar e depois assinar não pede a senha duas vezes. Como todo o resto do produto, nada disso sai do seu dispositivo.',
        },
      ],
    },
    en: {
      features: [
        'Six positions, at the top or the bottom of the sheet',
        'Four formats: 1, 1 of 10, Page 1 and — 1 —',
        'Skip the cover and choose which number the count starts at',
        'No rasterising: the document text stays vector and searchable',
      ],
      faq: [
        {
          q: 'Does numbering the pages damage the PDF text?',
          a: 'No. The number goes in as one more text command in the file, and nothing on the page is redrawn as an image. The original text stays vector, stays selectable and is still found by Ctrl+F. That is the difference between this tool and compressing or protecting a PDF, which have to rasterise the pages and therefore destroy the vector text.',
        },
        {
          q: 'How do I leave the cover unnumbered?',
          a: 'Use the "skip first" field with a value of 1. It decides how many sheets at the front carry no printed number; the field beside it, "start at", decides which number the first numbered sheet receives. They are deliberately separate questions: skipping the cover and starting at 1 treats the cover as a loose sheet, while skipping it and starting at 2 treats the cover as page 1 without a printed number.',
        },
        {
          q: 'In the "1 of 10" format, does the total count the cover?',
          a: 'No: it counts the pages actually being numbered. In an 11-sheet document with the cover skipped, the first numbered sheet reads "1 of 10". Saying "1 of 11" on a sheet labelled 1 would be arithmetic that does not add up for the reader — and it is what most tools deliver without mentioning it.',
        },
        {
          q: 'Does it work on a password-protected PDF?',
          a: 'Yes, as long as you have the open password: the file is opened with it, numbered and written back. The password stays in the browser session while you chain tools, so numbering and then signing does not ask for it twice. Like everything else here, none of it leaves your device.',
        },
      ],
    },
  },
  'audio-channels': {
    pt: {
      features: [
        'Estéreo para mono, mono para estéreo, um lado sozinho, lados trocados',
        'Aviso de cancelamento de fase antes de misturar',
        'Saída WAV sem perda ou MP3 para enviar',
        'A operação nomeia o arquivo: -esquerdo, -direito, -mono',
      ],
      faq: [
        {
          q: 'Meu áudio só toca de um lado. Como resolver?',
          a: 'Extraia o lado que tem som. A ferramenta separa o canal esquerdo ou o direito e grava só ele, preservando aquele lado exatamente como está — não é uma mistura, é um recorte. Se preferir o som nos dois lados, extraia o canal bom e depois alargue para estéreo: o mesmo sinal passa a sair pelas duas caixas.',
        },
        {
          q: 'Por que o aviso de cancelamento de fase aparece?',
          a: 'Porque os dois canais têm material parecido em oposição de fase, e a mistura para mono os apaga em parte. É comum em faixa com efeito de alargamento estéreo, em gravação com microfone fora de fase e em karaokê feito por subtração. A ferramenta mede antes e avisa; a correção não existe, porque qualquer ajuste automático mudaria o som de todos os outros arquivos.',
        },
        {
          q: 'Misturar em mono perde qualidade?',
          a: 'Não no sentido de compressão — a conta é a média dos dois canais, em Float32, e gravando em WAV nada é descartado. O que se perde é a informação estéreo: a diferença entre os lados deixa de existir, e é ela que posiciona os instrumentos. Num arquivo de voz isso não custa nada; numa mixagem musical, custa a imagem.',
        },
        {
          q: 'Alargar um mono para estéreo melhora o som?',
          a: 'Não, e a ferramenta não finge que sim: o resultado é o mesmo sinal nos dois lados. Inventar diferença entre eles produziria uma imagem estéreo que a gravação não tem, que é o que "melhoradores de estéreo" fazem sem avisar. Serve para atender um destino que exige dois canais, não para acrescentar espaço.',
        },
      ],
    },
    en: {
      features: [
        'Stereo to mono, mono to stereo, one side alone, sides swapped',
        'Phase-cancellation warning before mixing',
        'Lossless WAV output, or MP3 to send',
        'The operation names the file: -left, -right, -mono',
      ],
      faq: [
        {
          q: 'My audio only plays on one side. How do I fix it?',
          a: 'Extract the side that has sound. The tool pulls out the left or the right channel and writes only that, keeping it exactly as it is — it is a cut, not a mix. If you want the sound on both sides, extract the good channel and then widen to stereo: the same signal comes out of both speakers.',
        },
        {
          q: 'Why does the phase-cancellation warning appear?',
          a: 'Because the two channels carry similar material in opposite phase, and mixing to mono partly erases it. It is common on tracks with stereo-widening effects, on recordings with an out-of-phase microphone, and on karaoke made by subtraction. The tool measures it beforehand and says so; there is no fix, because any automatic correction would change the sound of every other file.',
        },
        {
          q: 'Does mixing to mono lose quality?',
          a: 'Not in the compression sense — the maths is the average of both channels, in Float32, and writing WAV discards nothing. What is lost is the stereo information: the difference between the sides stops existing, and that difference is what places the instruments. On a voice file it costs nothing; on a music mix, it costs the image.',
        },
        {
          q: 'Does widening a mono file to stereo improve it?',
          a: 'No, and the tool does not pretend otherwise: the result is the same signal on both sides. Inventing a difference between them would produce a stereo image the recording does not have, which is what "stereo enhancers" do without saying so. It serves a destination that requires two channels, not a wider sound.',
        },
      ],
    },
  },
  'remove-silence': {
    pt: {
      features: [
        'Limiar, duração mínima e margem ajustáveis',
        'Prévia de quanto tempo some antes de aplicar',
        'Emenda com queda de 4 ms para não estalar',
        'Saída WAV sem perda ou MP3',
      ],
      faq: [
        {
          q: 'Como o silêncio é detectado?',
          a: 'Por RMS numa janela de 20 milissegundos, e não amostra a amostra. Uma onda cruza o zero a cada ciclo, então testar amostra por amostra acharia silêncio no meio de qualquer nota. A janela é curta o bastante para encontrar a pausa entre duas palavras e longa o bastante para não confundir cruzamento de zero com pausa.',
        },
        {
          q: 'O corte não vai atropelar a fala?',
          a: 'Dois controles impedem isso. A duração mínima ignora pausas curtas, que é o que separa uma pausa de um respiro — sem ela, todo intervalo entre sílabas some e o resultado sai atropelado. E a margem preservada deixa alguns milissegundos dos dois lados de cada corte, para o ataque da palavra seguinte não ser comido. Nas bordas do arquivo a margem não se aplica: ali não há vizinho a proteger.',
        },
        {
          q: 'Vou ouvir cliques nas emendas?',
          a: 'Não. Cada junção leva uma queda de cerca de 4 milissegundos de cada lado. Sem isso, juntar dois trechos que nunca foram vizinhos faz a forma de onda saltar de uma amplitude para outra numa amostra só, o que é um clique — e numa gravação longa não é um, são dezenas.',
        },
        {
          q: 'Quanto tempo dá para economizar?',
          a: 'Depende inteiramente do material, e a ferramenta mostra o número antes de aplicar. Numa entrevista com pausas longas é comum passar de 20%; numa narração já editada, quase nada. A barra e os quatro números reagem a cada ajuste de controle, então dá para calibrar o limiar olhando o resultado em vez de adivinhar.',
        },
      ],
    },
    en: {
      features: [
        'Adjustable threshold, minimum length and edge padding',
        'Preview of how much time disappears before applying',
        '4 ms fade at every join, so nothing clicks',
        'Lossless WAV output, or MP3',
      ],
      faq: [
        {
          q: 'How is silence detected?',
          a: 'By RMS over a 20-millisecond window, not sample by sample. A waveform crosses zero every cycle, so testing sample by sample would find silence in the middle of any note. The window is short enough to catch the pause between two words and long enough not to mistake a zero crossing for a pause.',
        },
        {
          q: 'Will the cut make the speech sound rushed?',
          a: 'Two controls prevent that. The minimum length ignores short gaps, which is what separates a pause from a breath — without it, every inter-syllable gap disappears and the result comes out rushed. And the edge padding leaves a few milliseconds on both sides of every cut so the attack of the next word is not clipped. At the file boundaries the padding does not apply: there is no neighbour to protect there.',
        },
        {
          q: 'Will I hear clicks at the joins?',
          a: 'No. Every junction is faded over about 4 milliseconds on each side. Without that, splicing two passages that were never adjacent makes the waveform step from one amplitude to another in a single sample, which is a click — and on a long recording it is not one click, it is dozens.',
        },
        {
          q: 'How much time can I expect to save?',
          a: 'It depends entirely on the material, and the tool shows the number before applying. On an interview with long pauses, over 20% is common; on already-edited narration, almost nothing. The bar and the four figures react to every control change, so you can calibrate the threshold by watching the result rather than guessing.',
        },
      ],
    },
  },
  'pdf-to-text': {
    pt: {
      features: [
        'Texto puro ou Markdown, com o negrito preservado no segundo',
        'OCR a 3× nas páginas escaneadas, em português e inglês',
        'Ordem de leitura corrigida por bandas, não por ordem de criação',
        'Copiar direto para a área de transferência',
      ],
      faq: [
        {
          q: 'Serve para jogar o documento num modelo de linguagem?',
          a: 'É o caso principal, e é por isso que TXT é o padrão e o marcador de página vem desligado. Um modelo lê melhor prosa contínua do que prosa picada por "--- Página 3 ---" a cada folha. Ligue o marcador quando for conferir o texto contra o original, não quando for colar em outro lugar.',
        },
        {
          q: 'Como funciona com PDF escaneado?',
          a: 'Uma página sem camada de texto é uma imagem, e o texto dela não existe como texto no arquivo. Com o OCR ligado a página é rasterizada a 3× — cerca de 216 DPI, que é o que o Tesseract precisa para devolver geometria confiável — e reconhecida em português, inglês ou os dois. Com o OCR desligado ela é pulada, e a página avisa quantas ficaram de fora.',
        },
        {
          q: 'Como o Markdown decide o que é título?',
          a: 'Por três testes ao mesmo tempo: o corpo da fonte precisa estar pelo menos 15% acima da mediana da página, o bloco precisa ter no máximo 14 palavras, e não pode terminar em pontuação. Qualquer um deles sozinho produz falso positivo — a primeira linha de um parágrafo em destaque é grande, um item de lista é curto, uma legenda não tem ponto. Um PDF não declara hierarquia; ela é inferida, e a ferramenta prefere errar para menos.',
        },
        {
          q: 'A ordem do texto sai certa em documento de duas colunas?',
          a: 'Sim. Os blocos são reordenados por bandas de sobreposição vertical antes de virarem texto — sem isso, a ordem seria a de criação dos objetos no arquivo, que num documento de duas colunas entrega a metade direita de cada linha antes da esquerda. Todas as palavras estariam lá e o texto seria ilegível, o que se parece com falha de OCR sem ser.',
        },
      ],
    },
    en: {
      features: [
        'Plain text or Markdown, with bold preserved in the latter',
        '3× OCR on scanned pages, in Portuguese and English',
        'Reading order fixed by bands, not by object creation order',
        'Copy straight to the clipboard',
      ],
      faq: [
        {
          q: 'Is this for feeding a document to a language model?',
          a: 'It is the main case, which is why TXT is the default and the page marker is off. A model reads continuous prose better than prose chopped up by "--- Page 3 ---" every sheet. Turn the marker on when you are checking the text against the original, not when you are pasting it somewhere.',
        },
        {
          q: 'How does it handle a scanned PDF?',
          a: 'A page with no text layer is an image, and its text does not exist as text in the file. With OCR on, the page is rendered at 3× — roughly 216 DPI, which is what Tesseract needs to return reliable geometry — and recognised in Portuguese, English or both. With OCR off it is skipped, and the page tells you how many were left out.',
        },
        {
          q: 'How does the Markdown decide what is a heading?',
          a: 'By three tests at once: the font body has to be at least 15% above the page median, the block has to be at most 14 words, and it cannot end in punctuation. Any one of them alone produces false positives — the first line of a pull quote is large, a list item is short, a caption has no full stop. A PDF does not declare hierarchy; it is inferred, and the tool prefers to under-call it.',
        },
        {
          q: 'Does the text come out in the right order on a two-column document?',
          a: 'Yes. Blocks are reordered into bands by vertical overlap before becoming text — without that, the order would be the order the objects were created in the file, which on a two-column document hands you the right half of every line before the left. Every word would be present and the text unreadable, which looks like an OCR fault without being one.',
        },
      ],
    },
  },
  'compare-pdf': {
    pt: {
      features: [
        'Diferença linha a linha, com número de linha dos dois lados',
        'Comparação por parágrafo, não por linha física',
        'Ignorar espaçamento e caixa, opcionalmente',
        'Diff unificado para baixar e anexar',
      ],
      faq: [
        {
          q: 'Compara o layout ou só o texto?',
          a: 'Só o texto, e a página diz isso antes de você rodar. Duas versões com as mesmas palavras e layouts diferentes saem como idênticas; um logotipo trocado, uma cor mudada ou uma tabela reposicionada não aparecem. É a comparação certa para contrato, edital e política — e a errada para material gráfico.',
        },
        {
          q: 'Por que a comparação é por parágrafo e não por linha?',
          a: 'Porque um PDF quebra linha onde a margem manda, e não onde o texto termina. Comparar linhas físicas marcaria como diferente todo parágrafo cujo refluxo mudou por causa de uma palavra a mais no começo — o resultado ficaria vermelho inteiro e não diria nada. Agrupando por parágrafo, uma frase alterada aparece como uma linha alterada.',
        },
        {
          q: 'E se o PDF for escaneado?',
          a: 'Páginas sem camada de texto ficam de fora, e a ferramenta conta quantas foram. Rodar OCR dos dois lados foi considerado e recusado: o reconhecimento erra, e os erros de um lado não são os mesmos do outro — a comparação passaria a mostrar diferenças que são falha de OCR e não mudança de documento. Numa ferramenta usada para decidir se um contrato mudou, isso é pior do que não comparar.',
        },
        {
          q: 'Os dois arquivos são enviados para algum servidor?',
          a: 'Nenhum dos dois. A leitura é feita pelo pdf.js dentro da sua aba e a comparação é o algoritmo de Myers rodando em JavaScript na sua máquina. É o ponto da ferramenta: comparar duas versões de um contrato num comparador online normalmente significa enviar as duas para alguém.',
        },
      ],
    },
    en: {
      features: [
        'Line-by-line difference, with line numbers on both sides',
        'Compared by paragraph, not by physical line',
        'Optionally ignore spacing and letter case',
        'Unified diff to download and attach',
      ],
      faq: [
        {
          q: 'Does it compare layout or just text?',
          a: 'Just text, and the page says so before you run it. Two versions with the same words and different layouts come out identical; a swapped logo, a changed colour or a repositioned table do not show. It is the right comparison for a contract, a tender or a policy — and the wrong one for artwork.',
        },
        {
          q: 'Why compare by paragraph rather than by line?',
          a: 'Because a PDF breaks lines where the margin says, not where the text ends. Comparing physical lines would mark every paragraph whose reflow shifted because of one extra word at the start — the result would be entirely red and would say nothing. Grouped by paragraph, one altered sentence shows as one altered line.',
        },
        {
          q: 'What about scanned PDFs?',
          a: 'Pages with no text layer are left out, and the tool counts how many. Running OCR on both sides was considered and rejected: recognition makes mistakes, and the mistakes on one side are not the same as on the other — the comparison would start showing differences that are OCR faults rather than document changes. In a tool used to decide whether a contract changed, that is worse than not comparing.',
        },
        {
          q: 'Are the two files uploaded anywhere?',
          a: 'Neither of them. The reading is done by pdf.js inside your tab and the comparison is Myers running in JavaScript on your machine. That is the point of the tool: comparing two versions of a contract in an online comparer normally means sending both of them to someone.',
        },
      ],
    },
  },
  'office-metadata': {
    pt: {
      features: [
        'Lê .docx, .xlsx e .pptx — Word, Excel e PowerPoint',
        'Mostra autor, último a salvar, empresa e tempo de edição',
        'O conteúdo sai byte a byte igual; só as propriedades são reescritas',
        'A tabela é relida depois da limpeza, em vez de prometer',
      ],
      faq: [
        {
          q: 'Que informação um .docx guarda sobre mim?',
          a: 'Mais do que a maioria das pessoas imagina. O campo "último a salvar" guarda o nome de usuário do computador em que o arquivo foi gravado pela última vez; "empresa" guarda o nome da organização configurada no Office; e "tempo total de edição" diz quantos minutos o documento ficou aberto. Um currículo enviado a dez empresas costuma carregar o nome do PC de casa, e uma proposta feita a partir do arquivo de outro cliente costuma carregar o nome dele.',
        },
        {
          q: 'A limpeza estraga o documento?',
          a: 'Não. Um arquivo do Office é um zip com XML dentro, e a limpeza reescreve apenas os dois arquivos de propriedades. Todas as outras entradas — o texto, as imagens, as fórmulas, a formatação — são copiadas byte a byte, sem serem decodificadas em momento nenhum. O arquivo abre no Office exatamente como antes.',
        },
        {
          q: 'Por que os campos ficam vazios em vez de sumirem?',
          a: 'Porque o Office recria os elementos que faltam na próxima gravação, e alguns leitores estritos reclamam de um core.xml sem os elementos obrigatórios do Dublin Core. Um elemento vazio não carrega informação nenhuma e não quebra ninguém — a diferença é de forma, não de privacidade.',
        },
        {
          q: 'E se eu quiser manter o título do documento?',
          a: 'O título é o único campo que costuma ser legítimo num arquivo publicado, e a limpeza aceita uma lista do que preservar. Os demais campos identificadores — autor, último a salvar, empresa, gerente — são o alvo da ferramenta e saem por padrão.',
        },
      ],
    },
    en: {
      features: [
        'Reads .docx, .xlsx and .pptx — Word, Excel and PowerPoint',
        'Shows author, last-modified-by, company and editing time',
        'The content comes out byte for byte identical; only properties are rewritten',
        'The table is re-read after cleaning, rather than promising',
      ],
      faq: [
        {
          q: 'What does a .docx store about me?',
          a: 'More than most people expect. The "last modified by" field stores the username of the computer the file was last saved on; "company" stores the organisation name configured in Office; and "total editing time" says how many minutes the document was open. A résumé sent to ten employers usually carries the name of the home PC, and a proposal built from another client’s file usually carries their name.',
        },
        {
          q: 'Does cleaning damage the document?',
          a: 'No. An Office file is a zip with XML inside, and the clean rewrites only the two property files. Every other entry — the text, the images, the formulas, the formatting — is copied byte for byte, never decoded at any point. The file opens in Office exactly as before.',
        },
        {
          q: 'Why are the fields emptied rather than deleted?',
          a: 'Because Office recreates missing elements on the next save, and some strict readers complain about a core.xml without the required Dublin Core elements. An empty element carries no information and breaks nobody — the difference is one of form, not of privacy.',
        },
        {
          q: 'What if I want to keep the document title?',
          a: 'The title is the one field that is often legitimate on a published file, and the clean accepts a list of fields to preserve. The other identifying fields — author, last modified by, company, manager — are what the tool is for, and they go by default.',
        },
      ],
    },
  },
  'crop-video': {
    pt: {
      features: [
        'Desenhe a área direto sobre o vídeo',
        'Proporções prontas: 1:1, 9:16, 16:9 e 4:5',
        'O áudio da origem vai junto',
        'Nada é enviado — o recorte acontece no seu navegador',
      ],
      faq: [
        {
          q: 'Quanto tempo demora?',
          a: 'A duração do próprio vídeo. O recorte redesenha cada quadro num canvas e grava o resultado em tempo real, porque o áudio só pode ser capturado assim — acelerar a reprodução entregaria a trilha com a duração errada. A tela mostra o tempo restante e oferece cancelar, em vez de parecer travada.',
        },
        {
          q: 'Perde qualidade?',
          a: 'Sim, uma geração. Recortar exige redesenhar, e redesenhar exige recodificar. Um corte sem perda precisaria de um demuxer que reescrevesse o contêiner mantendo os quadros originais, e isso significaria trazer 25 a 30 MB de WebAssembly sob GPL — o mesmo motivo que manteve o ffmpeg fora da conversão para GIF.',
        },
        {
          q: 'O áudio é preservado?',
          a: 'Sim, quando o vídeo tem trilha. Ela entra no mesmo fluxo que o canvas por um destino de áudio da Web Audio API, e o gravador escreve os dois juntos. Se o vídeo não tem áudio, nenhum contexto é criado — uma trilha silenciosa só gastaria bytes.',
        },
        {
          q: 'Funciona no iPhone?',
          a: 'Não, e a página diz isso ao abrir em vez de deixar você desenhar o recorte e falhar no fim. O recorte depende do MediaRecorder, que nenhum navegador em iOS expõe — nem o Safari, nem o Chrome, porque todos usam o mesmo motor. É a mesma limitação que impede o gravador de tela de funcionar lá.',
        },
      ],
    },
    en: {
      features: [
        'Draw the area straight onto the video',
        'Ready ratios: 1:1, 9:16, 16:9 and 4:5',
        'The source audio comes along',
        'Nothing is uploaded — the crop happens in your browser',
      ],
      faq: [
        {
          q: 'How long does it take?',
          a: 'The length of the video itself. Cropping redraws every frame onto a canvas and records the result in real time, because audio can only be captured that way — speeding up playback would deliver the track at the wrong duration. The screen shows the time remaining and offers cancel, rather than looking frozen.',
        },
        {
          q: 'Does it lose quality?',
          a: 'Yes, one generation. Cropping requires redrawing, and redrawing requires re-encoding. A lossless crop would need a demuxer that rewrote the container while keeping the original frames, and that would mean shipping 25 to 30 MB of GPL WebAssembly — the same reason ffmpeg stayed out of the GIF converter.',
        },
        {
          q: 'Is the audio preserved?',
          a: 'Yes, when the video has a track. It joins the same stream as the canvas through a Web Audio stream destination, and the recorder writes both together. If the video has no audio, no context is created at all — a silent track would only spend bytes.',
        },
        {
          q: 'Does it work on an iPhone?',
          a: 'No, and the page says so when it opens rather than letting you draw the crop and fail at the end. Cropping depends on MediaRecorder, which no browser on iOS exposes — not Safari, not Chrome, because they all use the same engine. It is the same limitation that keeps the screen recorder from working there.',
        },
      ],
    },
  },
  'trim-video': {
    pt: {
      features: [
        'Marque o início e o fim no próprio player',
        'A espera é a duração do trecho, não a do arquivo',
        'O áudio da origem vai junto',
        'Sem marca d’água, sem cadastro e sem enviar o vídeo',
      ],
      faq: [
        {
          q: 'Quanto tempo demora para cortar?',
          a: 'A duração do TRECHO que você manteve, não a do arquivo inteiro. Cortar dez segundos de um vídeo de uma hora leva dez segundos. O corte posiciona o vídeo no início marcado, toca até o fim marcado e grava o que passa — então quanto menor o pedaço, mais rápido termina.',
        },
        {
          q: 'O vídeo perde qualidade?',
          a: 'Uma geração. O corte recodifica, porque o navegador não traz um demuxer que reescrevesse o contêiner mantendo os quadros originais — trazer um significaria 25 a 30 MB de WebAssembly sob GPL, que é o mesmo motivo pelo qual o ffmpeg está fora da conversão para GIF. Num vídeo bem produzido a diferença é discreta.',
        },
        {
          q: 'Como escolho o ponto exato do corte?',
          a: 'Tocando o vídeo e parando onde quer, e então clicando em marcar. Ninguém sabe dizer em que segundo está a cena que quer cortar, mas todo mundo sabe parar o vídeo nela — é a mesma decisão que a extração de quadros tomou. Os campos numéricos existem para o ajuste fino depois de marcar.',
        },
        {
          q: 'Tem marca d’água ou limite de tamanho?',
          a: 'Marca d’água nenhuma. Os limites são de memória, não de política: 500 MB de arquivo e 30 minutos de duração, porque o navegador precisa segurar o vídeo para decodificá-lo. E nada é enviado a lugar nenhum — o corte acontece na sua máquina, que é raro num cortador de vídeo online.',
        },
      ],
    },
    en: {
      features: [
        'Mark the start and end in the player itself',
        'The wait is the length of the clip, not of the file',
        'The source audio comes along',
        'No watermark, no signup, and no upload',
      ],
      faq: [
        {
          q: 'How long does trimming take?',
          a: 'The length of the CLIP you kept, not of the whole file. Trimming ten seconds out of an hour-long video takes ten seconds. The trim seeks to the marked start, plays to the marked end and records what passes — so the smaller the piece, the sooner it finishes.',
        },
        {
          q: 'Does the video lose quality?',
          a: 'One generation. Trimming re-encodes, because the browser ships no demuxer that would rewrite the container while keeping the original frames — bringing one would mean 25 to 30 MB of GPL WebAssembly, which is the same reason ffmpeg stays out of the GIF converter. On a well-produced video the difference is subtle.',
        },
        {
          q: 'How do I pick the exact cut point?',
          a: 'By playing the video, stopping where you want it, and clicking mark. Nobody can say which second holds the scene they want to cut, but everybody can stop the video on it — the same decision the frame extractor made. The numeric fields are there for fine adjustment after marking.',
        },
        {
          q: 'Is there a watermark or a size limit?',
          a: 'No watermark at all. The limits are memory, not policy: 500 MB of file and 30 minutes of duration, because the browser has to hold the video to decode it. And nothing is uploaded anywhere — the trim happens on your machine, which is rare for an online video cutter.',
        },
      ],
    },
  },
  'convert-video': {
    pt: {
      features: [
        'MOV, MKV e WebM para MP4 no navegador',
        'O áudio da origem vai junto',
        'Sem marca d’água, sem cadastro e sem enviar o arquivo',
        'Diz antes o que o seu navegador consegue escrever',
      ],
      faq: [
        {
          q: 'Para quais formatos dá para converter?',
          a: 'MP4 e WebM, e só o que o seu navegador souber gravar — WebM funciona em todo lugar, MP4 na maioria. Não há saída para MOV, AVI ou MKV, e a página não os oferece: prometer um formato que o navegador não escreve entregaria bytes de um formato dentro do nome de outro, que é o mesmo motivo pelo qual o FLAC saiu da lista do conversor de áudio.',
        },
        {
          q: 'Consigo converter um AVI?',
          a: 'Não. Nenhum navegador decodifica AVI, então o arquivo nem chega a abrir — e a página avisa na hora em vez de falhar no fim. Entram MP4, MOV e WebM em qualquer navegador, e MKV em alguns, dependendo do codec de dentro. A regra é simples: se o vídeo toca numa aba, ele converte aqui.',
        },
        {
          q: 'Perde qualidade?',
          a: 'Uma geração. Trocar de contêiner sem recodificar exigiria um demuxer, e trazer um significaria 25 a 30 MB de WebAssembly sob GPL — o mesmo argumento que mantém o ffmpeg fora deste produto inteiro. O caminho que sobra é redesenhar cada quadro e gravar, então a espera é a duração do vídeo e o resultado é uma segunda compressão.',
        },
        {
          q: 'Tem limite de tamanho ou marca d’água?',
          a: 'Marca d’água nenhuma. Os limites são de memória, não de política: 500 MB de arquivo e 30 minutos de duração, porque o navegador precisa segurar o vídeo para decodificá-lo. E nada é enviado a lugar nenhum — a conversão acontece na sua máquina, o que num conversor de vídeo online não é o normal.',
        },
      ],
    },
    en: {
      features: [
        'MOV, MKV and WebM to MP4 in the browser',
        'The source audio comes along',
        'No watermark, no signup, no upload',
        'Says up front what your browser can write',
      ],
      faq: [
        {
          q: 'Which formats can it convert to?',
          a: 'MP4 and WebM, and only what your browser can write — WebM works everywhere, MP4 in most. There is no MOV, AVI or MKV output, and the page does not offer any: promising a format the browser cannot write would hand you one format’s bytes inside another format’s name, which is the same reason FLAC left the audio converter’s list.',
        },
        {
          q: 'Can I convert an AVI?',
          a: 'No. No browser decodes AVI, so the file never opens — and the page says so immediately rather than failing at the end. MP4, MOV and WebM come in on any browser, and MKV on some, depending on the codec inside. The rule is simple: if the video plays in a tab, it converts here.',
        },
        {
          q: 'Does it lose quality?',
          a: 'One generation. Swapping containers without re-encoding would need a demuxer, and bringing one would mean 25 to 30 MB of GPL WebAssembly — the same argument that keeps ffmpeg out of this whole product. The path that remains is redrawing every frame and recording, so the wait is the video’s duration and the result is a second compression.',
        },
        {
          q: 'Is there a size limit or a watermark?',
          a: 'No watermark at all. The limits are memory, not policy: 500 MB of file and 30 minutes of duration, because the browser has to hold the video to decode it. And nothing is uploaded anywhere — the conversion happens on your machine, which for an online video converter is not the norm.',
        },
      ],
    },
  },
  'compress-video': {
    pt: {
      features: [
        'Escolha a resolução e a qualidade, e veja o tamanho estimado antes',
        'Avisa quando o ajuste produziria um arquivo MAIOR',
        'Sem marca d’água, sem cadastro e sem enviar o arquivo',
        'Para caber no WhatsApp, no e-mail ou no formulário',
      ],
      faq: [
        {
          q: 'Quanto o arquivo encolhe?',
          a: 'Depende dos dois controles, e o painel mostra a estimativa antes de você esperar. Ela sai do bitrate escolhido vezes a duração — o codificador gasta menos em cena parada e mais em cena com movimento, então o número final difere um pouco. É a mesma regra do conversor para GIF: número apresentado como aproximado, porque prometer megabytes antes de escrever seria inventar precisão.',
        },
        {
          q: 'Por que baixar a resolução, e não só a qualidade?',
          a: 'Porque reduzir só o bitrate de um 1080p entrega um 1080p borrado, enquanto o mesmo bitrate num 720p é um 720p limpo. Os pixels que sobram roubam bits dos que importam. Por isso a resolução vem primeiro no painel, e por isso a lista só mostra alturas que de fato REDUZEM: oferecer 1080p sobre um vídeo 720p seria oferecer o contrário de comprimir.',
        },
        {
          q: 'O arquivo pode ficar maior?',
          a: 'Pode, e a ferramenta recusa quando isso vai acontecer. Um vídeo já bem comprimido, recodificado em alta qualidade na resolução original, cresce — e entregar isso em silêncio seria o pior resultado possível aqui. O aviso aparece e o botão desativa; baixar a resolução ou a qualidade resolve.',
        },
        {
          q: 'Quanto tempo demora?',
          a: 'A duração do vídeo, e isso é intransponível. O áudio só se captura em tempo real, e acelerar a reprodução entregaria a trilha com a duração errada — então um vídeo de cinco minutos leva cinco minutos. A tela mostra o tempo restante e oferece cancelar, em vez de parecer travada.',
        },
      ],
    },
    en: {
      features: [
        'Pick resolution and quality, and see the estimated size first',
        'Warns you when a setting would produce a BIGGER file',
        'No watermark, no signup, no upload',
        'To fit WhatsApp, an email or an upload form',
      ],
      faq: [
        {
          q: 'How much smaller does the file get?',
          a: 'It depends on the two controls, and the panel shows the estimate before you wait. It comes from the chosen bitrate times the duration — the encoder spends less on a still scene and more on a moving one, so the final number differs a little. Same rule as the GIF converter: a number presented as approximate, because promising megabytes before writing would be inventing precision.',
        },
        {
          q: 'Why lower the resolution instead of just the quality?',
          a: 'Because lowering only the bitrate of a 1080p file gives you a blurry 1080p, while the same bitrate on a 720p gives you a clean 720p. The extra pixels steal bits from the ones that matter. That is why resolution comes first in the panel, and why the list only shows heights that actually REDUCE: offering 1080p for a 720p video would be offering the opposite of compression.',
        },
        {
          q: 'Can the file come out bigger?',
          a: 'It can, and the tool refuses when that is about to happen. A video that is already well compressed, re-encoded at high quality at its original resolution, grows — and handing that back silently would be the worst possible result here. The warning appears and the button goes inactive; lowering the resolution or the quality fixes it.',
        },
        {
          q: 'How long does it take?',
          a: 'The length of the video, and there is no way around it. Audio can only be captured in real time, and speeding up playback would deliver the track at the wrong duration — so a five-minute video takes five minutes. The screen shows the remaining time and offers a cancel, rather than looking stuck.',
        },
      ],
    },
  },
  'rotate-pdf': {
    pt: {
      features: [
        'Gira o documento inteiro num clique',
        'Ou uma página sozinha, pela miniatura',
        'Sem perda: o texto continua texto',
        'Sem marca d’água e sem enviar o arquivo',
      ],
      faq: [
        {
          q: 'Girar o PDF piora a qualidade?',
          a: 'Não, e esta é a única ferramenta de PDF daqui que pode dizer isso sem ressalva. A rotação é um número guardado dentro do arquivo, não uma imagem nova: o texto continua texto, as fontes continuam embutidas, e o tamanho praticamente não muda. Comprimir, proteger e censurar rasterizam; girar não.',
        },
        {
          q: 'Dá para girar só uma página?',
          a: 'Dá — clique no ícone de girar na miniatura dela. Mas o controle principal gira TODAS de uma vez, porque é esse o caso de quem procura girar PDF: o documento inteiro foi escaneado de lado. Girar tudo depois de acertar uma página avulsa soma sobre o que ela já tinha, em vez de zerar.',
        },
        {
          q: 'A rotação vale em qualquer leitor?',
          a: 'Vale. O campo de rotação é do próprio formato PDF e todo leitor o respeita — Acrobat, Preview, o visualizador do Chrome, a impressora. É diferente de girar na tela do seu leitor, que muda só a visualização e não acompanha o arquivo quando você o envia.',
        },
        {
          q: 'E se o PDF tiver senha?',
          a: 'A página pede a senha, abre o documento e gira normalmente. A senha fica na sua sessão do navegador para as outras ferramentas de PDF não a pedirem de novo, e não sai daí. Se o que você quer é remover a senha, essa é outra ferramenta daqui.',
        },
      ],
    },
    en: {
      features: [
        'Turns the whole document in one click',
        'Or a single page, from its thumbnail',
        'Lossless: the text stays text',
        'No watermark and no upload',
      ],
      faq: [
        {
          q: 'Does rotating make the PDF worse?',
          a: 'No, and this is the one PDF tool here that can say so without a caveat. The rotation is a number stored inside the file, not a new image: the text stays text, the fonts stay embedded, and the size barely moves. Compressing, protecting and redacting rasterise; rotating does not.',
        },
        {
          q: 'Can I rotate just one page?',
          a: 'You can — click the rotate icon on its thumbnail. But the main control turns them ALL at once, because that is the case for anyone searching for rotate PDF: the whole document was scanned sideways. Rotating everything after fixing a stray page adds to what that page already had, rather than resetting it.',
        },
        {
          q: 'Does the rotation hold in any reader?',
          a: 'It does. The rotation field belongs to the PDF format itself and every reader respects it — Acrobat, Preview, Chrome’s viewer, the printer. That is different from rotating on screen in your reader, which changes only the view and does not travel with the file when you send it.',
        },
        {
          q: 'What if the PDF has a password?',
          a: 'The page asks for it, opens the document and rotates normally. The password stays in your browser session so the other PDF tools do not ask again, and it goes nowhere else. If what you want is to remove the password, that is a different tool here.',
        },
      ],
    },
  },
  'unlock-pdf': {
    pt: {
      features: [
        'Remove a senha e as restrições de imprimir e copiar',
        'Funciona com a senha que você já tem',
        'A senha não sai do seu navegador',
        'Diz na tela o que muda no arquivo',
      ],
      faq: [
        {
          q: 'Isto quebra a senha de um PDF?',
          a: 'Não, e não vai passar a quebrar. A ferramenta exige a senha que ABRE o documento — a mesma que você digitaria no Acrobat — e o que ela faz é gravar uma cópia sem proteção nenhuma. É para o seu próprio arquivo, aquele cuja senha você tem e cansou de digitar. Nenhuma senha é adivinhada, testada ou enviada a lugar nenhum.',
        },
        {
          q: 'Meu PDF abre sem senha mas não deixa imprimir. Serve?',
          a: 'Serve, e é o caso mais comum. Esse PDF tem senha de DONO: ele abre em qualquer leitor e carrega uma lista de permissões que proíbe imprimir, copiar ou editar. A restrição está no arquivo do mesmo jeito, e sai daqui junto com o resto — é só soltar o arquivo, sem digitar senha nenhuma.',
        },
        {
          q: 'O arquivo muda em quê?',
          a: 'Cada página vira uma imagem, e a página diz isso antes de você processar. É o único caminho possível num navegador: quem sabe decifrar aqui é o leitor de PDF, e quem escreve PDF não sabe. O texto é redesenhado por baixo, invisível, então o Ctrl+F continua achando tudo; o que se perde é o texto vetorial — a nitidez ao ampliar muito e a possibilidade de editar as letras.',
        },
        {
          q: 'Por que não dá para tirar só a criptografia e deixar o resto igual?',
          a: 'Porque isso exigiria decifrar e reescrever o arquivo com a mesma biblioteca, e as duas metades estão em bibliotecas diferentes por limitação delas, não nossa. A que lê decifra e não escreve; a que escreve não decifra. Um servidor resolveria — e um servidor é exatamente o que este produto não tem.',
        },
      ],
    },
    en: {
      features: [
        'Removes the password and the print and copy restrictions',
        'Works with the password you already have',
        'The password never leaves your browser',
        'Says on screen what changes in the file',
      ],
      faq: [
        {
          q: 'Does this crack a PDF password?',
          a: 'No, and it will not start to. The tool requires the password that OPENS the document — the same one you would type into Acrobat — and what it does is write a copy with no protection at all. It is for your own file, the one whose password you have and are tired of typing. No password is guessed, tested or sent anywhere.',
        },
        {
          q: 'My PDF opens without a password but will not print. Does this help?',
          a: 'It does, and that is the most common case. That PDF has an OWNER password: it opens in any reader and carries a permissions list forbidding printing, copying or editing. The restriction is in the file all the same, and it leaves here with everything else — just drop the file, no password to type.',
        },
        {
          q: 'What changes in the file?',
          a: 'Every page becomes an image, and the page says so before you process anything. It is the only path available in a browser: what decrypts here is the PDF reader, and what writes PDF cannot decrypt. The text is redrawn underneath, invisible, so Ctrl+F still finds everything; what you lose is vector text — sharpness at heavy zoom and the ability to edit the letters.',
        },
        {
          q: 'Why not strip only the encryption and leave the rest identical?',
          a: 'Because that would require decrypting and rewriting the file with the same library, and the two halves live in different libraries by their limitation, not ours. The one that reads decrypts and does not write; the one that writes does not decrypt. A server would solve it — and a server is exactly what this product does not have.',
        },
      ],
    },
  },
  'id-photo': {
    pt: {
      features: [
        'Medida real: 3x4, 5x7, passaporte e Schengen',
        'Folha 10x15 ou A4 com linha de corte',
        '300 DPI, que é o que a gráfica pede',
        'A foto não sai do seu navegador',
      ],
      faq: [
        {
          q: 'Isso não é a mesma coisa que recortar em 3:4?',
          a: 'Não. 3x4 é uma medida FÍSICA — três centímetros por quatro —, não a razão 3:4. Uma foto recortada na proporção certa e salva com 200 pixels de largura sai borrada da gráfica; a mesma foto com 4000 pixels só engorda o arquivo. Quem decide o tamanho impresso é o DPI, e aqui ele é fixo em 300, que é o mínimo que uma gráfica trata como foto.',
        },
        {
          q: 'Preciso de uma foto ou de uma folha?',
          a: 'Quase sempre da folha, e é por isso que ela é o padrão. Ninguém leva um arquivo de 3x4 à gráfica: leva uma folha 10x15 com o máximo de cópias que couber e a linha de corte. Numa 10x15 cabem nove fotos 3x4; numa A4, muitas mais. Se você só quer o arquivo para anexar num formulário, escolha "Só a foto".',
        },
        {
          q: 'Devo baixar em PDF ou em JPG?',
          a: 'PDF para imprimir, JPG para mandar. O PDF carrega o tamanho físico dentro dele, então sai em 3x4 de verdade em qualquer impressora. O JPEG carrega só pixels — o tamanho impresso passa a depender do que o programa de impressão decidir, e é aí que a foto sai maior ou menor do que devia.',
        },
        {
          q: 'A ferramenta deixa o fundo branco?',
          a: 'Não, e ela não finge que deixa. Trocar fundo de retrato é outro problema — cabelo, contorno, sombra — e existe uma ferramenta própria para isso aqui, a de remover fundo, que usa uma rede neural de verdade. O caminho é: remover o fundo, pôr o fundo branco, e então voltar para cá para a medida e a folha.',
        },
      ],
    },
    en: {
      features: [
        'Real size: 2x2, 35x45, 3x4 and 5x7',
        '10x15 or A4 sheet with cut guides',
        '300 DPI, which is what a lab asks for',
        'The photo never leaves your browser',
      ],
      faq: [
        {
          q: 'Is this not the same as cropping to a ratio?',
          a: 'No. A passport photo is a PHYSICAL measurement — two inches by two, or 35 by 45 millimetres — not a ratio. A photo cropped to the right shape and saved 200 pixels wide comes back blurry from the lab; the same photo at 4000 pixels only bloats the file. What decides the printed size is DPI, and here it is fixed at 300, the minimum a lab treats as a photo.',
        },
        {
          q: 'Do I need one photo or a sheet?',
          a: 'Almost always the sheet, which is why it is the default. Nobody takes a single 2x2 file to a print shop: they take a 10x15 sheet with as many copies as fit and cut guides between them. If you only need the file to attach to a form, pick "Photo only".',
        },
        {
          q: 'Should I download PDF or JPG?',
          a: 'PDF to print, JPG to send. A PDF carries the physical size inside it, so it prints at the true size on any printer. A JPEG carries pixels only — the printed size then depends on whatever the print dialog decides, and that is where photos come out larger or smaller than they should.',
        },
        {
          q: 'Does the tool make the background white?',
          a: 'No, and it does not pretend to. Replacing a portrait background is a different problem — hair, edges, shadow — and there is a dedicated tool for it here, the background remover, which uses a real neural network. The route is: remove the background, put white behind it, then come back here for the size and the sheet.',
        },
      ],
    },
  },
  'voice-recorder': {
    pt: {
      features: [
        'Grava pelo microfone, sem instalar nada',
        'O áudio não sai do navegador',
        'Segue direto para cortar, normalizar ou converter',
        'Até 60 minutos, sem marca d’água e sem cadastro',
      ],
      faq: [
        {
          q: 'A gravação é enviada para algum servidor?',
          a: 'Não, e não há para onde enviar: este produto não tem backend. O áudio é montado pelo próprio navegador e fica na aba até você baixar ou mandar para outra ferramenta daqui. O medidor no topo da página mostra os bytes que saíram enquanto você grava, e ele fica em zero.',
        },
        {
          q: 'Em que formato ele grava? Dá para gravar em MP3?',
          a: 'Ele grava no que o SEU navegador sabe escrever, que na prática é WebM com Opus, e M4A com AAC em alguns. MP3 não: nenhum navegador grava MP3 nativamente, e listar um formato que não sai seria prometer um arquivo que nunca aparece. Se você precisa de MP3, grave e mande para o conversor de áudio daqui — são dois cliques e nenhum upload.',
        },
        {
          q: 'Qual é o limite de duração?',
          a: 'Sessenta minutos. É limite de TAMANHO de arquivo, não de memória: os pedaços vão para o disco pelo próprio navegador enquanto você grava, então uma hora de voz não vive na memória da aba. Uma hora dá algo em torno de 60 MB, e o cronômetro na tela mostra onde você está.',
        },
        {
          q: 'O navegador não pede permissão do microfone?',
          a: 'Pede, e a permissão é dele, não deste site — nós não temos como conceder nem contornar. Se você recusou uma vez, o navegador guarda a recusa: é preciso abrir as permissões da página e autorizar. A gravação só começa depois disso, e o microfone é solto assim que você sai da ferramenta.',
        },
      ],
    },
    en: {
      features: [
        'Records through the microphone, nothing to install',
        'The audio never leaves the browser',
        'Goes straight on to cut, normalise or convert',
        'Up to 60 minutes, no watermark, no signup',
      ],
      faq: [
        {
          q: 'Is the recording sent to a server?',
          a: 'No, and there is nowhere to send it: this product has no backend. The audio is assembled by the browser itself and stays in the tab until you download it or pass it to another tool here. The meter at the top of the page shows the bytes that left while you record, and it stays at zero.',
        },
        {
          q: 'What format does it record? Can it record MP3?',
          a: 'It records whatever YOUR browser can write, which in practice is WebM with Opus, and M4A with AAC on some. Not MP3: no browser records MP3 natively, and listing a format that never comes out would be promising a file that never appears. If you need MP3, record and send it to the audio converter here — two clicks and no upload.',
        },
        {
          q: 'What is the length limit?',
          a: 'Sixty minutes. It is a FILE SIZE limit rather than a memory one: the chunks go to disk through the browser while you record, so an hour of speech does not live in the tab. An hour lands around 60 MB, and the on-screen timer shows where you are.',
        },
        {
          q: 'Does the browser ask for microphone permission?',
          a: 'It does, and the permission belongs to the browser rather than to this site — we can neither grant nor work around it. If you refused once, the browser remembers: you have to open the page permissions and allow it. Recording only starts after that, and the microphone is released the moment you leave the tool.',
        },
      ],
    },
  },
  'audio-speed': {
    pt: {
      features: [
        'De 0,25x a 4x, com prévia antes de baixar',
        'Com o tom acompanhando ou mantido',
        'Mostra a nova duração antes de aplicar',
        'Sem enviar o arquivo e sem cadastro',
      ],
      faq: [
        {
          q: 'Qual a diferença entre manter o tom e deixar acompanhar?',
          a: 'Deixar acompanhar é o que um disco faz fora da rotação: fica mais rápido E mais agudo. É o efeito que se procura em "nightcore" ou "slowed", e sai de graça, porque é só ler as amostras num passo diferente. Manter o tom muda só a duração, que é o que se quer numa aula ou num podcast — e esse custa: a onda é recortada e sobreposta pedaço a pedaço para a emenda não aparecer.',
        },
        {
          q: 'Manter o tom estraga o som?',
          a: 'Um pouco, e depende do material. O método recorta e sobrepõe trechos de 60 milissegundos procurando onde a onda melhor continua — em fala isso é quase invisível, e é onde ele funciona melhor. Em música densa ou em velocidades extremas aparece um leve eco metálico nos sustentados. Por isso a prévia toca antes de você baixar.',
        },
        {
          q: 'Por que o limite é 0,25x a 4x?',
          a: 'Porque fora disso o áudio deixa de ser reconhecível. A quatro vezes a fala já é um chiado agudo, e a um quarto ela vira um arrasto. Um controle que aceita qualquer número e entrega ruído não é liberdade — é uma armadilha, e a página prefere dizer o limite a deixar você descobrir depois de esperar.',
        },
        {
          q: 'Posso mudar só o tom, sem mudar a velocidade?',
          a: 'Pelo painel, não: as duas opções são "o tom acompanha" e "o tom fica". A máquina por baixo faz as duas coisas de forma independente — mudar o tom sem mexer na duração é a mesma conta com outros números —, mas oferecer três controles que interagem tornaria mais fácil errar do que acertar. Se essa for uma necessidade comum, vira uma ferramenta própria.',
        },
      ],
    },
    en: {
      features: [
        'From 0.25x to 4x, with a preview before you download',
        'Pitch following or held',
        'Shows the new duration before applying',
        'No upload, no signup',
      ],
      faq: [
        {
          q: 'What is the difference between holding the pitch and letting it follow?',
          a: 'Letting it follow is what a record does off its rotation: faster AND higher. That is the effect people look for in "nightcore" or "slowed", and it is free, because it is just reading the samples at a different step. Holding the pitch changes only the duration, which is what you want for a lecture or a podcast — and that one costs: the wave is cut and overlapped piece by piece so the seam does not show.',
        },
        {
          q: 'Does holding the pitch damage the sound?',
          a: 'A little, and it depends on the material. The method cuts and overlaps 60-millisecond pieces, searching for where the wave best continues — on speech that is almost invisible, and speech is where it works best. On dense music or at extreme speeds a faint metallic echo appears on sustained notes. That is why the preview plays before you download.',
        },
        {
          q: 'Why is the range 0.25x to 4x?',
          a: 'Because outside it the audio stops being recognisable. At four times, speech is already a high hiss; at a quarter it becomes a drag. A control that accepts any number and delivers noise is not freedom — it is a trap, and the page would rather state the limit than let you find it after waiting.',
        },
        {
          q: 'Can I change only the pitch, without changing the speed?',
          a: 'Not from the panel: the two options are pitch follows and pitch holds. The machine underneath does both independently — moving the pitch without touching the duration is the same arithmetic with different numbers — but offering three interacting controls would make it easier to get wrong than right. If that turns out to be a common need, it becomes its own tool.',
        },
      ],
    },
  },
  'compress-office': {
    pt: {
      features: [
        'Recomprime as imagens dentro do .docx, .xlsx ou .pptx',
        'Texto, estilos e fontes copiados byte a byte',
        'Devolve o original se o resultado ficar maior',
        'O arquivo não sai do navegador',
      ],
      faq: [
        {
          q: 'O que exatamente é alterado no arquivo?',
          a: 'Só o conteúdo de word/media, ppt/media e xl/media — as imagens. Um arquivo do Office é um zip, e tudo o mais que está lá dentro (o XML do texto, os estilos, as relações, as fontes embutidas) é copiado byte a byte. É a mesma decisão do limpador de metadados daqui, e é o que garante que o arquivo continue abrindo no Word: reescrever OOXML é reescrever uma especificação que só o Word implementa por inteiro.',
        },
        {
          q: 'Comprimiu pouco, ou nada. Por quê?',
          a: 'Provavelmente as figuras não são fotos. O Word grava gráfico colado como EMF ou WMF, que são vetoriais, e nenhum navegador os decodifica — então eles ficam intactos, e num documento feito só deles não há o que ganhar. O painel mostra antes quantas imagens recomprimíveis existem e quanto do arquivo elas pesam, para você saber disso sem esperar.',
        },
        {
          q: 'A qualidade cai?',
          a: 'Das imagens, sim, e é isso que faz o arquivo encolher. Cada nível reduz o tamanho em pixels e recomprime: o padrão limita o lado maior a 1600 px, que é mais do que um slide em tela cheia usa. O texto não é tocado. E cada imagem só é substituída se a versão nova for menor — uma foto que já veio otimizada volta intacta.',
        },
        {
          q: 'Ele abre .doc, .xls e .ppt antigos?',
          a: 'Não. Os formatos anteriores a 2007 são binários proprietários, não zip, e o que esta ferramenta faz — abrir o pacote, trocar as imagens e fechar — não existe neles. Salve como .docx, .xlsx ou .pptx no próprio Office e traga de volta.',
        },
      ],
    },
    en: {
      features: [
        'Recompresses the pictures inside a .docx, .xlsx or .pptx',
        'Text, styles and fonts copied byte for byte',
        'Hands back the original if the result grows',
        'The file never leaves your browser',
      ],
      faq: [
        {
          q: 'What exactly is changed in the file?',
          a: 'Only the contents of word/media, ppt/media and xl/media — the pictures. An Office file is a zip, and everything else inside it (the text XML, the styles, the relationships, the embedded fonts) is copied byte for byte. Same decision as the metadata cleaner here, and it is what keeps the file opening in Word: rewriting OOXML means rewriting a specification only Word implements in full.',
        },
        {
          q: 'It barely shrank, or not at all. Why?',
          a: 'The figures are probably not photographs. Word stores a pasted chart as EMF or WMF, which are vector formats no browser decodes — so they are left intact, and a document made only of them has nothing to gain. The panel shows up front how many recompressible pictures exist and how much of the file they weigh, so you know that without waiting.',
        },
        {
          q: 'Does the quality drop?',
          a: 'The pictures’ quality does, and that is what makes the file shrink. Each level caps the pixel size and recompresses: the default limits the long side to 1600 px, which is more than a full-screen slide uses. The text is untouched. And each picture is only replaced if the new version is smaller — a photo that arrived already optimised comes back intact.',
        },
        {
          q: 'Does it open the old .doc, .xls and .ppt?',
          a: 'No. The pre-2007 formats are proprietary binaries rather than zips, and what this tool does — open the package, swap the pictures, close it — does not exist in them. Save as .docx, .xlsx or .pptx in Office itself and bring it back.',
        },
      ],
    },
  },
  'word-to-text': {
    pt: {
      features: [
        'Títulos, listas e tabelas preservados em Markdown',
        'Ou texto limpo, sem marcação nenhuma',
        'Prévia na tela antes de baixar',
        'O documento não sai do navegador',
      ],
      faq: [
        {
          q: 'Qual a diferença entre Markdown e texto limpo?',
          a: 'O Markdown guarda a ESTRUTURA: título vira cabeçalho com sustenidos, lista vira lista, tabela vira tabela e negrito continua negrito. É o que serve para colar num editor, num README ou num campo de IA. O texto limpo são só as palavras — o que serve para contar, buscar ou colar onde formatação atrapalha.',
        },
        {
          q: 'A formatação do documento vem junto?',
          a: 'A estrutura vem; o layout não. Fonte, tamanho, cor, margem, onde a página quebra e o que o cabeçalho e o rodapé fazem não estão no corpo do documento — e nada disso tem representação em texto. É a mesma razão pela qual este produto não oferece Word para PDF: sem o motor de layout do Word, o resultado seria só aproximado.',
        },
        {
          q: 'Serve para .xlsx e .pptx?',
          a: 'Não. Os três são zips de OOXML, mas o corpo de cada um mora em outro lugar do pacote e tem outra gramática — uma planilha são células, uma apresentação são slides. Aceitar os três aqui devolveria vazio em silêncio, então a página recusa e diz por quê. Para planilha existe a conversão para CSV, ao lado.',
        },
        {
          q: 'Meu documento voltou vazio. Por quê?',
          a: 'Porque o conteúdo dele não está no corpo. Acontece com documento montado em caixas de texto, com o que é imagem de ponta a ponta, e com o digitalizado. Esta ferramenta LÊ o corpo do arquivo; ela não faz reconhecimento de caracteres. Para um documento digitalizado, o caminho é o OCR do módulo de PDF.',
        },
      ],
    },
    en: {
      features: [
        'Headings, lists and tables preserved as Markdown',
        'Or plain text, with no markup at all',
        'Preview on screen before you download',
        'The document never leaves your browser',
      ],
      faq: [
        {
          q: 'What is the difference between Markdown and plain text?',
          a: 'Markdown keeps the STRUCTURE: a heading becomes a hash heading, a list a list, a table a table, and bold stays bold. It is what you paste into an editor, a README or an AI prompt. Plain text is just the words — what you use to count, to search, or to paste where formatting gets in the way.',
        },
        {
          q: 'Does the formatting come along?',
          a: 'The structure does; the layout does not. Font, size, colour, margins, where the page breaks and what the header and footer do are not in the document body — and none of it has a representation in text. It is the same reason this product does not offer Word to PDF: without Word’s layout engine the result would only be approximate.',
        },
        {
          q: 'Does it work for .xlsx and .pptx?',
          a: 'No. All three are OOXML zips, but each keeps its body somewhere else in the package with a different grammar — a spreadsheet is cells, a presentation is slides. Accepting all three here would return empty silently, so the page refuses and says why. For a spreadsheet there is the CSV conversion next door.',
        },
        {
          q: 'My document came back empty. Why?',
          a: 'Because its content is not in the body. That happens with documents built out of text boxes, with files that are pictures end to end, and with scans. This tool READS the file body; it does not do character recognition. For a scan, the route is the OCR in the PDF module.',
        },
      ],
    },
  },
  'excel-to-csv': {
    pt: {
      features: [
        'CSV com vírgula, ponto e vírgula ou tabulação',
        'Ou JSON, com a primeira linha virando chaves',
        'Datas saem como datas, números com a precisão do arquivo',
        'A planilha não sai do navegador',
      ],
      faq: [
        {
          q: 'Por que o padrão é ponto e vírgula?',
          a: 'Porque no Brasil e em boa parte da Europa a vírgula é o separador DECIMAL, e o Excel dessas regiões lê e escreve CSV com ponto e vírgula. Um arquivo com vírgula abre lá com tudo numa coluna só. Se o destino é um sistema em inglês ou um script, troque para vírgula — as três opções estão no painel.',
        },
        {
          q: 'As datas saem certas?',
          a: 'Saem, e isso exige mais do que parece: no arquivo uma data é só um número. O que a torna data é o formato ligado à célula pelo estilo, que é lido junto — sem isso toda data sairia como 45000. E a base é 30 de dezembro de 1899, porque o Excel trata 1900 como bissexto, um erro herdado do Lotus 1-2-3 e mantido de propósito por compatibilidade.',
        },
        {
          q: 'E os números? Perco casas decimais?',
          a: 'Não. O número sai com a precisão exata que estava no arquivo, sem arredondar e sem separador de milhar — porque é isso que o arquivo guarda. O que você vê na tela do Excel é uma formatação por cima do valor; o valor é o que sai daqui.',
        },
        {
          q: 'Ele converte todas as abas de uma vez?',
          a: 'Uma por vez, e a escolha fica no painel com o número de linhas e colunas de cada uma. É deliberado: um CSV é uma tabela, e juntar três abas num arquivo só produziria algo que nenhum programa lê como tabela. Para várias, converta e baixe uma de cada vez.',
        },
      ],
    },
    en: {
      features: [
        'CSV with comma, semicolon or tab',
        'Or JSON, with the first row becoming keys',
        'Dates come out as dates, numbers keep the file precision',
        'The spreadsheet never leaves your browser',
      ],
      faq: [
        {
          q: 'Why is the semicolon the default?',
          a: 'Because in Brazil and much of Europe the comma is the DECIMAL separator, and Excel in those regions reads and writes CSV with semicolons. A comma file opens there with everything in one column. If the destination is an English-locale system or a script, switch to comma — all three options are in the panel.',
        },
        {
          q: 'Do dates come out right?',
          a: 'They do, and that takes more than it seems: in the file a date is only a number. What makes it a date is the format attached to the cell by its style, which is read alongside it — without that every date would come out as 45000. And the epoch is 30 December 1899, because Excel treats 1900 as a leap year, an error inherited from Lotus 1-2-3 and kept deliberately for compatibility.',
        },
        {
          q: 'What about numbers? Do I lose decimals?',
          a: 'No. A number comes out with the exact precision it had in the file, with no rounding and no thousands separator — because that is what the file stores. What you see on Excel’s screen is formatting on top of the value; the value is what leaves here.',
        },
        {
          q: 'Does it convert every sheet at once?',
          a: 'One at a time, and the choice is in the panel with each sheet’s row and column count. That is deliberate: a CSV is one table, and stacking three sheets into one file would produce something no program reads as a table. For several, convert and download them one by one.',
        },
      ],
    },
  },
  resize: {
    pt: {
      features: ['Redimensionamento por pixels exatos ou porcentagem', 'Bloqueio de proporção para evitar distorção', 'Presets prontos para redes sociais', 'Redução limpa de resolução'],
      faq: [
        {
          q: 'Como redimensionar uma imagem para uma largura e altura exatas em pixels?',
          a: 'Digite a largura ou altura desejada em pixels ou ajuste a porcentagem de escala. Com o cadeado de proporção ativado, a outra dimensão é recalculada automaticamente para preservar as proporções originais da imagem sem distorção.',
        },
        {
          q: 'Como garantir que a imagem não fique esticada ou achatada ao redimensionar?',
          a: 'Mantenha o botão de proporção (Aspect Ratio) bloqueado. Dessa forma, alterar a largura ajusta proporcionalmente a altura e vice-versa. Para forçar dimensões livres e desiguais, basta desbloquear o cadeado antes de alterar os valores.',
        },
        {
          q: 'É recomendável usar o redimensionador para aumentar imagens muito pequenas?',
          a: 'Esta ferramenta é focada em redução e ajuste dimensional exato. Se o seu objetivo for ampliar uma imagem pequena mantendo a nitidez e recuperando bordas, utilize nossa ferramenta dedicada de Melhorar Qualidade (Upscale).',
        },
      ],
    },
    en: {
      features: ['Resize by exact pixels or scale percentage', 'Aspect ratio lock prevents distortion', 'Ready-to-use social media presets', 'Clean resolution downsampling'],
      faq: [
        {
          q: 'How do I resize an image to exact pixel dimensions or percentages?',
          a: 'Enter your desired width or height in pixels, or choose a percentage reduction. When the aspect ratio lock is enabled, the matching dimension updates automatically to preserve original proportions.',
        },
        {
          q: 'How do I ensure my photo does not stretch or distort when resizing?',
          a: 'Keep the aspect ratio lock engaged. This forces width and height to scale together symmetrically. You can unlock the aspect ratio toggle if your destination explicitly requires custom non-proportional dimensions.',
        },
        {
          q: 'Should I use the image resizer to enlarge small or low-res pictures?',
          a: 'This tool is optimized for scaling down and hitting precise pixel targets. To enlarge low-resolution pictures with edge reconstruction and anti-blur processing, use our dedicated Upscale tool instead.',
        },
      ],
    },
  },

  'img-to-pdf': {
    pt: {
      features: ['Conversão de múltiplas fotos em um único PDF', 'Reordenação visual e por teclado', 'Otimização automática de tamanho por página', 'Geração de PDF vetorial local'],
      faq: [
        {
          q: 'Como converter e juntar várias fotos ou comprovantes em um único arquivo PDF?',
          a: 'Arraste todas as imagens de uma só vez para o dropzone. Cada imagem vira automaticamente uma página do documento PDF na ordem exibida na tela. Depois de organizar a sequência, clique em "Gerar PDF" para baixar o arquivo compilado.',
        },
        {
          q: 'Como posso organizar e reordenar a sequência das páginas do PDF?',
          a: 'Você pode arrastar as miniaturas das fotos para mudar sua ordem visualmente ou utilizar os botões de seta em cada imagem para reposicioná-las com total precisão e acessibilidade pelo teclado.',
        },
        {
          q: 'O arquivo PDF final ficará muito pesado ao adicionar fotos em alta resolução?',
          a: 'A ferramenta redimensiona de forma inteligente o lado maior de fotos gigantes de smartphones durante a montagem do documento. Isso evita que um PDF com 20 comprovantes fique com centenas de megabytes, mantendo nitidez perfeita para leitura.',
        },
        {
          q: 'Como é definido o nome do arquivo PDF baixado ao final da conversão?',
          a: 'O nome do arquivo final é derivado automaticamente do nome da primeira foto da lista com a extensão .pdf, facilitando a identificação do documento gerado.',
        },
      ],
    },
    en: {
      features: ['Combine multiple photos into a single PDF', 'Visual and accessible reordering', 'Automatic per-page dimension optimization', 'Local vector PDF generation'],
      faq: [
        {
          q: 'How do I combine multiple photos and documents into a single PDF file?',
          a: 'Drag all your images into the dropzone simultaneously. Each image becomes a distinct page in the output PDF document according to the on-screen sequence. Click "Generate PDF" to compile and download.',
        },
        {
          q: 'How do I reorder the sequence of photos and pages in the PDF?',
          a: 'Drag and drop image cards to rearrange them visually, or use the dedicated arrow buttons on each card for precise keyboard-accessible reordering.',
        },
        {
          q: 'Will the resulting PDF become too large when adding high-res mobile photos?',
          a: 'The engine applies smart dimension capping to oversized smartphone camera captures during assembly, preventing 30-page documents from exploding into hundreds of megabytes while keeping receipts and text crisp.',
        },
        {
          q: 'How is the default filename of the generated PDF determined?',
          a: 'The output filename is derived from the first image in your sequence with a .pdf extension, keeping your document naming organized and predictable.',
        },
      ],
    },
  },

  'edit-pdf': {
    pt: {
      features: ['Edição direta de blocos de texto no PDF', 'OCR inteligente para documentos escaneados', 'Inserção de novos textos e anotações', 'Visualização em streaming com baixo uso de RAM'],
      faq: [
        {
          q: 'É realmente possível editar e alterar o texto de um arquivo PDF existente?',
          a: 'Sim. O editor analisa a estrutura interna do PDF, identifica os blocos de texto reais e permite que você altere palavras, corrija erros de digitação e edite conteúdos no próprio lugar, sem precisar tampar com caixas brancas.',
        },
        {
          q: 'Como o editor de PDF funciona em documentos escaneados ou fotos de papel?',
          a: 'Quando a página é uma digitalização sem camada de texto nativa, o editor executa OCR na imagem, reconhece os blocos de caracteres e os transforma em elementos editáveis. Ao exportar, o texto corrigido é embutido no PDF mantendo a pesquisa Ctrl+F.',
        },
        {
          q: 'A tipografia e as fontes originais são preservadas ao editar um texto no PDF?',
          a: 'O editor aproxima o estilo, tamanho e peso da fonte a partir dos dados do documento. Em documentos escaneados, onde não há fontes embutidas, o tamanho das letras é calculado a partir da altura dos caracteres identificados.',
        },
        {
          q: 'O navegador pode travar ou ficar lento ao abrir documentos com muitas páginas?',
          a: 'Não. Nosso visualizador utiliza virtualização de páginas: apenas as páginas visíveis na tela permanecem renderizadas em memória canvas, liberando as páginas distantes para manter o desempenho fluido mesmo em documentos com centenas de páginas.',
        },
      ],
    },
    en: {
      features: ['Direct in-place text editing on PDFs', 'Intelligent OCR for scanned documents', 'Add new text boxes and annotations', 'Low-memory streaming page virtualization'],
      faq: [
        {
          q: 'Can I genuinely edit and modify existing text inside a PDF document?',
          a: 'Yes. The editor parses the internal PDF object tree, locates actual text layout blocks, and lets you modify sentences, fix typos, and adjust copy directly in place rather than painting clumsy white boxes over the document.',
        },
        {
          q: 'How does the PDF editor handle scanned documents and paper photos?',
          a: 'When a page is a scanned image lacking a native text stream, the editor executes client-side OCR, turns recognized characters into editable blocks, and overlays the text layer so the exported PDF becomes searchable with Ctrl+F.',
        },
        {
          q: 'Are the original typography and font styles preserved when editing text?',
          a: 'The editor approximates font family, sizing, and weight from document metrics. Scanned documents estimate point sizes from character bounding boxes, matching the visual weight of the original print.',
        },
        {
          q: 'Will the browser slow down or freeze when opening large multi-page PDFs?',
          a: 'No. Our renderer uses page virtualization: only pages currently in or near the viewport hold allocated canvases in RAM. Distant pages are unloaded and re-rendered on demand, keeping 200-page files as fast as 2-page ones.',
        },
      ],
    },
  },

  'merge-pdf': {
    pt: {
      features: ['União de múltiplos PDFs em um só arquivo', 'Preservação total de texto vetorial e fontes', 'Reorganização rápida de documentos', 'Suporte a PDFs protegidos por senha'],
      faq: [
        {
          q: 'Como juntar e combinar dois ou mais documentos PDF em um arquivo único?',
          a: 'Solte todos os arquivos PDF na ferramenta, organize a ordem dos documentos arrastando os cards na tela e clique para baixar o documento combinado. As páginas são mescladas preservando toda a formatação vetorial e links originais.',
        },
        {
          q: 'O PDF final gerado fica maior do que a soma dos arquivos originais?',
          a: 'Não. Nossa mesclagem opera no nível de documento completo, reutilizando tabelas de fontes compartilhadas e perfis de cores em vez de duplicar recursos página a página, garantindo um arquivo final compacto e otimizado.',
        },
        {
          q: 'É possível juntar arquivos PDF que estejam protegidos por senha?',
          a: 'Sim. Se algum dos arquivos selecionados exigir senha de abertura, a ferramenta exibirá um campo para inserção da senha, descriptografará o documento em memória local e o integrará à mesclagem normalmente.',
        },
        {
          q: 'Quais são os limites de tamanho de arquivo e quantidade de documentos suportados?',
          a: 'Cada arquivo individual pode ter até 100 MB. A quantidade total de páginas suportada depende da memória RAM livre do seu dispositivo, permitindo combinar dezenas de contratos ou apostilas sem problemas.',
        },
      ],
    },
    en: {
      features: ['Merge multiple PDF files into one document', 'Full vector text & font stream preservation', 'Quick drag-and-drop file reordering', 'Password-protected PDF support'],
      faq: [
        {
          q: 'How do I combine and merge multiple PDF files into a single document?',
          a: 'Drop all your PDF files into the tool, rearrange their order in the document list, and download the unified document. Pages are copied with all vector text, fonts, and hyperlinks preserved.',
        },
        {
          q: 'Will the merged PDF file end up larger than the sum of the original files?',
          a: 'No. The merger operates at the document stream level, consolidating shared font dictionaries and color profiles rather than duplicating assets on every page, keeping the final file compact.',
        },
        {
          q: 'Is it possible to merge PDF documents that are password-protected?',
          a: 'Yes. If any input PDF is password-protected, the tool prompts for its password, decrypts the document in local browser memory, and combines it into the output document.',
        },
        {
          q: 'What are the file size and page count limits when merging PDFs?',
          a: 'Individual files can be up to 100 MB. Total capacity is bounded only by available device RAM, easily allowing you to combine dozens of lengthy reports and contracts in a single pass.',
        },
      ],
    },
  },

  'compress-pdf': {
    pt: {
      features: ['Quatro níveis ajustáveis de compressão', 'Preservação de pesquisa Ctrl+F no texto', 'Relatório em tempo real de economia de espaço', 'Processamento local sem perda de formatação'],
      faq: [
        {
          q: 'Como diminuir o tamanho e o peso de um PDF pesado sem estragar a leitura?',
          a: 'Solte o arquivo e escolha um dos 4 níveis de compressão (Sem Perdas, Leve, Médio ou Forte). O nível sem perdas reestrutura os fluxos internos de dados; os níveis mais avançados realizam reamostragem equilibrada de imagens embutidas mantendo o texto nítido.',
        },
        {
          q: 'O documento continuará pesquisável e selecionável após a compressão?',
          a: 'Sim. Mesmo nos níveis de compressão que reamostram imagens de páginas, a camada de texto original é preservada ou redesenhada de forma invisível sobre as páginas, mantendo a pesquisa por Ctrl+F e a seleção de texto funcionais.',
        },
        {
          q: 'Por que alguns arquivos PDF quase não diminuem de tamanho na compressão?',
          a: 'Documentos compostos puramente por texto vetorial e fontes embutidas já são extremamente compactos por natureza. Se um arquivo já estiver otimizado, o Nada Sai avisa que o documento já possui tamanho ideal para evitar degradação desnecessária.',
        },
        {
          q: 'Como escolher o nível de compressão ideal entre Leve, Médio, Forte e Máximo?',
          a: 'Use o nível Sem Perdas para contratos formais e plantas técnicas; use Leve/Médio para anexos de e-mail e envio em portais governamentais; e use Forte para apresentações e apostilas com muitas fotos pesadas.',
        },
      ],
    },
    en: {
      features: ['Four selectable PDF compression levels', 'Preserves Ctrl+F text searchability', 'Real-time KB/MB savings comparison', 'Local processing with zero layout loss'],
      faq: [
        {
          q: 'How do I reduce the file size of a heavy PDF without degrading readability?',
          a: 'Drop your PDF and select a compression profile (Lossless, Light, Medium, or Strong). The lossless mode reorganizes internal data tables, while higher modes resample heavy embedded images while preserving text clarity.',
        },
        {
          q: 'Will the text in the PDF remain searchable and selectable after compression?',
          a: 'Yes. Even at compression levels that downsample page images, the underlying text layer is retained or invisibly overlaid, ensuring Ctrl+F search and text selection continue to work seamlessly.',
        },
        {
          q: 'Why do some PDF documents barely reduce in size after compression?',
          a: 'PDFs that consist purely of vector typography and lightweight text streams are already compact. If a document is already well-optimized, Nada Sai informs you that no further compression is needed.',
        },
        {
          q: 'How should I choose the right compression level for my document?',
          a: 'Choose Lossless for legal filings and technical vector schematics; pick Medium for email attachments and portal submissions; and choose Strong for image-heavy brochures and presentation slides.',
        },
      ],
    },
  },

  'split-pdf': {
    pt: {
      features: ['Extração de páginas individuais ou intervalos', 'Divisão em blocos de tamanho fixo', 'Exportação em arquivo único ou pacote ZIP', 'Preservação 100% de qualidade vetorial'],
      faq: [
        {
          q: 'Como dividir um arquivo PDF e extrair páginas ou capítulos específicos?',
          a: 'Você pode clicar nas miniaturas das páginas desejadas, digitar intervalos customizados (como 1-5, 8, 12-20) ou escolher dividir o documento em blocos de N páginas. As partes extraídas podem ser baixadas em um único PDF ou reunidas em um arquivo .zip.',
        },
        {
          q: 'Como extrair apenas uma única página importante de um documento longo?',
          a: 'Basta carregar o PDF e clicar sobre a miniatura da página que você precisa (como um recibo, certidão ou página assinada) e clicar em baixar para exportar um novo PDF contendo apenas aquela página.',
        },
        {
          q: 'As páginas extraídas sofrem perda de qualidade visual ou de formatação?',
          a: 'Não. A extração copia os objetos nativos das páginas selecionadas diretamente na árvore do PDF sem rasterizar nada. Fontes, vetores, formulários e imagens mantêm os bytes originais de alta fidelidade.',
        },
        {
          q: 'Posso agrupar as páginas selecionadas em um só arquivo em vez de baixar um ZIP?',
          a: 'Sim. A ferramenta oferece a opção "Unir páginas selecionadas em um único PDF", ideal para quem deseja extrair páginas não sequenciais (ex: páginas 2, 7 e 15) e salvá-las juntas em um único documento.',
        },
      ],
    },
    en: {
      features: ['Extract specific pages or custom ranges', 'Split by fixed page intervals', 'Export as single PDF or ZIP archive', '100% vector quality preservation'],
      faq: [
        {
          q: 'How do I split a PDF file and extract specific pages or ranges?',
          a: 'Select pages by clicking their thumbnails, specify custom ranges (e.g. 1-5, 8, 12-20), or slice the document into fixed N-page intervals. Download individual PDF chunks or bundle them in a single ZIP archive.',
        },
        {
          q: 'How do I extract just one single page from a large multi-page PDF?',
          a: 'Upload the document, click on the thumbnail of the specific page you need (such as a signed agreement or invoice), and export a standalone PDF containing only that page.',
        },
        {
          q: 'Do extracted PDF pages lose visual quality, resolution, or text formatting?',
          a: 'No. The splitting engine extracts page objects directly at the PDF syntax layer without rasterization. Vector fonts, line art, and embedded graphics keep their original fidelity.',
        },
        {
          q: 'Can I combine the selected pages into a single PDF instead of a ZIP?',
          a: 'Yes. Check the "Merge selected pages into a single PDF" option to extract non-consecutive pages (such as pages 2, 7, and 15) and assemble them into one unified file.',
        },
      ],
    },
  },

  'pdf-to-img': {
    pt: {
      features: ['Conversão de páginas em JPEG, PNG ou WebP', 'Três opções de escala (1x, 2x e 3x HD)', 'Download de página avulsa ou lote em ZIP', 'Renderização nítida via motor Canvas'],
      faq: [
        {
          q: 'Como converter páginas de um arquivo PDF em imagens individuais de alta qualidade?',
          a: 'Solte o arquivo PDF, escolha o formato de saída (PNG, JPEG ou WebP) e selecione a resolução desejada. Você pode baixar uma página avulsa diretamente ou exportar todas as páginas compactadas em um arquivo ZIP.',
        },
        {
          q: 'Qual resolução ou escala (1x, 2x ou 3x) devo escolher para a conversão?',
          a: 'A escala 1x (72 DPI) é indicada para visualização rápida na web; a escala 2x (150 DPI) oferece excelente nitidez para apresentações e telas de alta densidade; e a escala 3x (300 DPI) é recomendada para impressões e leitura minuciosa de letras pequenas.',
        },
        {
          q: 'Qual formato de imagem é mais indicado entre JPEG, PNG e WebP?',
          a: 'Escolha PNG para documentos com muito texto e tabelas (garantindo bordas de letras 100% nítidas); JPEG para documentos com fotografias; e WebP para obter o menor tamanho de arquivo com excelente qualidade.',
        },
        {
          q: 'O texto das páginas continuará selecionável e editável após virar imagem?',
          a: 'Não. Uma vez convertida em imagem, a página se torna uma matriz de pixels estática. Se você precisa manter o texto editável e selecionável, utilize nossa ferramenta de PDF para Word ou Extrair Texto (OCR).',
        },
      ],
    },
    en: {
      features: ['Convert PDF pages into JPEG, PNG or WebP', 'Three rendering scales (1x, 2x and 3x HD)', 'Single page or bulk ZIP archive download', 'Crisp local Canvas page rendering'],
      faq: [
        {
          q: 'How do I convert PDF pages into high-resolution image files?',
          a: 'Drop your PDF, choose your target format (PNG, JPEG, or WebP), and set your desired resolution scale. Download individual pages as single images or export the entire document as a ZIP package.',
        },
        {
          q: 'Which resolution scale (1x, 2x, or 3x) should I choose when converting?',
          a: '1x scale (72 DPI) is great for fast digital previews; 2x (150 DPI) provides crisp rendering on modern Retina displays; and 3x (300 DPI) delivers print-grade clarity for fine text and diagrams.',
        },
        {
          q: 'Which output format should I select between JPEG, PNG, and WebP?',
          a: 'Pick PNG for documents with heavy typography and vector line art to keep letter edges sharp; choose JPEG for photo-heavy pages; and use WebP for optimal file size efficiency.',
        },
        {
          q: 'Will text remain selectable and editable once converted into images?',
          a: 'No. Rasterizing a PDF creates a flat pixel image where text characters are no longer machine-selectable. If you need editable text, use our PDF-to-Word or Text Extraction (OCR) tools.',
        },
      ],
    },
  },

  'pdf-to-word': {
    pt: {
      features: ['Conversão direta para documento editável .docx', 'OCR integrado para páginas digitalizadas', 'Reconstrução precisa da ordem de leitura', 'Sem envio para servidores na nuvem'],
      faq: [
        {
          q: 'Como converter um arquivo PDF em um documento Word (.docx) totalmente editável?',
          a: 'Solte o arquivo PDF na ferramenta: o motor analisa a hierarquia de parágrafos, fontes e linhas e gera um arquivo .docx nativo pronto para edição no Microsoft Word, Google Docs ou LibreOffice.',
        },
        {
          q: 'O documento Word convertido terá o layout visual exatamente idêntico ao PDF?',
          a: 'Documentos PDF utilizam posicionamento geométrico absoluto de caracteres, enquanto documentos Word utilizam fluxo contínuo de parágrafos. A conversão prioriza a integridade do texto na ordem lógica correta de leitura para facilitar a edição de conteúdo.',
        },
        {
          q: 'A conversão para Word funciona com PDFs escaneados ou fotos de documentos?',
          a: 'Sim. Se o PDF for uma digitalização escaneada, nosso motor de OCR é acionado automaticamente para reconhecer os caracteres na imagem e organizá-los em linhas e parágrafos coerentes no arquivo Word.',
        },
        {
          q: 'Como tabelas, colunas e listas de dados do PDF são tratadas no Word?',
          a: 'O texto contido nas colunas e tabelas é extraído mantendo o agrupamento e o alinhamento das linhas, permitindo que você formate e aplique estilos de tabela nativos facilmente no editor de texto.',
        },
      ],
    },
    en: {
      features: ['Direct conversion to editable .docx document', 'Built-in OCR for scanned PDF pages', 'Accurate logical reading order reconstruction', 'Zero cloud server transmission'],
      faq: [
        {
          q: 'How do I convert a PDF into a fully editable Word (.docx) document?',
          a: 'Drop your PDF into the converter: the engine analyzes text blocks, font metrics, and paragraph groupings to assemble a native .docx file compatible with Microsoft Word, Google Docs, and LibreOffice.',
        },
        {
          q: 'Will the converted Word document look visually identical to the original PDF?',
          a: 'PDFs place glyphs at fixed absolute 2D coordinates, whereas Word documents use flowing dynamic paragraphs. Our converter reconstructs proper logical reading order so text flows naturally when edited.',
        },
        {
          q: 'Does the PDF to Word converter work on scanned documents and images?',
          a: 'Yes. If a PDF consists of scanned pages without a digital text layer, our client-side OCR engine recognizes the text and compiles it into editable Word paragraphs.',
        },
        {
          q: 'How are tables, multiple columns, and lists handled in the converted Word file?',
          a: 'Column text and data cells are extracted in logical horizontal order to preserve reading continuity, allowing you to easily restyle tables in your favorite word processor.',
        },
      ],
    },
  },

  'organize-pdf': {
    pt: {
      features: ['Reordenação visual e rotação de páginas', 'Exclusão rápida de páginas desnecessárias', 'Miniaturas em alta resolução de todas as páginas', 'Manipulação direta da estrutura do PDF'],
      faq: [
        {
          q: 'Como reorganizar, mudar a ordem e excluir páginas de um documento PDF?',
          a: 'Todas as páginas do PDF são exibidas como miniaturas organizadas em grade. Você pode arrastar as páginas para nova ordem, usar os botões de rotação ou clicar no ícone de lixeira para remover páginas desnecessárias antes de salvar o documento final.',
        },
        {
          q: 'Como girar páginas invertidas ou de cabeça para baixo de forma permanente?',
          a: 'Clique no botão de girar (90° em 90°) na miniatura da página desejada. A rotação é gravada diretamente nas propriedades internas do PDF (/Rotate), garantindo que o arquivo abra corretamente em qualquer leitor.',
        },
        {
          q: 'O processo de reorganização ou rotação afeta a qualidade do texto ou imagens?',
          a: 'Não. A reorganização manipula os objetos estruturais das páginas sem recodificar nem rasterizar os dados. O texto permanece 100% vetorial e as imagens mantêm a qualidade e o tamanho originais.',
        },
      ],
    },
    en: {
      features: ['Visual reordering and page rotation', 'Quick deletion of unwanted pages', 'High-resolution thumbnail previews', 'Direct native PDF object manipulation'],
      faq: [
        {
          q: 'How do I reorder, rearrange, and delete pages in a PDF document?',
          a: 'Document pages are displayed as an interactive thumbnail grid. Drag pages into your desired sequence, use rotation buttons to correct orientation, or delete unwanted pages before exporting.',
        },
        {
          q: 'How do I permanently rotate upside-down or sideways pages in a PDF?',
          a: 'Click the rotate icon (90-degree steps) on the corresponding page card. The rotation angle is written directly into the PDF’s /Rotate dictionary entry, ensuring it opens properly in all PDF readers.',
        },
        {
          q: 'Does reorganizing or rotating pages affect the quality of text or images?',
          a: 'No. Reordering and rotation manipulate the PDF page tree without rasterization. Vector fonts, vector art, and high-res image streams remain untouched.',
        },
      ],
    },
  },

  'protect-pdf': {
    pt: {
      features: ['Criptografia de documento com senha no navegador', 'Bloqueio de acesso universal para qualquer leitor', 'Sem armazenamento ou recuperação de chaves', 'Execução 100% no cliente sem cadastro'],
      faq: [
        {
          q: 'Como proteger um arquivo PDF adicionando uma senha de abertura segura?',
          a: 'Arraste o arquivo PDF, defina uma senha forte de acesso e clique em "Proteger PDF". O documento gerado é protegido com criptografia de acesso padrão, impedindo que qualquer pessoa visualize o conteúdo sem informar a senha exata.',
        },
        {
          q: 'A senha cadastrada ou o conteúdo do PDF são transmitidos para algum servidor?',
          a: 'Não. A criptografia é executada integralmente no navegador pelo motor client-side. Seus documentos sigilosos e a senha escolhida nunca passam pela internet, eliminando qualquer risco de vazamento em servidores.',
        },
        {
          q: 'O que acontece se eu esquecer ou perder a senha definida no PDF?',
          a: 'O arquivo não poderá ser aberto. Como a senha não é armazenada em nenhum lugar e a criptografia protege o documento em nível matemático, não existe recuperação ou redefinição de senha.',
        },
        {
          q: 'O texto e o conteúdo do documento continuam selecionáveis com Ctrl+F?',
          a: 'Para garantir proteção integral contra extração de dados, as páginas são encapsuladas com segurança criptografada. Certifique-se de salvar uma cópia desprotegida do original para seu próprio arquivo de segurança.',
        },
      ],
    },
    en: {
      features: ['In-browser password encryption for PDFs', 'Universal access lock for all standard readers', 'Zero key storage or telemetry', '100% client-side with no account needed'],
      faq: [
        {
          q: 'How do I password-protect a PDF document with strong security?',
          a: 'Drop your PDF file, enter a secure opening password, and download the protected document. The encrypted PDF requires the exact passphrase to be entered in any PDF viewer or browser before viewing.',
        },
        {
          q: 'Is my password or document content transmitted to any server?',
          a: 'No. Encryption executes entirely inside your local browser tab. Neither your document payload nor your chosen password ever travels across the network.',
        },
        {
          q: 'What happens if I forget or lose the password I set on the PDF?',
          a: 'The document cannot be recovered. Because zero-knowledge client-side encryption is used and no backdoors exist, keep your password recorded safely in a password manager.',
        },
        {
          q: 'Is text still selectable and searchable after protecting the PDF?',
          a: 'Pages are securely sealed to prevent unauthorized extraction. Always retain an unencrypted master copy of your original document for your personal archives.',
        },
      ],
    },
  },

  'sign-pdf': {
    pt: {
      features: ['Assinatura desenhada na tela ou por upload de imagem', 'Posicionamento e redimensionamento livres em qualquer página', 'Fixação direta no fluxo do documento', 'Sem armazenamento e sem assinatura paga'],
      faq: [
        {
          q: 'Como assinar um documento PDF digitalmente sem precisar imprimir e escanear?',
          a: 'Carregue o PDF, desenhe sua assinatura na tela com o mouse/touchpad/caneta ou faça o upload de uma imagem da sua rubrica com fundo transparente. Em seguida, posicione e ajuste o tamanho da assinatura na página desejada e baixe o PDF assinado.',
        },
        {
          q: 'Qual é a validade jurídica de um documento assinado visualmente nesta ferramenta?',
          a: 'Esta ferramenta aplica uma assinatura eletrônica simples/visual (equivalente a assinar uma via impressa e digitalizar). Para atos que exijam certificados digitais ICP-Brasil (assinatura qualificada), é necessário utilizar um certificado com token A1/A3 emitido por Autoridade Certificadora.',
        },
        {
          q: 'A assinatura inserida pode ser descolada ou apagada facilmente do arquivo?',
          a: 'A assinatura é gravada como um elemento gráfico embutido na página do PDF, integrando-se aos objetos do documento em vez de ser um simples comentário de anotação facilmente removível.',
        },
        {
          q: 'A minha assinatura fica salva em algum banco de dados ou histórico da plataforma?',
          a: 'Não. Sua assinatura existe temporariamente apenas na aba aberta do seu navegador e é totalmente descartada ao fechar ou recarregar a página. Não mantemos histórico, contas nem servidores de coleta.',
        },
      ],
    },
    en: {
      features: ['Draw signature or upload signature image', 'Free placement and scaling across any page', 'Embedded directly into the page stream', 'No storage, tracking or paid subscriptions'],
      faq: [
        {
          q: 'How do I sign a PDF document online without printing and scanning?',
          a: 'Upload your PDF, draw your signature using your mouse, trackpad, or touchscreen, or upload a transparent PNG image of your handwritten signature. Place and scale the signature on any page, then export your signed document.',
        },
        {
          q: 'What is the legal validity of a visually signed PDF document?',
          a: 'This applies an electronic signature (equivalent to signing a physical paper and scanning it). For transactions requiring qualified digital certificates (e.g. eIDAS / ICP), a hardware token or certified digital ID is required.',
        },
        {
          q: 'Can the signature be easily peeled off or removed from the PDF?',
          a: 'The signature is composited directly into the PDF page stream rather than attached as a floating annotation, making it permanent in standard readers.',
        },
        {
          q: 'Is my signature stored in any database, profile, or platform history?',
          a: 'No. Your drawn signature exists strictly in local memory and is purged as soon as you close or reload the browser tab. We maintain no accounts, databases, or logs.',
        },
      ],
    },
  },

  'watermark-pdf': {
    pt: {
      features: ['Marca d’água em texto personalizado ou logotipo', 'Posicionamento em grade diagonal ou pontos fixos', 'Ajuste de opacidade, tamanho, cor e ângulo', 'Preservação completa do texto vetorial'],
      faq: [
        {
          q: 'Como inserir marca d’água de texto ou imagem em todas as páginas de um PDF?',
          a: 'Escolha entre marca d’água em texto (como "CONFIDENCIAL", "RASCUNHO" ou seu nome) ou envie a imagem do seu logotipo. Configure a opacidade, tamanho da fonte, cor, ângulo de inclinação e selecione se deseja repetir na diagonal ou posicionar em um ponto fixo.',
        },
        {
          q: 'A marca d’água aplicada aparece na impressão e em leitores comuns de PDF?',
          a: 'Sim. A marca d’água é incorporada como objeto vetorial diretamente no fluxo visual de cada página, aparecendo com fidelidade exata em qualquer visualizador de PDF no computador, celular e em impressões físicas.',
        },
        {
          q: 'É possível remover ou apagar a marca d’água do documento depois de gerado?',
          a: 'Não diretamente a partir do arquivo marcado. É justamente por isso que a marca d’água é eficaz para proteger minutas, cópias de controle e documentos contra uso não autorizado. Guarde sempre o original sem marca d’água.',
        },
        {
          q: 'A aplicação de marca d’água reduz a qualidade do texto ou imagens do PDF?',
          a: 'Não. A marca d’água é adicionada como uma camada vetorial sobreposta sem rasterizar as páginas, preservando toda a qualidade original das fontes, linhas e figuras do documento.',
        },
      ],
    },
    en: {
      features: ['Custom text or logo watermark stamping', 'Diagonal tiled grid or fixed anchor positions', 'Adjustable opacity, scale, color and angle', 'Full preservation of vector text & layers'],
      faq: [
        {
          q: 'How do I add a text or logo watermark across all pages of a PDF?',
          a: 'Select text mode (e.g. "CONFIDENTIAL", "DRAFT", or custom identifiers) or upload your logo image. Customize opacity, font sizing, color palette, rotation angle, and choose between a diagonal tiled grid or a fixed anchor.',
        },
        {
          q: 'Does the watermark show up on physical printouts and in all PDF viewers?',
          a: 'Yes. The watermark is stamped as a vector element into each page’s content stream, ensuring it displays reliably across all desktop readers, mobile apps, and physical printers.',
        },
        {
          q: 'Can the watermark be removed from the exported PDF document later?',
          a: 'Not easily from the stamped file alone, which is why watermarking is ideal for distribution control. Always keep your unwatermarked source file safe in your private archive.',
        },
        {
          q: 'Does applying a watermark reduce the quality of the original PDF text or images?',
          a: 'No. The watermark is composited as an overlay without rasterizing the underlying document, preserving 100% of original vector typography, links, and image resolutions.',
        },
      ],
    },
  },

  'cut-audio': {
    pt: {
      features: ['Forma de onda interativa com zoom de alta precisão', 'Modos para manter seleção ou remover trecho', 'Efeitos suaves de fade-in e fade-out', 'Exportação em WAV sem perdas de áudio'],
      faq: [
        {
          q: 'Como cortar, aparar e editar trechos de uma música ou gravação de áudio online?',
          a: 'Carregue o arquivo de áudio para visualizar a forma de onda completa (waveform). Arraste os marcadores de início e fim com precisão milimétrica, utilize o zoom para visualizar picos e silêncios, aplique fade-in/out e baixe o trecho editado.',
        },
        {
          q: 'Cortar um arquivo de áudio reduz a sua qualidade sonora ou adiciona ruído?',
          a: 'Não. A extração das amostras de áudio decodificadas é processada diretamente via Web Audio API e exportada no formato WAV de alta fidelidade (Linear PCM), sem aplicar uma segunda geração de compressão com perdas.',
        },
        {
          q: 'Por que o arquivo de áudio cortado pode ficar com tamanho maior que o original?',
          a: 'Porque o cortador exporta em WAV não comprimido para garantir 100% de qualidade acústica sem perda de frequências. Se você precisar de um arquivo mais leve para enviar pelo WhatsApp ou e-mail, basta usar nossa ferramenta de Comprimir Áudio.',
        },
        {
          q: 'Quais formatos de áudio e limites de duração são suportados na ferramenta?',
          a: 'Suportamos arquivos MP3, WAV, OGG, M4A, AAC e FLAC de até 100 MB e 30 minutos de duração, limite calibrado para garantir que a decodificação em ponto flutuante de 32 bits não esgote a memória RAM da aba.',
        },
      ],
    },
    en: {
      features: ['High-precision zoomable interactive waveform', 'Modes to keep selection or remove slice', 'Smooth fade-in and fade-out envelope tools', 'Lossless WAV audio stream export'],
      faq: [
        {
          q: 'How do I cut, trim, and edit sections of an audio file online?',
          a: 'Drop your audio file to render the interactive waveform. Drag the start and end boundary markers with sub-second precision, zoom into waveforms to find edit points, apply fade transitions, and download your trimmed clip.',
        },
        {
          q: 'Does cutting an audio track reduce sound quality or introduce compression artifacts?',
          a: 'No. Raw decoded audio samples are processed directly via the Web Audio API and written into lossless WAV format (Linear PCM), avoiding lossy multi-generation compression artifacts.',
        },
        {
          q: 'Why might the exported cut audio file have a larger file size than the original?',
          a: 'Because the output is exported as uncompressed WAV to maintain pristine studio acoustic quality. To shrink the file for messaging apps or email, route it directly to our Compress Audio tool.',
        },
        {
          q: 'Which audio formats and length limits are supported by the cutter?',
          a: 'We support MP3, WAV, OGG, M4A, AAC, and FLAC files up to 100 MB and 30 minutes in duration, ensuring that 32-bit floating-point audio decoding remains well within browser RAM limits.',
        },
      ],
    },
  },

  'merge-audio': {
    pt: {
      features: ['União de múltiplas faixas em um arquivo contínuo', 'Transição suave com crossfade de potência constante', 'Equalização automática mono e estéreo', 'Sem recompressão destrutiva'],
      faq: [
        {
          q: 'Como juntar e mesclar duas ou mais faixas de áudio em um único arquivo?',
          a: 'Arraste todas as faixas de áudio para a ferramenta, ordene a sequência das músicas ou gravações arrastando os cards, configure a duração do crossfade se desejar uma transição suave entre elas e baixe o arquivo combinado.',
        },
        {
          q: 'O que é o efeito de crossfade e como ele melhora a transição entre faixas?',
          a: 'O crossfade sobrepõe o final da primeira música com o início da próxima utilizando uma curva de potência constante (Equal-Power). Isso elimina estalos, silêncios abruptos e quedas de volume entre faixas, criando uma transição profissional contínua.',
        },
        {
          q: 'É possível combinar arquivos de áudio gravados em mono com músicas em estéreo?',
          a: 'Sim. Quando há mistura de canais, o motor converte automaticamente as faixas mono para canais estéreo duplicados, preservando a espacialidade e a qualidade das faixas estéreo sem rebaixá-las para mono.',
        },
        {
          q: 'Qual é o formato de saída do áudio combinado e como otimizar seu tamanho?',
          a: 'O arquivo combinado é exportado em WAV sem perdas. Caso precise reduzir o peso do arquivo final para distribuição, envie o áudio gerado para a nossa ferramenta de Compressão de Áudio com um clique.',
        },
      ],
    },
    en: {
      features: ['Join multiple audio tracks into a seamless file', 'Smooth equal-power crossfade transitions', 'Automatic mono to stereo widening', 'Zero destructive re-encoding'],
      faq: [
        {
          q: 'How do I join and merge multiple audio tracks into a single continuous file?',
          a: 'Drop all your audio files, arrange track order in the visual playlist, adjust the optional crossfade duration for smooth transitions, and download the combined audio track.',
        },
        {
          q: 'What is an equal-power crossfade and how does it prevent clicks between tracks?',
          a: 'Equal-power crossfading smoothly overlaps the tail of one track with the head of the next along a logarithmic curve. This prevents volume dips and abrupt clicks at edit seams, delivering a broadcast-quality transition.',
        },
        {
          q: 'Can I merge mono voice recordings with stereo music tracks?',
          a: 'Yes. The engine automatically widens single-channel mono tracks to dual-channel stereo buffers, preserving the richness of stereo tracks without degrading the whole mix.',
        },
        {
          q: 'What is the output format of the merged audio and how do I optimize its size?',
          a: 'The output is saved as lossless WAV. To compress the resulting mix into a lightweight MP3 for web sharing, pass it straight to our Audio Compressor tool.',
        },
      ],
    },
  },

  'convert-audio': {
    pt: {
      features: ['Conversão entre MP3, WAV, OGG e M4A', 'Ajuste fino de taxa de bits (bitrate) e canais', 'Codificação LAME em JavaScript no cliente', 'Sem filas e sem limite diário de conversões'],
      faq: [
        {
          q: 'Como converter arquivos de áudio entre diferentes formatos no navegador?',
          a: 'Solte o arquivo de áudio, escolha o formato de destino (MP3, WAV, OGG ou M4A) e configure a taxa de bits e canais desejados. A decodificação e a codificação rodam na sua aba com processamento instantâneo e sem filas de espera.',
        },
        {
          q: 'Como o formato MP3 é gerado localmente sem necessidade de servidores?',
          a: 'Utilizamos uma versão do consagrado codificador LAME compilada em JavaScript/WebAssembly que roda diretamente na thread do navegador, permitindo codificar MP3 de alta fidelidade sem que nenhum áudio seja enviado para servidores externos.',
        },
        {
          q: 'Converter uma música de MP3 para o formato WAV melhora a sua qualidade?',
          a: 'Não. O que foi descartado na compressão original com perdas do MP3 não pode ser recriado. Converter para WAV é útil para editar o áudio em softwares profissionais sem adicionar novas perdas nas etapas seguintes.',
        },
        {
          q: 'Por que a taxa de amostragem (sample rate) pode ser adaptada na conversão?',
          a: 'O navegador decodifica o áudio na taxa nativa do hardware de saída do dispositivo (normalmente 44,1 kHz ou 48 kHz). Nosso motor preserva a fidelidade harmônica garantindo compatibilidade total com tocadores de áudio modernos.',
        },
      ],
    },
    en: {
      features: ['Converts between MP3, WAV, OGG and M4A', 'Fine bitrate and channel mode controls', 'Client-side JavaScript LAME MP3 encoding', 'No server queues and unlimited daily conversions'],
      faq: [
        {
          q: 'How do I convert audio files between different formats inside the browser?',
          a: 'Upload your audio track, choose your target format (MP3, WAV, OGG, or M4A), and select your desired bitrate and channel configuration. Audio decoding and encoding execute instantly client-side without upload queues.',
        },
        {
          q: 'How is MP3 encoding performed locally without sending files to a server?',
          a: 'We incorporate a pure JavaScript/Wasm port of the industry-standard LAME MP3 encoder running in a dedicated browser thread, producing high-fidelity MP3s entirely on your machine.',
        },
        {
          q: 'Does converting an MP3 track into WAV restore or improve audio quality?',
          a: 'No. Frequencies discarded by the initial lossy compression cannot be mathematically restored. Converting to uncompressed WAV is beneficial when prepping audio for studio editing without incurring further generation loss.',
        },
        {
          q: 'Why might the sample rate adapt during the audio decoding process?',
          a: 'Browsers decode audio buffers at the native output clock rate of your audio hardware (typically 44.1 kHz or 48 kHz). Our encoder adapts the sample rate cleanly, preserving acoustic clarity across all playback platforms.',
        },
      ],
    },
  },

  'compress-audio': {
    pt: {
      features: ['Taxas de bits ajustáveis de 32 kbps a 320 kbps', 'Conversão opcional para canal mono', 'Estimativa de tamanho em tempo real antes de processar', 'Otimização ideal para podcasts e aulas'],
      faq: [
        {
          q: 'Como diminuir o tamanho em MB de um arquivo de áudio ou gravação de voz?',
          a: 'Selecione a taxa de bits (bitrate) desejada e ative a conversão para mono caso seja uma gravação de voz. A ferramenta exibe em tempo real o tamanho estimado do arquivo final antes de você iniciar a compressão.',
        },
        {
          q: 'Qual taxa de bits (bitrate) devo selecionar para músicas, podcasts e reuniões?',
          a: 'Para músicas e produções com instrumentos, 128 kbps a 192 kbps oferecem excelente qualidade; para podcasts, videoaulas e reuniões faladas, 64 kbps em mono corta o tamanho do arquivo em mais de 70% mantendo a voz perfeitamente inteligível.',
        },
        {
          q: 'Comprimir novamente um arquivo MP3 já reduzido afeta a clareza do som?',
          a: 'Sim, cada recompressão com perdas remove pequenas nuances de frequência. Por isso, recomendamos sempre comprimir a partir da melhor gravação original disponível (como o arquivo WAV ou gravação bruta).',
        },
        {
          q: 'Vale a pena converter o áudio para mono para reduzir o tamanho do arquivo?',
          a: 'Para gravações de voz capturadas em um único microfone, sim: o canal estéreo apenas duplica a mesma informação nos dois ouvidos. Converter para mono reduz o tamanho do arquivo quase pela metade sem perda audível de qualidade.',
        },
      ],
    },
    en: {
      features: ['Adjustable bitrates from 32 kbps to 320 kbps', 'Optional downmix to single mono channel', 'Real-time file size estimate before processing', 'Ideal optimization for podcasts & lectures'],
      faq: [
        {
          q: 'How do I reduce the file size in MB of an audio file or voice recording?',
          a: 'Select your target bitrate and optionally enable mono downmixing for spoken word. The tool computes real-time file size estimates before compression starts, giving you full control over the quality/size balance.',
        },
        {
          q: 'Which bitrate should I choose for music, podcasts, and meeting recordings?',
          a: 'For music, 128 kbps to 192 kbps maintains balanced high-frequency response; for podcasts, interviews, and voice memos, 64 kbps mono shrinks file size by over 70% while keeping speech crisp.',
        },
        {
          q: 'Does re-compressing an existing MP3 file degrade acoustic clarity?',
          a: 'Yes. Successive lossy re-encodes cumulatively discard acoustic nuances. For maximum fidelity, always perform compression starting from your cleanest available master recording.',
        },
        {
          q: 'Is it worth converting an audio file to mono to reduce its file size?',
          a: 'For single-microphone speech recordings, absolutely: stereo channels simply store duplicate data for left and right ears. Downmixing to mono halves the data payload with zero discernible loss in voice quality.',
        },
      ],
    },
  },

  'normalize-audio': {
    pt: {
      features: ['Normalização profissional de loudness em LUFS', 'Limitador transparente com look-ahead anti-clipping', 'Presets para Podcast (-16 LUFS) e Streaming (-14 LUFS)', 'Medição acústica em tempo real antes de aplicar'],
      faq: [
        {
          q: 'Como aumentar o volume de uma gravação de áudio baixa sem distorcer o som?',
          a: 'Carregue o áudio no modo Loudness (LUFS): a ferramenta analisa a curva de volume percebido pelo ouvido humano ao longo de toda a gravação, calcula o ganho ideal e aplica um limitador inteligente com look-ahead para evitar que picos estourem ou distorçam.',
        },
        {
          q: 'Qual a diferença fundamental entre normalizar por pico e normalizar por loudness (LUFS)?',
          a: 'A normalização por pico considera apenas a amostra individual mais alta do arquivo (se houver um estalo na mesa, o volume geral não aumenta). A normalização por Loudness (LUFS) mede a energia sonora média percebida pelo ouvido conforme as normas internacionais EBU R128 e ITU BS.1770, garantindo volume consistente do início ao fim.',
        },
        {
          q: 'O que significam os padrões -14 LUFS, -16 LUFS e -23 LUFS da indústria?',
          a: '-14 LUFS é o padrão adotado por plataformas de streaming (Spotify, YouTube); -16 LUFS é o padrão consagrado para podcasts e audiobooks; e -23 LUFS é a norma padrão de broadcast e televisão europeia. Normalizar no alvo correto evita que as plataformas baixem seu áudio automaticamente.',
        },
        {
          q: 'A normalização de volume pode estourar, clipar ou distorcer os trechos mais altos?',
          a: 'Não. Nosso motor utiliza um limitador de pico com previsão temporal (look-ahead) que atenua suavemente a curva de ganho milissegundos antes da chegada de picos fortes, garantindo um teto seguro (True Peak a -1 dBTP) sem cortes abruptos na onda.',
        },
      ],
    },
    en: {
      features: ['Professional LUFS integrated loudness normalization', 'Transparent look-ahead anti-clipping limiter', 'Presets for Podcasts (-16 LUFS) & Streaming (-14 LUFS)', 'Real-time acoustic loudness readout before processing'],
      faq: [
        {
          q: 'How do I increase the volume of a quiet audio recording without distortion?',
          a: 'Drop your file into Loudness (LUFS) mode: the tool scans perceived loudness across the track, calculates required decibel gain, and applies a transparent look-ahead limiter to prevent distortion and clipping on sudden peaks.',
        },
        {
          q: 'What is the difference between peak normalization and LUFS loudness normalization?',
          a: 'Peak normalization only checks the single highest amplitude sample in the file (a single loud clap stops the rest from being amplified). Loudness normalization (LUFS) measures integrated perceived acoustic energy over time (ITU-R BS.1770 / EBU R128), ensuring consistent volume.',
        },
        {
          q: 'What do the industry reference standards -14 LUFS, -16 LUFS, and -23 LUFS mean?',
          a: '-14 LUFS is the target calibrated by Spotify and YouTube; -16 LUFS is the podcast and spoken-word standard; and -23 LUFS matches European broadcast television (EBU R128). Hitting the right target stops streaming platforms from applying automatic volume attenuation.',
        },
        {
          q: 'Can volume normalization cause clipping, harsh distortion, or audio blowout?',
          a: 'No. The processing pipeline includes an intelligent look-ahead peak limiter that smoothly attenuates dynamics before high transients hit the ceiling, maintaining safe True Peak headroom (-1 dBTP) without harsh wave clipping.',
        },
      ],
    },
  },

  'screen-recorder': {
    pt: {
      features: [
        'Tela inteira, janela ou aba',
        'Som do sistema + microfone',
        'Até 60 minutos por gravação',
        'O vídeo nunca sai da aba',
      ],
      faq: [
        {
          q: 'Como gravar a tela do computador com áudio sem instalar nenhum programa?',
          a: 'Abra o gravador, selecione se deseja capturar o áudio do sistema e/ou o microfone e clique em "Iniciar Gravação". O navegador exibirá o seletor nativo para você escolher entre a tela inteira, uma janela de aplicativo ou uma aba específica. O vídeo é processado em tempo real e montado diretamente na sua aba.',
        },
        {
          q: 'Por que o áudio do sistema não é capturado ao selecionar apenas uma janela de aplicativo?',
          a: 'Por restrições de segurança do sistema operacional e do próprio navegador (Chrome/Edge/Firefox), a captura de áudio do sistema é disponibilizada apenas ao compartilhar a tela inteira ou uma aba do navegador, não para janelas individuais. Se precisar do som de um vídeo ou jogo, selecione a tela inteira ou uma aba.',
        },
        {
          q: 'Em qual formato de vídeo a gravação de tela é exportada e salva?',
          a: 'A gravação é salva no formato WebM (com codecs VP9 e áudio Opus de alta definição) no Chrome, Edge e Firefox, e em MP4 no Safari. O arquivo é gerado com timestamps sincronizados e pode ser reproduzido em qualquer tocador de vídeo moderno.',
        },
        {
          q: 'Por que o tempo máximo de gravação contínua é limitado em 60 minutos?',
          a: 'O limite de 60 minutos visa garantir a estabilidade do arquivo e o gerenciamento de espaço no disco local do navegador, já que uma hora de gravação em alta definição a 60 fps pode ocupar mais de 1,2 GB. Ao atingir o limite, você pode salvar o arquivo e iniciar uma nova gravação imediatamente.',
        },
        {
          q: 'Como posso extrair apenas o áudio de uma gravação de tela que acabei de fazer?',
          a: 'Ao finalizar a gravação de tela, clique no atalho "Enviar para Extrair Áudio" no painel de ações. O vídeo gravado é transferido diretamente para a ferramenta de extração para que você baixe a trilha sonora em MP3 ou WAV sem precisar fazer downloads extras.',
        },
      ],
    },
    en: {
      features: [
        'Entire screen, window or tab',
        'System audio + microphone',
        'Up to 60 minutes per take',
        'The video never leaves the tab',
      ],
      faq: [
        {
          q: 'How do I record my computer screen with audio without installing software?',
          a: 'Open the recorder, choose whether to capture system audio and/or microphone voiceover, and click "Start Recording". The browser’s native picker lets you select your full desktop, a window, or a specific tab. Media streams are encoded in real time directly inside your browser tab.',
        },
        {
          q: 'Why is system audio unavailable when recording a single application window?',
          a: 'Due to browser and OS security sandbox constraints, Chrome and Edge only expose system audio streams when sharing the entire screen or a browser tab, not a standalone application window. Choose full screen or a browser tab to record internal audio.',
        },
        {
          q: 'What video container and codec format does the screen recording output in?',
          a: 'Recordings output as standard WebM (VP9/VP8 video with Opus audio) on Chrome, Edge, and Firefox, and MP4 on Safari. Output files include proper index metadata and play back smoothly across all modern media players.',
        },
        {
          q: 'Why is continuous screen recording capped at a maximum of 60 minutes?',
          a: 'The 60-minute duration limit prevents browser disk storage exhaustion, as an hour of 1080p 60fps recording generates over 1.2 GB of raw video stream chunks. You can save your take and start a new take immediately.',
        },
        {
          q: 'How can I extract only the audio track from a screen recording I just completed?',
          a: 'After finishing your recording, click the "Send to Extract Audio" action shortcut. The recorded video stream feeds straight into our audio extractor so you can download an MP3 or WAV without saving and re-uploading.',
        },
      ],
    },
  },

  'video-to-audio': {
    pt: {
      features: ['Extração de MP4, MOV, WebM, MKV e AVI', 'Exportação em MP3 ou WAV com fidelidade máxima', 'Suporte a vídeos de até 500 MB e 30 minutos', 'Processamento local sem upload de vídeo pesado'],
      faq: [
        {
          q: 'Como extrair e converter o áudio de um arquivo de vídeo sem fazer upload na internet?',
          a: 'Solte o arquivo de vídeo (MP4, MOV, WebM, MKV, etc.), selecione o formato de saída desejado (MP3 ou WAV) e clique em baixar. O decodificador do navegador lê o container do vídeo localmente e extrai a trilha sonora em segundos sem consumir seus dados de internet.',
        },
        {
          q: 'Extrair a trilha sonora de um vídeo causa perda de qualidade ou fidelidade no áudio?',
          a: 'Se você escolher o formato WAV, o áudio é extraído exatamente como as amostras brutas foram decodificadas, com zero perdas. Na escolha por MP3, o áudio passa por uma codificação LAME em alta taxa de bits (192 kbps a 320 kbps), preservando a clareza e o equilíbrio sonoro.',
        },
        {
          q: 'Por que em alguns navegadores a extração precisa reproduzir o vídeo em tempo real?',
          a: 'Quando o navegador não expõe APIs de decodificação direta rápida para determinados codecs de vídeo (como certos formatos MOV/MKV no Safari/Firefox), a ferramenta ativa o modo de compatibilidade, capturando as amostras de áudio conforme o arquivo é processado internamente.',
        },
        {
          q: 'Por que existe um limite máximo de 30 minutos e 500 MB para o vídeo?',
          a: 'O áudio decodificado em memória vira um buffer de ponto flutuante de 32 bits que demanda centenas de megabytes de memória RAM. O limite de 30 minutos e 500 MB assegura que o navegador execute a extração com rapidez e sem risco de travamento da aba.',
        },
      ],
    },
    en: {
      features: ['Extracts from MP4, MOV, WebM, MKV and AVI', 'Export to MP3 or maximum fidelity WAV', 'Supports videos up to 500 MB and 30 minutes', 'Local execution with zero heavy video uploads'],
      faq: [
        {
          q: 'How do I extract and convert audio from a video file without uploading it?',
          a: 'Drop your video file (MP4, MOV, WebM, MKV, etc.), select your output format (MP3 or lossless WAV), and click download. The browser’s native media engine demuxes the video stream and extracts the audio track in seconds.',
        },
        {
          q: 'Does extracting the audio track from a video cause quality loss or acoustic degradation?',
          a: 'Choosing WAV exports the decoded audio samples verbatim with zero generation loss. Exporting as MP3 uses the high-performance LAME encoder at high bitrates (192+ kbps), keeping acoustic fidelity virtually indistinguishable from the source.',
        },
        {
          q: 'Why does extraction occasionally run at playback speed in some browsers?',
          a: 'When specific browser media decoders refuse offline demuxing on non-standard video containers (such as certain MKV or MOV codecs), the tool falls back to a compatibility capture loop that decodes sound sample-by-sample without crashing.',
        },
        {
          q: 'Why is there a duration limit of 30 minutes and 500 MB for video files?',
          a: 'Decoded 32-bit floating-point audio buffers occupy ~700 MB of RAM for 30 minutes of 48 kHz stereo sound. The limits ensure safe memory bounds so your browser processes conversions smoothly.',
        },
      ],
    },
  },

  'qr-code': {
    pt: {
      features: ['100% Offline e Seguro contra rastreamento', 'Suporte a Wi-Fi, Pix, Links, vCard, E-mail e Texto', 'Leitor integrado por envio de imagem e câmera ao vivo', 'Exportação em alta definição em PNG e SVG vetorial'],
      faq: [
        {
          q: 'Como criar um QR Code seguro e personalizado sem enviar informações para servidores?',
          a: 'Escolha o tipo de conteúdo (Link, rede Wi-Fi, chave Pix, cartão vCard, e-mail ou texto livre), preencha os dados e personalize cores e margens. A matriz geométrica do código é desenhada instantaneamente no navegador via Canvas e SVG vetorial, sem que nenhum dado seja transmitido para servidores.',
        },
        {
          q: 'É seguro gerar QR Codes para redes Wi-Fi, senhas confidenciais e chaves Pix no Nada Sai?',
          a: 'Sim, e essa é uma das maiores vantagens da nossa plataforma. Geradores de QR Code online tradicionais salvam os links, senhas de Wi-Fi e dados preenchidos em bancos de dados de terceiros para rastreamento. No Nada Sai, o código é gerado 100% no seu dispositivo com total sigilo.',
        },
        {
          q: 'Como funciona o leitor e decodificador de QR Code integrado no navegador?',
          a: 'Você pode enviar uma foto contendo um QR Code, colar uma imagem da área de transferência com Ctrl+V ou ativar a câmera do dispositivo. O leitor decodifica o código localmente em TypeScript e identifica automaticamente URLs, credenciais Wi-Fi, chaves Pix e cartões de contato.',
        },
        {
          q: 'Qual a diferença técnica entre baixar o QR Code nos formatos PNG ou SVG?',
          a: 'O formato PNG é uma imagem em alta resolução com fundo transparente ou branco, ideal para posts em redes sociais, apresentações e uso digital; o formato SVG é um vetor matemático infinitamente escalável, perfeito para impressões gráficas de grande porte, totens e cartões de visita.',
        },
      ],
    },
    en: {
      features: ['100% Offline & Private with zero tracking', 'Supports Wi-Fi, Pix, Links, vCard, Email & Text', 'Integrated scanner via image upload or live camera', 'High-definition PNG & vector SVG export'],
      faq: [
        {
          q: 'How do I generate a secure, private QR code without sending data to servers?',
          a: 'Select your data type (URL, Wi-Fi credentials, Pix payment, vCard contact, email, or plain text), enter your content, and customize colors and margins. The matrix is rendered directly in your browser using Canvas and vector SVG elements with zero network requests.',
        },
        {
          q: 'Is it safe to create Wi-Fi passwords, private links, and financial QR codes here?',
          a: 'Yes, and that is a core privacy benefit of Nada Sai. Traditional online generators log what you type into marketing analytics databases. Here, everything executes locally on your CPU, keeping your Wi-Fi passphrases and private payloads strictly confidential.',
        },
        {
          q: 'How does the integrated in-browser QR code scanner and decoder work?',
          a: 'Upload an image containing a QR code, paste a screenshot directly with Ctrl+V, or enable your device camera. The client-side TypeScript scanner decodes the QR matrix instantly, automatically parsing Wi-Fi credentials, links, and contact vCards.',
        },
        {
          q: 'What is the technical difference between downloading a QR code as PNG or SVG?',
          a: 'PNG is a high-resolution raster image ideal for social media, digital displays, and messaging apps; SVG is an infinitely scalable vector graphic that maintains razor-sharp edges on large-scale physical banners, product packaging, and business cards.',
        },
      ],
    },
  },
  'video-to-gif': {
    pt: {
      features: [
        'Recorte de até 30 segundos',
        'Paleta escolhida em CIELAB',
        'Sem marca dágua',
        'Processamento 100% no navegador',
      ],
      faq: [
        {
          q: 'Como transformar um vídeo em GIF sem marca dágua?',
          a: 'Solte o arquivo de vídeo na área de upload, arraste os dois controles para marcar o trecho que interessa (até 30 segundos), ajuste largura, quadros por segundo e número de cores, e gere. O GIF sai limpo, sem nenhuma marca sobreposta e sem cadastro, porque a conversão inteira acontece dentro da aba do seu navegador — não existe servidor para cobrar por ela nem para carimbar o resultado. O arquivo aparece na tela antes de você baixar, então dá para conferir o resultado e refazer com outros ajustes quantas vezes quiser.',
        },
        {
          q: 'Por que o GIF fica tão pesado, e o que fazer para diminuir?',
          a: 'O formato GIF não tem compressão entre quadros: cada quadro é guardado como uma imagem inteira, então o tamanho é basicamente a contagem de quadros multiplicada pela contagem de pixels. Três controles resolvem isso, em ordem de eficácia: encurtar o trecho, baixar a largura e reduzir os quadros por segundo. Doze quadros por segundo já dão movimento fluido para captura de tela, e 480 pixels de largura é o suficiente para a maioria dos usos em ticket, chat e documentação. Reduzir as cores de 256 para 128 também ajuda, principalmente em interface chapada.',
        },
        {
          q: 'A qualidade de cor do GIF é melhor que a dos conversores comuns?',
          a: 'A paleta é escolhida por agrupamento em CIELAB, que é um espaço de cor onde a distância entre dois valores corresponde à diferença que o olho percebe — diferente do RGB, usado pela maioria dos conversores, onde a mesma distância numérica significa coisas diferentes em cada faixa. Na prática isso reduz o banding em degradês e evita aquela cor lavada típica de GIF antigo. E quando o vídeo realmente tem menos de 256 cores distintas, a paleta é a lista exata delas e a conversão não perde nenhuma cor — a ferramenta avisa na tela quando foi o caso.',
        },
        {
          q: 'O vídeo é enviado para algum servidor durante a conversão?',
          a: 'Não. O vídeo é lido pelo próprio navegador, os quadros são desenhados numa tela em memória e o arquivo GIF é escrito na mesma aba, byte a byte, por código que roda no seu dispositivo. Nenhuma parte do processo envolve upload, e o medidor de rede no alto da página mostra isso em tempo real durante toda a conversão. Depois da primeira visita a ferramenta continua funcionando com a internet desligada, o que é a forma mais simples de verificar a afirmação.',
        },
      ],
    },
    en: {
      features: [
        'Up to 30 seconds per clip',
        'Palette chosen in CIELAB',
        'No watermark',
        'Runs 100% in the browser',
      ],
      faq: [
        {
          q: 'How do I turn a video into a GIF with no watermark?',
          a: 'Drop the video file on the upload area, drag the two controls to mark the stretch you want (up to 30 seconds), set the width, the frames per second and the number of colours, and generate. The GIF comes out clean, with no overlaid mark and no signup, because the whole conversion happens inside your browser tab — there is no server to charge for it or to stamp the result. The file appears on screen before you download it, so you can check the result and redo it with different settings as often as you like.',
        },
        {
          q: 'Why is the GIF so heavy, and how do I make it smaller?',
          a: 'The GIF format has no compression between frames: every frame is stored as a whole image, so the size is essentially the frame count multiplied by the pixel count. Three controls address that, in order of effectiveness: shorten the stretch, lower the width, and reduce the frames per second. Twelve frames per second already looks fluid for screen captures, and 480 pixels wide is enough for most uses in tickets, chat and documentation. Dropping the colours from 256 to 128 helps too, especially with flat interface content.',
        },
        {
          q: 'Is the colour quality better than in ordinary converters?',
          a: 'The palette is chosen by clustering in CIELAB, a colour space where the distance between two values matches the difference the eye perceives — unlike RGB, used by most converters, where the same numeric distance means different things in different ranges. In practice that reduces banding in gradients and avoids the washed-out look of old GIFs. And when the video really does have fewer than 256 distinct colours, the palette is the exact list of them and the conversion loses no colour at all — the tool says on screen when that was the case.',
        },
        {
          q: 'Is the video uploaded to a server during the conversion?',
          a: 'No. The video is read by the browser itself, the frames are drawn onto an in-memory canvas, and the GIF file is written in that same tab, byte by byte, by code running on your device. No part of the process involves an upload, and the network meter at the top of the page shows that live throughout the conversion. After the first visit the tool keeps working with the internet switched off, which is the simplest way to verify the claim.',
        },
      ],
    },
  },
  'video-to-frames': {
    pt: {
      features: [
        'Quadro escolhido no player',
        'Lote a cada N segundos, em zip',
        'PNG, JPG ou WebP',
        'Processamento 100% no navegador',
      ],
      faq: [
        {
          q: 'Como salvar um quadro de vídeo como imagem?',
          a: 'Solte o vídeo, use os controles do próprio player para parar no quadro que interessa e clique em capturar. A extração acontece no instante exato em que o vídeo está parado, com a resolução original do arquivo — não é uma foto da tela nem um recorte da janela do navegador, é o quadro lido do vídeo. Escolha entre PNG, JPG e WebP antes de gerar, e a imagem aparece na tela para conferência antes do download.',
        },
        {
          q: 'Dá para extrair vários quadros de uma vez?',
          a: 'Sim. No modo de intervalo a ferramenta percorre o vídeo inteiro e salva um quadro a cada meio segundo, um, dois, cinco ou dez segundos, entregando tudo num arquivo zip com os quadros numerados em ordem. O painel mostra quantos quadros o intervalo escolhido vai produzir antes de você rodar, e o teto é de 100 imagens — acima disso o zip precisaria ser montado inteiro na memória da aba, então a ferramenta pede um intervalo maior em vez de travar no meio.',
        },
        {
          q: 'Qual formato escolher para os quadros?',
          a: 'PNG é sem perda e a escolha certa para gravação de tela, texto, interface e qualquer imagem com borda definida: as letras saem limpas e nada é aproximado. JPG é bem mais leve em cena de câmera, onde a perda não aparece, e é o que faz diferença quando são dezenas de quadros no mesmo zip. WebP fica menor que os dois com qualidade parecida e é aceito por todos os navegadores atuais, mas ainda encontra programa antigo que não abre.',
        },
        {
          q: 'A qualidade do quadro é a mesma do vídeo?',
          a: 'É a do quadro decodificado, na resolução que você escolher — e o padrão é a resolução original do vídeo. Vale saber que um quadro isolado de vídeo comprimido nem sempre é tão nítido quanto uma foto: a compressão de vídeo guarda alguns quadros inteiros e descreve os outros como diferença em relação a eles, então movimento rápido produz quadro mais borrado. Isso vem do arquivo de origem, não da extração, e nenhuma ferramenta recupera o que o codificador descartou.',
        },
      ],
    },
    en: {
      features: [
        'Frame chosen in the player',
        'Batch every N seconds, as a zip',
        'PNG, JPG or WebP',
        'Runs 100% in the browser',
      ],
      faq: [
        {
          q: 'How do I save a video frame as an image?',
          a: 'Drop the video, use the player controls to land on the frame you want, and click capture. The extraction happens at the exact moment the video is paused, at the original resolution of the file — it is not a screenshot or a crop of the browser window, it is the frame read from the video. Choose between PNG, JPG and WebP before generating, and the image appears on screen for checking before the download.',
        },
        {
          q: 'Can I extract several frames at once?',
          a: 'Yes. In interval mode the tool walks the whole video and saves one frame every half second, one, two, five or ten seconds, handing everything back as a zip with the frames numbered in order. The panel shows how many frames the chosen interval will produce before you run it, and the ceiling is 100 images — above that the zip would have to be assembled entirely in the memory of the tab, so the tool asks for a longer interval instead of freezing halfway.',
        },
        {
          q: 'Which format should I choose for the frames?',
          a: 'PNG is lossless and the right choice for screen recordings, text, interfaces and any image with defined edges: letters come out clean and nothing is approximated. JPG is much lighter for camera footage, where the loss does not show, and that is what matters when there are dozens of frames in the same zip. WebP lands smaller than both at similar quality and every current browser accepts it, though you will still meet older software that will not open it.',
        },
        {
          q: 'Is the frame the same quality as the video?',
          a: 'It is the decoded frame, at whatever resolution you choose — and the default is the original resolution of the video. Worth knowing that a single frame from compressed video is not always as sharp as a photograph: video compression stores some frames whole and describes the others as differences from them, so fast motion produces blurrier frames. That comes from the source file, not from the extraction, and no tool recovers what the encoder discarded.',
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
