# Efficient Step Testing — replay from logged input, run the whole thing ONCE

Companion to `real-input-testing.md`. That rule says *use real input*; this rule says *how to iterate
fast*. A full `qa run` of an app's suite (or, in phase 5, a whole `qa explore` crawl) is the broadest test
but the slowest. It is the WRONG loop for iterating on a fix: if it surfaces a new bug near the end, the
whole run is wasted.

## The core idea (flow a → b → c → d …)

When you decide step **c** is wrong:

1. **Its real input is ALREADY recorded.** Don't re-run anything to get it:
   - LLM calls: `qa-platform/llm-logs/<session>/<NNNN>_<Agent>.inputs.json` and the `## OUTPUT` of the `.md` (Phase 2+)
   - run results: `qa-platform/reports/<run-id>/results/*.jsonl` (every step, its actions, message, status)
   - screenshots: `qa-platform/reports/<run-id>/screenshots/<test>/<section>-<index>.png`
   - the API and database: `docker compose logs api`, and PostgreSQL tables from F-010 onward
   - the application under test: its pages, its own logs, the test-case and block files in `apps/<app>/`

   If the input you need is NOT recorded, INSTRUMENT the code to record it, run ONCE to capture it, then
   proceed. Never invent input.
2. **Write a REPLAYABLE test for c**: load that real input → run the REAL c (the actual function or agent,
   including the real LLM if c is an LLM step) → assert the correct output or a stable invariant. It
   runs in seconds.
3. **Fix c, re-run that test**, not the whole suite. Repeat until c is correct.
4. **The test stays** as the permanent verification of c.
5. **Run the whole flow only ONCE** at the end, to confirm what a single-step test cannot: timing,
   ordering, a value really flowing into the next step, parallel workers.

## Two test layers per fix (same as real-input-testing.md)

- **Unit test** — the changed *deterministic* logic, fed a real captured fixture, no LLM, fast. Runs on
  every change, e.g. `packages/qa_core/tests/test_parser.py` on the demo app's real files.
- **Integration (replay) test** — the WHOLE step through its REAL components, including the real LLM,
  asserting a STABLE INVARIANT, not model wording. Lives in `qa-platform/scripts/e2e_*.py` or as a pytest
  test marked `llm`. **Run LLM-marked tests one at a time** (`pytest path::test_name`). This machine
  must never run model calls in parallel.

## Per-unit replay checks

If a run produced N units (pages, steps, suggested test cases) and each one's input is recorded, write ONE
check PER unit and run them independently: N focused, replayable checks instead of one slow run.
Hard-fail on reliable checks (structure, counts, no dangling `{variable}`, every action has a target);
keep heuristic checks (e.g. "the expected text exists on the page") as warnings, so legitimately dynamic
values don't false-fail.

## Before the single confirming run

- Rebuild only what changed: `docker compose up -d --build api` (or `web`). Code baked into an image is
  not refreshed by a restart.
- **Never** run `docker compose down -v`. It deletes the `postgres-data` volume, and with it all
  results and reviews.
- The engine (`qa_core`, `qa_cli`) runs from the uv workspace, so no rebuild is needed: `python -m uv run qa run …`.

## Checklist when a step is wrong

- [ ] Find the step's real input in the logs / reports / database (don't re-run to get it).
- [ ] Write or extend a replay test: real input → real step → assert.
- [ ] Add a fast unit test for any changed deterministic logic.
- [ ] Iterate against those tests (seconds), not the whole suite.
- [ ] Rebuild what changed, then run the whole flow ONCE to confirm.
- [ ] If that run surfaces a new issue, repeat THIS process for it. Don't just run everything again.
