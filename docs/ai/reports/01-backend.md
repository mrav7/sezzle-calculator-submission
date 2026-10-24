# Report 01 — Backend foundation (P-001)

## Files created

| File | Purpose |
|------|---------|
| `backend/go.mod` | Module `sezzle-calculator/backend`, `go 1.22`, no dependencies |
| `backend/cmd/server/main.go` | Starts the HTTP server on `:8080` with timeouts |
| `backend/internal/calculator/calculator.go` | `Calculate(op, a, b)`; sentinel errors; no HTTP knowledge |
| `backend/internal/calculator/calculator_test.go` | Unit tests for arithmetic and errors |
| `backend/internal/httpapi/handler.go` | Routing, request decoding/validation, status codes, JSON responses |
| `backend/internal/httpapi/handler_test.go` | `httptest` tests of the full API contract |
| `docs/SPECIFICATION.md`, `docs/DECISIONS.md` | API contract; decisions and rationale |
| `docs/ai/PROMPTS.md` | Prompt log (P-001 recorded verbatim) |
| `docs/ai/reports/01-backend.md` | This report |
| `.gitignore` | Ignores generated `coverage.out` |

No frontend code, no extra operations, nothing committed or pushed.

## Architecture

`httpapi.NewHandler()` → `ServeMux` (`/api/calculate`, catch-all `/` for JSON 404) → `handleCalculate`: method → Content-Type → `decodeRequest` (8 KiB cap, unknown fields rejected, single-value check) → `validateRequest` (pointer fields distinguish missing from `0`) → `calculator.Calculate` → `writeResult` or `writeCalculationError`. Full rationale: `docs/DECISIONS.md` (D-01…D-17).

## Environment note

Go was **not installed** on this machine. I downloaded the official `go1.27.3.linux-amd64` tarball from go.dev into the session scratchpad, verified its SHA-256 against the value published by go.dev, and used it for every command below. Nothing was installed system-wide. (My first download attempt saved a redirect page; the checksum check rejected it and I retried with redirects followed.)

## Commands executed and results

Run from `backend/`, with that toolchain on `PATH`:

| Command | Result |
|---------|--------|
| `gofmt -l .` | No output (all files formatted) |
| `go vet ./...` | No output (no issues) |
| `go test ./...` | `calculator` ok, `httpapi` ok, `cmd/server` has no test files |
| `go test ./... -v` | 150 `PASS` lines (tests + subtests), 0 `FAIL` |
| `go test -race ./...` | ok (extra, not requested) |
| `go test ./... -coverprofile=coverage.out` | ok |
| `go tool cover -func=coverage.out` | see below |
| Manual smoke test: built the binary, ran it, `curl`ed it | `add` → `200 {"result":15}`; divide by 0 → `400 DIVISION_BY_ZERO`; `GET` → `405` + `Allow: POST`; `text/plain` → `415`; unknown path → `404`. Server logged `listening on :8080` |

## Coverage

```
cmd/server/main.go:12            main                   0.0%
internal/calculator  Calculate                          100.0%
internal/httpapi     NewHandler, handleCalculate,
                     isJSONContentType, decodeRequest,
                     typeErrorMessage, validateRequest,
                     writeCalculationError, writeResult,
                     writeError, writeJSON              100.0%
internal/httpapi     classifyDecodeError                87.5%
total                                                   95.8% of statements
```

Per package: `calculator` 100.0%, `httpapi` 98.8%, `cmd/server` 0.0%.

- `main()` is untested: it only constructs and starts a server. Its behaviour was checked by the manual smoke test above, not by an automated test.
- `classifyDecodeError` 87.5%: the uncovered statement is the defensive `default` branch (an unrecognised decode error mapped to `INVALID_JSON`). I could not find an input that reaches it through the public API, and did not write a contrived test just to raise the number.

## Known limitations / deviations

- **Oversized body returns 400 `VALIDATION_ERROR`**, not 413, because the brief specifies 400 and provides no dedicated code (D-07).
- **`null` operands are treated as missing**, not as a type error (D-04).
- **`encoding/json` leniencies kept:** case-insensitive key matching (`"A"` → `a`) and last-wins duplicate keys (D-15).
- **`-0` is serialised as `0`** by the HTTP layer (D-12).
- **Redirects from `ServeMux`:** paths needing cleaning (e.g. `//api/calculate`) get a `307` redirect (to the cleaned path) from the standard mux before reaching our handler, so that response is not a JSON error body. Observed with a throwaway test (since removed); not covered by the committed tests and not in the brief.
- `typeErrorMessage` relies on `encoding/json` reporting an out-of-range number as `Value: "number <literal>"`. This is covered by a test, so a change in a future Go release would fail the test rather than silently misbehave (the fallback is still a `VALIDATION_ERROR`).
- `go 1.22` in `go.mod` was chosen for compatibility; only tested with Go 1.27.3.
- Module path `sezzle-calculator/backend` is a placeholder; rename if the repository gets a hosted import path.
- No CORS headers, graceful shutdown, configurable port or request logging.

## Review before implementing the frontend

1. **Dev connectivity:** the frontend will run on a different origin (e.g. Vite on 5173) than `:8080`. Either use a dev-server proxy for `/api` (no backend change) or add CORS (backend change; `OPTIONS` currently returns 405). Decide which.
2. **Number display:** the API returns raw float64 (`0.30000000000000004`). The frontend needs a formatting/rounding policy for display; JS numbers are also float64, so values round-trip through `JSON.parse` without extra loss.
3. **Error handling contract:** the UI should branch on `error.code`; messages are human text and may change.
4. **Oversized-body status (400 vs 413)** and **missing-before-unknown-operation ordering** (D-07, D-09) — confirm these are the behaviours you want before the frontend depends on them.
5. **Module path / Go version** (D-16).
6. Confirm the exact-prompt record in `docs/ai/PROMPTS.md` — see the note below.

## Prompt-preservation note

P-001 was copied into `docs/ai/PROMPTS.md` from the message as it was delivered to me, between the paste markers (the markers themselves are not part of the prompt). I have no byte-level way to diff it against your original, so please compare it against your source; the characters most at risk are the en dashes (`2–4 hours`, `TASK — P-001`) and trailing whitespace.
