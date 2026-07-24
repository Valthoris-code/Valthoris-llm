#!/usr/bin/env python3
"""
Script para treinar um tokenizer BPE sobre o corpus bilingue.

Este script utiliza a biblioteca tokenizers da Hugging Face para:
1. Carregar o corpus de texto em data/corpus.txt
2. Treinar um tokenizer BPE com 16000 tokens
3. Adicionar tokens especiais ([PAD], [UNK], [BOS], [EOS])
4. Guardar o tokenizer treinado em tokenizer/tokenizer.json
"""

import os
from tokenizers import Tokenizer
from tokenizers.models import BPE
from tokenizers.trainers import BpeTrainer
from tokenizers.pre_tokenizers import Whitespace
from tokenizers.processors import TemplateProcessing


def train_tokenizer(
    corpus_path="data/corpus.txt",
    output_path="tokenizer/tokenizer.json",
    vocab_size=16000,
    min_frequency=2
):
    """
    Treina um tokenizer BPE sobre o corpus de texto.
    
    Args:
        corpus_path (str): Caminho do ficheiro de corpus
        output_path (str): Caminho para guardar o tokenizer treinado
        vocab_size (int): Tamanho do vocabulário
        min_frequency (int): Frequência mínima de um token para ser incluído
        
    Returns:
        Tokenizer: Tokenizer treinado
    """
    
    # =========================================================================
    # VALIDAÇÃO DO CORPUS
    # =========================================================================
    print("=" * 80)
    print("TREINO DE TOKENIZER BPE")
    print("=" * 80)
    
    if not os.path.exists(corpus_path):
        print(f"\n✗ Erro: Ficheiro de corpus não encontrado: {corpus_path}")
        print(f"  Certifique-se de que executou prepare_data.py primeiro")
        return None
    
    corpus_size_mb = os.path.getsize(corpus_path) / (1024 * 1024)
    print(f"\n[CORPUS]")
    print(f"  Ficheiro: {corpus_path}")
    print(f"  Tamanho: {corpus_size_mb:.1f}MB")
    
    # =========================================================================
    # INICIALIZAR TOKENIZER COM MODELO BPE
    # =========================================================================
    print(f"\n[MODELO]")
    print(f"  Tipo: Byte Pair Encoding (BPE)")
    print(f"  Vocabulário: {vocab_size} tokens")
    print(f"  Frequência mínima: {min_frequency}")
    
    # Criar tokenizer com modelo BPE vazio
    # O modelo será treinado com os dados do corpus
    tokenizer = Tokenizer(BPE())
    
    # =========================================================================
    # DEFINIR PRÉ-TOKENIZADOR
    # =========================================================================
    # O pré-tokenizador divide o texto em palavras/tokens básicos
    # Aqui usamos Whitespace para dividir por espaços em branco
    print(f"\n[PRÉ-TOKENIZADOR]")
    print(f"  Tipo: Whitespace (divide por espaços)")
    
    tokenizer.pre_tokenizer = Whitespace()
    
    # =========================================================================
    # DEFINIR TOKENS ESPECIAIS
    # =========================================================================
    # Tokens especiais têm significados específicos no modelo
    special_tokens = [
        "[PAD]",   # Padding - para igualar comprimentos de sequências
        "[UNK]",   # Unknown - para tokens não encontrados no vocabulário
        "[BOS]",   # Beginning of Sequence - marca o início de uma sequência
        "[EOS]"    # End of Sequence - marca o fim de uma sequência
    ]
    
    print(f"\n[TOKENS ESPECIAIS]")
    for token in special_tokens:
        print(f"  - {token}")
    
    # =========================================================================
    # TREINAR TOKENIZER
    # =========================================================================
    print(f"\n[TREINO]")
    print(f"  Iniciando treino sobre o corpus...")
    
    # Criar treinador BPE
    trainer = BpeTrainer(
        vocab_size=vocab_size,
        special_tokens=special_tokens,
        min_frequency=min_frequency,
        show_progress=True
    )
    
    # Treinar tokenizer sobre o corpus
    # O corpus é passado como uma lista de ficheiros
    try:
        tokenizer.train(
            files=[corpus_path],
            trainer=trainer
        )
        print(f"\n✓ Treino concluído com sucesso!")
        
    except Exception as e:
        print(f"\n✗ Erro durante o treino: {e}")
        return None
    
    # =========================================================================
    # ADICIONAR PÓS-PROCESSADOR
    # =========================================================================
    # O pós-processador adiciona tokens especiais às sequências
    print(f"\n[PÓS-PROCESSADOR]")
    print(f"  Adicionando [BOS] no início e [EOS] no fim das sequências")
    
    # Template: [BOS] é adicionado no início, [EOS] no fim
    tokenizer.post_processor = TemplateProcessing(
        single="[BOS] $A [EOS]",
        pair="[BOS] $A [SEP] $B [EOS]",
        special_tokens=[
            ("[BOS]", tokenizer.token_to_id("[BOS]")),
            ("[EOS]", tokenizer.token_to_id("[EOS]")),
            ("[SEP]", tokenizer.token_to_id("[UNK]"))  # Usar [UNK] como separador
        ]
    )
    
    # =========================================================================
    # GERAR ESTATÍSTICAS DO TOKENIZER
    # =========================================================================
    print(f"\n[ESTATÍSTICAS]")
    
    # Obter informações do vocabulário
    vocab = tokenizer.get_vocab()
    vocab_size_actual = len(vocab)
    
    print(f"  Tamanho do vocabulário: {vocab_size_actual} tokens")
    print(f"  Tokens especiais:")
    for token in special_tokens:
        token_id = tokenizer.token_to_id(token)
        print(f"    - {token}: ID {token_id}")
    
    # Exemplo de tokenização
    print(f"\n[EXEMPLO DE TOKENIZAÇÃO]")
    test_texts = [
        "Hello world",
        "Olá mundo",
        "This is a test",
        "Este é um teste"
    ]
    
    for text in test_texts:
        encoding = tokenizer.encode(text)
        tokens = encoding.tokens
        ids = encoding.ids
        print(f"  '{text}'")
        print(f"    Tokens: {tokens}")
        print(f"    IDs: {ids}")
    
    return tokenizer


def save_tokenizer(tokenizer, output_path="tokenizer/tokenizer.json"):
    """
    Guarda o tokenizer treinado num ficheiro JSON.
    
    Args:
        tokenizer (Tokenizer): Tokenizer treinado
        output_path (str): Caminho para guardar o tokenizer
        
    Returns:
        bool: True se bem-sucedido
    """
    
    print(f"\n[GUARDAR]")
    
    # Criar diretório de saída se não existir
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    
    try:
        # Guardar tokenizer em formato JSON
        tokenizer.save(output_path)
        
        file_size = os.path.getsize(output_path) / 1024  # Tamanho em KB
        print(f"  ✓ Tokenizer guardado com sucesso!")
        print(f"    Ficheiro: {output_path}")
        print(f"    Tamanho: {file_size:.1f}KB")
        
        return True
        
    except Exception as e:
        print(f"  ✗ Erro ao guardar tokenizer: {e}")
        return False


def test_tokenizer_loading(tokenizer_path="tokenizer/tokenizer.json"):
    """
    Testa o carregamento do tokenizer guardado.
    
    Args:
        tokenizer_path (str): Caminho do tokenizer guardado
        
    Returns:
        bool: True se o carregamento foi bem-sucedido
    """
    
    print(f"\n[TESTE DE CARREGAMENTO]")
    
    try:
        loaded_tokenizer = Tokenizer.from_file(tokenizer_path)
        
        print(f"  ✓ Tokenizer carregado com sucesso!")
        print(f"    Tamanho do vocabulário: {len(loaded_tokenizer.get_vocab())}")
        
        # Testar com um exemplo
        test_text = "This is a bilingual tokenizer trained on English and Portuguese Wikipedia"
        encoding = loaded_tokenizer.encode(test_text)
        print(f"\n  Teste com texto: '{test_text}'")
        print(f"    Número de tokens: {len(encoding.tokens)}")
        print(f"    Primeiro token: {encoding.tokens[0]} (ID: {encoding.ids[0]})")
        
        return True
        
    except Exception as e:
        print(f"  ✗ Erro ao carregar tokenizer: {e}")
        return False


def main():
    """
    Função principal: treina e guarda o tokenizer.
    """
    
    # Configurações
    CORPUS_PATH = "data/corpus.txt"
    OUTPUT_PATH = "tokenizer/tokenizer.json"
    VOCAB_SIZE = 16000
    MIN_FREQUENCY = 2
    
    print("\nIniciando treino do tokenizer BPE...\n")
    
    # Treinar tokenizer
    tokenizer = train_tokenizer(
        corpus_path=CORPUS_PATH,
        output_path=OUTPUT_PATH,
        vocab_size=VOCAB_SIZE,
        min_frequency=MIN_FREQUENCY
    )
    
    if tokenizer is None:
        print("\n" + "=" * 80)
        print("ERRO: Treino do tokenizer falhou!")
        print("=" * 80)
        return False
    
    # Guardar tokenizer
    success = save_tokenizer(tokenizer, OUTPUT_PATH)
    
    if not success:
        print("\n" + "=" * 80)
        print("ERRO: Falha ao guardar o tokenizer!")
        print("=" * 80)
        return False
    
    # Testar carregamento
    success = test_tokenizer_loading(OUTPUT_PATH)
    
    if success:
        print("\n" + "=" * 80)
        print("PROCESSO CONCLUÍDO COM SUCESSO!")
        print("=" * 80)
        print(f"\n✓ Tokenizer BPE pronto em: {OUTPUT_PATH}")
        print("\nPróximo passo:")
        print("  - Treinar o modelo LLM: python train.py")
    else:
        print("\n" + "=" * 80)
        print("AVISO: Tokenizer foi guardado, mas teste de carregamento falhou!")
        print("=" * 80)
        return False
    
    return True


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
