---
name: adhoc-code-review
description: Full code review of a merge request that arrived WITHOUT a self-review CR file (process exception in docs/development-process.md). Reviews the MR diff from scratch with the shared checklist, runs the security/PII/secrets scan, records the missing self review as a process finding, and creates code-reviews/<MMDDYYYY>/CR_<author>_<reviewer>_<function>.md with all findings open for the author. Use when a reviewer says "review this MR <url>" and there is no CR file, "ad-hoc review", or "they didn't do a self review".
---

# Ad-hoc code review (no self review was done)

Someone opened a merge request without the self review (process steps 3–4 skipped). The reviewer does
the whole review, and the author then fixes the findings exactly as in a normal review.

## Steps

1. **Confirm there is no CR file.** Search every date folder on the MR branch: `code-reviews/*/CR_<author>*_<function>.md`.
   If one exists, stop and use `reviewer-code-review` instead.
2. **Identify the context.**
   - `reviewer` = slug of `git config user.name`
   - Get the MR code:
     ```bash
     git fetch origin main "refs/merge-requests/<iid>/head:mr-<iid>"
     git log --format="%an" origin/main..mr-<iid> | sort -u    # author(s)
     ```
     `author` = slug of the main commit author.
   - `function` = the MR source branch without `feature/`. Use `glab mr view <iid>` if installed, or ask the reviewer.
3. **Create** `code-reviews/<MMDDYYYY>/CR_<author>_<reviewer>_<function>.md` (`MMDDYYYY` = today, the day of
   this review; create the folder if needed) from
   `.claude/skills/self-code-review/template.md`. Metadata per `.claude/rules/document-metadata.md`:
   `review_kind: ad-hoc`, both `author` and `reviewer`, `merge_request` URL, `commits` = `<merge-base>..<mr head>`.
4. **Review the whole diff** (`git diff origin/main...mr-<iid>`) with
   `.claude/skills/self-code-review/checklist.md`, sections 1–5. Findings are `RV-01`, `RV-02`, …,
   all `Status: open`.
5. **Always add a process finding first:**
   `RV-00 | major | process | — | Merge request opened without a self review (CR file missing) | open`.
   The author closes it by confirming they have read the findings:
   `[<author>][<mmddyyyy>] acknowledged`.
6. **Run the security / PII / secrets scan** (checklist §4) and the checks (lint, types, tests; LLM-touching
   tests one at a time). Record the commands and actual results in §4 and §5.
7. **§6 Reviewer evaluation:** write "No self review was provided", then the summary of the main risks.
8. **Verdict:** `changes-requested` at minimum, because RV-00 is open. Use `rejected` if the approach is wrong.
   Fill `open_items`, `status: open`, TL;DR and a History row.
9. **Hand back.** The author fixes the items on the same branch and closes them with
   `[<user>][<mmddyyyy>] <comment>`. A re-review then uses `reviewer-code-review` on this same file.
   Posting on the MR is an outward action: only do it when the reviewer explicitly asks.

## Do not

- Do not approve an ad-hoc review in the same pass. The author must respond to the findings first.
- Do not copy real secrets or PII into the CR file. Give the location and type only.
