# Publicar o Nada Sai na Google Play

Tudo o que a loja pede, e o que este repositório já resolve sozinho.
Os arquivos citados aqui existem; o que falta é a **chave de upload**, que é a
única coisa que não pode morar no git.

---

## 0. O que já está pronto

| item | onde | como se refaz |
|---|---|---|
| Ícone do app (adaptativo + legado, 5 densidades) | `android/app/src/main/res/mipmap-*/` | `npm run android:assets` |
| Tela de abertura (11 tamanhos + tema do Android 12+) | `android/app/src/main/res/drawable*/`, `values-v31/` | idem |
| Ícone 512×512 do Play | `store/play/icon-512.png` | idem |
| Gráfico de destaque 1024×500, PT e EN | `store/play/feature-graphic-{pt,en}.png` | idem |
| 8 capturas por idioma, 1080×1920 | `store/play/screenshots/{pt,en}/` | `npm run android:shots` (com `ng serve` no ar) |
| Título, descrição curta e longa, PT e EN | `store/listing/{pt-BR,en-US}.txt` | escrito à mão |
| Conferência de limites e dimensões | — | `npm run store:check` |
| Conferência do manifesto MESCLADO | — | `npm run android:manifest` (depois do build) |

Os dois geradores saem de `public/logo_nadasai.svg` e dos tokens de
`src/styles.css`, que são as mesmas fontes dos cards sociais (`npm run og`).
Trocar a marca é trocar aquele SVG e rodar os dois comandos.

**Antes de qualquer envio:**

```bash
npm run store:check
```

Ele reprova título de 31 caracteres, descrição curta de 81, ícone fora de
512×512 e gráfico fora de 1024×500 — os quatro erros que o Play só aponta
depois de você ter colado tudo, em dois idiomas.

---

## 1. A chave de upload (uma vez, e para sempre)

O AAB precisa ser assinado. A chave criada aqui é a **chave de upload**: o Google
guarda a chave de assinatura de verdade (Play App Signing) e re-assina o pacote
antes de distribuir. Ainda assim, **perder este arquivo significa não conseguir
publicar atualização** do app que já está na loja até pedir uma redefinição ao
Google — processo manual, de dias.

Ela não está no repositório, e não pode estar: o `.gitignore` cobre `*.jks` e
`keystore.properties`.

### Passo 1 — criar a chave

**Precisa ser um terminal DE VERDADE.** O `keytool` lê a senha do console, e o
prefixo `!` do Claude Code não é um TTY interativo: ele entrega entrada vazia,
o keytool responde três vezes "a senha é muito curta" e aborta com "Excesso de
falhas". Abra o **Git Bash** (menu Iniciar, ou botão direito numa pasta → "Git
Bash Here") e cole:

```bash
"/c/Program Files/Android/openjdk/jdk-21.0.8/bin/keytool" -genkeypair -v \
  -keystore ~/nadasai-upload.jks -alias nadasai \
  -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12 \
  -dname "CN=Nada Sai, O=Nada Sai, L=Sua Cidade, ST=UF, C=BR"
```

Ou, no PowerShell:

```powershell
& "C:\Program Files\Android\openjdk\jdk-21.0.8\bin\keytool.exe" -genkeypair -v `
  -keystore "$env:USERPROFILE\nadasai-upload.jks" -alias nadasai `
  -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12 `
  -dname "CN=Nada Sai, O=Nada Sai, L=Sua Cidade, ST=UF, C=BR"
```

O caminho vai entre aspas porque "Program Files" tem espaço, e o binário é
chamado pelo caminho inteiro porque **o JDK não está no PATH desta máquina** —
`keytool` puro responde `command not found`.

Com `-dname` ele **só pergunta a senha**, duas vezes:

```
Informe a senha da área de armazenamento de chaves:
Informe novamente a nova senha:
```

Invente uma senha forte, **no mínimo 6 caracteres**, e ANOTE — é ela que vai no
`keystore.properties` do Passo 3. Nada é ecoado enquanto você digita; é normal.

Sobre o `-dname`: esses campos de identidade **não aparecem em lugar nenhum**
para quem instala o app — quem assina a versão distribuída é o Google, pelo Play
App Signing. Eles só precisam existir, então troque cidade e UF pelos seus e
siga em frente. Sem `-dname` o keytool pergunta os sete campos um a um e pede
uma confirmação `yes` no fim; o resultado é o mesmo.

Com `-storetype PKCS12` (o formato moderno, e o padrão) **a senha da chave é a
mesma do keystore**; ele nem pergunta duas senhas diferentes.

`-validity 10000` são ~27 anos. O Play exige que a chave valha até pelo menos
2033, então não diminua esse número.

### Passo 2 — guardar

O arquivo saiu em `C:\Users\ferreira.ti\nadasai-upload.jks`.

- copie a senha para um gerenciador de senhas;
- copie o `.jks` para **fora desta máquina** (nuvem privada, pendrive, o que for).

Este é o passo que as pessoas pulam e do qual se arrependem anos depois. HD que
morre com a chave dentro = app órfão na loja.

### Passo 3 — apontar o build para ela

Crie `android/keystore.properties` (o `.gitignore` já o exclui):

```properties
storeFile=C:/Users/ferreira.ti/nadasai-upload.jks
storePassword=A_SENHA_QUE_VOCE_ANOTOU
keyAlias=nadasai
keyPassword=A_MESMA_SENHA
```

**Barras normais, sempre.** Num `.properties` do Java a contrabarra é escape, e
`C:\Users\...` vira `C:Users...` na leitura — o caminho se destrói em silêncio.
É a mesma armadilha do `local.properties`.

### Passo 4 — conferir

```bash
cd android
JAVA_HOME="/c/Program Files/Android/openjdk/jdk-21.0.8" \
ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" \
./gradlew bundleRelease --no-daemon
```

E então, na raiz:

```bash
"/c/Program Files/Android/openjdk/jdk-21.0.8/bin/jarsigner" -verify -verbose:summary \
  android/app/build/outputs/bundle/release/app-release.aab | tail -3
```

`jar verified` = assinado. Se disser `jar is unsigned`, o Gradle não achou o
`keystore.properties` — confira o nome e o lugar do arquivo (`android/`, não a
raiz do repositório).

Sem esse arquivo o `bundleRelease` **continua rodando** e sai não assinado, em
vez de quebrar o build: é a degradação certa numa máquina de CI ou na de quem só
quer compilar e olhar, e é por isso que o `signingConfigs` de `app/build.gradle`
está dentro de um `if`.

---

## 2. Gerar o AAB

O ciclo completo, a partir da raiz do repositório:

```bash
npx ng build --configuration android
npx cap copy android

cd android
JAVA_HOME="/c/Program Files/Android/openjdk/jdk-21.0.8" \
ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" \
./gradlew bundleRelease --no-daemon
```

Saída: `android/app/build/outputs/bundle/release/app-release.aab`.

**Depois de todo build, antes de todo envio:**

```bash
npm run android:manifest
```

Ele lê o manifesto **mesclado** — o que de fato vai dentro do pacote — e reprova
`INTERNET`, `ACCESS_NETWORK_STATE` e o provider de telemetria do ONNX Runtime,
além de exigir que `RECORD_AUDIO` continue lá.

Isto não é zelo: **o app já foi empacotado com permissão de rede sem que nada
avisasse.** O `AndroidManifest.xml` do repositório é só uma das entradas de um
merge, e o AAR `onnxruntime-android` declara as duas permissões mais um
ContentProvider `ai.onnxruntime.TelemetryInitializer`, que o sistema instancia
no lançamento do app e cujo `onCreate` monta um cliente HTTP de telemetria.
Nada disso aparecia ao abrir o arquivo do repositório — aparecia no pacote e na
lista de permissões da ficha da loja. Os três estão removidos com
`tools:node="remove"`, e essa é exatamente a linha que some num upgrade de
dependência sem quebrar nada.

Conferido no aparelho: o `dumpsys package com.nada.sai` lista apenas
`RECORD_AUDIO` e `MODIFY_AUDIO_SETTINGS`, e o ORT segue funcionando — ele
mesmo registra `Android telemetry is unavailable because the 1DS Java HttpClient
was not initialized` e continua, com a sessão nativa subindo em 4 threads.

**Pular o `cap copy` deixa o pacote com os assets antigos e nada avisa** — é o
erro mais caro deste ciclo, porque o AAB compila, instala e roda mostrando a
versão anterior do produto.

**AAB, não APK.** O `libonnxruntime.so` entra sem compressão e pesa 32 MB só em
arm64; como APK único, com as três ABIs, são ~153 MB. No AAB o Play entrega uma
ABI por aparelho e o download real fica perto de um terço disso. `abiFilters` em
`app/build.gradle` já corta `x86`, que não serve a telefone nenhum.

Para conferir o pacote antes de enviar (opcional, precisa do
[bundletool](https://github.com/google/bundletool)):

```bash
java -jar bundletool.jar build-apks --bundle=app-release.aab --output=t.apks \
  --ks=~/nadasai-upload.jks --ks-key-alias=nadasai --mode=universal
```

### Versão

`versionCode` e `versionName` estão em `android/app/build.gradle`. **O
`versionCode` sobe a cada AAB enviado**, inclusive para um teste interno que
nunca chegou à produção: o Play recusa um número que já existe e nunca aceita um
menor.

---

## 3. Preencher a ficha no Play Console

### Listagem principal

Cole de `store/listing/pt-BR.txt` (idioma padrão) e `store/listing/en-US.txt`.
Suba os gráficos de `store/play/`:

- **Ícone do app** — `icon-512.png`
- **Gráfico de destaque** — `feature-graphic-pt.png` (e o `-en` na ficha em
  inglês)
- **Capturas de celular** — as 8 de `screenshots/pt/` (e `screenshots/en/`)

Capturas de tablet de 7" e 10" **não são obrigatórias**. Sem elas o app fica
fora da vitrine de tablets, o que é coerente: as capturas atuais são da
interface de celular, que é a que este produto foi desenhado para o toque.

### Segurança dos dados (Data safety)

Este é o formulário em que o produto se explica sozinho:

- **Coleta de dados:** *Não* — nenhum tipo.
- **Compartilhamento:** *Não*.
- **Dados criptografados em trânsito:** não se aplica (não há trânsito).
- **Exclusão de dados:** não se aplica (nada é enviado nem guardado fora do
  aparelho).

O respaldo é verificável e está no `AndroidManifest.xml`: **o app não declara
`android.permission.INTERNET`**. Sem essa permissão o sistema operacional recusa
qualquer socket, então não há caminho por onde um dado sair — nem por engano,
nem por dependência com telemetria.

- **Política de privacidade:** `https://nadasai.com/pt/privacidade`

### Classificação de conteúdo

Questionário padrão de app utilitário. Sem violência, sem conteúdo sexual, sem
apostas, sem conteúdo gerado por usuário compartilhado (o app não tem rede).
Resultado esperado: **Livre para todos / Everyone**.

### Público-alvo e conteúdo

- Faixa etária: 18+ ou "todas as idades" — é um utilitário; não é direcionado a
  crianças, então **não** marque a política de Famílias.
- **Anúncios:** não.
- **Compras no app:** não.
- **Acesso ao app:** todas as funções estão disponíveis sem login. Não há
  credencial para fornecer ao revisor.

### Categoria

Ferramentas / Tools.

---

## 4. O caminho até a produção

Se a conta de desenvolvedor for **pessoal** e tiver sido criada depois de
novembro de 2023, o Google exige um **teste fechado com no mínimo 12
testadores por 14 dias seguidos** antes de liberar o acesso à produção. Conta de
organização não passa por isso.

Ordem prática:

1. **Teste interno** — até 100 e-mails, sem espera. É onde se confere o app
   instalado de verdade.
2. **Teste fechado** — os 12 × 14 dias, se aplicável.
3. **Produção**.

O **relatório de pré-lançamento** roda o app em aparelhos reais do Google e é a
melhor checagem gratuita que existe deste pacote. Vale ler antes de promover
para produção.

---

## 5. O que conferir no aparelho antes de enviar

O que só aparece no APK instalado, e não no `ng serve`:

- **A lista de permissões** (Configurações → Apps → Nada Sai, ou
  `adb shell dumpsys package com.nada.sai | grep -A5 "requested permissions"`):
  só microfone. **Se `INTERNET` aparecer aí, não envie o pacote** — veja a seção 2.
- **Ícone e nome na gaveta** — a marca certa, e não o "X" do Capacitor.
- **A tela de abertura** — branca com a marca, sem piscar escuro (Android 12+
  usa `values-v31/styles.xml`, os anteriores usam `drawable*/splash.png`).
- **Remover fundo** — tem de cair no caminho NATIVO. No aparelho são ~8 s contra
  ~18 s no site; se demorar como no site, `tryNativeMatte` devolveu `null` e o
  WASM assumiu.
- **Recortar / cortar vídeo** — passam pelo codificador de hardware.
- **Gravador de tela** — o WebView **não** implementa `getDisplayMedia`, então a
  ferramenta mostra o aviso de "não suportado". É o comportamento correto e
  esperado, não uma regressão.
- **Gravador de voz** — veja a nota abaixo.

### Nota: microfone

O manifesto declara `RECORD_AUDIO` e `MODIFY_AUDIO_SETTINGS` — as únicas
permissões do app —, e é o `voice-recorder` que as exige. A alternativa não era
"uma permissão a menos": dentro do WebView o `getUserMedia` **existe** mesmo sem
permissão, então a checagem de suporte do componente passa, o aviso de "não
suportado" não aparece, e a chamada é recusada três camadas abaixo. A ferramenta
ficaria na lista sem nunca gravar.

São duas declarações porque quem pede a permissão em tempo de execução é o
Capacitor, e o `onPermissionRequest` dele monta a lista com as duas.

No aparelho, confira: abrir o gravador de voz deve mostrar o diálogo do sistema
pedindo o microfone, e gravar depois de concedido. **A ausência de `INTERNET`
continua intacta** — é ela que sustenta o formulário de Segurança dos dados.

---

## 6. Depois de publicar

- O `versionCode` do próximo envio já nasce maior.
- Se a marca mudar, rode os dois geradores e reenvie os gráficos — o Play
  atualiza a ficha sem precisar de um AAB novo.
- `npm run store:check` é a única coisa que precisa passar antes de cada
  atualização de ficha.
