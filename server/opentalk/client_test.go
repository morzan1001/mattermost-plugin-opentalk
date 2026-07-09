package opentalk

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewClient_TrimsTrailingSlashes(t *testing.T) {
	c := NewClient("https://controller.example/")
	assert.Equal(t, "https://controller.example", c.BaseURL)
}

func TestNewClient_DefaultTimeout(t *testing.T) {
	c := NewClient("https://controller.example")
	assert.Equal(t, 10*time.Second, c.HTTP.Timeout)
}

func TestDoRequest_GetWithBearer(t *testing.T) {
	var receivedAuth, receivedAccept string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		receivedAccept = r.Header.Get("Accept")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"hello": "world"})
	}))
	defer server.Close()

	c := NewClient(server.URL)
	var out map[string]string
	err := c.doRequest(http.MethodGet, "/v1/echo", "tok-xyz", nil, &out)
	require.NoError(t, err)
	assert.Equal(t, "world", out["hello"])
	assert.Equal(t, "Bearer tok-xyz", receivedAuth)
	assert.Equal(t, "application/json", receivedAccept)
}

func TestDoRequest_PostBodyJSON(t *testing.T) {
	var receivedBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&receivedBody)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"id": "room-1"})
	}))
	defer server.Close()

	c := NewClient(server.URL)
	body := map[string]any{"enable_sip": false}
	var out map[string]string
	err := c.doRequest(http.MethodPost, "/v1/rooms", "tok", body, &out)
	require.NoError(t, err)
	assert.Equal(t, "room-1", out["id"])
	assert.Equal(t, false, receivedBody["enable_sip"])
}

func TestDoRequest_NonOKReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(`{"error":"forbidden","detail":"no permission"}`))
	}))
	defer server.Close()

	c := NewClient(server.URL)
	err := c.doRequest(http.MethodGet, "/v1/anything", "tok", nil, nil)
	require.Error(t, err)
	var apiErr *APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, http.StatusForbidden, apiErr.Status)
	assert.Contains(t, apiErr.Body, "no permission")
}

func TestDoRequest_NoTokenSendsNoAuthHeader(t *testing.T) {
	var receivedAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	c := NewClient(server.URL)
	err := c.doRequest(http.MethodPost, "/v1/anonymous", "", map[string]string{"k": "v"}, nil)
	require.NoError(t, err)
	assert.Empty(t, receivedAuth, "no token => no Authorization header")
}
