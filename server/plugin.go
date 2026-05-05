package main

import (
	"context"
	"fmt"
	nethttp "net/http"
	"strings"
	"sync"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/pluginapi"

	"github.com/opentalk/mattermost-plugin-opentalk/server/command"
	pluginhttp "github.com/opentalk/mattermost-plugin-opentalk/server/http"
	"github.com/opentalk/mattermost-plugin-opentalk/server/oidc"
	"github.com/opentalk/mattermost-plugin-opentalk/server/opentalk"
	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

const pluginID = "de.opentalk.mattermost-plugin"

const botUsername = "opentalk-bot"
const botDisplayName = "OpenTalk Bot"
const botDescription = "Posts about OpenTalk meetings created from Mattermost."

type Plugin struct {
	plugin.MattermostPlugin

	client *pluginapi.Client

	configurationLock sync.RWMutex
	configuration     *Configuration

	botUserID string

	store      *store.Store
	oidcClient *oidc.Client
	oidcMu     sync.RWMutex
}

func (p *Plugin) OnActivate() error {
	p.client = pluginapi.NewClient(p.API, p.Driver)

	botID, err := p.API.EnsureBotUser(&model.Bot{
		Username:    botUsername,
		DisplayName: botDisplayName,
		Description: botDescription,
	})
	if err != nil {
		return fmt.Errorf("failed to ensure bot user: %w", err)
	}
	p.botUserID = botID

	p.store = store.New(p.API)

	if err := p.API.RegisterCommand(&model.Command{
		Trigger:          command.Trigger,
		AutoComplete:     true,
		AutoCompleteDesc: "OpenTalk plugin commands",
		AutoCompleteHint: "[connect|disconnect|info|help]",
		AutocompleteData: command.AutocompleteData(),
	}); err != nil {
		return fmt.Errorf("register command: %w", err)
	}

	return nil
}

func (p *Plugin) ExecuteCommand(c *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	cfg := p.getConfiguration()
	h := &command.Handler{
		API:           p.API,
		Store:         p.store,
		OIDCClient:    p.getOIDCClient(),
		EncryptionKey: []byte(cfg.TokenEncryptionKey),
		SiteURL:       p.getSiteURL(),
		PluginID:      pluginID,
	}
	return h.Execute(args)
}

func (p *Plugin) OnDeactivate() error {
	return nil
}

func (p *Plugin) getOIDCClient() *oidc.Client {
	p.oidcMu.RLock()
	defer p.oidcMu.RUnlock()
	return p.oidcClient
}

func (p *Plugin) setOIDCClient(c *oidc.Client) {
	p.oidcMu.Lock()
	defer p.oidcMu.Unlock()
	p.oidcClient = c
}

func (p *Plugin) getSiteURL() string {
	cfg := p.API.GetConfig()
	if cfg != nil && cfg.ServiceSettings.SiteURL != nil {
		return *cfg.ServiceSettings.SiteURL
	}
	return ""
}

func splitScopes(s string) []string {
	return strings.Fields(s)
}

// ServeHTTP routes plugin HTTP requests through the gorilla/mux-Router in
// server/http. Returns 503 if the plugin has not been configured yet (i.e.,
// OnConfigurationChange has not produced a valid OIDC client).
func (p *Plugin) ServeHTTP(c *plugin.Context, w nethttp.ResponseWriter, r *nethttp.Request) {
	oidcClient := p.getOIDCClient()
	if oidcClient == nil || p.store == nil {
		nethttp.Error(w, "plugin not configured", nethttp.StatusServiceUnavailable)
		return
	}

	cfg := p.getConfiguration()
	handlers := &pluginhttp.Handlers{
		Store:         p.store,
		OIDC:          oidcClient,
		EncryptionKey: []byte(cfg.TokenEncryptionKey),
		BroadcastFunc: func(event string, payload map[string]any) {
			p.API.PublishWebSocketEvent(event, payload, &model.WebsocketBroadcast{})
		},

		OpenTalk:      opentalk.NewClient(cfg.OpenTalkControllerURL),
		RoomserverURL: cfg.OpenTalkRoomserverURL,
		Defaults: pluginhttp.MeetingDefaults{
			EnableSIP:             cfg.DefaultEnableSIP,
			WaitingRoom:           cfg.DefaultWaitingRoom,
			InviteExpirationHours: cfg.InviteExpirationHours,
		},
		AccessTokenFor: p.accessTokenFor,
	}
	pluginhttp.NewRouter(handlers).ServeHTTP(w, r)
}

// accessTokenFor returns a fresh OIDC access token for the given Mattermost
// user, transparently refreshing it via the IdP if the cached token is
// (about to be) expired. If a refresh occurs, the rotated UserInfo is
// persisted; persistence failures are logged but don't block the caller —
// we still return the working in-memory token.
func (p *Plugin) accessTokenFor(mmUserID string) (string, error) {
	cfg := p.getConfiguration()
	encKey := []byte(cfg.TokenEncryptionKey)

	info, err := p.store.LoadUserInfo(encKey, mmUserID)
	if err != nil {
		return "", err
	}

	fresh, err := oidc.EnsureFreshToken(context.Background(), p.getOIDCClient(), info)
	if err != nil {
		return "", err
	}
	if fresh != info {
		if saveErr := p.store.SaveUserInfo(encKey, fresh); saveErr != nil {
			p.API.LogWarn("failed to persist refreshed UserInfo", "err", saveErr.Error())
		}
	}
	return fresh.AccessToken, nil
}
