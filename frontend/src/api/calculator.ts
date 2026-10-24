export type Operation = 'add' | 'subtract' | 'multiply' | 'divide';

export interface CalculateRequest {
  operation: Operation;
  a: number;
  b: number;
}

const CALCULATE_URL = '/api/calculate';

const NETWORK_MESSAGE =
  'Could not reach the calculator service. Check your connection and try again.';
const GENERIC_MESSAGE =
  'The calculator service returned an unexpected response. Please try again later.';

// Backend codes whose messages are written for end users. Every other code
// (routing, method, content type, internal errors, ...) is shown generically.
const USER_FACING_CODES = new Set([
  'VALIDATION_ERROR',
  'UNKNOWN_OPERATION',
  'DIVISION_BY_ZERO',
  'RESULT_OUT_OF_RANGE',
]);

/** The backend answered with an error (or an unusable response). */
export class ApiError extends Error {
  /** `message` is always safe to show to a user. */
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never produced an HTTP response (offline, server down, ...). */
export class NetworkError extends Error {
  constructor() {
    super(NETWORK_MESSAGE);
    this.name = 'NetworkError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Asks the backend to compute `a <operation> b`. Rejects with `ApiError` or
 * `NetworkError`; if `signal` aborts, the original abort error is rethrown.
 */
export async function calculate(
  request: CalculateRequest,
  signal?: AbortSignal,
): Promise<number> {
  let response: Response;
  try {
    response = await fetch(CALCULATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new NetworkError();
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (response.ok) {
    if (isRecord(body) && typeof body.result === 'number' && Number.isFinite(body.result)) {
      return body.result;
    }
    throw new ApiError('UNEXPECTED_RESPONSE', GENERIC_MESSAGE, response.status);
  }

  if (isRecord(body) && isRecord(body.error)) {
    const { code, message } = body.error;
    if (typeof code === 'string') {
      const text =
        USER_FACING_CODES.has(code) && typeof message === 'string' && message !== ''
          ? message
          : GENERIC_MESSAGE;
      throw new ApiError(code, text, response.status);
    }
  }
  throw new ApiError('UNEXPECTED_RESPONSE', GENERIC_MESSAGE, response.status);
}
