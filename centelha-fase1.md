# Centelha 3 Alagoas — Formulário da Fase 1

> Texto pronto para copiar e colar na plataforma.
> Tudo marcado com **[PREENCHER]** exige informação que só você tem — não invente, e não deixe em branco.
> Nota da Fase 1 = **(2×S + M + E + I) / 5**. Solução vale o dobro: é lá que a proposta ganha ou perde.

---

## 1. Identificação da proposta

**Nome do projeto:**
ImgWork — edição de imagem com processamento 100% local (arquitetura zero-upload)

**Área do conhecimento da principal tecnologia:**
Ciência da Computação — Engenharia de Software / Computação em Borda (edge) e Inteligência Artificial embarcada em navegador (WebAssembly)

**Setor econômico:**
Tecnologia da Informação e Comunicação — Software como Serviço (SaaS), com aplicação em Privacidade e Proteção de Dados (compliance com a LGPD)

---

## 2. Problema e oportunidade de mercado  *(critério M)*

Para executar uma tarefa banal — remover o fundo de uma foto, comprimir um arquivo pesado demais para um sistema, converter um formato, cortar uma imagem — a pessoa recorre a ferramentas online gratuitas. **Todas elas funcionam do mesmo jeito: o arquivo é enviado para o servidor de um terceiro, processado lá e devolvido.**

O usuário não percebe o que acabou de fazer. Mas quando esse arquivo é a foto de um RG, um laudo médico, a ficha de um funcionário, uma procuração ou o documento de um cliente, o que aconteceu foi **transferência de dado pessoal para um operador não contratado, frequentemente sediado fora do Brasil, sem contrato, sem base legal e sem registro** — uma violação direta da LGPD, cometida por quem só queria diminuir o tamanho de um arquivo.

Esse comportamento é diário e invisível em profissões que lidam com documento alheio o tempo inteiro: advocacia, contabilidade, saúde, recursos humanos, cartórios, imobiliárias, administração pública. **Só de advogados o Brasil tem mais de 1,3 milhão** — a maior proporção de advogados por habitante do mundo. É a mesma pessoa que assina um termo de confidencialidade com o cliente e, cinco minutos depois, sobe o documento dele num site gratuito qualquer para comprimir.

O custo desse hábito deixou de ser hipotético. Em fevereiro de 2026 a ANPD foi **transformada em agência reguladora** (Lei nº 15.352/2026), com autonomia financeira, ampliação de quadro e poder de fiscalização reforçado. Em **junho de 2026 ela abriu 19 processos administrativos sancionadores — a maior leva da sua história** — e o seu Mapa de Temas Prioritários 2026-2027 elege justamente inteligência artificial, dados de saúde e dados de crianças e adolescentes. As sanções chegam a **2% do faturamento, limitadas a R$ 50 milhões por infração**. A fiscalização frouxa dos primeiros anos acabou.

A oportunidade é o encontro dessas duas curvas: **uma necessidade cotidiana e universal (editar arquivos) atendida hoje por uma arquitetura que se tornou um passivo jurídico.** Não existe, no mercado brasileiro, uma ferramenta de edição de arquivos que resolva o problema na raiz — eliminando o upload em vez de prometer, em política de privacidade, que "os arquivos são apagados em 1 hora". Promessa de exclusão exige confiança. Arquitetura que não envia nada dispensa confiança.

**Modelo de negócio:** freemium para o usuário individual (aquisição e prova de valor); assinatura B2B para escritórios e clínicas, com painel administrativo e relatório de conformidade; e licença corporativa/on-premise para órgãos públicos e empresas, instalável na própria intranet. Como o processamento roda na máquina do usuário, **o custo marginal de servidor por operação é praticamente zero** — a margem não se deteriora com escala, ao contrário de todo concorrente que processa em nuvem.

---

## 3. Solução proposta e diferencial inovador  *(critério S — PESO 2)*

O ImgWork é uma plataforma de edição de arquivos que **executa todo o processamento dentro do navegador do próprio usuário, via WebAssembly e Canvas. Não existe servidor de aplicação, não existe upload: o arquivo nunca trafega pela rede.**

Já está implementado e funcionando um protótipo com cinco ferramentas encadeáveis — remoção de fundo, corte, compressão, conversão de formato e redimensionamento — em que o resultado de uma alimenta a seguinte sem que o arquivo saia da máquina em nenhum momento da cadeia.

**O diferencial inovador está em três decisões de arquitetura, não em funcionalidade:**

**1. Inteligência artificial executada no cliente.** A remoção de fundo é feita por um modelo de segmentação de imagem que roda **na máquina do usuário**, compilado para WebAssembly. Os pesos do modelo são baixados uma única vez e ficam em cache; **a imagem do usuário nunca é transmitida.** É a diferença essencial em relação a toda a concorrência (Adobe Express, Canva, iLoveIMG, TinyWow, remove.bg), que envia a imagem para GPUs em nuvem. Fazer IA de visão computacional rodar com desempenho aceitável no navegador do usuário final é o núcleo técnico do projeto.

**2. Conformidade por arquitetura, não por promessa.** Os concorrentes tratam privacidade como cláusula contratual ("excluímos seu arquivo em 1 hora"). O ImgWork a trata como propriedade do sistema: **não há como vazar, sequestrar, subpoenar ou revender um arquivo que nunca foi enviado.** Isso materializa o princípio de *privacy by design* previsto no art. 46 da LGPD e elimina, para o usuário profissional, toda a cadeia de risco — não há operador, não há transferência internacional, não há necessidade de contrato de tratamento de dados.

**3. Custo marginal zero e operação offline.** Sem backend, o sistema funciona **mesmo sem conexão** após o primeiro carregamento (PWA) e não tem custo de infraestrutura por uso. Isso viabiliza tanto o modelo gratuito quanto o uso em regiões com conectividade instável e em ambientes de rede restrita — hospitais, escolas públicas, órgãos de governo.

**Estado atual (TRL):** protótipo funcional validado em ambiente relevante — **TRL 6**. As cinco ferramentas estão implementadas, com suíte automatizada de testes (unitários e ponta-a-ponta) cobrindo todo o fluxo. [PREENCHER: se você já colocou no ar em um domínio público, diga aqui — muda a percepção de maturidade.]

**Evolução planejada:** a arquitetura zero-upload é a plataforma, não a ferramenta. O mesmo motor de processamento local se estende a **PDF (juntar, dividir, comprimir, assinar), documentos e áudio** — categorias em que o dado é ainda mais sensível e o risco de LGPD, ainda maior. O objetivo é consolidar, em um único ambiente, as tarefas de manipulação de arquivos que hoje o profissional resolve espalhando documentos sigilosos por cinco sites diferentes — **com a garantia, inédita nessa categoria, de que nenhum deles sai do computador.**

---

## 4. Impacto socioambiental  *(critério I)*

**Proteção de dados pessoais e sensíveis.** O impacto social direto é retirar de circulação um vazamento silencioso e massivo: documentos com dados pessoais — inclusive dados sensíveis de saúde e dados de crianças, duas das prioridades declaradas da ANPD para 2026-2027 — que hoje são enviados diariamente a servidores de terceiros por profissionais que sequer sabem que estão tratando dado pessoal. A ferramenta protege o titular do dado, que não é o cliente do produto e nunca foi consultado.

**Inclusão digital e soberania tecnológica.** Por funcionar offline e sem custo de servidor, o sistema é utilizável em escolas, unidades de saúde e órgãos públicos com internet instável ou rede restrita — realidade em boa parte do interior de Alagoas. E mantém dados de brasileiros em máquinas brasileiras, sem transferência internacional para infraestrutura estrangeira.

**Sustentabilidade ambiental.** Cada operação equivalente feita na concorrência consome tráfego de rede (upload + download do arquivo) e tempo de CPU/GPU em datacenter. O processamento na borda **elimina os dois**: usa capacidade computacional ociosa de um dispositivo que já está ligado, em vez de acionar um servidor remoto. É redução mensurável de consumo energético e de tráfego por operação.

---

## 5. Equipe executora  *(critério E)*

**[PREENCHER — este critério vale nota. Não subestime.]**

Modelo do que escrever para cada integrante — nome, formação, experiência e **o que essa pessoa faz especificamente neste projeto**:

> **Luckas Ferreira — [PREENCHER: formação] — Desenvolvimento e arquitetura.**
> Desenvolvedor de software com [PREENCHER: X] anos de experiência em [PREENCHER: front-end/Angular/TypeScript/etc.]. Responsável pela concepção e implementação integral do protótipo atual do ImgWork: arquitetura zero-upload, pipeline de processamento de imagem em WebAssembly/Canvas, integração do modelo de IA de segmentação executado no cliente e suíte automatizada de testes. [PREENCHER: cite outros sistemas que você construiu e mantém em produção — isso comprova capacidade de execução, que é literalmente o que este critério mede.]

**Recomendação séria:** submeter sozinho penaliza a nota de Equipe (peso 1) e, principalmente, a Fase 2, que é um plano de negócios. Se houver **qualquer** pessoa do seu círculo com perfil comercial, jurídico (advogado/DPO ajuda demais nesta tese) ou de gestão disposta a entrar, some agora. Um time de dois com papéis complementares pontua muito acima de um time de um.

---

## 6. Vídeo pitch — 3 minutos (opcional, mas faça)

É opcional no edital e é a sua maior vantagem: **quase todos os concorrentes têm só uma ideia no papel. Você tem software rodando.**

O roteiro tem um único momento que decide tudo — **desligue a internet, ao vivo, na frente da câmera, e continue removendo o fundo de uma foto.** Nenhum concorrente do mundo consegue fazer isso. Prova a tese inteira em cinco segundos, sem uma palavra.

---

## Checklist antes de enviar

- [ ] Comprovante de residência em Alagoas atualizado
- [ ] Confirmar que não foi contratado no Centelha 1 ou 2
- [ ] Preencher todos os **[PREENCHER]** — especialmente a Equipe
- [ ] Colocar o ImgWork no ar em um domínio público e citar o link
- [ ] Gravar o vídeo pitch
- [ ] **Enviar até 17/07/2026**

## O que deliberadamente NÃO está escrito aqui

Não há uma linha dizendo que a proposta é "reunir várias ferramentas em um só lugar". Isso é agregação, não inovação, e cairia no critério de peso 2 — além de ser factualmente frágil, porque TinyWow, iLoveIMG e 123apps já são hubs com dezenas de ferramentas. O hub aparece apenas como **roadmap** da plataforma, sustentado pelo que de fato é inovador: **o arquivo nunca sai do dispositivo.**
