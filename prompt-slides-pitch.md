# Prompts por slide — Pitch "Nada Sai" (Centelha 3 Alagoas, Fase 1)

Cole o **Bloco 0** primeiro para fixar o estilo. Depois cole um slide por vez.
Nenhum número, nome ou afirmação aqui é inventado — tudo sai do `centelha-fase1.md` e é verificável.

---

## BLOCO 0 — Estilo (cole antes de tudo)

> Vou te passar, um a um, os slides de um deck de pitch de 10 slides para um edital de inovação no Brasil (Centelha 3 Alagoas / FAPEAL). Siga estas regras em todos:
>
> - Fundo **branco**, muito espaço em branco, alto contraste. Um azul institucional profundo como único acento. Vermelho apenas em números de risco/multa.
> - Tipografia grande e confiante. Uma ideia por slide.
> - **Máximo 25 palavras por slide.** O deck apoia a fala, não a substitui.
> - Manchete afirmativa no topo — uma frase que já entrega a ideia, não um rótulo como "Mercado".
> - Números (%, R$, bytes, TRL) em destaque, em fonte monoespaçada.
> - Tom sóbrio e técnico, com convicção. Sem "startupês", sem superlativo vazio, sem emoji.
> - Português do Brasil. Não invente nenhum dado que eu não tenha passado.
>
> Espere eu enviar o slide 1.

---

## SLIDE 1 — Capa

> **Slide 1, capa.**
> Marca: **Nada Sai**
> Manchete: **"O arquivo nunca sai do seu computador."**
> Subtítulo: uma plataforma de manipulação de arquivos construída sobre uma restrição que ela nunca viola.
> Rodapé: `nadasai.com` — no ar, público, sem cadastro.
> Canto superior: Centelha 3 Alagoas · Edital nº 06/2026 · FAPEAL · SECTI-AL · SEBRAE-AL.
>
> Visual: quase vazio. A manchete ocupa a tela. Sem ilustração.

**Fala:** Este é o Nada Sai. O nome é a especificação inteira do produto. Não é conceito nem maquete — está no ar agora, público e sem cadastro, e vocês podem abrir enquanto eu falo.

---

## SLIDE 2 — O problema

> **Slide 2, o problema.**
> Manchete: **"Comprimir o documento de um cliente é entregar o documento de um cliente."**
> Corpo (resuma em no máximo 25 palavras): para tirar fundo, comprimir ou converter, o profissional usa iLoveIMG, TinyWow, remove.bg. Todos enviam o arquivo para o servidor de um terceiro. Quando é um RG, um laudo ou uma procuração, isso é transferência de dado pessoal sem contrato e sem base legal.
> Faixa inferior: advocacia · saúde · contabilidade · RH · cartórios · setor público.
>
> Visual: sem ícones de escudo/cadeado. Se precisar de imagem, algo que evoque um documento saindo da mão de alguém.

**Fala:** Todo mundo já fez isso — joga o PDF no primeiro site gratuito e segue a vida. Ninguém percebe que acabou de transferir dado pessoal para um operador não contratado, muitas vezes fora do Brasil. É o mesmo advogado que assinou um termo de confidencialidade de manhã. Só de advogados o Brasil tem 1,3 milhão.

---

## SLIDE 3 — Por que agora

> **Slide 3, urgência regulatória.**
> Manchete: **"A fiscalização frouxa acabou."**
> Três números grandes, lado a lado:
> 1. **Lei 15.352** — fevereiro de 2026: a ANPD é transformada em agência reguladora, com autonomia e fiscalização reforçada.
> 2. **19** — processos sancionadores abertos em junho de 2026, a maior leva da história da agência. *(em vermelho)*
> 3. **R$ 50 mi** — teto por infração, ou 2% do faturamento. Prioridades 2026-27: IA, dados de saúde e de crianças. *(em vermelho)*
>
> Visual: três colunas separadas por linha fina. Os números dominam; o texto de apoio é pequeno.

**Fala:** Até ano passado isso era risco teórico. Em fevereiro a ANPD virou agência reguladora. Em junho abriu dezenove processos de uma vez — nunca tinha feito nada perto disso. E o Mapa de Temas Prioritários dela elege exatamente IA, dados de saúde e dados de crianças: é a nossa categoria inteira.

---

## SLIDE 4 — A solução

> **Slide 4, a solução.**
> Manchete em duas linhas contrastadas: **"Promessa de exclusão exige confiança. / Arquitetura que não envia nada dispensa confiança."**
> Corpo: os concorrentes prometem apagar seu arquivo em uma hora. Nós não temos onde apagar — não há upload, não há servidor de aplicação, o arquivo não trafega. Tudo executa no navegador, em WebAssembly e Canvas.
> Faixa inferior: não há como vazar um arquivo que nunca foi enviado.
>
> Visual: o contraste entre as duas frases é o slide. Talvez uma linha vertical separando "promessa" de "arquitetura".

**Fala:** A indústria trata privacidade como cláusula de contrato. Isso pede que você confie na empresa — hoje, e daqui a três anos depois de uma aquisição. Não há como vazar, sequestrar, requisitar judicialmente ou revender um arquivo que nunca foi enviado. Não é uma promessa melhor: é a eliminação da necessidade de promessa.

---

## SLIDE 5 — A prova ★ (o slide mais importante)

> **Slide 5, a prova. Este é o clímax do deck — texto mínimo, impacto visual máximo.**
> Elemento dominante, ocupando metade da tela: o número **0** gigante, com a legenda **"bytes enviados"** logo abaixo.
> Ao lado: um painel simulando o inspetor de rede do navegador, com a tabela de requisições **vazia** e o resumo `0 requisições · 0 bytes transferidos · nenhum servidor`.
> Legenda curta: o contador na home mede o tráfego do **seu** arquivo, na **sua** máquina. Dez segundos para verificar.
> Faixa inferior: **"Desligue a internet. A remoção de fundo continua funcionando."**
> Reserve um espaço para eu colar uma captura de tela real da home com o contador.

**Fala:** *(Este slide decide o pitch — não corra.)* Abra a home e mostre o contador: ele mede, na máquina de quem assiste, quantos bytes saíram para a rede. A resposta é zero. Não é um selo, é uma medição ao vivo. Depois faça o teste definitivo: **desligue a internet, na frente da câmera, e remova o fundo de uma foto.** Nenhum concorrente do mundo faz isso. Fique em silêncio enquanto acontece.

---

## SLIDE 6 — O diferencial

> **Slide 6, posicionamento competitivo. Use uma matriz 2×2.**
> Eixo horizontal: **Ferramenta única** ↔ **Fluxo encadeado**. Eixo vertical: **Processa no servidor** ↔ **Processa no dispositivo**.
> - Servidor + ferramenta única: remove.bg
> - Servidor + encadeado: iLoveIMG, TinyWow, Adobe Express, Canva
> - Dispositivo + ferramenta única: Squoosh (Google), bg-remove, imgly
> - Dispositivo + encadeado: **Nada Sai** — único ocupante, destacado em azul
>
> Ao lado da matriz, quatro itens curtos, uma linha cada:
> 1. **A cadeia local** — tirar fundo, cortar, redimensionar e comprimir em sequência, em memória. Os hubs cobram cinco uploads por isso.
> 2. **IA no cliente, pesos no nosso domínio** — a alternativa busca o modelo num CDN de terceiro, e entrega a ele o IP do usuário.
> 3. **Licença permissiva, não AGPL** — é o que permite vender on-premise sem abrir o código.
> 4. **O rastreador é barrado pela arquitetura** — os cabeçalhos COOP/COEP que a IA exige bloqueiam toda rede de anúncios.
>
> Faixa inferior: **"Ferramenta local não encadeia. Produto que encadeia é em nuvem."**

**Fala:** Sejam precisos aqui, porque um avaliador técnico confere em trinta segundos: processar no navegador **não é novidade e não é o que reivindicamos** — o Squoosh do Google faz isso desde 2018. O que a matriz mostra é o que ninguém fez: toda ferramenta local é de propósito único; todo produto que encadeia processa no servidor. O quadrante de baixo à direita está vazio, e é onde nós estamos.

---

## SLIDE 7 — Mercado e modelo de negócio

> **Slide 7, modelo de negócio.**
> Manchete: **"Ninguém compra software de privacidade. Compra a capacidade de provar conformidade."**
> Três cartões de receita:
> 1. **Assinatura B2B** — escritórios e clínicas. Painel administrativo e relatório de conformidade.
> 2. **Licença on-premise** — empresas e governo, na própria intranet. Viável só pela licença permissiva.
> 3. **Suporte, SLA e implantação** — contrato, nota fiscal e responsabilidade formal.
>
> Uma linha de fecho: a web gratuita é canal de aquisição e prova da tese — não é receita, e não tem publicidade. Sem backend, o custo marginal por operação é zero.
> Faixa inferior: paga quem responde juridicamente pelo vazamento.

**Fala:** A receita não vem do usuário gratuito nem de anúncio — anúncio é infraestrutura de rastreamento e a nossa arquitetura bloqueia. Vem de quem responde juridicamente quando vaza: escritório, clínica, RH, órgão público, com exposição de até 2% do faturamento. Esse comprador não quer um compressor de imagem — quer conseguir provar conformidade. E o moat não é o código: é contratual e regulatório.

---

## SLIDE 8 — Tração / estado atual

> **Slide 8, tração.**
> Manchete: **"Cinco ferramentas encadeáveis, no ar, hoje."**
> Um fluxo horizontal de cinco etapas conectadas: Remover fundo → Cortar → Redimensionar → Comprimir → Converter. Legenda sob o fluxo: cinco etapas, um único estado em memória, 0 bytes para a rede.
> Quatro números de apoio:
> - **TRL 6** — protótipo funcional validado em ambiente relevante
> - **0** — cadastros exigidos para o avaliador testar agora
> - **2** — suítes automatizadas: unitária e ponta-a-ponta, cobrindo todo o fluxo
> - **PDF, documentos, áudio** — mesmo motor, muda só o decodificador
>
> Faixa inferior: nadasai.com · funciona offline após o primeiro acesso.
> Reserve espaço para capturas do produto real.

**Fala:** Quase toda proposta desta fase é uma ideia no papel. Esta tem software rodando, com testes automatizados, aberto para vocês agora. O resultado de cada ferramenta alimenta a próxima sem o arquivo tocar a rede nem voltar ao disco — fazer essa cadeia caber no navegador é o problema técnico que o projeto resolve. Começamos por imagem porque prova a tese com menos atrito; PDF e documentos são o mesmo motor.

---

## SLIDE 9 — Impacto socioambiental

> **Slide 9, impacto. Três colunas.**
> Manchete: **"O protegido não é o nosso cliente. É o dono do documento."**
> 1. **Social** — o titular do dado não escolheu o site que o profissional usou. Retira de circulação um vazamento diário e invisível, inclusive dados de saúde e de crianças.
> 2. **Inclusão e soberania** — offline e sem custo de servidor: usável em escolas, unidades de saúde e órgãos públicos com internet instável, realidade do interior de Alagoas. Dado de brasileiro fica em máquina brasileira.
> 3. **Ambiental** — cada operação equivalente na concorrência gasta upload, download e CPU em datacenter. Aqui usa capacidade ociosa de um aparelho já ligado.
>
> Faixa inferior: privacy by design · art. 46 da LGPD.

**Fala:** A pessoa protegida aqui não é quem usa o produto — é o dono do documento, que nunca foi consultado e não sabe que o arquivo dele foi parar num servidor em outro país. E há um efeito específico para Alagoas: como roda offline, funciona em escola e posto de saúde do interior, onde a rede cai. Privacidade junto com inclusão, não no lugar dela.

---

## SLIDE 10 — Equipe e fecho

> **Slide 10, equipe. Duas colunas, e um fecho embaixo.**
>
> **José Lucas Ferreira dos Santos** — proponente e coordenador. Ciência da Computação (UFAL), full-stack, 5 anos. Fundador do **IniPort**, plataforma de gestão de transporte universitário, **vencedora do Startup Nordeste Alagoas**, hoje atendendo administração pública municipal. Aqui: arquitetura zero-upload, IA no cliente e a suíte de testes. Dedicação integral, 40h semanais.
>
> **Marcelly Beatriz dos Santos Silva** — design de produto (UX/UI). Ciência da Computação (UFAL). Desenha de dentro da engenharia. O contador de rede é a resposta dela: não explica a privacidade, demonstra. Dedicação integral, 40h semanais.
>
> Fecho, grande: **"nada sai."**
> Rodapé: nadasai.com · jluckas.com.br · iniport.com.br

**Fala:** Somos dois, e os papéis cobrem as duas frentes de risco: fazer IA de visão rodar dentro do navegador, e fazer o usuário perceber uma garantia invisível por natureza. Sobre execução, um dado só: eu já fiz isso antes. O IniPort está no ar atendendo prefeitura, ganhou o Startup Nordeste Alagoas, e continua de pé. Fecho com a única frase que precisa ficar: **nada sai.**

---

## Regras que a IA de slides costuma violar — repita se ela escorregar

- **Nunca afirmar que somos os únicos a processar no navegador.** Não somos, e um avaliador técnico verifica em trinta segundos (Squoosh, imgly, bg-remove). O texto nomeia essas ferramentas e sustenta a distinção real: elas não encadeiam, e o que encadeia é em nuvem.
- **Nunca posicionar como "várias ferramentas em um só lugar".** Isso é agregação, não inovação, e é frágil — TinyWow e iLoveIMG já são hubs. Um hub se define pela lista de ferramentas; uma plataforma, por uma restrição que nunca viola.
- **Amplitude (imagem → PDF → documento → áudio) só como consequência da arquitetura**, nunca como argumento de venda.
- **Nunca dizer que o moat é o código.**
- Nenhuma métrica, usuário, faturamento, projeção ou parceiro além dos que estão acima.
