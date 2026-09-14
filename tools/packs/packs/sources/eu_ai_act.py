"""EU AI Act — Regulation (EU) 2024/1689, OJ L 2024/1689 of 12 July 2024.

Ingested from the Publications Office Cellar API (D25): the EUR-Lex HTML
front-end answers non-browser clients with an empty HTTP 202 challenge, while
Cellar serves the identical XHTML with the identical anchor ids (art_N, anx_N).
Citations use the human-facing EUR-Lex URL + anchor.

Chunking (stable ref anchors):
  Article ≤ budget ............ one chunk        ref "Art. 26"
  Article with numbered paras . one per paragraph ref "Art. 26(1)"
  Article made of points ...... one per point     ref "Art. 3(1)"   (definitions)
  Annex ≤ budget .............. one chunk        ref "Annex III"
  Annex with points ........... one per point     ref "Annex III, point 1"
  Annex with sections ......... per section/point ref "Annex VIII, Section A, point 1"
"""
from __future__ import annotations

import re
from pathlib import Path

from bs4 import BeautifulSoup, Tag

from ..fetch import Source, fetch_verified
from ..schema import Chunk, SourceRef

CELEX = "32024R1689"
CITE_URL = f"https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:{CELEX}"
REVISION = "OJ L, 2024/1689, 12.7.2024"
LICENSE = (
    "© European Union, 1998-2024. Reuse authorised under Commission Decision "
    "2011/833/EU; source: EUR-Lex (eur-lex.europa.eu)."
)
# The CELEX alias (/resource/celex/32024R1689) answers with a 303 to a plain
# http:// Cellar URL, so we pin the resolved Cellar document itself, which
# serves over https with no redirects. "0006.03" = OJ edition, English.
CELLAR_DOCUMENT = "https://publications.europa.eu/resource/cellar/dc8116a1-3fe6-11ef-865a-01aa75ed71a1.0006.03/DOC_1"
SOURCE = Source(
    url=CELLAR_DOCUMENT,
    revision=REVISION,
    sha256="8f0b656302f9864cc87e040c371f209a9d65ae1a6cecc25ca5eb737e872d721a",
    cache_name=f"{CELEX}.xhtml",
    headers=(("Accept", "application/xhtml+xml"), ("Accept-Language", "eng")),
)
# A unit longer than this is split into one chunk per paragraph/point.
SPLIT_BUDGET = 1800

_WS = re.compile(r"\s+")
_PARA_ID = re.compile(r"\d{3}\.\d{3}")
_SECTION = re.compile(r"^Section\s+([A-Z])\b")


def _norm(text: str) -> str:
    return _WS.sub(" ", text.replace("`", "")).strip()


def _text_of(node: Tag) -> str:
    return _norm(node.get_text(" "))


def _point_of(table: Tag) -> tuple[str, str] | None:
    """A top-level one-row table: td[0] = label ('(1)', '1.', '(a)'), td[1] = text."""
    tr = table.find("tr")
    if tr is None:
        return None
    tds = tr.find_all("td", recursive=False)
    if len(tds) != 2:
        return None
    label = _text_of(tds[0]).strip("().")
    return (label, _text_of(tds[1])) if label else None


def _slug(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", label.lower()) or "p"


def _article_chunks(div: Tag) -> list[Chunk]:
    art_id = div["id"]                      # art_26
    num = art_id.split("_", 1)[1]
    heading = div.find("p", class_="oj-ti-art")
    sub = div.find("p", class_="oj-sti-art")
    title = f"Article {num}"
    if sub is not None:
        title += f" — {_text_of(sub)}"
    url = f"{CITE_URL}#{art_id}"

    paras: list[Tag] = []
    points: list[tuple[str, str]] = []
    body_parts: list[str] = []
    for child in div.children:
        if not isinstance(child, Tag):
            continue
        if child is heading or (child.name == "div" and "eli-title" in child.get("class", [])):
            continue
        if child.name == "div" and _PARA_ID.fullmatch(child.get("id", "")):
            paras.append(child)
        elif child.name == "table":
            point = _point_of(child)
            if point:
                points.append(point)
        text = _text_of(child)
        if text:
            body_parts.append(text)
    full_text = " ".join(body_parts)
    if not full_text:
        return []

    if len(full_text) <= SPLIT_BUDGET:
        return [Chunk(id=art_id, ref=f"Art. {num}", title=title, text=full_text, url=url)]

    if len(paras) >= 2:
        out: list[Chunk] = []
        for para in paras:
            pnum = int(para["id"].split(".")[1])
            text = _text_of(para)
            if text:
                out.append(Chunk(id=f"{art_id}_{pnum}", ref=f"Art. {num}({pnum})", title=title, text=text, url=url))
        return out

    if len(points) >= 2:
        return [
            Chunk(id=f"{art_id}_{_slug(label)}", ref=f"Art. {num}({label})", title=title, text=text, url=url)
            for label, text in points
        ]

    return [Chunk(id=art_id, ref=f"Art. {num}", title=title, text=full_text, url=url)]


def _section_text(
    intro: dict[str | None, list[str]], points: list[tuple[str | None, str, str]], section: str | None
) -> str:
    own_points = " ".join(f"{label}. {text}" for sec, label, text in points if sec == section)
    return " ".join(intro.get(section, [])) + " " + own_points


def _annex_chunks(div: Tag) -> list[Chunk]:
    anx_id = div["id"]                      # anx_III
    roman = anx_id.split("_", 1)[1]
    base_id = anx_id.lower()
    titles = [_text_of(p) for p in div.find_all("p", class_="oj-doc-ti", recursive=False)]
    title = " — ".join(t for t in titles if t) or f"Annex {roman}"
    url = f"{CITE_URL}#{anx_id}"

    # Walk children in order; sections (p.oj-ti-grseq-1 "Section A — …")
    # restart point numbering, so they become part of ref and id.
    section: str | None = None
    intro: dict[str | None, list[str]] = {}
    points: list[tuple[str | None, str, str]] = []   # (section, label, text)
    for child in div.children:
        if not isinstance(child, Tag):
            continue
        if child.name == "p" and "oj-doc-ti" in child.get("class", []):
            continue
        if child.name == "p" and "oj-ti-grseq-1" in child.get("class", []):
            match = _SECTION.match(_text_of(child))
            section = match.group(1) if match else _text_of(child)[:20]
            intro.setdefault(section, []).append(_text_of(child))
            continue
        if child.name == "table":
            point = _point_of(child)
            if point:
                points.append((section, point[0], point[1]))
                continue
        text = _text_of(child)
        if text:
            intro.setdefault(section, []).append(text)

    ordered_sections = list(dict.fromkeys([None, *[sec for sec, _, _ in points]]))
    full_text = _norm(" ".join(_section_text(intro, points, sec) for sec in ordered_sections)) or _text_of(div)
    if len(full_text) <= SPLIT_BUDGET or len(points) < 2:
        return [Chunk(id=base_id, ref=f"Annex {roman}", title=title, text=full_text, url=url)]

    out: list[Chunk] = []
    seen: dict[str, int] = {}
    emitted_intro: set[str | None] = set()
    for sec, label, text in points:
        sec_ref = f"Annex {roman}" + (f", {sec}" if sec else "")
        sec_id = base_id + (f"_{_slug(sec)[:30]}" if sec else "")
        if sec not in emitted_intro:
            emitted_intro.add(sec)
            intro_text = _norm(" ".join(intro.get(sec, [])))
            if intro_text:
                out.append(Chunk(id=f"{sec_id}_intro", ref=sec_ref, title=title, text=intro_text, url=url))
        cid = f"{sec_id}_{_slug(label)}"
        seen[cid] = seen.get(cid, 0) + 1
        if seen[cid] > 1:
            cid = f"{cid}_{seen[cid]}"
        out.append(Chunk(id=cid, ref=f"{sec_ref}, point {label}", title=title, text=text, url=url))
    return out


def chunk_document(xhtml: bytes) -> list[Chunk]:
    soup = BeautifulSoup(xhtml, "html.parser")
    chunks: list[Chunk] = []
    for div in soup.find_all("div", id=re.compile(r"^art_\d+$")):
        chunks.extend(_article_chunks(div))
    for div in soup.find_all("div", id=re.compile(r"^anx_[IVXLC]+$")):
        chunks.extend(_annex_chunks(div))
    if not chunks:
        raise RuntimeError("EU AI Act: no articles found — source layout changed?")
    return chunks


def ingest(raw_dir: Path) -> tuple[list[Chunk], list[SourceRef]]:
    data = fetch_verified(SOURCE, raw_dir)
    return chunk_document(data), [SOURCE.ref()]
