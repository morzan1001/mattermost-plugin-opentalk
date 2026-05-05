package opentalk

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateInvite_PostsAndParses(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/v1/rooms/room-1/invites", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{
            "invite_code":"inv-uuid-1",
            "room_id":"room-1",
            "active":true,
            "created":"2026-05-05T18:00:00Z",
            "updated":"2026-05-05T18:00:00Z"
        }`))
	}))
	defer server.Close()

	c := NewClient(server.URL)
	expiry := time.Now().Add(24 * time.Hour)
	invite, err := c.CreateInvite("tok", "room-1", CreateInviteRequest{Expiration: &expiry})
	require.NoError(t, err)
	assert.Equal(t, "inv-uuid-1", invite.InviteCode)
	assert.True(t, invite.Active)
}
