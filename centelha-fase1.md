# Centelha 3 Alagoas — Formulário da Fase 1

> Edital nº 06/2026 (FAPEAL/SECTI-AL/SEBRAE-AL). **Submissão até 17/07/2026 às 18h (Brasília)**, pelo Sistema Centelha (`al.programacentelha.com.br`) — item 11.
> Texto pronto para copiar e colar na plataforma.
> Nota da Fase 1 = **(2×S + M + E + I) / 5** (item 10.1(b)). Solução vale o dobro: é lá que a proposta ganha ou perde. Cada critério vale de 1 a 5.
> Desempate: S, M, E, I e **só então** data mais antiga de submissão (item 10.1(c)) — é o último critério, não o primeiro.
>
> **SUBMETA HOJE E EDITE DEPOIS.** Item 4.5.3: *"Após a submissão, a proposta poderá ser editada até o fim do prazo estipulado no item 11 – Cronograma (…) sendo considerada sempre a última versão."* Submeter cedo não congela nada — dá para continuar refinando até 17/07 às 18h. E o item 4.5.4 avisa: **rascunho não conta.** *"Propostas em rascunho, ou seja, não enviadas para avaliação, não serão consideradas submetidas e não serão avaliadas."* O pior desfecho possível é um texto perfeito que nunca saiu do rascunho.
> A confirmação vem por **e-mail automático** (item 4.5.1) — se não chegou, não submeteu.
>
> ⚠️ **O NOME DO PROJETO É IRREVERSÍVEL.** Item 4.2.1.1: *"O nome atrelado ao projeto na Fase 1 não poderá ser alterado em nenhum momento até o final da participação no programa."* "Nada Sai" fica para sempre. Decida com convicção antes de enviar.

---

## 1. Identificação da proposta

**Nome do projeto:**
Nada Sai — plataforma de processamento local de arquivos (arquitetura zero-upload)

**Área do conhecimento da principal tecnologia:**
Ciência da Computação — Engenharia de Software / Computação em Borda (edge) e Inteligência Artificial embarcada em navegador (WebAssembly)

**Setor econômico:**
Tecnologia da Informação e Comunicação — Software como Serviço (SaaS), com aplicação em Privacidade e Proteção de Dados (compliance com a LGPD)

---

## 2. Problema e oportunidade de mercado  *(critério M)*

Para executar uma tarefa banal — remover o fundo de uma foto, comprimir um arquivo pesado demais para um sistema, converter um formato, juntar duas páginas de um PDF — a pessoa recorre às ferramentas online gratuitas que conhece — iLoveIMG, TinyWow, Adobe Express, Canva, remove.bg. **Todas funcionam do mesmo jeito: o arquivo é enviado para o servidor de um terceiro, processado lá e devolvido.**

O usuário não percebe o que acabou de fazer. Mas quando esse arquivo é a foto de um RG, um laudo médico, a ficha de um funcionário, uma procuração ou o documento de um cliente, o que aconteceu foi **transferência de dado pessoal para um operador não contratado, frequentemente sediado fora do Brasil, sem contrato, sem base legal e sem registro** — uma violação direta da LGPD, cometida por quem só queria diminuir o tamanho de um arquivo.

Esse comportamento é diário e invisível em profissões que lidam com documento alheio o tempo inteiro: advocacia, contabilidade, saúde, recursos humanos, cartórios, imobiliárias, administração pública. **Só de advogados o Brasil tem mais de 1,3 milhão** — a maior proporção de advogados por habitante do mundo. É a mesma pessoa que assina um termo de confidencialidade com o cliente e, cinco minutos depois, sobe o documento dele num site gratuito qualquer para comprimir.

O custo desse hábito deixou de ser hipotético. Em fevereiro de 2026 a ANPD foi **transformada em agência reguladora** (Lei nº 15.352/2026), com autonomia financeira, ampliação de quadro e poder de fiscalização reforçado. Em **junho de 2026 ela abriu 19 processos administrativos sancionadores — a maior leva da sua história** — e o seu Mapa de Temas Prioritários 2026-2027 elege justamente inteligência artificial, dados de saúde e dados de crianças e adolescentes. As sanções chegam a **2% do faturamento, limitadas a R$ 50 milhões por infração**. A fiscalização frouxa dos primeiros anos acabou.

A oportunidade é o encontro dessas duas curvas: **uma necessidade cotidiana e universal (manipular arquivos) atendida hoje por uma arquitetura que se tornou um passivo jurídico.** Nenhum dos produtos que esse profissional efetivamente usa resolve o problema na raiz — todos prometem, em política de privacidade, que "os arquivos são apagados em 1 hora", em vez de eliminar o upload. **Promessa de exclusão exige confiança. Arquitetura que não envia nada dispensa confiança.** Existem, é verdade, ferramentas que processam no navegador (seção 3), mas são utilitários avulsos de nicho técnico: não encadeiam tarefas, não falam ao profissional brasileiro e não entregam evidência de conformidade. **O upload continua sendo o padrão de fato de toda a categoria.**

**Modelo de negócio.** A monetização não vem do usuário gratuito e **não vem de publicidade** — anúncio é infraestrutura de rastreamento e contradiria a própria tese do produto (a arquitetura, aliás, o bloqueia tecnicamente: ver seção 3). O uso gratuito na web é **canal de aquisição e prova pública da tese**, não receita.

A receita vem de quem **responde juridicamente pelo vazamento**: escritórios, clínicas, departamentos de RH e órgãos públicos, para quem a exposição chega a 2% do faturamento, limitada a R$ 50 milhões por infração. Esse comprador não compra software — **compra a capacidade de provar conformidade.** Daí as três linhas: **assinatura B2B** para escritórios e clínicas, com painel administrativo e relatório de conformidade; **licença on-premise** para empresas e governo, instalável na própria intranet; e **suporte, SLA e implantação**.

Duas consequências que sustentam esse modelo. Primeiro, **o custo marginal de servidor por operação é praticamente zero** — a margem não se deteriora com escala, ao contrário de todo concorrente que processa em nuvem. Segundo, a defensabilidade **não depende de esconder código**: o cliente corporativo compra contrato, nota fiscal, responsabilidade formal e evidência auditável — nada disso se obtém copiando o produto. O licenciamento permissivo do motor de IA (seção 3) é o que torna essa venda juridicamente possível, e é uma porta fechada para a principal alternativa livre do mercado, distribuída sob AGPL.

---

## 3. Solução proposta e diferencial inovador  *(critério S — PESO 2)*

O **Nada Sai** é uma plataforma de manipulação de arquivos construída sobre uma única restrição, que ela nunca viola: **o arquivo nunca sai do dispositivo do usuário.** Todo o processamento executa dentro do próprio navegador, via WebAssembly e Canvas. Não existe servidor de aplicação, não existe upload, o arquivo não trafega pela rede.

**Essa restrição — e não uma lista de funcionalidades — é o produto.** Ela independe do tipo de arquivo, e é por isso que a plataforma se estende sem mudar de tese.

**Módulo já implementado (imagem).** Existe hoje um protótipo funcional com cinco ferramentas encadeáveis — remoção de fundo, corte, compressão, conversão de formato e redimensionamento — em que o resultado de uma alimenta a seguinte sem que o arquivo saia da máquina em nenhum momento da cadeia.

**A aplicação está no ar e é pública: `https://nadasai.com`** — não é maquete nem vídeo, é o produto rodando, aberto a qualquer avaliador, sem cadastro. A própria página traz um **contador de rede ao vivo** que mede, no navegador do avaliador, quantos bytes do arquivo dele saíram para a rede: a resposta é **0 bytes, nenhum servidor**. A tese do projeto não é argumentada no formulário — ela é verificável em dez segundos, na máquina de quem está lendo.

### O estado da arte — e o que ele deixa em aberto

Processamento de imagem dentro do navegador não é novidade, e **não é isso que reivindicamos como inovação.** Ser preciso aqui é o que sustenta o resto do argumento:

- O **Squoosh**, do Google Chrome Labs, comprime, converte e redimensiona inteiramente no navegador via WebAssembly, é PWA e funciona offline — desde 2018.
- O **@imgly/background-removal** e o **bg-remove** (Transformers.js) fazem remoção de fundo por IA rodando no cliente.

Essas ferramentas provam que a tecnologia de base existe. Elas também mostram, com clareza, **o que ninguém fez com ela** — e é exatamente aí que o Nada Sai se coloca:

- **Toda ferramenta local existente é de propósito único.** O Squoosh comprime. O bg-remove tira fundo. **Nenhuma encadeia com a outra.** Para executar duas tarefas seguidas, o usuário exporta de uma e importa na outra, à mão.
- **Todo produto que encadeia tarefas é em nuvem.** Os hubs que o profissional realmente usa (iLoveIMG, TinyWow, 123apps, Adobe Express, Canva) oferecem dezenas de ferramentas integradas — e **todos processam no servidor.**
- **O cruzamento entre os dois está vazio:** um fluxo de trabalho *integrado e encadeado* que nunca envia o arquivo. É o espaço que este projeto ocupa.
- E **nenhuma delas é um produto de conformidade.** O Squoosh é ferramenta de desenvolvedor feita para desenvolvedor; não sabe que a LGPD existe, não fala português, não gera evidência de conformidade e não se instala na intranet de um escritório. Processamento local, ali, é detalhe de implementação. Aqui, é a proposta de valor.

### O diferencial inovador está em quatro decisões de arquitetura, não em funcionalidade

**1. A cadeia local — o núcleo da inovação.** O resultado de cada ferramenta alimenta a seguinte **sem nunca tocar a rede e sem nunca voltar ao disco**: remover o fundo, cortar, redimensionar e comprimir é uma sequência contínua, com um único estado de sessão em memória, do qual o usuário sai só quando baixa o arquivo final. É o que os hubs em nuvem entregam **ao custo de subir o documento a cada etapa** — cinco tarefas, cinco uploads, cinco operadores diferentes — e o que as ferramentas locais não entregam de jeito nenhum. **Fazer a cadeia inteira caber no navegador é o problema técnico que o projeto resolve.**

**2. Inteligência artificial executada no cliente, sem meia-medida.** A remoção de fundo usa um modelo de segmentação (IS-Net) rodando na máquina do usuário sobre WebAssembly (ONNX Runtime): **a imagem nunca é transmitida.** Frente às alternativas locais que já existem, duas decisões nos separam — e ambas foram tomadas por causa do modelo de negócio, não por gosto:

- **Os pesos são servidos do nosso próprio domínio, não de um CDN de terceiro.** A alternativa mais conhecida busca o modelo num CDN externo em tempo de execução — o que significa que, mesmo processando localmente, **o download revela a um terceiro o IP do usuário e o metadado de que ele está usando a ferramenta.** Aqui não há esse vazamento: o arquivo não sai, e a informação de uso também não.
- **Licenciamento permissivo (Apache-2.0 e MIT), deliberadamente.** A alternativa mais madura do mercado é **AGPL-3.0** — copyleft que alcança produto vendido B2B e instalado on-premise. Nossa escolha de motor e modelo é o que **permite licença comercial e instalação na intranet do cliente sem abrir o código do produto.** É pré-condição direta do modelo de negócio, e é uma porta que o concorrente open source não consegue abrir.
- **Funciona offline.** Após o primeiro carregamento o modelo fica em cache (PWA) e a remoção de fundo roda com a internet desligada — verificável ao vivo.

**3. Conformidade por arquitetura, não por promessa — a ponto de recusar o próprio rastreador.** Os concorrentes em nuvem tratam privacidade como cláusula ("excluímos seu arquivo em 1 hora"). Aqui ela é propriedade do sistema: **não há como vazar, sequestrar, requisitar judicialmente ou revender um arquivo que nunca foi enviado.** Isso materializa o *privacy by design* do art. 46 da LGPD e elimina a cadeia de risco inteira — não há operador, não há transferência internacional, não há contrato de tratamento a firmar.

E a garantia é estrutural, não editorial: a aplicação exige `Cross-Origin-Opener-Policy` e `Cross-Origin-Embedder-Policy` para habilitar o paralelismo da IA, e **esses cabeçalhos bloqueiam, no nível do navegador, qualquer script de terceiro que não seja explicitamente compatível — incluindo toda rede de anúncios e de analytics.** O sistema é tecnicamente incapaz de hospedar um rastreador sem abrir mão do próprio desempenho. A privacidade aqui não depende de boa conduta futura da empresa: **está travada na arquitetura.**

**4. Custo marginal zero.** Sem backend, não há custo de infraestrutura por operação — a margem não se deteriora com escala, ao contrário de todo concorrente que processa em nuvem. Isso viabiliza ao mesmo tempo o acesso gratuito e o uso em rede instável ou restrita: hospitais, escolas públicas, órgãos de governo.

**Estado atual (TRL):** protótipo funcional validado em ambiente relevante — **TRL 6**. As cinco ferramentas do módulo de imagem estão implementadas, com suíte automatizada de testes (unitários e ponta-a-ponta) cobrindo todo o fluxo.

**Evolução planejada:** começamos por imagem porque é a tarefa mais frequente e a de menor atrito para provar a tese. **O mesmo motor de processamento local se estende a PDF (juntar, dividir, comprimir, assinar), documentos e áudio** — categorias em que o dado é ainda mais sensível e o risco de LGPD, ainda maior. É o mesmo problema, o mesmo motor e a mesma garantia; muda apenas o decodificador de formato. O objetivo é consolidar as tarefas de manipulação de arquivos que hoje o profissional resolve espalhando documentos sigilosos por cinco sites diferentes — **com a garantia, inédita nessa categoria, de que nenhum deles sai do computador.**

---

## 4. Impacto socioambiental  *(critério I)*

**Proteção de dados pessoais e sensíveis.** O impacto social direto é retirar de circulação um vazamento silencioso e massivo: documentos com dados pessoais — inclusive dados sensíveis de saúde e dados de crianças, duas das prioridades declaradas da ANPD para 2026-2027 — que hoje são enviados diariamente a servidores de terceiros por profissionais que sequer sabem que estão tratando dado pessoal. A ferramenta protege o titular do dado, que não é o cliente do produto e nunca foi consultado.

**Inclusão digital e soberania tecnológica.** Por funcionar offline e sem custo de servidor, o sistema é utilizável em escolas, unidades de saúde e órgãos públicos com internet instável ou rede restrita — realidade em boa parte do interior de Alagoas. E mantém dados de brasileiros em máquinas brasileiras, sem transferência internacional para infraestrutura estrangeira.

**Sustentabilidade ambiental.** Cada operação equivalente feita na concorrência consome tráfego de rede (upload + download do arquivo) e tempo de CPU/GPU em datacenter. O processamento na borda **elimina os dois**: usa capacidade computacional ociosa de um dispositivo que já está ligado, em vez de acionar um servidor remoto. É redução mensurável de consumo energético e de tráfego por operação.

---

## 5. Equipe executora  *(critério E — domínio tecnológico e capacidade de execução)*

A equipe é formada por dois profissionais de Ciência da Computação da **Universidade Federal de Alagoas**, com histórico comprovado de levar software ao ar e mantê-lo em produção — inclusive em cliente público.

> **José Lucas Ferreira dos Santos — Proponente e coordenador — Ciência da Computação (UFAL) — Arquitetura e desenvolvimento.**
> Desenvolvedor full-stack com **5 anos de experiência** no desenvolvimento de soluções tecnológicas. É o fundador e autor do **IniPort** (`iniport.com.br`), startup e plataforma de gestão de transporte universitário intermunicipal que integra prefeituras, motoristas e estudantes em um único sistema — com emissão de carteira digital, rastreamento em tempo real, controle de lotação e gestão de rotas. O IniPort é **vencedor do Startup Nordeste Alagoas** e opera hoje atendendo administração pública municipal, o que demonstra capacidade de entregar sistema em produção, com usuário real e cliente institucional — e não apenas protótipo. Ou seja: não é a primeira vez que tira um produto do papel e o mantém no ar — já o fez, com cliente público, e o produto sobreviveu.
> Neste projeto, é responsável pela concepção e implementação integral da arquitetura zero-upload: pipeline de processamento em WebAssembly/Canvas, integração do modelo de IA de segmentação executado no cliente, e a suíte automatizada de testes (unitários e ponta-a-ponta) que cobre todo o fluxo. Portfólio: `jluckas.com.br`.
> **Previsão de dedicação: integral — 40h semanais.**

> **Marcelly Beatriz dos Santos Silva — Ciência da Computação (UFAL) — Design de produto (UX/UI).**
> Formada em Ciência da Computação pela UFAL, com trajetória concentrada em experiência do usuário, interface e desenvolvimento front-end. A combinação é o que a torna eficaz aqui: **desenha a partir de dentro da engenharia** — conhece o custo de implementação do que propõe, e por isso o design chega ao código sem virar outra coisa no caminho. Soma a isso a atuação em visão de produto e condução estratégica, definindo não só como a tela se parece, mas o que o produto deve ser.
> Neste projeto, é responsável pelo design da experiência e da interface do Nada Sai. Sua função é central e não cosmética: o produto compete com ferramentas gratuitas de uso imediato, e **a garantia de privacidade só gera valor se o usuário a percebe sem precisar entender a arquitetura.** Traduzir "o arquivo não sai do seu computador" em algo evidente na tela é um problema de design — e a resposta encontrada é o contador de rede ao vivo na página inicial, que não *explica* a privacidade, e sim a **demonstra**, medindo diante do usuário os 0 bytes que saíram da máquina dele. É design resolvendo o problema central do produto, não decorando a superfície.
> **Previsão de dedicação: integral — 40h semanais.**

**Complementaridade:** os dois papéis cobrem as duas frentes de risco do produto — a técnica (fazer IA de visão computacional rodar com desempenho aceitável dentro do navegador) e a de adoção (fazer o usuário perceber e confiar numa garantia que é invisível por natureza).

---

### ⚠️ Regras de equipe que o edital impõe — leia antes de submeter

Extraídas do item 3 do Edital nº 06/2026. Duas delas são irreversíveis:

*Conferido contra o PDF oficial do edital em 16/07/2026 (fapeal.br → "Chamada original"). Tudo abaixo é citação verificada, não memória.*

1. **O proponente é o coordenador e NÃO pode ser alterado durante as fases de seleção, sob pena de desclassificação** (item 3.2). Quem submeter é quem fica. José Lucas deve ser o proponente.
2. **Cada membro precisa estar cadastrado como usuário no Sistema Centelha do estado de Alagoas** (item 3.1.3(e)). **A Marcelly precisa fazer esse cadastro antes da submissão.** O item 3.4 é explícito sobre a consequência: *"Apenas os integrantes cadastrados no sistema Centelha e com declaração assinada serão levados em consideração na avaliação."* Sem cadastro ela não é avaliada — a equipe vira de um.
3. **Cada membro precisa ter função efetiva descrita no formulário, junto à previsão de dedicação** (item 3.1.3(c)). Cargo sozinho não basta.
4. **Não existe número mínimo de membros.** Item 3.4: *"A equipe executora da proposta poderá ter **até 5 membros**, sendo um deles o proponente."* É teto, não piso — a palavra "mínimo" não aparece em nenhum lugar do edital em relação a tamanho de equipe. **Submeter com dois é válido.**
5. **O proponente precisa dispor de no mínimo 20h semanais** (item 3.1.1(j)) — único mínimo de dedicação do edital, e vale só para o coordenador. Os 40h declarados cumprem com folga. Para os demais membros o edital não fixa mínimo, só exige que a previsão esteja descrita.
6. Na Fase 2, cada membro apresenta **declaração de participação individual assinada** (item 3.3.2).

**Sobre incluir uma terceira pessoa — decidido: submeter com dois.** Não há exigência de três (item 3.4 fixa só o teto de 5). O edital prevê explicitamente a *retirada* de membros durante a Fase 2 (item 3.3.1), mas **não prevê a inclusão** — então um terceiro integrante com perfil comercial ou jurídico (um advogado/DPO seria devastadoramente útil nesta tese) precisaria entrar **agora, na Fase 1**. A decisão consciente é seguir com dois, aceitando o risco descrito abaixo.

Isso importa porque a Fase 2 dá **peso 2 à Consistência da Proposta (modelo de negócio + cronograma + orçamento), e nota abaixo de 2 nesse critério elimina a proposta**, por melhor que seja a solução. Dois desenvolvedores/designers cobrem a tecnologia; ninguém na equipe cobre, hoje, o plano de negócios que a Fase 2 vai exigir.

---

## 6. Vídeo pitch — 3 minutos (opcional, mas faça)

É opcional no edital (item 4.2.1(e)) e é a sua maior vantagem: **quase todos os concorrentes têm só uma ideia no papel. Você tem software rodando.**

O roteiro tem um único momento que decide tudo — **desligue a internet, ao vivo, na frente da câmera, e continue removendo o fundo de uma foto.** Nenhum concorrente do mundo consegue fazer isso. Prova a tese inteira em cinco segundos, sem uma palavra.

**Formato exigido:** até 3 minutos, hospedado no **YouTube como "Não listado" ou "Público"**, ou no **Vimeo compartilhado** — o link é colado na plataforma. Qualquer outro formato não é aceito.

**Grave com o modelo já em cache.** São 44 MB baixados no primeiro acesso. Abra `nadasai.com` e rode uma remoção de fundo *antes* de gravar — com a internet desligada em navegador limpo, a demo não roda e o melhor momento do vídeo morre na frente da câmera.

## 6.1. PDF de apoio — segundo anexo opcional, e ninguém usa

Item 4.2.1(f): **"Envio OPCIONAL de um documento PDF que ilustre ou apoie a apresentação da proposta."**

É um canal extra de graça, separado do vídeo, e a maior parte dos concorrentes vai ignorar. Você tem o que colocar nele e eles não: **capturas do produto real no ar** — a home com o contador de rede marcando `0 bytes / nenhum servidor`, o antes-e-depois da remoção de fundo, a cadeia de ferramentas encadeadas. É o argumento de maturidade em imagem, para o avaliador que não abrir o link nem assistir ao vídeo.

---

## Checklist antes de enviar

- [x] ~~Registrar `nadasai.com`~~ — feito. **`nadasai.com.br` ainda não resolve** (opcional: o `.com` cobre o formulário)
- [x] ~~Colocar a aplicação no ar no domínio e citar o link no formulário~~ — no ar em `https://nadasai.com`, link citado na seção 3
- [x] ~~Deploy do `public/_headers` (COOP/COEP)~~ — **resolvido e verificado ao vivo em 16/07.** `curl -I https://nadasai.com` devolve `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`, então `SharedArrayBuffer` existe e a IA roda multithread no ar. Commitado em `4ff1f5e` e já publicado
- [ ] **Marcelly Beatriz dos Santos Silva cadastrada no Sistema Centelha AL** (exigência do item 3.1.3(e) — sem isso ela não pode constar na equipe). **Este é o único bloqueio real da submissão.**
- [ ] José Lucas Ferreira dos Santos submeter como **proponente/coordenador** (não pode ser trocado depois)
- [x] ~~Preencher a **previsão de dedicação semanal** de cada membro~~ — ambos com dedicação integral (40h)
- [x] ~~Decidir sobre um **terceiro membro**~~ — decidido: **submeter com dois.** Ciente de que a Fase 2 dá peso 2 ao plano de negócios e nota < 2 elimina
- [x] ~~Comprovante de residência em Alagoas atualizado~~ — **não é pendência de hoje.** O item 3.1.1(d) exige o comprovante, mas o item 14.1 fixa *quando*: *"Após a publicação do resultado final, para contratação dos projetos aprovados"*. Nada de documento se anexa na Fase 1 — o formulário é só texto (item 4.2.1). Providencie antes da contratação, não antes de submeter
- [ ] Confirmar que não foi sócio de empresa contratada no Centelha 1 ou 2 **nem em qualquer edição do Programa Tecnova** (item 3.1.1(g) — o Tecnova é fácil de esquecer e desclassifica igual). Atenção à palavra **"contratada"**: ter *participado* não impede; ter sido sócio de empresa que foi *contratada* impede
- [ ] **VERIFICAR — item 3.1.1(h): "Não ser sócio de outras empresas de atividade afim à proposta."** José Lucas é sócio/fundador do IniPort. Gestão de transporte universitário e processamento local de arquivos são atividades distintas, então a leitura provável é que não há conflito — mas quem decide isso é a FAPEAL, não nós. A **declaração** só é exigida *"caso a proposta seja aprovada"* (item 3.1.1(h) + 14.1), então **isto não trava a submissão de amanhã** — mas é critério de elegibilidade, não de nota: não custa pontos, elimina. Submeta agora e pergunte à FAPEAL em paralelo; não use a dúvida como motivo para atrasar o envio
- [ ] **Se aprovado**, será preciso constituir empresa com sede em Alagoas (item 3.1.1(a)). Empresa já existente só serve se constituída após 28/05/2025 (item 3.1.2(a)) — o IniPort provavelmente não se enquadra, então o caminho é abrir uma nova. MEI e Empresário Individual **não são aceitos** (item 3.1.2.2)
- [x] ~~Preencher todos os **[PREENCHER]** restantes~~ — nenhum restante
- [ ] Gravar o vídeo pitch (YouTube "Não listado"/"Público" ou Vimeo compartilhado — item 4.2.1(e))
- [ ] Montar o **PDF de apoio opcional** com capturas do produto no ar (item 4.2.1(f) — canal extra que quase ninguém usa)
- [ ] Confirmar que o nome **"Nada Sai"** é definitivo — não pode ser alterado nunca mais (item 4.2.1.1)
- [ ] **SUBMETER HOJE (16/07), não amanhã** — dá para editar até 17/07 18h (item 4.5.3). Rascunho não conta (item 4.5.4); espere o e-mail de confirmação (item 4.5.1)

## O que deliberadamente NÃO está escrito aqui

Não há uma linha dizendo que a proposta é "reunir várias ferramentas em um só lugar". Isso é agregação, não inovação, cairia no critério de peso 2 e é factualmente frágil — TinyWow, iLoveIMG e 123apps já são hubs com dezenas de ferramentas.

A distinção que o texto sustenta o tempo todo:

- Um **hub** se define pela **lista de ferramentas**. Cresce somando itens. Qualquer um copia.
- Uma **plataforma** se define por uma **restrição que nunca viola**. Cresce aplicando a mesma restrição a novos formatos.

Por isso a amplitude (imagem → PDF → documento → áudio) aparece só como **consequência** da arquitetura, nunca como argumento de venda. O argumento é um só, e é o nome do projeto: **nada sai.**

**Também não está escrito que somos os únicos a processar no navegador** — não somos, e afirmar isso seria falso de um jeito que um avaliador técnico verifica em trinta segundos (Squoosh, imgly, bg-remove). O texto nomeia essas ferramentas de propósito único e sustenta a distinção real: **elas não encadeiam, e os produtos que encadeiam são todos em nuvem.** Reivindicar o que é verificável custa menos que reivindicar o máximo e perder credibilidade no critério de peso 2.

**E não está escrito que o moat é o código.** Não é — um produto client-side entrega a implementação a quem abrir o DevTools, e o Squoosh é open source sem que isso tenha aberto espaço para concorrente. A defensabilidade é **contratual e regulatória**: licença permissiva que viabiliza on-premise (fechada para a alternativa AGPL), somada a contrato, responsabilidade formal e evidência auditável — que é o que o comprador B2B realmente adquire e o que copiar código não entrega.
