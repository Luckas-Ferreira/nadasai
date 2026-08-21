// Escreve public/llms.txt a partir de TOOLS, como o sitemap já é escrito.
//
// O arquivo era mantido à mão e envelheceu exatamente como o mapa de hreflang
// que `core/seo/route-map.ts` substituiu: dizia "Thirty-one tools" quando havia
// 32, e a seção de áudio listava quatro ferramentas sem `video-to-audio`. É o
// mesmo modo de falha de sempre — uma lista paralela à fonte de verdade, com um
// passo manual entre as duas que ninguém lembra de executar, e nada que falhe
// quando ele é esquecido.
//
// O que NÃO é derivado é a descrição de cada ferramenta em inglês técnico: ela
// vem de `core/seo/tool-content.ts`, que é onde a cópia longa por ferramenta já
// mora e onde `jsonld.spec.ts` obriga a existir uma entrada por tool.
//
// Roda no `prebuild`, junto do sitemap. Determinístico: mesma entrada, mesmos
// bytes, então nunca aparece como ruído num diff.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://nadasai.com';

/** Mesma técnica de `generate-sitemap.mjs`: os módulos lidos aqui usam os
 *  imports só para tipos, então o transpile os descarta em vez de resolvê-los. */
async function loadTsModule(relativePath) {
  const source = readFileSync(join(ROOT, relativePath), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const withoutImports = outputText.replace(/^\s*import[^;]*;$/gm, '');
  return import(`data:text/javascript;base64,${Buffer.from(withoutImports, 'utf8').toString('base64')}`);
}

const { TOOLS, MODULES } = await loadTsModule('src/app/core/tools/tools.ts');
const { FORMAT_PAIRS } = await loadTsModule('src/app/core/seo/format-pairs.ts');
const { TOOL_CONTENT } = await loadTsModule('src/app/core/seo/tool-content.ts');

/** O dicionário não passa pelo transpile — importa Angular. Os nomes de exibição
 *  saem por recorte do literal, como em `generate-og-cards.mjs`. */
/**
 * Lê o literal do dicionário direto do fonte, sem compilar o módulo.
 *
 * Os dois moravam dentro de `translation.service.ts`; foram para
 * `core/i18n/{en,pt}.ts` quando viraram chunks carregados por `import()`, e
 * este gerador derrubou o build inteiro no `prebuild` porque procurava
 * "const EN" num arquivo onde ele não estava mais. A outra diferença é o
 * `export` na frente da declaração — daí a busca aceitar os dois.
 */
function objectLiteral(source, name) {
  const start = source.search(new RegExp(`(export )?const ${name}\\b`));
  if (start < 0) throw new Error(`[llms] não achei "const ${name}".`);
  const open = source.indexOf('{', start);
  const end = source.indexOf('\n}', open);
  return (0, eval)(`(${source.slice(open, end + 2)})`);
}

const EN = objectLiteral(readFileSync(join(ROOT, 'src/app/core/i18n/en.ts'), 'utf8'), 'EN');
const PT = objectLiteral(readFileSync(join(ROOT, 'src/app/core/i18n/pt.ts'), 'utf8'), 'PT');

const MODULE_HEADING = {
  image: 'Image Tools',
  pdf: 'PDF Tools',
  audio: 'Audio Tools',
  privacy: 'Privacy & Security Tools',
};

/** A primeira resposta do FAQ é a descrição mais densa que existe por ferramenta.
 *  Uma frase dela descreve melhor que o subtítulo de UI, que é curto por design. */
function describe(tool) {
  const entry = TOOL_CONTENT[tool.id];
  const fromFaq = entry?.en?.faq?.[0]?.a;
  if (fromFaq) {
    const firstSentence = fromFaq.split(/(?<=[.!?])\s/)[0];
    if (firstSentence && firstSentence.length > 40) return firstSentence;
  }
  return EN[tool.descKey] ?? '';
}

const lines = [];
lines.push('# Nada Sai');
lines.push('');
lines.push(
  '> Nada Sai is a free, 100% client-side, browser-based web application for editing images, PDF ' +
    'documents and audio files, and for privacy and security tasks such as encryption, hashing and ' +
    'redaction. All processing runs locally in the user’s browser using WebAssembly, WebAudio, ' +
    'WebCrypto and Web Workers — zero files or user data are ever uploaded to any server.',
);
lines.push('');
lines.push('## Overview');
lines.push('');
lines.push(
  `Nada Sai provides ${TOOLS.length} tools across ${MODULES.length} modules, all of which run entirely ` +
    'offline in the browser. Every tool exists at a Portuguese and an English URL; the pairs are listed ' +
    'in sitemap.xml.',
);
lines.push('');

for (const mod of MODULES) {
  const tools = TOOLS.filter((t) => t.category === mod.id);
  if (tools.length === 0) continue;

  lines.push(`## ${MODULE_HEADING[mod.id] ?? mod.id}`);
  lines.push('');
  for (const tool of tools) {
    const pt = PT[tool.navKey] ?? tool.id;
    const en = EN[tool.navKey] ?? tool.id;
    lines.push(`- [${pt} / ${en}](${ORIGIN}/pt/${tool.pathPt}): ${describe(tool)}`);
  }
  lines.push('');
}

// Os pares de formato numa seção própria, e não misturados às ferramentas:
// eles NÃO são ferramentas, são a mesma ferramenta apontada para um destino.
// Um modelo que os leia junto com as 39 concluiria que existem 51.
lines.push('## Format Conversions');
lines.push('');
lines.push(
  'These pages open the converter above with the destination format already selected. They exist ' +
    'because the question behind each pair is specific — whether transparency survives, whether the ' +
    'file grows, whether an animation is kept — and each page answers its own.',
);
lines.push('');
for (const p of FORMAT_PAIRS) {
  lines.push(`- [${p.pt.h1} / ${p.en.h1}](${ORIGIN}/pt/${p.pathPt}): ${p.en.description}`);
}
lines.push('');

lines.push('## Privacy Architecture');
lines.push('');
lines.push(
  'The no-upload claim is instrumented rather than asserted: NetworkProbeService wraps fetch, ' +
    'XMLHttpRequest, sendBeacon and WebSocket at runtime and counts file egress specifically (any body ' +
    'carrying a File, Blob, ArrayBuffer, typed array, or FormData containing a File). The count is shown ' +
    'on every page, so a visitor can verify the claim in their own browser rather than taking it on trust.',
);
lines.push('');
lines.push('## Information & Legal');
lines.push('');

const STATIC_LABELS = {
  sobre: ['Sobre / About', "Nada Sai's zero-server architecture and who builds it."],
  privacidade: ['Privacidade / Privacy Policy', 'The 100% local processing privacy policy.'],
  termos: ['Termos de Uso / Terms of Service', 'Terms of service for using Nada Sai tools.'],
  faq: ['FAQ / Perguntas Frequentes', 'Answers about offline processing, formats and limits.'],
};

for (const [path, [label, desc]] of Object.entries(STATIC_LABELS)) {
  lines.push(`- [${label}](${ORIGIN}/pt/${path}): ${desc}`);
}
lines.push('');

writeFileSync(join(ROOT, 'public/llms.txt'), lines.join('\n'), 'utf8');
console.log(`llms.txt written: ${TOOLS.length} tools across ${MODULES.length} modules, plus ${FORMAT_PAIRS.length} format pairs.`);
