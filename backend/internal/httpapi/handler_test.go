package httpapi

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const jsonType = "application/json"

// send issues a request against a fresh handler. An empty contentType omits the
// Content-Type header.
func send(t *testing.T, method, path, contentType, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	NewHandler().ServeHTTP(rec, req)
	return rec
}

func postJSON(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	return send(t, http.MethodPost, "/api/calculate", jsonType, body)
}

// assertError checks the status, JSON content type and error code of rec, and
// that the message is present.
func assertError(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if rec.Code != status {
		t.Errorf("status = %d, want %d (body %s)", rec.Code, status, rec.Body)
	}
	if got := rec.Header().Get("Content-Type"); got != jsonType {
		t.Errorf("Content-Type = %q, want %q", got, jsonType)
	}
	var resp struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response is not valid JSON: %v (body %s)", err, rec.Body)
	}
	if resp.Error.Code != code {
		t.Errorf("error code = %q, want %q (message %q)", resp.Error.Code, code, resp.Error.Message)
	}
	if resp.Error.Message == "" {
		t.Error("error message is empty")
	}
}

func TestCalculateSuccess(t *testing.T) {
	tests := []struct {
		name string
		body string
		want string // exact response body
	}{
		{"add", `{"operation":"add","a":10,"b":5}`, `{"result":15}`},
		{"subtract", `{"operation":"subtract","a":10,"b":5}`, `{"result":5}`},
		{"multiply", `{"operation":"multiply","a":10,"b":5}`, `{"result":50}`},
		{"divide", `{"operation":"divide","a":10,"b":5}`, `{"result":2}`},
		{"negative numbers", `{"operation":"add","a":-3,"b":-4}`, `{"result":-7}`},
		{"decimals", `{"operation":"add","a":1.5,"b":2.25}`, `{"result":3.75}`},
		{"exponent notation", `{"operation":"multiply","a":1e3,"b":2e-1}`, `{"result":200}`},
		{"explicit zero a", `{"operation":"add","a":0,"b":5}`, `{"result":5}`},
		{"explicit zero b", `{"operation":"subtract","a":5,"b":0}`, `{"result":5}`},
		{"explicit zeros", `{"operation":"multiply","a":0,"b":0}`, `{"result":0}`},
		{"zero divided by number", `{"operation":"divide","a":0,"b":5}`, `{"result":0}`},
		{"negative zero is normalised", `{"operation":"multiply","a":0,"b":-5}`, `{"result":0}`},
		{"float precision not rounded", `{"operation":"add","a":0.1,"b":0.2}`, `{"result":0.30000000000000004}`},
		{"field order does not matter", `{"b":5,"a":10,"operation":"add"}`, `{"result":15}`},
		{"surrounding whitespace", " \n{\"operation\":\"add\",\"a\":1,\"b\":2}\n\t ", `{"result":3}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := postJSON(t, tt.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body)
			}
			if got := rec.Header().Get("Content-Type"); got != jsonType {
				t.Errorf("Content-Type = %q, want %q", got, jsonType)
			}
			if got := rec.Body.String(); got != tt.want {
				t.Errorf("body = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestCalculateCalculationErrors(t *testing.T) {
	tests := []struct {
		name string
		body string
		code string
	}{
		{"division by zero", `{"operation":"divide","a":1,"b":0}`, "DIVISION_BY_ZERO"},
		{"zero divided by zero", `{"operation":"divide","a":0,"b":0}`, "DIVISION_BY_ZERO"},
		{"division by decimal zero", `{"operation":"divide","a":1,"b":0.0}`, "DIVISION_BY_ZERO"},
		{"division by negative zero", `{"operation":"divide","a":1,"b":-0}`, "DIVISION_BY_ZERO"},
		{"unsupported operation", `{"operation":"power","a":2,"b":3}`, "UNKNOWN_OPERATION"},
		{"empty operation", `{"operation":"","a":2,"b":3}`, "UNKNOWN_OPERATION"},
		{"operation is case sensitive", `{"operation":"ADD","a":2,"b":3}`, "UNKNOWN_OPERATION"},
		{"multiply overflow", `{"operation":"multiply","a":1e308,"b":10}`, "RESULT_OUT_OF_RANGE"},
		{"add overflow", `{"operation":"add","a":1.7976931348623157e308,"b":1.7976931348623157e308}`, "RESULT_OUT_OF_RANGE"},
		{"negative overflow", `{"operation":"subtract","a":-1e308,"b":1e308}`, "RESULT_OUT_OF_RANGE"},
		{"divide overflow", `{"operation":"divide","a":1e308,"b":1e-10}`, "RESULT_OUT_OF_RANGE"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertError(t, postJSON(t, tt.body), http.StatusBadRequest, tt.code)
		})
	}
}

func TestCalculateInvalidJSON(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"empty body", ``},
		{"whitespace only", "  \n "},
		{"not JSON", `hello`},
		{"truncated", `{"operation":"add","a":1`},
		{"trailing comma", `{"operation":"add","a":1,"b":2,}`},
		{"single quotes", `{'operation':'add','a':1,'b':2}`},
		{"unquoted key", `{operation:"add","a":1,"b":2}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertError(t, postJSON(t, tt.body), http.StatusBadRequest, "INVALID_JSON")
		})
	}
}

func TestCalculateMultipleJSONValues(t *testing.T) {
	const valid = `{"operation":"add","a":1,"b":2}`
	tests := []struct {
		name string
		body string
	}{
		{"two objects", valid + valid},
		{"two objects separated by whitespace", valid + "\n" + valid},
		{"object then array", valid + `[]`},
		{"object then scalar", valid + ` 1`},
		{"object then garbage", valid + ` xyz`},
		{"object then unknown-field object", valid + `{"extra":1}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertError(t, postJSON(t, tt.body), http.StatusBadRequest, "INVALID_JSON")
		})
	}
}

func TestCalculateValidationErrors(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"empty object", `{}`},
		{"null body", `null`},
		{"missing operation", `{"a":1,"b":2}`},
		{"missing a", `{"operation":"add","b":2}`},
		{"missing b", `{"operation":"add","a":1}`},
		{"null operation", `{"operation":null,"a":1,"b":2}`},
		{"null a", `{"operation":"add","a":null,"b":2}`},
		{"null b", `{"operation":"add","a":1,"b":null}`},
		{"a is a string", `{"operation":"add","a":"1","b":2}`},
		{"b is a string", `{"operation":"add","a":1,"b":"2"}`},
		{"a is a boolean", `{"operation":"add","a":true,"b":2}`},
		{"b is an array", `{"operation":"add","a":1,"b":[2]}`},
		{"a is an object", `{"operation":"add","a":{},"b":2}`},
		{"operation is a number", `{"operation":1,"a":1,"b":2}`},
		{"operation is an array", `{"operation":["add"],"a":1,"b":2}`},
		{"operand out of float64 range", `{"operation":"add","a":1e999,"b":2}`},
		{"unknown field", `{"operation":"add","a":1,"b":2,"c":3}`},
		{"unknown field only", `{"foo":"bar"}`},
		{"top-level array", `[1,2]`},
		{"top-level string", `"add"`},
		{"top-level number", `42`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertError(t, postJSON(t, tt.body), http.StatusBadRequest, "VALIDATION_ERROR")
		})
	}
}

func TestCalculateValidationMessages(t *testing.T) {
	tests := []struct {
		name string
		body string
		want string
	}{
		{"lists all missing fields", `{}`, "missing required field(s): operation, a, b"},
		{"lists only missing fields", `{"operation":"add","b":2}`, "missing required field(s): a"},
		{"wrong operand type", `{"operation":"add","a":"1","b":2}`, `field "a" must be a number`},
		{"wrong operation type", `{"operation":1,"a":1,"b":2}`, `field "operation" must be a string`},
		{"out of range operand", `{"operation":"add","a":1,"b":1e999}`, `field "b" is outside the range of a 64-bit float`},
		{"unknown field", `{"operation":"add","a":1,"b":2,"c":3}`, `unknown field "c"`},
		{"top-level array", `[1]`, "request body must be a JSON object"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := postJSON(t, tt.body)
			var resp errorResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("response is not valid JSON: %v", err)
			}
			if resp.Error.Message != tt.want {
				t.Errorf("message = %q, want %q", resp.Error.Message, tt.want)
			}
		})
	}
}

func TestCalculateMissingFieldsReportedBeforeUnknownOperation(t *testing.T) {
	assertError(t, postJSON(t, `{"operation":"power","a":1}`), http.StatusBadRequest, "VALIDATION_ERROR")
}

func TestCalculateBodySizeLimit(t *testing.T) {
	const prefix = `{"operation":"add","a":1,"b":2`
	pad := func(total int) string {
		// Whitespace before the closing brace is valid JSON, so only the size
		// can make the body invalid.
		return prefix + strings.Repeat(" ", total-len(prefix)-1) + "}"
	}

	t.Run("body of exactly 8 KiB is accepted", func(t *testing.T) {
		body := pad(8 << 10)
		if len(body) != 8<<10 {
			t.Fatalf("test body is %d bytes, want %d", len(body), 8<<10)
		}
		rec := postJSON(t, body)
		if rec.Code != http.StatusOK {
			t.Errorf("status = %d, want 200 (body %s)", rec.Code, rec.Body)
		}
	})

	t.Run("body one byte over 8 KiB is rejected", func(t *testing.T) {
		assertError(t, postJSON(t, pad(8<<10+1)), http.StatusBadRequest, "VALIDATION_ERROR")
	})

	t.Run("very large body is rejected", func(t *testing.T) {
		assertError(t, postJSON(t, pad(1<<20)), http.StatusBadRequest, "VALIDATION_ERROR")
	})

	t.Run("oversized trailing data is rejected as too large", func(t *testing.T) {
		body := `{"operation":"add","a":1,"b":2}` + strings.Repeat(" ", 8<<10) + `{}`
		assertError(t, postJSON(t, body), http.StatusBadRequest, "VALIDATION_ERROR")
	})
}

func TestCalculateContentType(t *testing.T) {
	const body = `{"operation":"add","a":1,"b":2}`

	accepted := []string{
		"application/json",
		"application/json; charset=utf-8",
		"Application/JSON",
	}
	for _, ct := range accepted {
		t.Run("accepts "+ct, func(t *testing.T) {
			rec := send(t, http.MethodPost, "/api/calculate", ct, body)
			if rec.Code != http.StatusOK {
				t.Errorf("status = %d, want 200 (body %s)", rec.Code, rec.Body)
			}
		})
	}

	rejected := []struct{ name, ct string }{
		{"missing", ""},
		{"text/plain", "text/plain"},
		{"form encoded", "application/x-www-form-urlencoded"},
		{"xml", "application/xml"},
		{"json suffix type", "application/problem+json"},
		{"prefix of json", "application/jsonx"},
		{"garbage", "not a media type"},
	}
	for _, tt := range rejected {
		t.Run("rejects "+tt.name, func(t *testing.T) {
			rec := send(t, http.MethodPost, "/api/calculate", tt.ct, body)
			assertError(t, rec, http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE")
		})
	}
}

func TestMethodNotAllowed(t *testing.T) {
	methods := []string{
		http.MethodGet,
		http.MethodHead,
		http.MethodPut,
		http.MethodPatch,
		http.MethodDelete,
		http.MethodOptions,
	}
	for _, m := range methods {
		t.Run(m, func(t *testing.T) {
			rec := send(t, m, "/api/calculate", jsonType, `{"operation":"add","a":1,"b":2}`)
			assertError(t, rec, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED")
			if got := rec.Header().Get("Allow"); got != "POST" {
				t.Errorf("Allow = %q, want %q", got, "POST")
			}
		})
	}
}

// The method is checked before the Content-Type, so a GET with no body or type
// is a 405 rather than a 415.
func TestMethodCheckedBeforeContentType(t *testing.T) {
	rec := send(t, http.MethodGet, "/api/calculate", "", "")
	assertError(t, rec, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED")
}

func TestNotFound(t *testing.T) {
	tests := []struct{ method, path string }{
		{http.MethodGet, "/"},
		{http.MethodPost, "/"},
		{http.MethodGet, "/unknown"},
		{http.MethodPost, "/api"},
		{http.MethodPost, "/api/"},
		{http.MethodPost, "/api/calculate/"},
		{http.MethodPost, "/api/calculate/extra"},
		{http.MethodPost, "/api/calc"},
		{http.MethodPost, "/calculate"},
	}
	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			rec := send(t, tt.method, tt.path, jsonType, `{"operation":"add","a":1,"b":2}`)
			assertError(t, rec, http.StatusNotFound, "NOT_FOUND")
		})
	}
}

func TestWriteCalculationErrorUnexpectedError(t *testing.T) {
	rec := httptest.NewRecorder()
	writeCalculationError(rec, http.ErrAbortHandler)
	assertError(t, rec, http.StatusInternalServerError, "INTERNAL_ERROR")
	if strings.Contains(rec.Body.String(), http.ErrAbortHandler.Error()) {
		t.Errorf("internal error detail leaked to client: %s", rec.Body)
	}
}

func TestWriteJSONUnmarshalableValue(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSON(rec, http.StatusOK, calculateResponse{Result: math.NaN()})
	assertError(t, rec, http.StatusInternalServerError, "INTERNAL_ERROR")
}
