"""Model manifest. Only HTTPS URLs on the listed hosts may be fetched."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse


class ManifestError(Exception):
    pass


@dataclass(frozen=True)
class ModelFile:
    id: str
    url: str
    sha256: str
    bytes: int


def load_manifest(path: Path) -> list[ModelFile]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    files = []
    for item in raw.get("files", []):
        files.append(
            ModelFile(
                id=str(item["id"]),
                url=str(item["url"]),
                sha256=str(item.get("sha256", "")).lower(),
                bytes=int(item.get("bytes", 0)),
            )
        )
    return files


def assert_allowed(url: str, allowed_hosts: set[str]) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ManifestError("model URLs are https only")
    host = (parsed.hostname or "").lower()
    if host not in {item.lower() for item in allowed_hosts}:
        raise ManifestError(f"host is not in the manifest allow list: {host}")


def manifest_is_complete(files: list[ModelFile]) -> bool:
    if len(files) < 2:
        return False
    return all(item.sha256 and item.bytes > 0 and item.url.startswith("https://") for item in files)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def require_hash(path: Path, expected: str) -> None:
    actual = sha256_file(path)
    if actual != expected.lower():
        path.unlink(missing_ok=True)
        raise ManifestError("the model file did not match its pinned hash")
