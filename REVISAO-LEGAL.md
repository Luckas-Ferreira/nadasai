# Revisão legal pendente — Termos de Uso e Política de Privacidade

> **Estado:** o texto das duas páginas foi traduzido, corrigido de escopo e
> movido para o dicionário em 2026-08-21 (commit `a7bf667`). Nada aqui foi
> revisado por quem responde legalmente pelo produto. Este arquivo existe para
> que essa revisão seja possível: diz o que mudou, por quê, e o que continua
> sendo decisão de alguém — não minha.

As duas páginas vivem em `src/app/core/i18n/{pt,en}.ts`, sob os prefixos
`terms.*` e `privacy.*`. A marcação é única (`features/terms`,
`features/privacy-policy`) e lê o dicionário, então PT e EN não têm como
divergir de novo.

---

## 1. O que mudou, e por quê

### 1.1 Escopo do serviço — correção de fato, não de estilo

A cláusula 2 definia o Nada Sai como **"uma plataforma gratuita de edição de
imagens"**, e as cláusulas 3 e 4 falavam apenas de *imagens*. O produto tem 39
ferramentas em cinco módulos há muitas versões. O efeito prático era que PDF,
áudio, vídeo e o módulo inteiro de privacidade ficavam **fora do escopo do
documento que rege o uso deles** — inclusive as cláusulas de uso proibido.

Onde o termo era a **definição do serviço**, "imagem" virou "arquivo". Onde ele
descreve uma ferramenta específica, ficou como estava.

### 1.2 Datas

As duas diziam "última atualização: julho de 2025". Passaram a **agosto de
2026**, que é quando o texto foi de fato alterado.

### 1.3 Cláusula 7 dos Termos — nova

Processamento local implica duas coisas que o usuário precisa saber **antes**, e
que nenhuma das duas páginas dizia:

- não existe cópia do lado do serviço, então nada pode ser recuperado por nós;
- a senha de um arquivo criptografado **não tem como ser redefinida** —
  `core/crypto/envelope.ts` não guarda nada que permita isso, de propósito.

O texto atual descreve as duas como fato e recomenda que o usuário guarde a
própria cópia e a própria senha. **Não** cria isenção nova de responsabilidade;
a isenção continua sendo a cláusula 6.

### 1.4 Política — seção "E dá para conferir", nova

Descreve o `NetworkProbeService` (o medidor na barra do topo) e a CSP
`connect-src 'self' data: blob:`. É a única seção que faz afirmação **verificável
pelo leitor**, e por isso é a que mais precisa continuar verdadeira: se a CSP ou
o medidor mudarem, este parágrafo tem de mudar junto.

### 1.5 Armazenamento local — ampliado

Passou a mencionar o **Cache Storage** (offline) e o arquivo recebido pelo Web
Share Target, que é apagado na leitura (`core/services/share-target.ts`, coberto
por spec). Antes falava só de `localStorage` e `sessionStorage`.

---

## 2. Decisões pendentes — nenhuma delas é minha

Cada item abaixo é uma escolha de negócio ou jurídica. Deixei o texto atual como
está, e nenhum deles foi inventado por mim; os quatro primeiros já estavam no
texto antigo e sobreviveram à tradução sem nunca terem sido decididos.

| # | Ponto | Onde | O que decidir |
|---|---|---|---|
| 1 | **Foro e lei aplicável** | `terms.s9_p` | Diz "legislação brasileira" e "foro da comarca competente, com renúncia a qualquer outro". Se o produto for vendido B2B/on-prem fora do Brasil, isso precisa de revisão — e a renúncia de foro tem eficácia limitada em relação de consumo (CDC). |
| 2 | **Isenção de responsabilidade** | `terms.s6_p` | "Sem garantias de qualquer tipo" é padrão de software, e o art. 51 do CDC limita cláusulas de exoneração em relação de consumo no Brasil. Manter, atenuar ou qualificar por tipo de usuário? |
| 3 | **LGPD / GDPR** | `privacy.*` | A política **não cita** nenhuma das duas, não nomeia controlador nem encarregado, e não descreve direitos do titular. Defensável enquanto não há coleta de dado pessoal — mas os logs de hospedagem (IP) são citados na própria página, e IP é dado pessoal sob as duas leis. Recomendo decisão explícita. |
| 4 | **Logs de hospedagem** | `privacy.collect_p1` | O texto afirma retenção e finalidade ("segurança e diagnóstico") sem prazo. Confirmar o que o Cloudflare Pages de fato retém, e por quanto tempo, antes de manter a frase. |
| 5 | **Licença do modelo de IA** | `terms.s5_p` | Diz que "os modelos possuem suas próprias licenças". O modelo em uso é IS-Net, **Apache-2.0** (ver `scripts/fetch-model.mjs`). Vale nomear a licença em vez de deixar genérico? |
| 6 | **Proibição de engenharia reversa do modelo** | `terms.s4_4` | A cláusula proíbe extrair ou replicar o modelo. Ele é Apache-2.0 e é servido publicamente em `/model/`. A proibição pode ser inexequível — e talvez indesejada. |
| 7 | **Contato** | `static.contact_email` | `suporte@jluckas.com.br`. Confirmar que é o canal certo para questão de privacidade, ou apontar outro. |
| 8 | **"Gratuito"** | `terms.s2_p` | O texto diz "conjunto gratuito". Se houver plano pago/B2B no roadmap, a cláusula precisa antecipar isso ou ser datada. |

---

## 3. Como alterar

O texto é dado, não marcação. Editar `terms.*` ou `privacy.*` nos **dois**
dicionários (`src/app/core/i18n/pt.ts` e `en.ts`) — uma chave faltando em um
deles é erro de compilação, e `npm run check:templates` recusa texto cravado no
template.

Depois:

```bash
npm test -- --watch=false --browsers=ChromeHeadless
CI=1 NADASAI_DEV_PORT=4210 npx playwright test 39-english
```

O `39-english` é quem confere que a metade inglesa das três páginas
institucionais existe e fala inglês.
