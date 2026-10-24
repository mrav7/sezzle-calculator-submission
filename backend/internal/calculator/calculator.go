// Package calculator implements the four basic arithmetic operations.
//
// All arithmetic uses IEEE 754 binary64 (float64), so results carry the usual
// binary floating-point limitations: many decimal fractions are not exactly
// representable (0.1 + 0.2 is 0.30000000000000004), and integers beyond 2^53
// lose precision. Results are returned as computed and are never rounded here;
// presentation is the caller's concern.
package calculator

import (
	"errors"
	"math"
)

// Operation names an arithmetic operation.
type Operation string

// Supported operations.
const (
	Add      Operation = "add"
	Subtract Operation = "subtract"
	Multiply Operation = "multiply"
	Divide   Operation = "divide"
)

var (
	// ErrUnknownOperation is returned for an operation that is not supported.
	ErrUnknownOperation = errors.New("unknown operation")
	// ErrDivisionByZero is returned when dividing by zero.
	ErrDivisionByZero = errors.New("division by zero")
	// ErrResultOutOfRange is returned when the result is not a finite number
	// (overflow to ±Inf, or NaN).
	ErrResultOutOfRange = errors.New("result is not a finite number")
)

// Calculate applies op to a and b.
func Calculate(op Operation, a, b float64) (float64, error) {
	var result float64
	switch op {
	case Add:
		result = a + b
	case Subtract:
		result = a - b
	case Multiply:
		result = a * b
	case Divide:
		if b == 0 {
			return 0, ErrDivisionByZero
		}
		result = a / b
	default:
		return 0, ErrUnknownOperation
	}

	if math.IsInf(result, 0) || math.IsNaN(result) {
		return 0, ErrResultOutOfRange
	}
	return result, nil
}
