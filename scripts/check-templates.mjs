#!/usr/bin/env node
/**
 * As duas coisas que se escondem no template porque nenhum compilador as vê.
 *
 *   node scripts/check-templates.mjs      (npm run check:templates)
 *
 * ── 1. Texto de interface fora do dicionário ──────────────────────────────
 *
 * `TranslationService` deriva `TranslationKey` do dicionário EN e tipa o PT como
 * um `Record` total sobre ele, então uma chave FALTANDO é erro de compilação. O
 * que escapa inteiro dessa rede é a frase que nunca virou chave: ela é só texto
 * dentro do HTML, o compilador não tem do que reclamar, e o resultado aparece em
 * português no meio da interface em inglês — ou seja, num idioma que metade das
 * URLs indexadas serve. Já foram 25 numa auditoria e mais 68 nesta; a única
 * defesa contra a próxima é ler o template, que é o que este script faz.
 *
 * Olha, por template (`.html` e o `template:` inline):
 *
 *   - nós de texto, fora de `{{ }}` e fora da sintaxe de `@if`/`@for`;
 *   - o valor LITERAL de atributos que o usuário lê: title, aria-label,
 *     placeholder, alt, heading, label;
 *   - literais de string dentro de interpolação e de binding, que é onde a
 *     frase se esconde quando o template escolhe o texto em vez da chave.
 *
 * Uma extração vira violação quando sobra alguma palavra que não está em
 * `ALLOWED` — a lista de coisas que legitimamente não se traduzem (nome de
 * formato, de fonte, de unidade, a marca). Manter a lista curta é de propósito:
 * ela é a única saída, então cada entrada nova é uma decisão consciente.
 *
 * ── 2. Campo de formulário sem nome acessível ─────────────────────────────
 *
 * Um `<input>` sem `aria-label`, sem `id` casado com um `for=`, e que não está
 * DENTRO de um `<label>`, é anunciado pelo leitor de tela como "caixa de edição"
 * e mais nada. O padrão que produzia isso aqui era um `<label>` IRMÃO, sem
 * `for=`: na tela parece rotulado, na árvore de acessibilidade não é. Eram 53
 * campos — entre eles a senha do Wi-Fi e a chave Pix do gerador de QR —, num
 * produto que paga AAA de contraste e tem skip link.
 *
 * ── Limite conhecido ──────────────────────────────────────────────────────
 *
 * As três páginas de conteúdo estático (`about`, `privacy-policy`, `terms`)
 * estão em EXCEPT. Elas não têm frases soltas, têm documentos inteiros escritos
 * só em português, com o título e o link de voltar trocando de idioma por cima —
 * traduzir é escrever texto legal nas duas línguas, não mover string para
 * dicionário. Enquanto estiverem aqui, `/en/sobre`, `/en/privacidade` e
 * `/en/termos` servem português.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', 'src', 'app');

/**
 * Vazio, e a intenção é que continue. As três páginas estáticas moraram aqui
 * enquanto eram `@if pt { … } @else { … }` com a marcação duplicada; passaram a
 * ler o dicionário como todo o resto e saíram. Pôr um arquivo de volta aqui é
 * decidir que a interface dele pode ficar num idioma só.
 */
const EXCEPT = new Set([]);

/**
 * Palavras que aparecem cruas num template e continuam certas nas duas línguas:
 * formatos, fontes, unidades, siglas e a marca. Comparação em minúsculas.
 */
const ALLOWED = new Set([
  // marca e tecnologia
  'nada', 'sai', 'nadasai', 'tesseract', 'js', 'pdf', 'ocr', 'ia', 'ai', 'qr', 'exif', 'xmp',
  // formatos
  'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg', 'ico', 'bmp', 'tiff', 'heic',
  'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'webm', 'mp4', 'mov', 'mkv', 'avi',
  'docx', 'txt', 'zip', 'enc', 'csv', 'json', 'xml',
  // fontes padrão do PDF
  'arial', 'helvetica', 'times', 'roman', 'courier', 'symbol', 'zapfdingbats',
  // unidades e siglas
  'kb', 'mb', 'gb', 'kbps', 'hz', 'khz', 'dpi', 'px', 'pt', 'en', 'lufs', 'lu', 'dbfs', 'db', 'bits', 'ms',
  'ch', 'fps', 'rgb', 'cmyk', 'hex', 'sha', 'md', 'aes', 'gcm', 'pbkdf', 'ed', 'wi', 'fi',
  'pix', 'vcard', 'whatsapp', 'url', 'ssid', 'id', 'x', 'y',
]);

const VISIBLE_ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'heading', 'label'];

/** Ficheiros de template: todo .html, mais o `template:` inline dos .ts. */
function templates(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      templates(p, acc);
      continue;
    }
    const rel = path.relative(ROOT, p).split(path.sep).join('/');
    if (EXCEPT.has(rel)) continue;

    if (e.name.endsWith('.html')) {
      acc.push({ rel, body: fs.readFileSync(p, 'utf8'), offset: 0 });
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
      const src = fs.readFileSync(p, 'utf8');
      const i = src.indexOf('  template: `');
      if (i === -1) continue;
      const j = src.indexOf('`,\n', i);
      const k = src.indexOf('`,\r\n', i);
      const end = j === -1 ? k : k === -1 ? j : Math.min(j, k);
      if (end === -1) continue;
      const open = src.indexOf('`', i) + 1; // depois da crase, ou `template:` vira texto
      acc.push({
        rel,
        body: src.slice(open, end),
        offset: src.slice(0, open).split('\n').length - 1,
      });
    }
  }
  return acc;
}

/** Sobra alguma palavra que não é sigla/formato/fonte? */
function offendingWords(text) {
  const words = text.match(/[A-Za-zÀ-ÿ]{2,}/g) || [];
  return words.filter((w) => !ALLOWED.has(w.toLowerCase()));
}

/**
 * Percorre o template como máquina de estados sobre o corpo INTEIRO, não linha
 * a linha, e dentro de uma tag pula o conteúdo entre aspas. As duas coisas são
 * necessárias e a segunda não é detalhe: `[disabled]="i >= total"` tem um `>`
 * no meio do valor, e um scanner que o tratasse como fim de tag passaria a ler
 * o resto dos atributos como se fosse texto da página. Metade dos templates
 * daqui quebra atributo em várias linhas, então o efeito seria centenas de
 * falsos positivos — e um verificador ruidoso é um verificador que se apaga.
 */
function textNodes(body) {
  const out = [];
  let i = 0;
  let line = 1;
  let buf = '';
  let bufLine = 1;

  const flush = () => {
    if (buf.trim()) out.push({ line: bufLine, text: buf });
    buf = '';
  };

  while (i < body.length) {
    const c = body[i];

    if (c === '<') {
      flush();
      i++;
      // dentro da tag: consome até o '>' que estiver FORA de aspas
      let quote = null;
      while (i < body.length) {
        const d = body[i];
        if (d === '\n') line++;
        if (quote) {
          if (d === quote) quote = null;
        } else if (d === '"' || d === "'") {
          quote = d;
        } else if (d === '>') {
          i++;
          break;
        }
        i++;
      }
      bufLine = line;
      continue;
    }

    if (c === '{' && body[i + 1] === '{') {
      flush();
      const close = body.indexOf('}}', i);
      const chunk = body.slice(i, close === -1 ? body.length : close + 2);
      line += (chunk.match(/\n/g) || []).length;
      i = close === -1 ? body.length : close + 2;
      bufLine = line;
      continue;
    }

    if (c === '\n') {
      flush();
      line++;
      bufLine = line;
      i++;
      continue;
    }

    buf += c;
    i++;
  }
  flush();
  return out;
}

/**
 * Tira a sintaxe de bloco do Angular — `@if (…) {`, `} @else {`, `}` — e SÓ
 * dela. O parêntese é casado equilibrando, porque a condição quase sempre tem
 * chamada dentro (`@if (errorKey(); as key)`) e um `[^)]*` pararia no primeiro
 * fecha-parêntese, deixando `; as key)` para trás como se fosse texto da tela.
 *
 * A poda só vale para o trecho que COMEÇA com `@` ou `}`: em qualquer outro,
 * parêntese é conteúdo — "192 kbps (Padrão)" e "arquivo(s)" são exatamente o
 * tipo de string que este script existe para achar, e não podem ser podadas.
 */
function stripBlockSyntax(raw) {
  let s = raw.trim();
  if (!/^[@}]/.test(s)) return raw;

  for (;;) {
    const before = s;
    // `} @else if (…) {` — o `if` vem SEM arroba depois de `@else`, e sem esta
    // linha ele sobra como palavra e faz cada @else do repositório virar achado.
    s = s.replace(/^\}\s*/, '').replace(/^@[a-z]+\s*/i, '').replace(/^if\s*(?=\()/, '');
    if (s.startsWith('(')) {
      let depth = 0;
      let i = 0;
      for (; i < s.length; i++) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')' && --depth === 0) { i++; break; }
      }
      s = s.slice(i).trim();
    }
    s = s.replace(/^\{\s*/, '');
    if (s === before) break;
  }
  return s;
}

function scan({ rel, body, offset }) {
  const hits = [];
  const clean = body.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));

  // 1) atributos visíveis com valor literal (sem [] e sem interpolação)
  clean.split('\n').forEach((lineText, i) => {
    for (const attr of VISIBLE_ATTRS) {
      const re = new RegExp(`(?<![\\[\\w-])${attr}="([^"{}]*)"`, 'g');
      for (const m of lineText.matchAll(re)) {
        const bad = offendingWords(m[1]);
        if (bad.length) hits.push({ lineNo: offset + i + 1, what: `${attr}="${m[1]}"`, bad });
      }
    }
  });

  // 2) literais de string dentro de interpolação e de binding. É por aqui que a
  //    frase escapa quando o template escolhe o texto no lugar de escolher a
  //    chave — `{{ n === 1 ? '1 imagem' : n + ' imagens' }}` é interface tanto
  //    quanto um nó de texto, e não passa nem perto do dicionário. Bindings de
  //    class/style ficam de fora: ali literal é nome de classe, não frase.
  for (const m of clean.matchAll(/\{\{([\s\S]*?)\}\}|(?<!\[(?:ng)?(?:class|style)[^\]]*\])\[[\w.$-]+\]="([^"]*)"/g)) {
    const expr = m[1] ?? m[2] ?? '';
    if (/\[(ng)?(class|style)/.test(m[0])) continue;
    const lineNo = offset + clean.slice(0, m.index).split('\n').length;
    for (const lit of expr.matchAll(/'([^']*)'/g)) {
      const v = lit[1];
      if (!/[A-Za-zÀ-ÿ]/.test(v)) continue;
      if (/^[a-z_]+(\.[a-z_0-9]+)+$/.test(v)) continue; // chave do dicionário
      // valor de enum, extensão, ou lista de MIME do [accept] de um dropzone
      if (/^[\w.\-+/*]+(,[\w.\-+/*]+)*$/.test(v)) continue;
      hits.push({ lineNo, what: `'${v}'`, bad: offendingWords(v) });
    }
  }

  // 3) nós de texto
  for (const node of textNodes(clean)) {
    const text = stripBlockSyntax(node.text)
      .replace(/&[a-z]+;|&#\d+;/g, ' ')
      .trim();

    if (!text) continue;
    const bad = offendingWords(text);
    if (bad.length) hits.push({ lineNo: offset + node.line, what: text.slice(0, 90), bad });
  }

  return hits.sort((a, b) => a.lineNo - b.lineNo).map((h) => ({ rel, ...h }));
}

/**
 * Campo sem nome acessível. Um campo é considerado rotulado quando traz
 * `aria-label`/`aria-labelledby`, quando tem `id` (que é o único jeito de um
 * `<label for>` alcançá-lo) ou quando está DENTRO de um `<label>`. Tipos que não
 * carregam rótulo próprio ficam de fora: `file` e `checkbox`/`radio` são
 * rotulados pelo controle em volta, e `hidden` não é interface.
 */
function scanLabels({ rel, body, offset }) {
  const hits = [];
  const clean = body.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));

  for (const m of clean.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
    const tag = m[0];
    if (/aria-label|aria-labelledby|\bid=/.test(tag)) continue;
    if (/type="(file|hidden|checkbox|radio|submit|button)"/.test(tag)) continue;

    const before = clean.slice(0, m.index);
    if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) continue;

    hits.push({
      rel,
      lineNo: offset + before.split('\n').length,
      what: tag.replace(/\s+/g, ' ').slice(0, 70),
    });
  }
  return hits;
}

function report(hits, title, advice) {
  if (!hits.length) return false;
  console.error(`\n✗ ${hits.length} ${title}:\n`);
  let last = '';
  for (const h of hits) {
    if (h.rel !== last) {
      console.error(`  ${h.rel}`);
      last = h.rel;
    }
    console.error(`    ${String(h.lineNo).padStart(5)}: ${h.what}`);
  }
  console.error(`\n${advice}\n`);
  return true;
}

const files = templates(ROOT);

const failed = [
  report(
    files.flatMap(scan),
    'trecho(s) de interface fora do dicionário',
    `  Mova cada um para os DOIS dicionários de translation.service.ts e leia\n` +
      `  com i18n.t()['chave']. Se o texto legitimamente não se traduz (nome de\n` +
      `  formato, de fonte, unidade), acrescente a palavra a ALLOWED neste script.`,
  ),
  report(
    files.flatMap(scanLabels),
    'campo(s) de formulário sem nome acessível',
    `  Acrescente [attr.aria-label]="i18n.t()['chave']" — de preferência a MESMA\n` +
      `  chave do <label> visível ao lado, para o texto ter uma fonte só. Um\n` +
      `  <label> irmão sem for= não rotula nada: na tela parece rotulado, para o\n` +
      `  leitor de tela o campo não tem nome.`,
  ),
].some(Boolean);

if (failed) process.exit(1);

console.log('✓ templates: nenhum texto fora do dicionário, nenhum campo sem rótulo');
