"""Length-prefixed JSON frames. A frame is at most 2_000_000 bytes."""

from __future__ import annotations

import json
import struct
from typing import Any, BinaryIO

MAX_FRAME = 2_000_000


class ProtocolError(Exception):
    pass


def encode_frame(payload: dict[str, Any]) -> bytes:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(body) > MAX_FRAME:
        raise ProtocolError("frame is too large")
    return struct.pack("<I", len(body)) + body


def read_frame(stream: BinaryIO) -> dict[str, Any] | None:
    header = _read_exact(stream, 4)
    if header is None:
        return None
    (length,) = struct.unpack("<I", header)
    if length > MAX_FRAME:
        raise ProtocolError("frame is too large")
    body = _read_exact(stream, length)
    if body is None:
        raise ProtocolError("frame ended early")
    value = json.loads(body.decode("utf-8"))
    if not isinstance(value, dict):
        raise ProtocolError("frame is not an object")
    return value


def write_frame(stream: BinaryIO, payload: dict[str, Any]) -> None:
    stream.write(encode_frame(payload))
    stream.flush()


def _read_exact(stream: BinaryIO, size: int) -> bytes | None:
    chunks = []
    remaining = size
    while remaining:
        piece = stream.read(remaining)
        if not piece:
            if not chunks:
                return None
            raise ProtocolError("frame ended early")
        chunks.append(piece)
        remaining -= len(piece)
    return b"".join(chunks)
