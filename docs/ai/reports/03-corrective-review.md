# Report 03 — Corrective changes and submission readiness (P-003)

> Historical record of P-003. After this report was written, [PROMPTS.md](../PROMPTS.md) was expanded with the ChatGPT entries C-001 to C-004, transcribed by the user. C-002 identifies the independent audit cited in P-003 as a ChatGPT review. The earlier ChatGPT planning messages behind P-001 and P-002 are still not fully transcribed. The findings below are unchanged and describe the repository as it was at the time.
>
> **Note added in P-006 (public submission):** [PROMPTS.md](../PROMPTS.md) no longer contains the ChatGPT entries (C-001 to C-009) or the list of untranscribed ChatGPT messages referred to below. They were replaced by a summary, [ChatGPT — Planning and Technical Review](../PROMPTS.md#chatgpt--planning-and-technical-review), which does not reproduce the ChatGPT conversations. References to them here are historical. The Claude Code prompts are unchanged, and so are this report's findings and test results.

Assistant: Claude Code (Claude Opus 5.5), 2026-10-23. Nothing was committed or pushed. The repository still has no commits.

## 1. Files created and modified

| File | Change |
|------|--------|
| `frontend/src/calculation.ts` | **Modified.** `formatResult` shows integers exactly; `parseOperand` rejects magnitudes above `Number.MAX_SAFE_INTEGER` |
| `frontend/src/calculation.test.ts` | **Modified.** New formatting and range cases; the old `123456789012000` expectation was replaced |
| `frontend/src/components/Calculator.test.tsx` | **Modified.** Added a large-integer display test and a safe-range rejection test; updated the overflow message |
| `README.md` | **Created** |
| `docs/TEST_REPORT.md` | **Created** |
| `docs/ai/reports/03-corrective-review.md` | **Created** (this file) |
| `docs/SPECIFICATION.md` | **Modified.** Run section now points to the README; validation table, result-display policy, numeric semantics and test count updated |
| `docs/DECISIONS.md` | **Modified.** F-07 revised, F-04 wording updated, F-13 added |
| `docs/ai/PROMPTS.md` | **Modified.** Intro reworded; index and ChatGPT transcription section added; P-003 appended. P-001/P-002 bytes unchanged |
| `docs/ai/reports/02-frontend.md` | **Modified.** A one-paragraph note at the top points to the P-003 corrections; the historical body is unchanged |
| `.gitignore` | **Modified.** Added `/backend/server`, `*.test`, `.env`, `.env.*`, `*.log`, `.DS_Store` |

No backend source, API client, component, config or dependency was changed. `package.json` and `package-lock.json` are untouched.

## 2. Confirmed defects corrected

1. **Large integers lost digits in the display.** `Number(value.toPrecision(12))` turned `123456789012345` into `123456789012000` and `9007199254740991` into `9007199254740000`. The old code reproduced both values in a probe before the change.
2. **Non-integers with 13 or more integer digits had the same problem.** This was found while fixing defect 1: `1234567890123.5` was displayed as `1234567890120`. The same fix covers it.
3. **Unsafe integer input was silently rounded.** `parseOperand("9007199254740993")` returned `9007199254740992`, and that rounded value would have been sent to the backend. Such input is now rejected with `Enter a number between -9007199254740991 and 9007199254740991.` This single magnitude check also replaces the earlier `Infinity`-overflow check and its `This number is too large.` message.

The tests were changed only where the intended behaviour changed. A mutation run against the old logic failed 11 tests, all of them new or changed cases (see TEST_REPORT.md).

## 3. Final numeric formatting behaviour

The backend still returns raw `float64` values, and its contract is unchanged. `formatResult` only affects what the UI displays:

| Received | Displayed | Rule |
|----------|-----------|------|
| `15`, `-42`, `0`, `-0` | `15`, `-42`, `0`, `0` | Integer: `String(value)`, with no rounding |
| `123456789012345` | `123456789012345` | Integer |
| `9007199254740991` / `-9007199254740991` | same | Integer |
| `0.30000000000000004` | `0.3` | Non-integer: 12 significant digits |
| `0.09999999999999432` (100.1 − 100) | `0.1` | Non-integer |
| `0.3333333333333333` | `0.333333333333` | Non-integer |
| `1234567890123.5` | `1234567890124` | Non-integer with 13 integer digits: precision raised to 13 |
| `1e-7`, `1e21` | `1e-7`, `1e+21` | JavaScript exponent notation |

Twelve digits were kept for non-integers instead of 15, because 15 digits still shows artefacts from cancellation (`100.1 − 100` would be `0.0999999999999943`). Input is limited to ±(2^53 − 1). Results above 2^53, for example from multiplication, are displayed as the shortest decimal for that `float64` value, which may differ from the exact mathematical result. This is documented in the README, SPECIFICATION and DECISIONS F-07/F-13.

## 4. Backend verification (actual)

Go 1.27.3 was not installed on the machine. The official tarball was downloaded into the session scratchpad, its SHA-256 `65efbc80…9b40` was checked against go.dev's published value, and it was used from there. Nothing was installed system-wide.

- `gofmt -l .`: no output. `go vet ./...`: no output.
- `go test ./...`: ok. Verbose output has 150 `--- PASS` lines (17 top-level tests, 133 subtests) and 0 `--- FAIL`.
- `go test -race ./...`: ok.
- `go test ./... -coverprofile=coverage.out` and `go tool cover -func=coverage.out`: total **95.8%**. `calculator` 100.0%, `httpapi` 98.8%, `cmd/server` 0.0%.

## 5. Frontend verification (actual)

Node 24.21.0 / npm 11.19.0. `node_modules`, `dist` and `coverage` were deleted first.

- `npm ci`: 113 packages, 0 vulnerabilities reported.
- `npm run typecheck`: no diagnostics.
- `npm run test`: **97 passed**, 0 failed (previously 81; 16 cases added).
- `npm run test:coverage`: 97 passed.
- `npm run build`: succeeded; JS bundle 224.12 kB (70.48 kB gzip).

## 6. Coverage

| | Statements | Branches | Functions | Lines |
|-|-----------|----------|-----------|-------|
| Backend (Go) | 95.8% | — | — | — |
| Frontend (v8) | 98.23% (111/113) | 94.2% (65/69) | 100% | 100% |

`calculation.ts` is at 100% on every metric.

## 7. Integration verification

Port 8080 on the host was held by a `./server` process started at 22:10 from an earlier session's scratchpad. I did not stop it, because this session did not start it. **It is still running.** Instead, every check ran inside `unshare -rn` (a private loopback interface) against a binary freshly built from the current source.

- **HTTP level:** curl requests went directly to `:8080` and through `vite preview` on `:4173`. Both returned identical results for success cases, all four 400 codes, plus 405 (`Allow: POST` preserved through the proxy), 415 and 404. The README's own `go run ./cmd/server`, `npm run preview` and `npm run dev` commands were also run, and each request through the proxy returned the correct result.
- **Browser level:** a throwaway headless Chrome 156 script drove the built app at 320px against the real backend. Large integers displayed exactly (`123456789012340 + 5 = 123456789012345`), `0.1 + 0.2 = 0.3`, and `9007199254740993` and division by zero were rejected with no request sent. No horizontal overflow occurred. This check is manual and not part of the automated tests.

During cleanup, my first script ran `pkill -f 'vite preview'`. Because the namespace isolates the network but not process IDs, the pattern was matched host-wide and killed the script's own wrapper shell. No `vite` process and nothing on ports 4173 or 5173 was running on the host afterwards. Later scripts used PID-based or PID-namespaced cleanup.

## 8. README and documentation completeness

`README.md` covers every item P-003 lists: overview, stack, prerequisites, setup, backend and frontend run commands, ports and proxy, endpoint, examples (response bodies captured from the running server), validation and errors, test and coverage commands, design decisions, limitations including numeric precision, the AI disclosure, and links. Every command in it was executed in this phase, and `go tool cover -html` was run with `-o` to a temporary file.

SPECIFICATION, DECISIONS, README and TEST_REPORT were reconciled. Run commands now live only in the README, and the full error-code reference only in SPECIFICATION; the README keeps a summary table. A search of the docs for stale statements (`toPrecision(12)` as the current rule, `123456789012000`, `81 tests`, `too large`) finds them only in historical context: the F-07 revision note and the annotated P-002 report.

## 9. AI prompt disclosure completeness

- P-001 and P-002 are unchanged. The bytes from `## P-001` to the end of P-002 hash to `795613c4…a63a` both before and after the edit.
- P-003 is appended in a ```` fence, copied from the message as delivered. The message wrapped the pasted text in paste markers, which were not included. **Limitation:** I cannot byte-compare it with your original. The characters most at risk are the em dash in the title (`P-003 — Corrective`), straight versus typographic quotes, and trailing whitespace.
- No other prompts were sent to Claude Code during this phase. The `/model` command beforehand is a CLI command, not a prompt.
- **Not disclosed yet, and requiring manual transcription by you:** the ChatGPT planning and drafting conversations for P-001 to P-003, the independent audit cited in P-003 (tool unknown to me), and any other ChatGPT review. These are listed in a dedicated section of PROMPTS.md. Nothing was reconstructed. The index marks all three Claude Code prompts as *executed*. Any drafts that differ from them should be added and marked *drafted, not executed*.

Until those transcriptions are added, the prompt disclosure is **incomplete**.

## 10. Remaining limitations and blockers

- **Blocker for disclosure only:** the ChatGPT and audit prompts must be transcribed by you (section 9).
- `formatResult` precision limits and the ±2^53 input range are by design and documented. Results above 2^53 are only as exact as `float64` allows.
- There are no automated browser or E2E tests. The browser check covered one browser at one width.
- The backend was tested only with Go 1.27.3.
- There is no production serving setup (same-origin `/api` routing).
- The stray `./server` process on host port 8080 is still running. You may want to stop it (`kill 69481`, after checking that it is the expected process).
- Generated artefacts remain on disk but are git-ignored: `backend/coverage.out`, `frontend/coverage/`, `frontend/dist/` and `frontend/node_modules/`. With this report in place, `git ls-files --others --exclude-standard` lists exactly 32 files: source, tests, config, `package-lock.json`, `.gitignore`, `README.md` and the docs. No credentials or env files exist.

## Readiness assessment

**READY WITH MINOR LIMITATIONS.**

Evidence: the confirmed defects are fixed, and tests that fail against the old code cover them. All requested backend checks (gofmt, vet, test, race, coverage at 95.8%) and frontend checks (ci, typecheck, 97 tests, coverage at 98.23%, build) passed in this phase. HTTP-level and real-browser integration against a freshly built backend succeeded. The README and test report are present and consistent with the code, and the working tree is clean of secrets and generated files.

The limitations: the ChatGPT and audit prompt transcriptions, which only you can supply, are still missing. Browser verification is manual only. The P-003 text could not be byte-verified against its source.
