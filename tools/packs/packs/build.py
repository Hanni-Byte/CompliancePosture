"""ingest → normalize → chunk → link → emit, plus validate/check commands.

Packs are built in dependency order (`PackDef.depends_on`): a pack whose
crosswalk resolves citations into another pack receives that pack's chunks.
`build()` also emits `index.json`, the catalogue the app lists packs from —
the pipeline is the single source of truth for "which packs exist".
"""
from __future__ import annotations

import importlib.resources as resources
import json
import sys
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from graphlib import TopologicalSorter
from pathlib import Path

from pydantic import ValidationError

from .emit import dumps, sha256_bytes, write
from .fetch import SourceIntegrityError
from .schema import (
    SCHEMA_VERSION,
    Chunk,
    CrosswalkEntry,
    Framework,
    Manifest,
    Pack,
    PackFile,
    PackIndex,
    PackSummary,
    SourceRef,
    Topic,
)
from .sources import crosswalk, eu_ai_act, owasp_llm

IngestFn = Callable[[Path], tuple[list[Chunk], list[SourceRef]]]
CrosswalkFn = Callable[[Path, dict[str, list[Chunk]]], tuple[list[CrosswalkEntry], list[SourceRef]]]


@dataclass(frozen=True)
class PackDef:
    id: str
    framework: Framework
    name: str
    version: str
    license: str
    topics_file: str
    ingest: IngestFn
    # Optional sidecar: cross-framework links resolved against built packs.
    crosswalk: CrosswalkFn | None = None
    depends_on: tuple[str, ...] = ()


PACKS: dict[str, PackDef] = {
    "eu_ai_act": PackDef(
        id="eu_ai_act",
        framework="EU_AI_ACT",
        name="EU Artificial Intelligence Act — Regulation (EU) 2024/1689",
        version=eu_ai_act.REVISION,
        license=eu_ai_act.LICENSE,
        topics_file="eu_ai_act.json",
        ingest=eu_ai_act.ingest,
    ),
    "owasp_llm_top10": PackDef(
        id="owasp_llm_top10",
        framework="OWASP_LLM_TOP_10",
        name="OWASP Top 10 for LLM Applications 2026",
        version=owasp_llm.VERSION,
        license=f"{owasp_llm.LICENSE} Crosswalk: {crosswalk.LICENSE}",
        topics_file="owasp_llm_top10.json",
        ingest=owasp_llm.ingest,
        crosswalk=crosswalk.ingest,
        depends_on=("eu_ai_act",),
    ),
}

PACK_FILES: tuple[str, ...] = ("manifest.json", "chunks.json", "topics.json", "crosswalk.json")


def build_order(only: list[str] | None = None) -> list[str]:
    """Selected packs plus their dependencies, in topological order."""
    wanted = set(only) if only else set(PACKS)
    frontier = list(wanted)
    while frontier:
        pid = frontier.pop()
        for dep in PACKS[pid].depends_on:
            if dep not in wanted:
                wanted.add(dep)
                frontier.append(dep)
    ts = TopologicalSorter({pid: set(PACKS[pid].depends_on) for pid in wanted})
    return list(ts.static_order())


def _load_topics(name: str) -> list[Topic]:
    raw = resources.files("packs.topics").joinpath(name).read_text(encoding="utf-8")
    return [Topic.model_validate(t) for t in json.loads(raw)]


def build_pack(defn: PackDef, raw_dir: Path, built: dict[str, list[Chunk]]) -> tuple[dict[str, bytes], list[Chunk]]:
    chunks, sources = defn.ingest(raw_dir)
    topics = _load_topics(defn.topics_file)
    chunks_bytes = dumps([c.model_dump() for c in chunks])
    topics_bytes = dumps([t.model_dump(exclude_none=True) for t in topics])
    files_hash: dict[PackFile, str] = {
        "chunks.json": sha256_bytes(chunks_bytes),
        "topics.json": sha256_bytes(topics_bytes),
    }
    out_files: dict[str, bytes] = {"chunks.json": chunks_bytes, "topics.json": topics_bytes}
    entries: list[CrosswalkEntry] | None = None
    if defn.crosswalk is not None:
        entries, crosswalk_sources = defn.crosswalk(raw_dir, built)
        sources = [*sources, *crosswalk_sources]
        crosswalk_bytes = dumps([e.model_dump(exclude_none=True) for e in entries])
        files_hash["crosswalk.json"] = sha256_bytes(crosswalk_bytes)
        out_files["crosswalk.json"] = crosswalk_bytes
    manifest = Manifest(
        schemaVersion=SCHEMA_VERSION,
        id=defn.id,
        framework=defn.framework,
        name=defn.name,
        version=defn.version,
        sources=sources,
        license=defn.license,
        chunkCount=len(chunks),
        topicCount=len(topics),
        files=files_hash,
    )
    # Re-validate the whole pack through the same model the validator uses.
    Pack(manifest=manifest, chunks=chunks, topics=topics, crosswalk=entries)
    return {"manifest.json": dumps(manifest.model_dump()), **out_files}, chunks


def build(out: Path, raw_dir: Path, only: list[str] | None = None) -> None:
    built: dict[str, list[Chunk]] = {}
    manifests: list[Manifest] = []
    for pid in build_order(only):
        defn = PACKS[pid]
        files, chunks = build_pack(defn, raw_dir, built)
        built[pid] = chunks
        manifests.append(Manifest.model_validate_json(files["manifest.json"]))
        if only and pid not in only:
            continue  # dependency built for resolution only, not emitted
        for name, data in files.items():
            write(out / pid / name, data)
        extra = " + crosswalk" if "crosswalk.json" in files else ""
        print(f"built {pid}: {len(chunks)} chunks{extra} → {out / pid}")
    if not only:
        index = PackIndex(packs=[
            PackSummary(id=m.id, framework=m.framework, name=m.name, version=m.version,
                        license=m.license, chunkCount=m.chunkCount)
            for m in manifests
        ])
        write(out / "index.json", dumps(index.model_dump()))
        print(f"wrote {out / 'index.json'} ({len(index.packs)} packs)")


def validate_dir(pack_dir: Path) -> Pack:
    """Loads and validates a committed pack; raises on any inconsistency."""
    manifest = Manifest.model_validate_json((pack_dir / "manifest.json").read_bytes())
    if manifest.id != pack_dir.name:
        raise ValueError(f"manifest id {manifest.id!r} != directory name {pack_dir.name!r}")
    files: dict[str, bytes] = {}
    for name, expected in manifest.files.items():
        path = pack_dir / name
        if not path.exists():
            raise ValueError(f"{pack_dir.name}/{name} listed in manifest but missing")
        data = path.read_bytes()
        actual = sha256_bytes(data)
        if actual != expected:
            raise ValueError(f"{pack_dir.name}/{name}: sha256 {actual} != manifest {expected}")
        files[name] = data
    for stray in sorted(p.name for p in pack_dir.iterdir()):
        if stray != "manifest.json" and stray not in files:
            raise ValueError(f"{pack_dir.name}/{stray} is not listed in the manifest")
    return Pack(
        manifest=manifest,
        chunks=[Chunk.model_validate(c) for c in json.loads(files["chunks.json"])],
        topics=[Topic.model_validate(t) for t in json.loads(files["topics.json"])],
        crosswalk=(
            [CrosswalkEntry.model_validate(e) for e in json.loads(files["crosswalk.json"])]
            if "crosswalk.json" in files else None
        ),
    )


def validate(root: Path) -> int:
    status = 0
    pack_dirs = sorted(p for p in root.iterdir() if (p / "manifest.json").exists())
    loaded: dict[str, Pack] = {}
    for pack_dir in pack_dirs:
        try:
            pack = validate_dir(pack_dir)
            loaded[pack_dir.name] = pack
            print(f"ok {pack_dir.name}: {len(pack.chunks)} chunks, {len(pack.topics)} topics")
        except (ValidationError, ValueError, KeyError, OSError) as e:
            print(f"FAIL {pack_dir.name}: {e}", file=sys.stderr)
            status = 1
    # Cross-pack: crosswalk chunk ids must exist in their target pack.
    for pid, pack in loaded.items():
        for entry in pack.crosswalk or []:
            for link in entry.links:
                if link.packId is None:
                    continue
                target = loaded.get(link.packId)
                target_ids = {c.id for c in target.chunks} if target else set()
                for cid in link.chunkIds:
                    if cid not in target_ids:
                        print(f"FAIL {pid}: crosswalk {entry.entryId} → {link.packId}/{cid} missing", file=sys.stderr)
                        status = 1
    # Catalogue must match the packs on disk.
    index_path = root / "index.json"
    try:
        index = PackIndex.model_validate_json(index_path.read_bytes())
        listed = {p.id for p in index.packs}
        if listed != set(loaded) or status:
            if listed != set(loaded):
                print(f"FAIL index.json lists {sorted(listed)} but packs on disk are {sorted(loaded)}", file=sys.stderr)
                status = 1
        else:
            print(f"ok index.json: {len(index.packs)} packs")
    except (ValidationError, ValueError, OSError) as e:
        print(f"FAIL index.json: {e}", file=sys.stderr)
        status = 1
    return status


def check(root: Path, raw_dir: Path) -> int:
    """Reproducibility gate: a fresh build must be byte-identical to `root`, both ways."""
    status = 0
    with tempfile.TemporaryDirectory() as tmp:
        fresh = Path(tmp)
        try:
            build(fresh, raw_dir)
        except SourceIntegrityError as e:
            print(f"FAIL source integrity: {e}", file=sys.stderr)
            return 1
        fresh_files = sorted(p.relative_to(fresh) for p in fresh.rglob("*") if p.is_file())
        committed_files = sorted(p.relative_to(root) for p in root.rglob("*") if p.is_file())
        for rel in sorted(set(fresh_files) | set(committed_files)):
            a, b = fresh / rel, root / rel
            if not a.exists():
                print(f"DRIFT {rel}: present in committed packs but not produced by a fresh build", file=sys.stderr)
                status = 1
            elif not b.exists():
                print(f"DRIFT {rel}: produced by a fresh build but not committed — rerun `make packs`", file=sys.stderr)
                status = 1
            elif a.read_bytes() != b.read_bytes():
                print(f"DRIFT {rel}: committed pack differs from a fresh build — rerun `make packs`", file=sys.stderr)
                status = 1
    if status == 0:
        print("ok: committed packs are byte-identical to a fresh build")
    return status
