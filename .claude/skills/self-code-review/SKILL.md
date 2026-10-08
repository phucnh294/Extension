---
name: self-code-review
description: Self code review of the current feature branch before a merge request (process steps 3–4 in docs/development-process.md). Produces code-reviews/<MMDDYYYY>/CR_<user>_<function>.md from this skill's template with RAG metadata, a security/PII/secrets scan and the test results; later closes open items with "[user][mmddyyyy] comment" entries as they are fixed. Use when the developer says "self review", "review my branch", "create my CR file", "code review before merge request", or "fix the open items in my CR file".
---

# Self code review (process steps 3–4)

The author reviews their own branch **before** opening the merge request. The output is the CR file the
reviewer will receive together with the MR URL.

## Step 3 — create the CR file

1. **Identify the context.** Never guess these values:
   - `user` = slug of `git config user.name`, lowercase, spaces → `-`
   - `branch` = `git rev-parse --abbrev-ref HEAD`. Refuse to review `main`/`master`: the work must be on a
     feature branch (process step 1).
   - `function` = the branch name without the `feature/` or `docs/` prefix, e.g. `F-014-heal-review`
   - `base` = `git merge-base origin/main HEAD` (fall back to `main` when there is no remote)
2. **Path:** `code-reviews/<MMDDYYYY>/CR_<user>_<function>.md`, where `MMDDYYYY` = today (Rule A in
   `.claude/rules/file-organization.md`, e.g. `2026-09-30` → `09302026`). Create the date folder if needed.
   **First search all date folders** (`code-reviews/*/CR_<user>_<function>.md`): if the file already exists,
   this is a re-review. Update it where it is; don't move or recreate it.
3. **Copy** [template.md](template.md), then fill the metadata per `.claude/rules/document-metadata.md`:
   `type: code-review`, `review_kind: self`, `reviewer:` empty, `commits: <base>..<head>`.
4. **Read the whole diff**: `git diff <base>...HEAD --stat`, then `git diff <base>...HEAD` file by file.
   Also read the feature's SA and DEV documents if they exist.
5. **Review against** [checklist.md](checklist.md), sections 1–5. Every problem becomes a finding:
   `CR-01`, `CR-02`, … with severity, category, `path:line`, the finding, a suggested fix and `Status: open`.
6. **Run the security / PII / secrets scan** (checklist §4) and record every command and result in §4.
7. **Run the checks** and record the actual results in §5. Python first, the web app if it changed:
   `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy …`, `uv run pytest -q`.
   LLM-touching tests run one at a time.
8. **Set the summary:** `open_items`, `status` (`open` if any item is open), and `verdict`
   (`not-ready` while any blocker/major is open, else `ready-for-review`). Fill the TL;DR and the History row.

## Step 4 — fix open items and close them

When the developer asks to fix the open items (or fixes them themselves):

1. Fix each item in the code. Re-run the relevant tests.
2. In the CR file, set the item's `Status: closed` (or `wont-fix` with a reason) in the table **and** in
   its detail section, and add a comment line in exactly this format:
   `- [<user>][<mmddyyyy>] <what was done, e.g. "moved token to .env; added test_tc_014_05">`
   The date is today as `MMDDYYYY`.
3. Update `open_items`, `status`, `verdict`, `last_updated`, and add a History row.
4. Commit the code fix and the CR file on the feature branch: `F-NNN: close CR-03 …`.

## Steps 5–6 — merge request (the developer's action)

- When `verdict: ready-for-review`, the developer pushes the branch and creates the MR to `main` using the
  template in `.gitlab/merge_request_templates/Default.md`, then puts the MR URL in `merge_request:`.
- With `glab` installed: `glab mr create --target-branch main --fill --web`. Creating the MR and sending it
  to the reviewer are outward actions. **Ask the developer before doing either; never send messages yourself.**
- Give the developer a short ready-to-paste message for the reviewer: MR URL + CR file path.

## Do not

- Do not mark an item closed without a code change or a written `wont-fix` reason.
- Do not delete findings. History matters for the reviewer and the RAG.
- Do not skip the security / PII / secrets scan, even for "docs only" changes.
- Do not paste real secret or PII values into the CR file. Describe them and give the location only.
