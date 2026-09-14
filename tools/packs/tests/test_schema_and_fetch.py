import hashlib
from pathlib import Path

import pytest
from pydantic import ValidationError

from packs.fetch import Source, SourceIntegrityError, fetch_verified
from packs.schema import Chunk, CrosswalkEntry, Manifest, Pack, Topic

SHA = "a" * 64


def manifest(**over) -> Manifest:
    base = dict(id="p", framework="EU_AI_ACT", name="n", version="v", license="l", chunkCount=1, topicCount=1,
                sources=[{"url": "https://s", "revision": "r", "sha256": SHA}],
                files={"chunks.json": SHA, "topics.json": SHA})
    return Manifest.model_validate({**base, **over})


def chunk(cid="c") -> Chunk:
    return Chunk(id=cid, ref="Art. 1", title="t", text="x", url="https://u")


def topic(tid="llm01_x") -> Topic:
    return Topic(id=tid, title="t", seedQueries=["q"])


def test_manifest_requires_chunks_and_topics_and_hex_digests():
    with pytest.raises(ValidationError, match="must list topics.json"):
        manifest(files={"chunks.json": SHA})
    with pytest.raises(ValidationError, match="not a sha256"):
        manifest(files={"chunks.json": "zz", "topics.json": SHA})
    with pytest.raises(ValidationError):
        manifest(schemaVersion=2)


def test_pack_cross_checks_mirror_the_zod_invariants():
    Pack(manifest=manifest(), chunks=[chunk()], topics=[topic()])
    with pytest.raises(ValidationError, match="duplicate chunk ids"):
        Pack(manifest=manifest(chunkCount=2), chunks=[chunk(), chunk()], topics=[topic()])
    with pytest.raises(ValidationError, match="chunkCount"):
        Pack(manifest=manifest(chunkCount=5), chunks=[chunk()], topics=[topic()])
    with pytest.raises(ValidationError, match="crosswalk.json listed"):
        Pack(manifest=manifest(files={"chunks.json": SHA, "topics.json": SHA, "crosswalk.json": SHA}),
             chunks=[chunk()], topics=[topic()])
    with pytest.raises(ValidationError, match="no matching topic"):
        Pack(manifest=manifest(files={"chunks.json": SHA, "topics.json": SHA, "crosswalk.json": SHA}),
             chunks=[chunk()], topics=[topic()],
             crosswalk=[CrosswalkEntry(entryId="llm09", name="n", sourceUrl="https://x", links=[])])


def test_source_rejects_http_and_bad_pins():
    with pytest.raises(ValueError, match="must be https"):
        Source(url="http://x", revision="r", sha256=SHA, cache_name="x")
    with pytest.raises(ValueError, match="bad sha256"):
        Source(url="https://x", revision="r", sha256="short", cache_name="x")


def test_fetch_verified_refuses_a_poisoned_cache(tmp_path: Path):
    data = b"legit"
    src = Source(url="https://unused.invalid/x", revision="r", sha256=hashlib.sha256(data).hexdigest(), cache_name="x")
    (tmp_path / "x").write_bytes(data)
    assert fetch_verified(src, tmp_path) == data
    (tmp_path / "x").write_bytes(b"tampered")
    with pytest.raises(SourceIntegrityError, match="does not match the pinned digest"):
        fetch_verified(src, tmp_path)
