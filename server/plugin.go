package main

import (
	"fmt"
	"sync"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/pluginapi"
)

const botUsername = "opentalk-bot"
const botDisplayName = "OpenTalk Bot"
const botDescription = "Posts about OpenTalk meetings created from Mattermost."

type Plugin struct {
	plugin.MattermostPlugin

	client *pluginapi.Client

	configurationLock sync.RWMutex
	configuration     *Configuration

	botUserID string
}

func (p *Plugin) OnActivate() error {
	p.client = pluginapi.NewClient(p.API, p.Driver)

	botID, appErr := p.API.EnsureBotUser(&model.Bot{
		Username:    botUsername,
		DisplayName: botDisplayName,
		Description: botDescription,
	})
	if appErr != nil {
		return fmt.Errorf("failed to ensure bot user: %w", appErr)
	}
	p.botUserID = botID

	return nil
}

func (p *Plugin) OnDeactivate() error {
	return nil
}
