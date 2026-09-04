# Política de segurança

> **English:** reports in English are welcome. Use the **Security** tab →
> *Report a vulnerability*. Private vulnerability reporting is enabled on this
> repository; please do not open a public issue for a security finding.

## Como relatar

Use a aba **Security** deste repositório → **Report a vulnerability**. O canal é
privado: só você e o mantenedor enxergam o relato até existir correção.

**Não abra issue pública para falha de segurança.** Numa ferramenta de
privacidade, o intervalo entre a publicação e a correção é exatamente a janela
em que o problema vira exploração.

Não há e-mail de contato publicado, e isso é de propósito: um endereço numa
página pública vira alvo de varredura, e o relato privado do GitHub já entrega
canal autenticado, histórico e um CVE ao final, sem que ninguém precise confiar
numa caixa de entrada.

## O que mais importa

A tese do produto é que **nenhum arquivo sai do dispositivo**. Qualquer coisa que
fure isso é a falha mais grave possível aqui, acima de qualquer outra:

- Um caminho que faça um arquivo do usuário sair pela rede — driblando o
  `connect-src 'self' data: blob:` de `public/_headers`, ou passando sem ser
  contado pelo `NetworkProbeService`.
- Algo que persista conteúdo do usuário além da sessão, onde a interface afirma
  que não persiste.

Depois disso, por ordem de gravidade, as áreas onde um defeito é irreversível
para quem usa:

| Área | Por que importa |
|---|---|
| `core/crypto/envelope.ts` | AES-256-GCM + PBKDF2. Um erro aqui não gera relato de bug, gera alguém com arquivo permanentemente ilegível. |
| `core/image/redact.ts` e `redact-pdf` | A tarja preta é uma **garantia**. Se um caminho deixar o conteúdo censurado recuperável, o documento vazou. |
| `core/exif/` | O stripper. Um metadado que sobrevive ao strip é o dado que a pessoa achou que tinha apagado. |
| `clean-pdf-metadata` | Mesma lógica, com o agravante de que object streams escondem sobreviventes de uma inspeção superficial. |

## Limitações já conhecidas, e deliberadas

Estas são decisões documentadas, não descobertas. Relatar uma delas é bem-vindo
se você tiver um ataque concreto, mas o estado atual é intencional:

- **PBKDF2 com 100.000 iterações**, e não as 600.000 que a OWASP recomenda hoje.
  A contagem **não é gravada no envelope**, então aumentá-la tornaria todo `.enc`
  já existente indecifrável. Subir exige um cabeçalho V3 que carregue o número,
  com o leitor V2 intacto — mudança deliberada e separada.
- **Senha errada e arquivo corrompido são indistinguíveis.** O tag do AES-GCM é
  um bit de informação, e o `SubtleCrypto` lança o mesmo `OperationError` para os
  dois casos. A distinção que existe é anterior ao decrypt (o cabeçalho parseia?),
  e é a única real.
- **Pixelização e desfoque não são garantia**, e a interface diz isso. Os dois
  têm ataques de recuperação publicados contra conteúdo de baixa entropia. Só a
  tarja preta é irreversível, e é o padrão.
- **O pico do normalizador é sample peak, não true peak.** O teto de -1 dBFS
  cobre os picos intersample no lugar do sobreamostramento em 4x.

## Fora de escopo

- Ataques que exigem acesso físico ao dispositivo já desbloqueado.
- Vulnerabilidade em dependência sem caminho de exploração demonstrado neste
  produto — abra issue normal, com o aviso do `npm audit`.
- Ausência de cabeçalho de segurança em host de terceiro que sirva um fork. O
  `public/_headers` deste repositório é a configuração de referência.
- Engenharia social, spam e DoS contra a própria aba do navegador de quem usa.

## Prazo

Este é um projeto mantido por uma pessoa, e prometer SLA de empresa seria
mentira. O compromisso realista: **confirmação de recebimento em até 7 dias** e
uma avaliação inicial em até 30. Falha na classe "arquivo sai do dispositivo"
tem prioridade sobre qualquer outra coisa em aberto.

Se preferir divulgação coordenada, diga no relato qual prazo você pretende
observar, e eu trabalho dentro dele.
