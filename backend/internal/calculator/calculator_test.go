package calculator

import (
	"errors"
	"math"
	"testing"
)

func TestCalculate(t *testing.T) {
	tests := []struct {
		name string
		op   Operation
		a, b float64
		want float64
	}{
		{"add integers", Add, 10, 5, 15},
		{"add negatives", Add, -3, -4, -7},
		{"add mixed signs", Add, -3, 10, 7},
		{"add decimals", Add, 1.5, 2.25, 3.75},
		{"add zero", Add, 0, 0, 0},
		{"add identity", Add, 42, 0, 42},

		{"subtract integers", Subtract, 10, 5, 5},
		{"subtract to negative", Subtract, 5, 10, -5},
		{"subtract negatives", Subtract, -3, -4, 1},
		{"subtract decimals", Subtract, 5.5, 2.25, 3.25},
		{"subtract zero", Subtract, 7, 0, 7},

		{"multiply integers", Multiply, 6, 7, 42},
		{"multiply negatives", Multiply, -6, -7, 42},
		{"multiply mixed signs", Multiply, -6, 7, -42},
		{"multiply decimals", Multiply, 0.5, 0.5, 0.25},
		{"multiply by zero", Multiply, 123, 0, 0},
		{"multiply zero by zero", Multiply, 0, 0, 0},

		{"divide integers", Divide, 10, 5, 2},
		{"divide to decimal", Divide, 1, 4, 0.25},
		{"divide negatives", Divide, -9, -3, 3},
		{"divide mixed signs", Divide, 9, -3, -3},
		{"divide zero by non-zero", Divide, 0, 5, 0},
		{"divide decimals", Divide, 7.5, 2.5, 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.a, tt.b)
			if err != nil {
				t.Fatalf("Calculate(%q, %v, %v) unexpected error: %v", tt.op, tt.a, tt.b, err)
			}
			if got != tt.want {
				t.Errorf("Calculate(%q, %v, %v) = %v, want %v", tt.op, tt.a, tt.b, got, tt.want)
			}
		})
	}
}

// TestCalculateFloatPrecision documents that results are raw float64 values
// and are not rounded.
func TestCalculateFloatPrecision(t *testing.T) {
	a, b := 0.1, 0.2
	want := a + b // computed at run time, so no exact constant arithmetic

	got, err := Calculate(Add, a, b)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != want {
		t.Errorf("Calculate(Add, 0.1, 0.2) = %v, want %v", got, want)
	}
	if got == 0.3 {
		t.Error("result was rounded to 0.3; business logic must not round")
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		name    string
		op      Operation
		a, b    float64
		wantErr error
	}{
		{"divide by zero", Divide, 1, 0, ErrDivisionByZero},
		{"zero divided by zero", Divide, 0, 0, ErrDivisionByZero},
		{"divide by negative zero", Divide, 1, math.Copysign(0, -1), ErrDivisionByZero},

		{"unknown operation", "power", 2, 3, ErrUnknownOperation},
		{"empty operation", "", 2, 3, ErrUnknownOperation},
		{"operation is case sensitive", "ADD", 2, 3, ErrUnknownOperation},

		{"add overflow", Add, math.MaxFloat64, math.MaxFloat64, ErrResultOutOfRange},
		{"add negative overflow", Add, -math.MaxFloat64, -math.MaxFloat64, ErrResultOutOfRange},
		{"subtract overflow", Subtract, math.MaxFloat64, -math.MaxFloat64, ErrResultOutOfRange},
		{"multiply overflow", Multiply, math.MaxFloat64, 2, ErrResultOutOfRange},
		{"divide overflow", Divide, math.MaxFloat64, 0.5, ErrResultOutOfRange},
		{"infinite operand", Add, math.Inf(1), 1, ErrResultOutOfRange},
		{"NaN from infinities", Add, math.Inf(1), math.Inf(-1), ErrResultOutOfRange},
		{"NaN operand", Multiply, math.NaN(), 1, ErrResultOutOfRange},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.a, tt.b)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("Calculate(%q, %v, %v) error = %v, want %v", tt.op, tt.a, tt.b, err, tt.wantErr)
			}
			if got != 0 {
				t.Errorf("result = %v on error, want 0", got)
			}
		})
	}
}
