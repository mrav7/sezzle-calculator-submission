# Report 02 — React frontend (P-002)

> Historical record of P-002. The display-formatting defect described under *Known limitations* (large integers losing digits) and the overflow message were corrected in P-003. See [03-corrective-review.md](03-corrective-review.md) and [TEST_REPORT.md](../../TEST_REPORT.md) for current behaviour and results.

## Files created or modified

Created under `frontend/`:

| File | Purpose |
|------|---------|
| `package.json`, `package-lock.json` | Scripts (`dev`, `build`, `typecheck`, `test`, `test:watch`, `test:coverage`, `preview`); exact-pinned dependencies |
| `tsconfig.json` | Strict TypeScript, `noEmit`, `noUnused*`, `verbatimModuleSyntax` |
| `vite.config.ts` | React plugin; `/api` → `http://localhost:8080` proxy for `dev` and `preview` |
| `vitest.config.ts` | Merges `vite.config.ts`; jsdom; v8 coverage (text, html, json-summary → `coverage/`) |
| `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css` | Entry, shell, plain CSS |
| `src/api/calculator.ts` | Typed client: `calculate()`, `ApiError`, `NetworkError` |
| `src/calculation.ts` | `parseOperand()`, `formatResult()` (no arithmetic) |
| `src/components/Calculator.tsx` | The calculator UI |
| `src/test/setup.ts` | jest-dom matchers, cleanup, unstub globals |
| `src/calculation.test.ts`, `src/api/calculator.test.ts`, `src/components/Calculator.test.tsx`, `src/App.test.tsx` | Tests |

Modified: `.gitignore` (adds `frontend/node_modules/`, `frontend/dist/`, `frontend/coverage/`, `*.tsbuildinfo`), `docs/SPECIFICATION.md` (frontend + integration section, run instructions), `docs/DECISIONS.md` (F-01…F-12), `docs/ai/PROMPTS.md` (P-002 appended).

Not touched: everything under `backend/`; the P-001 entry in `PROMPTS.md`; `docs/ai/reports/01-backend.md`. Nothing committed or pushed.

## Design

- **Component structure:** `App` → `Calculator` (state: two operand strings, operation, field errors, outcome, loading) → private `Field` (label + input + error). Validation/formatting helpers are pure functions in `calculation.ts`.
- **API client:** `calculate(request, signal)` POSTs JSON to the relative URL `/api/calculate`. `fetch` rejection → `NetworkError`; structured or unusable error response → `ApiError` whose `message` is always safe to display (backend text only for `VALIDATION_ERROR`, `UNKNOWN_OPERATION`, `DIVISION_BY_ZERO`, `RESULT_OUT_OF_RANGE`; generic text otherwise); an abort is rethrown untouched.
- **Validation (on submit, before any request):** empty/whitespace → `Enter a number.`; non-plain-decimal → `Enter a valid number…`; overflow → `This number is too large.`; divide by `0`/`0.0`/`-0` → `Cannot divide by zero.`. Explicit zero is accepted everywhere else. Empty input is never coerced to 0.
- **Stale/duplicate handling:** an `AbortController` ref is both the in-flight flag and the stale guard. Editing an input or the operation clears the result and aborts the pending request; a new submit while pending is ignored; unmount aborts.
- **Display:** `Number(x.toPrecision(12))`, shown as `a ⊕ b = value` using the operands as typed.

Rationale for each choice is in `docs/DECISIONS.md` (F-01…F-12).

## Environment

Node v24 / npm 11 were already present. Go was **not** installed; as in P-001 I downloaded the official `go1.27.3.linux-amd64` tarball into the session scratchpad, verified its SHA-256 (`65efbc80…9b40`, matches the value published on go.dev), and used it only to run the backend tests and server for the smoke test. Nothing was installed system-wide.

## Commands executed and actual results

From `frontend/` unless stated.

| Command | Result |
|---------|--------|
| `npm ci` (from a clean `node_modules`, run twice) | 113 packages, 0 vulnerabilities reported |
| `npm run typecheck` (`tsc --noEmit`) | No diagnostics |
| `npm run test` | 4 files, **81 tests passed**, 0 failed |
| `npm run test:coverage` | 81 passed; coverage below |
| `npm run build` (`tsc --noEmit && vite build`) | Succeeded: `index.html` 0.39 kB, CSS 2.18 kB, JS 224.00 kB (70.41 kB gzip) |
| `go test ./...` in `backend/` | `calculator` ok, `httpapi` ok (re-run only as a precondition; backend unchanged) |
| Mutation check: temporarily removed the abort-on-edit logic | the stale-response test failed (1 failed, 80 passed); logic restored, 81 pass |

Test breakdown: `calculation.test.ts` (parsing and formatting, table-driven), `api/calculator.test.ts` (request shape, success, each error class, unexpected bodies, network failure, abort), `Calculator.test.tsx` (rendering, payload, all four operations, Enter key, validation, error display, loading/duplicates, stale results, unmount), `App.test.tsx` (smoke).

## Coverage (v8, `npm run test:coverage`)

| Metric | Value |
|--------|-------|
| Statements | 98.18% (108/110) |
| Branches | 94.02% (63/67) |
| Functions | 100% (21/21) |
| Lines | 100% (95/95) |

Per file: `api/calculator.ts` 100% statements / 95.45% branches; `components/Calculator.tsx` 97.05% / 91.89%. `calculation.ts` and `App.tsx` are fully covered; `main.tsx` and test files are excluded. The uncovered statements/branches are defensive fallbacks (e.g. `errorMessage` returning the generic text for an error that is neither `ApiError` nor `NetworkError`, which `calculate()` cannot currently throw) that I could not reach without a contrived test. No coverage thresholds are enforced.

## Manual integration

The built backend was started on `:8080` and `vite preview` on `:4173` (which uses the same proxy as `vite dev`).

1. **HTTP contract through the proxy** (`curl` to `localhost:4173/api/calculate`): `add 10+5` → `200 {"result":15}`; `0.1+0.2` → `200 {"result":0.30000000000000004}`; `divide 1/0` → `400 DIVISION_BY_ZERO`; `multiply 1e308×10` → `400 RESULT_OUT_OF_RANGE`; `subtract -3.5-0` → `200 {"result":-3.5}`. The proxy forwarded all of these correctly with no CORS involvement.
2. **Browser-level check** in headless Google Chrome (driven with a throwaway DevTools-protocol script kept outside the repo), viewport 320×640, real page against the real backend: entered `0.1` + `0.2` → displayed `0.1 + 0.2 = 0.3`; changing the operation cleared the result; divide by `0` showed `Cannot divide by zero.` with no request; `1 ÷ 3` displayed `0.333333333333`; no horizontal overflow. A screenshot revealed the result number wrapping onto two lines at 320px; I reduced its font size (1.75rem → 1.5rem) and confirmed it then fits on one line.

So both the HTTP contract and a real browser were exercised, but only a small happy-path/validation scenario in one browser at one width. The browser check is not part of the repository's automated tests.

## Known limitations and remaining risks

- **No automated browser/E2E tests.** Component tests run in jsdom; layout, focus rings and the real proxy are only covered by the brief manual check above. Only Chrome was used, and only at 320px.
- **Production serving is not provided.** The built `dist/` needs a same-origin reverse proxy for `/api`; no CORS exists and none was added.
- **Exponent input (`1e5`) is rejected** by design (F-04). A reviewer expecting scientific notation to work would see this as a limitation.
- **Display rounding hides digits beyond the 12th** and JS switches to exponent notation below `1e-6` / from `1e21`. Large integers such as `123456789012345` display as `123456789012000`.
- **Result expression echoes the input text**, so `+2` appears as `+2`, not `2`.
- **Text of backend messages is shown for four codes.** If the backend changes those messages they change in the UI; the codes, not the text, are what the client relies on.
- **Accessibility** was designed to (labels, `aria-invalid`/`describedby`, `role=status`/`alert`, focus outlines, keyboard operation) but not audited with a screen reader or an automated tool such as axe.
- Package versions are the latest available at the time of writing (React 19.3.1, Vite 8.3.5, Vitest 5.0.5, TypeScript 5.9.3 — kept on 5.x although 7.x exists, to avoid toolchain risk). `npm audit` was not run separately beyond the install summary.
- Coverage is not enforced by thresholds, so a future regression would not fail the build.

## Review before final delivery

1. Confirm the choice to **reject exponent notation** and to **show 12 significant digits** only.
2. Decide whether a **production serving story** (reverse proxy / static hosting) should be documented or built before submission.
3. Decide whether to add a **top-level README** (none exists; `docs/SPECIFICATION.md` has the run commands).
4. `backend/coverage.out` still exists on disk (git-ignored) from P-001; delete if you do not want it in the folder you submit.
5. Verify the **prompt record** — see below.

## Prompt-preservation note

P-002 was copied into `docs/ai/PROMPTS.md` from the message as delivered to me, between the paste markers (the markers are not part of the prompt). The five-backtick fence is used because the prompt itself contains triple-backtick blocks. I cannot byte-diff it against your original, so please compare it against your source; the characters most at risk are the en dashes (`2–4 hours`, `P-002 —`), the tree-drawing characters in the suggested structure, and trailing whitespace. The P-001 entry was left untouched. Any prompts after P-002 are not yet recorded.
