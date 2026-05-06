package http

import (
	"encoding/json"
	nethttp "net/http"

	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

type meResponse struct {
	Connected bool   `json:"connected"`
	Email     string `json:"email,omitempty"`
	Sub       string `json:"sub,omitempty"`
}

// Me handles GET /api/v1/me. It looks up the encrypted UserInfo for the
// requesting Mattermost user and reports whether the user is connected to
// OpenTalk. The webapp uses this on initialize to seed its OAuth-state slice
// after a browser refresh – the WS-broadcast pattern only delivers state
// changes (connect/disconnect events), not the current snapshot.
func (h *Handlers) Me(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}

	info, err := h.Store.LoadUserInfo(h.EncryptionKey, mmUserID)
	resp := meResponse{Connected: false}
	switch {
	case err == nil:
		resp.Connected = true
		resp.Email = info.OpenTalkEmail
		resp.Sub = info.OpenTalkSub
	case err == store.ErrNotFound:
		// stay disconnected
	default:
		nethttp.Error(w, "lookup failed: "+err.Error(), nethttp.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
