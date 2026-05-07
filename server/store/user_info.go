package store

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/crypto"
)

type UserInfo struct {
	MattermostUserID string    `json:"mm_user_id"`
	OpenTalkSub      string    `json:"sub,omitempty"`
	OpenTalkEmail    string    `json:"email,omitempty"`
	AccessToken      string    `json:"access_token"`
	RefreshToken     string    `json:"refresh_token"`
	AccessExpiry     time.Time `json:"access_expiry"`
	ConnectedAt      time.Time `json:"connected_at"`
}

func userInfoKey(mmUserID string) string {
	return hashKey("user_info_", mmUserID)
}

func (s *Store) SaveUserInfo(encKey []byte, info *UserInfo) error {
	raw, err := json.Marshal(info)
	if err != nil {
		return fmt.Errorf("marshal UserInfo: %w", err)
	}
	encrypted, err := crypto.Encrypt(encKey, raw)
	if err != nil {
		return fmt.Errorf("encrypt UserInfo: %w", err)
	}
	return s.Set(userInfoKey(info.MattermostUserID), encrypted, 0)
}

func (s *Store) LoadUserInfo(encKey []byte, mmUserID string) (*UserInfo, error) {
	encrypted, err := s.Get(userInfoKey(mmUserID))
	if err != nil {
		return nil, err
	}
	raw, err := crypto.Decrypt(encKey, encrypted)
	if err != nil {
		return nil, fmt.Errorf("decrypt UserInfo: %w", err)
	}
	var info UserInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		return nil, fmt.Errorf("unmarshal UserInfo: %w", err)
	}
	return &info, nil
}

func (s *Store) DeleteUserInfo(mmUserID string) error {
	return s.Delete(userInfoKey(mmUserID))
}
