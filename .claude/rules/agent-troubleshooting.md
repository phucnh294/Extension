# Agent-Pipeline Troubleshooting Rule

When an AI-produced result is wrong (a step resolved to the wrong actions, a bad assertion, a wrong healed
locator, a wrong page profile or suggested test case), find **which agent caused it** by tracing the LLM
call logs BACKWARD with input/output verification. Do NOT guess or jump to a fix until this procedure
has identified the culprit.

Applies from Phase 2 (F-011 LLM provider and call logging) onward. Until then, use the same
backward-tracing idea on the deterministic chain: parser → `TestCase` → built-in phrase → `Action` → locator.

## 1. Where the logs are

Every LLM call goes through `qa_core.llm` and is logged with BOTH the input it received and the output it
produced (5-dev template A6):

```
qa-platform/llm-logs/<MMDDYYYY_HHMMSS>_<session>/     ← one run / explore session
    <NNNN>_<Agent>.md                                 ← one file per call: ## INPUT PROMPT + ## OUTPUT
    <NNNN>_<Agent>.inputs.json                        ← the structured input (replayable)
```

- `NNNN` = global call sequence within the session.
- Each `.md` starts with a header naming `test_id`, `step` (e.g. `3` or `3.2`), `app`, `model`, and
  **`upstream:`**, the `NNNN` of the call(s) whose output fed this call. **Follow `upstream:` to walk the
  chain backward.** Don't rely on file order alone; parallel tests interleave.

Agent order for one step (Phase 2):
`Explorer (session-wide, phase 5) → Step_Resolver → Expect_Resolver → (Healer, only when a replay fails)`

Deterministic inputs that feed the agents (not LLM calls, but part of the chain):
- the parsed step (`qa_core.parser`, Stream A)
- the page's accessibility snapshot (`qa_core.executor`, Stream B)
- the prompt builder that assembles both (`qa_core.resolver`)

## 2. The procedure (backward tracing)

1. Open the suspect agent's `.md`. Read its `## OUTPUT`.
2. **Is the OUTPUT wrong?** If not, this agent is fine and the bug is elsewhere.
3. If the output is wrong, read its `## INPUT PROMPT`.
4. **Is the INPUT correct?** (The right facts, in the right form, in the right order?)
   - **Input correct + output wrong → THIS agent is the culprit.** Stop here.
   - **Input wrong** → the defect was inherited. Follow `upstream:` to the call that produced the wrong
     part, and repeat from step 1 on that call.
5. Continue until you reach the call that received a CORRECT input but produced a WRONG output.
   That agent owns the bug.

## 3. Caveats (don't get fooled)

- **Session-wide agents** (Explorer, phase 5) run once per session, but their output feeds many tests.
  Where the log file sits says nothing about how far its output reaches.
- **Code-assembled input.** Most of an agent's input is built by CODE: the parsed step, the accessibility
  snapshot, the variables. If an input is wrong but NO upstream agent produced that value, the bug is in
  the plumbing: the parser, the snapshot capture or the prompt builder. Trace the code and fix it
  deterministically. Don't "fix" the agent.
- **Prompt gap vs. agent fault.** If the input is correct but the prompt has NO rule covering the
  situation, the agent did produce the bad output, but the fix is a missing prompt rule.

## 4. Once the culprit is identified — choose the fix

- **Prompt gap or one-off** → fix the prompt. Prompts live in git (`qa_core/resolver/prompts/`), so the
  edit takes effect directly. Add the failing case as a replay test (`efficient-replay-testing.md`).
- **Correct input, ONE specific rule broken repeatedly despite prompt tuning** → consider a *corrector*:
  a second, narrow LLM call that checks and repairs only that rule. It's a last resort: it adds cost and
  latency, and every call still runs one at a time on this machine. Record the decision in a
  functionality doc.
- **Plumbing built a wrong input** → deterministic code fix + unit test with the real captured input.

## 5. Worked examples — lessons from the previous project (toll-app crawler, 06/24/2026 triage)

Names below belong to that project; the method is what transfers.
- **Invented CSS class in an assertion:** the Tester agent's output was wrong, but its input was correct.
  Its prompt had no rule for display-text assertions, so this was a **prompt gap** owned by the Tester.
  Fix: add the rule.
- **"Add" clicked before the fields were filled:** the Tester's input was already wrong (buttons listed
  first). The agent before it repeated the same order. The one before that (DOM expert) received the raw
  DOM in the right order but grouped the buttons first. **That agent was the culprit**, three calls upstream.
- **Phantom "capture account number" directive:** the planning agent's output was correct. Code that
  copied the plan into every wizard step injected the wrong directive → **plumbing fix**, not an agent fix.
