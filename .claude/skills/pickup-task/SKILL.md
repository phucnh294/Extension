---
name: pickup-task
description: Start work on an assigned task (process step 0 in docs/development-process.md): claim it in docs/feature-register.md, check it is ready (upstream pipeline documents approved, nobody else on it), create the branch from an up-to-date main, load exactly the documents the task needs, agree an implementation plan with the developer, then implement against the SA test cases and finish with the implementation record before handing over to self-code-review. Use when a developer says "pick up F-014", "I'm assigned F-004", "start task T-03", "start working on <feature>", "implement F-NNN", or "what should I do first for this task".
---

# Pick up a task (process step 0 → steps 1–2)

One developer, one task at a time. This skill makes sure the task is **ready**, **claimed**, and done
against the **approved design**, and that it ends in a state the `self-code-review` skill can take over.

## 1. Identify the task and its next stage

1. Get the ID from the developer: `F-NNN` (feature) or `T-NN` (technical task). Never guess it.
2. Find it in `docs/feature-register.md` (features) or `docs/development-plan.md` (technical tasks).
   - It isn't there → stop. New features get an ID in the register first (via `write-pipeline-doc`, stage 1-po).
   - The **Assignee** is someone else → stop and tell the developer. Don't take over a claimed task.
3. Work out the **next stage**: the first of `1-po … 5-dev` whose cell isn't `approved`.
   - Next stage is **1-po to 4-dev-poc** → this is a document task. Do steps 2–3 below, then follow the
     `write-pipeline-doc` skill instead of steps 4–7.
   - Next stage is **5-dev** → this is a coding task. Continue with all steps.
   - **T-NN** → coding task without pipeline documents. The task description in the development plan
     (or the GitLab issue) is the specification.
4. Check that the developer owns the code, using the stream table in `docs/development-plan.md` and
   `.gitlab/CODEOWNERS`. A task that changes another stream's folders, or `qa_core/model/` (the shared
   contract), needs that owner told **before** coding starts.

## 2. Check the task is ready (Definition of Ready)

All must be true. Otherwise stop and list what's missing:

- [ ] Every upstream document of the stage has `status: approved`, using its latest version
- [ ] No open `Q-` or `FB-` items in those documents that block this work
- [ ] For 5-dev: the SA document has test cases (`TC-`) and a passed consistency check; a POC report exists (or the SA says N/A)
- [ ] The developer has no other task in progress (one task at a time; finish or hand over first)
- [ ] Dependencies listed in the PO/SA docs (other `F-NNN`) are merged, or a stub is agreed

## 3. Claim it and create the branch

1. Make sure the working tree is clean: `git status`. Uncommitted work belongs to another task, so ask.
2. Update main and branch from it:
   ```bash
   git switch main && git pull --ff-only
   git switch -c feature/F-NNN-<slug>          # coding task (T-NN: feature/T-NN-<slug>)
   git switch -c docs/F-NNN-<slug>-<stage>     # document task, e.g. docs/F-014-heal-review-sa
   ```
3. Claim it: in `docs/feature-register.md` set **Assignee** (slug of `git config user.name`) and
   **Branch** for the row, and the stage cell to `in-progress`. Commit on the branch:
   `F-NNN: start <stage> (assignee <user>)`.

## 4. Load the context (coding tasks)

Read in full, never from memory or summaries:
- the SA document (latest approved version): components §2, data model §7, interfaces §8, screens §9,
  error handling §10, **test cases §14**, traceability §15
- the POC report and files (`4-dev-poc/output/F-NNN-<slug>.*`). The UI must match the mockup.
- `5-dev/input/0-dev-coding-template-v<N>.md` Part A (latest version), and `CLAUDE.md`
- the existing code in the folders the SA names (follow the patterns already there)

## 5. Agree the plan before writing code

Present a short plan to the developer and **wait for OK**:

| Part | Content |
|---|---|
| Files | each file to create or change, from SA §2, with the requirement IDs it covers |
| Data | migrations (`<yyyymmdd_hhmm>_f<nnn>_<description>.py`), indexes, constraints from SA §7 |
| Tests | one line per SA `TC-` → test name `test_tc_<nnn>_<nn>_<slug>` + level (unit / integration / e2e / perf) + where its **real input** comes from |
| Demo app | which demo pages/tests are added, so `qa run apps/demo/tests` covers the new behaviour |
| Order | small vertical slices, each ending with green tests and a commit |
| Risks | anything in the SA that looks wrong or unclear → raise as `FB-` to the SA now, don't code around it |

## 6. Implement

- Work in small slices: tests for a TC first, then the code, then run the checks. Commit each slice as `F-NNN: <what>`.
- Follow the SA exactly: names, paths, fields, status codes, messages. If it can't be done as written,
  **stop** and raise `FB-NNN.n` to the SA. Don't invent a different design.
- Tests follow `.claude/rules/real-input-testing.md`. LLM-touching tests run **one at a time**.
- Run often (from `qa-platform/`):
  `python -m uv run ruff format . && python -m uv run ruff check . && python -m uv run mypy packages/qa_core/src packages/qa_cli/src && python -m uv run pytest -q`,
  plus `pnpm lint && pnpm build` if the portal changed.
- Keep up with main daily: `git fetch origin && git merge origin/main`. Resolve conflicts on the branch,
  never on main.
- Pushing the branch (for backup or CI) is an outward action: ask the developer first.

## 7. Finish → hand over to self review

1. Definition of done from 5-dev template A13: every TC has a passing test; checks green; migrations run
   on a clean database; `docker compose up --build` healthy (if services changed); UI matches the POC.
2. Write the implementation record `5-dev/output/F-NNN-<slug>.md` with the `write-pipeline-doc` skill
   (stage 5-dev): files table, migrations, TC → test → result table with the **actual** command output.
3. Set the register's 5-dev cell to `draft` (approval comes with the merged MR).
4. Tell the developer the next step is process step 3, and offer to run the `self-code-review` skill.

## Do not

- Do not start coding while a Definition-of-Ready item is open.
- Do not work on `main`, and do not take over a task claimed by someone else.
- Do not change an approved upstream document. Raise `FB-` instead.
- Do not change `qa_core/model/` without the contract owner and one consuming stream agreeing.
