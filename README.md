# Valthoris: Assistente Inteligente de Deteção de Fraude e Phishing

**Valthoris** é um assistente de inteligência artificial baseado em Transformer que detecta fraude, phishing e tentativas de engenharia social em mensagens de texto, emails e comunicações.

## 🎯 Objetivo

Treinar um modelo de classificação multilingue (EN/PT) capaz de:
- **Identificar emails e mensagens fraudulentas** com alta precisão
- **Detectar tentativas de phishing** e roubo de credenciais
- **Reconhecer padrões de engenharia social** em comunicações
- **Funcionar em tempo real** com baixa latência
- **Suportar múltiplos idiomas** (inglês e português)

## 🏗️ Arquitetura

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
Classification Head (Sigmoid/Softmax)
    ↓
Output: Probabilidades [Legítimo | Fraude | Phishing | ...]
```

### Componentes

- **Tokenizer**: BPE com 16.000 tokens, treinado em corpus bilingue
- **Encoder**: 6 camadas de Transformer com atenção multi-head (8 heads)
- **Classificador**: Cabeça de classificação binária/multi-classe
- **Parâmetros**: ~30-50M

## 📊 Dataset

O pipeline prepara dados públicos EN/PT a partir de um ficheiro CSV remoto:

- **Fonte**: `mnarrissa/Multilingual-Spam-Classification` (`data-augmented.csv`, descarregado por URL direta)
- **Cache local do CSV bruto**: `data/raw/multilingual_spam.csv`
- **Idiomas**: Inglês (`text`) e Português (`text_pt`)
- **Labels de saída**:
  - `0`: Legítimo (`ham`)
  - `1`: Phishing
  - `2`: Spam
  - `3`: Fraude
- **Mapeamento de labels**:
  - `ham` → `0` (legítimo)
  - `spam` → classificado por regras (`phishing` > `fraude` > `spam`)
- **Limite por idioma**: `--max-samples-per-language` (default: `10000`, `<=0` sem limite)

### Outputs do `prepare_data.py`

- `data/dataset.csv` com colunas:
  - `text`
  - `label`
  - `label_name`
  - `language`
  - `source`
- `data/corpus.txt` para treino do tokenizer (linhas deduplicadas por hash)

## 🚀 Quick Start

### 1. Clonar repositório
```bash
git clone https://github.com/Valthoris-code/Valthoris-llm.git
cd Valthoris-llm
```

### 2. Instalar dependências
```bash
pip install -r requirements.txt
```

### 3. Preparar dados
```bash
python prepare_data.py
```

Descarrega e prepara o CSV bilingue EN/PT:
- Guarda CSV bruto em `data/raw/multilingual_spam.csv`
- Normaliza texto e labels
- Gera `data/dataset.csv` (estruturado)
- Gera `data/corpus.txt` (corpus para tokenizer)

Exemplo com parâmetros:
```bash
python prepare_data.py --dataset-output data/dataset.csv --corpus-output data/corpus.txt --max-samples-per-language 10000
```

### 4. Treinar tokenizer
```bash
python tokenizer/train_tokenizer.py
```

Treina tokenizer BPE com 16K tokens:
- Tokens especiais: `[PAD]`, `[UNK]`, `[BOS]`, `[EOS]`
- Salva em `tokenizer/tokenizer.json`

### 5. Treinar modelo
```bash
python train.py
```

Treina o classificador com:
- Otimizador: AdamW
- Loss: Binary Cross-Entropy (BCE)
- Epochs: 10-20 (configurável)
- Batch size: 32

### 6. Avaliar modelo
```bash
python evaluate.py
```

Avalia em test set:
- Acurácia, Precisão, Recall, F1
- Matriz de confusão
- ROC-AUC

### 7. Fazer inferência
```bash
python inference.py --text "Clique aqui para confirmar sua senha: https://phishing-link.com"
```

Classifica mensagem em tempo real:
- Probabilidade de fraude
- Nível de confiança
- Recomendação

## 📁 Estrutura do Projeto

```
Valthoris-llm/
├── data/
│   ├── .gitkeep
│   ├── dataset.csv          # Dataset normalizado para treino
│   ├── corpus.txt           # Corpus para treino do tokenizer
│   └── raw/
│       └── multilingual_spam.csv  # CSV bruto em cache local
├── model/
│   ├── .gitkeep
│   └── architecture.py      # Arquitetura do transformer
├── tokenizer/
│   ├── .gitkeep
│   ├── train_tokenizer.py   # Script de treino
│   └── tokenizer.json       # Tokenizer treinado
├── prepare_data.py          # Descarregar e preparar dados
├── train.py                 # Script de treino
├── evaluate.py              # Avaliação do modelo
├── inference.py             # Inferência em tempo real
├── requirements.txt         # Dependências
└── README.md                # Este ficheiro
```

## 🔧 Requisitos

- Python 3.8+
- PyTorch 2.0+
- `tokenizers`
- NumPy, Pandas, scikit-learn

Veja `requirements.txt` para versões exatas.

## 📈 Métricas de Performance

Depois do treino, o modelo deve atingir:

- **Acurácia**: > 95%
- **Precisão (Fraude)**: > 92%
- **Recall (Fraude)**: > 90%
- **F1-Score**: > 91%
- **ROC-AUC**: > 0.98

## 🔐 Características de Segurança

O modelo detecta:
- ✓ Phishing emails (roubo de credenciais)
- ✓ URLs maliciosas e encurtadas
- ✓ Solicitações urgentes (social engineering)
- ✓ Pedidos de informação pessoal
- ✓ Ofertas muito boas para ser verdadeiras
- ✓ Erros ortográficos e linguísticos
- ✓ Falsificação de remetentes

## 🌍 Multilingue

O modelo funciona em:
- 🇬🇧 **Inglês** (English)
- 🇵🇹 **Português** (Português)

Pode ser estendido para outros idiomas retendo o corpus.

## 📝 Exemplos

### Exemplo 1: Email legítimo
```
Input: "Olá, confirme seu pedido #12345 aqui: https://amazon.com/orders/12345"
Output: Legítimo (99% confiança)
```

### Exemplo 2: Phishing
```
Input: "Clique AGORA para confirmar sua senha bancária: https://bit.ly/x7k9p"
Output: Phishing (96% confiança)
```

### Exemplo 3: Spam
```
Input: "Ganhe $$$$ RÁPIDO!!! Investimento garantido, clique aqui!!!"
Output: Spam (98% confiança)
```

## 🤝 Contribuições

Contribuições são bem-vindas! Por favor:

1. Faça fork do repositório
2. Crie uma branch para sua feature
3. Faça commits claros
4. Push e abra um Pull Request

## 📄 Licença

Este projeto está sob licença MIT. Veja `LICENSE` para mais detalhes.

## 👤 Autor

**Valthoris-code**

## 📞 Suporte

Para dúvidas ou issues:
- Abra uma issue no GitHub
- Verifique a documentação

---

**Última atualização**: Julho 2026

**Status**: Em desenvolvimento 🚀
