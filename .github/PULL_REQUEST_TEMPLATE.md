## O que muda, e por quê

<!--
A convenção da casa: dizer o PORQUÊ, nomeando o defeito que a mudança impede.
Comentário e mensagem de commit que só repetem o que a linha faz são piores que
nenhum. Se a mudança tem uma razão não óbvia, ela pertence aqui e no código.
-->

## Como conferir

<!-- O caminho pela tela, ou o comando. Se há teste novo, diga qual. -->

## Portão

Não há linter neste projeto. O que reprova é isto — marque o que rodou:

- [ ] `npx tsc --noEmit` passa
- [ ] `npm test -- --watch=false --browsers=ChromeHeadless` passa
- [ ] `npm run check:templates` passa
- [ ] `npm run e2e` passa (se mexeu em ferramenta)

## Confere

- [ ] Nenhum texto de interface cravado no template — tudo saiu do dicionário, **PT e EN**
- [ ] Nenhuma cor em hexadecimal no componente — token semântico em `styles.css`
- [ ] Nenhuma dependência nova (ou já conversamos numa issue antes)
- [ ] Nada que precise de servidor, e nada que busque asset de CDN
- [ ] Se registrei ferramenta nova, percorri os sete lugares do `CLAUDE.md`

## CLA

- [ ] Li o [CLA](../blob/main/CLA.md) e vou assiná-lo no comentário, como o bot pedir

<!--
Primeiro PR? O bot comenta com o link. A frase é comparada LITERALMENTE:
"I have read the CLA Document and I hereby sign the CLA" — sem ponto final,
sem tradução. Assina uma vez e vale para os PRs seguintes.
-->
