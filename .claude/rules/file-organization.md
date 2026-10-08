# File Organization Rules

> **Sync note:** these three rules are duplicated in `must-read.md`
> as Rules 6, 8, and 9. If you change a rule here, also update the
> matching rule in `must-read.md` (and vice versa).

> **Rule vs Skill.** What stays HERE is the *constraint* — where files may live and
> what metadata they must carry, which applies to every task whether or not you are
> writing a doc. The *procedure* for producing each document type lives in a SKILL,
> loaded only when that task is actually happening:
>
> | Task | Skill |
> |------|-------|
> | Write a Q&A doc | `.claude/skills/write-qanda-doc` |
> | Write a functionality / design / post-mortem doc | `.claude/skills/write-functionality-doc` |
> | Write a session handoff | `.claude/skills/write-handoff-doc` |
> | Extract business rules from code | `.claude/skills/write-business-rule-doc` |
> | Write a pipeline stage doc (PO / BSA / SA / POC / DEV) | `.claude/skills/write-pipeline-doc` |
> | Pick up a task (ready check, claim, plan) | `.claude/skills/pickup-task` |
> | Self code review of my branch (CR file) | `.claude/skills/self-code-review` |
> | Review a merge request + CR file | `.claude/skills/reviewer-code-review` |
> | Review a merge request without a CR file | `.claude/skills/adhoc-code-review` |
>
> Metadata fields for **every** document: `.claude/rules/document-metadata.md`.

---

## Rule 0 — ALL knowledge `.md` lives under `rag-ai-local/` (RAG-ready)

Every knowledge/documentation Markdown file lives in ONE of exactly two folders,
so the whole corpus can be chunked + embedded into RAG later:

- `rag-ai-local/QandA/` — every question-and-answer file (Rule B).
- `rag-ai-local/functionality-docs/` — every other doc: plans, design notes,
  investigations, post-mortems, handoffs, lessons learned (Rule C).

**Do NOT create a `.md` file at the repo root or in any other folder.** The ONLY
`.md` files allowed outside `rag-ai-local/` are:

- **Rules** — `must-read.md` (root) and `.claude/rules/*.md`.
- **Skills** — `.claude/skills/**/SKILL.md`.
- **Init/project docs** — `CLAUDE.md`, `README.md`, `REQUIREMENT.MD` (root).
- **Delivery pipeline** — `1-po/`, `2-bsa/`, `3-sa/`, `4-dev-poc/`, `5-dev/`: stage templates in
  `input/` and per-feature documents in `output/` (see `README.md` and the `write-pipeline-doc`
  skill). These ARE part of the RAG corpus and carry full metadata
  (`.claude/rules/document-metadata.md`).
- **Code reviews** — `code-reviews/<MMDDYYYY>/CR_<author>_<function>.md` (self review, folder = day of the
  self review), moved with `git mv` to `code-reviews/<MMDDYYYY>/CR_<author>_<reviewer>_<function>.md` by the
  reviewer (folder = day of the review). Only date folders directly under `code-reviews/`, as in Rule C (see `docs/development-process.md` and the
  `self-code-review` / `reviewer-code-review` / `adhoc-code-review` skills). Part of the RAG corpus, full metadata.
- **Code-adjacent / auto-generated** — `.md` that belongs with code or tooling
  and is NOT project knowledge: `qa-platform/` (READMEs, test-case and block `.md` of apps),
  `.gitlab/`, `backend/`, `frontend/`, `docs/`, `.claude/`
  (commands/requirements), and generated artifacts like
  `backend/pipeline-logs/**`. These are not part of the RAG corpus, except `docs/*.md`
  reference docs, which carry metadata (`type: reference`).

If you are about to write a knowledge `.md` anywhere else, STOP — it belongs in
`rag-ai-local/QandA/` or `rag-ai-local/functionality-docs/`.

---

## Rule A — Resolve today's date once per session as `MMDDYYYY`

- Read `currentDate` from system context (format `YYYY-MM-DD`).
- Convert to `MMDDYYYY` (zero-padded MM, zero-padded DD, 4-digit YYYY, no separators).
  - Example: `2026-04-30` → `04302026`.
- Use the same `MMDDYYYY` string for every file/folder name created in the session — do not re-derive per call.
- If `currentDate` is missing from context, ask the user — never guess.

---

## Rule B — QandA files: `rag-ai-local/QandA/MMDDYYYY_<Topic>.md`

- Name = date prefix + a `Title_Case_Topic` describing the Q&A subject. Do NOT
  put "QandA" in the name — the folder already says it.
  - e.g. `07042026_Agentic_Crawler_Replay_Trap.md`
- **ONE file per distinct Q&A topic** (a day can have several). Inside, questions
  are numbered `Q1`, `Q2`, … per file (not a running global counter).
- Never append to another topic's file; make a new topic file instead.
- Every file MUST begin with the metadata frontmatter + TL;DR (Rule D).
- Existing entries: see `rag-ai-local/QandA/`.

---

## Rule C — Other new `.md` files: `rag-ai-local/functionality-docs/MMDDYYYY/NN_<slug>.md`

- Under `rag-ai-local/functionality-docs/` there are **ONLY `MMDDYYYY` date
  folders** — NO functionality-named subfolder. Any new Markdown file that is
  **NOT** a QandA entry and **NOT** one of the Rule 0 exceptions (rule / skill /
  init / code-adjacent) goes into today's `MMDDYYYY/` folder. Create it if needed.
- Each file **is prefixed with a two-digit sequence number** reflecting creation
  order that day, starting at `01_`; the **slug itself includes the topic/feature**.
  - Before creating a new file, list that day's folder; the next prefix is
    `max(existing NN_ prefix) + 1`, zero-padded to two digits.
  - Example (date folder = `07042026`):
    - `rag-ai-local/functionality-docs/07042026/01_thiet-ke-corrector-agents.md`
    - `rag-ai-local/functionality-docs/07042026/02_handoff-doc-to-fixing-test-runner-issues.md`
- The feature/area is captured in the `area:` **metadata** field (Rule D) for
  pre-filter — not as a folder.
- **Applies to:** implementation plans, design notes, investigations, post-mortems, scratch analysis.
- **Does NOT apply to:**
  - QandA entries (Rule B).
  - The Rule 0 exceptions (rules, skills, init docs, code-adjacent/auto-generated `.md`).
- Every file MUST begin with the metadata frontmatter + TL;DR (Rule D).

---

## Rule D — Every `rag-ai-local/` file: metadata frontmatter + TL;DR (RAG + hybrid-search ready)

Every `.md` under `rag-ai-local/` (both QandA and functionality-docs) MUST begin
with **YAML frontmatter** and a **TL;DR** block, so the corpus is ready to be
chunked, embedded into pgvector, and indexed for hybrid full-text search
(Elasticsearch / BM25). **Both types use the IDENTICAL header** — the only
difference is `type:` (`qanda` vs `functionality`). Keeping them the same means
one chunking/indexing path handles the whole corpus. The frontmatter gives structured fields to **PRE-FILTER**
rows (by date/type/area/status/tags) *before* the vector query — cheaper and more
precise than scanning the whole vector column. The TL;DR is a dense summary chunk
that embeds and full-text-indexes well.

### Required header (core fields — the full list per type is in `.claude/rules/document-metadata.md`)

```markdown
---
title: Agentic Crawler Replay Trap          # human title (also full-text indexed)
date: 2026-07-04                             # ISO YYYY-MM-DD — time-range pre-filter
last_updated: 2026-07-04                     # ISO YYYY-MM-DD
type: qanda                                  # see the type table in document-metadata.md
project: ut-support                          # which project the doc belongs to
area: agentic-crawler                        # feature/functionality slug — facet pre-filter
status: implementation-complete              # valid values depend on type
tags: [healer, playwright]                   # controlled vocabulary — faceted pre-filter
keywords: [Replay_Trap, NoSuchElementException]  # literal identifiers for BM25
related: [rag-ai-local/QandA/07042026_Vision_Capture_Spread.md]  # paths that exist
session_id: 912b894b-7508-4bb3-8f36-151f9773c29e   # optional
duration: 108min                             # optional — how long the work took
---

## TL;DR
- **What:** one line — the thing this doc is about.
- **Why:** why it mattered / the problem.
- **Where:** the files/components/area touched.
- **Impact:** the outcome / what changed.

<!-- then the real content: Q1/Q2… for QandA, or the narrative for functionality -->
```

### Field notes
- `date`, `type`, `area`, `status`, `tags` → become **metadata columns** in the
  vector table; the retriever filters on these first (e.g. `area='agentic-crawler'
  AND status='implementation-complete'`) then does the vector/full-text search.
- `title` + `TL;DR` → indexed for **BM25 / Elasticsearch** so keyword queries hit
  even when embeddings miss.
- Keep each heading (`## Qn:` / section) self-contained so a chunk carries enough
  context to answer on its own.
- **Frontmatter must be the FIRST line of the file** — not after the `# Heading`.
  A YAML parser reads the first `---` block or nothing; an H1 above it turns the
  whole block into body text and the doc lands in the index with no metadata.
- `tags` vs `keywords` are two different jobs: **`tags` = facets you FILTER on**
  (small controlled vocabulary), **`keywords` = literal identifiers you SEARCH
  for** (`ERR-6002`, `CACHE_MIN_SIMILARITY`, `NoSuchElementException`) — the
  things embeddings are worst at and BM25 is best at.

---

## Rule E — Start from a TEMPLATE, never from a blank file

Every document type has a template, and all share ONE metadata core. Each template
lives next to the skill that uses it:

| Type | Template | Use it for |
|------|----------|-----------|
| `qanda` | `.claude/skills/write-qanda-doc/template.md` | a question that was investigated and answered |
| `functionality` | `.claude/skills/write-functionality-doc/template.md` | how a feature/architecture works; plans, investigations, post-mortems |
| `business-rule` | `.claude/skills/write-business-rule-doc/template.md` | rules reverse-engineered out of code |
| `session-handoff` | `.claude/skills/write-handoff-doc/template.md` | closing a work session (Rule F) |
| `pipeline-*` | `<stage>/input/0-*-template-v<N>.md` (latest version) | one feature's PO / BSA / SA / POC / DEV document |

The canonical field list, the type and status values, the tag vocabulary, the
`tags`/`keywords` distinction and the pre-save checklist are in
**`.claude/rules/document-metadata.md`** — that file is the source of truth.

---

## Rule F — Every work session ends with a HANDOFF document

**Purpose: kill the long chat session.** Context is finite and expensive. A session
that runs for hours degrades, and its knowledge dies when the window closes. The fix
is not a longer session — it is a **handoff document** that makes the next session
*session-free*: it can start cold and still know everything that matters.

- **Where:** `rag-ai-local/functionality-docs/MMDDYYYY/NN_handoff-<slug>.md`
  (Rule C naming), `type: session-handoff`.
- **When:** at the end of a session, and *before* compacting/clearing context —
  not after, when the details are already gone.
- **What it must contain** (the template enforces it):
  - `Current Status` — a real metric, not "good progress".
  - **COMPLETED** — with the build/test state.
  - **NOT DONE / STILL OPEN** — brutally specific, with file:line.
  - **NEXT ACTION** — the single first thing, plus the exact command to resume.
  - **CONTEXT THE NEXT SESSION CANNOT DERIVE FROM CODE** — decisions and their
    reasons, rejected alternatives, traps already fallen into. This is the only
    genuinely irreplaceable section: everything else can be re-read from the repo.
- **Supersede, don't delete:** a new handoff sets `supersedes:` to the previous
  one, and the old one is marked `status: superseded` so retrieval can filter it
  out while history stays intact.

**Test of a good handoff:** a new session, given ONLY this file and the repo, can
resume the work without asking a single question.
