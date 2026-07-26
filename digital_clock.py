#!/usr/bin/env python3
"""
Relógio digital simples com múltiplos fusos horários.
"""

import argparse
import time
from datetime import datetime, timedelta, timezone


TIME_ZONES = [
    ("UTC", timezone.utc),
    ("UTC-05:00", timezone(timedelta(hours=-5))),
    ("UTC+01:00", timezone(timedelta(hours=1))),
    ("UTC+09:00", timezone(timedelta(hours=9))),
]


def render_clock() -> str:
    lines = ["Digital Clock (24h)", "-" * 30]
    for label, tz in TIME_ZONES:
        current_time = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
        lines.append(f"{label:>10}  {current_time}")
    lines.append("-" * 30)
    lines.append("Press Ctrl+C to stop.")
    return "\n".join(lines)


def positive_float(value: str) -> float:
    interval = float(value)
    if interval <= 0:
        raise argparse.ArgumentTypeError("Intervalo deve ser maior que 0.")
    return interval


def positive_int(value: str) -> int:
    iterations = int(value)
    if iterations <= 0:
        raise argparse.ArgumentTypeError("Iterations deve ser maior que 0.")
    return iterations


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Mostrar relógio digital multi-fuso.")
    parser.add_argument(
        "--interval",
        type=positive_float,
        default=1.0,
        help="Intervalo de atualização em segundos (default: 1.0).",
    )
    parser.add_argument(
        "--iterations",
        type=positive_int,
        default=None,
        help="Número de atualizações antes de terminar (default: contínuo).",
    )
    return parser.parse_args(argv)


def run_clock(interval: float, iterations=None, clear_screen: bool = True, sleep_fn=time.sleep, print_fn=print) -> None:
    updates = 0
    while True:
        if clear_screen:
            print_fn("\033[2J\033[H", end="")
        print_fn(render_clock())
        updates += 1
        if iterations is not None and updates >= iterations:
            break
        sleep_fn(interval)


def main(argv=None) -> None:
    args = parse_args(argv)
    run_clock(interval=args.interval, iterations=args.iterations)


if __name__ == "__main__":
    main()
