# Test Report

Final verification after the numeric formatting fix (P-004), run on 2026-10-24. Every result below comes from a command that was actually executed in P-004. Nothing has been copied forward from earlier reports. The P-003 run (2026-10-23) is recorded in [docs/ai/reports/03-corrective-review.md](ai/reports/03-corrective-review.md).

## Environment

| Item | Version / note |
|------|----------------|
| OS | Fedora Linux 44, kernel 7.2.11-200.fc44.x86_64 |
| Go | go1.27.3 linux/amd64. Go is not installed on this machine, so the official tarball was downloaded into a temporary session directory, its SHA-256 (`65efbc80…9b40`) was checked with `sha256sum -c` against the value published by go.dev, and it was used from there. Nothing was installed system-wide. |
| Node.js / npm | v24.21.0 / 11.19.0, selected in `frontend/` by the local version manager (fnm) |
| TypeScript | 5.9.3 |
| Vite / Vitest | 8.3.5 / 5.0.5 |
| Browser (manual check only) | Google Chrome 156.0.8078.47, headless |

## Backend

Run from `backend/`:

| Command | Result |
|---------|--------|
| `gofmt -l .` | No output: all files are formatted |
| `go vet ./...` | No output, exit 0 |
| `go test ./...` | `internal/calculator` ok, `internal/httpapi` ok; `cmd/server` has no test files |
| `go test ./... -v` | 150 `--- PASS` lines (17 top-level tests, 133 subtests), 0 `--- FAIL` |
| `go test -race ./...` | ok for both packages |
| `go test ./... -coverprofile=coverage.out` | ok |
| `go tool cover -func=coverage.out` | see below |
| `go tool cover -html=coverage.out -o <tmp>/cover.html` | HTML report generated (not kept in the repository) |

### Backend coverage

| Package / function | Statements |
|--------------------|-----------|
| `internal/calculator` | 100.0% |
| `internal/httpapi` | 98.8% (all functions 100% except `classifyDecodeError`, 87.5%) |
| `cmd/server` (`main`) | 0.0% |
| **Total** | **95.8%** |

- `main()` only builds and starts the server. It has no automated test; it was exercised by the integration checks below.
- The uncovered statement in `classifyDecodeError` is a defensive fallback for an unrecognised decoder error. No request through the public API reaches it.

The backend source was not changed in P-003 or P-004.

## Frontend

Run from `frontend/`, starting from a deleted `node_modules/`, `dist/` and `coverage/`:

| Command | Result |
|---------|--------|
| `npm ci` | Added 113 packages; "found 0 vulnerabilities" |
| `npm run typecheck` (`tsc --noEmit`) | No diagnostics, exit 0 |
| `npm run test` | 4 files, **117 tests passed**, 0 failed |
| `npm run test:coverage` | 117 passed; coverage below |
| `npm run build` (`tsc --noEmit && vite build`) | Succeeded: `index.html` 0.39 kB, CSS 2.18 kB, JS 224.12 kB (70.48 kB gzip) |

Tests per file: `calculation.test.ts` 67, `components/Calculator.test.tsx` 34, `api/calculator.test.ts` 15, `App.test.tsx` 1. P-004 added 20 tests (19 formatter cases and one component test) to the 97 of P-003.

### Frontend coverage (v8)

| File | Statements | Branches | Functions | Lines |
|------|-----------|----------|-----------|-------|
| `src/calculation.ts` | 100% (15/15) | 100% (10/10) | 100% | 100% |
| `src/api/calculator.ts` | 100% (29/29) | 95.45% (21/22) | 100% | 100% |
| `src/components/Calculator.tsx` | 97.05% (66/68) | 91.89% (34/37) | 100% | 100% |
| `src/App.tsx` | 100% | 100% | 100% | 100% |
| **All files** | **98.23% (111/113)** | **94.2% (65/69)** | **100% (21/21)** | **100% (97/97)** |

`main.tsx` and the test files are excluded from coverage. The gaps are defensive fallbacks, such as the generic message for an error that is neither `ApiError` nor `NetworkError`. No coverage thresholds are enforced.

### Mutation check of the P-004 fix

Two incorrect formatters were put in temporarily, and the real one was restored afterwards:

| Temporary formatter | Result |
|---|---|
| P-003 rule, `toPrecision(max(12, integerDigits))` | **10 tests failed**: every large fractional case (`1234567890123.5`, `-1234567890123.5`, `1234567890123.25`, `99999999999.25`, `123456789012345.1`, `4503599627370495.5`, `999999999999.5`, `999999999999999.5`), `1e10 / 3` and the new component test |
| No rounding, `String(value)` | **16 tests failed**: the artefact cases at every magnitude (`0.1 + 0.2` and its negation, `0.7 + 0.1`, `1.1 × 1.1`, `4.35 × 100`, `100.1 − 100`, `99.99999999999999`, `1000000000.1 + 0.2`, `10000000000.1 + 0.2`), repeating and small decimals (`1/3`, `2/3`, `1e10 / 3`, `0.000123456789012345`, `3.333333333333333e-7`), the near-power-of-ten trade-off test and the existing `0.1 + 0.2` component test |

With the real formatter, all 117 tests pass. The new tests therefore detect both losing real fractional digits and showing binary artefacts.

### Mutation check of the P-003 fix (historical, 2026-10-23)

The previous `parseOperand` / `formatResult` logic (`Number.isFinite` check, `Number(value.toPrecision(12))`) was put back temporarily. Under it, **11 tests failed**: the safe-range rejections, exact large-integer formatting, non-integer rounding that keeps integer digits, and the two new component tests. With the fix restored, all 97 tests passed. The new tests therefore detect the original defects.

## Integration

Port 8080 was again taken on the host by a server process left over from an earlier session (not started in P-004, and left running). Rather than stop it, the checks ran inside an isolated network namespace (`unshare -rn`) with its own loopback interface, against a backend binary freshly built from the current source and `vite preview`, which uses the same `/api` proxy as `vite dev`.

### HTTP level (curl)

The same requests were sent directly to `:8080` and through the proxy on `:4173`. Both returned identical bodies:

| Request | Status | Body |
|---------|--------|------|
| add 1234567890123, 0.5 | 200 | `{"result":1234567890123.5}` |
| subtract -1234567890123, 0.5 | 200 | `{"result":-1234567890123.5}` |
| add 1234567890123, 0.25 | 200 | `{"result":1234567890123.25}` |
| subtract 100.1, 100 | 200 | `{"result":0.09999999999999432}` |
| add 10, 5 | 200 | `{"result":15}` |
| add 0.1, 0.2 | 200 | `{"result":0.30000000000000004}` |
| subtract -3.5, 0 | 200 | `{"result":-3.5}` |
| multiply 3000000, 3000000 | 200 | `{"result":9000000000000}` |
| add 123456789012340, 5 | 200 | `{"result":123456789012345}` |
| add 9007199254740990, 1 | 200 | `{"result":9007199254740991}` |
| divide 1, 3 | 200 | `{"result":0.3333333333333333}` |
| divide 1, 0 | 400 | `DIVISION_BY_ZERO` |
| multiply 1e308, 10 | 400 | `RESULT_OUT_OF_RANGE` |
| power 2, 3 | 400 | `UNKNOWN_OPERATION` |

Through the proxy, `GET` returned 405 with `allow: POST`, `Content-Type: text/plain` returned 415 `UNSUPPORTED_MEDIA_TYPE`, and `/api/nope` returned 404 `NOT_FOUND`.

The README's own commands were also run in an isolated namespace. `go run ./cmd/server` followed by `npm run preview` returned `{"result":15}` both directly and through the proxy. `npm run dev` proxied requests on `:5173` to `{"result":1234567890123.5}` (add 1234567890123, 0.5) and `{"result":9000000000000}` (multiply 3000000, 3000000).

### Browser level (headless Chrome)

A throwaway DevTools-protocol script, kept outside the repository, loaded the built app from `vite preview` at a 320×640 viewport against the real backend. It filled the inputs, submitted the form and read the result region:

| Input | Displayed | Requests sent |
|-------|-----------|---------------|
| 1234567890123 + 0.5 | `1234567890123 + 0.5 = 1234567890123.5` | 1 |
| -1234567890123 − 0.5 | `-1234567890123 − 0.5 = -1234567890123.5` | 1 |
| 1234567890123 + 0.25 | `1234567890123 + 0.25 = 1234567890123.25` | 1 |
| 0.1 + 0.2 | `0.1 + 0.2 = 0.3` | 1 |
| 100.1 − 100 | `100.1 − 100 = 0.1` | 1 |
| 1 ÷ 3 | `1 ÷ 3 = 0.333333333333` | 1 |
| 123456789012340 + 5 | `123456789012340 + 5 = 123456789012345` | 1 |
| 0 × 5 | `0 × 5 = 0` | 1 |
| 9007199254740993 + 1 | `Enter a number between -9007199254740991 and 9007199254740991.` | 0 |
| 5 ÷ 0 | `Cannot divide by zero.` | 0 |

No case caused horizontal overflow at 320px. The request payloads seen by the browser matched the typed operands.

## Limitations of this verification

- The browser check is manual, in one browser (Chrome), at one width, using scripted DOM events. It is not part of the repository's automated tests, and there are no E2E tests.
- Component tests run in jsdom, not a real browser.
- The backend was tested only with Go 1.27.3, although `go.mod` declares `go 1.22`.
- `npm audit` was not run beyond the summary printed by `npm ci`.
- Accessibility was not audited with a screen reader or an automated tool.

## Re-verification in P-005 (2026-10-24)

The final submission audit ran the same commands again on commit `291d722`. The sections above were left as they were. Nothing changed: every figure below was measured again and matches the P-004 results.

- **Toolchain:** Go 1.27.3, from the same official tarball (SHA-256 re-checked against go.dev, used from the session scratchpad, not installed). Node v24.21.0, npm 11.19.0, TypeScript 5.9.3, Vite 8.3.5, Vitest 5.0.5.
- **Backend:** `gofmt -l .` printed nothing, `go vet` reported nothing, `go test -count=1` and `go test -race -count=1` were ok. There were 150 `--- PASS` lines and 0 `--- FAIL`. Coverage: `calculator` 100.0%, `httpapi` 98.8%, total 95.8%.
- **Frontend:** `npm ci` added 113 packages and reported 0 vulnerabilities, and `typecheck` passed. 117/117 tests passed. Coverage: 98.23% statements, 94.2% branches, 100% functions and 100% lines. `build` succeeded with the same bundle sizes.
- **HTTP integration:** the checks ran in an isolated network namespace, because a process from another session again held port 8080. The backend was built from HEAD and run with `vite dev` on :5173. 16 requests gave identical bodies directly and through the proxy: the four operations, `0.1 + 0.2`, `1234567890123 + 0.5`, division by zero, overflow, an unknown operation, a wrong type, a missing field, an unknown field, malformed JSON, 405 with `Allow: POST`, 415 and 404.
- **Clean checkout:** after `git clone` from GitHub (authenticated SSH, since the repository is private), `go vet`, `go test`, `npm ci`, `npm run test` and `npm run build` all passed in a temporary directory, with no files beyond the tracked ones.
- **Browser:** no browser check was repeated in P-005. The headless Chrome check above (P-004) is still the latest.

Details are in [docs/ai/reports/05-final-handoff.md](ai/reports/05-final-handoff.md).
