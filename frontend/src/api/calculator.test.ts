import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, calculate } from './calculator';

const request = { operation: 'add', a: 10, b: 5 } as const;

function mockFetch(impl: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('calculate', () => {
  it('POSTs the request as JSON to /api/calculate and returns the result', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ result: 15 }));

    await expect(calculate(request)).resolves.toBe(15);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/calculate');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({ operation: 'add', a: 10, b: 5 });
  });

  it('returns an explicit zero result', async () => {
    mockFetch(async () => jsonResponse({ result: 0 }));
    await expect(calculate(request)).resolves.toBe(0);
  });

  it('passes the abort signal to fetch', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ result: 1 }));
    const controller = new AbortController();
    await calculate(request, controller.signal);
    const init = fetchMock.mock.calls[0]![1];
    expect(init?.signal).toBe(controller.signal);
  });

  it('throws an ApiError carrying the code and message of a user-facing backend error', async () => {
    mockFetch(async () =>
      jsonResponse(
        { error: { code: 'DIVISION_BY_ZERO', message: 'Cannot divide by zero.' } },
        400,
      ),
    );

    const err = await calculate(request).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      code: 'DIVISION_BY_ZERO',
      message: 'Cannot divide by zero.',
      status: 400,
    });
  });

  it.each([
    ['INTERNAL_ERROR', 500],
    ['UNSUPPORTED_MEDIA_TYPE', 415],
    ['NOT_FOUND', 404],
    ['INVALID_JSON', 400],
  ])('hides the backend message for %s', async (code, status) => {
    mockFetch(async () =>
      jsonResponse({ error: { code, message: 'internal detail: goroutine 1 panic' } }, status),
    );

    const err = (await calculate(request).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe(code);
    expect(err.message).not.toContain('internal detail');
  });

  it('throws a generic ApiError when the error body is not the expected shape', async () => {
    mockFetch(async () => new Response('<html>Bad Gateway</html>', { status: 502 }));

    const err = (await calculate(request).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('UNEXPECTED_RESPONSE');
    expect(err.status).toBe(502);
    expect(err.message).not.toContain('Bad Gateway');
  });

  it.each([
    ['a missing result', {}],
    ['a non-numeric result', { result: '15' }],
    ['a null body', null],
  ])('rejects a 200 response with %s', async (_name, body) => {
    mockFetch(async () => jsonResponse(body));
    await expect(calculate(request)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });

  it('rejects a 200 response that is not JSON', async () => {
    mockFetch(async () => new Response('ok', { status: 200 }));
    await expect(calculate(request)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });

  it('throws a NetworkError when fetch itself fails', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    const err = (await calculate(request).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(NetworkError);
    expect(err).not.toBeInstanceOf(ApiError);
    expect(err.message).not.toContain('Failed to fetch');
  });

  it('rethrows the abort error instead of reporting a network failure', async () => {
    const controller = new AbortController();
    mockFetch(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });

    const err = await calculate(request, controller.signal).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(NetworkError);
    expect((err as DOMException).name).toBe('AbortError');
  });
});
