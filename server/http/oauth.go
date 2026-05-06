package http

import (
	"fmt"
	nethttp "net/http"
	"time"

	"github.com/google/uuid"
	"github.com/mattermost/mattermost/server/public/model"

	"github.com/opentalk/mattermost-plugin-opentalk/server/oidc"
	"github.com/opentalk/mattermost-plugin-opentalk/server/opentalk"
	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

// Handlers bundles the dependencies that HTTP handlers need.
// Constructed once per ServeHTTP invocation by the Plugin.
type Handlers struct {
	Store         *store.Store
	OIDC          *oidc.Client
	EncryptionKey []byte
	BroadcastFunc func(event string, payload map[string]any)

	// Phase 3: meeting creation
	OpenTalk       *opentalk.Client
	RoomserverURL  string
	Defaults       MeetingDefaults
	AccessTokenFor func(mmUserID string) (string, error)

	// Phase 4 additions: bot-post creation alongside meeting create.
	BotUserID      string
	FrontendURL    string
	CreatePost     func(*model.Post) (*model.Post, error)
	HostUsernameOf func(mmUserID string) string

	// Phase 5 additions: join-meeting endpoint dispatches between
	// StartRoom (registered) and StartInvited (guest) based on whether the
	// user has a UserInfo record in the KV store.
	IsConnected func(mmUserID string) bool
	UsernameOf  func(mmUserID string) string
}

type MeetingDefaults struct {
	EnableSIP             bool
	WaitingRoom           bool
	InviteExpirationHours int
}

// OAuthStart begins the OIDC auth-code flow by issuing a CSRF-state, persisting
// it to KV (with 10-min TTL via the OAuthState helper), and redirecting the
// browser to the IdP's authorization endpoint.
func (h *Handlers) OAuthStart(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}
	state := uuid.New().String()
	if err := h.Store.SaveOAuthState(state, mmUserID); err != nil {
		nethttp.Error(w, fmt.Sprintf("save state: %v", err), nethttp.StatusInternalServerError)
		return
	}
	nethttp.Redirect(w, r, h.OIDC.AuthCodeURL(state), nethttp.StatusFound)
}

const successPage = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>OpenTalk verbunden</title></head>
<body><h1>Verbunden mit OpenTalk</h1>
<p>Du kannst dieses Fenster jetzt schließen.</p>
<script>setTimeout(function(){window.close();},1500);</script>
</body></html>`

// OAuthCallback completes the OIDC auth-code flow: it consumes the one-shot
// state, exchanges the code for tokens, fetches userinfo, persists an encrypted
// UserInfo record, and broadcasts a user_connected_state WebSocket event so the
// webapp can update its UI without a refresh.
func (h *Handlers) OAuthCallback(w nethttp.ResponseWriter, r *nethttp.Request) {
	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	if state == "" || code == "" {
		nethttp.Error(w, "missing state or code", nethttp.StatusBadRequest)
		return
	}
	mmUserID, err := h.Store.ConsumeOAuthState(state)
	if err != nil {
		nethttp.Error(w, "invalid state", nethttp.StatusBadRequest)
		return
	}

	tok, info, err := h.OIDC.Exchange(r.Context(), code)
	if err != nil {
		nethttp.Error(w, "code exchange failed: "+err.Error(), nethttp.StatusBadGateway)
		return
	}

	saveErr := h.Store.SaveUserInfo(h.EncryptionKey, &store.UserInfo{
		MattermostUserID: mmUserID,
		OpenTalkSub:      info.Sub,
		OpenTalkEmail:    info.Email,
		AccessToken:      tok.AccessToken,
		RefreshToken:     tok.RefreshToken,
		AccessExpiry:     tok.Expiry,
		ConnectedAt:      time.Now().UTC(),
	})
	if saveErr != nil {
		nethttp.Error(w, "store user info: "+saveErr.Error(), nethttp.StatusInternalServerError)
		return
	}

	if h.BroadcastFunc != nil {
		h.BroadcastFunc("user_connected_state", map[string]any{
			"mm_user_id": mmUserID,
			"connected":  true,
			"email":      info.Email,
		})
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(nethttp.StatusOK)
	_, _ = w.Write([]byte(successPage))
}
