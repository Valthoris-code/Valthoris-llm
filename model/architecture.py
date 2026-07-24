#!/usr/bin/env python3
"""
Arquitetura de um modelo Transformer Decoder-only (estilo GPT) em PyTorch.

Este ficheiro define:
- PositionalEncoding: Codificação posicional dos tokens
- MultiHeadAttention: Mecanismo de atenção multi-head
- FeedForward: Camada feed-forward
- TransformerBlock: Bloco decoder completo
- GPTModel: Modelo transformer decoder-only completo
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


class PositionalEncoding(nn.Module):
    """
    Codificação posicional absoluta usando sin e cos.
    
    Permite ao modelo aprender a posição relativa dos tokens na sequência.
    Baseado em: "Attention is All You Need" (Vaswani et al., 2017)
    
    Args:
        d_model (int): Dimensão do modelo (embedding)
        max_seq_length (int): Comprimento máximo da sequência
        dropout (float): Taxa de dropout
    """
    
    def __init__(self, d_model, max_seq_length=2048, dropout=0.1):
        super(PositionalEncoding, self).__init__()
        self.dropout = nn.Dropout(p=dropout)
        
        # Criar matriz de posições e dimensões
        pe = torch.zeros(max_seq_length, d_model)
        position = torch.arange(0, max_seq_length, dtype=torch.float).unsqueeze(1)
        
        # Calcular o divisor para as dimensões
        div_term = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float) * 
            -(math.log(10000.0) / d_model)
        )
        
        # Aplicar sin às dimensões pares
        pe[:, 0::2] = torch.sin(position * div_term)
        
        # Aplicar cos às dimensões ímpares
        if d_model % 2 == 1:
            pe[:, 1::2] = torch.cos(position * div_term[:-1])
        else:
            pe[:, 1::2] = torch.cos(position * div_term)
        
        # Registar como buffer (não é parâmetro treinável)
        self.register_buffer('pe', pe.unsqueeze(0))
    
    def forward(self, x):
        """
        Args:
            x (torch.Tensor): Tensor de embeddings (batch_size, seq_length, d_model)
            
        Returns:
            torch.Tensor: Embeddings com codificação posicional adicionada
        """
        # Adicionar codificação posicional
        x = x + self.pe[:, :x.size(1), :].to(x.device)
        return self.dropout(x)


class MultiHeadAttention(nn.Module):
    """
    Mecanismo de atenção multi-head.
    
    Permite ao modelo atender a diferentes partes da sequência simultaneamente.
    
    Args:
        d_model (int): Dimensão do modelo
        num_heads (int): Número de heads de atenção
        dropout (float): Taxa de dropout
    """
    
    def __init__(self, d_model, num_heads, dropout=0.1):
        super(MultiHeadAttention, self).__init__()
        
        assert d_model % num_heads == 0, "d_model deve ser divisível por num_heads"
        
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads  # Dimensão de cada head
        
        # Camadas de projeção lineares para Q, K, V e saída
        self.linear_q = nn.Linear(d_model, d_model)
        self.linear_k = nn.Linear(d_model, d_model)
        self.linear_v = nn.Linear(d_model, d_model)
        self.linear_out = nn.Linear(d_model, d_model)
        
        self.dropout = nn.Dropout(p=dropout)
    
    def forward(self, query, key, value, mask=None):
        """
        Args:
            query (torch.Tensor): Query (batch_size, seq_length, d_model)
            key (torch.Tensor): Key (batch_size, seq_length, d_model)
            value (torch.Tensor): Value (batch_size, seq_length, d_model)
            mask (torch.Tensor, optional): Máscara de atenção (batch_size, seq_length, seq_length)
            
        Returns:
            torch.Tensor: Saída de atenção (batch_size, seq_length, d_model)
        """
        
        batch_size = query.size(0)
        seq_length = query.size(1)
        
        # =====================================================================
        # PROJETAR Q, K, V
        # =====================================================================
        # Projetar input para Q, K, V
        Q = self.linear_q(query)  # (batch_size, seq_length, d_model)
        K = self.linear_k(key)
        V = self.linear_v(value)
        
        # Dividir em múltiplos heads
        # Reshapear para: (batch_size, seq_length, num_heads, d_k)
        Q = Q.view(batch_size, seq_length, self.num_heads, self.d_k)
        K = K.view(batch_size, seq_length, self.num_heads, self.d_k)
        V = V.view(batch_size, seq_length, self.num_heads, self.d_k)
        
        # Transpor para: (batch_size, num_heads, seq_length, d_k)
        Q = Q.transpose(1, 2)
        K = K.transpose(1, 2)
        V = V.transpose(1, 2)
        
        # =====================================================================
        # CALCULAR ATENÇÃO
        # =====================================================================
        # Scores: Q @ K^T / sqrt(d_k)
        scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(self.d_k)
        
        # Aplicar máscara (causal mask para decoder-only)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float('-inf'))
        
        # Aplicar softmax para obter pesos de atenção
        attention_weights = F.softmax(scores, dim=-1)
        attention_weights = self.dropout(attention_weights)
        
        # Aplicar pesos aos valores: attention_weights @ V
        context = torch.matmul(attention_weights, V)
        
        # =====================================================================
        # CONCATENAR HEADS
        # =====================================================================
        # Transpor de volta: (batch_size, seq_length, num_heads, d_k)
        context = context.transpose(1, 2).contiguous()
        
        # Concatenar heads: (batch_size, seq_length, d_model)
        context = context.view(batch_size, seq_length, self.d_model)
        
        # Projeção linear final
        output = self.linear_out(context)
        
        return output


class FeedForward(nn.Module):
    """
    Camada feed-forward com duas camadas lineares.
    
    Estrutura: Linear(d_model -> d_ff) -> GELU -> Linear(d_ff -> d_model)
    A camada intermédia é tipicamente 4x a dimensão do modelo.
    
    Args:
        d_model (int): Dimensão do modelo
        d_ff (int): Dimensão da camada intermédia (default: 4 * d_model)
        dropout (float): Taxa de dropout
    """
    
    def __init__(self, d_model, d_ff=None, dropout=0.1):
        super(FeedForward, self).__init__()
        
        if d_ff is None:
            d_ff = 4 * d_model
        
        self.linear_1 = nn.Linear(d_model, d_ff)
        self.linear_2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(p=dropout)
        self.gelu = nn.GELU()
    
    def forward(self, x):
        """
        Args:
            x (torch.Tensor): Tensor de entrada (batch_size, seq_length, d_model)
            
        Returns:
            torch.Tensor: Tensor de saída (batch_size, seq_length, d_model)
        """
        # Primeira camada linear com expansão
        x = self.linear_1(x)
        
        # Ativação GELU (melhor que ReLU para transformers)
        x = self.gelu(x)
        
        # Dropout
        x = self.dropout(x)
        
        # Segunda camada linear com contração
        x = self.linear_2(x)
        
        return x


class TransformerBlock(nn.Module):
    """
    Bloco decoder do transformer.
    
    Estrutura:
    1. Multi-head attention + Residual connection + Layer normalization
    2. Feed-forward + Residual connection + Layer normalization
    
    Args:
        d_model (int): Dimensão do modelo
        num_heads (int): Número de heads de atenção
        d_ff (int): Dimensão da camada feed-forward
        dropout (float): Taxa de dropout
    """
    
    def __init__(self, d_model, num_heads, d_ff=None, dropout=0.1):
        super(TransformerBlock, self).__init__()
        
        # Camada de atenção multi-head
        self.attention = MultiHeadAttention(d_model, num_heads, dropout)
        
        # Camada feed-forward
        self.feed_forward = FeedForward(d_model, d_ff, dropout)
        
        # Normalização de camada (aplicada antes de cada sub-camada)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        
        # Dropout para regularização
        self.dropout = nn.Dropout(p=dropout)
    
    def forward(self, x, mask=None):
        """
        Args:
            x (torch.Tensor): Tensor de entrada (batch_size, seq_length, d_model)
            mask (torch.Tensor, optional): Máscara causal para atenção
            
        Returns:
            torch.Tensor: Tensor de saída (batch_size, seq_length, d_model)
        """
        
        # =====================================================================
        # SUB-CAMADA 1: MULTI-HEAD ATTENTION + RESIDUAL + NORM
        # =====================================================================
        # Layer normalization antes da atenção (Pre-LN)
        norm_x = self.norm1(x)
        
        # Atenção (self-attention: Q=K=V)
        attn_output = self.attention(norm_x, norm_x, norm_x, mask)
        
        # Conexão residual e dropout
        x = x + self.dropout(attn_output)
        
        # =====================================================================
        # SUB-CAMADA 2: FEED-FORWARD + RESIDUAL + NORM
        # =====================================================================
        # Layer normalization antes do feed-forward
        norm_x = self.norm2(x)
        
        # Feed-forward
        ff_output = self.feed_forward(norm_x)
        
        # Conexão residual e dropout
        x = x + self.dropout(ff_output)
        
        return x


class GPTModel(nn.Module):
    """
    Modelo Transformer Decoder-only completo (estilo GPT).
    
    Configuração pequena:
    - 6 camadas de transformer
    - 8 heads de atenção
    - 512 dimensões
    - ~30-50M parâmetros
    
    Args:
        vocab_size (int): Tamanho do vocabulário
        seq_length (int): Comprimento máximo da sequência
        d_model (int): Dimensão do modelo (embeddings)
        num_layers (int): Número de blocos transformer
        num_heads (int): Número de heads de atenção
        d_ff (int): Dimensão da camada feed-forward
        dropout (float): Taxa de dropout
    """
    
    def __init__(
        self,
        vocab_size=16000,
        seq_length=512,
        d_model=512,
        num_layers=6,
        num_heads=8,
        d_ff=2048,
        dropout=0.1
    ):
        super(GPTModel, self).__init__()
        
        self.d_model = d_model
        self.num_layers = num_layers
        self.vocab_size = vocab_size
        
        # =====================================================================
        # CAMADA DE EMBEDDING DE TOKENS
        # =====================================================================
        # Converte IDs de tokens (0-vocab_size) em vetores densos (d_model)
        self.token_embedding = nn.Embedding(vocab_size, d_model)
        
        # =====================================================================
        # CODIFICAÇÃO POSICIONAL
        # =====================================================================
        # Adiciona informação de posição aos embeddings
        self.positional_encoding = PositionalEncoding(d_model, seq_length, dropout)
        
        # =====================================================================
        # BLOCOS TRANSFORMER
        # =====================================================================
        # Empilha múltiplos blocos decoder idênticos
        self.transformer_blocks = nn.ModuleList([
            TransformerBlock(d_model, num_heads, d_ff, dropout)
            for _ in range(num_layers)
        ])
        
        # =====================================================================
        # NORMALIZAÇÃO FINAL
        # =====================================================================
        # Layer normalization após todos os blocos
        self.final_norm = nn.LayerNorm(d_model)
        
        # =====================================================================
        # CABEÇA DE SAÍDA
        # =====================================================================
        # Projeta a saída do modelo de volta para o espaço do vocabulário
        # Para fazer previsão do próximo token
        self.output_head = nn.Linear(d_model, vocab_size)
        
        # =====================================================================
        # MÁSCARA CAUSAL
        # =====================================================================
        # Pré-computar máscara causal (máximo para atender ao passado)
        # Registar como buffer para não ser considerado parâmetro
        self.register_buffer(
            'causal_mask',
            self._create_causal_mask(seq_length),
            persistent=False
        )
        
        # Inicializar pesos
        self._init_weights()
    
    def _create_causal_mask(self, seq_length):
        """
        Cria uma máscara causal (triangular inferior).
        Permite que cada token atenda apenas aos tokens anteriores.
        
        Args:
            seq_length (int): Comprimento da sequência
            
        Returns:
            torch.Tensor: Máscara triangular (seq_length, seq_length)
        """
        mask = torch.tril(torch.ones(seq_length, seq_length))
        return mask
    
    def _init_weights(self):
        """
        Inicializa os pesos do modelo usando Xavier uniform.
        """
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.constant_(module.bias, 0)
            elif isinstance(module, nn.Embedding):
                nn.init.xavier_uniform_(module.weight)
            elif isinstance(module, nn.LayerNorm):
                nn.init.constant_(module.weight, 1.0)
                nn.init.constant_(module.bias, 0)
    
    def forward(self, input_ids):
        """
        Args:
            input_ids (torch.Tensor): IDs dos tokens (batch_size, seq_length)
            
        Returns:
            torch.Tensor: Logits para o próximo token (batch_size, seq_length, vocab_size)
        """
        
        batch_size = input_ids.size(0)
        seq_length = input_ids.size(1)
        device = input_ids.device
        
        # =====================================================================
        # EMBEDDING E CODIFICAÇÃO POSICIONAL
        # =====================================================================
        # Converter IDs em embeddings
        x = self.token_embedding(input_ids)
        
        # Escalar embeddings por sqrt(d_model) (recomendado em "Attention is All You Need")
        x = x * math.sqrt(self.d_model)
        
        # Adicionar codificação posicional
        x = self.positional_encoding(x)
        
        # =====================================================================
        # MÁSCARA CAUSAL
        # =====================================================================
        # Expandir máscara para o tamanho da batch
        mask = self.causal_mask[:seq_length, :seq_length].unsqueeze(0).to(device)
        mask = mask.expand(batch_size, -1, -1)
        
        # =====================================================================
        # BLOCOS TRANSFORMER
        # =====================================================================
        # Passar através de todos os blocos decoder
        for block in self.transformer_blocks:
            x = block(x, mask)
        
        # =====================================================================
        # NORMALIZAÇÃO FINAL
        # =====================================================================
        x = self.final_norm(x)
        
        # =====================================================================
        # CABEÇA DE SAÍDA
        # =====================================================================
        # Projetar para o espaço do vocabulário
        logits = self.output_head(x)
        
        return logits


def count_parameters(model):
    """
    Conta o número de parâmetros treináveis do modelo.
    
    Args:
        model (nn.Module): Modelo PyTorch
        
    Returns:
        int: Número total de parâmetros treináveis
    """
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def get_model_size_mb(model):
    """
    Calcula o tamanho estimado do modelo em MB.
    
    Args:
        model (nn.Module): Modelo PyTorch
        
    Returns:
        float: Tamanho do modelo em MB
    """
    param_size = 0
    for param in model.parameters():
        param_size += param.numel() * 4  # 4 bytes por float32
    
    return param_size / (1024 * 1024)


if __name__ == "__main__":
    # Teste da arquitetura
    print("=" * 80)
    print("TESTE DA ARQUITETURA GPT")
    print("=" * 80)
    
    # Criar modelo
    model = GPTModel(
        vocab_size=16000,
        seq_length=512,
        d_model=512,
        num_layers=6,
        num_heads=8,
        d_ff=2048,
        dropout=0.1
    )
    
    # Informações do modelo
    print(f"\nConfigurações:")
    print(f"  - Vocab size: 16000")
    print(f"  - Seq length: 512")
    print(f"  - D model: 512")
    print(f"  - Num layers: 6")
    print(f"  - Num heads: 8")
    print(f"  - D ff: 2048")
    
    # Contar parâmetros
    num_params = count_parameters(model)
    model_size_mb = get_model_size_mb(model)
    
    print(f"\nEstatísticas:")
    print(f"  - Parâmetros treináveis: {num_params:,}")
    print(f"  - Tamanho estimado: {model_size_mb:.1f}MB")
    
    # Teste com input dummy
    print(f"\nTeste com input dummy:")
    batch_size = 2
    seq_length = 128
    input_ids = torch.randint(0, 16000, (batch_size, seq_length))
    
    print(f"  - Input shape: {input_ids.shape}")
    
    output = model(input_ids)
    print(f"  - Output shape: {output.shape}")
    print(f"  - Output logits: {output.min().item():.4f} a {output.max().item():.4f}")
    
    print("\n✓ Teste concluído com sucesso!")
