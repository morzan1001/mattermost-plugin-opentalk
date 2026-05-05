package opentalk

import (
	"fmt"
	"net/http"
)

// GetSIPInfo calls GET /v1/rooms/{id}/sip. Returns *APIError with 404 if the
// room was created without enable_sip:true.
func (c *Client) GetSIPInfo(token, roomID string) (*SIPInfo, error) {
	var info SIPInfo
	path := fmt.Sprintf("/v1/rooms/%s/sip", roomID)
	if err := c.doRequest(http.MethodGet, path, token, nil, &info); err != nil {
		return nil, err
	}
	return &info, nil
}
