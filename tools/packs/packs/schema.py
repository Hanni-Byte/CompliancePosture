"""Pack schema — mirrored by zod in app/src/adapters/retrieval/pack-schema.ts.

Field names are camelCase on purpose: they are the JSON contract. Any change
here must land together with the zod mirror (CI cross-validates both).

Evolution policy: objects are strict on both sides (unknown field = reject),
so `schemaVersion` is the only compatibility signal. Bump the major when an
app built for version N can no longer read the pack; the app reports
`unsupported_version` instead of `invalid` for a newer major.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SCHEMA_VERSION = 1

Framework = Literal[
    "EU_AI_ACT", "GDPR", "OWASP_LLM_TOP_10", "OWASP_AGENTIC_TOP_10", "NIST_AI_RMF"
]
PackFile = Literal["chunks.json", "topics.json", "crosswalk.json"]

SHA256 = r"^[0-9a-f]{64}$"


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Chunk(Strict):
    id: str = Field(min_length=1, pattern=r"^[a-z0-9_.-]+$")
    ref: str = Field(min_length=1)          # human citation anchor, e.g. "Art. 26(1)"
    title: str = Field(min_length=1)
    text: str = Field(min_length=1)
    url: str = Field(pattern=r"^https://")  # primary-source deep link


class Topic(Strict):
    id: str = Field(min_length=1, pattern=r"^[a-z0-9_]+$")
    title: str = Field(min_length=1)
    seedQueries: list[str] = Field(min_length=1)
    dependsOnSlots: list[str] = Field(default_factory=list)
    # ISO date from which the obligations in this topic apply; omitted = already
    # applicable / not date-gated. A finding must never cite an obligation
    # that is not yet in force (HANDOFF §6).
    appliesFrom: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    notes: str | None = None


class CrosswalkLink(Strict):
    framework: str = Field(min_length=1)    # label as used by the crosswalk source
    frameworkId: Framework | None = None    # our pack framework id when we have one
    ref: str = Field(min_length=1)          # e.g. "Art. 15 — …", "GV-1.7"
    title: str = Field(min_length=1)
    tier: str | None = None
    url: str | None = Field(default=None, pattern=r"^https?://")
    notes: str | None = None
    packId: str | None = None               # target pack when resolvable
    chunkIds: list[str] = Field(default_factory=list)  # resolved chunk ids in packId


class Incident(Strict):
    name: str = Field(min_length=1)
    year: int | None = None
    incidentId: str | None = None


class CrosswalkEntry(Strict):
    entryId: str = Field(min_length=1, pattern=r"^[a-z0-9_]+$")   # e.g. "llm01"
    name: str = Field(min_length=1)
    severity: str | None = None
    sourceUrl: str = Field(pattern=r"^https://")
    links: list[CrosswalkLink]
    incidents: list[Incident] = Field(default_factory=list)


class SourceRef(Strict):
    url: str = Field(pattern=r"^https://")
    revision: str = Field(min_length=1)     # OJ date, git commit, ...
    sha256: str = Field(pattern=SHA256)     # pinned digest of the raw bytes ingested


class Manifest(Strict):
    schemaVersion: Literal[1] = SCHEMA_VERSION
    id: str = Field(min_length=1, pattern=r"^[a-z0-9_]+$")
    framework: Framework
    name: str = Field(min_length=1)
    version: str = Field(min_length=1)      # consolidated-version string shown in reports
    sources: list[SourceRef] = Field(min_length=1)
    license: str = Field(min_length=1)
    chunkCount: int = Field(ge=1)
    topicCount: int = Field(ge=1)
    # sha256 of the sibling files, keyed by file name. The app fails closed on
    # mismatch. No wall-clock fields anywhere: builds are byte-reproducible.
    files: dict[PackFile, str]

    @model_validator(mode="after")
    def _files(self) -> Manifest:
        import re
        for name, digest in self.files.items():
            if not re.fullmatch(SHA256, digest):
                raise ValueError(f"files[{name}] is not a sha256 hex digest")
        for required in ("chunks.json", "topics.json"):
            if required not in self.files:
                raise ValueError(f"manifest.files must list {required}")
        return self


class PackSummary(Strict):
    """One row of packs/index.json — the catalogue the app lists packs from."""
    id: str = Field(min_length=1, pattern=r"^[a-z0-9_]+$")
    framework: Framework
    name: str = Field(min_length=1)
    version: str = Field(min_length=1)
    license: str = Field(min_length=1)
    chunkCount: int = Field(ge=1)


class PackIndex(Strict):
    schemaVersion: Literal[1] = SCHEMA_VERSION
    packs: list[PackSummary] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique(self) -> PackIndex:
        ids = [p.id for p in self.packs]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate pack ids in index")
        return self


class Pack(Strict):
    manifest: Manifest
    chunks: list[Chunk]
    topics: list[Topic]
    crosswalk: list[CrosswalkEntry] | None = None

    @model_validator(mode="after")
    def _cross_checks(self) -> Pack:
        if ("crosswalk.json" in self.manifest.files) != (self.crosswalk is not None):
            raise ValueError("crosswalk.json listed in manifest but missing, or vice versa")
        if self.crosswalk is not None:
            topic_ids = {t.id for t in self.topics}
            for entry in self.crosswalk:
                if not any(t == entry.entryId or t.startswith(entry.entryId + "_") for t in topic_ids):
                    raise ValueError(f"crosswalk entry {entry.entryId} has no matching topic")
        ids = [c.id for c in self.chunks]
        if len(ids) != len(set(ids)):
            dupes = sorted({i for i in ids if ids.count(i) > 1})
            raise ValueError(f"duplicate chunk ids: {dupes}")
        tids = [t.id for t in self.topics]
        if len(tids) != len(set(tids)):
            raise ValueError("duplicate topic ids")
        if self.manifest.chunkCount != len(self.chunks):
            raise ValueError("manifest.chunkCount does not match chunks.json")
        if self.manifest.topicCount != len(self.topics):
            raise ValueError("manifest.topicCount does not match topics.json")
        return self
