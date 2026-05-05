package main

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest/mock"
	"github.com/stretchr/testify/assert"
)

func TestPlugin_OnActivate(t *testing.T) {
	t.Run("ensures opentalk-bot user", func(t *testing.T) {
		api := &plugintest.API{}
		api.On("EnsureBotUser", mock.MatchedBy(func(b *model.Bot) bool {
			return b.Username == botUsername && b.DisplayName == botDisplayName
		})).Return("bot-user-id", nil)

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
