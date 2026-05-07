# Mattermost OpenTalk Plugin

Plugin für Mattermost-Server, das die OpenTalk-Videokonferenz-Plattform tief in die Mattermost-Webapp integriert. Audio/Video/Screenshare aus Channels und DMs heraus, ähnlich wie `mattermost-plugin-calls` – aber mit OpenTalks Stack (Roomserver + LiveKit) als Backend statt eigenem WebRTC-Server.

> **Status:** In Vorbereitung. Aktuell ist nur diese Repo-Struktur angelegt – noch kein Code.

## Architektur (Kurzfassung)

- **Server (Go):** OAuth-Bridge gegen Keycloak, ruft OpenTalk-Controller-REST-API in Namen des Users auf, postet Custom-Posts mit `[Join]`-Button, sendet Push-Notifications für DM-Ringing.
- **Webapp (TS+React):** Channel-Header-Button, Custom-Post-Renderer, Floating-Widget, Expanded-View, Incoming-Call-Modal, eigener Signaling-Client + LiveKit-Client für In-MM-Konferenz-UI.
- **OpenTalk:** Räume und Auth über Controller-REST, Live-Signaling über Roomserver-WS, Media über LiveKit.
- **Auth:** Per-User-OIDC-Code-Flow gegen Keycloak (denselben Realm wie OpenTalk).

Vollständige Architektur und Sequenzen: siehe Design-Spec.

## Spec & Pläne

- Design-Spec: [`../docs/superpowers/specs/2026-05-05-mattermost-opentalk-plugin-design.md`](../docs/superpowers/specs/2026-05-05-mattermost-opentalk-plugin-design.md)
- Phase 0 – Spike-Plan: [`../docs/superpowers/plans/2026-05-05-mattermost-opentalk-phase0-spike.md`](../docs/superpowers/plans/2026-05-05-mattermost-opentalk-phase0-spike.md)

## Roadmap

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Spike: Signaling-Extraktion, EUPL-Lizenz, Lifecycle-Events, lokale Test-Instanz, Smoke-Test | ✅ |
| 1 | Repo-Bootstrap: `plugin.json`, Makefile, CI, Bot-User | ✅ |
| 2 | Auth-Skeleton: OIDC-Code-Flow, Token-Storage | ✅ |
| 3 | OpenTalk-REST-Client (Go) | ✅ |
| 4 | Custom-Post + Slash-Commands | ✅ |
| 5 | Signaling-Lib portieren | ✅ |
| 6 | LiveKit-Integration | ✅ |
| 7 | Floating-Widget + Expanded-View | ✅ |
| 8 | DM-Ringing + Push-Notifications + Channel-Toast | ✅ |
| 9a | Meeting-Lifecycle: Heartbeat + TTL-Reaper + Resumption-Token-Reuse | ✅ |
| 9b | Hand-Raise (raise_hands signaling-module + UI) | offen |
| 9c | Device-Pickers (Mic/Cam/Speaker) + Auto-Mute-on-Join | offen |
| 9d | Slack-Polish: Auto-Status, Pre-Join-Device-Check | offen |
| 10 | Testing (Unit + E2E) | wartet |
| 11 | Doku + Release | wartet |

## Voraussetzungen (für späteren Build)

- Go (Version aus `.go-version` sobald Phase 1 abgeschlossen)
- Node.js (Version aus `.nvmrc`)
- Mattermost-Server ≥ 9.0 zum Testen
- Erreichbare OpenTalk-Instanz (Controller, Roomserver, LiveKit)
- Keycloak mit konfiguriertem OIDC-Client `mattermost-plugin-opentalk` — siehe **[KEYCLOAK_SETUP.md](./KEYCLOAK_SETUP.md)** für die Schritt-für-Schritt-Anleitung (Client anlegen, Redirect-URIs, Client-Secret, optional Test-User)

## Build

Vorbedingungen:
- Go ≥ 1.25 (Version aus `.go-version`, empfohlen: `goenv`)
- Node ≥ 24 (Version aus `.nvmrc`, empfohlen: `nvm`)
- GNU Make

```bash
make dist
```
produziert `dist/de.opentalk.mattermost-plugin-<version>.tar.gz`. Hochladen in der Mattermost-System-Console unter "Plugin Management" → "Upload Plugin".

## Entwicklung

```bash
make deploy
```
deployt direkt auf einen lokalen Mattermost-Dev-Server (Endpoint via `MM_SERVICESETTINGS_SITEURL` + Admin-Token).

```bash
make test       # go test + jest
make lint       # golangci-lint + eslint
make watch      # webapp im watch-Mode
```

## Lizenz

Apache-2.0. Falls in Phase 5 Code aus dem OpenTalk-Frontend (EUPL-1.2) extrahiert wird, werden betroffene Files separat als EUPL markiert (REUSE-toml-konform) – siehe Spec-Sektion 8.
