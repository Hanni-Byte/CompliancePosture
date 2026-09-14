"""Pinned source descriptors and a verifying fetch-once cache.

A `Source` carries the digest we EXPECT; `fetch_verified` refuses bytes that
do not match, whether they came from the network or from the raw cache. That
turns `SourceRef.sha256` in the manifest from a fingerprint of "whatever was
downloaded" into a verification against a reviewed pin (deep review 2026-09-03,
finding #3). Only https URLs are accepted.
"""
from __future__ import annotations

import hashlib
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .schema import SourceRef

UA = "CompliancePosture-pack-pipeline/0.1 (+https://github.com/Hanni-Byte/CompliancePosture)"


class SourceIntegrityError(RuntimeError):
    """Downloaded or cached bytes do not match the pinned digest."""


@dataclass(frozen=True)
class Source:
    url: str
    revision: str          # OJ date, git commit, ...
    sha256: str            # expected digest of the raw bytes
    cache_name: str        # file name under the raw cache dir
    headers: tuple[tuple[str, str], ...] = ()

    def __post_init__(self) -> None:
        if not self.url.startswith("https://"):
            raise ValueError(f"source must be https: {self.url}")
        if len(self.sha256) != 64:
            raise ValueError(f"bad sha256 pin for {self.url}")

    def ref(self) -> SourceRef:
        return SourceRef(url=self.url, revision=self.revision, sha256=self.sha256)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch_verified(source: Source, raw_dir: Path) -> bytes:
    path = raw_dir / source.cache_name
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        data = path.read_bytes()
        if sha256_bytes(data) != source.sha256:
            raise SourceIntegrityError(
                f"raw cache {path} does not match the pinned digest for {source.url}; "
                "delete it to re-fetch, or update the pin deliberately"
            )
        return data
    req = urllib.request.Request(  # noqa: S310  (https-only, digest-pinned)
        source.url, headers={"User-Agent": UA, **dict(source.headers)}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310  (https-only, digest-pinned)
        if not resp.geturl().startswith("https://"):
            raise SourceIntegrityError(f"{source.url} redirected off https to {resp.geturl()}")
        data = resp.read()
    actual = sha256_bytes(data)
    if actual != source.sha256:
        raise SourceIntegrityError(
            f"{source.url}: downloaded sha256 {actual} != pinned {source.sha256} "
            "(upstream changed, or the transport was tampered with)"
        )
    path.write_bytes(data)
    return data
