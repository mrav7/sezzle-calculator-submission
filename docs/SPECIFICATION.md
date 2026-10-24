# Specification

Two parts: the Go backend API (P-001, below) and the React + TypeScript frontend (P-002, [Frontend](#frontend)).

## Run

Setup, run, test and coverage commands are in the root [README.md](../README.md).

## Endpoint

`POST /api/calculate`

- Request `Content-Type` must be `application/json` (parameters such as `; charset=utf-8` are allowed).
- Body must be a single JSON object of at most 8 KiB (8192 bytes).

### Request

```json
{"operation":"add","a":10,"b":5}
```

| Field       | Type   | Required | Notes                                              |
|-------------|--------|----------|----------------------------------------------------|
| `operation` | string | yes      | `add`, `subtract`, `multiply`, `divide` (case-sensitive) |
| `a`         | number | yes      | JSON number; `0` is valid                          |
| `b`         | number | yes      | JSON number; `0` is valid (but see division)       |

A field that is absent or `null` is treated as missing. An explicit `0` is a valid operand.
Unknown fields are rejected. Anything after the first JSON value (even whitespace-separated) is rejected.

### Success — `200 OK`

```json
{"result":15}
```

The result is the raw `float64` value (e.g. `0.1 + 0.2` yields `0.30000000000000004`). A result of `-0` is serialised as `0`.

### Error

```json
{"error":{"code":"ERROR_CODE","message":"Human-readable message"}}
```

`message` is for humans and may change; clients should branch on `code`. All responses, including errors, have `Content-Type: application/json`.

| HTTP | Code                     | When                                                                                     |
|------|--------------------------|------------------------------------------------------------------------------------------|
| 400  | `INVALID_JSON`           | Empty body, syntax error, truncated JSON, or more than one JSON value in the body        |
| 400  | `VALIDATION_ERROR`       | Missing/`null` field, wrong field type, operand outside float64 range (e.g. `1e999`), unknown field, top-level value not an object, body larger than 8 KiB |
| 400  | `UNKNOWN_OPERATION`      | `operation` is present but not one of the four supported values (including `""`)         |
| 400  | `DIVISION_BY_ZERO`       | `divide` with `b` equal to `0` (or `-0`)                                                 |
| 400  | `RESULT_OUT_OF_RANGE`    | Result is `±Inf` or `NaN` (e.g. overflow)                                                |
| 405  | `METHOD_NOT_ALLOWED`     | Any method other than POST on `/api/calculate`; response has `Allow: POST`               |
| 415  | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` missing or not `application/json`                                         |
| 404  | `NOT_FOUND`              | Any other path (including `/api/calculate/`)                                             |
| 500  | `INTERNAL_ERROR`         | Unexpected server failure; no internal detail is exposed                                 |

### Check order

1. Route (404) → 2. method (405) → 3. Content-Type (415) → 4. body size / JSON syntax / types / unknown fields / trailing data → 5. required fields (VALIDATION_ERROR) → 6. operation (UNKNOWN_OPERATION) → 7. arithmetic (DIVISION_BY_ZERO, RESULT_OUT_OF_RANGE).

### Examples

| Request body                                  | Response                                                                   |
|-----------------------------------------------|----------------------------------------------------------------------------|
| `{"operation":"divide","a":9,"b":3}`          | `200` `{"result":3}`                                                       |
| `{"operation":"add","a":0,"b":0}`             | `200` `{"result":0}`                                                       |
| `{"operation":"add","a":1}`                   | `400` `VALIDATION_ERROR` — `missing required field(s): b`                  |
| `{"operation":"add","a":"1","b":2}`           | `400` `VALIDATION_ERROR` — `field "a" must be a number`                    |
| `{"operation":"power","a":2,"b":3}`           | `400` `UNKNOWN_OPERATION`                                                  |
| `{"operation":"divide","a":1,"b":0}`          | `400` `DIVISION_BY_ZERO`                                                   |
| `{"operation":"multiply","a":1e308,"b":10}`   | `400` `RESULT_OUT_OF_RANGE`                                                |

## Numeric semantics

Arithmetic uses IEEE 754 `float64`. Decimal fractions such as `0.1` are not exactly representable, and integers beyond 2^53 lose precision. The backend does not round; display formatting is the client's responsibility.

The frontend uses JavaScript `number`, which is the same IEEE 754 binary64 type, so a JSON result reaches the browser with no further loss. The frontend only accepts operands in ±9007199254740991 (`Number.MAX_SAFE_INTEGER`, 2^53 − 1); results may still exceed that range (e.g. through `multiply`), and such results are whatever `float64` produced, which is not necessarily the exact mathematical answer.

## Out of scope (backend)

CORS, authentication, persistence, logging/metrics, graceful shutdown, configurable port, and any operations beyond the four listed.

---

# Frontend

A single-page calculator in `frontend/`: React 19, TypeScript, Vite, plain CSS, Fetch API. Tests use Vitest, React Testing Library and jsdom. The backend performs every calculation; the frontend only validates input, calls the API and formats the result for display.

## Layout

```
frontend/src/
├── api/calculator.ts        typed client: calculate(), ApiError, NetworkError
├── calculation.ts           parseOperand() and formatResult() — no arithmetic
├── components/Calculator.tsx  the whole UI (form, result area)
├── App.tsx, main.tsx, styles.css
└── *.test.ts(x)             next to the code they test; test/setup.ts configures jest-dom
```

## Integration

- The browser only ever requests the relative URL `/api/calculate`. No absolute backend URL appears in the source.
- `vite.config.ts` proxies `/api` to `http://localhost:8080` for both `vite` (dev) and `vite preview`. The backend has no CORS support and none was added; the proxy makes requests same-origin.
- A production deployment must serve the built `dist/` and route `/api` to the backend from the same origin (reverse proxy). That is not provided here.

## UI

| Element | Label | Notes |
|---------|-------|-------|
| Operand 1 | `First number` | text input |
| Operand 2 | `Second number` | text input |
| Operation | `Operation` | `Addition (+)`, `Subtraction (−)`, `Multiplication (×)`, `Division (÷)`; default Addition |
| Submit | `Calculate` | `Calculating…` and disabled while a request is pending; Enter in a field also submits |
| Result area | `Result` | placeholder, result, or error |

Operands are text inputs (not `type="number"`) so that non-numeric input is distinguishable from empty input and negative numbers can be typed on every mobile keyboard.

## Client-side validation (on submit)

Runs before any request; if anything fails, no request is sent and the previous result is cleared. Errors appear under the offending field (`aria-invalid`, linked with `aria-describedby`).

| Input | Outcome |
|-------|---------|
| Empty or whitespace-only | `Enter a number.` Never treated as `0` |
| Not plain decimal notation (`abc`, `1,5`, `1e5`, `0x10`, `Infinity`, `.`, `--1`) | `Enter a valid number, such as 12, -3.5 or 0.25.` |
| Magnitude above `9007199254740991` (`Number.MAX_SAFE_INTEGER`), including input so long it overflows to `Infinity` | `Enter a number between -9007199254740991 and 9007199254740991.` |
| `divide` and second operand equals zero (`0`, `0.0`, `-0`) | `Cannot divide by zero.` on the second field |
| Zero as dividend or as an operand of add/subtract/multiply; `-3.5`, `.5`, `5.`, `+2`; surrounding whitespace | valid |

Accepted syntax is `[+-]?(digits[.digits?] | .digits)`. Exponent notation is deliberately not accepted. The range check exists because `Number("9007199254740993")` silently becomes `9007199254740992`; rejecting it prevents a rounded operand from being sent. Decimal fractions are not range-checked beyond this: like any `float64`, `0.1` is sent as its nearest binary value. A field's error clears when that field is edited; the division error also clears when the operation changes.

## API client

`calculate({operation, a, b}, signal?)` sends `POST /api/calculate` with `Content-Type: application/json` and resolves with the numeric `result`.

| Situation | Rejects with | Message shown to the user |
|-----------|--------------|---------------------------|
| `fetch` rejects (offline, server down, proxy error without response) | `NetworkError` | `Could not reach the calculator service. Check your connection and try again.` |
| Error body with code `VALIDATION_ERROR`, `UNKNOWN_OPERATION`, `DIVISION_BY_ZERO` or `RESULT_OUT_OF_RANGE` | `ApiError` (code, status) | the backend's own `message` |
| Error body with any other code (`INTERNAL_ERROR`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `UNSUPPORTED_MEDIA_TYPE`, `INVALID_JSON`) | `ApiError` | `The calculator service returned an unexpected response. Please try again later.` |
| Non-JSON or unrecognised body, or a 200 without a finite numeric `result` | `ApiError` with code `UNEXPECTED_RESPONSE` | same generic message |
| Request aborted through the signal | the original abort error | nothing (ignored) |

Raw error text from `fetch`, JSON parsing or the server is never shown. Error handling branches on `code`, not on message text.

## Result display

- The result is shown as `<a> <symbol> <b> =` followed by the value, using the operands as typed (trimmed), so it is always identifiable as the answer to those inputs.
- Display formatting (`formatResult`), applied to the received number only; the backend response is not modified:
  - **Integers** are shown exactly as received, with no significant-digit rounding: `123456789012345` → `123456789012345`, `-9007199254740991` → `-9007199254740991`, `-0` → `0`.
  - **Non-integers** are rounded to 12 significant digits, but never to fewer than 3 decimal places (`toPrecision(max(12, integerDigits + 3))`): `0.30000000000000004` → `0.3`; `100.1 − 100` (`0.09999999999999432`) → `0.1`; `1/3` → `0.333333333333`; `1000000000.1 + 0.2` (`1000000000.3000001`) → `1000000000.3`; `1234567890123.5` → `1234567890123.5`; `1234567890123.25` → `1234567890123.25`. So below `1e9` a value keeps 12 significant digits, and from `1e9` it keeps 3 decimal places. From about `1e13` that is at least as fine as `float64` resolution, and the output is JavaScript's shortest round-trip form (`123456789012345.1` → `123456789012345.1`). The rounded text can drop real digits beyond the kept precision, for example `999999999.9995` → `1000000000`.
  - JavaScript's `String()` produces the final text, so values below `1e-6` and from `1e21` appear in exponent notation (`1e-7`, `1e+21`). Integers above 2^53 are printed as the shortest decimal that identifies the `float64` value, so trailing digits may be zeros (`2^60` → `1152921504606847000`).
- Result is announced through `role="status"`; errors through `role="alert"`.

## Stale results and concurrency

- Editing either operand or the operation immediately removes the shown result or error and aborts any in-flight request (`AbortController`). A response to an abandoned request is ignored.
- A new submission while one is pending is ignored (guarded by a ref, so repeated Enter presses are covered, as well as the disabled button).
- The pending request is aborted when the component unmounts.

## Accessibility and layout

Every control has a visible `<label>`; all controls are reachable and operable by keyboard; `:focus-visible` shows a 3px outline; errors use text plus a border/colour, not colour alone. One column below 30em (≈480px), two operand columns above. Checked in headless Chrome at 320px width: no horizontal scroll.

## Frontend tests

117 tests in 4 files (`calculation.test.ts`, `api/calculator.test.ts`, `components/Calculator.test.tsx`, `App.test.tsx`). `fetch` is stubbed; no backend is needed. Coverage (v8) is configured in `vitest.config.ts`; reports go to `frontend/coverage/` (git-ignored). Measured results: [TEST_REPORT.md](TEST_REPORT.md).

## Out of scope (frontend)

History, themes, animations, authentication, extra operations, i18n, Docker, production serving of `dist/`, browser-based end-to-end tests.
