# Disha — Claude Batch Preprocessing
# Run this as a Databricks Notebook Job (NOT in the app server)
# Runtime: ~45 minutes for 10k facilities
# Cost: ~$15-20 at claude-sonnet-4-6 pricing
# Run ONCE — results are cached in facility_capabilities Delta table

import anthropic
import json
import time
from pyspark.sql import SparkSession
import pandas as pd

spark = SparkSession.builder.getOrCreate()

ANTHROPIC_API_KEY = dbutils.secrets.get(scope="disha", key="anthropic_api_key")
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

CAPABILITY_TAGS = [
    "icu", "emergency_care", "maternity", "nicu",
    "surgery_general", "surgery_cardiac", "oncology",
    "dialysis", "radiology", "pathology", "orthopedics",
    "neurology", "cardiology", "pediatrics", "psychiatry",
    "physiotherapy", "blood_bank", "pharmacy"
]

SYSTEM_PROMPT = """You extract structured healthcare capabilities from Indian facility records.
Return ONLY valid JSON. No explanation. No markdown fences.

Confidence scoring rules:
- "has ICU" alone = 0.40
- "10-bed ICU" = 0.65
- "10-bed ICU with 6 ventilators" = 0.85
- Brand names (Siemens, GE, Philips) or certifications (NABH, JCI) = +0.10 boost
- Claim in description only, nothing corroborated in equipment = max 0.55
- Each missing field reduces max achievable confidence by 0.10
- Implausible claim (2-doctor clinic claiming cardiac surgery) = max 0.25
"""

def extract_capabilities(row: dict) -> list:
    prompt = f"""
ALLOWED TAGS: {', '.join(CAPABILITY_TAGS)}

FACILITY:
Name: {row.get('facility_name', 'N/A')} | State: {row.get('state', 'N/A')} | City: {row.get('city', 'N/A')}
description: {row.get('description', 'N/A')}
capability: {row.get('capability', 'N/A')}
procedure: {row.get('procedure_text', 'N/A')}
equipment: {row.get('equipment', 'N/A')}
specialties: {row.get('specialties', 'N/A')}
numberDoctors: {row.get('numberDoctors', 'N/A')}

Return JSON:
{{"capabilities": [{{"tag": "<one of allowed tags>", "confidence": 0.0, "evidence": "<exact quoted phrase max 20 words>", "field_source": "<description|capability|equipment|procedure|specialties>"}}]}}
"""
    try:
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}]
        )
        return json.loads(resp.content[0].text)["capabilities"]
    except Exception as e:
        print(f"  Error on {row.get('facility_id')}: {e}")
        return []


# Load all facilities
facilities_pd = spark.table("raw_facilities").toPandas()
print(f"Processing {len(facilities_pd)} facilities...")

results = []
errors = 0

for i, (_, row) in enumerate(facilities_pd.iterrows()):
    caps = extract_capabilities(row.to_dict())
    for cap in caps:
        results.append({
            "facility_id": row["facility_id"],
            "capability_tag": cap.get("tag", ""),
            "confidence": cap.get("confidence", 0.0),
            "evidence_text": cap.get("evidence", ""),
            "field_source": cap.get("field_source", ""),
        })

    # Save every 500 to preserve progress if the job crashes
    if i > 0 and i % 500 == 0:
        print(f"  Progress: {i}/{len(facilities_pd)} ({len(results)} capabilities extracted, {errors} errors)")
        spark.createDataFrame(pd.DataFrame(results)) \
            .write.format("delta").mode("append").saveAsTable("facility_capabilities")
        results = []

    # Respect rate limits
    if i % 50 == 0 and i > 0:
        time.sleep(1)

# Write final batch
if results:
    spark.createDataFrame(pd.DataFrame(results)) \
        .write.format("delta").mode("append").saveAsTable("facility_capabilities")

print(f"Done! Check: SELECT COUNT(*) FROM facility_capabilities")
