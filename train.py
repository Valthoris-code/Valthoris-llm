#!/usr/bin/env python3
"""
Script de treino do classificador de fraude Valthoris.

Este script implementa o pipeline de treino completo:
1. Carregamento do tokenizer BPE treinado em tokenizer/tokenizer.json
2. Leitura do dataset de fraude/phishing em data/dataset.csv
3. Dataset e DataLoader PyTorch com tokenização e padding
4. Modelo GPT + cabeça de classificação linear (último token)
5. Otimizador AdamW e loss CrossEntropyLoss
6. Loop de treino com logging de progresso e checkpoints
"""

import csv
import os

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from tokenizers import Tokenizer

from model.architecture import GPTModel, count_parameters, get_model_size_mb


# ============================================================================
# CONFIGURAÇÕES GLOBAIS DE TREINO
# ============================================================================
TOKENIZER_PATH = "tokenizer/tokenizer.json"
DATASET_PATH   = "data/dataset.csv"
CHECKPOINT_DIR = "checkpoints"

# Hiperparâmetros do modelo (devem coincidir com model/architecture.py)
VOCAB_SIZE  = 16000
SEQ_LENGTH  = 512
D_MODEL     = 512
NUM_LAYERS  = 6
NUM_HEADS   = 8
D_FF        = 2048
DROPOUT     = 0.1

# Hiperparâmetros de treino
NUM_CLASSES    = 4    # 0=Legítimo, 1=Phishing, 2=Spam, 3=Fraude
BATCH_SIZE     = 32
LEARNING_RATE  = 1e-4
NUM_EPOCHS     = 10
LOG_INTERVAL   = 100  # Imprimir loss a cada N batches
SAVE_INTERVAL  = 1    # Guardar checkpoint a cada N épocas


# ============================================================================
# DATASET
# ============================================================================
class FraudDataset(Dataset):
    """
    Dataset para classificação de fraude e phishing.

    Lê um ficheiro CSV com colunas 'text' e 'label', tokeniza o texto
    com o tokenizer BPE e trunca/padda cada sequência para seq_length.

    Args:
        csv_path (str): Caminho do ficheiro CSV com os dados
        tokenizer (Tokenizer): Tokenizer HuggingFace treinado
        seq_length (int): Comprimento máximo da sequência (em tokens)
        pad_id (int): ID do token de padding ([PAD])
    """

    def __init__(self, csv_path, tokenizer, seq_length=512, pad_id=0):
        self.tokenizer  = tokenizer
        self.seq_length = seq_length
        self.pad_id     = pad_id
        self.samples    = []

        print(f"\n[DATASET] Carregando: {csv_path}")
        self._load(csv_path)
        print(f"[DATASET] ✓ {len(self.samples)} amostras carregadas")

    def _load(self, csv_path):
        """Lê o CSV e armazena pares (texto, label)."""
        with open(csv_path, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                text  = row.get('text', '').strip()
                label = int(row.get('label', 0))
                if text:
                    self.samples.append((text, label))

    def _tokenize(self, text):
        """
        Tokeniza o texto e devolve um tensor de IDs com comprimento seq_length.
        Trunca se for mais longo; padda com pad_id se for mais curto.

        Args:
            text (str): Texto a tokenizar

        Returns:
            torch.Tensor: Tensor de IDs com forma (seq_length,)
        """
        encoding = self.tokenizer.encode(text)
        ids = encoding.ids[:self.seq_length]

        # Padding até seq_length se necessário
        if len(ids) < self.seq_length:
            ids = ids + [self.pad_id] * (self.seq_length - len(ids))

        return torch.tensor(ids, dtype=torch.long)

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        text, label = self.samples[idx]
        return {
            'input_ids': self._tokenize(text),
            'label': torch.tensor(label, dtype=torch.long)
        }


# ============================================================================
# MODELO DE CLASSIFICAÇÃO
# ============================================================================
class ValthorisClassifier(nn.Module):
    """
    Classificador de fraude baseado na arquitetura GPT.

    Utiliza o GPTModel como backbone e adiciona uma cabeça de classificação
    linear sobre os logits do último token da sequência.

    Args:
        backbone (GPTModel): Modelo GPT pré-definido
        num_classes (int): Número de classes de saída
    """

    def __init__(self, backbone, num_classes):
        super(ValthorisClassifier, self).__init__()
        self.backbone = backbone
        # Projeta os logits do último token para o espaço das classes
        self.classification_head = nn.Linear(backbone.vocab_size, num_classes)

    def forward(self, input_ids):
        """
        Args:
            input_ids (torch.Tensor): IDs dos tokens (batch_size, seq_length)

        Returns:
            torch.Tensor: Logits de classificação (batch_size, num_classes)
        """
        # Obter logits do modelo GPT: (batch, seq, vocab)
        logits = self.backbone(input_ids)

        # Usar o output do último token como representação da sequência
        last_logits = logits[:, -1, :]           # (batch, vocab)

        # Projetar para o espaço das classes
        return self.classification_head(last_logits)  # (batch, num_classes)


# ============================================================================
# GUARDAR CHECKPOINT
# ============================================================================
def save_checkpoint(model, optimizer, epoch, loss, checkpoint_dir):
    """
    Guarda o estado do modelo e do otimizador num ficheiro.

    Args:
        model (nn.Module): Modelo de classificação
        optimizer: Otimizador AdamW
        epoch (int): Número da época atual
        loss (float): Loss médio da época
        checkpoint_dir (str): Diretório onde guardar os checkpoints
    """
    os.makedirs(checkpoint_dir, exist_ok=True)
    checkpoint_path = os.path.join(checkpoint_dir, f"checkpoint_epoch_{epoch:02d}.pt")

    torch.save({
        'epoch': epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'loss': loss
    }, checkpoint_path)

    print(f"  ✓ Checkpoint guardado: {checkpoint_path}")


# ============================================================================
# LOOP DE TREINO POR ÉPOCA
# ============================================================================
def train_one_epoch(model, train_loader, optimizer, loss_fn, device, epoch):
    """
    Executa uma época de treino completa.

    Args:
        model (nn.Module): Modelo de classificação
        train_loader (DataLoader): DataLoader do dataset de treino
        optimizer: Otimizador AdamW
        loss_fn: Função de loss (CrossEntropyLoss)
        device (torch.device): Dispositivo de computação (cuda/cpu)
        epoch (int): Número da época atual

    Returns:
        float: Loss médio da época
    """
    model.train()
    total_loss    = 0.0
    total_samples = 0

    for batch_idx, batch in enumerate(train_loader):
        input_ids = batch['input_ids'].to(device)
        labels    = batch['label'].to(device)

        # Zerar gradientes acumulados
        optimizer.zero_grad()

        # Forward pass
        class_logits = model(input_ids)      # (batch, num_classes)

        # Calcular loss
        loss = loss_fn(class_logits, labels)

        # Backward pass e atualização dos pesos
        loss.backward()
        optimizer.step()

        total_loss    += loss.item() * input_ids.size(0)
        total_samples += input_ids.size(0)

        # Logging periódico
        if (batch_idx + 1) % LOG_INTERVAL == 0:
            avg_loss = total_loss / total_samples
            print(f"  Época {epoch} | Batch {batch_idx + 1}/{len(train_loader)} | "
                  f"Loss: {avg_loss:.4f}")

    return total_loss / total_samples if total_samples > 0 else 0.0


# ============================================================================
# FUNÇÃO PRINCIPAL
# ============================================================================
def main():
    """
    Função principal do script de treino.
    """
    print("=" * 80)
    print("TREINO DO CLASSIFICADOR VALTHORIS")
    print("=" * 80)

    # ============================================================================
    # DISPOSITIVO
    # ============================================================================
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\n[DISPOSITIVO] {device}")

    # ============================================================================
    # TOKENIZER
    # ============================================================================
    print(f"\n[TOKENIZER] Carregando: {TOKENIZER_PATH}")

    if not os.path.exists(TOKENIZER_PATH):
        print(f"  ✗ Erro: Tokenizer não encontrado em {TOKENIZER_PATH}")
        print(f"    Execute primeiro: python tokenizer/train_tokenizer.py")
        return False

    tokenizer = Tokenizer.from_file(TOKENIZER_PATH)
    pad_id = tokenizer.token_to_id("[PAD]")
    vocab_size_actual = len(tokenizer.get_vocab())

    print(f"  ✓ Tokenizer carregado")
    print(f"    Vocabulário: {vocab_size_actual} tokens")
    print(f"    ID [PAD]: {pad_id}")

    # ============================================================================
    # DATASET E DATALOADER
    # ============================================================================
    if not os.path.exists(DATASET_PATH):
        print(f"\n  ✗ Erro: Dataset não encontrado em {DATASET_PATH}")
        print(f"    Execute primeiro: python prepare_data.py")
        return False

    train_dataset = FraudDataset(
        csv_path=DATASET_PATH,
        tokenizer=tokenizer,
        seq_length=SEQ_LENGTH,
        pad_id=pad_id
    )

    train_loader = DataLoader(
        train_dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=0,
        pin_memory=(device.type == "cuda")
    )

    print(f"\n[DATALOADER]")
    print(f"  Amostras: {len(train_dataset)}")
    print(f"  Batch size: {BATCH_SIZE}")
    print(f"  Batches por época: {len(train_loader)}")

    # ============================================================================
    # MODELO
    # ============================================================================
    print(f"\n[MODELO] Inicializando GPT + cabeça de classificação...")

    backbone = GPTModel(
        vocab_size=VOCAB_SIZE,
        seq_length=SEQ_LENGTH,
        d_model=D_MODEL,
        num_layers=NUM_LAYERS,
        num_heads=NUM_HEADS,
        d_ff=D_FF,
        dropout=DROPOUT
    )

    model = ValthorisClassifier(
        backbone=backbone,
        num_classes=NUM_CLASSES
    )
    model.to(device)

    num_params    = count_parameters(backbone)
    model_size_mb = get_model_size_mb(backbone)

    print(f"  ✓ Modelo criado")
    print(f"    Parâmetros treináveis: {num_params:,}")
    print(f"    Tamanho estimado: {model_size_mb:.1f}MB")
    print(f"    Classes: {NUM_CLASSES} (Legítimo, Phishing, Spam, Fraude)")

    # ============================================================================
    # OTIMIZADOR E LOSS
    # ============================================================================
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE)
    loss_fn   = nn.CrossEntropyLoss()

    print(f"\n[OTIMIZADOR] AdamW (lr={LEARNING_RATE})")
    print(f"[LOSS] CrossEntropyLoss ({NUM_CLASSES} classes)")

    # ============================================================================
    # LOOP DE TREINO
    # ============================================================================
    print(f"\n[TREINO] Iniciando {NUM_EPOCHS} épocas...")
    print("=" * 80)

    for epoch in range(1, NUM_EPOCHS + 1):
        print(f"\nÉpoca {epoch}/{NUM_EPOCHS}")
        print("-" * 40)

        epoch_loss = train_one_epoch(
            model=model,
            train_loader=train_loader,
            optimizer=optimizer,
            loss_fn=loss_fn,
            device=device,
            epoch=epoch
        )

        print(f"\n  ✓ Época {epoch} concluída | Loss médio: {epoch_loss:.4f}")

        # Guardar checkpoint no final de cada época (ou de SAVE_INTERVAL em SAVE_INTERVAL)
        if epoch % SAVE_INTERVAL == 0:
            save_checkpoint(model, optimizer, epoch, epoch_loss, CHECKPOINT_DIR)

    print("\n" + "=" * 80)
    print("TREINO CONCLUÍDO COM SUCESSO!")
    print("=" * 80)
    print(f"\n✓ Modelo treinado durante {NUM_EPOCHS} épocas")
    print(f"✓ Checkpoints guardados em: {CHECKPOINT_DIR}/")
    print("\nPróximo passo:")
    print("  - Avaliar o modelo: python evaluate.py")

    return True


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
