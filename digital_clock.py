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


def main() -> None:
    parser = argparse.ArgumentParser(description="Mostrar relógio digital multi-fuso.")
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Intervalo de atualização em segundos (default: 1.0).",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=None,
        help="Número de atualizações antes de terminar (default: contínuo).",
    )
    args = parser.parse_args()

    updates = 0
    while True:
        print("\033[2J\033[H", end="")
        print(render_clock())
        updates += 1
        if args.iterations is not None and updates >= args.iterations:
            break
        time.sleep(max(args.interval, 0.1))


if __name__ == "__main__":
    main()
