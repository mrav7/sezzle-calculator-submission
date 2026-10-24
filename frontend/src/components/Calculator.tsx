import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ApiError, NetworkError, calculate, type Operation } from '../api/calculator';
import { formatResult, parseOperand } from '../calculation';

const OPERATIONS: { value: Operation; label: string; symbol: string }[] = [
  { value: 'add', label: 'Addition (+)', symbol: '+' },
  { value: 'subtract', label: 'Subtraction (−)', symbol: '−' },
  { value: 'multiply', label: 'Multiplication (×)', symbol: '×' },
  { value: 'divide', label: 'Division (÷)', symbol: '÷' },
];

type Outcome =
  | { kind: 'result'; expression: string; value: string }
  | { kind: 'error'; message: string };

interface FieldErrors {
  a?: string;
  b?: string;
}

const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Please try again.';

function errorMessage(err: unknown): string {
  // ApiError and NetworkError messages are written to be shown to users.
  return err instanceof ApiError || err instanceof NetworkError
    ? err.message
    : UNKNOWN_ERROR_MESSAGE;
}

export default function Calculator() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [operation, setOperation] = useState<Operation>('add');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [loading, setLoading] = useState(false);

  // The controller of the request currently in flight, if any. Also serves as the
  // synchronous "already submitting" flag, which state alone cannot do reliably.
  const pending = useRef<AbortController | null>(null);

  const cancelPending = () => {
    pending.current?.abort();
    pending.current = null;
    setLoading(false);
  };

  useEffect(() => () => pending.current?.abort(), []);

  // Any edit invalidates the shown result and abandons an in-flight request,
  // so a response can never be displayed next to inputs it was not computed from.
  const onEdit = () => {
    cancelPending();
    setOutcome(null);
  };

  const onOperand =
    (field: 'a' | 'b', set: (value: string) => void) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      set(event.target.value);
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
      onEdit();
    };

  const onOperation = (event: ChangeEvent<HTMLSelectElement>) => {
    setOperation(event.target.value as Operation);
    setFieldErrors((prev) => ({ ...prev, b: undefined }));
    onEdit();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current) return;

    const parsedA = parseOperand(a);
    const parsedB = parseOperand(b);
    const errors: FieldErrors = {};
    if (!parsedA.ok) errors.a = parsedA.error;
    if (!parsedB.ok) errors.b = parsedB.error;
    else if (operation === 'divide' && parsedB.value === 0) errors.b = 'Cannot divide by zero.';
    setFieldErrors(errors);
    setOutcome(null);
    if (!parsedA.ok || !parsedB.ok || errors.b) return;

    const symbol = OPERATIONS.find((op) => op.value === operation)!.symbol;
    const expression = `${a.trim()} ${symbol} ${b.trim()}`;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);

    try {
      const value = await calculate(
        { operation, a: parsedA.value, b: parsedB.value },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setOutcome({ kind: 'result', expression, value: formatResult(value) });
    } catch (err) {
      if (controller.signal.aborted) return;
      setOutcome({ kind: 'error', message: errorMessage(err) });
    }
    pending.current = null;
    setLoading(false);
  };

  return (
    <section className="card" aria-labelledby="calculator-title">
      <h1 id="calculator-title">Calculator</h1>

      <form onSubmit={onSubmit} noValidate>
        <div className="operands">
          <Field
            id="operand-a"
            label="First number"
            value={a}
            error={fieldErrors.a}
            onChange={onOperand('a', setA)}
          />
          <Field
            id="operand-b"
            label="Second number"
            value={b}
            error={fieldErrors.b}
            onChange={onOperand('b', setB)}
          />
        </div>

        <div className="field">
          <label htmlFor="operation">Operation</label>
          <select id="operation" value={operation} onChange={onOperation}>
            {OPERATIONS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Calculating…' : 'Calculate'}
        </button>
      </form>

      <div className="result" aria-busy={loading}>
        <h2 id="result-title">Result</h2>
        {outcome?.kind === 'result' ? (
          <p role="status" className="result-value">
            <span className="result-expression">{outcome.expression} =</span>{' '}
            <span className="result-number">{outcome.value}</span>
          </p>
        ) : outcome?.kind === 'error' ? (
          <p role="alert" className="error-message">
            {outcome.message}
          </p>
        ) : (
          <p className="placeholder">
            {loading ? 'Calculating…' : 'Enter two numbers and choose an operation.'}
          </p>
        )}
      </div>
    </section>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function Field({ id, label, value, error, onChange }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
