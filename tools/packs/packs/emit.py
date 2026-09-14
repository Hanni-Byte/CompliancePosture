"""Deterministic JSON emission: same inputs → byte-identical files."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .fetch import sha256_bytes

__all__ = ["dumps", "sha256_bytes", "write"]


def dumps(obj: Any) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
