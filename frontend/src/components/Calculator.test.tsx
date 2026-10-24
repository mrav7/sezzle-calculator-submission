import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Calculator from './Calculator';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => jsonResponse({ result: 15 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const firstInput = () => screen.getByLabelText('First number');
const secondInput = () => screen.getByLabelText('Second number');
const operationSelect = () => screen.getByLabelText('Operation');
const calculateButton = () => screen.getByRole('button', { name: /calculate|calculating/i });

async function fill(user: ReturnType<typeof userEvent.setup>, a: string, b: string) {
  if (a) await user.type(firstInput(), a);
  if (b) await user.type(secondInput(), b);
}

function sentBody(call = 0) {
  const init = fetchMock.mock.calls[call]![1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe('Calculator', () => {
  it('renders empty inputs, a default operation, the button and a result placeholder', () => {
    render(<Calculator />);

    expect(screen.getByRole('heading', { name: 'Calculator' })).toBeInTheDocument();
    expect(firstInput()).toHaveValue('');
    expect(secondInput()).toHaveValue('');
    expect(operationSelect()).toHaveValue('add');
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Addition (+)', 'Subtraction (−)', 'Multiplication (×)', 'Division (÷)']);
    expect(calculateButton()).toBeEnabled();
    expect(screen.getByText('Enter two numbers and choose an operation.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sends the entered values and shows the result with its expression', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await fill(user, '10', '5');
    await user.click(calculateButton());

    expect(await screen.findByRole('status')).toHaveTextContent('10 + 5 = 15');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/calculate');
    expect(sentBody()).toEqual({ operation: 'add', a: 10, b: 5 });
  });

  it('submits with the Enter key', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await fill(user, '10', '5');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('15');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ['add', 'Addition (+)', '+'],
    ['subtract', 'Subtraction (−)', '−'],
    ['multiply', 'Multiplication (×)', '×'],
    ['divide', 'Division (÷)', '÷'],
  ])('selects and submits the %s operation', async (operation, label, symbol) => {
    const user = userEvent.setup();
    render(<Calculator />);

    await fill(user, '8', '2');
    await user.selectOptions(operationSelect(), label);
    await user.click(calculateButton());

    expect(await screen.findByRole('status')).toHaveTextContent(`8 ${symbol} 2 = 15`);
    expect(sentBody()).toEqual({ operation, a: 8, b: 2 });
  });

  it('sends decimals and negatives as numbers', async () => {
    const user = userEvent.setup();
    render(<Calculator />);

    await fill(user, '-1.5', ' 2.25 ');
    await user.click(calculateButton());

    await screen.findByRole('status');
    expect(sentBody()).toEqual({ operation: 'add', a: -1.5, b: 2.25 });
  });

  it('formats floating point artefacts in the displayed result only', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: 0.30000000000000004 }));
    const user = userEvent.setup();
    render(<Calculator />);

    await fill(user, '0.1', '0.2');
    await user.click(calculateButton());

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('0.1 + 0.2 = 0.3');
    expect(status).not.toHaveTextContent('0.30000000000000004');
  });

  it('shows large integer results with every digit', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: 123456789012345 }));
    const user = userEvent.setup();
    render(<Calculator />);

    await fill(user, '123456789012340', '5');
    await user.click(calculateButton());

    expect(await screen.findByRole('status')).toHaveTextContent(
      '123456789012340 + 5 = 123456789012345',
    );
  });

  it('keeps the fraction of a large non-integer result', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: 1234567890123.5 }));
    const user = userEvent.setup();
    render(<Calculator />);

    await fill(user, '1234567890123', '0.5');
    await user.click(calculateButton());

    expect(await screen.findByRole('status')).toHaveTextContent(
      '1234567890123 + 0.5 = 1234567890123.5',
    );
  });

  describe('validation', () => {
    it('rejects both operands when empty, without calling the API', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await user.click(calculateButton());

      expect(screen.getAllByText('Enter a number.')).toHaveLength(2);
      expect(firstInput()).toHaveAttribute('aria-invalid', 'true');
      expect(firstInput()).toHaveAccessibleDescription('Enter a number.');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects whitespace-only input instead of treating it as zero', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '   ', '5');
      await user.click(calculateButton());

      expect(screen.getByText('Enter a number.')).toBeInTheDocument();
      expect(secondInput()).not.toHaveAttribute('aria-invalid');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects non-numeric input', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, 'abc', '1e5');
      await user.click(calculateButton());

      expect(screen.getAllByText(/Enter a valid number/)).toHaveLength(2);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects numbers too large to be represented exactly', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await user.click(firstInput());
      await user.paste('9'.repeat(400));
      await fill(user, '', '1');
      await user.click(calculateButton());

      expect(
        screen.getByText('Enter a number between -9007199254740991 and 9007199254740991.'),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an integer beyond the safe range instead of sending a rounded value', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '9007199254740993', '1');
      await user.click(calculateButton());

      expect(firstInput()).toHaveAttribute('aria-invalid', 'true');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts an explicit zero as either operand', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '0', '0');
      await user.click(calculateButton());

      expect(await screen.findByRole('status')).toHaveTextContent('0 + 0 = 15');
      expect(sentBody()).toEqual({ operation: 'add', a: 0, b: 0 });
    });

    it('accepts zero as the dividend', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '0', '4');
      await user.selectOptions(operationSelect(), 'Division (÷)');
      await user.click(calculateButton());

      await screen.findByRole('status');
      expect(sentBody()).toEqual({ operation: 'divide', a: 0, b: 4 });
    });

    it.each(['0', '0.0', '-0'])('rejects division by %s without calling the API', async (zero) => {
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '1', zero);
      await user.selectOptions(operationSelect(), 'Division (÷)');
      await user.click(calculateButton());

      expect(screen.getByText('Cannot divide by zero.')).toBeInTheDocument();
      expect(secondInput()).toHaveAttribute('aria-invalid', 'true');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('allows multiplying by zero', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '7', '0');
      await user.selectOptions(operationSelect(), 'Multiplication (×)');
      await user.click(calculateButton());

      await screen.findByRole('status');
      expect(sentBody()).toEqual({ operation: 'multiply', a: 7, b: 0 });
    });

    it('clears a field error as soon as that field is edited', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await user.click(calculateButton());
      expect(screen.getAllByText('Enter a number.')).toHaveLength(2);

      await user.type(firstInput(), '1');
      expect(screen.getAllByText('Enter a number.')).toHaveLength(1);
      expect(firstInput()).not.toHaveAttribute('aria-invalid');
    });

    it('clears the division-by-zero error when the operation changes', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '1', '0');
      await user.selectOptions(operationSelect(), 'Division (÷)');
      await user.click(calculateButton());
      expect(screen.getByText('Cannot divide by zero.')).toBeInTheDocument();

      await user.selectOptions(operationSelect(), 'Addition (+)');
      expect(screen.queryByText('Cannot divide by zero.')).not.toBeInTheDocument();
    });
  });

  describe('request failures', () => {
    it('shows the backend message for a validation error, as an alert', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          { error: { code: 'RESULT_OUT_OF_RANGE', message: 'The result is out of range.' } },
          400,
        ),
      );
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '1', '2');
      await user.click(calculateButton());

      expect(await screen.findByRole('alert')).toHaveTextContent('The result is out of range.');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(calculateButton()).toBeEnabled();
    });

    it('shows a generic message for server errors without leaking details', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'stack trace here' } }, 500),
      );
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '1', '2');
      await user.click(calculateButton());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('unexpected response');
      expect(alert).not.toHaveTextContent('stack trace');
    });

    it('shows a connection message on network failure and lets the user retry', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '1', '2');
      await user.click(calculateButton());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Could not reach the calculator service');
      expect(alert).not.toHaveTextContent('Failed to fetch');
      expect(calculateButton()).toBeEnabled();

      await user.click(calculateButton());
      expect(await screen.findByRole('status')).toHaveTextContent('1 + 2 = 15');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('loading and stale results', () => {
    it('shows a loading state and ignores duplicate submissions while pending', async () => {
      const pending = deferred<Response>();
      fetchMock.mockReturnValue(pending.promise);
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '10', '5');
      await user.click(calculateButton());

      expect(calculateButton()).toBeDisabled();
      expect(calculateButton()).toHaveTextContent('Calculating…');

      await user.click(calculateButton());
      await user.type(secondInput(), '{Enter}');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      pending.resolve(jsonResponse({ result: 15 }));
    });

    it('does not submit twice when the form is submitted repeatedly before the response arrives', async () => {
      const pending = deferred<Response>();
      fetchMock.mockReturnValue(pending.promise);
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '10', '5');
      await user.keyboard('{Enter}{Enter}{Enter}');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(calculateButton()).toBeDisabled();

      pending.resolve(jsonResponse({ result: 15 }));
      expect(await screen.findByRole('status')).toHaveTextContent('10 + 5 = 15');
      expect(calculateButton()).toBeEnabled();
      expect(calculateButton()).toHaveTextContent('Calculate');
    });

    it('removes the previous result as soon as an input changes', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '10', '5');
      await user.click(calculateButton());
      expect(await screen.findByRole('status')).toBeInTheDocument();

      await user.type(firstInput(), '0');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByText('Enter two numbers and choose an operation.')).toBeInTheDocument();
    });

    it('removes the previous result when the operation changes', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '10', '5');
      await user.click(calculateButton());
      expect(await screen.findByRole('status')).toBeInTheDocument();

      await user.selectOptions(operationSelect(), 'Subtraction (−)');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('clears the previous result and error when a new submission fails validation', async () => {
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '10', '5');
      await user.click(calculateButton());
      await screen.findByRole('status');

      await user.clear(secondInput());
      await user.click(calculateButton());

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByText('Enter a number.')).toBeInTheDocument();
    });

    it('discards the response of a request whose inputs were edited while it was pending', async () => {
      const first = deferred<Response>();
      fetchMock.mockReturnValueOnce(first.promise);
      const user = userEvent.setup();
      render(<Calculator />);

      await fill(user, '10', '5');
      await user.click(calculateButton());
      expect(calculateButton()).toBeDisabled();

      await user.type(firstInput(), '0'); // 100 + 5: invalidates the pending 10 + 5
      expect(calculateButton()).toBeEnabled();

      first.resolve(jsonResponse({ result: 999 }));
      await Promise.resolve();

      expect(screen.queryByRole('status')).not.toBeInTheDocument();

      await user.click(calculateButton());
      const status = await screen.findByRole('status');
      expect(status).toHaveTextContent('100 + 5 = 15');
      expect(status).not.toHaveTextContent('999');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sentBody(1)).toEqual({ operation: 'add', a: 100, b: 5 });
    });

    it('aborts the pending request on unmount', async () => {
      const pending = deferred<Response>();
      fetchMock.mockReturnValue(pending.promise);
      const user = userEvent.setup();
      const { unmount } = render(<Calculator />);

      await fill(user, '1', '2');
      await user.click(calculateButton());
      const signal = (fetchMock.mock.calls[0]![1] as RequestInit).signal!;
      expect(signal.aborted).toBe(false);

      unmount();
      expect(signal.aborted).toBe(true);
    });
  });
});
