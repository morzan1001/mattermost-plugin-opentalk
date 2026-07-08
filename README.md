# OpenTalk for Mattermost

A Mattermost server plugin that deeply integrates the OpenTalk video-conferencing platform into the Mattermost web app. Audio, video, and screen sharing from channels and DMs — similar to `mattermost-plugin-calls` — but backed by OpenTalk's stack (Roomserver + LiveKit) instead of a custom WebRTC server.

## Features

- Start a meeting from any channel via header button or `/opentalk start`. Floating widget with mic, camera, screen-share, hand-raise, mini, and leave controls — drag to reposition, resizes to its natural content width.
- Expanded view with three layouts (speaker, grid, screen-focus); choice persists per user.
- DM ringing — incoming-call modal with ringtone, 30-second auto-decline; switch-call prompt when already in a meeting; push notification per recipient (DND respected).
- Mobile handoff — meeting posts carry a Slack-style card with a `[Join]` markdown link, dial-in info, and End / Decline action buttons. Mattermost mobile users tap to open the OpenTalk web client in the system browser.
- Native screen-share in Mattermost Desktop via the platform's `desktopAPI.getDesktopSources()` IPC; standard `getDisplayMedia()` in browsers.
- End-for-all kicks remaining participants (moderation `debrief`) and revokes the OpenTalk invite.
- Channel toast above the thread when a meeting is live in a public/private channel.
- User settings: ringtone toggle, mute-on-join, mic and camera pickers.
- Custom status "In OpenTalk-Meeting" while connected.
- German + English UI, auto-selected from the user's Mattermost locale.

## Architecture

- **Server (Go):** OIDC bridge against the identity provider OpenTalk uses, calls the OpenTalk Controller REST API on behalf of the user, posts custom posts with a join link and action buttons, sends push notifications for DM ringing, runs a reaper that ends orphaned meetings (kept alive by a heartbeat from any connected web participant, 30-minute grace before the first heartbeat for mobile-only hosts).
- **Webapp (TS + React):** Channel-header button, custom post renderer, floating widget, expanded view, incoming-call modal, signaling client, and LiveKit client for the in-Mattermost conference UI.
- **OpenTalk:** Room creation and auth via the Controller REST API, live signaling over Roomserver WebSocket, media over LiveKit.
- **Auth:** Per-user OIDC authorization-code flow (with PKCE) against the same identity provider OpenTalk uses — Keycloak, Authentik, or any OIDC IdP. Works with confidential clients (client secret) and public clients (PKCE, no secret).

## Build

Prerequisites:
- Go ≥ 1.26 (version pinned in `.go-version`; recommended: `goenv`)
- Node ≥ 24 (version pinned in `.nvmrc`; recommended: `nvm`)
- GNU Make

```bash
make dist
```

This produces `dist/com.github.morzan1001.mattermost-plugin-opentalk-<version>.tar.gz`. Upload it in the Mattermost System Console under **Plugin Management → Upload Plugin**.

## Keycloak setup

The plugin authenticates each Mattermost user via an **OIDC authorization-code flow (with PKCE)** against the same Keycloak instance that OpenTalk uses. You need to create one **OIDC client** in the Keycloak realm of your OpenTalk deployment.

> **Permissions required:** Realm-admin access. If you don't have it, forward this section to your OpenTalk operator.

> **Other OIDC providers (e.g. Authentik):** the concept is identical — register a client/application with the redirect URI below and use its **issuer URL** as _OIDC Authority_. A **public client** needs no secret: leave _OIDC Client Secret_ empty; the plugin authenticates via PKCE. On Authentik, whose issuer is derived per application slug, the plugin can reuse the existing `opentalk` frontend client by adding the plugin's redirect URI to it, so tokens carry the issuer the OpenTalk controller trusts. Set _OIDC Authority_ to the exact issuer including any trailing slash.

### What the client does

- Receives user browser redirects from the Mattermost plugin and issues OIDC auth codes.
- Exchanges auth codes for access/refresh tokens (authenticated with a client secret, or via PKCE for public clients with no secret).
- Issues refresh tokens (via the `offline_access` scope) so the plugin can renew tokens without prompting the user again.

### 1. Log in to the Keycloak Admin Console

Open `https://accounts.<your-opentalk-domain>/auth/admin/`. Select the OpenTalk realm from the top-left dropdown (typically `opentalk`).

### 2. Create the client

Left nav: **Clients → Create client**.

**General Settings:** Client type **OpenID Connect**, Client ID `mattermost-plugin-opentalk`, Name `Mattermost OpenTalk Plugin`.

**Capability Config:** Enable **Standard flow** (authorization-code flow). For a confidential client, also enable **Client authentication** (client secret). For a public client, leave **Client authentication** off — the plugin uses PKCE and you leave _OIDC Client Secret_ empty below. Leave the rest off.

**Login Settings:**

Replace `MM_URL` with your Mattermost server URL (e.g. `http://localhost:8065` for local dev or `https://chat.example.com` for production):

| Field | Value |
|---|---|
| Root URL | `MM_URL` |
| Home URL | `MM_URL` |
| Valid redirect URIs | `MM_URL/plugins/com.github.morzan1001.mattermost-plugin-opentalk/oauth/callback` |
| Valid post logout redirect URIs | `MM_URL/*` |
| Web origins | `MM_URL` (the exact Mattermost URL — no wildcard `*`) |

Save.

### 3. Copy the client secret

Go to the **Credentials** tab and copy the **Client secret**. You will enter this value in the Mattermost System Console plugin settings (field: _OIDC Client Secret_). Skip this step for a public client — leave _OIDC Client Secret_ empty and the plugin uses PKCE.

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
| OIDC Client Secret | _Value from step 3 — leave empty for a public (PKCE) client_ |
| OIDC Scopes | `openid email profile offline_access` (default is fine) |

Activate the plugin. An OpenTalk button should appear in the channel header; the first click starts the OAuth flow.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `unauthorized_client` during smoke test | Direct access grants not enabled | Enable in Capability Config (step 2) |
| `invalid_grant` + `Account is not fully set up` | Test user has pending required actions (e.g. Verify Email, Update Profile) | User details → clear _Required user actions_, set _Email verified_, fill in first/last/email |
| `invalid_grant` (no account message) | Wrong username or password | Check the user's credentials |
| `invalid_client` | Client type and secret don't match: confidential client with a wrong/empty secret, or a public client with a secret entered | Confidential → set the correct _OIDC Client Secret_; public → leave it empty (PKCE) |
| Browser redirect lands on Keycloak error page | Redirect URI mismatch | Check Login Settings exactly — no trailing slash |
| Plugin settings save fails with `OIDCAuthority must not be empty` | Issuer URL not entered | See plugin settings table above |
| Plugin cannot load OIDC discovery | Issuer URL has wrong subpath (`/auth/` missing or extra) | Use exactly the URL shown in Keycloak's Realm Settings as _Issuer_ |

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

The webapp suite covers components, store slices, conference signaling, and the LiveKit wrapper; the server suite covers slash-command handlers, the OIDC flow, the OpenTalk client, the post helpers, the reaper, and the store.

## Credits

The incoming-call ringtone is ["Digital Phone Ring" by Perkin](https://freesound.org/people/Perkin/sounds/178377/), released under CC0 1.0.

## License

Three licenses apply, identified per file via SPDX headers; full texts are in [`LICENSES/`](LICENSES/):

- **Apache-2.0** — plugin code authored in this repository (default).
- **EUPL-1.2** — files under `webapp/src/conference/signaling/` ported from the OpenTalk web frontend; each carries an SPDX header crediting OpenTalk GmbH.
- **CC0-1.0** — `webapp/src/sounds/incoming_call.ogg`, declared via the adjacent `.license` sidecar.

The top-level [`LICENSE`](LICENSE) file (Apache-2.0) is preserved at the root so GitHub auto-detection works.
