package main

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/mattermost/mattermost/server/public/pluginapi"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/crypto"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

func TestPlugin_OnActivate(t *testing.T) {
	t.Run("ensures opentalk-bot user", func(t *testing.T) {
		api := &plugintest.API{}
		api.On("EnsureBotUser", mock.MatchedBy(func(b *model.Bot) bool {
			return b.Username == botUsername && b.DisplayName == botDisplayName
		})).Return("bot-user-id", nil)
		api.On("RegisterCommand", mock.MatchedBy(func(cmd *model.Command) bool {
			return cmd.Trigger == "opentalk"
		})).Return(nil)

		p := &Plugin{}
		p.SetAPI(api)

		err := p.OnActivate()
		assert.NoError(t, err)
		assert.Equal(t, "bot-user-id", p.botUserID)

		api.AssertExpectations(t)
	})

	t.Run("propagates EnsureBotUser error", func(t *testing.T) {
		api := &plugintest.API{}
		api.On("EnsureBotUser", mock.MatchedBy(func(b *model.Bot) bool {
			return b.Username == botUsername
		})).Return("", &model.AppError{Message: "bot ensure failed"})

		p := &Plugin{}
		p.SetAPI(api)

		err := p.OnActivate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "bot ensure failed")
	})
}

func TestPlugin_OnDeactivate(t *testing.T) {
	t.Run("returns nil", func(t *testing.T) {
		p := &Plugin{}
		err := p.OnDeactivate()
		assert.NoError(t, err)
	})
}

var testEncKey = []byte("0123456789abcdef0123456789abcdef")

func TestPlugin_AccessTokenFor_ReturnsCachedTokenIfStillValid(t *testing.T) {
	api := &plugintest.API{}

	info := &store.UserInfo{
		MattermostUserID: "u1",
		AccessToken:      "still-valid-token",
		RefreshToken:     "rt",
		AccessExpiry:     time.Now().Add(10 * time.Minute),
	}
	raw, err := json.Marshal(info)
	require.NoError(t, err)
	enc, err := crypto.Encrypt(testEncKey, raw)
	require.NoError(t, err)

	api.On("KVGet", mock.AnythingOfType("string")).Return(enc, nil)

	p := &Plugin{}
	p.SetAPI(api)
	p.client = pluginapi.NewClient(api, nil)
	p.store = store.New(api)
	p.setConfiguration(&Configuration{TokenEncryptionKey: string(testEncKey)})

	tok, err := p.accessTokenFor("u1")
	require.NoError(t, err)
	assert.Equal(t, "still-valid-token", tok)
}

func TestPlugin_AccessTokenFor_PropagatesNotFound(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil)

	p := &Plugin{}
	p.SetAPI(api)
	p.client = pluginapi.NewClient(api, nil)
	p.store = store.New(api)
	p.setConfiguration(&Configuration{TokenEncryptionKey: string(testEncKey)})

	_, err := p.accessTokenFor("absent-user")
	require.Error(t, err)
	assert.ErrorIs(t, err, store.ErrNotFound)
}
