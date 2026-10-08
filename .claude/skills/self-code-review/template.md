---
title: Code review — <function> (<author>)
date: <YYYY-MM-DD>
last_updated: <YYYY-MM-DD>
type: code-review
project: ut-support
area: <slug>
status: open                         # open | in-progress | closed
review_kind: self                    # self | peer | ad-hoc
feature_id: <F-NNN or none>
function: <function slug>
author: <git user, slug>
reviewer:                            # empty for a self review
branch: <feature/F-NNN-slug>
base_branch: main
merge_request:                       # URL, filled when the MR exists (step 5)
commits: <base_sha>..<head_sha>
verdict: not-ready                   # self: ready-for-review | not-ready · peer/ad-hoc: approved | changes-requested | rejected
open_items: 0
tags: [code-review]                  # + area tags from .claude/rules/document-metadata.md
keywords: []                         # CR-/RV- IDs, files, functions, error codes
related: []                          # pipeline docs of the feature, paths that exist
---

# Code review — <function> (<author>)

## TL;DR
- **What:** <what the branch changes, one line>
- **Why:** <feature / task it implements>
- **Where:** <main files / modules>
- **Impact:** <n items: x open, y closed · verdict>

## 1. Scope
| Item | Value |
|---|---|
| Branch | `<branch>` → `main` |
| Commits | `<base_sha>..<head_sha>` (<n> commits) |
| Diff | <files changed>, +<added> / -<removed> |
| Pipeline docs | <links, or "technical task — docs/development-plan.md"> |

Files changed:
| File | Change | Note |
|---|---|---|

## 2. Checklist results
Checklist: `.claude/skills/self-code-review/checklist.md`

| Area | Result | Note |
|---|---|---|
| Correctness and design (SA conformance) | pass / fail / n.a. | |
| Tests (every TC has a test, real input) | | |
| Traceability (IDs in tests, commits, docs) | | |
| Security | | |
| PII | | |
| Secrets / passwords / tokens | | |
| Error handling and logging | | |
| Code quality (lint, types, structure) | | |
| Documentation and metadata | | |

## 3. Findings
| ID | Severity | Category | Location | Finding | Status |
|---|---|---|---|---|---|
| CR-01 | blocker / major / minor / nit | security / pii / secrets / correctness / tests / traceability / quality / docs | `path:line` | | open |

### CR-01 — <short title>
- **Severity / category:**
- **Location:** `path:line`
- **Finding:** <what is wrong and why it matters>
- **Suggested fix:**
- **Status:** open
- **Comments:**
  - [<user>][<mmddyyyy>] <comment>

## 4. Security, PII and secrets scan
| Check | Command / method | Result |
|---|---|---|
| Secrets in diff | `git diff <base>...<head>` + patterns in checklist §4 | |
| PII in diff (code, fixtures, logs, screenshots) | | |
| Committed env / local settings files | | |
| Logging of sensitive values | | |
| Dependency changes | | |

## 5. Tests and checks run
| Command | Actual result |
|---|---|

## 6. Reviewer evaluation
<!-- Added by the reviewer (peer or ad-hoc review). Leave empty in a self review. -->

## 7. History
| Date | Who | Event |
|---|---|---|
| <YYYY-MM-DD> | <author> | self review created |
