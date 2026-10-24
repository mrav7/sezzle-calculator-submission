# Report 05 — Final submission audit, AI disclosure and handoff (P-005)

Prompt: [P-005](../PROMPTS.md#p-005--final-submission-audit-ai-disclosure-and-handoff). Assistant: Claude Code (Claude Opus 5.5, `claude-opus-5-5`).

> **Note added in P-006 (public submission):** [PROMPTS.md](../PROMPTS.md) no longer contains the ChatGPT entries (C-001 to C-009) or the list of untranscribed ChatGPT messages referred to below. They were replaced by a summary, [ChatGPT — Planning and Technical Review](../PROMPTS.md#chatgpt--planning-and-technical-review), which does not reproduce the ChatGPT conversations. References to them here are historical. The Claude Code prompts are unchanged, and so are this report's findings and test results.

This phase was an audit only. No application code, tests, configuration or dependencies were changed. Every result below comes from a command run during this phase.

## 1. Audit date and environment

| Item | Value |
|------|-------|
| Date | 2026-10-24 |
| OS | Fedora Linux 44, kernel 7.2.11-200.fc44.x86_64 |
| Go | go1.27.3 linux/amd64. Go is not installed on the machine. The official tarball left by an earlier session was used. Its SHA-256 `65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40` matched the value on `go.dev/dl` (fetched during this phase). It was extracted into the session scratchpad and nothing was installed system-wide. `GOTOOLCHAIN=local`. |
| Node.js / npm | v24.21.0 / 11.19.0 |
| TypeScript / Vite / Vitest | 5.9.3 / 8.3.5 / 5.0.5 |
| GitHub CLI | gh 2.96.0, authenticated |

## 2. Git state

| Item | Value |
|------|-------|
| Branch | `main` |
| HEAD | `291d722` fix(frontend): improve numeric result formatting |
| `origin/main` | `291d722`. After `git fetch origin`: synchronized, neither ahead nor behind |
| Working tree at start | Clean |
| Remote | `git@github.com:mrav7/sezzle-calculator.git` |

## 3. Requirements compliance

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Addition, subtraction, multiplication, division | Met | `calculator.Calculate`. All four verified over HTTP, directly and through the proxy |
| React UI: operands, operation, result | Met | `Calculator.tsx`, component tests |
| Frontend input validation | Met | `parseOperand` (decimal grammar, ±2^53−1 range) and the client-side divide-by-zero check. 67 + 34 tests |
| User-facing error handling | Met | Field errors, `role="alert"` for API and network errors, generic fallback |
| Basic mobile responsiveness | Met | Viewport meta, fluid card (`max-width: 28rem`), `@media (min-width: 30em)`. The 320px browser check was done in P-004 and not repeated here |
| REST backend does the calculations | Met | `POST /api/calculate`. The frontend does no arithmetic |
| JSON results and errors | Met | `{"result":…}` and `{"error":{"code","message"}}`, all with `application/json` |
| Backend validation and edge cases | Met | Strict decoding, missing/null fields, types, unknown fields, 8 KiB limit, division by zero, overflow, 404/405/415 |
| Optional operations (power, sqrt, percent) | Not implemented (optional) | Documented as out of scope. `power` returns `UNKNOWN_OPERATION` |
| Clean, maintainable structure | Met | `internal/calculator` is independent of `internal/httpapi`. The frontend separates the API client, parsing/formatting and UI |
| Frontend unit tests | Met | 117 tests |
| Backend unit tests | Met | 150 passing tests and subtests |
| Reproducible coverage | Met | `go test -coverprofile`, `npm run test:coverage`, both documented in the README |
| Documentation: setup, usage, decisions | Met | README, SPECIFICATION, DECISIONS, TEST_REPORT |
| React + TypeScript, Go | Met | React 19.3.1, TypeScript 5.9.3, Go standard library only |
| REST API examples | Met | The README examples matched live responses byte for byte |
| AI prompt disclosure | **Partially met** | All Claude Code prompts (P-001 to P-005) are recorded in full. Seven ChatGPT-side originals are missing (section 9) |
| Repository accessible to reviewers | **Not met yet** | The repository is **private** (section 11) |

Development time compared with the 2–4 hour estimate was not verified and is not claimed.

The source review found no critical defect. `classifyDecodeError`'s fallback and the two uncovered branches in `Calculator.tsx` are defensive code, as documented in the test report. The numeric formatting trade-offs were left as documented.

## 4. Backend verification (`backend/`)

| Command | Result |
|---------|--------|
| `gofmt -l .` | No output |
| `go vet ./...` | No output, exit 0 |
| `go test ./... -count=1` | `calculator` ok, `httpapi` ok, `cmd/server` has no test files |
| `go test -race ./... -count=1` | ok for both packages |
| `go test ./... -count=1 -v` | 150 `--- PASS` (17 top-level tests), 0 `--- FAIL` |
| `go test ./... -coverprofile=coverage.out` | ok |
| `go tool cover -func=coverage.out` | Total 95.8% |

## 5. Frontend verification (`frontend/`)

| Command | Result |
|---------|--------|
| `npm ci` | 113 packages, "found 0 vulnerabilities" |
| `npm run typecheck` | No diagnostics |
| `npm run test` | 4 files, 117 passed, 0 failed |
| `npm run test:coverage` | 117 passed |
| `npm run build` | Succeeded: `index.html` 0.39 kB, CSS 2.18 kB, JS 224.12 kB (70.48 kB gzip) |

## 6. Coverage

| Scope | Statements | Branches | Functions | Lines |
|-------|-----------|----------|-----------|-------|
| Go `internal/calculator` | 100.0% | — | — | — |
| Go `internal/httpapi` | 98.8% | — | — | — |
| Go `cmd/server` | 0.0% | — | — | — |
| **Go total** | **95.8%** | — | — | — |
| `src/calculation.ts` | 100% | 100% | 100% | 100% |
| `src/api/calculator.ts` | 100% | 95.45% | 100% | 100% |
| `src/components/Calculator.tsx` | 97.05% | 91.89% | 100% | 100% |
| `src/App.tsx` | 100% | 100% | 100% | 100% |
| **Frontend total** | **98.23%** | **94.2%** | **100%** | **100%** |

These figures match the ones recorded in P-004.

## 7. Integration verification

The three kinds of check are kept separate:

1. **Automated tests:** sections 4 and 5. The frontend tests mock `fetch` and run in jsdom.
2. **HTTP integration (performed):** a backend binary was built from HEAD and run together with `npm run dev`-equivalent `vite --port 5173`. Port 8080 on the host is held by a `./server` process that another Claude Code session started at 22:10. That process was not started here, and it was not stopped. Its binary hash differs from HEAD's. An accidental first run hit that process, so its results were discarded. The checks were repeated inside `unshare -rn`, a private network namespace with its own loopback. The same 16 requests were sent to `:8080` and through the proxy on `:5173`, and the bodies were identical:
   - 200: `add 10 5` → `15`, `subtract 3 10` → `-7`, `multiply -2.5 4` → `-10`, `divide 1 3` → `0.3333333333333333`, `add 0.1 0.2` → `0.30000000000000004`, `add 1234567890123 0.5` → `1234567890123.5`
   - 400: `DIVISION_BY_ZERO`, `RESULT_OUT_OF_RANGE` (`1e308 × 10`), `UNKNOWN_OPERATION` (`power`), `VALIDATION_ERROR` for `"a":"1"`, a missing `b` and an unknown field `c`, and `INVALID_JSON` for a truncated body
   - 405 with `Allow: POST` (GET), 415 `UNSUPPORTED_MEDIA_TYPE` (`text/plain`), 404 `NOT_FOUND` (`/api/other`)
   - Every body was JSON. The `Content-Type` was `application/json` wherever curl reported it.
3. **Browser:** **not performed in P-005.** The latest browser check is P-004's scripted headless Chrome run at 320px (see the test report). Rejection of invalid operands before a request is sent is covered here only by the automated component tests, which assert that `fetch` is not called.

**Clean checkout:** `git clone git@github.com:mrav7/sezzle-calculator.git` succeeded into a temporary directory (authenticated SSH). It produced `291d722` with no untracked files. `go vet`, `go test`, `npm ci`, `npm run test` (117 passed) and `npm run build` all passed. The Go module has no dependencies and needs no `go.sum`. `package-lock.json` is tracked. No environment variables or local configuration were needed.

## 8. Documentation completeness

- All relative links in `README.md`, `docs/*.md`, `docs/ai/*.md` and the reports resolve.
- The README's API example table matches the live responses exactly, including messages.
- The README's error-code table matches the constants and statuses in `handler.go`.
- The test counts and coverage in TEST_REPORT match this run.
- The numeric precision limits (12 significant digits or 3 decimals, the ±2^53−1 input range, exponent display) are described the same way in README, SPECIFICATION and DECISIONS (F-07).
- Optional features, Docker and production serving are stated as not provided. There are no deployment claims.
- The setup prerequisites (Go ≥ 1.22, Node versions from `engines`, `npm ci`) are enough for someone who clones the repository. Only Go 1.27.3 has actually been tested, and the README says so.
- **Factual correction:** the README's AI paragraph said only the earliest planning messages were untranscribed. It now lists all the missing items (section 9).

## 9. AI prompt disclosure

| Item | How it is recorded |
|------|--------------------|
| P-001 to P-004 | Full text as received by Claude Code. Unchanged: the SHA-256 of the P-001…P-004 block is `94ab19cf…0fc4` before and after this phase's edit |
| P-005 | **New.** Full text, written out by Claude Code from the message as received (without the paste markers). Not byte-compared with the user's draft |
| C-001 to C-004 | The user's own transcription of their ChatGPT prompts. Unchanged (`8d05e8f0…ee24` before and after) |
| ChatGPT replies | Summarised only |

**Originals still missing.** They are listed in PROMPTS.md under *Interactions not yet transcribed* and need manual transcription by the user:

1. The original Sezzle assignment brief. If it is added, label it as employer-provided. P-005 section 2 restates it but is not the brief verbatim.
2. Early ChatGPT planning and the specification behind P-001 and P-002.
3. The compliance check ("does the solution comply with the assignment?").
4. The request that produced P-004.
5. The request for a detailed final repository audit.
6. The question about what remained before delivery.
7. The request that produced P-005.

**Attribution:** the models listed for P-001 to P-004 come from the earlier reports. Nothing contradicts them, but they cannot be re-verified from this session. No incorrect attribution was found. The README now describes the log as incomplete, which is accurate.

**Verdict for this requirement:** partially met. Every prompt executed by Claude Code is disclosed in full. The ChatGPT side still has gaps, and they are stated explicitly. It is not marked as satisfied.

## 10. Repository hygiene

- There are 34 tracked files, about 344 KB in total. None of them is `node_modules`, `dist`, coverage output, a binary, an archive or an environment file.
- A secrets scan of the tracked files (API keys, tokens, private keys, `ghp_`/`github_pat_`/`sk-`/`AKIA` patterns) found nothing. The only matches were the word "secrets" in a report and the `css-tokenizer` package name in the lockfile.
- Untracked files that are ignored and must not be published: `backend/coverage.out`, `frontend/coverage/`, `frontend/dist/`, `frontend/node_modules/` and **`sezzle-ai-review.zip`** (a local snapshot made for review). All are covered by `.gitignore`.
- `git diff --check` is clean.

## 11. GitHub visibility

`gh repo view mrav7/sezzle-calculator --json visibility` returned **`PRIVATE`**. Sezzle's reviewers cannot open the repository until the user either makes it public or adds the reviewers as collaborators. Visibility and permissions were not changed in this phase.

## 12. Remaining blockers

| Item | Severity | Owner |
|------|----------|-------|
| The repository is private | **Submission blocker** (external step) | User |
| The P-005 documentation changes are not committed or pushed | **Submission blocker** (external step) | User |
| Seven ChatGPT-side originals are not transcribed (section 9) | Minor. Disclosed as incomplete. Transcribing them would complete the AI-prompt deliverable | User |
| No automated browser/E2E tests. The browser check was manual (P-004) | Minor, documented | — |
| Only Go 1.27.3 has been tested, although `go.mod` declares 1.22 | Minor, documented | — |

There are no technical blockers.

## 13. Files modified in P-005

| File | Change |
|------|--------|
| `docs/ai/PROMPTS.md` | Added the P-005 entry and index row. Added the *Interactions not yet transcribed* and *Disclosure status* sections. Updated the framing sentences that said "P-001 to P-004" or "P-001, P-002, and P-003" |
| `README.md` | Corrected the AI disclosure paragraph so it describes everything that is missing |
| `docs/TEST_REPORT.md` | Appended a "Re-verification in P-005" section. Earlier sections are unchanged |
| `docs/ai/reports/05-final-handoff.md` | New: this report |

## 14. Recommended Git commands (after the user has reviewed the changes)

```bash
git status -sb
git diff                                   # review the four files above
git add README.md docs/TEST_REPORT.md docs/ai/PROMPTS.md docs/ai/reports/05-final-handoff.md
git commit -m "docs(ai): record P-005 final audit and handoff"
git push origin main
git status -sb                             # expect: ## main...origin/main
```

Do not use `git add -A` or `git add .`. The ignore rules already exclude `sezzle-ai-review.zip`, but naming the four files makes the commit explicit.

## 15. Recommended submission procedure

1. Optionally, transcribe the seven missing ChatGPT originals into `docs/ai/PROMPTS.md` and commit them with the files above.
2. Commit and push (section 14).
3. Grant access. Either make the repository public (`gh repo edit mrav7/sezzle-calculator --visibility public --accept-visibility-change-consequences`) or add the reviewers Sezzle names as collaborators.
4. Check access from a signed-out browser, or ask the reviewer, by opening `https://github.com/mrav7/sezzle-calculator`.
5. Send the URL to Sezzle.

Nothing in this report means that Sezzle has received or evaluated the repository.

## Verdict

**READY WITH MINOR LIMITATIONS.** The technical work is complete and was verified again in this phase: all tests pass, coverage is reported, the build succeeds, and HTTP integration and a clean checkout work, with no critical defects. External steps remain before submission: committing and pushing these documentation changes, and giving reviewers access to the private repository. The AI prompt log is accurate but still incomplete on the ChatGPT side, and it says so.
