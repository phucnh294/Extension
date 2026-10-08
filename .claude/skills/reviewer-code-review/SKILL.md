---
name: reviewer-code-review
description: Reviewer's code review of a merge request that came with a self-review CR file (process steps 7–8 in docs/development-process.md). Reads the MR diff and the self-review file code-reviews/<MMDDYYYY>/CR_<author>_<function>.md, verifies every closed item really is fixed, evaluates the quality of the self review, runs its own security/PII/secrets scan, adds reviewer findings and a verdict, and moves/renames the file to code-reviews/<MMDDYYYY>/CR_<author>_<reviewer>_<function>.md (date of the review). Use when a reviewer says "review this merge request <url> with this CR file", "evaluate the code review", or "check this MR for security and PII".
---

# Reviewer code review (process steps 7–8)

Input: the **MR URL** and the author's **CR file**. If there is no CR file, use the `adhoc-code-review`
skill instead.

## Steps

1. **Identify the context.**
   - `reviewer` = slug of `git config user.name`; `author` and `function` come from the CR file metadata.
   - MR number: from the URL `…/-/merge_requests/<iid>`.
2. **Get the MR code** without touching your own working branch:
   ```bash
   git fetch origin main "refs/merge-requests/<iid>/head:mr-<iid>"
   git diff origin/main...mr-<iid> --stat
   git diff origin/main...mr-<iid>
   ```
   With `glab` installed, also read the description and discussion: `glab mr view <iid> --comments`.
   Read the feature's SA / DEV documents if they exist.
3. **Read the CR file completely.** Check that it follows the template, carries metadata, and that
   `commits` matches the MR head. If the branch has new commits since the self review, note it.
4. **Verify the self review item by item.** For every `CR-` item:
   - `closed` → find the fix in the diff. If it isn't really fixed, set it back to `open` and add
     `[<reviewer>][<mmddyyyy>] reopened: <why>`.
   - `wont-fix` → agree, or reopen with a reason.
   - `open` → it blocks approval if it is a blocker or major.
5. **Do your own review** with `.claude/skills/self-code-review/checklist.md`, sections 1–5. **Always run
   the full security / PII / secrets scan (§4) yourself.** Never trust the author's scan alone. New problems
   become reviewer findings `RV-01`, `RV-02`, … in the same findings table, with the same fields and `Status: open`.
6. **Evaluate the self review** in §6 "Reviewer evaluation":
   - Coverage: did the author look at every changed file? Were the scan and the tests actually run
     (do the recorded results look real)?
   - Accuracy: how many reviewer findings should the self review have caught? Name the most important one.
   - A one-line quality rating: `good` / `adequate` / `insufficient`.
7. **Decide the verdict:** `approved` (no open blocker/major), `changes-requested`, or `rejected`
   (wrong approach, needs a redesign). Update `status`, `open_items`, `verdict`, `review_kind: peer`,
   `reviewer`, `last_updated`, `keywords` (add the RV- IDs) and a History row.
8. **Move and rename the file** into today's date folder (`MMDDYYYY` = the day of this review), keeping the git history:
   `git mv code-reviews/<self-review MMDDYYYY>/CR_<author>_<function>.md code-reviews/<MMDDYYYY>/CR_<author>_<reviewer>_<function>.md`.
   On a **re-review** the file already has the reviewer in its name: update it where it is, don't move it again.
   Change the title to `Code review — <function> (<author>, reviewed by <reviewer>)`.
9. **Hand back.** The author fixes `RV-` items the same way as `CR-` items (`[user][mmddyyyy]` comments)
   and asks for a re-review. Posting a comment on the MR, or approving or merging it, is an outward action:
   **only do it when the reviewer explicitly asks**, and show the text first.

## Do not

- Do not approve while any blocker or major item is open.
- Do not rewrite or delete the author's findings or comments. Add yours.
- Do not copy real secrets or PII into the CR file. Give the location and type only.
- Do not check out the MR over uncommitted work; use the `mr-<iid>` ref as above.
