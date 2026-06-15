#!/usr/bin/env python3
"""
Compute final NFHS->pincode-dir district coverage after applying the three
resolution layers we built:

  1. SQL normalization (district_normalize.sql)        -- handles formatting noise
  2. state_aliases.csv                                  -- handles state name divergence
  3. district_aliases_{auto,manual}.csv                 -- handles district renames/variants

Reads the same _data/*.json snapshots that fuzzy_match.py reads, so this is a
self-contained check that doesn't need a Databricks warehouse.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
EDA = HERE.parent


def main() -> None:
    unmatched = json.loads((HERE / "unmatched_nfhs.json").read_text())
    pin = json.loads((HERE / "pin_districts.json").read_text())

    # build lookup of (state_norm, district_norm) for everything in pincode dir
    pin_keys = {(r["state_norm"], r["district_norm"]) for r in pin}

    # load aliases
    state_alias: dict[str, str] = {}
    with (EDA / "state_aliases.csv").open() as f:
        for row in csv.DictReader(f):
            state_alias[row["nfhs_state_norm"]] = row["canonical_state_norm"]

    district_alias: dict[tuple[str, str], tuple[str, str]] = {}
    for fname in ("district_aliases_auto.csv", "district_aliases_manual.csv"):
        with (EDA / fname).open() as f:
            for row in csv.DictReader(f):
                # key by (raw_state, raw_district) since that's what we'll
                # match against the NFHS source rows
                key = (row["nfhs_state_raw"], row["nfhs_district_raw"])
                district_alias[key] = (
                    row["canonical_state_norm"],
                    row["canonical_district_norm"],
                )

    resolved = 0
    unresolved = []

    for n in unmatched:
        # try district alias keyed by raw state+district
        alias_key = (n["state_raw"], n["district_raw"])
        if alias_key in district_alias:
            cs, cd = district_alias[alias_key]
            if (cs, cd) in pin_keys:
                resolved += 1
                continue
            # alias points somewhere not in pin_keys -- bug in alias table
            unresolved.append({**n, "reason": f"alias->{cs}.{cd} not in pin_keys"})
            continue

        # no district alias; try state alias + same district name
        canonical_state = state_alias.get(n["state_norm"], n["state_norm"])
        if (canonical_state, n["district_norm"]) in pin_keys:
            resolved += 1
            continue

        unresolved.append({**n, "reason": "no alias, no state-only fallback"})

    total_unmatched = len(unmatched)
    print(f"unmatched after SQL norm only: {total_unmatched}")
    print(f"resolved by alias layers     : {resolved}")
    print(f"still unresolved             : {len(unresolved)}")
    if unresolved:
        print()
        print("unresolved cases:")
        for u in unresolved:
            print(f"  - {u['state_raw']!r} / {u['district_raw']!r}  ({u['reason']})")

    # sanity: also compute total NFHS coverage
    # 706 NFHS districts total, 142 unmatched after SQL norm, so 564 matched directly
    direct = 706 - total_unmatched
    print()
    print(f"direct SQL-norm matches : {direct}/706 ({direct/706:.1%})")
    print(f"with alias layers       : {direct + resolved}/706 ({(direct+resolved)/706:.1%})")


if __name__ == "__main__":
    main()
