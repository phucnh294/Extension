# Real-Input Testing Rule

**Every unit test and e2e test for a data-processing function MUST be driven by REAL input captured from
an actual run, never by invented input as the primary validation.** A test built on made-up input only
proves the author's *assumptions*; it cannot tell you whether the code works on the real system.

"Data-processing" here means: parsing test-case/block files, resolving steps into actions, locating
elements on real pages, healing, building prompts, turning results into reports, storing results.

## Why (the failure this rule exists to prevent)

A lesson from the previous project (toll-app crawler, 2026-06-26): a unit test fed a resolver a
**fabricated** request `GET /api/v1/cases/all`, because the author *assumed* the app fetched it per page.
The test passed and the feature was deployed. Then a real crawl and the backend access logs showed the
app only calls `POST /api/v1/auth/login` and renders everything client-side, so the feature never did
anything. **A test fed the real captured input would have shown that immediately**, before any build or
deploy.

## The rule, concretely

1. **Source the input from a real artifact.** In this project:
   - test-case and block files: the real files in `qa-platform/apps/<app>/` (the demo app today, real
     apps later). The unit tests in `packages/qa_core/tests/` already parse the demo app's real files.
   - pages: a real page of the application under test, saved as HTML or as an accessibility snapshot under
     `tests/fixtures/real/<app>/…`, with where and when it was captured
   - run results and screenshots: `qa-platform/reports/<run-id>/…`
   - LLM inputs and outputs: `qa-platform/llm-logs/<session>/<NNNN>_<Agent>.inputs.json` / `.md` (Phase 2+)
   - ground truth about what really happened: `docker compose logs api`, PostgreSQL, and the application's own logs
2. **If the needed input is NOT recorded, instrument the code to record it FIRST**, run once to capture
   real samples, then write the test against them. Don't substitute invented input to "unblock" the test.
3. **Structure:** load the real fixture → call the real function → assert the **real-world-correct**
   result, verified by hand. Run it over the **whole corpus** when one exists (all saved pages of an app;
   several captured runs form the regression set).
4. **Validate the ASSUMPTION before building on it.** If a design assumes "the app does X", confirm X from
   an authoritative source (server logs, a live observation, captured data), not from a proxy belief.
5. **No real personal data or secrets in fixtures.** Capture from test environments with test users.
   If a capture contains PII or secrets, mask them before committing (the CR checklist §4 scan will look).

## Two test layers are REQUIRED for every fix

A green pure-logic suite only proves the *plumbing*: it never calls the LLM. So every fix needs BOTH:

1. **Real-input UNIT test** — the changed *deterministic* logic (parser, phrase, locator strategy,
   variable resolution, prompt builder) fed a real captured fixture. Fast; runs on every change.
2. **Real-input INTEGRATION test (e2e)** — the whole flow the fix lives in, through the REAL components,
   **including the actual LLM call(s)** and any browser/database steps. No mocks. Only this proves the
   *behaviour* works.

### The integration test, concretely

- **Real input:** a real captured fixture (saved page, logged step input, recorded run), never invented data.
- **Whole flow:** invoke the real code path, so it makes the real LLM / browser / database calls the flow
  makes in production. Lives in `qa-platform/scripts/e2e_*.py`, or as a pytest test marked `browser` / `llm`.
- **Assert on STABLE INVARIANTS, not LLM wording.** Assert the property the fix guarantees, for example
  "the step resolves to a click on button 'Save'; no dangling `{variable}`; every action has a target",
  not a verbatim model string that will flake.
- **One at a time:** LLM-touching tests run singly (`pytest path::test_name`). Never in parallel on this machine.

## When synthetic input is allowed

Only as a **supplement** for pure edge logic that real data won't exercise (empty file, malformed table,
nesting too deep). There must also be a real-input test for the behaviour itself.

## Checklist before claiming a test "proves it works"

- [ ] The input came from a real run / file / page / log, not from my head.
- [ ] If it wasn't available, I instrumented and captured it first.
- [ ] The assertion is what's actually correct for the real system, verified by hand.
- [ ] I ran it across the available real corpus, not a single happy case.
- [ ] The fixture contains no real personal data or secrets.
