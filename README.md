# Sezzle Calculator

A full-stack calculator built for the Sezzle technical assessment. A React + TypeScript single-page app collects two numbers and an operation (addition, subtraction, multiplication or division) and sends them to a Go REST API, which performs the arithmetic and returns the result or a structured error.

The backend is the source of truth for every calculation. The frontend only validates input, calls the API and formats the returned number for display.

## Technology stack

| Part | Stack |
|------|-------|
| Backend | Go, standard library only (`net/http`, `encoding/json`, `testing`, `httptest`); no third-party modules |
| Frontend | React 19, TypeScript 5.9, Vite 8, Fetch API, plain CSS |
| Frontend tests | Vitest 5, React Testing Library, jsdom, `@vitest/coverage-v8` |

## Repository layout

```
backend/
  cmd/server/main.go              HTTP server on :8080
  internal/calculator/            arithmetic, no HTTP knowledge
  internal/httpapi/               routing, request validation, JSON responses
frontend/
  src/api/calculator.ts           typed API client
  src/calculation.ts              input parsing and result formatting (no arithmetic)
  src/components/Calculator.tsx   the UI
  vite.config.ts                  /api proxy to the backend
docs/
  SPECIFICATION.md                full API and UI contract
  DECISIONS.md                    design decisions and rationale
  TEST_REPORT.md                  verification results
  ai/PROMPTS.md                   AI prompt log
  ai/reports/                     per-phase implementation reports
```

## Prerequisites

- **Go 1.22 or later.** `go.mod` declares `go 1.22`; the project was only tested with Go 1.27.3.
- **Node.js** `^22.12.0`, `^24.0.0` or `>=26.0.0` (see `engines` in `frontend/package.json`) and **npm**. Verified with Node 24.21.0 and npm 11.19.0.

No database, environment variables or other services are needed.

## Setup and running

The backend and the frontend run as two processes, in two terminals.

**Backend** (terminal 1):

```bash
cd backend
go run ./cmd/server     # logs "listening on :8080"
```

**Frontend** (terminal 2):

```bash
cd frontend
npm ci                  # installs the exact versions in package-lock.json
npm run dev             # http://localhost:5173
```

Open http://localhost:5173.

To try the production bundle locally, run `npm run build` and then `npm run preview` (http://localhost:4173), with the backend still running.

### Ports and the Vite proxy

| Process | Port |
|---------|------|
| Go API | 8080 (fixed in `main.go`) |
| Vite dev server (`npm run dev`) | 5173 |
| Vite preview (`npm run preview`) | 4173 |

The frontend only calls the relative URL `/api/calculate`. `vite.config.ts` forwards every `/api` request from the dev and preview servers to `http://localhost:8080`, so the browser talks to a single origin. The backend therefore needs no CORS support and has none. Any other deployment must route `/api` to the backend from the same origin as the static files, for example through a reverse proxy. That setup is not part of this project.

## REST API

### `POST /api/calculate`

- The `Content-Type` header must be `application/json`. Parameters such as `; charset=utf-8` are accepted.
- The body must be one JSON object of at most 8 KiB.

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `operation` | string | yes | `add`, `subtract`, `multiply`, `divide` (case-sensitive) |
| `a` | number | yes | any finite JSON number; `0` is valid |
| `b` | number | yes | any finite JSON number; `0` is valid except as a divisor |

On success the API returns `200 OK` with `{"result": <number>}`. The result is the raw `float64` value; the backend never rounds. On failure it returns `{"error": {"code": "...", "message": "..."}}`. Clients should branch on `code`, because `message` is human-readable text that may change.

### Examples

```bash
curl -s -X POST http://localhost:8080/api/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","a":10,"b":5}'
```

The responses below were captured from the running server:

| Request body | Status | Response body |
|--------------|--------|---------------|
| `{"operation":"add","a":10,"b":5}` | 200 | `{"result":15}` |
| `{"operation":"add","a":0.1,"b":0.2}` | 200 | `{"result":0.30000000000000004}` |
| `{"operation":"divide","a":1,"b":3}` | 200 | `{"result":0.3333333333333333}` |
| `{"operation":"divide","a":1,"b":0}` | 400 | `{"error":{"code":"DIVISION_BY_ZERO","message":"division by zero is undefined"}}` |
| `{"operation":"multiply","a":1e308,"b":10}` | 400 | `{"error":{"code":"RESULT_OUT_OF_RANGE","message":"result is not a finite number"}}` |
| `{"operation":"power","a":2,"b":3}` | 400 | `{"error":{"code":"UNKNOWN_OPERATION","message":"unsupported operation; expected one of add, subtract, multiply, divide"}}` |

### Error codes

| HTTP | Code | Cause |
|------|------|-------|
| 400 | `INVALID_JSON` | Empty body, malformed or truncated JSON, or more than one JSON value |
| 400 | `VALIDATION_ERROR` | Missing or `null` field, wrong type, unknown field, operand outside the `float64` range, non-object body, or body larger than 8 KiB |
| 400 | `UNKNOWN_OPERATION` | `operation` is not one of the four supported values |
| 400 | `DIVISION_BY_ZERO` | `divide` with `b` equal to `0` |
| 400 | `RESULT_OUT_OF_RANGE` | The result is `±Inf` or `NaN` (overflow) |
| 404 | `NOT_FOUND` | Any path other than `/api/calculate` |
| 405 | `METHOD_NOT_ALLOWED` | A method other than `POST`; the response includes an `Allow: POST` header |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` is missing or is not `application/json` |
| 500 | `INTERNAL_ERROR` | Unexpected failure; no internal details are exposed |

The order of checks and further examples are in [docs/SPECIFICATION.md](docs/SPECIFICATION.md).

## Frontend validation and error handling

The frontend validates input before it sends anything. If validation fails, it sends no request and shows the message under the field:

- Empty or whitespace-only input → `Enter a number.` Empty input is never treated as `0`.
- Anything that isn't plain decimal notation, such as `abc`, `1,5`, `1e5` or `Infinity` → `Enter a valid number, such as 12, -3.5 or 0.25.`
- A magnitude above `9007199254740991` (`Number.MAX_SAFE_INTEGER`) → `Enter a number between -9007199254740991 and 9007199254740991.`
- Division by `0`, `0.0` or `-0` → `Cannot divide by zero.`

Backend errors are shown using the backend's message for `VALIDATION_ERROR`, `UNKNOWN_OPERATION`, `DIVISION_BY_ZERO` and `RESULT_OUT_OF_RANGE`. Any other code, or a response the client can't use, shows a generic message. A failed `fetch` shows a separate "could not reach the service" message. The Calculate button is disabled while a request is pending. Editing any input clears the shown result and aborts the request in flight, so a result is never displayed next to inputs it wasn't computed from.

## Tests and coverage

**Backend** (from `backend/`):

```bash
gofmt -l .                                   # prints nothing when all files are formatted
go vet ./...
go test ./...
go test -race ./...
go test ./... -coverprofile=coverage.out     # coverage.out is git-ignored
go tool cover -func=coverage.out             # per-function summary
go tool cover -html=coverage.out             # optional: HTML report in the browser
```

**Frontend** (from `frontend/`):

```bash
npm ci
npm run typecheck        # tsc --noEmit
npm run test             # Vitest, single run; fetch is mocked, no backend needed
npm run test:coverage    # text summary + HTML report in frontend/coverage/index.html
npm run build            # type-check + production bundle in frontend/dist/
```

The latest measured results are in [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

## Design decisions and assumptions

The full rationale is in [docs/DECISIONS.md](docs/DECISIONS.md). The main points:

- **Standard library only** for the Go backend. Arithmetic (`internal/calculator`) is kept separate from HTTP concerns (`internal/httpapi`).
- **Strict request decoding.** Unknown fields, trailing JSON values and oversized bodies are rejected. Missing operands are told apart from an explicit `0` by using pointer fields.
- **An oversized body returns 400 `VALIDATION_ERROR`** rather than 413, because the brief listed no dedicated code for it.
- **No CORS.** The Vite proxy makes the API same-origin during development.
- **Text inputs with an explicit decimal grammar** are used instead of `type="number"`, so empty input and invalid input can be told apart. Exponent notation (`1e5`) is deliberately rejected.
- **Display-only formatting.** Integers are shown exactly. Other values are rounded to 12 significant digits, but never to fewer than 3 decimal places, to hide artefacts such as `0.30000000000000004` without dropping the fraction of large values (`1234567890123.5` stays `1234567890123.5`).
- **No arithmetic in the frontend.** Division by zero is checked on the client only to avoid a pointless request; the backend enforces it independently.

## Known limitations

- **Numeric precision.** Both sides use IEEE 754 binary64 (Go `float64` and JavaScript `number`):
  - Decimal fractions such as `0.1` are approximations. The API returns `0.1 + 0.2` as `0.30000000000000004`, and the UI displays it as `0.3`.
  - Integers are exact only up to 2^53 − 1 = 9007199254740991. The UI rejects larger operands so a rounded value is never sent silently. The API itself accepts any finite number.
  - Results can still go beyond 2^53, for example through multiplication. Such a result is the `float64` value the backend computed, not necessarily the exact mathematical answer. Very large and very small values are displayed in exponent notation (from `1e21` and below `1e-6`).
  - Non-integer results are rounded for display to 12 significant digits or 3 decimal places, whichever keeps more digits. Digits beyond that are hidden even when they are real: `1234567890.1234` displays as `1234567890.123`, and `999999999.9995` as `1000000000`. The value returned by the API is never changed.
- Exponent notation is not accepted as input.
- There are no browser end-to-end tests in the repository. Component tests run in jsdom. A real browser was checked manually only (see the test report).
- Production serving of `frontend/dist/` with a same-origin `/api` route is not provided. The backend port is fixed at 8080, and the server has no graceful shutdown or request logging.
- A path that needs cleaning, such as `//api/calculate`, receives a `307` redirect from Go's `ServeMux` rather than a JSON error.

## AI-assisted development

This project was built with AI assistance. Claude Code (an Anthropic coding assistant) wrote the code, tests and documentation, following written prompts. Every prompt sent to Claude Code (P-001 to P-006) is reproduced in full in [docs/ai/PROMPTS.md](docs/ai/PROMPTS.md), as Claude Code received it. P-001 to P-005 built, corrected and audited the application, and P-006 prepared this documentation for public submission without changing code or tests. ChatGPT was used for requirements analysis and architecture planning, drafting the Claude Code prompts, reviewing code, tests and design choices, identifying numeric formatting defects, and evaluating documentation and submission readiness. That use is described in a summary section of the log. The ChatGPT conversations themselves are **not** reproduced, so the log is not a verbatim or exhaustive record of every AI interaction. The phase reports in [docs/ai/reports/](docs/ai/reports/) record what was done and verified in each phase. All test and verification results come from commands that were actually run.

## Documentation

- [docs/SPECIFICATION.md](docs/SPECIFICATION.md): API contract, frontend behaviour, numeric semantics
- [docs/DECISIONS.md](docs/DECISIONS.md): design decisions D-01…D-17 (backend) and F-01…F-13 (frontend)
- [docs/TEST_REPORT.md](docs/TEST_REPORT.md): final verification results
- [docs/ai/PROMPTS.md](docs/ai/PROMPTS.md): AI prompt log
- [docs/ai/reports/](docs/ai/reports/): implementation reports for each phase
