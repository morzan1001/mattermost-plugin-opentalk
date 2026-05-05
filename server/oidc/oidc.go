package oidc

import (
	"context"
	"fmt"

	coreos "github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type Config struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	RedirectURL  string
	Scopes       []string
}

type Client struct {
	cfg      Config
	provider *coreos.Provider
	oauth    *oauth2.Config
}

type UserInfo struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

func NewClient(ctx context.Context, cfg Config) (*Client, error) {
	provider, err := coreos.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		return nil, fmt.Errorf("oidc discovery: %w", err)
	}
	return &Client{
		cfg:      cfg,
		provider: provider,
		oauth: &oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			RedirectURL:  cfg.RedirectURL,
			Endpoint:     provider.Endpoint(),
			Scopes:       cfg.Scopes,
		},
	}, nil
}

func (c *Client) AuthCodeURL(state string) string {
	return c.oauth.AuthCodeURL(state)
}

func (c *Client) Exchange(ctx context.Context, code string) (*oauth2.Token, *UserInfo, error) {
	tok, err := c.oauth.Exchange(ctx, code)
	if err != nil {
		return nil, nil, fmt.Errorf("oauth code exchange: %w", err)
	}
	info, err := c.fetchUserInfo(ctx, tok)
	if err != nil {
		return tok, nil, err
	}
	return tok, info, nil
}

func (c *Client) Refresh(ctx context.Context, refreshToken string) (*oauth2.Token, error) {
	src := c.oauth.TokenSource(ctx, &oauth2.Token{RefreshToken: refreshToken})
	return src.Token()
}

func (c *Client) fetchUserInfo(ctx context.Context, tok *oauth2.Token) (*UserInfo, error) {
	raw, err := c.provider.UserInfo(ctx, oauth2.StaticTokenSource(tok))
	if err != nil {
		return nil, fmt.Errorf("userinfo: %w", err)
	}
	var info UserInfo
	if err := raw.Claims(&info); err != nil {
		return nil, fmt.Errorf("userinfo claims: %w", err)
	}
	return &info, nil
}
