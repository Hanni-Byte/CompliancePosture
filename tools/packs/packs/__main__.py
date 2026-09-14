import argparse
import sys
from pathlib import Path

from .build import PACKS, build, check, validate


def main() -> int:
    p = argparse.ArgumentParser(prog="packs", description="CompliancePosture knowledge-pack pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="ingest → chunk → link → emit into --out")
    b.add_argument("--out", type=Path, required=True)
    b.add_argument("--raw", type=Path, default=Path("raw"), help="raw-source cache dir")
    b.add_argument("--pack", action="append", choices=sorted(PACKS), help="limit to pack id(s)")

    v = sub.add_parser("validate", help="validate committed packs against the schema + checksums")
    v.add_argument("root", type=Path)

    c = sub.add_parser("check", help="reproducibility: fresh build must equal committed packs")
    c.add_argument("root", type=Path)
    c.add_argument("--raw", type=Path, default=Path("raw"))

    a = p.parse_args()
    if a.cmd == "build":
        build(a.out, a.raw, a.pack)
        return 0
    if a.cmd == "validate":
        return validate(a.root)
    return check(a.root, a.raw)


if __name__ == "__main__":
    sys.exit(main())
