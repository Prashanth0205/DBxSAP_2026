#!/usr/bin/env python3
"""
Generate alias candidates for NFHS districts that don't match the India Post
pincode directory after SQL normalization.

Inputs:
  - _data/unmatched_nfhs.json :: list of {state_raw, district_raw, state_norm, district_norm}
  - _data/pin_districts.json  :: list of {state_norm, district_norm}
  - state_aliases.csv         :: NFHS state_norm -> canonical (pincode-dir) state_norm.
                                 Applied before district matching so that a single
                                 state-level fix (e.g. MAHARASTRA -> MAHARASHTRA) doesn't
                                 strand 38 districts in the cross-state bucket.

Outputs (one level up, in eda/):
  - district_alias_candidates.csv  :: every (NFHS, pincode-dir candidate) pair
                                       with ratio above CANDIDATE_FLOOR, scored
  - district_aliases_auto.csv      :: auto-accepted high-confidence rows
                                       (score >= AUTO_ACCEPT). Re-generated on every
                                       run; pair with district_aliases_manual.csv
                                       for the full canonical alias table.
  - notes/district_alias_review.md :: residual cases that need human review

Why difflib and not rapidfuzz/jellyfish:
  No third-party deps. SequenceMatcher.ratio() is good enough for short
  district names (10–30 chars). The hard cases (renames, splits) won't be
  caught by any string metric anyway — those need human knowledge.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

HERE = Path(__file__).resolve().parent           # eda/scripts
EDA = HERE.parent                                # eda

CANDIDATE_FLOOR = 0.55     # below this we don't even list as a candidate
AUTO_ACCEPT = 0.90         # score >= this gets auto-accepted. 0.90 catches clean
                           # spelling variants (Davanagere/DAVANGERE, Bara Banki/
                           # BARABANKI). Below this, false positives appear
                           # (Faizabad/FIROZABAD scored 0.824 — different cities).
TOP_K = 3                  # candidates per NFHS row in the candidates CSV


def ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def load_state_aliases() -> dict[str, str]:
    """nfhs_state_norm -> canonical pincode-dir state_norm."""
    aliases_path = EDA / "data" / "state_aliases.csv"
    out: dict[str, str] = {}
    with aliases_path.open() as f:
        for row in csv.DictReader(f):
            out[row["nfhs_state_norm"]] = row["canonical_state_norm"]
    return out


def main() -> None:
    unmatched = json.loads((HERE / "unmatched_nfhs.json").read_text())
    pin = json.loads((HERE / "pin_districts.json").read_text())
    state_aliases = load_state_aliases()

    # group pincode-dir districts by state for state-restricted candidate search
    pin_by_state: dict[str, list[str]] = defaultdict(list)
    for row in pin:
        pin_by_state[row["state_norm"]].append(row["district_norm"])

    candidate_rows = []
    auto_accepted = []
    residual = []
    cross_state = []

    for n in unmatched:
        nfhs_state = n["state_norm"]
        # apply state alias if one exists. fall back to NFHS state.
        state = state_aliases.get(nfhs_state, nfhs_state)
        district = n["district_norm"]
        same_state = pin_by_state.get(state, [])

        if not same_state:
            cross_state.append(n)
            continue

        scored = sorted(
            ((p, ratio(district, p)) for p in same_state),
            key=lambda x: x[1],
            reverse=True,
        )[:TOP_K]

        # always emit candidates for review, even if all are weak
        for rank, (cand, score) in enumerate(scored, start=1):
            if score >= CANDIDATE_FLOOR:
                candidate_rows.append({
                    "nfhs_state_raw": n["state_raw"],
                    "nfhs_district_raw": n["district_raw"],
                    "nfhs_state_norm": nfhs_state,
                    "canonical_state_norm": state,
                    "nfhs_district_norm": district,
                    "candidate_district_norm": cand,
                    "score": round(score, 3),
                    "rank": rank,
                })

        top = scored[0] if scored else (None, 0.0)
        if top[1] >= AUTO_ACCEPT:
            auto_accepted.append({
                "nfhs_state_raw": n["state_raw"],
                "nfhs_district_raw": n["district_raw"],
                "canonical_state_norm": state,
                "canonical_district_norm": top[0],
                "score": round(top[1], 3),
                "source": "auto:difflib>=0.90",
                "notes": "",
            })
        else:
            residual.append({
                "nfhs_state_raw": n["state_raw"],
                "nfhs_district_raw": n["district_raw"],
                "best_candidate": top[0],
                "best_score": round(top[1], 3) if top[0] else None,
                "all_candidates": [(c, round(s, 3)) for c, s in scored],
            })

    # write candidates CSV (intermediate, full audit trail)
    cand_path = EDA / "data" / "district_alias_candidates.csv"
    with cand_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "nfhs_state_raw", "nfhs_district_raw",
            "nfhs_state_norm", "canonical_state_norm", "nfhs_district_norm",
            "candidate_district_norm", "score", "rank",
        ])
        w.writeheader()
        w.writerows(candidate_rows)

    # write seeded aliases CSV (auto-accepts only). Pair with
    # district_aliases_manual.csv (hand-curated govt renames) for the full table.
    aliases_path = EDA / "data" / "district_aliases_auto.csv"
    with aliases_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "nfhs_state_raw", "nfhs_district_raw",
            "canonical_state_norm", "canonical_district_norm",
            "score", "source", "notes",
        ])
        w.writeheader()
        w.writerows(auto_accepted)

    # write residual review notes
    notes_path = EDA / "notes" / "district_alias_review.md"
    notes_path.parent.mkdir(exist_ok=True)
    lines = [
        "# District alias review — residual",
        "",
        "Generated by `eda/scripts/fuzzy_match.py`. NFHS districts where the best",
        "candidate scored below auto-accept threshold (0.90). These need human",
        "review using Wikipedia / Census 2011 / domain knowledge.",
        "",
        f"- Auto-accepted (score ≥ 0.90): **{len(auto_accepted)}**",
        f"- Residual needing review: **{len(residual)}**",
        f"- Cross-state (no candidates in same normalized state): **{len(cross_state)}**",
        "",
        "## Residual",
        "",
        "| NFHS state | NFHS district | Best candidate | Score | Other candidates |",
        "| --- | --- | --- | --- | --- |",
    ]
    for r in residual:
        others = ", ".join(f"`{c}` ({s})" for c, s in r["all_candidates"][1:])
        lines.append(
            f"| {r['nfhs_state_raw']} | {r['nfhs_district_raw']} | "
            f"`{r['best_candidate']}` | {r['best_score']} | {others} |"
        )
    if cross_state:
        lines += [
            "",
            "## Cross-state (state name mismatch — fix state alias before district)",
            "",
            "| NFHS state_raw | NFHS state_norm | NFHS district_raw |",
            "| --- | --- | --- |",
        ]
        for r in cross_state:
            lines.append(f"| {r['state_raw']} | {r['state_norm']} | {r['district_raw']} |")
    notes_path.write_text("\n".join(lines) + "\n")

    print(f"candidates : {len(candidate_rows)} rows  -> {cand_path}")
    print(f"auto-accept: {len(auto_accepted)} rows   -> {aliases_path}")
    print(f"residual   : {len(residual)} cases       -> {notes_path}")
    print(f"cross-state: {len(cross_state)} cases")


if __name__ == "__main__":
    main()
