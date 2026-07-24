#!/usr/bin/env python3
"""
Script para descarregar e preparar um corpus de texto bilingue (inglês e português).

Este script utiliza a biblioteca datasets da Hugging Face para:
1. Descarregar Wikipedia em inglês e português
2. Limitar o tamanho de cada idioma para evitar sobrecarregar a memória
3. Extrair e limpar o texto dos artigos
4. Combinar os dois idiomas num único ficheiro com proporção equilibrada
"""

import os
import re
from datasets import load_dataset


def clean_text(text):
    """
    Remove formatação wiki residual e limpa o texto.
    
    Args:
        text (str): Texto bruto do artigo Wikipedia
        
    Returns:
        str: Texto limpo
    """
    if not text:
        return ""
    
    # Remove referências wiki (ex: [1], [2], etc.)
    text = re.sub(r'\[\d+\]', '', text)
    
    # Remove URLs e links externos
    text = re.sub(r'https?://\S+', '', text)
    
    # Remove títulos wiki (== ... ==)
    text = re.sub(r'==+\s*', '', text)
    
    # Remove caracteres de controlo e especiais
    text = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]', '', text)
    
    # Remove múltiplos espaços em branco
    text = re.sub(r'\s+', ' ', text)
    
    # Remove espaço em branco no início e fim
    text = text.strip()
    
    return text


def download_wikipedia_corpus(language, config, max_size_mb):
    """
    Descarrega corpus Wikipedia para um idioma específico.
    
    Args:
        language (str): Código do idioma (ex: 'en', 'pt')
        config (str): Configuração do dataset (ex: '20220301')
        max_size_mb (int): Tamanho máximo em MB
        
    Returns:
        list: Lista de textos processados
    """
    
    max_size_bytes = max_size_mb * 1024 * 1024
    
    print(f"\n[{language.upper()}] Descarregando Wikipedia...")
    
    try:
        # Descarregar dataset Wikipedia
        # Nota: o parâmetro language mapeia para 'en', 'pt', etc.
        # o parâmetro date é formatado como '20220301'
        dataset = load_dataset(
            "wikipedia",
            language=language,
            date=config,
            split="train",
            trust_remote_code=True
        )
        
        print(f"[{language.upper()}] Dataset carregado: {len(dataset)} artigos disponíveis")
        
        # Processar artigos e acumular texto até atingir o limite de tamanho
        texts = []
        current_size = 0
        articles_processed = 0
        
        for idx, article in enumerate(dataset):
            if current_size >= max_size_bytes:
                print(f"[{language.upper()}] Limite de tamanho atingido ({max_size_mb}MB)")
                break
            
            # Extrair texto do artigo
            text = article.get("text", "")
            
            # Limpar formatação wiki
            text = clean_text(text)
            
            # Ignorar artigos muito curtos (menos de 200 caracteres)
            if len(text) > 200:
                texts.append(text)
                current_size += len(text.encode('utf-8'))
                articles_processed += 1
            
            # Mostrar progresso a cada 1000 artigos verificados
            if (idx + 1) % 1000 == 0:
                print(f"[{language.upper()}] Processados {idx + 1} artigos... "
                      f"({current_size / (1024*1024):.1f}MB acumulados)")
        
        total_size = sum(len(t.encode('utf-8')) for t in texts)
        print(f"[{language.upper()}] ✓ Concluído: {len(texts)} artigos "
              f"({total_size / (1024*1024):.1f}MB)")
        
        return texts
        
    except Exception as e:
        print(f"[{language.upper()}] ✗ Erro ao descarregar: {e}")
        raise


def combine_corpora(corpus_en, corpus_pt):
    """
    Combina os corpus em inglês e português com proporção equilibrada.
    Intercala artigos dos dois idiomas para manter equilíbrio.
    
    Args:
        corpus_en (list): Lista de textos em inglês
        corpus_pt (list): Lista de textos em português
        
    Returns:
        list: Corpus combinado
    """
    
    print("\n" + "=" * 80)
    print("COMBINANDO CORPUS")
    print("=" * 80)
    
    # Determinar o número mínimo de artigos para equilibrar os idiomas
    min_articles = min(len(corpus_en), len(corpus_pt))
    print(f"\nArtigos por idioma (após equilibrar): {min_articles} cada")
    print(f"Total de artigos no corpus final: {min_articles * 2}")
    
    # Combinar alternadamente: artigo inglês, artigo português, etc.
    combined = []
    for i in range(min_articles):
        combined.append(corpus_en[i])
        combined.append(corpus_pt[i])
    
    print(f"\nProporção final: {len(combined)} artigos (50% EN, 50% PT)")
    
    return combined


def write_corpus_to_file(texts, output_path):
    """
    Escreve o corpus processado para um ficheiro.
    Cada artigo é separado por uma linha em branco.
    
    Args:
        texts (list): Lista de textos
        output_path (str): Caminho do ficheiro de saída
        
    Returns:
        bool: True se bem-sucedido
    """
    
    print("\n" + "=" * 80)
    print("ESCREVENDO CORPUS")
    print("=" * 80)
    
    # Criar diretório de saída se não existir
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            for text in texts:
                f.write(text + "\n\n")
        
        # Calcular estatísticas finais
        file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
        total_chars = sum(len(t) for t in texts)
        avg_chars_per_article = total_chars // len(texts) if texts else 0
        
        print(f"\n✓ Corpus criado com sucesso!")
        print(f"  Ficheiro: {output_path}")
        print(f"  Tamanho do ficheiro: {file_size_mb:.1f}MB")
        print(f"  Total de caracteres: {total_chars:,}")
        print(f"  Total de artigos: {len(texts)}")
        print(f"  Média de caracteres por artigo: {avg_chars_per_article:,}")
        
        return True
        
    except Exception as e:
        print(f"✗ Erro ao escrever ficheiro: {e}")
        return False


def main(
    output_path="data/corpus.txt",
    max_size_mb_per_lang=500,
    config_date="20220301"
):
    """
    Função principal: descarrega, processa e combina corpus bilingue.
    
    Args:
        output_path (str): Caminho do ficheiro de saída
        max_size_mb_per_lang (int): Tamanho máximo em MB para cada idioma
        config_date (str): Data da configuração Wikipedia (ex: '20220301')
    """
    
    print("=" * 80)
    print("PREPARAÇÃO DE CORPUS BILINGUE (INGLÊS-PORTUGUÊS)")
    print("=" * 80)
    print(f"\nConfigurações:")
    print(f"  - Tamanho máximo por idioma: {max_size_mb_per_lang}MB")
    print(f"  - Versão Wikipedia: {config_date}")
    print(f"  - Ficheiro de saída: {output_path}")
    
    try:
        # Descarregar corpus em inglês
        print("\n" + "-" * 80)
        corpus_en = download_wikipedia_corpus(
            language="en",
            config=config_date,
            max_size_mb=max_size_mb_per_lang
        )
        
        # Descarregar corpus em português
        print("\n" + "-" * 80)
        corpus_pt = download_wikipedia_corpus(
            language="pt",
            config=config_date,
            max_size_mb=max_size_mb_per_lang
        )
        
        # Combinar corpus
        combined_corpus = combine_corpora(corpus_en, corpus_pt)
        
        # Escrever para ficheiro
        success = write_corpus_to_file(combined_corpus, output_path)
        
        if success:
            print("\n" + "=" * 80)
            print("PROCESSO CONCLUÍDO COM SUCESSO!")
            print("=" * 80)
            print(f"\n✓ O corpus bilingue está pronto em: {output_path}")
            print("\nPróximos passos:")
            print("  1. Treinar o tokenizer: python train_tokenizer.py")
            print("  2. Treinar o modelo LLM: python train.py")
        else:
            print("\n" + "=" * 80)
            print("ERRO: Falha ao escrever o ficheiro!")
            print("=" * 80)
            return False
            
    except Exception as e:
        print("\n" + "=" * 80)
        print("ERRO: Processo interrompido!")
        print("=" * 80)
        print(f"\nDetalhes do erro: {e}")
        return False
    
    return True


if __name__ == "__main__":
    # Configurações principais
    OUTPUT_PATH = "data/corpus.txt"
    MAX_SIZE_MB_PER_LANG = 500  # 500MB por idioma
    CONFIG_DATE = "20220301"  # Data da snapshot Wikipedia
    
    success = main(
        output_path=OUTPUT_PATH,
        max_size_mb_per_lang=MAX_SIZE_MB_PER_LANG,
        config_date=CONFIG_DATE
    )
    
    exit(0 if success else 1)
