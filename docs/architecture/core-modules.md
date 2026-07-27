# Valthoris Core Modules

**Versão:** 1.0.0

**Estado:** Em construção

## Módulos Principais

<<<<<<< HEAD
### 🤖 Valthoris AI
=======
### 🤖 Valthoris Chat
>>>>>>> origin/main
Assistente inteligente especializado em fraude digital.

### 🛡️ AutoShield
Proteção preventiva em tempo real.

### 🌍 Radar Global de Fraudes
Monitorização mundial de fraudes reportadas pela comunidade e por fontes públicas.

### 🔎 Scanner Universal
Análise de SMS, emails, URLs, QR Codes, IBAN, MB WAY, ficheiros, imagens, vídeos e áudio.

### 🧠 Threat Intelligence
Integração de APIs públicas e inteligência sobre ameaças.

### 👤 Identidade Digital
Pesquisa e reputação de contactos, empresas, emails e domínios.

### 💬 Conversation Intelligence
Análise de conversas e importação de chats.

### 💰 Crypto Intelligence
Análise de carteiras, tokens, contratos inteligentes e riscos.

### 📍 Safe Location
Localização segura e proteção familiar.

### 👥 Comunidade
Denúncias, reputação e colaboração entre utilizadores.

### 📊 Dashboard
Estatísticas, histórico e relatórios.

### ⚙️ Backend Core
Coordenação de todos os serviços.

### ☁️ Supabase
Autenticação, sincronização e armazenamento.

### ♾️ ICP
Canisters e serviços descentralizados.

### 🔌 API Gateway
Integração com APIs externas.

## Pipeline de Dados de Treino (CSV)

O pipeline atual de preparação de dados é executado offline pelo script `prepare_data.py` e gera os artefactos usados pelo tokenizer:

1. Download de um CSV público para `data/raw/multilingual_spam.csv`.
2. Leitura de `text` (EN) e `text_pt` (PT).
3. Normalização de texto e labels.
4. Escrita de `data/dataset.csv` com colunas `text,label,label_name,language,source`.
5. Geração de `data/corpus.txt` deduplicado para treino de tokenizer.

Este pipeline não utiliza datasets de enciclopédia e não faz parte da arquitetura online de inferência.