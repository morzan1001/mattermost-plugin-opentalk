# OpenTalk plugin — Calls-parity implementation plan

Goal: make the plugin the most complete in-Mattermost calls experience, on par
with (and beyond) `mattermost-plugin-calls`, backed by OpenTalk. This plan is
grounded in a verified capability map (OpenTalk signaling frames + controller
REST endpoints, checked against docs.opentalk.eu / the OpenTalk GitLab and our
vendored `webapp/src/conference/signaling/modules/*`).

Everything below is **verified**; treat the wire contracts as authoritative but
re-confirm against the live `meet.7sum.it` controller version where a
`VERSION CAVEAT` is noted.

---

## 0. Current state (start here)

- Branch `feat/quick-wins` (off `main`, not pushed) holds:
  - `b87a226` — quick-win UX batch (reconnect rehydration, notice banner +
    enable-audio, localized ended/missed card, modal a11y, alert→deep-link,
    deactivation cleanup + `user_removed`, bilingual autocomplete).
  - `87be3a0` — live remote mute/media state → participant-tile mic-off badge
    (LiveKit `TrackMuted`/`TrackUnmuted` → `slice_participants.muted/cameraOff`).
- `main` already has the OIDC public-client/PKCE work, both audit-fix batches,
  the Go 1.26.4 / dependency bumps, and Babel 8.
- Verify loop for every increment: `bash -lc 'go test ./...'`,
  `cd webapp && npm test`, `npx tsc --noEmit`, `bash -lc 'make dist'`.
  Keep net-new eslint at zero (compare against `main`).

## Cross-cutting protocol facts (do not relearn)

- Core module namespace on the wire is the string `control` (file
  `modules/core.ts` exports `CoreNamespace = 'control'`).
- Outgoing frames are authored camelCase; `socket.ts` snake-cases keys AND the
  `action` value on the wire. Incoming frames are camelCased back;
  `event_listener.ts` normalizes `action` from either `action` OR `message`
  (livekit/chat/recording use `message`).
- `joinSuccess` carries top-level `id`/`displayName`/`role`/`is_room_owner` for
  self, `participants[]` (nested `control.*`) for others, and **per-module join
  state** under extra keys that `conference_room.ts` currently discards. Several
  features below are unlocked purely by capturing that module data.
- Participant ids in signaling are OpenTalk signaling ids (from
  `joinSuccess`/`participants[]`), **not** Mattermost user ids.
- Media mute/camera state is **LiveKit**, never OpenTalk (see phase 1, already
  shipped for mic).

---

## Phase 1 — Foundation: fix mistyped/phantom signaling frames  [do first]

Our `modules/moderation.ts` and `modules/core.ts` contain several frames in the
**wrong namespace**, with wrong action strings, or that **do not exist**. Any
moderation/waiting-room UI built on them silently never fires. Fix the types
before building UI.

Corrections (verified):

- **force_mute / microphone restrictions live in the `livekit` namespace, not
  moderation.** Move to `modules/livekit.ts`:
  - OUT `livekit` `{action:'force_mute', participants:[id,...]}`; IN to muted
    target `{message:'force_muted', moderator:<id>}`. The server mutes the
    published track server-side (LiveKit RoomService `mute_published_track`);
    the client handler syncs the local mic button/device state.
  - OUT `livekit` `{action:'enable_microphone_restrictions',
    unrestricted_participants:[id,...]}` / `{action:'disable_microphone_restrictions'}`;
    IN `{message:'microphone_restrictions_enabled', unrestricted_participants}` /
    `{message:'microphone_restrictions_disabled'}`.
  - Delete the wrong `ModerationMute`/`ModerationMuted`/`Enable/DisableMicrophoneRestrictions`
    types from `moderation.ts`.
- **Role change lives in the `control` namespace, not moderation.** Add to
  `modules/core.ts`:
  - OUT `control` `{action:'grant_moderator_role', target:<id>}` /
    `{action:'revoke_moderator_role', target:<id>}`.
  - IN to issuer `{message:'moderator_role_granted', target}` /
    `{message:'moderator_role_revoked', target}`; IN broadcast to the affected
    participant `{message:'role_updated', new_role:'moderator'|'user'}`.
  - Delete the phantom `ModerationUpdateRole` (`action:'updateRole'`) from
    `moderation.ts`.
- **`unban` does not exist.** Delete `ModerationUnban` and the
  `participantBanned`/`participantUnbanned` incoming types (phantom / stale).
- **Waiting-room incoming frames are in the wrong namespace/shape.** They belong
  to `moderation`, not `control` (see phase 3 for exact shapes). Move
  `in_waiting_room`, `joined_waiting_room`, `left_waiting_room` out of `core.ts`
  into `moderation.ts` with the corrected shapes.
- Add `ModerationSessionEnded {action:'sessionEnded', issuedBy}` (broadcast the
  server emits when a moderator ends the session, just before disconnect).
- Widen `reset_raised_hands` `target` to `string | string[]` (protocol accepts
  both). The incoming `raised_hand_reset_by_moderator` only carries `issued_by`
  per docs (our extra `participants` field is suspect — verify or drop).

Verified-correct already (no change): `kick`/`kicked`, `ban`/`banned`,
`debrief`/`debriefing_started`, `enable/disable_raise_hands` +
`raise_hands_enabled/disabled`, `raise_hand`/`lower_hand` +
`hand_raised`/`hand_lowered`, `grant/revoke_screen_share_permission` +
`screen_share_permissions_updated` (in `livekit.ts`), `accept`/`accepted`,
`send_to_waiting_room`/`sent_to_waiting_room`.

Acceptance: types compile; add a signaling unit test asserting each corrected
frame serializes to the exact wire JSON (namespace + snake_case action + fields).

## Phase 2 — Host moderation controls  [flagship parity gap]

Depends on phase 1. All send-frame + UI; no server change.

- `conference/client.ts` + `controller.ts`: add senders `forceMute(id)`,
  `muteAll()` (enumerate all non-self ids into one `force_mute`), `kick(id)`,
  `ban(id)`, `grantModerator(id)`, `revokeModerator(id)`,
  `resetHand(id)`/`resetAllHands()`, `grantScreenShare(id)`/`revokeScreenShare(id)`.
- Handle inbound: on `force_muted` call `disableMic()`; on `role_updated` update
  `slice_participants[id].role` and `slice_session.isHost` if it targets self.
- UI: a per-tile "More" context menu (participant_tile + a roster row), gated on
  `selectIsHost` / moderator role; a "Mute all" button in `controls_bar`; let a
  host lower a specific queued hand from the raised-hands strip in
  `expanded_view`.
- Store: add `role` display + a moderator/host crown badge on tiles (mic-off
  badge already shipped in phase-0 work).

Acceptance: as host, muting/kicking/making-moderator another participant takes
effect; targeted client reflects it (own mic stops on force_mute).

## Phase 3 — Right-hand-sidebar (RHS) participant roster  [home for controls + chat]

- `plugin.ts`: `registry.registerRightHandSidebarComponent(ParticipantRoster, title)`;
  open it via `showRHSPlugin` when a call starts (dispatch the MM action).
- `ParticipantRoster`: searchable list from `slice_participants` with per-row
  mic/speaking/hand/host badges, call duration, dial-in details (phase 5), and
  the phase-2 host-control menu. Reuse in the widget.
- Lets a user keep reading/typing in the channel during a call — a differentiator
  the fullscreen overlay blocks.

## Phase 4 — Register as a first-class MM call provider

- Swap the generic `registerChannelHeaderButtonAction` for
  `registerCallButtonAction` (split button + dropdown + automatic mobile
  channel-header entry). Reflect an active call in the current channel
  (color + participant count) off `slice_active_meetings` + `slice_session`.
- `registerAppBarComponent` with a badge when a call is live in any of my
  channels or I am in one. Icon must be an inline data-URI/SVG (CSP).

## Phase 5 — SIP dial-in end to end  [fixes a broken feature]

`DialInNumber`/`DialInPIN` are read (`meeting_post.go`, `dial_in.go`) but never
written, so every SIP meeting shows an empty dial-in. Two separate sources:

- **PIN + conference id (per room, REST):** `GET /v1/rooms/{room_id}/sip`
  (Bearer) → `{room, sip_id:"<~10-digit DTMF id>", password:"<PIN>", lobby}`.
  404 if not yet created. `PUT /v1/rooms/{room_id}/sip` creates it. The Room
  record does NOT inline sip config — `enable_sip` on create only triggers
  creation; you must GET the sub-resource. Add `GetSip` to
  `server/opentalk/rooms.go`; call it in `CreateMeeting` after `StartRoom` and
  persist onto `ActiveMeeting.DialInPIN` (+ store `sip_id`).
- **Phone number (global, NOT per-room):** only exposed via signaling
  `join_success` module data under key `call_in`:
  `{tel:"+49...", id:"<sip_id>", password:"<PIN>"}`. No REST endpoint returns
  the global `tel`. Options: (a) add an admin config setting mirroring the
  controller's `[call_in].tel`, or (b) have the webapp read
  `join_success.call_in.tel` and POST it back to persist onto
  `ActiveMeeting.DialInNumber`. Recommend (a) — simplest, one setting.
- Then surface dial-in on the card (already renders when fields non-empty), the
  widget, and the RHS. Also fixes `/opentalk dial-in` printing empty.

Precondition: a provisioned SIP gateway (OpenTalk obelisk) for the number to
actually route; the `/sip` resource returns regardless.

## Phase 6 — Collaboration links (shared folder / notes / whiteboard)

All delivered in `join_success` module data, currently discarded. Enabler:
capture per-module join-state in `conference_room.ts` `joinSuccess` handler into
new slices, then render link buttons.

- **Shared folder** — namespace `shared_folder`, join data
  `{read:{url,password}, read_write?:{url,password}}` (`read_write` only for
  moderators). No outgoing commands. Live update: `{message:'updated', read, read_write?}`.
- **Meeting notes (Etherpad)** — namespace `meeting_notes`. No join data; a
  participant's `readonly` flag arrives via `control:update`
  (`control.meeting_notes.readonly`). Moderator OUT `select_writer`/`deselect_writer`
  `{participant_ids:[]}`, `generate_pdf`. IN `{message:'write_url', url}` (writers),
  `{message:'read_url', url}` (others), `{message:'pdf_asset', filename, asset_id}`.
- **Whiteboard (Spacedeck)** — namespace `whiteboard`, join data
  `{status:'not_initialized'|'initializing'|'initialized', url?}`. Moderator OUT
  `{action:'initialize'}` → broadcast `{message:'space_url', url}`;
  `{action:'generate_pdf'}` → `{message:'pdf_url', url}`.

Render as links (using `OpenTalkFrontendURL` where relevant); native embedding is
a later follow-on. Each requires the corresponding service provisioned on the
controller — show the button only when the join data/URL is present.

## Phase 7 — In-call chat module

No chat module exists; OpenTalk provides a full one over the existing socket.

- New `modules/chat.ts` + `slice_chat` + RHS/expanded-view chat panel.
- OUT namespace `chat` `{action:'send_message', scope:'global'|'private',
  target?:<participantId>, content}`. (Support only global + private; `group`
  scope needs shared IdP groups users won't have, and newer controllers renamed
  it — VERSION CAVEAT.)
- IN uses `message` key: `chat:messageSent`
  `{id, timestamp, source:<participantId>, scope, target?, content}`. Sender gets
  its own echo — render from the broadcast, don't optimistically double-append.
- History arrives in `join_success` under key `chat`:
  `{enabled, room_history[], private_history[{correspondent, history[]}],
  last_seen_timestamp_global, ...}` — seed the panel from it (depends on phase 6
  join-data capture). `StoredMessage = {id?, source, content, scope, target?, timestamp}`.
- Moderator OUT `disable_chat`/`enable_chat` (IN `chat:chatDisabled/Enabled`),
  `clear_history` (IN `chat:historyCleared`). Optional `set_last_seen_timestamp`
  for cross-session unread badges.
- Interim already noted as QW3: a "Show chat" button that opens the bot post
  thread — do this cheaply first (needs the meeting `post_id` threaded into the
  session slice; `createMeeting`/`activeMeetings` already carry it).

## Phase 8 — Waiting room UI

Depends on phase 1 (corrected frames) + phase 3 (RHS).

- Create rooms with the waiting room via REST flag: `POST /v1/rooms`
  `{waiting_room:true, ...}` (already typed at `types.go`), or a moderator live
  toggle: `moderation` `enable_waiting_room`/`disable_waiting_room` (IN
  `waiting_room_enabled/disabled`).
- Joiner side: if the waiting room is active the server does NOT send
  `join_success`; instead the joinee gets `moderation` `{message:'in_waiting_room'}`
  (no fields) — render a "You are in the waiting room" state. After being
  accepted the joinee sends `control` `{action:'enter_room'}`, then gets the
  normal `control:join_success`.
- Host side: `moderation` `{message:'joined_waiting_room', id, control:{...}}`
  and `{message:'left_waiting_room', id}` — accumulate a client-side queue
  (there is no "get queue" request). Admit: `moderation` `{action:'accept', target}`
  → joinee gets `moderation:accepted`. Deny: reuse `kick` (there is no dedicated
  reject frame). Send-back: `send_to_waiting_room {target}` (requires the waiting
  room enabled first; cannot target the room owner).

## Phase 9 — Live emoji reactions (LiveKit data channel)

OpenTalk has NO native reactions frame — build on the LiveKit data channel we
already hold. No server change.

- Send: `room.localParticipant.publishData(TextEncoder JSON, {reliable:false,
  topic:'opentalk-reactions'})` with envelope
  `{v:1, t:'reaction', key:'thumbs_up', ts}` — send a reaction KEY enum, never a
  glyph (repo rule: no emoji glyphs), map key→SVG on render.
- Receive: `room.on(RoomEvent.DataReceived, (payload, participant, kind, topic))`;
  filter our topic; animate a transient overlay on the reacting participant's tile.
- Bind `RoomEvent.DataReceived` in `livekit/room.ts` (currently unbound).

## Phase 10 — Recording  [last; needs infra decisions]

Available over signaling but gated on a **provisioned recorder service** — this
is an ops decision, not just code.

- Consent (any participant, default OFF): OUT `recording` `{action:'set_consent',
  consent:bool}` — a user is not captured until they send `consent:true`. Build a
  mandatory consent modal.
- Moderator OUT `recording` `{action:'start_stream'|'stop_stream'|'pause_stream',
  target_ids:[]}`; resume = `start_stream` again. IN broadcast `recording`
  `{action:'status', target_id, status:'active'|'inactive'|'paused'|'error', reason?}`
  drives the "being recorded" indicator. Recorder failure → `{action:'recorder_error',
  error:'timeout'}`.
- Available targets arrive in `join_success` `targets` map
  `{[target_id]:{name, kind:'recording'|'livestream', status, public_url?}}`;
  empty ⇒ no recorder configured — hide the Record button.
- Streaming targets are configured via controller REST
  (`/v1/events/{event_id}/streaming_targets`, exact path/body unverified — confirm
  against the live OpenAPI). Finished artifact = a room asset:
  `GET /v1/rooms/{room_id}/assets` (list) + `/assets/{asset_id}` (download);
  drop the link into the channel via the bot-post builder.
- Preconditions to decide with ops: deploy `opentalk-recorder`, enable recording
  in controller config, object storage (MinIO), a `recording` streaming target.

## Not offered by OpenTalk (do not attempt over its protocol)

- Live transcription / captions / subtitles — no module. Fallback would be a
  client-side/MM-side STT integration (out of scope).
- Force-unmute / request-unmute — no frame; a moderator cannot turn another's mic
  on. Enforcement primitive is microphone restrictions (phase 1/2).
- Native reactions — see phase 9 fallback.

## Suggested order

1 → 2 (foundation + flagship moderation), then 5 + 6 (dial-in + collab links are
cheap, visible, high-trust wins), then 3 (RHS roster ties it together), then 7
(chat), 8 (waiting room), 9 (reactions), 10 (recording, once ops provisions a
recorder). 4 (call-provider registration) can slot in anywhere after 1.

## Open decisions for the user

- Dial-in number source: admin config setting mirroring `[call_in].tel` (simple)
  vs webapp-reads-`call_in`-and-POSTs-back.
- Recording: is a recorder service going to be provisioned on the deployment? If
  not, phase 10 is deferred indefinitely.
- Which collab services (NextCloud / Etherpad / Spacedeck) are actually deployed
  on `meet.7sum.it` — only wire the ones present.
