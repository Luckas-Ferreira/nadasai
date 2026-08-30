// Lê o manifesto MESCLADO do build Android e reprova o que não pode estar lá.
//
// POR QUE ISTO EXISTE
//
// `android/app/src/main/AndroidManifest.xml` não é o manifesto do app. É uma
// das entradas de um merge: toda dependência com AAR traz o manifesto dela, e o
// Gradle soma tudo sem perguntar. O arquivo que vai dentro do pacote — e o que
// a ficha da Play Store mostra na lista de permissões — é o mesclado, em
// `app/build/intermediates/merged_manifest/`.
//
// A diferença entre os dois já custou a tese do produto uma vez. O
// `com.microsoft.onnxruntime:onnxruntime-android`, que entrou junto com a
// remoção de fundo nativa, declara `INTERNET`, `ACCESS_NETWORK_STATE` e um
// ContentProvider `ai.onnxruntime.TelemetryInitializer` que sobe no lançamento
// do app e monta um cliente HTTP de telemetria. Nada disso aparece no arquivo
// que se lê ao abrir o repositório; o comentário lá dentro dizia, com
// convicção, que o app não pedia rede — e o pacote pedia.
//
// Um `tools:node="remove"` conserta, e é exatamente o tipo de linha que some
// num upgrade de dependência sem que nada quebre: o app continua compilando,
// instalando e funcionando. Só a promessa deixa de ser verdade. Por isso a
// verificação é AUTOMÁTICA e roda depois do build, e não uma frase no runbook.
//
// Rode depois de `gradlew bundleRelease` (ou `assembleDebug`):
//
//   node scripts/check-android-manifest.mjs            # release
//   node scripts/check-android-manifest.mjs debug

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const variant = process.argv[2] ?? 'release';
const DIR = join(ROOT, 'android/app/build/intermediates/merged_manifest', variant);

/** O nome da tarefa entra no caminho (`processReleaseMainManifest`) e já mudou
 *  de forma entre versões do AGP, então o diretório é procurado em vez de
 *  escrito — um caminho fixo que deixa de existir faria esta checagem passar
 *  por não achar nada, que é o pior resultado possível. */
function findManifest(dir) {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (entry === 'AndroidManifest.xml') return path;
    if (statSync(path).isDirectory()) {
      const found = findManifest(path);
      if (found) return found;
    }
  }
  return null;
}

const manifest = findManifest(DIR);
if (!manifest) {
  console.error(`[manifest] nenhum manifesto mesclado em ${DIR}`);
  console.error(`[manifest] rode o build primeiro: cd android && ./gradlew ${variant === 'debug' ? 'assembleDebug' : 'bundleRelease'}`);
  process.exit(1);
}

const xml = readFileSync(manifest, 'utf8');

/** O que não pode existir no pacote, e por quê — a mensagem é metade do valor
 *  desta checagem, porque quem a vê falhar daqui a um ano não vai saber de
 *  onde a permissão veio. */
const FORBIDDEN = [
  {
    find: 'android.permission.INTERNET',
    why: 'A AUSÊNCIA desta permissão É o produto: sem ela o sistema operacional recusa qualquer socket.\n' +
      '      Ela costuma voltar por um AAR (o onnxruntime-android declara a dele). O conserto é um\n' +
      '      <uses-permission ... tools:node="remove" /> no AndroidManifest.xml do app.',
  },
  {
    find: 'android.permission.ACCESS_NETWORK_STATE',
    why: 'Mesma origem da INTERNET, e mesmo conserto. Sozinha ela não abre socket, mas anuncia na\n' +
      '      ficha da loja um app que observa a rede — num produto cujo argumento é não ter rede.',
  },
  {
    find: 'ai.onnxruntime.TelemetryInitializer',
    why: 'ContentProvider do ONNX Runtime: o sistema o instancia no lançamento do app e o onCreate\n' +
      '      dele monta um ai.onnxruntime.telemetry.HttpClient. Remova-o com tools:node="remove".',
  },
];

let failures = 0;
for (const rule of FORBIDDEN) {
  if (xml.includes(rule.find)) {
    console.error(`  ✗ ${rule.find} está no manifesto mesclado.\n      ${rule.why}`);
    failures++;
  } else {
    console.log(`  ✓ ausente: ${rule.find}`);
  }
}

/** O que TEM de estar lá. Uma permissão declarada e depois removida por engano
 *  falha do jeito oposto e igualmente silencioso: o gravador de voz aparece na
 *  lista e nunca grava. */
const REQUIRED = [
  { find: 'android.permission.RECORD_AUDIO', why: 'sem ela o getUserMedia do WebView é recusado e o voice-recorder nunca grava' },
  { find: 'android.permission.MODIFY_AUDIO_SETTINGS', why: 'o BridgeWebChromeClient do Capacitor pede as duas juntas; faltando uma, o launch() volta negado' },
];
for (const rule of REQUIRED) {
  if (xml.includes(rule.find)) console.log(`  ✓ presente: ${rule.find}`);
  else {
    console.error(`  ✗ ${rule.find} NÃO está no manifesto mesclado — ${rule.why}`);
    failures++;
  }
}

console.log(`\n  (lido de ${manifest.replace(ROOT + '\\', '').replace(ROOT + '/', '')})`);

if (failures) {
  console.error(`\n${failures} problema(s) no manifesto mesclado. NÃO envie este pacote.`);
  process.exit(1);
}
console.log('\nManifesto mesclado limpo.');
