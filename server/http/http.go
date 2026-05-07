// Package http hosts the gorilla/mux router and HTTP-Handler implementations
// for the plugin's ServeHTTP entry point.
package http

import (
	nethttp "net/http"

	"github.com/gorilla/mux"
)

// NewRouter wires the plugin's HTTP handlers into a gorilla/mux router. The
// caller is responsible for serving the router from the plugin's ServeHTTP hook.
func NewRouter(handlers *Handlers) *mux.Router {
	r := mux.NewRouter()
	r.HandleFunc("/oauth/start", handlers.OAuthStart).Methods(nethttp.MethodGet)
	r.HandleFunc("/oauth/callback", handlers.OAuthCallback).Methods(nethttp.MethodGet)
	r.HandleFunc("/api/v1/me", handlers.Me).Methods(nethttp.MethodGet)
	r.HandleFunc("/api/v1/meetings", handlers.MeetingsCreate).Methods(nethttp.MethodPost)
	r.HandleFunc("/api/v1/meetings/{room_id}/join", handlers.MeetingsJoin).Methods(nethttp.MethodPost)
	r.HandleFunc("/api/v1/meetings/end", handlers.MeetingsEnd).Methods(nethttp.MethodPost)
	r.HandleFunc("/api/v1/meetings/dismiss", handlers.MeetingsDismiss).Methods(nethttp.MethodPost)
	r.HandleFunc("/api/v1/meetings/heartbeat", handlers.MeetingsHeartbeat).Methods(nethttp.MethodPost)
	return r
}
