# Hackathon Challenge — Databricks Apps & Agents for Good 2026

> Sources:
> - <https://developers.databricks.com/hackathon/apps-agents-for-good-2026>
> - <https://developers.databricks.com/hackathon/challenge>
>
> Captured: 2026-06-15. Hosted in partnership with OpenAI. Held at Marriott Marquis, San Francisco as part of Data + AI Summit 2026.

## The challenge

Build a Databricks App that turns messy healthcare facility data into decisions a non-technical planner can trust.

**Our team is building Track 2 — Medical Desert Planner.**

## Prompt

You are given 10,000 messy records of healthcare facilities across India. Each record includes structured fields such as location and specialties, plus uneven free-text descriptions of claimed capabilities, procedures, equipment, and services.

Build a Databricks App that helps a non-technical healthcare planner, NGO coordinator, or analyst turn this messy data into decisions they can trust.

Your app should extract useful structure from the records, show evidence for its conclusions, communicate uncertainty honestly, and let users save or revise their work.

## Core requirements

Your submission must:

- Run as a Databricks App on Free Edition.
- Use the provided facility dataset.
- Support a clear non-technical user workflow.
- Cite the underlying facility text for any important claim, recommendation, score, or ranking.
- Communicate uncertainty instead of presenting weak evidence as fact.
- Persist user actions such as notes, overrides, shortlists, scenarios, or review decisions.

## Dataset

The provided dataset contains 10,000 Indian healthcare facility records and 51 columns.

All records include facility name, state, city, latitude, longitude, controlled specialties, a description, and source URLs; 9,996 records include a postcode. The extracted evidence fields are noisy, repetitive, and unevenly supported:

| Field           | Coverage |
| --------------- | -------- |
| description     | 100%     |
| capability      | 99.7%    |
| procedure       | 92.5%    |
| equipment       | 77.0%    |
| numberDoctors   | 36.4%    |
| capacity        | 25.2%    |
| yearEstablished | 47.8%    |

Useful evidence appears across `description`, `capability`, `procedure`, `equipment`, `specialties`, and `source_urls`. Teams should treat these fields as **claims to verify rather than ground truth**.

## Our track — Track 2: Medical Desert Planner

> **Question:** Where are the highest-risk gaps in care, and how confident are we that those gaps are real?

Build an app that aggregates trust-weighted facility evidence across geography, such as state, city, district, or PIN code. Help planners distinguish real care gaps from data-poor regions.

**Minimum workflow:** a planner selects a capability and geography, sees regional coverage, drills into the facility records behind an aggregate, and saves a planning scenario.

## Expected toolkit

The hackathon brief calls out three Databricks capabilities as the intended building blocks:

- **Databricks Apps** — the deploy target (Free Edition).
- **Lakebase** — Postgres for user persistence.
- **Agent Bricks** — agentic LLM orchestration on the Databricks platform.

> **Disha note.** We use Databricks Apps and Lakebase as expected. For the LLM layer we use **SAP AI Hub** (`gen_ai_hub` proxy → `anthropic--claude-4.6-sonnet`) instead of Agent Bricks, because every team member already has SAP AI Hub credentials and we wanted the agent code to run identically on local dev and inside the deployed app without managing a second set of model-serving credentials. Worth surfacing in the writeup as a deliberate choice.

## Submission

- **Git repo + project description.** Submitted via the hackathon submission form.
- **3-minute live demo.** Demoed in front of judges during the live judging window.

## Judging dimensions

Submissions are scored on four dimensions:

1. **Product judgment** — Is the user clear? Are the workflow and tradeoffs thoughtful?
2. **Evidence and uncertainty** — Are outputs grounded in citations? Is uncertainty handled honestly?
3. **Technical execution** — Does the app work reliably in a live demo? Are Databricks capabilities used well?
4. **Ambition** — Did the team go beyond the minimum workflow in a meaningful way?

## Timeline

| When (PT) | What |
| --- | --- |
| May 31, 2026 11:59pm | Applications close (teams of 2–4 via MLH) |
| June 15, 2026 8:00am–4:00pm | Opening ceremony + hacking begins |
| June 16, 2026 11:00am–5:00pm | Hacker's Corner (optional collaboration with mentors) |
| **June 16, 2026 6:00pm–9:00pm** | **Live judging + awards ceremony** |

## Eligibility

The hackathon is open only to Data + AI Summit 2026 attendees. **Every teammate must be registered for the summit.**

## How Disha covers the requirements

This is our running self-assessment. Items marked ⚠️ are still risks at the time of capture; they should be verified end-to-end on the deployed app before judging.

### Core requirements

| Requirement | Status | Where it lives |
| --- | --- | --- |
| Runs on Free Edition as a Databricks App | ✅ | `databricks.yml`, [DEPLOY.md](../../DEPLOY.md), live URL |
| Uses the provided dataset | ✅ | Delta Sharing catalog `databricks_virtue_foundation_dataset_dais_2026` (3 tables) |
| Clear non-technical workflow | ✅ | `MapPage`, `DistrictPage`, `WorkspacePage` |
| Cites underlying facility text for claims | ⚠️ unverified end-to-end | Backend: `routes/verify.py`, `routes/assessment.py`. Need to confirm citations render in the UI alongside the LLM summary, not just live in the API response. |
| Communicates uncertainty | ✅ | Dual-encoded uncertainty map: choropleth color = coverage gap, stripe overlay = data sparsity. `CoverageMap.tsx`. |
| Persists user actions | ✅ | Lakebase Postgres, `routes/scenarios.py`, `WorkspacePage.tsx` |

### Track 2 minimum workflow

| Step | Status | Where it lives |
| --- | --- | --- |
| Select capability + geography | ✅ | `MapPage` filters |
| See regional coverage | ✅ | District choropleth + stripe overlay |
| Drill into facility records behind an aggregate | ⚠️ unverified | `DistrictPage` exists; need to confirm it lists individual facility rows with their evidence fields |
| Save a planning scenario | ✅ | `WorkspacePage` + `scenarios` API |

### Beyond the minimum workflow (ambition)

- **Two-agent architecture.** Database Agent (SQL filter on facility evidence) + Web Search Agent (external news/government/NGO evidence) reconciled by an Orchestrator LLM.
- **NFHS cross-reference.** Compares facility evidence against NFHS-5 district health indicators to distinguish *real medical desert* from *data-poor region* from *hidden risk*.
- **District-resolution work.** Three-layer alias resolver lifts NFHS↔pincode-directory join from 79.9% → 100%.
- **Scenario diff map.** Compare two saved scenarios visually.

### Submission artifacts (not in repo yet)

- [ ] Project description for the submission form
- [ ] 3-minute demo (script + run-through)
- [ ] Live-demo smoke test on the deployed URL (PR #12 left this unchecked)
