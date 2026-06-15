# Hackathon Challenge — Databricks Developer

> Source: <https://developers.databricks.com/hackathon/challenge>
> Captured: 2026-06-15

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
