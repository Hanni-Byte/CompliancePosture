import json

import pytest

from packs.schema import Chunk
from packs.sources.crosswalk import parse_entry, resolve_ai_act
from packs.sources.owasp_llm import clean_markdown, parse_risk

RISK_MD = """## LLM01:2026 Prompt Injection

### Description

A **prompt-injection** vulnerability occurs when [input](https://x) alters behaviour.

### Common Examples of Risk

#### Direct Injection
- User supplies input.
1. Numbered item.

### Reference Links

- [ref](https://x)
"""


def test_parse_risk_emits_one_chunk_per_kept_section():
    chunks = parse_risk(RISK_MD, "https://example.org/LLM01.md")
    assert [c.id for c in chunks] == ["llm01_description", "llm01_common_examples_of_risk"]
    assert chunks[0].ref == "LLM01:2026 — Description"
    assert chunks[0].title == "LLM01:2026 Prompt Injection"
    assert chunks[1].text.startswith("Direct Injection:\nUser supplies input.\nNumbered item.")


def test_parse_risk_refuses_other_editions():
    with pytest.raises(RuntimeError, match="expected 2026"):
        parse_risk(RISK_MD.replace("LLM01:2026", "LLM01:2025"), "https://x")


def test_clean_markdown_strips_links_emphasis_and_list_prefixes():
    assert clean_markdown("- **bold** and [link](https://x) `code`") == "bold and link code"


def test_resolve_ai_act_prefers_paragraph_then_whole_then_all_paragraphs():
    ids = {"art_55_1", "art_55_2", "art_9", "art_15_1", "art_15_2"}
    assert resolve_ai_act("Art. 55(1)(b) — Systemic risk", ids) == ["art_55_1"]
    assert resolve_ai_act("Art. 9 — Risk management", ids) == ["art_9"]
    assert resolve_ai_act("Art. 15 — Accuracy", ids) == ["art_15_1", "art_15_2"]
    assert resolve_ai_act("Recital 12", ids) == []


def entry(mappings: list[dict]) -> bytes:
    return json.dumps({
        "id": "LLM01", "name": "Prompt Injection", "source_list": "LLM-Top10-2026", "severity": "Critical",
        "mappings": mappings, "incidents": [{"name": "Sydney", "year": 2023, "incident_id": "INC-1"}],
    }).encode()


def test_parse_entry_handles_the_ai_act_id_name_swap_and_resolves_chunks():
    parsed = parse_entry("LLM01", entry([
        {"framework": "EU AI Act", "control_id": "Risk management obligation",
         "control_name": "Art. 9 — Risk management", "tier": "Foundational"},
        {"framework": "NIST AI RMF 1.0", "control_id": "GV-1.7", "control_name": "Policies", "notes": "n"},
        {"framework": "PCI DSS", "control_id": "1.1", "control_name": "ignored"},
    ]), {"art_9"})
    assert parsed.entryId == "llm01"
    assert [link.framework for link in parsed.links] == ["EU AI Act", "NIST AI RMF 1.0"]
    ai_act = parsed.links[0]
    assert (ai_act.ref, ai_act.title) == ("Art. 9 — Risk management", "Risk management obligation")
    assert (ai_act.packId, ai_act.chunkIds) == ("eu_ai_act", ["art_9"])
    assert parsed.links[1].frameworkId == "NIST_AI_RMF"
    assert parsed.incidents[0].incidentId == "INC-1"


def test_parse_entry_refuses_unresolvable_ai_act_reference():
    with pytest.raises(RuntimeError, match="could not resolve"):
        bad = [{"framework": "EU AI Act", "control_id": "x", "control_name": "Art. 999 — nope"}]
        parse_entry("LLM01", entry(bad), {"art_9"})


def test_chunk_model_rejects_non_https_urls():
    with pytest.raises(ValueError):
        Chunk(id="a", ref="r", title="t", text="x", url="http://insecure")
