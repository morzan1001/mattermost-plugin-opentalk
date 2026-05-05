package opentalk

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateRoom_PostsAndParses(t *testing.T) {
	var receivedBody CreateRoomRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/v1/rooms", r.URL.Path)
		require.Equal(t, "Bearer access-jwt", r.Header.Get("Authorization"))
		json.NewDecoder(r.Body).Decode(&receivedBody)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{
            "id": "ab123",
            "created_by": {
                "id": "u1",
                "email": "alice@example",
                "firstname": "Alice",
                "lastname": "Tester",
                "display_name": "Alice Tester"
            },
            "created_at": "2026-05-05T18:00:00Z",
            "waiting_room": false
        }`))
	}))
	defer server.Close()

	c := NewClient(server.URL)
	room, err := c.CreateRoom("access-jwt", CreateRoomRequest{EnableSIP: true})
	require.NoError(t, err)
	assert.Equal(t, "ab123", room.ID)
	assert.Equal(t, "Alice Tester", room.CreatedBy.DisplayName)
	assert.True(t, receivedBody.EnableSIP)
	assert.False(t, receivedBody.WaitingRoom)
}

func TestCreateRoom_PropagatesAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":"unauthorized"}`))
	}))
	defer server.Close()

	c := NewClient(server.URL)
	_, err := c.CreateRoom("expired-token", CreateRoomRequest{})
	require.Error(t, err)
	var apiErr *APIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, http.StatusUnauthorized, apiErr.Status)
}

func TestStartRoom_RegisteredUser(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/rooms/room-1/start", r.URL.Path)
		require.Equal(t, "Bearer tok", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ticket":"room-1#abc123","resumption":"res-456"}`))
	}))
	defer server.Close()

	c := NewClient(server.URL)
	out, err := c.StartRoom("tok", "room-1", StartRequest{
		DeviceSecret: "device-hex",
		DisplayName:  "alice",
	})
	require.NoError(t, err)
	assert.Equal(t, "room-1#abc123", out.Ticket)
	assert.Equal(t, "res-456", out.Resumption)
}

func TestStartInvited_GuestSendsNoAuth(t *testing.T) {
	var receivedAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/rooms/room-1/start_invited", r.URL.Path)
		receivedAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ticket":"room-1#guest","resumption":"res-guest"}`))
	}))
	defer server.Close()

	c := NewClient(server.URL)
	out, err := c.StartInvited("room-1", StartInvitedRequest{
		InviteCode:   "inv-1",
		DeviceSecret: "device-hex",
		DisplayName:  "Guest",
	})
	require.NoError(t, err)
	assert.Equal(t, "room-1#guest", out.Ticket)
	assert.Empty(t, receivedAuth, "guest path must not send Authorization header")
}
