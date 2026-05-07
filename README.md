# OpenTalk for Mattermost

A Mattermost server plugin that deeply integrates the OpenTalk video-conferencing platform into the Mattermost web app. Audio, video, and screen sharing from channels and DMs — similar to `mattermost-plugin-calls` — but backed by OpenTalk's stack (Roomserver + LiveKit) instead of a custom WebRTC server.

## Features

- **Channel-header button** to start a meeting in any channel.
- **Floating widget** with mic, camera, screen-share, hand-raise, mini, and leave controls. Drag to reposition; resizes by content.
- **Expanded view** with three layouts: speaker (active speaker + filmstrip), grid (auto-fit), and screen-focus (when someone is sharing). Choice persists per user.
- **DM ringing** — incoming-call modal with ringtone, accept/decline, 30-second auto-decline. Switch-call prompt when already in another meeting.
- **Channel toast** — passive banner above the thread when a meeting is live in a public/private channel.
- **Mute-on-join** option, custom-status integration ("In OpenTalk-Meeting"), and respect for Do-Not-Disturb status (no rings, no pushes).
- **Mic/camera picker** in the Mattermost user settings panel.
- **Mobile push** notifications routed via `SubType=calls` so the Mattermost mobile app can render the call-flavoured ring UI.
- **Native screen picker** in the Mattermost desktop (Electron) app via the `desktopCapturer` IPC bridge.
- **German + English UI** — chosen automatically from the user's Mattermost locale.

## Architecture

- **Server (Go):** OAuth bridge against Keycloak, calls the OpenTalk Controller REST API on behalf of the user, posts custom posts with a `[Join]` button, sends push notifications for DM ringing, runs a heartbeat-driven reaper that ends orphaned meetings.
- **Webapp (TS + React):** Channel-header button, custom post renderer, floating widget, expanded view, incoming-call modal, signaling client, and LiveKit client for the in-Mattermost conference UI.
- **OpenTalk:** Room creation and auth via the Controller REST API, live signaling over Roomserver WebSocket, media over LiveKit.
- **Auth:** Per-user OIDC authorization-code flow against Keycloak (the same realm that OpenTalk uses).

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
| Standard flow | **on** (authorization-code flow for user login) |
| Direct access grants | off |
| Implicit flow | off |
| Service accounts roles | **on** _(optional, for bot-model fallback)_ |
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

### 4. (Optional) Refresh token lifetime

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
| `invalid_grant` + `Account is not fully set up` | Test user has pending required actions (e.g. Verify Email, Update Profile) | User details → clear _Required user actions_, set _Email verified_, fill in first/last/email |
| `invalid_grant` (no account message) | Wrong username or password | Check the user's credentials |
| `invalid_client` | Client authentication is `off` (public client) | Enable in Capability Config (step 2) |
| Browser redirect lands on Keycloak error page | Redirect URI mismatch | Check Login Settings exactly — no trailing slash |
| Plugin settings save fails with `OIDCAuthority must not be empty` | Issuer URL not entered | See plugin settings table above |
| Plugin cannot load OIDC discovery | Issuer URL has wrong subpath (`/auth/` missing or extra) | Use exactly the URL shown in Keycloak's Realm Settings as _Issuer_ |

### Production hardening

- **Restrict Web Origins** to the exact Mattermost URL — no wildcard `*`.

## Slash commands

| Command | What it does |
|---|---|
| `/opentalk connect` | Link the current Mattermost user to OpenTalk via OIDC. |
| `/opentalk disconnect` | Remove the link. |
| `/opentalk info` | Show the current connection status. |
| `/opentalk start` | Start a meeting in the current channel. |
| `/opentalk join` | Join the active meeting in the current channel. |
| `/opentalk end` | End the meeting (host only). |
| `/opentalk dial-in` | Show the SIP dial-in number and PIN for the active meeting. |
| `/opentalk ring on\|off` | Toggle the ringtone for incoming DM calls. |
| `/opentalk help` | Show the command list. |

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

Apache-2.0 for plugin code authored in this repository. Source files extracted from the OpenTalk web frontend retain their original EUPL-1.2 license; those files carry SPDX headers identifying them individually.
