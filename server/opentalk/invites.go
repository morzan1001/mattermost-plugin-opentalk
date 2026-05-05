package opentalk

import (
	"fmt"
	"net/http"
)

// CreateInvite calls POST /v1/rooms/{id}/invites.
func (c *Client) CreateInvite(token, roomID string, req CreateInviteRequest) (*Invite, error) {
	var invite Invite
	path := fmt.Sprintf("/v1/rooms/%s/invites", roomID)
	if err := c.doRequest(http.MethodPost, path, token, req, &invite); err != nil {
		return nil, err
	}
	return &invite, nil
}
