#!/usr/bin/env python3
"""
Script para descarregar e preparar um dataset bilingue (EN/PT) de deteção de fraude/spam.

Outputs:
- data/dataset.csv  -> dataset estruturado com labels normalizadas
- data/corpus.txt   -> corpus de texto para treino do tokenizer
"""

import argparse
import csv
import os
import re
import urllib.request
from collections import Counter
from pathlib import Path


DATASET_URL = (
    "https://raw.githubusercontent.com/mnarrissa/Multilingual-Spam-Classification/"
    "5d9da91d2c02b8ce576c862e4e8bf5819073c994/data-augmented.csv"
)

LABEL_NAMES = {
    0: "legitimo",
    1: "phishing",
    2: "spam",
    3: "fraude",
}


PHISHING_PATTERNS = re.compile(
    r"(http|www\.|login|verify|verification|account|password|click|"
    r"senha|conta|verifique|clique|credencial|token)",
    flags=re.IGNORECASE,
)

FRAUD_PATTERNS = re.compile(
    r"(winner|lottery|prize|claim|urgent payment|bank transfer|bitcoin|crypto|"
    r"investment|premio|ganhou|transfer[êe]ncia|pix|iban)",
    flags=re.IGNORECASE,
)


def clean_text(text: str) -> str:
    """Limpa texto para utilização em dataset/corpus."""
    if not text:
        return ""

    text = re.sub(r"https?://\S+", " [URL] ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def classify_label(original_label: str, text: str) -> int:
    """Mapeia label original (ham/spam) para taxonomia do projeto."""
    normalized = (original_label or "").strip().lower()

    if normalized == "ham":
        return 0

    if PHISHING_PATTERNS.search(text):
        return 1

    if FRAUD_PATTERNS.search(text):
        return 3

    return 2


def download_dataset(url: str, output_path: str) -> str:
    """Descarrega CSV público para cache local."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    print(f"\n[DOWNLOAD] {url}")
    print(f"[SAVE] {output_path}")
    urllib.request.urlretrieve(url, output_path)
    return output_path


def load_records(csv_path: str, max_samples_per_language: int | None = None) -> list[dict]:
    """Carrega e normaliza registos EN/PT a partir do CSV público."""
    records: list[dict] = []
    counters = {"en": 0, "pt": 0}

    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            original_label = (row.get("labels") or "").strip().lower()
            if original_label not in {"ham", "spam"}:
                continue

            en_text = clean_text(row.get("text", ""))
            pt_text = clean_text(row.get("text_pt", ""))

            if en_text and (max_samples_per_language is None or counters["en"] < max_samples_per_language):
                label_id = classify_label(original_label, en_text)
                records.append(
                    {
                        "text": en_text,
                        "label": label_id,
                        "label_name": LABEL_NAMES[label_id],
                        "language": "en",
                        "source": "mnarrissa/Multilingual-Spam-Classification",
                    }
                )
                counters["en"] += 1

            if pt_text and (max_samples_per_language is None or counters["pt"] < max_samples_per_language):
                label_id = classify_label(original_label, pt_text)
                records.append(
                    {
                        "text": pt_text,
                        "label": label_id,
                        "label_name": LABEL_NAMES[label_id],
                        "language": "pt",
                        "source": "mnarrissa/Multilingual-Spam-Classification",
                    }
                )
                counters["pt"] += 1

            if max_samples_per_language is not None:
                if counters["en"] >= max_samples_per_language and counters["pt"] >= max_samples_per_language:
                    break

    return records


def write_dataset(records: list[dict], output_path: str) -> None:
    """Escreve dataset normalizado para CSV."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["text", "label", "label_name", "language", "source"],
        )
        writer.writeheader()
        writer.writerows(records)


def write_corpus(records: list[dict], output_path: str) -> None:
    """Gera corpus.txt a partir do texto do dataset."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    seen = set()
    with open(output_path, "w", encoding="utf-8") as f:
        for record in records:
            text = record["text"]
            if text and text not in seen:
                seen.add(text)
                f.write(text + "\n\n")


def print_stats(records: list[dict], dataset_path: str, corpus_path: str) -> None:
    """Mostra estatísticas básicas da preparação."""
    lang_counter = Counter(r["language"] for r in records)
    label_counter = Counter(r["label_name"] for r in records)

    print("\n" + "=" * 80)
    print("PREPARAÇÃO CONCLUÍDA")
    print("=" * 80)
    print(f"Registos totais: {len(records):,}")
    print("\nPor idioma:")
    for lang, count in sorted(lang_counter.items()):
        print(f"  - {lang}: {count:,}")

    print("\nPor classe:")
    for label, count in sorted(label_counter.items()):
        print(f"  - {label}: {count:,}")

    print(f"\nDataset: {dataset_path} ({Path(dataset_path).stat().st_size / 1024:.1f} KB)")
    print(f"Corpus:  {corpus_path} ({Path(corpus_path).stat().st_size / 1024:.1f} KB)")


def main(
    dataset_output_path: str = "data/dataset.csv",
    corpus_output_path: str = "data/corpus.txt",
    max_samples_per_language: int | None = 10000,
) -> bool:
    """Pipeline completo: download -> normalização -> dataset/corpus."""

    print("=" * 80)
    print("PREPARAÇÃO DE DADOS (EN/PT)")
    print("=" * 80)

    raw_csv_path = "data/raw/multilingual_spam.csv"

    try:
        download_dataset(DATASET_URL, raw_csv_path)
        records = load_records(raw_csv_path, max_samples_per_language=max_samples_per_language)

        if not records:
            print("\n✗ Nenhum registo válido encontrado no dataset público.")
            return False

        write_dataset(records, dataset_output_path)
        write_corpus(records, corpus_output_path)
        print_stats(records, dataset_output_path, corpus_output_path)
        return True

    except Exception as e:
        print(f"\n✗ Erro durante preparação: {e}")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Preparar dataset e corpus EN/PT.")
    parser.add_argument("--dataset-output", default="data/dataset.csv")
    parser.add_argument("--corpus-output", default="data/corpus.txt")
    parser.add_argument(
        "--max-samples-per-language",
        type=int,
        default=10000,
        help="Máximo de amostras por idioma (default: 10000). Use <=0 para sem limite.",
    )
    args = parser.parse_args()

    max_samples = args.max_samples_per_language
    if max_samples is not None and max_samples <= 0:
        max_samples = None

    success = main(
        dataset_output_path=args.dataset_output,
        corpus_output_path=args.corpus_output,
        max_samples_per_language=max_samples,
    )
    raise SystemExit(0 if success else 1)
