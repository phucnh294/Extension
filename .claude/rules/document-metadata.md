# Document Metadata Rule — every document is RAG-ready

**Every Markdown document created in this project starts with YAML frontmatter on line 1.**
The local RAG uses this metadata to categorise and pre-filter files (by project, type, area, status, tags)
before running a vector or full-text search. A document without metadata cannot be found reliably.

This file is the **single source of truth** for the metadata fields. Skills and templates copy from it.

## When it applies

| File | Metadata required? |
|---|---|
| Knowledge docs: `rag-ai-local/QandA/`, `rag-ai-local/functionality-docs/` | **yes** |
| Pipeline documents: `1-po/` … `5-dev/` (`output/` documents **and** `input/` templates) | **yes** |
| Reference docs: `docs/*.md` | **yes** |
| Code reviews: `code-reviews/<MMDDYYYY>/CR_*.md` | **yes** |
| `README.md`, `CLAUDE.md`, `.claude/rules/*.md` | no (loaded as instructions, not knowledge) |
| `.claude/skills/**/SKILL.md` | no (has its own skill frontmatter) |
| Skill `template.md` / `checklist.md` files | no (templates and instructions, not knowledge) |
| Code-adjacent `.md`: `qa-platform/**/README.md`, `.gitlab/**`, test-case and block `.md` in `qa-platform/apps/` | no (code and tooling) |

## Document layout (always in this order)

```markdown
---
<frontmatter: core fields + type-specific fields>
---

# <Title>

## TL;DR
- **What:** one line — the thing this doc is about.
- **Why:** why it matters / the problem.
- **Where:** files, components, screens or area touched.
- **Impact:** the outcome / what changed.

<body — every ## section self-contained, so one chunk can answer on its own>
```

- The frontmatter is the **first line** of the file. An H1 above it turns the whole block into body text.
- Every `##` section is a retrieval chunk. Repeat the subject noun instead of starting a section with "it".

## Core fields (every document)

```yaml
---
title: <human title>                     # full-text indexed
date: <YYYY-MM-DD>                       # created; time-range filter
last_updated: <YYYY-MM-DD>               # last meaningful change
type: <see type table>                   # main category
project: ut-support                      # which project the doc belongs to (corpus spans projects)
area: <slug>                             # functional area, e.g. healer, runner, portal
status: <see status per type>
tags: []                                 # FILTER facets, controlled vocabulary below
keywords: []                             # literal identifiers to SEARCH for: IDs, error codes, class names
related: []                              # repo-relative paths of related docs that exist
session_id: <optional>
duration: <optional, e.g. 45min>
---
```

## Types and their extra fields

| `type` | Used for | Extra fields | `status` values |
|---|---|---|---|
| `qanda` | a question investigated and answered | `issue_type` (bug \| config \| design \| how-to \| performance \| environment), `severity` (low \| medium \| high \| critical), `resolution_date` | investigation \| in-progress \| implementation-complete \| superseded |
| `functionality` | how something works: plan, design note, investigation, post-mortem, lessons learned | `subtype` (plan \| design \| investigation \| post-mortem \| lessons-learned), `files` [], `version`, `extraction_method` (code-reading \| runtime-observation \| log-analysis \| discussion) | investigation \| in-progress \| implementation-complete \| superseded |
| `business-rule` | rules reverse-engineered from code | `source_code_version` (git short sha), `files` [], `rule_count`, `trust_summary` {confirmed, inferred, suspect} | investigation \| implementation-complete \| superseded |
| `session-handoff` | end-of-session handoff | `branch`, `commit`, `next_action`, `supersedes` | in-progress \| blocked \| complete \| superseded |
| `pipeline-po` / `pipeline-bsa` / `pipeline-sa` / `pipeline-poc` / `pipeline-dev` | one feature's document at one pipeline stage | `feature_id`, `feature`, `stage`, `version`, `template`, `inputs` [], `author`, `reviewer` (+ `branch`, `commit` for `pipeline-dev`) | draft \| in-review \| approved \| superseded |
| `pipeline-template` | a stage template in `<stage>/input/` | `stage`, `version`, `supersedes` | active \| deprecated |
| `reference` | project-level reference docs in `docs/` | `version` | draft \| approved \| superseded |
| `code-review` | self / peer / ad-hoc review of one branch (`code-reviews/<MMDDYYYY>/`) | `review_kind` (self \| peer \| ad-hoc), `feature_id`, `function`, `author`, `reviewer`, `branch`, `base_branch`, `merge_request`, `commits`, `verdict`, `open_items` | open \| in-progress \| closed |

## Controlled tag vocabulary

Pick tags **only** from this list, so filters work. To add a tag, add it here first.

- **Pipeline:** `pipeline`, `po`, `bsa`, `sa`, `poc`, `dev`, `template`, `requirements`, `architecture`, `traceability`
- **Product areas:** `runner`, `parser`, `blocks`, `steps`, `locators`, `resolver`, `healer`, `users`, `data`,
  `report`, `cli`, `portal`, `api`, `worker`, `explorer`
- **Technology:** `python`, `playwright`, `pytest`, `fastapi`, `postgres`, `react`, `docker`, `minio`, `llm`, `ollama`, `claude`
- **Concerns:** `testing`, `performance`, `security`, `pii`, `ui`, `mockup`, `review`, `code-review`, `migration`,
  `ci`, `environment`, `process`, `foundation`

## `tags` vs `keywords`

- `tags` = a few **facets you filter on** (from the vocabulary above).
- `keywords` = **literal identifiers you search for**: `F-900`, `FR-900.07`, `heal_review`,
  `HEAL_ALREADY_REVIEWED`, `NoSuchElementException`. Embeddings are weakest on these; BM25 is strongest.

## Checklist before saving any document

- [ ] Line 1 is `---`; the frontmatter closes with `---`
- [ ] All core fields present; `project: ut-support`
- [ ] `type` is from the type table; `status` is valid for that type; the type's extra fields are filled
- [ ] Dates are ISO `YYYY-MM-DD`
- [ ] `tags` come only from the controlled vocabulary
- [ ] `keywords` contain the real IDs, codes and names used in the document
- [ ] Every path in `related` (and `inputs`) exists
- [ ] `# Title` then `## TL;DR` (What / Why / Where / Impact) directly after the frontmatter
