"""OWASP Top 10 for LLM Applications 2026 (OWASP GenAI Security Project).

Ingested from the project's source repository at a PINNED commit with PINNED
digests (byte-reproducible, tamper-evident builds). The 2026 edition has no
per-risk pages on genai.owasp.org yet, so citations deep-link to the exact
markdown file at that commit in the OWASP-owned repository — the primary
source of the text. License: CC BY-SA 4.0 (attribution kept in the manifest).
"""
from __future__ import annotations

import re
from pathlib import Path

from ..fetch import Source, fetch_verified
from ..schema import Chunk, SourceRef

REPO = "genai-security-project/GenAI-LLM-Top10"
COMMIT = "9253e38ade58e959b531c0c5c9a4842272c9cd0e"   # 2026/final, 2026-08-26 (Zenodo DOI release)
EDITION = "2026"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/{COMMIT}/{EDITION}/final"
CITE_BASE = f"https://github.com/{REPO}/blob/{COMMIT}/{EDITION}/final"
VERSION = f"2026 edition (published 2026-08-04; source git {COMMIT[:12]})"
LICENSE = "OWASP Top 10 for LLM Applications 2026 © OWASP Foundation / OWASP GenAI Security Project, CC BY-SA 4.0."

# file name → sha256 of the raw markdown at COMMIT
RISK_FILES: dict[str, str] = {
    "LLM01_PromptInjection.md": "ff036047755c505e6d7837a0114f6056f8f751a3628061b6711b6eac19e1f8b0",
    "LLM02_SensitiveInformationDisclosure.md": "009153f4880fdabd79585cf1b74e60e2dfe79668c5581853890aa2bec36ab05e",
    "LLM03_ExcessiveAgency.md": "e961d0d9fe8382be4086aaddd65c1fad0d5d53220174493fe8c287f864c0529e",
    "LLM04_SupplyChain.md": "b5cb83fe937ecf38b8017918ac90b378da6d9c8ec9e2b485f422c08e4d66ac9e",
    "LLM05_DataModelPoisoning.md": "28ba5d86c102c82916066aae4bde2c10605cdb98cca51f572093ba002d2a198d",
    "LLM06_UnboundedConsumption.md": "e121147737d4750f89466fe191b5581fe71a822d8e1cfb621ea91d0d6a1dc6d5",
    "LLM07_Misinformation.md": "5686479c061cd2057b9905775ce70fc92b1b26e9daf296928521d56837ad4732",
    "LLM08_HiddenContextExposure.md": "e00d214f81757f626510df57e92116bec026b6c31ef7c3fb2bb52b71318c5ffe",
    "LLM09_VectorAndEmbeddingWeaknesses.md": "e1a3aff504a708d46c5dbf1c4bbc9ae05f3206cc6ea8e6e9d544b3f0d0ff7c23",
    "LLM10_ImproperOutputHandling.md": "d61a5ca0eddb38cdd0f485d642ed263c259638e2f1cf82eb1563c064491d67f0",
}
SOURCES: list[Source] = [
    Source(url=f"{RAW_BASE}/{name}", revision=f"git {COMMIT}", sha256=digest, cache_name=f"owasp_llm_2026/{name}")
    for name, digest in RISK_FILES.items()
]
SKIP_SECTIONS = {"reference links", "references", "related frameworks and taxonomies"}

_WS = re.compile(r"[ \t]+")
_MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_MD_EMPH = re.compile(r"(\*{1,3}|_{1,3})(\S(?:.*?\S)?)\1")
_LIST_PREFIX = re.compile(r"^(?:[-*+]|\d+[.)])\s+")


def clean_markdown(md: str) -> str:
    md = _MD_LINK.sub(r"\1", md)
    md = _MD_EMPH.sub(r"\2", md)
    md = md.replace("`", "")
    lines = [_LIST_PREFIX.sub("", _WS.sub(" ", line).strip()) for line in md.splitlines()]
    return "\n".join(line for line in lines if line).strip()


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def parse_risk(md: str, page_url: str) -> list[Chunk]:
    heading = re.search(r"^##\s+(LLM(\d{2}):(\d{4}))\s+(.+)$", md, re.M)
    if not heading:
        raise RuntimeError("OWASP: risk heading not found")
    code, num, year, name = heading.group(1), heading.group(2), heading.group(3), heading.group(4).strip()
    if year != EDITION:
        raise RuntimeError(f"OWASP: expected {EDITION} edition, found {code}")
    title = f"{code} {name}"
    parts = re.split(r"^###\s+(.+)$", md[heading.end():], flags=re.M)
    chunks: list[Chunk] = []
    for i in range(1, len(parts), 2):
        section = parts[i].strip()
        if section.lower() in SKIP_SECTIONS:
            continue
        body = re.sub(r"^####\s+(.+)$", r"\1:", parts[i + 1], flags=re.M)
        text = clean_markdown(body)
        if not text:
            continue
        chunks.append(Chunk(
            id=f"llm{num}_{_slug(section)}",
            ref=f"{code} — {section}",
            title=title,
            text=text,
            url=page_url,
        ))
    return chunks


def ingest(raw_dir: Path) -> tuple[list[Chunk], list[SourceRef]]:
    chunks: list[Chunk] = []
    for source in SOURCES:
        data = fetch_verified(source, raw_dir)
        filename = source.cache_name.rsplit("/", 1)[-1]
        chunks.extend(parse_risk(data.decode("utf-8"), f"{CITE_BASE}/{filename}"))
    return chunks, [s.ref() for s in SOURCES]
