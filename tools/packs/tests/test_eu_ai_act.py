"""Chunker spec — pins the ids/refs Feature 4 citations depend on."""
from packs.sources.eu_ai_act import CITE_URL, SPLIT_BUDGET, chunk_document

LONG = "x" * (SPLIT_BUDGET // 2)


def article(num: int, body: str, subtitle: str = "Sub") -> str:
    return (
        f'<div class="eli-subdivision" id="art_{num}"><p class="oj-ti-art">Article {num}</p>'
        f'<div class="eli-title"><p class="oj-sti-art">{subtitle}</p></div>{body}</div>'
    )


def para(num: int, idx: int, text: str) -> str:
    return f'<div id="{num:03d}.{idx:03d}"><p class="oj-normal">{idx}. {text}</p></div>'


def point(label: str, text: str) -> str:
    return (
        f'<table><tr><td><p class="oj-normal">{label}</p></td>'
        f'<td><p class="oj-normal">{text}</p></td></tr></table>'
    )


def annex(roman: str, body: str) -> str:
    return (
        f'<div class="eli-container" id="anx_{roman}"><p class="oj-doc-ti">ANNEX {roman}</p>'
        f'<p class="oj-doc-ti">Title</p>{body}</div>'
    )


def test_short_article_is_one_chunk():
    [chunk] = chunk_document(article(4, '<p class="oj-normal">Providers shall ensure literacy.</p>').encode())
    assert (chunk.id, chunk.ref) == ("art_4", "Art. 4")
    assert chunk.title == "Article 4 — Sub"
    assert chunk.url == f"{CITE_URL}#art_4"
    assert "Providers shall ensure literacy." in chunk.text


def test_long_article_splits_per_numbered_paragraph():
    body = para(26, 1, LONG) + para(26, 2, LONG) + para(26, 3, "short")
    chunks = chunk_document(article(26, body).encode())
    assert [c.id for c in chunks] == ["art_26_1", "art_26_2", "art_26_3"]
    assert [c.ref for c in chunks] == ["Art. 26(1)", "Art. 26(2)", "Art. 26(3)"]
    assert all(c.url.endswith("#art_26") for c in chunks)


def test_definitions_article_splits_per_point():
    body = point("(1)", LONG) + point("(2)", LONG) + point("(3)", "AI system means…")
    chunks = chunk_document(article(3, body, "Definitions").encode())
    assert [c.id for c in chunks] == ["art_3_1", "art_3_2", "art_3_3"]
    assert chunks[2].ref == "Art. 3(3)"


def test_backtick_artifacts_are_stripped():
    [chunk] = chunk_document(article(1, '<p class="oj-normal">text</p>', "Subject matter`").encode())
    assert chunk.title == "Article 1 — Subject matter"


def test_short_annex_is_one_chunk():
    body = '<p class="oj-normal">High-risk areas:</p>' + point("1.", "Biometrics")
    [chunk] = chunk_document(annex("III", body).encode())
    assert (chunk.id, chunk.ref) == ("anx_iii", "Annex III")
    assert chunk.text == "High-risk areas: 1. Biometrics"


def test_annex_sections_restart_numbering_without_id_clashes():
    body = (
        '<p class="oj-ti-grseq-1">Section A — Providers</p>' + point("1.", LONG) + point("2.", LONG)
        + '<p class="oj-ti-grseq-1">Section B — Deployers</p>' + point("1.", LONG)
    )
    chunks = chunk_document(annex("VIII", body).encode())
    ids = [c.id for c in chunks]
    assert ids == ["anx_viii_a_intro", "anx_viii_a_1", "anx_viii_a_2", "anx_viii_b_intro", "anx_viii_b_1"]
    assert chunks[1].ref == "Annex VIII, A, point 1"
    assert chunks[4].ref == "Annex VIII, B, point 1"
    assert len(set(ids)) == len(ids)


def test_empty_document_is_refused():
    try:
        chunk_document(b"<html><body></body></html>")
    except RuntimeError as e:
        assert "no articles" in str(e)
    else:
        raise AssertionError("expected RuntimeError")
