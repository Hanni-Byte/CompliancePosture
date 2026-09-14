"""Source ingesters.

Each module pins its upstream as `Source` descriptors (url, revision, sha256)
and exposes `ingest(raw_dir) -> (chunks, sources)`. A crosswalk-style module
exposes `ingest(raw_dir, built) -> (entries, sources)` where `built` maps
already-built pack ids to their chunks.
"""
