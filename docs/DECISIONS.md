# Technical Decisions

Backend decisions (P-001) are D-01…D-17; frontend decisions (P-002) are F-01…F-12 at the end, with F-07 revised and F-13 added in the corrective phase (P-003), and F-07 revised again in P-004.

## D-01 Standard library only
`net/http`, `encoding/json`, `mime`, `math`. The API has one endpoint; a router or framework would add a dependency without removing any code. `go.mod` has no `require` lines.

## D-02 Two packages: `calculator` and `httpapi`
`calculator` knows nothing about HTTP or JSON: `Calculate(op, a, b) (float64, error)` plus sentinel errors. `httpapi` owns decoding, validation, status codes and response shape. Each can be tested on its own, and the arithmetic stays reusable. No interfaces: there is a single implementation and nothing to substitute.

## D-03 `float64`, no rounding
Matches JSON's number model and the brief. Business logic returns the raw value; `0.1 + 0.2` is `0.30000000000000004`. Rounding/formatting is a presentation concern for the frontend, where the display precision can be chosen deliberately. The limitation is documented in the package comment and the specification.

## D-04 Pointer fields to detect missing operands
`calculateRequest` uses `*float64` / `*string`. A nil pointer means absent (or `null`); a pointer to `0` is an explicit zero. This is the idiomatic way to distinguish the two with `encoding/json` without a custom unmarshaller. `null` is treated the same as absent.

## D-05 Non-finite results checked after the operation
Overflow (`MaxFloat64 * 2`) and `Inf - Inf` are detected via `math.IsInf` / `math.IsNaN` on the result, so one check covers all operations. Division by zero is checked first because it would otherwise surface as `Inf`/`NaN` and be misreported as out-of-range. JSON cannot encode `NaN`/`Inf` operands, and a literal like `1e999` is rejected at decode time (`VALIDATION_ERROR`), but `Calculate` still guards against non-finite inputs so it is safe to call from anywhere.

## D-06 Strict request decoding
- `Decoder.DisallowUnknownFields()` rejects unknown fields.
- After the first value, a second `Decode` into `json.RawMessage` must return `io.EOF`. `RawMessage` is used (not a struct) so that a trailing object is reported as a multiple-values error rather than being swallowed by unknown-field handling. Trailing whitespace is permitted.
- `http.MaxBytesReader` caps the body at 8 KiB (8192 bytes); exactly 8192 bytes is accepted, 8193 is rejected.

## D-07 Oversized body → 400 `VALIDATION_ERROR`
The brief lists only 400/404/405/415 and no "payload too large" code. Rather than inventing `413`/`PAYLOAD_TOO_LARGE`, an oversized body is a 400 with `VALIDATION_ERROR` and an explicit message. Easy to change if a 413 is preferred.

## D-08 Unknown field and wrong type → `VALIDATION_ERROR`; syntax problems → `INVALID_JSON`
`INVALID_JSON` means "this is not parseable as one JSON document" (syntax errors, truncation, empty body, multiple values). Well-formed JSON with the wrong shape (missing field, wrong type, unknown field, non-object, out-of-range number) is `VALIDATION_ERROR`.

## D-09 Missing fields are reported before the operation is checked
`{"operation":"power","a":1}` returns `VALIDATION_ERROR` (missing `b`), not `UNKNOWN_OPERATION`. All missing fields are listed in one message so a client can fix them in one round-trip. An empty or wrongly cased operation (`""`, `"ADD"`) is present-but-unsupported, hence `UNKNOWN_OPERATION`.

## D-10 Method and Content-Type are checked manually, in a fixed order
Go 1.22 method patterns (`"POST /api/calculate"`) produce a plain-text 405 from `ServeMux`; the brief requires a JSON error body, so the handler checks the method itself. Order is 404 → 405 → 415 → body, so e.g. `GET` with no Content-Type is 405, not 415. `mux.HandleFunc("/")` is the JSON 404 catch-all; `/api/calculate/` is intentionally not an alias.

## D-11 Content-Type matching
`mime.ParseMediaType` must succeed and yield exactly `application/json` (case-insensitive; `charset` and other parameters allowed). `application/problem+json` and other `+json` types are rejected, as the brief asks for a single supported type.

## D-12 `-0` is normalised to `0` in the HTTP layer
`0 * -5` is `-0` in IEEE 754, which `encoding/json` writes as `-0`. That is valid JSON but surprising to display. The normalisation (`if result == 0 { result = 0 }`) is in `writeResult`, a formatting concern, so `calculator` still returns exactly what float64 arithmetic produced.

## D-13 Error messages are fixed strings; internals are never leaked
Unexpected errors map to `INTERNAL_ERROR` with a generic message. Decode-error messages are built from known fields rather than echoing `encoding/json` text (except the unknown-field message, which only contains the field name). If a response cannot be marshalled, a constant `INTERNAL_ERROR` body is written.

## D-14 Server configuration
`main.go` hard-codes `:8080` as the brief says, and sets read/write/idle timeouts so a slow client cannot hold connections open. No graceful shutdown, config, or logging middleware — not required at this stage.

## D-15 `encoding/json` behaviours accepted as-is
Key matching is case-insensitive (`"A"` populates `a`), and a duplicate key keeps the last value. Both are standard-library behaviour; making them strict would need a custom parser, which is out of proportion for this API.

## D-16 Module path and Go version
Module `sezzle-calculator/backend` (no remote assumed, so no hosting-based path); `go 1.22` directive for broad compatibility. Development was done with Go 1.27.3.

## D-17 `coverage.out` is not committed
It is a generated artefact and is listed in `.gitignore`. Coverage reports for submission can be regenerated with the documented commands.

---

# Frontend decisions (P-002)

## F-01 Vite dev/preview proxy instead of CORS
The backend has no CORS and the brief says not to add it. `server.proxy` and `preview.proxy` forward `/api` to `http://localhost:8080`, so the browser sees one origin and the code uses a relative URL. Production would need an equivalent reverse proxy; this is documented, not built.

## F-02 Minimal dependencies
Runtime: `react`, `react-dom`. Dev: Vite + `@vitejs/plugin-react`, TypeScript, Vitest + `@vitest/coverage-v8` + jsdom, React Testing Library (`react`, `dom`, `user-event`, `jest-dom`), React type packages. All versions are pinned exactly in `package.json` and locked in `package-lock.json`. No router, state library, form library, CSS framework or HTTP library.

## F-03 Text inputs, own parsing
`type="number"` reports an invalid entry such as `abc` or `1e` as an empty string, which would be indistinguishable from "nothing typed" and cannot produce a precise message; it also exposes spinner and wheel-scroll behaviour. `type="text"` plus one regex (`[+-]?(\d+\.?\d*|\.\d+)`) and `Number()` gives explicit control. `inputMode="decimal"` was left off because several mobile decimal keypads have no minus sign.

## F-04 No exponent notation in input
`1e5` is rejected. "Valid decimal numbers" was read literally, and it avoids having to decide how to treat `1e999`, `0x10` or `Infinity` (all of which `Number()` would otherwise accept in some form). The regex rules out everything except plain decimals; the only remaining non-finite case (hundreds of digits) is rejected by the magnitude check in F-13.

## F-05 Validation lives in `calculation.ts`, not in the component
`parseOperand` and `formatResult` are pure and unit-tested on their own. They contain no arithmetic (backend remains the source of truth). The division-by-zero rule stays in the component because it depends on the selected operation and is a single comparison.

## F-06 Division by zero compared after parsing
`0`, `0.0`, `-0` and `0.` all parse to zero, so the check is `parsed.value === 0` (true for `-0`). The backend still enforces the rule independently; the client check only avoids a pointless round trip and gives a field-level message.

## F-07 Display formatting: integers exact, other values to 12 significant digits or 3 decimal places
*Revised in P-003.* The original rule, `Number(x.toPrecision(12))` for every value, was a defect: it replaced the digits of large integers with zeros (`123456789012345` → `123456789012000`, `9007199254740991` → `9007199254740000`). Float artefacts only appear in values with a fractional part, so integers are now printed with `String(x)` and no rounding. Non-integers keep `toPrecision(12)`, which hides artefacts in the 16th–17th digit including those left by cancellation (`100.1 − 100` → `0.1`, where 15 digits would still show `0.0999999999999943`), but the precision is raised to the number of integer digits when that is larger, so a value such as `1234567890123.5` is rounded to `1234567890124` rather than shown as `1234567890120`. `toFixed` (fixed decimal places, wrong for very large/small values) and `Intl.NumberFormat` (locale-dependent separators that users could not type back in) were rejected for the reasons given originally. Accepted trade-offs: non-integers show at most 12 significant digits (more only for the integer part), and JavaScript switches to exponent notation below `1e-6` / from `1e21`.

*Revised in P-004.* Raising the precision only to the number of integer digits still left no room for the fraction: `1234567890123.5` was shown as `1234567890124`, although `.5` is exact in `float64`. Non-integers are now rounded with `toPrecision(max(12, integerDigits + 3))`, which means 12 significant digits, but never fewer than 3 decimal places. Below `1e9` nothing changes. From `1e9` the value keeps 3 decimal places, so `1234567890123.5` and `1234567890123.25` are shown in full. Artefacts are still hidden at these magnitudes (`1000000000.1 + 0.2` = `1000000000.3000001` → `1000000000.3`). Near `float64`'s ~16-digit limit the requested precision exceeds what the value holds. The `Number(...)` round trip then returns the same double and `String()` prints its shortest form (`123456789012345.1`, not `…345.094`). Showing `String(x)` unrounded for every large value was rejected because it exposes artefacts such as `10000000000.300001`. A threshold switching between the two rules was rejected because it adds a discontinuity without a clear benefit.

Trade-off between faithful and cosmetic display: a `float64` cannot reveal whether `0.30000000000000004` came from `0.1 + 0.2` or was meant exactly, so any rounding rule is a guess about intent. The rule favours readable output for ordinary decimal input. The cost is that real digits beyond the kept precision are hidden (`1234567890.1234` → `1234567890.123`; `999999999.9995` → `1000000000`). The exact value is always the one in the API response, and no arithmetic is done on the client.

## F-08 Stale-response handling with `AbortController` + ref
Editing any input aborts the pending request and clears the outcome; a ref to the current controller doubles as the synchronous "already submitting" flag (state is stale between two quick events, so state alone cannot reliably block double submission). A response is applied only if its own controller was not aborted. This is shorter and more robust than request-id counters, and also cancels the network request. Inputs stay editable during loading so focus is not lost.

## F-09 The result echoes the submitted expression
`10 + 5 = 15` instead of a bare `15`. Together with clearing on edit, a displayed result cannot be confused with the current inputs. The echo uses the operands as typed, not re-formatted, so the user sees what they entered.

## F-10 Error messages: user-facing allow-list
The backend says clients should branch on `code` and messages may change. The client shows the backend message only for four codes whose messages are written for end users (`VALIDATION_ERROR`, `UNKNOWN_OPERATION`, `DIVISION_BY_ZERO`, `RESULT_OUT_OF_RANGE`); everything else gets one generic message. `ApiError.message` is therefore always safe to display, and the component does not need to inspect codes. Network failures are a separate class (`NetworkError`) with their own message, matching the requirement to distinguish them.

## F-11 One component, no sub-component library
`Calculator.tsx` holds the form and result area; a small private `Field` component removes the duplicated label/input/error markup. Splitting further (result view, operation select) would add files without reducing complexity at this size.

## F-12 Test strategy
`fetch` is stubbed per test; component tests go through the real API client, so the payload, error mapping and UI are verified together. `user-event` simulates typing, clicking and Enter. Deferred promises create pending requests for the loading, duplicate-submission and stale-response tests. A mutation check (removing the abort-on-edit logic) was confirmed to fail the stale-response test. `vitest.config.ts` merges `vite.config.ts` so the plugin setup is defined once.

## F-13 Operands limited to ±`Number.MAX_SAFE_INTEGER`
*Added in P-003.* Above 2^53 − 1 not every integer is a JavaScript number, so `9007199254740993` would be sent as `9007199254740992` without any warning. `parseOperand` rejects any value whose magnitude exceeds `Number.MAX_SAFE_INTEGER` with a message stating the range. Because every `float64` above 2^53 is an integer, one magnitude check covers large integers, long decimals that lose their fraction (`12345678901234567890.5`) and the earlier overflow-to-`Infinity` case, which therefore no longer needs its own message. Precision limits of decimal fractions (`0.1`) are inherent to `float64` on both sides and are documented, not validated. The backend contract is unchanged and still accepts any finite JSON number.
