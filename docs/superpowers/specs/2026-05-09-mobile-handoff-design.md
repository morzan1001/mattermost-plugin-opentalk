# Mobile Handoff Design — OpenTalk Plugin

Status: proposed
Date: 2026-05-09
Owner: Matthias Duve

## 1. Goal

Make the OpenTalk plugin usable from the official Mattermost mobile app
(iOS / Android, React Native) without forking the mobile client. Users on
mobile must be able to start a meeting, join one, end one, decline an
incoming DM call, and complete the OAuth connect flow.

## 2. Non-goals

- In-app video / audio on mobile. The plugin's webapp bundle does not
  load on mattermost-mobile, and the mobile app has no extension point
  for plugin-supplied UI surfaces, no React Native bridge for
  `livekit-react-native`, and no plugin-controllable CallKit or
  foreground-service ringing UX. Verified by reading
  `mattermost-mobile/app/products/calls/`,
  `app/actions/websocket/event.ts`, and
  `app/constants/calls.ts` (Plugin id `com.mattermost.calls` is a
  compile-time constant; the entire calls UI is hardcoded against it).
- Replicating the Mattermost-Calls native experience. The Calls plugin
  is first-party, paired by name with hardcoded React Native code in
  the mobile app. No third-party plugin can ride that infrastructure.
- Push notifications for channel-scoped (non-DM) meetings. Behaviour
  matches existing webapp behaviour: only DM/GM calls get a push.
- Authenticated OpenTalk-frontend handoff (passing a server-generated
  ticket through the URL into the frontend so the user skips the
  OpenTalk auth prompt). Out of scope until the OpenTalk frontend
  exposes a documented entry point for that.

## 3. User-visible behaviour after the change

Same UX on web, new UX on mobile. No regression on web.

| Flow | Mobile experience after change |
| --- | --- |
| `/opentalk connect` | Slash-command response is a tappable URL → system browser → Keycloak → server callback HTML → close tab. (Already works; documented and tested.) |
| `/opentalk start` | Bot meeting post appears with a rich Slack-style attachment: title, status, dial-in info if enabled, prominent `[Join meeting]` markdown link, and an `End meeting` action button (host-only). Tap on the link opens the system browser to the OpenTalk frontend. |
| Joining a channel call | Open the channel, see the bot post with attachment, tap `[Join meeting]`, browser opens, OpenTalk handles auth + join. |
| Incoming DM call | Push "Incoming call from {host}" → tap → MM opens the linked post → user sees attachment with `[Join meeting]` link + `Decline` button. |
| `Decline` on a DM call (mobile) | Action button posts to a new endpoint that runs the existing `MeetingsDismiss` flow. The post updates in place to mark the call dismissed for that user. If all recipients decline, status becomes `MISSED` (existing behaviour). |
| `End meeting` (mobile, host) | Action button on the post runs the existing `MeetingsEnd` flow. Post updates to `ENDED`. (`/opentalk end` continues to work.) |
| Mobile user has started a call | Reaper does not kill the meeting after 5 minutes just because there is no webapp heartbeat. See section 5.3. |

## 4. Why this design

The mobile app exposes exactly four extension surfaces that a plugin
can use without a fork:

1. Slash commands reaching `ExecuteCommand`.
2. Posts whose `Type` is anything other than the small hardcoded set —
   their `message` field renders as markdown and `props.attachments`
   render as Slack-style cards with action buttons.
3. The `NotificationWillBePushed` hook to influence push-notification
   body text. (`SubType=PushSubTypeCalls` exists but the mobile app
   binds the resulting ringing UI to `com.mattermost.calls`; setting
   it from a third-party plugin only triggers a misrouted REST lookup.
   Therefore we do not set that subtype.)
4. `https://` URLs in markdown that open the system browser.

Everything in this design is built on those four surfaces. WebSocket
plugin events, channel-header buttons, custom post-type renderers, and
in-app video are deliberately excluded because the mobile app does not
support them for third parties.

The webapp side stays unchanged. When the webapp registers a custom
post-type component for `custom_opentalk_meeting`, that component fully
replaces the default body, so the new `props.attachments` are
invisible on web. No web-side flag, no new render path — strictly
additive.

## 5. Design

### 5.1 Bot meeting post — add Slack-style attachment

`server/post/meeting_post.go` gains a single Slack attachment in
`props.attachments` alongside the existing custom-post props. The
attachment is built in the same function and stays in sync with the
post status via `ApplyEndedStatus` and `ApplyMissedStatus`.

Attachment shape (per status):

```
STARTED:
  Title:       i18n "OpenTalk meeting"
  Color:       #1e88e5
  Text:        host markdown line
              + status line (Started <local time>)
              + dial-in line (if EnableSIP)
              + blank line
              + "[Join meeting](frontend_url/invite/<code>)"
  Actions:
    - id "end", Name "End meeting"   (visible to all clients;
      server-side it is host-gated, non-host clicks return a
      friendly "Only the host can end this meeting" ephemeral)
    - id "dismiss", Name "Decline"   (only emitted on DM/GM
      channels; visible to all post viewers — Slack attachment
      actions are not per-viewer. Server-side, dismiss for the
      host is a no-op so the button is harmless if the host
      taps it accidentally.)

ENDED:
  Title: i18n "OpenTalk meeting (ended)"
  Color: #9e9e9e
  Text:  "Ended <local time>, duration <hh:mm>"
  Actions: none

MISSED:
  Title: i18n "OpenTalk meeting (missed)"
  Color: #9e9e9e
  Text:  "Missed call from <host>"
  Actions: none
```

The existing `Message` field stays as the plain-text fallback for any
client that renders neither a custom post type nor attachments.

`ApplyEndedStatus` and `ApplyMissedStatus` are extended to rebuild the
attachment so the post reflects the new status when an `Update` round-
trip happens.

### 5.2 Post-action endpoints

Two new HTTP endpoints, both behind the plugin's existing
session-auth middleware:

- `POST /api/v1/meetings/post-action/end` — accepts a
  `model.PostActionIntegrationRequest`, looks up the meeting by
  `context.channel_id`, host-gates against the requesting user,
  delegates to the existing `endMeeting(am)` path
  (`server/plugin.go` `endMeeting`). Response: `{Update: <updated
  post>}` for clients that show the attachment. Non-host:
  `{EphemeralText: "Only the host can end this meeting"}`.

- `POST /api/v1/meetings/post-action/dismiss` — accepts the same
  payload, delegates to the existing `MeetingsDismiss` HTTP-handler
  logic (extracted into a shared helper so both endpoints reuse it).
  Response: `{Update: <post>}` if the dismissal flips the meeting to
  `MISSED`; otherwise `{EphemeralText: "Call declined"}`.

Routes are registered in `server/http/http.go` next to the existing
`/api/v1/meetings/...` routes.

The two existing endpoints `MeetingsEnd` and `MeetingsDismiss` stay as
they are; the webapp keeps using them. The new post-action endpoints
are thin adapters around the same business logic.

### 5.3 Reaper grace for mobile-started meetings

`store.ActiveMeeting` gains one boolean field:

```
HostHeartbeatReceived bool `json:"host_heartbeat_received,omitempty"`
```

- Defaults to `false` at meeting creation (`SaveActiveMeeting` from
  `CreateMeeting`).
- Set to `true` the first time `MeetingsHeartbeat` runs successfully.

`reaper.tick` decision:

```
if !am.HostHeartbeatReceived {
    cutoff := time.Now().UTC().Add(-30 * time.Minute)
    if am.CreatedAt.Before(cutoff) {
        endMeeting(am)
    }
    continue
}
// existing 5-minute heartbeat-staleness path
if am.LastHeartbeat.Before(time.Now().UTC().Add(-r.staleness)) {
    endMeeting(am)
}
```

This gives mobile-only hosts (and any host who started via the
slash-command path before opening the webapp) a 30-minute grace before
the reaper acts. After the first webapp heartbeat the meeting moves
into the existing 5-minute liveness regime, unchanged.

The 30-minute number is chosen to be longer than typical short calls
and short enough to clean up zombie rooms. It is a constant in the
reaper package; no config knob.

### 5.4 i18n

New translatables in `server/i18n/`:

- `MobileAttachmentTitleStarted`
- `MobileAttachmentTitleEnded`
- `MobileAttachmentTitleMissed`
- `MobileAttachmentJoinLink`
- `MobileAttachmentEndButton`
- `MobileAttachmentDismissButton`
- `MobileAttachmentEndedDescription`
- `MobileAttachmentMissedDescription`
- `MobileAttachmentDialInLine`
- `MobileAttachmentNonHostEndError`

All strings ship in DE and EN.

### 5.5 Help text

`server/command/help.go` gains a "Mobile" section in DE and EN
explaining that mobile users join calls via the system browser and
can use `Decline` and `End meeting` buttons in the meeting post.

### 5.6 Configuration

No new configuration. The behaviour is unconditionally additive.

## 6. Files touched

| Path | Change |
| --- | --- |
| `server/post/meeting_post.go` | Build `props.attachments` in `BuildMeetingPost`; rebuild on `ApplyEndedStatus` / `ApplyMissedStatus`. |
| `server/store/meeting.go` | Add `HostHeartbeatReceived` field. |
| `server/plugin.go` | After `MeetingsHeartbeat` succeeds, set the flag once and persist. |
| `server/http/meetings.go` | Extract dismiss / end logic into shared helpers. Add two `post-action` handlers. |
| `server/http/http.go` | Register the two new routes. |
| `server/reaper/reaper.go` | Apply the 30-minute pre-heartbeat grace branch. |
| `server/i18n/...` | New translatables. |
| `server/command/help.go` | Mobile section. |
| `server/post/meeting_post_test.go` | Cover attachment shape per status. |
| `server/http/meetings_test.go` | Cover post-action handlers (auth, host gate, response shape). |
| `server/reaper/reaper_test.go` | Cover the grace branch (no heartbeat / heartbeat received). |
| `webapp/...` | None. The custom post-type renderer keeps owning the web UI and silently ignores `props.attachments`. |

## 7. Risk and verification

- **Web regression.** Verified by reading the webapp's
  `PostTypeMeeting` (`webapp/src/components/post_type_meeting/`): it
  is registered via `registerPostTypeComponent` and replaces the
  default body. `props.attachments` therefore do not render on web.
  Smoke test in the live MM instance after deploy: confirm the bot
  post on web shows the existing card and not a Slack attachment.
- **Mobile attachment rendering.** Verified by reading
  `mattermost-mobile/app/components/post_list/post/body/index.tsx`
  and `body/content/content.tsx`: unknown `post.type` falls through
  to default rendering, which renders `post.props.attachments` via
  `MessageAttachments`. Smoke test in the iOS / Android app after
  deploy.
- **Action-button responses.** Verified that
  `model.PostActionIntegrationResponse` only supports `Update` and
  `EphemeralText` — no `goto_location`. Therefore `Join` is a
  markdown link in the attachment text, not an action button.
- **Reaper grace correctness.** Unit test covers: no heartbeat &
  young → keep; no heartbeat & older than 30m → kill; heartbeat
  received & stale → kill (existing path); heartbeat received &
  fresh → keep.
- **OAuth on mobile.** No code change. Slash command response
  already includes a tappable HTTPS URL; the system browser handles
  redirects; the OAuth callback HTML closes the tab. Smoke test.

## 8. Out-of-scope follow-ups

- Authenticated handoff to the OpenTalk frontend (pre-issued ticket in
  the URL) once OpenTalk supports it.
- OpenTalk participant-count polling as a heartbeat replacement
  (would let us drop the 30-minute fudge).
- A second mobile-friendly entry-point endpoint that accepts a
  short-lived plugin token, exchanges it for the OpenTalk ticket on
  the user's behalf, and 302-redirects into the frontend.
