package command

import (
	"encoding/json"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/opentalk/mattermost-plugin-opentalk/server/crypto"
	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

var encKey = []byte("0123456789abcdef0123456789abcdef")

func newHandler(api *plugintest.API) *Handler {
	return &Handler{
		API:           api,
		Store:         store.New(api),
		EncryptionKey: encKey,
		SiteURL:       "http://localhost:8065",
		PluginID:      "de.opentalk.mattermost-plugin",
		FrontendURL:   "https://opentalk.example",
	}
}

func mkArgs(userID, command string) *model.CommandArgs {
	return &model.CommandArgs{UserId: userID, Command: command}
}

func TestExecute_FallsBackToHelpForEmpty(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)
	resp, _ := h.Execute(mkArgs("u1", "/opentalk"))
	assert.Contains(t, resp.Text, "Kommandos")
}

func TestExecute_UnknownSubcommand(t *testing.T) {
	api := &plugintest.API{}
	h := newHandler(api)
	resp, _ := h.Execute(mkArgs("u1", "/opentalk wiggle"))
	assert.Contains(t, resp.Text, "Unbekannter Subcommand")
}

func TestConnect_ReturnsLinkWhenNotConnected(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)
	h := newHandler(api)
	resp, _ := h.Execute(mkArgs("u1", "/opentalk connect"))
	assert.Contains(t, resp.Text, "/plugins/de.opentalk.mattermost-plugin/oauth/start")
}

func TestConnect_NoticesAlreadyConnected(t *testing.T) {
	api := &plugintest.API{}
	info := &store.UserInfo{
		MattermostUserID: "u1", OpenTalkSub: "s", OpenTalkEmail: "a@b",
		AccessToken: "x", RefreshToken: "y",
		AccessExpiry: time.Now().Add(time.Hour), ConnectedAt: time.Now(),
	}
	raw, _ := json.Marshal(info)
	enc, _ := crypto.Encrypt(encKey, raw)
	api.On("KVGet", mock.AnythingOfType("string")).Return(enc, nil)
	h := newHandler(api)
	resp, _ := h.Execute(mkArgs("u1", "/opentalk connect"))
	assert.Contains(t, resp.Text, "bereits")
}

func TestDisconnect_DeletesAndBroadcasts(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVDelete", mock.AnythingOfType("string")).Return(nil)
	api.On("PublishWebSocketEvent", "user_connected_state",
		mock.MatchedBy(func(p map[string]any) bool {
			return p["connected"] == false && p["mm_user_id"] == "u1"
		}),
		mock.AnythingOfType("*model.WebsocketBroadcast"),
	).Return()

	h := newHandler(api)
	resp, _ := h.Execute(mkArgs("u1", "/opentalk disconnect"))
	assert.Contains(t, resp.Text, "entfernt")
	api.AssertExpectations(t)
}

func TestInfo_NotConnected(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)
	h := newHandler(api)
	resp, _ := h.Execute(mkArgs("u1", "/opentalk info"))
	assert.Contains(t, resp.Text, "nicht mit OpenTalk verbunden")
}

func TestInfo_Connected(t *testing.T) {
	api := &plugintest.API{}
	info := &store.UserInfo{
		MattermostUserID: "u1", OpenTalkSub: "kc-sub", OpenTalkEmail: "alice@example",
		AccessToken: "a", RefreshToken: "r",
		AccessExpiry: time.Now().Add(time.Hour),
		ConnectedAt:  time.Now().Add(-2 * time.Hour),
	}
	raw, _ := json.Marshal(info)
	enc, _ := crypto.Encrypt(encKey, raw)
	api.On("KVGet", mock.AnythingOfType("string")).Return(enc, nil)
	h := newHandler(api)
	resp, _ := h.Execute(mkArgs("u1", "/opentalk info"))
	assert.Contains(t, resp.Text, "alice@example")
	assert.Contains(t, resp.Text, "kc-sub")
}

func TestAutocomplete_HasEightSubcommands(t *testing.T) {
	data := AutocompleteData()
	require.NotNil(t, data)
	require.Len(t, data.SubCommands, 8)
	names := []string{}
	for _, sc := range data.SubCommands {
		names = append(names, sc.Trigger)
	}
	sort.Strings(names)
	assert.Equal(t, "connect,dial-in,disconnect,end,help,info,join,start", strings.Join(names, ","))
}
