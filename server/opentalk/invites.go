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

// DeleteInvite revokes a previously-created invite. Callers should treat 404
// (already gone) as success and log other failures without aborting the
// local end-flow.
func (c *Client) DeleteInvite(token, roomID, inviteCode string) error {
	path := fmt.Sprintf("/v1/rooms/%s/invites/%s", roomID, inviteCode)
	return c.doRequest(http.MethodDelete, path, token, nil, nil)
}
