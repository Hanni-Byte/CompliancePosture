"""OWASP GenAI Security Crosswalk — cross-framework mappings for the LLM Top 10.

Source: genai-security-project/crosswalk `data/entries/LLM01..10.json` at a
PINNED commit with PINNED digests (CC BY-SA 4.0, © OWASP GenAI Data Security
Initiative). We keep the frameworks that matter for this product and, for EU
AI Act rows, resolve the cited article to chunk ids in our own eu_ai_act pack
— so an OWASP finding can carry a real, verifiable AI Act citation (§2.3).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from ..fetch import Source, fetch_verified
from ..schema import Chunk, CrosswalkEntry, CrosswalkLink, Framework, Incident, SourceRef

REPO = "genai-security-project/crosswalk"
COMMIT = "490a7e484dafccde3c171ac2324c7fd32fba0b2b"   # v4.0.0 data, 2026-08-28
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/{COMMIT}/data/entries"
CITE_BASE = f"https://github.com/{REPO}/blob/{COMMIT}/data/entries"
LICENSE = "OWASP GenAI Security Crosswalk © 2026 OWASP GenAI Data Security Initiative, CC BY-SA 4.0."
TARGET_PACK = "eu_ai_act"

# Crosswalk framework label → our framework id (None = kept, no pack of ours).
# Presence in this table is what selects a framework for the sidecar.
FRAMEWORK_ID_BY_LABEL: dict[str, Framework | None] = {
    "EU AI Act": "EU_AI_ACT",
    "EU AI Act Code of Practice": None,
    "NIST AI RMF 1.0": "NIST_AI_RMF",
    "ISO/IEC 42001:2023": None,
    "ISO/IEC 27001:2022": None,
    "DORA": None,
    "MITRE ATLAS": None,
}
ENTRY_DIGESTS: dict[str, str] = {
    "LLM01": "1b278e628c7a64a941a1b515c680cd7d5d99cb3b0079147a52974e9cb3c2206b",
    "LLM02": "44919a0abe846266908e13ad0892105246334f4fb939a86fbbdf9f9371aadade",
    "LLM03": "6f74dd2ee2f364763d7336f37712cd64712aff83386d05cd187b4e9ad3f1121d",
    "LLM04": "dd95c4af8853363eb0cf7a0a86572fcfdc3ab7af06791ebae9b584897ef4f35a",
    "LLM05": "cea7434347891885845158d0d73313566d7c1be21e93957cfe4b39c40716d46f",
    "LLM06": "411bfc290fde252cfcc879df77592c3c8c1c4ce0f5f2c5e225d075e85fff2597",
    "LLM07": "f0a45b1836199f111b07abe1f1d3d91fff31f25090fe438ccbaa8fea537953d8",
    "LLM08": "4de6dc33a09a61f59b5e38ff7a33b8cc4eef32718b40f3800a4bda451ad83306",
    "LLM09": "a36d1d1a765a01a0c64e8b782877c04b80df461ce44f6185cd4738b724f6d0ae",
    "LLM10": "2dc42de4f841f0ce899b0eac17e3a690b29635f092d898f517389bf94ef1900e",
}
SOURCES: list[Source] = [
    Source(url=f"{RAW_BASE}/{entry}.json", revision=f"git {COMMIT}", sha256=digest,
           cache_name=f"crosswalk/{entry}.json")
    for entry, digest in ENTRY_DIGESTS.items()
]

_ART = re.compile(r"^Art\.\s*(\d+)(?:\((\d+)\))?")


def resolve_ai_act(ref: str, ai_act_ids: set[str]) -> list[str]:
    """'Art. 55(1)(b) — …' → ['art_55_1'] (paragraph chunk) or ['art_55'] (whole)."""
    match = _ART.match(ref)
    if not match:
        return []
    art, para = match.group(1), match.group(2)
    if para and f"art_{art}_{para}" in ai_act_ids:
        return [f"art_{art}_{para}"]
    if f"art_{art}" in ai_act_ids:
        return [f"art_{art}"]
    # Split article, paragraph not given: cite every paragraph of the article.
    return sorted(i for i in ai_act_ids if re.fullmatch(rf"art_{art}_\d+", i))


def parse_entry(entry_id: str, raw: bytes, ai_act_ids: set[str]) -> CrosswalkEntry:
    entry = json.loads(raw)
    if entry.get("source_list") != "LLM-Top10-2026":
        raise RuntimeError(f"crosswalk {entry_id}: unexpected source_list {entry.get('source_list')}")
    links: list[CrosswalkLink] = []
    for mapping in entry.get("mappings", []):
        framework_label = mapping.get("framework", "")
        if framework_label not in FRAMEWORK_ID_BY_LABEL:
            continue
        # The crosswalk swaps id/name for EU AI Act rows: the article lives in
        # control_name and the obligation sentence in control_id.
        is_ai_act = framework_label == "EU AI Act"
        if is_ai_act:
            ref, title = mapping.get("control_name", ""), mapping.get("control_id", "")
        else:
            ref, title = mapping.get("control_id", ""), mapping.get("control_name", "")
        if not ref:
            continue
        chunk_ids = resolve_ai_act(ref, ai_act_ids) if is_ai_act else []
        if is_ai_act and not chunk_ids:
            raise RuntimeError(f"crosswalk {entry_id}: could not resolve '{ref}' to an {TARGET_PACK} chunk")
        links.append(CrosswalkLink(
            framework=framework_label,
            frameworkId=FRAMEWORK_ID_BY_LABEL[framework_label],
            ref=ref.strip(),
            title=(title or "").strip() or ref.strip(),
            tier=mapping.get("tier"),
            url=mapping.get("url") or None,
            notes=mapping.get("notes") or None,
            packId=TARGET_PACK if is_ai_act else None,
            chunkIds=chunk_ids,
        ))
    return CrosswalkEntry(
        entryId=entry_id.lower(),
        name=entry["name"],
        severity=entry.get("severity"),
        sourceUrl=f"{CITE_BASE}/{entry_id}.json",
        links=links,
        incidents=[
            Incident(name=i["name"], year=i.get("year"), incidentId=i.get("incident_id"))
            for i in entry.get("incidents", [])
        ],
    )


def ingest(raw_dir: Path, built: dict[str, list[Chunk]]) -> tuple[list[CrosswalkEntry], list[SourceRef]]:
    if TARGET_PACK not in built:
        raise RuntimeError(f"crosswalk needs {TARGET_PACK} to be built first (declare depends_on)")
    ai_act_ids = {c.id for c in built[TARGET_PACK]}
    entries: list[CrosswalkEntry] = []
    for entry_id, source in zip(ENTRY_DIGESTS, SOURCES, strict=True):
        entries.append(parse_entry(entry_id, fetch_verified(source, raw_dir), ai_act_ids))
    return entries, [s.ref() for s in SOURCES]
