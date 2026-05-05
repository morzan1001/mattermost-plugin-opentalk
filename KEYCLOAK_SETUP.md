# Keycloak-Client für das Mattermost-OpenTalk-Plugin

Das Plugin authentifiziert Mattermost-User per **OIDC-Auth-Code-Flow** gegen denselben Keycloak, den OpenTalk benutzt. Damit der Flow funktioniert, brauchst du einen **OIDC-Client** im Keycloak-Realm der OpenTalk-Instanz.

> **Berechtigungen:** Du brauchst Realm-Admin-Rechte. Falls du die nicht hast, schicke diese Anleitung an euren OpenTalk-Operator.

## Was der Client tut

- Empfängt User-Browser-Redirects vom Mattermost-Plugin und gibt OIDC-Auth-Codes raus.
- Tauscht Auth-Codes gegen Access-/Refresh-Tokens (per Client-Secret authentifiziert).
- Gibt Refresh-Tokens raus (für `offline_access`-Scope), damit das Plugin Tokens erneuern kann ohne den User neu zu fragen.

## Schritt für Schritt

### 1. Login in der Keycloak-Admin-Konsole

Browser auf `https://accounts.<deine-opentalk-domain>/auth/admin/`. Realm der OpenTalk-Instanz im Top-Left-Dropdown wählen (häufig `opentalk`).

### 2. Client anlegen

Linke Nav: **Clients** → **Create client**.

**General Settings:**
| Feld | Wert |
|---|---|
| Client type | **OpenID Connect** |
| Client ID | `mattermost-plugin-opentalk` |
| Name | `Mattermost OpenTalk Plugin` |
| Always display in console | off |

**Capability Config:**
| Feld | Wert |
|---|---|
| Client authentication | **on** (= confidential, mit Client-Secret) |
| Authorization | off |
| Standard flow | **on** ✓ (Auth-Code-Flow für den User-Login) |
| Direct access grants | **on** ✓ _(nur für Smoke-Tests/curl-Skripte; nach Phase 0 darfst du das ausschalten)_ |
| Implicit flow | off |
| Service accounts roles | **on** ✓ _(optional, für späteres Bot-Modell als Fallback)_ |
| OAuth 2.0 Device Authorization Grant | off |
| OIDC CIBA Grant | off |

**Login Settings:**

Setze die folgenden vier Felder. Ersetze `MM_URL` durch die URL deines Mattermost-Servers (z.B. `http://localhost:8065` für lokales Dev oder `https://chat.example.com` für Production):

| Feld | Wert |
|---|---|
| Root URL | `MM_URL` |
| Home URL | `MM_URL` |
| Valid redirect URIs | `MM_URL/plugins/de.opentalk.mattermost-plugin/oauth/callback` |
| Valid post logout redirect URIs | `MM_URL/*` |
| Web origins | `MM_URL` |

Save.

### 3. Client-Secret kopieren

Tab **Credentials** → **Client secret** kopieren. Du brauchst den Wert später für die Plugin-Settings in der Mattermost-System-Console (Feld _OIDC Client Secret_).

### 4. (optional) Test-User anlegen

Nur nötig, wenn du die Smoke-Tests aus dem Spike fahren willst. In Production nutzt das Plugin den OAuth-Code-Flow im Browser, da brauchst du keinen Test-User mit Password-Grant.

Linke Nav: **Users** → **Add user**.
- Username: z.B. `testuser`
- Email: irgendetwas, **Email verified: on**
- First/Last Name: ausfüllen
- Save.
- Tab **Credentials** → **Set password** → Wert setzen, **Temporary: off**, Save.

### 5. (optional) Refresh-Token-Lebensdauer

Wenn dein Realm strikte Token-Lifetimes hat: in **Realm settings → Tokens** prüfen, dass _SSO Session Idle_ und _Offline Session Idle_ groß genug sind, damit Refresh-Tokens nicht alle 30 min auslaufen. Default ist meist OK.

## Was das Plugin damit konfiguriert

Nach dem Anlegen trägst du in der Mattermost-System-Console (System Console → Plugins → OpenTalk) ein:

| Plugin-Setting | Wert |
|---|---|
| OpenTalk Controller URL | URL deines OpenTalk-Controllers, z.B. `https://controller.opentalk.example` |
| OpenTalk Frontend URL | URL des OpenTalk-Frontends, z.B. `https://opentalk.example` |
| OIDC Authority | Issuer-URL, z.B. `https://accounts.opentalk.example/auth/realms/opentalk` |
| OIDC Client ID | `mattermost-plugin-opentalk` |
| OIDC Client Secret | _Wert aus Schritt 3_ |
| OIDC Scopes | `openid email profile offline_access` (Default ist OK) |

Activate. Im Channel-Header sollte ein OpenTalk-Button erscheinen, der beim ersten Klick den OAuth-Flow startet.

## Typische Fehler

| Symptom | Ursache | Fix |
|---|---|---|
| `unauthorized_client` beim Smoke-Test | Direct access grants nicht aktiviert | Capability Config (Schritt 2) |
| `invalid_grant` + `Account is not fully set up` | Test-User hat offene "Required Actions" (z.B. Verify Email, Update Profile, Update Password) | User-Details → _Required user actions_ leeren, _Email verified_ einschalten, First/Last/Email setzen. Wenn Required Actions automatisch zurückkommen: Realm Settings → Authentication → _Required actions_ → die unerwünschten als _Default Action_ ausschalten |
| `invalid_grant` (ohne den Account-Hinweis) | Username oder Password falsch | `online-instance.env` prüfen |
| `invalid_client` | Client Authentication ist `off` (Client ist public) | Capability Config (Schritt 2) |
| Browser-Redirect endet auf Keycloak-Fehlerseite | Redirect-URI passt nicht | Login Settings exakt prüfen, kein Trailing Slash |
| Plugin-Settings-Save scheitert mit "OIDCAuthority must not be empty" | Issuer-URL nicht eingetragen | siehe Tabelle oben |
| Plugin lädt OIDC-Discovery nicht | Issuer-URL hat falschen Subpfad (`/auth/` fehlt oder ist überflüssig) | exakt das nehmen, was Keycloak im Realm-Settings als _Issuer_ anzeigt |

## Production-Hardening (nach Phase 0)

- **Direct access grants ausschalten**: Wenn die Smoke-Tests nicht mehr gebraucht werden, in der Capability Config wieder deaktivieren. Das Plugin selbst nutzt nur Auth-Code-Flow.
- **Service accounts roles ausschalten**, wenn das hybride Bot-Modell nicht eingesetzt wird.
- **Web Origins** auf die exakte MM-URL begrenzen (kein Wildcard `*`).
