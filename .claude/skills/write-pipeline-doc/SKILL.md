---
name: write-pipeline-doc
description: Write one feature's document for a delivery-pipeline stage — 1-po (raw requirements), 2-bsa (business requirements), 3-sa (solution architecture), 4-dev-poc (POC report + mockup/spike), or 5-dev (implementation record) — from that stage's template in <stage>/input/, with RAG-ready metadata and full traceability to the upstream documents. Use when the user says "write the PO / BSA / SA / POC / dev doc for F-NNN", "start a new feature", "move F-NNN to the next stage", or asks to create a requirement, BRD, architecture, POC or implementation document.
---

# Write a pipeline stage document

The pipeline is `1-po → 2-bsa → 3-sa → 4-dev-poc → 5-dev`. The output of one stage is the input of the next.
The full rules are in the root `README.md`. Templates live in each stage's `input/` folder and **contain the
skeleton, the metadata, the AI rules and a worked example**.

## Steps

1. **Identify the feature and stage.**
   - Find the feature in `docs/feature-register.md`. A new feature (stage 1-po) gets the next free
     `F-NNN` (F-9xx is reserved for template examples) and a kebab-case slug, added to the register first.
   - The stage is what the user asked for. If unclear, it is the first stage whose output does not exist yet.
2. **Check the upstream gate.** Every upstream document this stage needs must exist with `status: approved`
   (1-po needs none). If one is not approved, **stop and tell the user**. Do not write from a draft.
3. **Load the stage template** — the highest version in that stage's `input/` folder:
   - `1-po/input/0-po-raw-requirement-template-v<N>.md`
   - `2-bsa/input/0-bsa-business-requirements-template-v<N>.md`
   - `3-sa/input/0-sa-architecture-template-v<N>.md` (also read `docs/framework-design.md`)
   - `4-dev-poc/input/0-dev-poc-template-v<N>.md`
   - `5-dev/input/0-dev-coding-template-v<N>.md`

   Read the **whole** template: the "Rules for AI" section is binding.
4. **Read every input document in full.** Never work from a summary.
5. **Create the output** at `<stage>/output/F-NNN-<slug>.md`. The filename is the same in every stage.
   POC files sit next to the report: `F-NNN-<slug>.poc.html` / `.poc.py`. 5-dev code goes in `qa-platform/`.
6. **Copy the skeleton** from the template (between `Start of skeleton` and `End of skeleton`). Never copy
   the example's content.
7. **Fill the metadata** (line 1), per `.claude/rules/document-metadata.md`:
   - core fields with `project: ut-support`, `type: pipeline-<po|bsa|sa|poc|dev>`, `status: draft`
   - `feature_id`, `feature`, `stage`, `version: 1`, `template` (the exact template path and version used)
   - `inputs`: every upstream doc as `path@v<version>`; `author` (`AI (<model>) + <name>`), `reviewer`
   - `keywords`: the IDs created in this doc (FR-, API-, TC-…), plus endpoint paths, table names and error codes
8. **Fill every section.** Each item gets an ID and cites its source. Unknowns go to Open questions, and
   assumptions are labelled `A-`. A section that doesn't apply is written `N/A — <reason>`.
9. **Run the template's checklists** (consistency check for SA, handoff checklist for all stages) and the
   metadata checklist in `.claude/rules/document-metadata.md`. Report anything unticked to the user.
10. **Update `docs/feature-register.md`** with this stage's status (`draft`).

## Revising an existing stage document

- Increase `version`, update `last_updated`, and add a changelog row. Never renumber existing IDs.
- If downstream documents cite a changed item, list them for the user. They must be re-checked.

## Do not

- Do not edit an upstream document to make your stage easier. Raise a `FB-` entry instead.
- Do not invent requirements, numbers, names or messages that are not in the inputs.
- Do not set `status: approved` yourself. Approval is a human reviewer's decision.
- Do not delete `v0` or older templates. Use the latest version, and record which one in `template:`.
