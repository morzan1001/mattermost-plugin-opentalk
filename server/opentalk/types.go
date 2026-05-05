package opentalk

import "time"

// Room represents the OpenTalk-Controller's room resource as returned by
// GET/POST /v1/rooms. Note: the API returns "id", not "room_id".
type Room struct {
	ID          string    `json:"id"`
	CreatedBy   User      `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	Password    *string   `json:"password,omitempty"`
	WaitingRoom bool      `json:"waiting_room"`
	GuestAccess string    `json:"guest_access,omitempty"`
}

type User struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	Title       string `json:"title,omitempty"`
	FirstName   string `json:"firstname"`
	LastName    string `json:"lastname"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url,omitempty"`
}

// CreateRoomRequest mirrors PostRoomsRequestBody from the controller's
// OpenAPI. All fields are optional.
type CreateRoomRequest struct {
	EnableSIP     bool    `json:"enable_sip"`
	WaitingRoom   bool    `json:"waiting_room"`
	E2EEncryption bool    `json:"e2e_encryption"`
	Password      *string `json:"password,omitempty"`
}

// Invite is returned by POST /v1/rooms/{id}/invites.
type Invite struct {
	InviteCode string     `json:"invite_code"`
	RoomID     string     `json:"room_id"`
	Active     bool       `json:"active"`
	CreatedAt  time.Time  `json:"created"`
	UpdatedAt  time.Time  `json:"updated"`
	Expiration *time.Time `json:"expiration,omitempty"`
}

type CreateInviteRequest struct {
	Expiration *time.Time `json:"expiration,omitempty"`
}

// StartRequest is the body for POST /v1/rooms/{id}/start (registered users).
type StartRequest struct {
	DeviceSecret string `json:"device_secret"`
	DisplayName  string `json:"display_name,omitempty"`
	Resumption   string `json:"resumption,omitempty"`
}

// StartInvitedRequest is the body for POST /v1/rooms/{id}/start_invited.
type StartInvitedRequest struct {
	InviteCode   string `json:"invite_code"`
	DeviceSecret string `json:"device_secret"`
	DisplayName  string `json:"display_name"`
	Password     string `json:"password,omitempty"`
	Resumption   string `json:"resumption,omitempty"`
}

// StartResponse is the shared response shape for both start endpoints.
// Notable: the live runforest instance returns {ticket, resumption} - the
// older OpenAPI's {token, roomserver_address} shape is not used. The webapp
// builds the WS-URL itself by combining a configured roomserver-base-URL with
// the ticket.
type StartResponse struct {
	Ticket     string `json:"ticket"`
	Resumption string `json:"resumption"`
}

// SIPInfo is returned by GET /v1/rooms/{id}/sip when the room has SIP enabled.
type SIPInfo struct {
	ID       string `json:"id"`
	Password string `json:"password"`
	Lobby    bool   `json:"lobby"`
}
