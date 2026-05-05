package crypto

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef") // 32 bytes for AES-256
	plaintext := []byte("refresh-token-eyJhbGciOiJSUzI1NiIs...")

	ciphertext, err := Encrypt(key, plaintext)
	require.NoError(t, err)
	assert.NotEqual(t, plaintext, ciphertext)

	recovered, err := Decrypt(key, ciphertext)
	require.NoError(t, err)
	assert.Equal(t, plaintext, recovered)
}

func TestEncrypt_NondeterministicCiphertexts(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	plaintext := []byte("same plaintext")

	c1, err := Encrypt(key, plaintext)
	require.NoError(t, err)
	c2, err := Encrypt(key, plaintext)
	require.NoError(t, err)

	assert.NotEqual(t, c1, c2, "ciphertexts must differ due to fresh nonce")
}

func TestDecrypt_RejectsTamperedCiphertext(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	plaintext := []byte("hello")
	ciphertext, _ := Encrypt(key, plaintext)
	ciphertext[len(ciphertext)-1] ^= 0xff

	_, err := Decrypt(key, ciphertext)
	assert.Error(t, err)
}

func TestEncrypt_RejectsShortKey(t *testing.T) {
	_, err := Encrypt([]byte("short"), []byte("data"))
	assert.Error(t, err)
}
