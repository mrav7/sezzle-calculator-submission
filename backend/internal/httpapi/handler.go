// Package httpapi exposes the calculator over a small JSON HTTP API.
package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"reflect"
	"strings"

	"sezzle-calculator/backend/internal/calculator"
)

// maxBodyBytes is the largest request body accepted (8 KiB).
const maxBodyBytes = 8 << 10

// Error codes returned in the "error.code" field of error responses.
const (
	codeInvalidJSON          = "INVALID_JSON"
	codeValidation           = "VALIDATION_ERROR"
	codeUnknownOperation     = "UNKNOWN_OPERATION"
	codeDivisionByZero       = "DIVISION_BY_ZERO"
	codeResultOutOfRange     = "RESULT_OUT_OF_RANGE"
	codeMethodNotAllowed     = "METHOD_NOT_ALLOWED"
	codeUnsupportedMediaType = "UNSUPPORTED_MEDIA_TYPE"
	codeNotFound             = "NOT_FOUND"
	codeInternal             = "INTERNAL_ERROR"
)

// internalErrorBody is written when a response cannot be marshalled.
const internalErrorBody = `{"error":{"code":"INTERNAL_ERROR","message":"internal server error"}}`

// calculateRequest uses pointers so that a missing (or null) field can be told
// apart from an explicit zero.
type calculateRequest struct {
	Operation *string  `json:"operation"`
	A         *float64 `json:"a"`
	B         *float64 `json:"b"`
}

type calculateResponse struct {
	Result float64 `json:"result"`
}

type errorResponse struct {
	Error errorBody `json:"error"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// apiError is a client-facing error that maps directly to an HTTP response.
type apiError struct {
	status  int
	code    string
	message string
}

// NewHandler returns the HTTP handler serving the API.
func NewHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/calculate", handleCalculate)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, codeNotFound, "resource not found")
	})
	return mux
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeError(w, http.StatusMethodNotAllowed, codeMethodNotAllowed, "method not allowed; use POST")
		return
	}
	if !isJSONContentType(r.Header.Get("Content-Type")) {
		writeError(w, http.StatusUnsupportedMediaType, codeUnsupportedMediaType, "Content-Type must be application/json")
		return
	}

	req, apiErr := decodeRequest(w, r)
	if apiErr == nil {
		apiErr = validateRequest(req)
	}
	if apiErr != nil {
		writeError(w, apiErr.status, apiErr.code, apiErr.message)
		return
	}

	result, err := calculator.Calculate(calculator.Operation(*req.Operation), *req.A, *req.B)
	if err != nil {
		writeCalculationError(w, err)
		return
	}
	writeResult(w, result)
}

func isJSONContentType(header string) bool {
	mediaType, _, err := mime.ParseMediaType(header)
	return err == nil && mediaType == "application/json"
}

// decodeRequest reads exactly one JSON object from the body, rejecting unknown
// fields, trailing data and bodies larger than maxBodyBytes.
func decodeRequest(w http.ResponseWriter, r *http.Request) (calculateRequest, *apiError) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var req calculateRequest
	if err := dec.Decode(&req); err != nil {
		return req, classifyDecodeError(err)
	}

	// A well-formed request has nothing after the first value. RawMessage
	// accepts any JSON value, so unknown-field checking cannot mask this.
	var extra json.RawMessage
	if err := dec.Decode(&extra); err != io.EOF {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return req, classifyDecodeError(err)
		}
		return req, &apiError{http.StatusBadRequest, codeInvalidJSON, "request body must contain a single JSON object"}
	}
	return req, nil
}

func classifyDecodeError(err error) *apiError {
	var (
		syntaxErr *json.SyntaxError
		typeErr   *json.UnmarshalTypeError
		maxErr    *http.MaxBytesError
	)
	switch {
	case errors.As(err, &maxErr):
		return &apiError{http.StatusBadRequest, codeValidation, fmt.Sprintf("request body must not exceed %d bytes", maxBodyBytes)}
	case errors.Is(err, io.EOF):
		return &apiError{http.StatusBadRequest, codeInvalidJSON, "request body must not be empty"}
	case errors.As(err, &syntaxErr), errors.Is(err, io.ErrUnexpectedEOF):
		return &apiError{http.StatusBadRequest, codeInvalidJSON, "request body is not valid JSON"}
	case errors.As(err, &typeErr):
		return &apiError{http.StatusBadRequest, codeValidation, typeErrorMessage(typeErr)}
	case strings.HasPrefix(err.Error(), "json: unknown field "):
		// encoding/json reports this with an untyped error.
		return &apiError{http.StatusBadRequest, codeValidation, strings.TrimPrefix(err.Error(), "json: ")}
	default:
		return &apiError{http.StatusBadRequest, codeInvalidJSON, "request body is not valid JSON"}
	}
}

func typeErrorMessage(err *json.UnmarshalTypeError) string {
	if err.Field == "" {
		return "request body must be a JSON object"
	}
	// encoding/json reports a numeric literal that does not fit in a float64
	// (e.g. 1e999) as "number <literal>".
	if strings.HasPrefix(err.Value, "number ") {
		return fmt.Sprintf("field %q is outside the range of a 64-bit float", err.Field)
	}
	expected := "a number"
	if err.Type.Kind() == reflect.String {
		expected = "a string"
	}
	return fmt.Sprintf("field %q must be %s", err.Field, expected)
}

func validateRequest(req calculateRequest) *apiError {
	var missing []string
	if req.Operation == nil {
		missing = append(missing, "operation")
	}
	if req.A == nil {
		missing = append(missing, "a")
	}
	if req.B == nil {
		missing = append(missing, "b")
	}
	if len(missing) > 0 {
		return &apiError{http.StatusBadRequest, codeValidation, "missing required field(s): " + strings.Join(missing, ", ")}
	}
	return nil
}

func writeCalculationError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, calculator.ErrUnknownOperation):
		writeError(w, http.StatusBadRequest, codeUnknownOperation, "unsupported operation; expected one of add, subtract, multiply, divide")
	case errors.Is(err, calculator.ErrDivisionByZero):
		writeError(w, http.StatusBadRequest, codeDivisionByZero, "division by zero is undefined")
	case errors.Is(err, calculator.ErrResultOutOfRange):
		writeError(w, http.StatusBadRequest, codeResultOutOfRange, "result is not a finite number")
	default:
		writeError(w, http.StatusInternalServerError, codeInternal, "internal server error")
	}
}

func writeResult(w http.ResponseWriter, result float64) {
	if result == 0 {
		result = 0 // normalise -0, which would otherwise serialise as "-0"
	}
	writeJSON(w, http.StatusOK, calculateResponse{Result: result})
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorResponse{Error: errorBody{Code: code, Message: message}})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	body, err := json.Marshal(v)
	if err != nil {
		status = http.StatusInternalServerError
		body = []byte(internalErrorBody)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
