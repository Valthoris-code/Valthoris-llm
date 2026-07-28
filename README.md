<div align="center">

<img src="documentos/valthoris-logo.png" alt="Valthoris Logo" width="300"/>

# VALTHORIS

**INTELLIGENCE • PREVENTION • PROTECTION**
*CYBERSECURITY • AI • BLOCKCHAIN*

A nova geração de Inteligência Artificial para prevenção de fraudes, phishing e engenharia social.

![Status](https://img.shields.io/badge/Status-Em%20Desenvolvimento%20Ativo-yellow.svg)
![Licenca](https://img.shields.io/badge/Licenca-MIT-blue.svg)
![Idiomas](https://img.shields.io/badge/Idiomas-PT%20%7C%20EN-green.svg)
![Plataforma](https://img.shields.io/badge/Plataforma-ICP%20%7C%20Supabase-blueviolet.svg)

</div>

---

> ℹ️ **Nota sobre este índice:** os links abaixo usam âncoras HTML explícitas (`<a name="...">`)
> em vez de depender da geração automática de âncoras do GitHub a partir de títulos com emojis —
> essa é precisamente a causa mais comum de um índice que não "salta" para a secção certa.
> Se ainda assim algum link não saltar corretamente, é sinal de que o nome da âncora ficou
> dessincronizado da secção — compara o `href="#nome"` do índice com o `<a name="nome">` da
> secção correspondente.

## 📌 Índice

1. [Visão Geral & Apresentação](#visao-geral)
2. [A Origem da Palavra "Valthoris"](#origem-palavra)
3. [Contexto & Motivação](#contexto-motivacao)
4. [Missão, Visão e Valores](#missao-visao-valores)
5. [Manifesto](#manifesto)
6. [Filosofia & O Simbolismo do Escudo](#filosofia-escudo)
7. [Arquitetura do Ecossistema](#arquitetura)
8. [Inteligência Artificial & Motor de Classificação](#inteligencia-artificial)
9. [Dataset](#dataset)
10. [Módulos da Plataforma Valthoris](#modulos)
11. [Segurança, Conformidade e Normativas Europeias](#seguranca-conformidade)
12. [Roadmap Global do Projeto](#roadmap)
13. [Estrutura do Repositório](#estrutura)
14. [Tipos de Ameaças e Crime Digital Cobertos](#ameacas-cobertas)
15. [Guia de Execução Rápida (Quick Start)](#quick-start)
16. [Métricas-Alvo de Desempenho](#metricas-alvo)
17. [Exemplos Práticos de Inferência](#exemplos)
18. [Modelo de Contribuição e Licenciamento](#contribuicoes-licenca)
19. [Autor e Créditos](#autor-creditos)

---

<a name="visao-geral"></a>
## 🌍 Visão Geral & Apresentação

A **Valthoris** é uma plataforma de Inteligência Artificial desenhada com o propósito
explícito de atuar na **prevenção proativa** de fraudes digitais, tentativas de *phishing*,
manipulação por engenharia social e ameaças emergentes no ciberespaço.

Diferente das abordagens reativas tradicionais, a Valthoris foca-se na interceção e análise de
ameaças **antes** que estas causem danos financeiros, operacionais ou reputacionais a
cidadãos, instituições e empresas.

O repositório `Valthoris-llm` alberga o motor central de Inteligência Artificial: um modelo de
linguagem especializado, baseado na arquitetura *Transformer*, otimizado para o processamento
e classificação de texto multilingue em tempo real.

> **Nota de transparência sobre o estado atual:** este repositório contém, hoje, o pipeline de
> dados, o tokenizer e a arquitetura do modelo de classificação — já escritos e prontos a
> correr. O **treino do modelo ainda não foi executado**, e os módulos descritos mais abaixo
> (AutoShield, Radar Global, Canisters ICP próprios, etc.) representam a **visão do projeto**,
> não funcionalidades já implementadas. A secção [Estrutura do Repositório](#estrutura) e o
> [Roadmap](#roadmap) refletem o estado real do código a cada momento.

---

<a name="origem-palavra"></a>
## 🏛️ A Origem da Palavra "Valthoris"

A palavra **Valthoris** é um neologismo original criado por **Hermínio Coragem**.

- Não existe em nenhum dicionário tradicional.
- Não deriva de nenhuma empresa existente.
- Não foi copiada.
- Não foi adaptada.

Foi concebida para representar uma nova visão sobre inteligência artificial, cibersegurança e
proteção digital — desenvolvida especificamente para identificar uma plataforma cuja missão é
prevenir fraude, proteger pessoas e criar confiança no mundo digital.

Ao longo do tempo, a palavra Valthoris passará a representar uma filosofia de proteção baseada
em Inteligência Artificial, Blockchain e Internet Computer Protocol (ICP).

### A construção do nome

Embora seja uma palavra original, a sua estrutura transmite conceitos muito claros.

#### VAL

O prefixo *Val* representa simultaneamente quatro pilares operacionais:

- **Validação** — de identidades, transações e integridade da informação.
- **Valor** — proteção de ativos, património e infraestruturas digitais.
- **Valentia** — atitude firme no combate ao cibercrime organizado.
- **Verdade** — promoção de ecossistemas de informação fiáveis e auditáveis.

Na Valthoris, tudo começa pela validação. Sem validação não existe confiança.

#### THORIS

O sufixo *Thoris* foi criado para transmitir:

- Robustez
- Autoridade
- Segurança
- Resistência
- Confiança

A sua sonoridade recorda, de forma inconsciente, conceitos associados à força e proteção,
criando uma identidade memorável sem depender de qualquer personagem ou marca existente.
Representa um sistema sólido, preparado para resistir às ameaças digitais modernas.

### O significado completo

Quando os dois elementos se unem, nasce **VALTHORIS** — uma palavra que representa:

- Inteligência
- Prevenção
- Proteção

Não é apenas um nome. **É uma promessa.**

---

<a name="contexto-motivacao"></a>
## 💡 Contexto & Motivação

A Valthoris nasce da evolução da experiência direta no desenvolvimento de sistemas de segurança
digital — nomeadamente do projeto inicial **Antifraudapp**, uma aplicação de deteção e reporte
de fraude para o mercado português.

A análise dessa experiência revelou três constatações centrais:

1. **Vulnerabilidade sistémica** — cidadãos e instituições enfrentam diariamente vetores de
   ataque cada vez mais sofisticados, impulsionados por automação maliciosa.
2. **Superioridade da prevenção** — a resposta a incidentes e a recuperação de prejuízos
   pós-fraude são dispendiosas e frequentemente ineficazes. A prevenção é a única defesa
   verdadeiramente sustentável.
3. **Sinergia tecnológica** — a combinação entre Inteligência Artificial (para análise de
   contexto) e Blockchain/ICP (para descentralização e imutabilidade) oferece um caminho
   promissor para segurança ativa.

A Valthoris é a continuação natural dessa missão — desta vez construída como um projeto
próprio, do zero, com uma visão mais ampla e um nome próprio.

---

<a name="missao-visao-valores"></a>
## 🎯 Missão, Visão e Valores

### Missão

Desenvolver e disponibilizar uma plataforma de Inteligência Artificial capaz de antecipar e
neutralizar fraudes digitais, garantindo a proteção de cidadãos, empresas e organismos públicos
através de tecnologias modernas, seguras e — a prazo — descentralizadas.

### Visão

Consolidar-se como uma referência em Inteligência Artificial aplicada à prevenção da fraude e
proteção digital, contribuindo para um ecossistema tecnológico mais seguro, transparente e
acessível.

### Valores Fundamentais

| Valor | Definição Operacional |
| :--- | :--- |
| **Ética & Imparcialidade** | Algoritmos desenhados sem vieses maliciosos, priorizando o interesse e a proteção coletiva. |
| **Transparência Auditável** | Processos de decisão explicáveis, evitando arquiteturas opacas de "caixa-negra". |
| **Privacidade Universal** | Cumprimento rigoroso da privacidade enquanto direito fundamental por defeito (*Privacy by Design*). |
| **Segurança Ativa** | Integração contínua do princípio *Security by Design* em todas as camadas do código. |
| **Valentia** | Atitude firme e proativa perante ameaças e fraude organizada. |
| **Confiança Criptográfica** | Confiança construída sobre validação técnica, não presumida. |
| **Inovação Contínua** | Melhoria constante do modelo, da arquitetura e dos processos. |

---

<a name="manifesto"></a>
## 📜 Manifesto

> A melhor fraude é aquela que nunca chega a acontecer.
>
> A tecnologia deve proteger pessoas antes de causar danos.
>
> A Inteligência Artificial deve trabalhar de forma ética, transparente e responsável.
>
> A privacidade é um direito.
>
> A confiança conquista-se através da validação.

---

<a name="filosofia-escudo"></a>
## 🛡️ Filosofia & O Simbolismo do Escudo

**Lema oficial:** `INTELLIGENCE • PREVENTION • PROTECTION`
**Assinatura tecnológica:** `CYBERSECURITY • AI • BLOCKCHAIN`

A Valthoris assenta em dois princípios de engenharia que orientam todas as decisões técnicas:

- **Security by Design** — a segurança não é uma camada adicionada no fim, é parte da
  arquitetura desde a primeira linha de código.
- **Privacy by Design** — dados pessoais são tratados com o mínimo necessário, protegidos por
  defeito, nunca expostos por omissão.

### Simbolismo do logótipo

- **O escudo exterior** representa a proteção coletiva e ativa — cada utilizador protegido
  reforça esse escudo, cada fraude evitada fortalece a confiança.
- **O "V" central** afirma a identidade e a autoridade da marca Valthoris.
- **O símbolo de infinito ao centro** representa a Internet Computer Protocol (ICP), a
  infraestrutura descentralizada sobre a qual a plataforma pretende ser construída,
  simbolizando operacionalidade ininterrupta, transparência e resiliência.

O conjunto simboliza uma proteção inteligente, moderna e preparada para o futuro.

---

<a name="arquitetura"></a>
## 🏗️ Arquitetura do Ecossistema

### Visão de alto nível (alvo de longo prazo)

```
        Frontend (React / Web / Mobile)
                    ↓
           Backend / API Gateway
                    ↓
   Canisters ICP  ←→  Supabase (Postgres, Auth)
                    ↓
          Modelo de IA (Valthoris)
                    ↓
     Threat Intelligence / APIs externas
```

### Arquitetura do modelo de IA (implementada em código)

```
Input Text
    ↓
Tokenizer BPE (16K tokens)
    ↓
Token Embeddings (512D)
    ↓
Positional Encoding
    ↓
6x Transformer Blocks (8 heads, 512D)
    ↓
Classification Head (Softmax)
    ↓
Output: Probabilidades [Legítimo | Phishing | Spam | Fraude]
```

**Componentes:**

- **Tokenizer:** BPE com 16.000 tokens, treinado em corpus bilingue (PT/EN)
- **Encoder:** 6 camadas de Transformer com atenção multi-head (8 heads)
- **Classificador:** cabeça de classificação multi-classe
- **Parâmetros:** ~30–50M

### Stack tecnológico previsto

| Camada | Tecnologia |
|---|---|
| Inteligência Artificial | Python, PyTorch, Tokenizers, scikit-learn, Hugging Face Transformers |
| Camada relacional & utilizadores | Supabase (PostgreSQL, Auth, Row Level Security, Storage, Realtime) |
| Camada descentralizada | Internet Computer Protocol (ICP), Canisters em Motoko / Rust |
| Interface | React, TypeScript |
| Mobile | Capacitor (Android / iOS) |
| CI/CD | GitHub Actions, Docker |

**Estado atual da infraestrutura:**

- ✅ Repositório GitHub organizado (`Valthoris-code/Valthoris-llm`)
- ✅ Projeto Supabase criado e ligado (plano gratuito)
- 🟡 Canisters ICP existentes (herdados do Antifraudapp) — a documentar e adaptar
- ⬜ Canisters ICP novos específicos da Valthoris — por construir
- ⬜ Frontend / aplicações móveis — por iniciar

---

<a name="inteligencia-artificial"></a>
## 🧠 Inteligência Artificial & Motor de Classificação

O núcleo deste repositório é um modelo Transformer compacto, pensado para inferência de baixa
latência sobre dados de comunicação (mensagens, emails, SMS).

**Filosofia de design:** um modelo pequeno e especializado numa tarefa bem definida —
classificação de fraude/phishing — em vez de um modelo generalista de grande escala. Esta
escolha torna o projeto viável para desenvolvimento e treino individual, com custos de
computação controlados.

**Pipeline completo:**

```
prepare_data.py  →  train_tokenizer.py  →  train.py  →  evaluate.py  →  inference.py
```

**Mapeamento de classes de saída:**

| Label | Classe | Significado |
|---|---|---|
| `0` | **Legítimo (Ham)** | Comunicação segura, sem indicadores de risco |
| `1` | **Phishing** | Tentativa de extração fraudulenta de credenciais ou dados sensíveis |
| `2` | **Spam** | Conteúdo não solicitado ou comercialmente agressivo |
| `3` | **Fraude / Engenharia Social** | Esquemas financeiros, falsificação de identidade ou burla explícita |

**Objetivos de segurança da própria IA:**

- Guardrails contra manipulação de input (ex: tentativas de enganar o classificador)
- Explicabilidade das classificações — justificar por que motivo uma mensagem foi marcada
  como suspeita, em vez de devolver apenas um número

---

<a name="dataset"></a>
## 📊 Dataset

O pipeline prepara dados públicos EN/PT a partir de um ficheiro CSV remoto:

- **Fonte:** `mnarrissa/Multilingual-Spam-Classification` (`data-augmented.csv`, descarregado
  por URL direta)
- **Cache local do CSV bruto:** `data/raw/multilingual_spam.csv`
- **Idiomas:** Inglês (`text`) e Português (`text_pt`)

**Mapeamento de labels:** `ham` → `0` (legítimo); `spam` → classificado por regras
(phishing > fraude > spam).

**Parâmetro de limite:** `--max-samples-per-language` (default: `10000`, `<=0` sem limite)

**Outputs do `prepare_data.py`:**

- `data/dataset.csv` — colunas: `text`, `label`, `label_name`, `language`, `source`
- `data/corpus.txt` — corpus para treino do tokenizer (linhas deduplicadas por hash)

---

<a name="modulos"></a>
## 🛠️ Módulos da Plataforma Valthoris

> ⚠️ Os módulos abaixo representam a **visão de longo prazo** da plataforma. Nenhum tem código
> implementado neste repositório — o trabalho atual concentra-se exclusivamente no modelo de
> classificação de texto descrito acima. Consulta o [Roadmap](#roadmap) para o plano real de
> implementação.

| Módulo | Descrição |
|---|---|
| **AutoShield** | Proteção contínua em tempo real: SMS, chamadas, emails, URLs e QR codes suspeitos |
| **Radar Global** | Sistema comunitário e institucional de mapeamento e reporte global de ameaças |
| **Scanner Universal** | Análise instantânea de ficheiros, código QR, imagens, documentos e hiperligações |
| **Threat Intelligence** | Integração de fontes públicas de ameaças conhecidas (phishing, malware, spam) |
| **Crypto Intelligence** | Análise de risco de carteiras, contratos inteligentes e transações em blockchain |
| **Safe Location** | Rede colaborativa de partilha de localização segura entre utilizadores de confiança |
| **Identity / Lookup** | Reputação e verificação de contactos, empresas e domínios |
| **Community** | Denúncias, reputação e colaboração entre utilizadores |
| **Dashboard / Centro de Comando** | Painel administrativo para monitorização, auditoria de logs e gestão operacional |

---

<a name="seguranca-conformidade"></a>
## 🔐 Segurança, Conformidade e Normativas Europeias

Princípios de engenharia adotados desde o início do projeto:

- **Security by Design** e **Privacy by Design**
- **Zero Trust** como modelo de referência — nenhuma comunicação é assumida como confiável
  sem validação prévia
- Boas práticas alinhadas com **OWASP**

**Conformidade legal a considerar** à medida que a plataforma crescer:

| Norma | Âmbito |
|---|---|
| **RGPD (GDPR)** | Proteção de dados pessoais na UE |
| **AI Act** | Regulação europeia de sistemas de Inteligência Artificial |
| **NIS2** | Segurança de redes e sistemas de informação, UE |
| **DORA** | Resiliência operacional digital (setor financeiro) |
| **eIDAS** | Identidade digital europeia |

> ⚠️ **Nota importante:** processar pagamentos com dinheiro real (cartão ou criptomoedas)
> implica licenciamento de instituição de pagamento e obrigações de conformidade (AML/KYC) que
> vão muito além do desenvolvimento técnico. Este ponto está sinalizado como pré-requisito
> legal — não uma simples tarefa de programação — no roadmap de Pagamentos.

---

<a name="roadmap"></a>
## 🗺️ Roadmap Global do Projeto

> Horizonte estimado: **~6 meses** para o conjunto do plano abaixo. As fases mais avançadas
> (pagamentos, aplicações móveis, expansão internacional) não têm data definida.

- [x] **Fase 1 — Fundação, Marca e Registo**
  Nome, logótipo, domínio (`valthoris.com`), repositório GitHub organizado.
- [x] **Fase 2 — Arquitetura & Tokenizer (código)**
  Especificação da arquitetura Transformer; tokenizer BPE escrito.
- [🟡] **Fase 3 — Dados, Treino e Infraestrutura de Base**
  - ✅ Supabase ligado ao projeto
  - ✅ Script de preparação de dados (`prepare_data.py`) escrito
  - ⬜ Dataset gerado e validado (execução ainda por fazer)
  - ⬜ Tokenizer treinado (execução ainda por fazer)
  - ⬜ Modelo treinado e avaliado
- [ ] **Fase 4 — Canisters ICP**
  Adaptação dos canisters herdados do Antifraudapp e desenvolvimento de canisters novos
  específicos da Valthoris.
- [ ] **Fase 5 — Módulos da Plataforma**
  AutoShield, Radar Global, Scanner Universal, Threat Intelligence, etc.
- [ ] **Fase 6 — Aplicações e Apresentação Institucional**
  Aplicações Android/iOS e apresentação a parceiros, instituições e universidades.
- [ ] **Fase 7 — Pagamentos** *(sujeito a compliance legal — ver secção de Segurança)*

Para o detalhe completo, tarefa a tarefa, consulta o
**[Master Checklist](docs/MASTER_CHECKLIST.md)** e o
**[Master Blueprint](docs/MASTER_BLUEPRINT.md)**.

---

<a name="estrutura"></a>
## 📂 Estrutura do Repositório

```
Valthoris-llm/
├── data/
│   ├── .gitkeep
│   ├── dataset.csv                # Dataset normalizado para treino (gerado)
│   ├── corpus.txt                 # Corpus para treino do tokenizer (gerado)
│   └── raw/
│       └── multilingual_spam.csv  # CSV bruto em cache local
├── model/
│   ├── .gitkeep
│   └── architecture.py            # Arquitetura do transformer
├── tokenizer/
│   ├── .gitkeep
│   ├── train_tokenizer.py         # Script de treino do tokenizer
│   └── tokenizer.json             # Tokenizer treinado (gerado)
├── docs/
│   ├── MASTER_BLUEPRINT.md        # Visão e arquitetura completa (documento vivo)
│   ├── MASTER_CHECKLIST.md        # Checklist detalhado de implementação
│   ├── SPECIFICATION/             # Especificação técnica formal
│   ├── architecture/              # Documentação de arquitetura (backend, frontend, ICP, Supabase)
│   ├── modules/                   # Documentação de cada módulo futuro
│   └── vision/                    # Visão de longo prazo
├── documentos/
│   └── valthoris-logo.png         # Logótipo oficial
├── prepare_data.py                # Descarregar e preparar dados
├── train.py                       # Script de treino
├── evaluate.py                    # Avaliação do modelo
├── inference.py                   # Inferência em tempo real
├── requirements.txt               # Dependências
└── README.md                      # Este ficheiro
```

---

<a name="quick-start"></a>
## 🚀 Guia de Execução Rápida (Quick Start)

### 1. Clonar o repositório e preparar o ambiente

```bash
git clone https://github.com/Valthoris-code/Valthoris-llm.git
cd Valthoris-llm
pip install -r requirements.txt
```

### 2. Preparar os dados

```bash
python prepare_data.py --max-samples-per-language 10000
```

Descarrega e prepara o CSV bilingue EN/PT: guarda o CSV bruto em
`data/raw/multilingual_spam.csv`, normaliza texto e labels, e gera `data/dataset.csv` e
`data/corpus.txt`.

### 3. Treinar o tokenizer

```bash
python tokenizer/train_tokenizer.py
```

Treina um tokenizer BPE com 16K tokens (tokens especiais `[PAD]`, `[UNK]`, `[BOS]`, `[EOS]`) e
guarda em `tokenizer/tokenizer.json`.

### 4. Treinar o modelo

```bash
python train.py
```

Treina o classificador com otimizador AdamW, loss de entropia cruzada, 10–20 épocas
(configurável) e batch size 32.

### 5. Avaliar o modelo

```bash
python evaluate.py
```

Avalia em conjunto de teste: acurácia, precisão, recall, F1 e matriz de confusão.

### 6. Testar a inferência em tempo real

```bash
python inference.py --text "Urgente: a sua conta bancária requer validação imediata. Aceda ao link."
```

Classifica uma mensagem em tempo real, devolvendo probabilidade, nível de confiança e
recomendação.

---

<a name="ameacas-cobertas"></a>
## 🚨 Tipos de Ameaças e Crime Digital Cobertos

A ambição da Valthoris é combater o espectro completo do crime digital — não apenas phishing e spam. O modelo de classificação atual (4 classes: Legítimo, Phishing, Spam,
Fraude) é o primeiro passo técnico; os tipos de ameaça abaixo são o âmbito real que a
plataforma pretende cobrir à medida que os módulos forem sendo construídos (ver
Roadmap e Módulos).
Roadmap e Módulos).
Categoria
Exemplos concretos
Módulo responsável
Phishing & roubo de credenciais
Emails/SMS falsos de bancos, falsificação de sites, roubo de passwords
Motor de IA + AutoShield
Fraude financeira
Esquemas de investimento falsos, burlas de pagamento antecipado, falsificação de faturas (BEC)
Motor de IA + Threat Intelligence
Engenharia social
Pretexting, personificação de autoridade, urgência artificial
Motor de IA + AutoShield
Burla romântica (romance scam)
Perfis falsos, manipulação emocional para extorsão financeira
Radar Global + Community
Fraude de suporte técnico
Falsos técnicos que pedem acesso remoto ao dispositivo
AutoShield
Roubo de identidade
Uso indevido de dados pessoais para abrir contas ou crédito
Identity / Lookup
Fraude com criptomoedas
Carteiras falsas, rug pulls, contratos inteligentes maliciosos
Crypto Intelligence
SIM swap / sequestro de número
Portabilidade fraudulenta de número de telefone
Threat Intelligence
Smishing / vishing
SMS e chamadas fraudulentas
AutoShield
QR codes maliciosos (quishing)
Códigos QR que redirecionam para sites de phishing
Scanner Universal
Malware e ransomware
Ficheiros e anexos maliciosos
Scanner Universal + Threat Intelligence
Lojas online falsas
E-commerce fraudulento que não entrega produtos
Radar Global + Community
Deepfakes e conteúdo sintético
Áudio/vídeo manipulado para personificação
(roadmap de longo prazo)
Extorsão digital / sextortion
Ameaças de divulgação de conteúdo íntimo para extorsão
(roadmap de longo prazo — encaminhamento a autoridades)
Nota de responsabilidade: para categorias que envolvem risco direto à segurança física ou
psicológica das vítimas (extorsão, sextortion, ameaças), a Valthoris pretende funcionar como
ferramenta de deteção e encaminhamento para as autoridades competentes (ex: Polícia
Judiciária, em Portugal), não como substituto de intervenção policial ou jurídica.

🎯 Métricas-Alvo de Desempenho
Objetivos de performance após o treino — ainda não medidos, dado que o treino do modelo
ainda está por concluir.
Métrica
Alvo
Acurácia geral
> 95%
Precisão (Fraude/Phishing)
> 92%
Recall (Fraude/Phishing)
> 90%
F1-Score
> 91%
ROC-AUC
> 0.98
O modelo deve reconhecer padrões como:
Phishing (roubo de credenciais)
URLs maliciosas e encurtadas
Solicitações urgentes (engenharia social)
Pedidos de informação pessoal
Ofertas "boas demais para ser verdade"
Erros ortográficos e linguísticos suspeitos
Falsificação de remetentes

🔍 Exemplos Práticos de Inferência
Caso 1 — Phishing bancário
Texto: "Estimado cliente, o seu acesso ao serviço online expira hoje. Atualize os seus dados em https://seguranca-banco-online.net"
Classificação esperada: Phishing (alta confiança)
Caso 2 — Comunicação legítima
Texto: "A sua consulta na clínica está agendada para amanhã às 10:30. Para cancelar responda CANCELAR."
Classificação esperada: Legítimo / Ham (alta confiança)
Caso 3 — Spam
Texto: "Ganhe $$$$ RÁPIDO!!! Investimento garantido, clique aqui!!!"
Classificação esperada: Spam (alta confiança)
Caso 4 — Email legítimo com link
Texto: "Olá, confirme o seu pedido #12345 aqui: https://amazon.com/orders/12345"
Classificação esperada: Legítimo (alta confiança)

🤝 Modelo de Contribuição e Licenciamento
Contribuições, colaborações académicas, institucionais ou comunitárias são bem-vindas.
Faz fork do repositório
Cria uma branch para a tua feature (git checkout -b feature/nome)
Faz commits claros e descritivos
Faz push e abre um Pull Request
Este projeto está sob Licença MIT — consulta o ficheiro LICENSE para mais detalhes.

👤 Autor e Créditos
Autor, criador e arquiteto: Hermínio Coragem — idealizador da Valthoris, responsável por
todas as decisões de arquitetura, visão, estratégia e implementação do projeto.
Assistência técnica: durante o desenvolvimento foram utilizadas ferramentas de Inteligência
Artificial — Claude (Anthropic), ChatGPT (OpenAI) e Gemini (Google) — como apoio técnico,
revisão documental, brainstorming e aceleração do desenvolvimento.
�

VALTHORIS — INTELLIGENCE • PREVENTION • PROTECTION
Última atualização: Julho 2026 · Estado: Em desenvolvimento ativo 🚀
�
