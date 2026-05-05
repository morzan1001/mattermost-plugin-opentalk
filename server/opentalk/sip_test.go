package opentalk

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetSIPInfo_ReturnsCredentials(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/v1/rooms/room-1/sip", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"id":"123456789","password":"4242","lobby":false}`))
	}))
	defer server.Close()

	c := NewClient(server.URL)
	info, err := c.GetSIPInfo("tok", "room-1")
	require.NoError(t, err)
	assert.Equal(t, "123456789", info.ID)
	assert.Equal(t, "4242", info.Password)
}

func TestGetSIPInfo_404IsTypedError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error":"sip_not_enabled"}`))
	}))
	defer server.Close()

	c := NewClient(server.URL)
	_, err := c.GetSIPInfo("tok", "room-1")
	require.Error(t, err)
	var apiErr *APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, http.StatusNotFound, apiErr.Status)
}
