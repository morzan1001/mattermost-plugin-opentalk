// Package opentalk wraps the OpenTalk-Controller REST API used by the
// Mattermost plugin. The package is stateless: callers pass per-request
// authentication (Bearer-Token for registered users, invite-code for guests).
package opentalk

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const defaultTimeout = 10 * time.Second

type Client struct {
	BaseURL string // e.g. "https://controller.opentalk.runforest.run"
	HTTP    *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: defaultTimeout},
	}
}

// APIError is returned for non-2xx responses from the OpenTalk-Controller.
type APIError struct {
	Status int
	Body   string
	URL    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("opentalk %s: HTTP %d body=%s", e.URL, e.Status, e.Body)
}

// doRequest performs an HTTP request against the OpenTalk-Controller. If
// `body` is non-nil it is JSON-encoded; if `out` is non-nil the response is
// JSON-decoded into it. Any non-2xx status returns an *APIError with the
// response body so the caller can inspect rate-limits, validation errors etc.
func (c *Client) doRequest(method, path, token string, body, out any) error {
	var reqBody io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(raw)
	}

	url := c.BaseURL + path
	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("opentalk request %s %s: %w", method, url, err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &APIError{Status: resp.StatusCode, Body: string(raw), URL: url}
	}
	if out == nil || len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("decode response: %w (body=%s)", err, string(raw))
	}
	return nil
}
