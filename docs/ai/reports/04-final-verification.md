# Report 04 — Final numeric precision fix and submission audit (P-004)

Assistant: Claude Code (Claude Opus 5.5, model ID `claude-opus-5-5`), 2026-10-24. Nothing was committed, amended, rebased or pushed. All changes are uncommitted in the working tree.

> **Note added in P-006 (public submission):** [PROMPTS.md](../PROMPTS.md) no longer contains the ChatGPT entries (C-001 to C-009) or the list of untranscribed ChatGPT messages referred to below. They were replaced by a summary, [ChatGPT — Planning and Technical Review](../PROMPTS.md#chatgpt--planning-and-technical-review), which does not reproduce the ChatGPT conversations. References to them here are historical. The Claude Code prompts are unchanged, and so are this report's findings and test results.

## 1. Files changed

| File | Change |
|------|--------|
| `frontend/src/calculation.ts` | **Modified.** `formatResult` rounds non-integers to `max(12, integerDigits + 3)` significant digits instead of `max(12, integerDigits)`. The doc comment was updated. `parseOperand` is unchanged. |
| `frontend/src/calculation.test.ts` | **Modified.** The `formatResult` table was rewritten from 18 to 36 cases, plus one named trade-off test. The two `1234567890124` expectations were corrected to `1234567890123.5`. |
| `frontend/src/components/Calculator.test.tsx` | **Modified.** One new test: a mocked API result `1234567890123.5` is displayed in full. |
| `README.md` | Two bullets on display formatting and numeric limitations |
| `docs/SPECIFICATION.md` | The non-integer formatting rule and its examples, and the frontend test count (97 → 117) |
| `docs/DECISIONS.md` | F-07 title, a *Revised in P-004* note with the trade-off, and the header line. The P-003 note is kept. |
| `docs/TEST_REPORT.md` | Re-measured results for P-004, a new mutation check, and the P-003 mutation check labelled as historical |
| `docs/ai/PROMPTS.md` | P-004 appended verbatim, index and intro updated |
| `docs/ai/reports/04-final-verification.md` | **New.** This report. |
| `.gitignore` | Added `*.zip` |

The backend, the REST contract, `parseOperand` and all other source files were not touched.

## 2. Root cause of the formatting defect

P-003 computed `value.toPrecision(Math.max(12, integerDigits))`. For a value with 12 or more integer digits, the precision was used up entirely by the integer part, leaving **zero** fractional digits. `1234567890123.5` (13 integer digits) became `toPrecision(13)` = `1234567890124`. It also rounded the integer part *up*, although `.5` is exact in `float64`. The same happened between 10 and 11 digits, where only one or two decimals survived: `99999999999.25` became `99999999999.3`. The fix in P-003 protected integer digits from being zeroed, but it reserved no room for the fraction.

## 3. Formatting policy implemented

```ts
if (Number.isInteger(value)) return String(value === 0 ? 0 : value);
const integerDigits = String(Math.trunc(Math.abs(value))).length;
return String(Number(value.toPrecision(Math.max(12, integerDigits + 3))));
```

| Value kind | Display |
|---|---|
| Integer (including `-0`) | `String(value)`: exact, no rounding; `-0` → `0` |
| Non-integer, \|x\| < 1e9 | 12 significant digits (unchanged from P-003) |
| Non-integer, \|x\| ≥ 1e9 | 3 decimal places (integer digits + 3 significant digits) |
| Non-integer near the `float64` limit (≳ 1e13) | Requested precision ≥ `float64` resolution, so `Number(...)` returns the same double and `String()` prints its shortest round-trip form |

In one sentence: *12 significant digits, but never fewer than 3 decimal places.* It is deterministic and locale-independent, adds no dependencies, and does no arithmetic on the result. The returned number is never modified; only the displayed string is.

Alternatives considered:

- **`String(value)` for large values (a magnitude threshold).** This shows artefacts that ordinary input produces: `1000000000.1 + 0.2` = `1000000000.3000001`, and `10000000000.1 + 0.2` = `10000000000.300001`. It also introduces a discontinuity at the threshold.
- **A fixed precision of 15 to 17 digits.** This shows cancellation artefacts (`100.1 − 100` → `0.0999999999999943`).

**Trade-off between faithful and cosmetic display.** A `float64` does not record what the user meant. `0.30000000000000004` and `0.1 + 0.2` are the same bits, so every rounding rule is a guess. This rule hides binary artefacts for ordinary decimal input at every magnitude. The cost is that real digits beyond the kept precision are hidden: `1234567890.1234` → `1234567890.123`, and `999999999.9995` → `1000000000`, where the integer part changes because the hidden fraction rounds up. Showing every digit faithfully would bring back `0.30000000000000004`. The exact value is always the one in the API response.

Verified outputs (Node 24, then the unit tests):

| Value | Display |
|---|---|
| `0`, `-0` | `0` |
| `15` | `15` |
| `123456789012345` | `123456789012345` |
| `9007199254740991` | `9007199254740991` |
| `1234567890123.5` / `-1234567890123.5` | `1234567890123.5` / `-1234567890123.5` |
| `1234567890123.25` | `1234567890123.25` |
| `0.30000000000000004` | `0.3` |
| `0.09999999999999432` | `0.1` |
| `0.3333333333333333` | `0.333333333333` |
| `1000000000.3000001` | `1000000000.3` |
| `123456789012345.1` | `123456789012345.1` (`toPrecision(18)` gives `…345.094`; the round trip restores the shortest form) |

## 4. Regression cases added

Formatter (`calculation.test.ts`), 36 table cases plus one named test:

- Integers: `15`, `-42`, `±123456789012345`, `±9007199254740991`, `1e21`
- Zero and negative zero
- `0.1 + 0.2` (`0.30000000000000004`) and its negation, `0.7 + 0.1`, `1.1 × 1.1`, `4.35 × 100` (`434.99999999999994` → `435`)
- Cancellation: `100.1 − 100` (`0.09999999999999432` → `0.1`)
- Repeating decimals: `1/3`, `2/3`, `1e10 / 3` (`3333333333.3333335` → `3333333333.333`)
- Small values and exponent notation: `0.000123456789012345`, `1e-7`, `1.5e-10`, `3.333333333333333e-7`
- Large fractions: `±1234567890123.5`, `1234567890123.25`, `99999999999.25`, `123456789012345.1`, `4503599627370495.5` (2^52 − 0.5)
- Artefacts at large magnitudes: `1000000000.3000001`, `10000000000.300001`
- Near powers of ten: `9999999999.5`, `999999999999.5`, `999999999999999.5`, `99.99999999999999` → `100`, and the documented trade-off `999999999.9995` → `1000000000`

Component (`Calculator.test.tsx`): mocked API result `1234567890123.5` → status shows `1234567890123 + 0.5 = 1234567890123.5`.

The expected values were derived from the requirements and float64 semantics, not copied from the implementation's output. The mutation checks in section 5 confirm that the tests distinguish the intended behaviour from both incorrect alternatives.

Input validation was not changed. It is already covered by existing tests, which all still pass: unsafe operands are rejected with no request sent (`9007199254740993`, 400 nines), negative and decimal operands are sent as numbers, explicit zero is accepted as either operand and as a dividend, multiplying by zero works, and division by zero is rejected on the client. `parseOperand` and `formatResult` remain separate functions.

## 5. Test results and coverage (actual)

Toolchain: Go 1.27.3 linux/amd64 (official tarball, SHA-256 `65efbc80…9b40` verified with `sha256sum -c` against go.dev, used from the session scratchpad, not installed); Node v24.21.0, npm 11.19.0, TypeScript 5.9.3, Vite 8.3.5, Vitest 5.0.5.

**Backend** (unchanged source):

| Command | Result |
|---|---|
| `gofmt -l .` | no output |
| `go vet ./...` | no output, exit 0 |
| `go test ./...` | `internal/calculator` ok, `internal/httpapi` ok |
| `go test -race ./...` | ok, ok |
| `go test -v -count=1 ./...` | 150 `--- PASS` (17 top-level, 133 subtests), 0 `--- FAIL` |
| `go tool cover -func=coverage.out` | total **95.8%**: calculator 100.0%, httpapi 98.8%, `cmd/server` 0.0% |

**Frontend** (starting from deleted `node_modules/`, `dist/` and `coverage/`):

| Command | Result |
|---|---|
| `npm ci` | added 113 packages, found 0 vulnerabilities |
| `npm run typecheck` | exit 0, no diagnostics |
| `npm run test` | 4 files, **117 passed**, 0 failed (67 / 34 / 15 / 1) |
| `npm run test:coverage` | statements **98.23%** (111/113), branches 94.2% (65/69), functions 100%, lines 100%; `calculation.ts` 100% in every metric |
| `npm run build` | ok: JS 224.12 kB (70.48 kB gzip), CSS 2.18 kB |

**Mutation checks** (the real formatter was restored after each, and the suite was re-run with 117 passing):

- With the P-003 rule put back, 10 tests failed: all of the large-fraction cases and the new component test.
- With `String(value)` and no rounding, 16 tests failed: all of the artefact, repeating and small-decimal cases.

## 6. Integration checks performed

Port 8080 on the host is still held by a `server` process that this session did not start (pid 69481, the same leftover noted in report 03). It was not stopped. All checks ran inside `unshare -rn`, which gives a private loopback.

- **HTTP (curl).** These ran against a backend binary freshly built from the current source, both directly on `:8080` and through `vite preview` on `:4173`. The bodies were identical on both paths: `1234567890123 + 0.5` → `{"result":1234567890123.5}`; `−1234567890123 − 0.5` → `-1234567890123.5`; `+ 0.25` → `1234567890123.25`; `0.1 + 0.2`, `100.1 − 100`, `1 ÷ 3` and `123456789012340 + 5` returned their raw `float64` values; `1 ÷ 0` → 400 `DIVISION_BY_ZERO`; `1e308 × 10` → 400 `RESULT_OUT_OF_RANGE`; `power` → 400 `UNKNOWN_OPERATION`. Through the proxy, `GET` → 405 with `allow: POST`, `text/plain` → 415, and `/api/nope` → 404.
- **README commands.** `go run ./cmd/server` logged `listening on :8080`. `npm run preview` and `npm run dev` (`:5173`) both proxied correctly, and dev returned `{"result":1234567890123.5}`.
- **Browser (manual, not automated).** A throwaway CDP script drove headless Google Chrome 156.0.8078.47 (run with `--no-sandbox` inside the namespace) against the built app at 320×640. Displayed results:

  - `1234567890123 + 0.5 = 1234567890123.5`
  - `-1234567890123 − 0.5 = -1234567890123.5`
  - `1234567890123 + 0.25 = 1234567890123.25`
  - `0.1 + 0.2 = 0.3`
  - `100.1 − 100 = 0.1`
  - `1 ÷ 3 = 0.333333333333`
  - `123456789012340 + 5 = 123456789012345`
  - `0 × 5 = 0`

  Each of these sent exactly one request, with the typed operands as JSON numbers. `9007199254740993 + 1` and `5 ÷ 0` showed their validation messages and sent **0** requests. There was no horizontal overflow.

## 7. Documentation updates

- **README:** the design bullet and the numeric limitation now state the "12 significant digits or 3 decimal places" rule, with examples of hidden digits.
- **SPECIFICATION:** the non-integer rule, the corrected `1234567890123.5` example, the magnitude behaviour and the trade-off example; the test count is now 117.
- **DECISIONS F-07:** a P-004 revision with the root cause, the rule, the rejected alternatives and the trade-off. The P-003 note is kept as history.
- **TEST_REPORT:** re-measured in P-004, with the P-003 mutation section kept and labelled historical.

The IEEE 754 limits are stated without any claim of arbitrary precision. Reports 01 to 03 were not edited. A search for stale statements finds `1234567890124` and `97 tests` only in historical passages: report 03, the P-003 notes, and the P-004 prompt text.

## 8. AI prompt disclosure status

- P-004 is appended to `PROMPTS.md` in a ```` fence, copied from the message as delivered (the paste markers are not included). It has not been byte-compared with your source.
- The text of P-001 to P-003 and C-001 to C-004 is unchanged. A programmatic comparison of the section from `## P-001` to the end of P-003 against `HEAD` is identical.
- No other implementation prompts were sent in this phase. `/usage` and `/status` are CLI commands.
- **Remaining manual task for you:** transcribe the original Sezzle assignment, the earlier ChatGPT planning messages behind P-001 and P-002, and, if ChatGPT was used to draft P-004, that conversation. Nothing was reconstructed.

## 9. Git status and uncommitted changes

- `git log --oneline` shows 5 commits, `b0182ff` … `99b94f4`, with history unchanged. `main` is **1 commit ahead of `origin/main`** (`99b94f4` is not pushed).
- `git status` shows 9 tracked files modified (section 1) plus the new report. Nothing is staged.
- `git diff --check` is clean.
- The following are ignored and stay out of the next commit: `sezzle-ai-review.zip` (via the new `*.zip` rule; the file itself was not touched), `backend/coverage.out`, `frontend/coverage/`, `frontend/dist/` and `frontend/node_modules/`. None of them is tracked.

## 10. Remaining limitations and submission blockers

**Blockers to sharing (all yours to do):**

1. **The GitHub repository is private.** `gh repo view` reports `"visibility":"PRIVATE"`. Sezzle cannot open it until you make it public or invite their reviewers.
2. **Unpushed work.** These changes need committing, and both that commit and `99b94f4` need pushing.
3. **Disclosure.** The ChatGPT transcriptions in section 8 are missing.

**Limitations (documented, by design):**

- Display rounding hides real digits beyond 12 significant digits or 3 decimal places.
- Integers are exact only up to 2^53 − 1 on input. Larger results are only as exact as `float64` allows.
- The backend uses `float64` throughout, with no decimal or arbitrary-precision arithmetic.
- Exponent notation is not accepted as input.
- There are no automated browser or E2E tests. The browser check covered one browser at one width.
- The backend was tested only with Go 1.27.3.
- There is no production serving setup.
- The stray host process on `:8080` (pid 69481) is still running. Stop it if it is not intentional.

## Readiness assessment

**READY WITH MINOR LIMITATIONS.**

Evidence:

- The confirmed defect is fixed: `1234567890123.5` is shown in full in unit tests, component tests, HTTP-through-proxy checks and a real browser against the real backend.
- The new tests fail against both the P-003 rule and an unrounded formatter.
- All required backend checks pass: gofmt, vet, tests, race and 95.8% coverage.
- All required frontend checks pass: ci, typecheck, 117 tests, 98.23% statement coverage and the build.
- The backend and the API contract are unchanged.
- The documentation matches the implemented rule.

The limitations are outside the code: the repository is private and the latest work is unpushed, so it cannot be shared yet. The ChatGPT prompt transcriptions are still to be added by you. The P-004 text could not be byte-verified against its source.
