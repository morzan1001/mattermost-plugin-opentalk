package opentalk

import (
	"fmt"
	"net/http"
)

// CreateRoom calls POST /v1/rooms.
func (c *Client) CreateRoom(token string, req CreateRoomRequest) (*Room, error) {
	var room Room
	if err := c.doRequest(http.MethodPost, "/v1/rooms", token, req, &room); err != nil {
		return nil, err
	}
	return &room, nil
}

// StartRoom calls POST /v1/rooms/{id}/start (registered users; needs Bearer).
func (c *Client) StartRoom(token, roomID string, req StartRequest) (*StartResponse, error) {
	var out StartResponse
	path := fmt.Sprintf("/v1/rooms/%s/start", roomID)
	if err := c.doRequest(http.MethodPost, path, token, req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// StartInvited calls POST /v1/rooms/{id}/start_invited (guest path; no Bearer).
func (c *Client) StartInvited(roomID string, req StartInvitedRequest) (*StartResponse, error) {
	var out StartResponse
	path := fmt.Sprintf("/v1/rooms/%s/start_invited", roomID)
	if err := c.doRequest(http.MethodPost, path, "", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
