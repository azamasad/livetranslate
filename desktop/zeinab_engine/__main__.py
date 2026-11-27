"""Run zeinab-engine on stdin and stdout. No listening socket."""

from __future__ import annotations

import sys

from zeinab_engine.engine import Engine, SpeechOutcome, serve


def main() -> None:
    engine = Engine(
        recognize=lambda _samples: SpeechOutcome(""),
        translate=lambda text: "",
    )
    sys.stdout.buffer.write(b"")
    serve(sys.stdin.buffer, sys.stdout.buffer, engine)


if __name__ == "__main__":
    main()
