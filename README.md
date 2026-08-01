<div align="center">

<img src="documentos/valthoris-logo.png" alt="Valthoris Logo" width="280"/>

# VALTHORIS

**INTELLIGENCE • PREVENTION • PROTECTION**<br>
*CYBERSECURITY • AI • BLOCKCHAIN*

<p align="center">
  A nova geração de Inteligência Artificial para prevenção de fraudes, phishing e engenharia social.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Em%20Desenvolvimento%20Ativo-yellow.svg" alt="Status" />
  <img src="https://img.shields.io/badge/Licenca-MIT-blue.svg" alt="Licença" />
  <img src="https://img.shields.io/badge/Idiomas-PT%20%7C%20EN-green.svg" alt="Idiomas" />
  <img src="https://img.shields.io/badge/Plataforma-ICP%20%7C%20Supabase-blueviolet.svg" alt="Plataforma" />
</p>

<!-- Elemento Animado de Fundo / Separador em Movimento -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=0,11,12,24,30,00E5FF,7000FF&height=120&section=header" width="100%" alt="Onda em Movimento"/>

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

