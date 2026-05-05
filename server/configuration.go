package main

import (
	"errors"
	"fmt"
	"reflect"
)

type Configuration struct {
	OpenTalkControllerURL string
	OpenTalkFrontendURL   string
	OpenTalkRoomserverURL string
	LiveKitURL            string

	OIDCAuthority    string
	OIDCClientID     string
	OIDCClientSecret string
	OIDCScopes       string

	TokenEncryptionKey string

	DefaultEnableSIP      bool
	DefaultWaitingRoom    bool
	EnableRinging         bool
	InviteExpirationHours int
}

func (c *Configuration) Clone() *Configuration {
	cloned := *c
	return &cloned
}

func (c *Configuration) IsValid() error {
	if c.OpenTalkControllerURL == "" {
		return errors.New("OpenTalkControllerURL must not be empty")
	}
	if c.OpenTalkFrontendURL == "" {
		return errors.New("OpenTalkFrontendURL must not be empty")
	}
	if c.OpenTalkRoomserverURL == "" {
		return errors.New("OpenTalkRoomserverURL must not be empty")
	}
	if c.OIDCAuthority == "" {
		return errors.New("OIDCAuthority must not be empty")
	}
	if c.OIDCClientID == "" {
		return errors.New("OIDCClientID must not be empty")
	}
	if c.OIDCClientSecret == "" {
		return errors.New("OIDCClientSecret must not be empty")
	}
	if c.InviteExpirationHours < 1 {
		return fmt.Errorf("InviteExpirationHours must be >= 1, got %d", c.InviteExpirationHours)
	}
	return nil
}

func (p *Plugin) getConfiguration() *Configuration {
	p.configurationLock.RLock()
	defer p.configurationLock.RUnlock()
	if p.configuration == nil {
		return &Configuration{}
	}
	return p.configuration
}

func (p *Plugin) setConfiguration(configuration *Configuration) {
	p.configurationLock.Lock()
	defer p.configurationLock.Unlock()
	if configuration != nil && p.configuration == configuration {
		if reflect.ValueOf(*configuration).NumField() == 0 {
			return
		}
		panic("setConfiguration called with the existing configuration")
	}
	p.configuration = configuration
}

func (p *Plugin) OnConfigurationChange() error {
	var configuration = new(Configuration)

	if err := p.API.LoadPluginConfiguration(configuration); err != nil {
		return fmt.Errorf("failed to load plugin configuration: %w", err)
	}

	if err := configuration.IsValid(); err != nil {
		return fmt.Errorf("invalid plugin configuration: %w", err)
	}

	p.setConfiguration(configuration)
	return nil
}
