# OpenTalk for Mattermost

A Mattermost server plugin that deeply integrates the OpenTalk video-conferencing platform into the Mattermost web app. Audio, video, and screen sharing from channels and DMs — similar to `mattermost-plugin-calls` — but backed by OpenTalk's stack (Roomserver + LiveKit) instead of a custom WebRTC server.

> **Status:** In progress. Core features are complete through phase 9d; testing and documentation (phases 10–11) are pending.

## Overview

The plugin bridges Mattermost and OpenTalk so that users never have to leave their messaging context to start or join a video call. A channel-header button, custom post renderer, floating widget, and incoming-call modal are all served from within Mattermost, while the actual media transport runs through OpenTalk's LiveKit backend.

## Architecture

- **Server (Go):** OAuth bridge against Keycloak, calls the OpenTalk Controller REST API on behalf of the user, posts custom posts with a `[Join]` button, sends push notifications for DM ringing.
- **Webapp (TS + React):** Channel-header button, custom post renderer, floating widget, expanded view, incoming-call modal, signaling client, and LiveKit client for the in-Mattermost conference UI.
- **OpenTalk:** Room creation and auth via the Controller REST API, live signaling over Roomserver WebSocket, media over LiveKit.
- **Auth:** Per-user OIDC authorization-code flow against Keycloak (the same realm that OpenTalk uses).

For full architecture diagrams and sequence flows, see the [design spec](../docs/superpowers/specs/2026-05-05-mattermost-opentalk-plugin-design.md).

## Spec & Plans

- Design spec: [`../docs/superpowers/specs/2026-05-05-mattermost-opentalk-plugin-design.md`](../docs/superpowers/specs/2026-05-05-mattermost-opentalk-plugin-design.md)
- Phase 0 – Spike plan: [`../docs/superpowers/plans/2026-05-05-mattermost-opentalk-phase0-spike.md`](../docs/superpowers/plans/2026-05-05-mattermost-opentalk-phase0-spike.md)

## Roadmap

| Phase | Content | Status |
|---|---|---|
| 0 | Spike: signaling extraction, EUPL license, lifecycle events, local test instance, smoke test | ✅ |
| 1 | Repo bootstrap: `plugin.json`, Makefile, CI, bot user | ✅ |
| 2 | Auth skeleton: OIDC authorization-code flow, token storage | ✅ |
| 3 | OpenTalk REST client (Go) | ✅ |
| 4 | Custom post + slash commands | ✅ |
| 5 | Port signaling library | ✅ |
| 6 | LiveKit integration | ✅ |
| 7 | Floating widget + expanded view | ✅ |
| 8 | DM ringing + push notifications + channel toast | ✅ |
| 9a | Meeting lifecycle: heartbeat + TTL reaper + resumption token reuse | ✅ |
| 9b | Hand raise (`raise_hands` signaling module + UI) | ✅ |
| 9c | Device pickers (mic/cam) + auto-mute on join | ✅ |
| 9d | Auto status (MM custom status during meeting) | ✅ |
| 10 | Testing (unit + E2E) | pending |
| 11 | Docs + release | pending |

## Build

Prerequisites:
- Go ≥ 1.25 (version pinned in `.go-version`; recommended: `goenv`)
- Node ≥ 24 (version pinned in `.nvmrc`; recommended: `nvm`)
- GNU Make

```bash
make dist
```

This produces `dist/com.github.morzan1001.mattermost-plugin-opentalk-<version>.tar.gz`. Upload it in the Mattermost System Console under **Plugin Management → Upload Plugin**.

## Keycloak setup

The plugin authenticates each Mattermost user via an **OIDC authorization-code flow** against the same Keycloak instance that OpenTalk uses. You need to create one **OIDC client** in the Keycloak realm of your OpenTalk deployment.

> **Permissions required:** Realm-admin access. If you don't have it, forward this section to your OpenTalk operator.

### What the client does

- Receives user browser redirects from the Mattermost plugin and issues OIDC auth codes.
- Exchanges auth codes for access/refresh tokens (authenticated with a client secret).
- Issues refresh tokens (via the `offline_access` scope) so the plugin can renew tokens without prompting the user again.

### 1. Log in to the Keycloak Admin Console

Open `https://accounts.<your-opentalk-domain>/auth/admin/`. Select the OpenTalk realm from the top-left dropdown (typically `opentalk`).

### 2. Create the client

Left nav: **Clients → Create client**.

**General Settings:**

| Field | Value |
|---|---|
| Client type | **OpenID Connect** |
| Client ID | `mattermost-plugin-opentalk` |
| Name | `Mattermost OpenTalk Plugin` |
| Always display in console | off |

**Capability Config:**

| Field | Value |
|---|---|
| Client authentication | **on** (confidential client with client secret) |
| Authorization | off |
| Standard flow | **on** ✓ (authorization-code flow for user login) |
| Direct access grants | **on** ✓ _(for smoke tests / curl scripts only — disable after phase 0)_ |
| Implicit flow | off |
| Service accounts roles | **on** ✓ _(optional, for a future bot-model fallback)_ |
| OAuth 2.0 Device Authorization Grant | off |
| OIDC CIBA Grant | off |

**Login Settings:**

Replace `MM_URL` with your Mattermost server URL (e.g. `http://localhost:8065` for local dev or `https://chat.example.com` for production):

| Field | Value |
|---|---|
| Root URL | `MM_URL` |
| Home URL | `MM_URL` |
| Valid redirect URIs | `MM_URL/plugins/com.github.morzan1001.mattermost-plugin-opentalk/oauth/callback` |
| Valid post logout redirect URIs | `MM_URL/*` |
| Web origins | `MM_URL` |

Save.

### 3. Copy the client secret

Go to the **Credentials** tab and copy the **Client secret**. You will enter this value in the Mattermost System Console plugin settings (field: _OIDC Client Secret_).

### 4. (Optional) Create a test user

Only needed if you want to run smoke tests with direct-access grants. In production the plugin uses the browser-based OAuth flow, so no password-grant user is required.

Left nav: **Users → Add user**.
- Username: e.g. `testuser`
- Email: any address, **Email verified: on**
- First / Last name: fill in
- Save.
- Tab **Credentials → Set password** → set a value, **Temporary: off**, Save.

### 5. (Optional) Refresh token lifetime

If your realm enforces strict token lifetimes, check **Realm settings → Tokens** and ensure _SSO Session Idle_ and _Offline Session Idle_ are long enough that refresh tokens do not expire after 30 minutes. The default is usually fine.

### Plugin settings

After creating the client, enter the following in the Mattermost System Console (**System Console → Plugins → OpenTalk**):

| Plugin setting | Value |
|---|---|
| OpenTalk Controller URL | URL of your OpenTalk Controller, e.g. `https://controller.opentalk.example` |
| OpenTalk Frontend URL | URL of the OpenTalk frontend, e.g. `https://opentalk.example` |
| OIDC Authority | Issuer URL, e.g. `https://accounts.opentalk.example/auth/realms/opentalk` |
| OIDC Client ID | `mattermost-plugin-opentalk` |
| OIDC Client Secret | _Value from step 3_ |
| OIDC Scopes | `openid email profile offline_access` (default is fine) |

Activate the plugin. An OpenTalk button should appear in the channel header; the first click starts the OAuth flow.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `unauthorized_client` during smoke test | Direct access grants not enabled | Enable in Capability Config (step 2) |
| `invalid_grant` + `Account is not fully set up` | Test user has pending required actions (e.g. Verify Email, Update Profile) | User details → clear _Required user actions_, set _Email verified_, fill in first/last/email. If required actions keep coming back: Realm Settings → Authentication → _Required actions_ → disable the unwanted ones as _Default action_ |
| `invalid_grant` (no account message) | Wrong username or password | Check `online-instance.env` |
| `invalid_client` | Client authentication is `off` (public client) | Enable in Capability Config (step 2) |
| Browser redirect lands on Keycloak error page | Redirect URI mismatch | Check Login Settings exactly — no trailing slash |
| Plugin settings save fails with "OIDCAuthority must not be empty" | Issuer URL not entered | See plugin settings table above |
| Plugin cannot load OIDC discovery | Issuer URL has wrong subpath (`/auth/` missing or extra) | Use exactly the URL shown in Keycloak's Realm Settings as _Issuer_ |

### Production hardening (after phase 0)

- **Disable Direct access grants** once smoke tests are no longer needed. The plugin itself only uses the authorization-code flow.
- **Disable Service accounts roles** if the hybrid bot model is not used.
- **Restrict Web Origins** to the exact Mattermost URL — no wildcard `*`.

## Development

```bash
make deploy
```

Deploys directly to a local Mattermost dev server (endpoint configured via `MM_SERVICESETTINGS_SITEURL` + admin token).

```bash
make test       # go test + jest
make lint       # golangci-lint + eslint
make watch      # webapp in watch mode
```

## License

Apache-2.0. If code extracted from the OpenTalk frontend (EUPL-1.2) is incorporated in phase 5, the affected files will be individually marked as EUPL-1.2 (REUSE-toml-compliant) — see section 8 of the design spec.
