# Contribuir

> **English:** contributions and issues in English are welcome. This guide is in
> Portuguese because the codebase's comments are; the product itself ships in
> both languages, and any UI string you add must exist in **both** dictionaries.

Obrigado pelo interesse. Este arquivo é a porta de entrada; o [`CLAUDE.md`](CLAUDE.md)
é a documentação de verdade, e vale ler antes de escrever a primeira linha.

## Antes de tudo: o CLA

Todo pull request passa por um [CLA](CLA.md), conferido automaticamente por um
bot. Você **continua dono do seu código** — a concessão é não exclusiva. O que
ela permite é o projeto ser relicenciado no futuro sem precisar caçar a
autorização de cada pessoa que já contribuiu.

Assinar é um comentário no seu primeiro PR. As instruções estão no fim do
[`CLA.md`](CLA.md), e a frase é comparada **literalmente** — não reescreva nem
traduza.

## Rodar o projeto

```bash
npm ci      # obrigatorio: o postinstall baixa o modelo (42 MB) e o tessdata (~4 MB)
npm start   # http://localhost:4200
```

`public/model/` e `public/tessdata/` não são versionados. Pulando o `npm ci`, a
remoção de fundo e o OCR dão 404 nos próprios pesos — e o sintoma não aponta
para a causa.

## O portão

**Não há linter e não há formatador.** Não invente um passo de lint; siga o
estilo do arquivo ao lado. O que reprova um PR é isto:

```bash
npx tsc --noEmit                                      # strict + strictTemplates
npm test -- --watch=false --browsers=ChromeHeadless   # os testes unitários
npm run check:templates                               # i18n e rótulo acessível
npm run e2e                                           # Playwright, quando mexer em ferramenta
```

O CI roda os três primeiros de qualquer forma, mais o build com prerender — que
é a única checagem que pega código dependente de `window` quebrando no Node.

O `check:templates` merece atenção porque cobre o que o compilador não vê: frase
de interface que nunca virou chave de dicionário (aparece em português no meio do
site em inglês) e campo de formulário sem nome acessível.

## O que ajuda um PR a ser aceito

- **Uma mudança por PR.** Refatoração misturada com correção dobra o tempo de
  revisão e some com a razão de cada linha.
- **Comentário que diz por quê, não o quê.** A convenção da casa é nomear o
  defeito que a linha existe para impedir. Comentário que só repete a linha é
  pior que nenhum.
- **Teste que fixa o comportamento**, e não a forma. Um teste que trava a ordem
  de uma lista reprova todo ajuste dessa lista; um que afirma "os lados são
  pares" aprova um recorte de 2×2 pixels. Os dois já aconteceram aqui.
- **Texto de interface nos dois dicionários**, PT e EN. Chave faltando é erro de
  compilação; frase cravada no HTML não é — é o `check:templates` que pega.

## Coisas que exigem conversa antes

Abra uma issue primeiro, porque são decisões de arquitetura já tomadas e
registradas no `CLAUDE.md`:

- **Qualquer dependência nova**, e principalmente qualquer uma sob GPL/AGPL ou
  que busque asset próprio de CDN. O app roda sob `require-corp`, então uma
  biblioteca que baixa o próprio worker de um CDN não degrada — falha inteira.
- **Qualquer coisa que precise de servidor.** Não há backend, e essa é a tese do
  produto, não uma etapa do roadmap.
- **Ferramenta nova.** Registrar uma toca sete lugares, e pular qualquer um é bug
  silencioso e não erro de compilação. A lista está no `CLAUDE.md`.

## Falha de segurança

Não abra issue. Veja o [`SECURITY.md`](SECURITY.md) — o canal é o relato privado
da aba **Security**.
