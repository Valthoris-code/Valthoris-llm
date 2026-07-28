⁣
VALTHORIS
INTELLIGENCE • PREVENTION • PROTECTION
CYBERSECURITY • AI • BLOCKCHAIN
A nova geração de Inteligência Artificial para prevenção
de fraude
Status
Licença
Idiomas

📑 Índice
1. Sobre a Valthoris
2. A Origem da Palavra "Valthoris"
3. Porque Nasceu a Valthoris
4. Missão, Visão e Valores
5. Filosofia
6. O Escudo 7. Arquitetura
8. Inteligência Artificial
9. Dataset
10. Módulos da Plataforma
11. Segurança e Conformidade
12. Roadmap
13. Estrutura do Projeto
14. Quick Start
15. Métricas-Alvo
16. Exemplos
17. Contribuições
18. Licença
19. Autor e Créditos
🌍 Sobre a Valthoris
A Valthoris é uma plataforma de Inteligência Artificial
concebida para prevenir fraude,
phishing, engenharia social e outras ameaças digitais
antes de causarem danos.
O primeiro componente construído  e o foco atualdeste repositório é um modelo declassificação de texto (baseado em Transformer)
capaz de identificar mensagens, emails e
comunicações fraudulentas em português e inglês. A visão de mais longo prazo é integrar este modelo
numa plataforma mais ampla, construída
sobre Internet Computer Protocol (ICP), com
módulos de deteção em tempo real, threat
intelligence e um centro de comando administrativo
— descrita em detalhe no
Master Blueprint.
Nota de transparência: este repositório contém,
hoje, o pipeline de dados, o tokenizer
e a arquitetura do modelo de classificação. O
treino do modelo e os restantes módulos da
plataforma estão documentados como visão e
roadmap, não como funcionalidades já
implementadas.
A secção Estrutura do Projeto reflete o estado real
do código.
🌌 A Origem da Palavra "Valthoris"
Valthoris é uma palavra original, criada por Hermínio
Coragem.
Não existe em nenhum dicionário tradicional.
Não deriva de nenhuma empresa existente.
Não foi copiada.
Não foi adaptada. Foi concebida para representar uma nova visão sobre
inteligência artificial, cibersegurança e
proteção digital um neologismo desenvolvido
especificamente para identificar uma plataforma
cuja missão é prevenir fraude, proteger pessoas e
criar confiança no mundo digital.
A construção do nome
Embora seja uma palavra original, a sua estrutura
transmite conceitos muito claros.
VAL
O prefixo Val representa simultaneamente vários
pilares fundamentais:
Validação — de identidades, transações e
informação.
Valor — protegendo pessoas, património e ativos
digitais.
Valentia — enfrentando ameaças tecnológicas e
fraude organizada.
Verdade — promovendo informação fiável e
verificável.
Na Valthoris, tudo começa pela validação. Sem
validação não existe confiança.
THORIS O sufixo Thoris foi criado para transmitir:
Robustez
Autoridade
Segurança
Resistência
Confiança
A sua sonoridade recorda, de forma inconsciente,
conceitos associados à força e proteção,
criando uma identidade memorável sem depender de
qualquer personagem ou marca existente.
Representa um sistema sólido, preparado para resistir
às ameaças digitais modernas.
O significado completo
Quando os dois elementos se unem, nasce
VALTHORIS — uma palavra que representa:
Inteligência
Prevenção
Proteção
Não é apenas um nome. É uma promessa.
💡 Porque Nasceu a Valthoris A Valthoris nasceu da experiência direta do seu autor
no desenvolvimento do Antifraudapp,
uma aplicação de deteção e reporte de fraude para o
mercado português.
Ao longo desse trabalho tornou-se claro que:
Milhões de pessoas continuam vulneráveis a
fraude e phishing todos os dias.
A prevenção é sempre preferível à reparação de
danos já causados.
A Inteligência Artificial pode e deve ser usadapara proteger pessoas, não apenas paraautomatizar tarefas.
A Valthoris é a continuação natural dessa missão desta vez construída como um projetopróprio, do zero, com uma visão mais ampla e um
nome próprio.
🎯 Missão, Visão e Valores
Missão
Desenvolver uma plataforma de Inteligência Artificial
capaz de prevenir fraude, identificar
riscos digitais e proteger pessoas, empresas e
instituições através de tecnologias modernas,
seguras e — a prazo — descentralizadas. Visão
Ser uma referência em Inteligência Artificial aplicada
à prevenção da fraude e proteção
digital, contribuindo para um ecossistema
tecnológico mais seguro, transparente e acessível.
Valores
Valor Significado
Ética
A IA deve agir de forma justa e
responsável
Transparência
Decisões explicáveis, não
caixas-negras
Privacidade Um direito, não uma opção
Segurança
Por defeito, em cada camada
do sistema
Responsabilidade
Consciência do impacto real
nas pessoas
Inovação
Melhoria contínua e
aprendizagem constante
Confiança
Conquistada através da
validação, nunca presumida Manifesto
A melhor fraude é aquela que nunca chega a
acontecer.
A tecnologia deve proteger pessoas antes de
causar danos.
A Inteligência Artificial deve trabalhar de forma
ética, transparente e responsável.
A privacidade é um direito.
A confiança conquista-se através da validação.
🛡️ Filosofia
Lema oficial: INTELLIGENCE • PREVENTION •
PROTECTION
Assinatura tecnológica: CYBERSECURITY • AI •
BLOCKCHAIN
A Valthoris assenta em dois princípios de engenharia
que orientam todas as decisões técnicas:
Security by Design — a segurança não é uma
camada adicionada no fim, é parte da
arquitetura desde a primeira linha de código.
Privacy by Design — dados pessoais são tratados
com o mínimo necessário, protegidos por
defeito, nunca expostos por omissão. 🛡️ O Escudo
O logótipo da Valthoris representa diretamente a sua
missão:
O escudo representa a proteção — cada utilizador
protegido reforça esse escudo, cada
fraude evitada fortalece a confiança.
O "V" simboliza Valthoris.
O símbolo central (infinito) representa a Internet
Computer Protocol (ICP), a
infraestrutura descentralizada sobre a qual a
plataforma pretende ser construída.
O conjunto simboliza uma proteção inteligente,
moderna e preparada para o futuro.
🏗️ Arquitetura
Visão de alto nível (alvo de longo prazo)
Frontend (React / Web / Mobile)
 ↓
Backend / API Gateway
 ↓
Canisters ICP ←→ Supabase (Postgres,
Auth)
 ↓
Modelo de IA (Valthoris) ↓
Threat Intelligence / APIs externas
Arquitetura do modelo de IA (implementada)
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
Output: Probabilidades [Legítimo | Fraude |
Phishing | Spam]
Componentes:
Tokenizer: BPE com 16.000 tokens, treinado em
corpus bilingue (PT/EN)
Encoder: 6 camadas de Transformer com atenção
multi-head (8 heads)
Classificador: cabeça de classificação multi-
classe
Parâmetros: ~30–50M Tecnologias previstas
Camada Tecnologia
IA / ML
Python, PyTorch, Tokenizers,
scikit-learn
Backend
descentralizado
Internet Computer Protocol,
Canisters, Motoko
Backend
centralizado
Supabase (PostgreSQL,
Auth, Storage)
Frontend React, TypeScript
Mobile Capacitor (Android / iOS)
CI/CD GitHub Actions, Docker
🧠 Inteligência Artificial
O núcleo da Valthoris é um modelo de classificação
de texto que aprende a distinguir entre
comunicações legítimas e fraudulentas.
Filosofia: um modelo pequeno e especializado,
focado numa tarefa bem definida
(classificação de fraude/phishing), em vez de um
modelo generalista de grande escala. Pipeline: preparação de dados → treino de
tokenizer → treino do modelo → avaliação →
inferência.
Objetivo de segurança da IA: guardrails contra
manipulação de input e explicabilidade
das classificações (por que motivo uma
mensagem foi marcada como suspeita).
📊 Dataset
O pipeline prepara dados públicos EN/PT a partir de
um ficheiro CSV remoto:
Fonte: mnarrissa/Multilingual-Spam-
Classification ( data-augmented.csv ,
descarregado
por URL direta)
Cache local do CSV bruto:
data/raw/multilingual_spam.csv
Idiomas: Inglês ( text ) e Português ( text_pt )
Labels de saída:
Label Significado
0 Legítimo (ham)
1 Phishing Label Significado
2 Spam
3 Fraude
Mapeamento de labels: ham → 0 (legítimo); spam
→ classificado por regras
(phishing > fraude > spam).
Parâmetro de limite: --max-samples-per-language
(default: 10000 , <=0 sem limite)
Outputs do prepare_data.py :
data/dataset.csv — colunas: text , label ,
label_name , language , source
data/corpus.txt — corpus para treino do
tokenizer (linhas deduplicadas por hash)
🧩 Módulos da Plataforma
Os módulos abaixo representam a visão de longo
prazo da plataforma Valthoris. Nenhum
destes módulos tem código implementado neste
repositório — o trabalho atual concentra-se no
modelo de classificação de texto. Consulta o
Roadmap e o
Master Blueprint para o plano de implementação. Módulo Descrição
AutoShield
Proteção em tempo real contra
SMS, chamadas, emails, URLs e QR
codes suspeitos
Radar Global
Monitorização mundial de fraudes
reportadas pela comunidade
Scanner
Universal
Análise de mensagens, ficheiros,
imagens e vídeos
Threat
Intelligence
Integração de fontes públicas de
ameaças conhecidas
Crypto
Intelligence
Análise de carteiras e contratos de
criptomoedas
Safe Location
Partilha de localização segura
entre utilizadores de confiança
Identity /
Lookup
Reputação e verificação de
contactos, empresas e domínios
Community
Denúncias e colaboração entre
utilizadores
Dashboard Centro de comando administrativo
🔐 Segurança e Conformidade Princípios de engenharia adotados desde o início do
projeto:
Security by Design e Privacy by Design
Zero Trust como modelo de referência para
acessos futuros
Boas práticas alinhadas com OWASP
Conformidade legal a considerar (à medida que a
plataforma crescer, particularmente na
área de pagamentos e dados pessoais):
RGPD (proteção de dados pessoais, UE)
NIS2 (segurança de redes e sistemas de
informação, UE)
AI Act (regulação europeia de Inteligência
Artificial)
Nota: processar pagamentos com dinheiro real
(cartão ou criptomoedas) implica licenciamento
de instituição de pagamento e obrigações de
conformidade (AML/KYC) que vão além do
desenvolvimento técnico — este ponto está
sinalizado como pré-requisito legal no roadmap de
Pagamentos.
🗺️ Roadmap Horizonte estimado: ~6 meses para o conjunto do
plano abaixo. As fases mais avançadas
(pagamentos, aplicações móveis, expansão
internacional) não têm data definida.
[x] Fundação: nome, marca, domínio, repositório
[x] Tokenizer e arquitetura do modelo (código)
[ ] Preparação de dados executada e validada
[ ] Treino do modelo de classificação
[ ] Avaliação e ajuste do modelo
[ ] Inferência em tempo real
[ ] Centro de Comando (dashboard administrativo)
[ ] Módulos (AutoShield, Radar Global, Scanner
Universal, ...)
[ ] Aplicações móveis (Android / iOS)
[ ] Pagamentos (sujeito a compliance legal)
Para o detalhe completo, tarefa a tarefa, consulta o
Master Checklist.
📁 Estrutura do Projeto
Valthoris-llm/
├── data/
│ ├── .gitkeep
│ ├── dataset.csv #
Dataset normalizado para treino │ ├── corpus.txt # Corpus
para treino do tokenizer
│ └── raw/
│ └── multilingual_spam.csv # CSV
bruto em cache local
├── model/
│ ├── .gitkeep
│ └── architecture.py #
Arquitetura do transformer
├── tokenizer/
│ ├── .gitkeep
│ ├── train_tokenizer.py # Script
de treino do tokenizer
│ └── tokenizer.json #
Tokenizer treinado
├── docs/
│ ├── MASTER_BLUEPRINT.md # Visão
e arquitetura completa (documento vivo)
│ ├── MASTER_CHECKLIST.md #
Checklist detalhado de implementação
│ └── assets/
│ └── valthoris-logo.png #
Logótipo oficial
├── prepare_data.py #
Descarregar e preparar dados
├── train.py # Script
de treino
├── evaluate.py #
Avaliação do modelo
├── inference.py #
Inferência em tempo real
├── requirements.txt #
Dependências └── README.md # Este
ficheiro
🚀 Quick Start
1. Clonar o repositório
git clone https://github.com/Valthoris-
code/Valthoris-llm.git
cd Valthoris-llm
2. Instalar dependências
pip install -r requirements.txt
3. Preparar dados
python prepare_data.py
Descarrega e prepara o CSV bilingue EN/PT: guarda o
CSV bruto em
data/raw/multilingual_spam.csv , normaliza texto
e labels, e gera data/dataset.csv e
data/corpus.txt .
Exemplo com parâmetros: python prepare_data.py --dataset-output
data/dataset.csv --corpus-output
data/corpus.txt --max-samples-per-language
10000
4. Treinar o tokenizer
python tokenizer/train_tokenizer.py
Treina um tokenizer BPE com 16K tokens (tokens
especiais [PAD] , [UNK] , [BOS] , [EOS] ) e
guarda em tokenizer/tokenizer.json .
5. Treinar o modelo
python train.py
Treina o classificador com otimizador AdamW, loss
de entropia cruzada, 10–20 épocas
(configurável) e batch size 32.
6. Avaliar o modelo
python evaluate.py
Avalia em conjunto de teste: acurácia, precisão, recall,
F1 e matriz de confusão. 7. Fazer inferência
python inference.py --text "Clique aqui
para confirmar sua senha: https://phishing-
link.com"
Classifica uma mensagem em tempo real, devolvendo
probabilidade, nível de confiança e
recomendação.
📈 Métricas-Alvo
Objetivos de performance após o treino — ainda
não medidos, dado que o treino do modelo
ainda está por concluir.
Métrica Alvo
Acurácia > 95%
Precisão (Fraude) > 92%
Recall (Fraude) > 90%
F1-Score > 91%
ROC-AUC > 0.98
O modelo deve reconhecer padrões como: Phishing (roubo de credenciais)
URLs maliciosas e encurtadas
Solicitações urgentes (engenharia social)
Pedidos de informação pessoal
Ofertas "boas demais para ser verdade"
Erros ortográficos e linguísticos suspeitos
Falsificação de remetentes
📝 Exemplos
Email legítimo
Input: "Olá, confirme seu pedido #12345 aqui:
https://amazon.com/orders/12345"
Output esperado: Legítimo (alta confiança)
Phishing
Input: "Clique AGORA para confirmar sua senha
bancária: https://bit.ly/x7k9p"
Output esperado: Phishing (alta confiança)
Spam
Input: "Ganhe $$$$ RÁPIDO!!! Investimento
garantido, clique aqui!!!"
Output esperado: Spam (alta confiança) 🤝 Contribuições
Contribuições são bem-vindas.
1. Faz fork do repositório
2. Cria uma branch para a tua feature ( git
checkout -b feature/nome )
3. Faz commits claros e descritivos
4. Faz push e abre um Pull Request
📄 Licença
Este projeto está sob licença MIT. Consulta o ficheiro
LICENSE para mais detalhes.
👤 Autor e Créditos
Autor: Hermínio Coragem — idealizador e criador da
Valthoris.
Todas as decisões de arquitetura, visão, estratégia e
implementação pertencem ao autor do
projeto.
Assistência técnica: durante o desenvolvimento
foram utilizadas ferramentas de Inteligência
Artificial — Claude (Anthropic), ChatGPT (OpenAI) e Gemini (Google) — como apoio técnico,
revisão documental, brainstorming e aceleração do
desenvolvimento.

INTELLIGENCE • PREVENTION • PROTECTION
Última atualização: Julho 2026 · Estado: Em
desenvolvimento 🚀