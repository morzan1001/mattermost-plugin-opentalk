package http

import (
	nethttp "net/http"
	"time"

	"github.com/google/uuid"
	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/oidc"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/opentalk"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

// Handlers bundles the dependencies that HTTP handlers need.
// Constructed once per ServeHTTP invocation by the Plugin.
type Handlers struct {
	Store         *store.Store
	OIDC          *oidc.Client
	EncryptionKey []byte
	BroadcastFunc func(event string, payload map[string]any, broadcast *model.WebsocketBroadcast)

	OpenTalk       *opentalk.Client
	RoomserverURL  string
	Defaults       MeetingDefaults
	AccessTokenFor func(mmUserID string) (string, error)

	BotUserID   string
	FrontendURL string
	CreatePost  func(*model.Post) (*model.Post, error)
	// HostUsernameOf returns the actual MM Username (drives @-mentions in the webapp).
	HostUsernameOf func(mmUserID string) string
	// HostDisplayNameOf returns the human-readable display name (nickname > first+last > username).
	HostDisplayNameOf func(mmUserID string) string
	// LocaleOf returns the MM locale string for a given user ID. Used to
	// select the language of the bot-post fallback message in BuildMeetingPost.
	// Returns "" on any error, which i18n.T treats as English.
	LocaleOf func(mmUserID string) string

	// IsConnected / UsernameOf: join endpoint dispatches between StartRoom
	// (registered user) and StartInvited (guest) based on KV store presence.
	// UsernameOf here returns the OpenTalk display_name to show in the room.
	IsConnected func(mmUserID string) bool
	UsernameOf  func(mmUserID string) string

	PostGetter  func(postID string) (*model.Post, error)
	PostUpdater func(p *model.Post) error

	ChannelMembersOf func(channelID string) []string

	// IsChannelMember gates access to endpoints that expose channel-private
	// data (join ticket, dismiss). Returns false on any error so callers fail
	// closed.
	IsChannelMember func(channelID, mmUserID string) bool

	// IsDMChannel returns true if the given channel is a direct or group channel.
	IsDMChannel func(channelID string) bool

	LogWarn func(msg string, args ...any)
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
		h.internalError(w, "OAuthStart: SaveOAuthState", err, nethttp.StatusInternalServerError, "save state failed")
		return
	}
	nethttp.Redirect(w, r, h.OIDC.AuthCodeURL(state), nethttp.StatusFound)
}

const successPage = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OpenTalk</title></head>
<body style="font-family:system-ui;text-align:center;padding:48px;">
<h1>Connected to OpenTalk</h1>
<p lang="en">You can close this window now.</p>
<p lang="de">Du kannst dieses Fenster jetzt schließen.</p>
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
		h.internalError(w, "OAuthCallback: code exchange", err, nethttp.StatusBadGateway, "code exchange failed")
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
		h.internalError(w, "OAuthCallback: SaveUserInfo", saveErr, nethttp.StatusInternalServerError, "store user info failed")
		return
	}

	if h.BroadcastFunc != nil {
		h.BroadcastFunc("user_connected_state", map[string]any{
			"mm_user_id": mmUserID,
			"connected":  true,
			"email":      info.Email,
		}, &model.WebsocketBroadcast{UserId: mmUserID})
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(nethttp.StatusOK)
	_, _ = w.Write([]byte(successPage))
}
