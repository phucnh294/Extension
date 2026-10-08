# Code review checklist (shared by self, reviewer and ad-hoc reviews)

Severity: **blocker** (must fix before merge: security, data loss, broken build, wrong behaviour) ·
**major** (should fix before merge) · **minor** (fix or justify) · **nit** (optional).

## 1. Correctness and design
- Does the change do what the SA document (or the task in docs/development-plan.md) says, and nothing more?
- Names, paths, fields, status codes and messages match the SA document exactly.
- Edge cases: empty input, missing data, None, duplicate, concurrency (parallel workers), timeouts.
- Contract changes in `qa_core/model/` are backward compatible (new fields have defaults) and reviewed by
  the model owner plus one consumer.
- No business rule only in the UI; the backend enforces it.

## 2. Tests
- Every SA `TC-` has an automated test named `test_tc_<nnn>_<nn>_…` (or a recorded reason it is manual).
- Tests use real captured input where they process real data (`.claude/rules/real-input-testing.md`).
- Tests assert behaviour, not implementation details; failure messages are readable.
- LLM-touching tests run one at a time; no parallel LLM calls (machine rule).
- The full suite passed: record the command and the actual result.

## 3. Traceability and documentation
- Branch `feature/F-NNN-<slug>`; commits start with `F-NNN:`.
- `5-dev/output/F-NNN-<slug>.md` updated (files table, tests table) for pipeline features.
- New or changed documents carry metadata (`.claude/rules/document-metadata.md`).
- Built-in phrases added → listed in `qa-platform/README.md`.

## 4. Security, PII and secrets — ALWAYS run, record results in the CR file

Scan the **diff**, not just the files you remember changing:

```bash
git diff <base>...<head> --name-only
git diff <base>...<head> | grep -nEi "password|passwd|pwd=|secret|token|api[_-]?key|private[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|authorization:|bearer [a-z0-9]"
git diff <base>...<head> | grep -nE "AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|glpat-[A-Za-z0-9_-]{20}|sk-ant-[A-Za-z0-9_-]{20,}|xox[bp]-|postgres(ql)?(\+asyncpg)?://[^:]+:[^@\$]+@"
git diff <base>...<head> | grep -nEi "[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?[0-9][0-9 ()-]{8,}[0-9]"
git diff <base>...<head> --name-only | grep -nEi "(^|/)\.env$|settings\.local\.json|\.pem$|\.key$|\.p12$|id_rsa"
```
If `gitleaks` is installed, also run `gitleaks detect --log-opts="<base>..<head>"`.

For every hit decide: real secret / PII → **blocker**; placeholder / example (`change-me`, `example.test`) → note it.

- **Secrets:** no real password, token, API key, private key or credentialed connection string in code,
  config, tests, fixtures, docs or commit messages. Secrets come from env vars / `.env` (git-ignored).
- **PII:** no real names, emails, phone numbers, addresses, ID numbers or account numbers in fixtures,
  test data, logs, screenshots or docs. Use generated values (`{uid}`, `example.test`).
- **Committed files:** no `.env`, `.claude/settings.local.json`, keys, certificates, reports or screenshots
  from real environments.
- **Logging:** secrets, tokens, passwords, screenshots and full page content are never logged; passwords in
  step results are masked (`******`).
- **Web/API:** inputs validated (Pydantic); authorisation on every state-changing endpoint
  (`require_roles`); no SQL built from strings; no `eval`/`exec`/`shell=True` on input; CORS not `*` with
  credentials; TLS verification not disabled.
- **Dependencies:** new packages are needed, maintained, and pinned via the lockfiles.

## 5. Code quality
- `ruff format --check`, `ruff check`, `mypy` (strict for qa_core), `pnpm lint` pass.
- Follows 5-dev template Part A (layering: router → service → repository; no Playwright outside
  executor/locators; LLM calls only through `qa_core.llm`).
- No dead code, debugging leftovers, commented-out blocks or TODOs without an owner/feature ID.
- Error messages are understandable without a stack trace (who/what/where/what was tried).
