# Expanded view overhaul — design

Goal: make the fullscreen call view a place people want to stay in. Today it is a
dark box with fixed-height tiles, a three-item header and no keyboard support.
This design covers tile layout, header, a participant panel, local pinning and
the interaction model. Chat is explicitly a later round.

Target: OpenTalk controller <= 0.33 (unchanged by this work — no signaling
changes at all).

---

## Scope

In:
- Tile sizing that actually fills the viewport, and larger, calmer tile chrome.
- A richer header: channel name, participant count, duration, screen-share
  notice, layout switcher, panel toggle, browser-fullscreen toggle.
- A participant panel on the right with per-row badges and the existing host
  moderation menu.
- Local pin/spotlight of one participant.
- Escape to collapse, real browser fullscreen, unmodified keyboard shortcuts,
  auto-hiding chrome.

Out:
- In-call chat (plan phase 7) — its own round.
- The Mattermost RHS roster (plan phase 3) — this panel lives inside the
  overlay and needs none of the RHS registration machinery.
- A search field in the panel. Meeting-sized rosters do not need one.
- Reactions (plan phase 9).

## Constraint that shapes the design

**Pinning is local-only.** The verified OpenTalk signaling surface has no
spotlight or pin frame; a "pin for everyone" would have to ride the LiveKit
data channel, which is plan phase 9 territory. A pin therefore changes only the
pinning user's own view, and the UI must not suggest otherwise.

---

## Architecture

`components/expanded_view/component.tsx` is 195 lines today and would roughly
triple. Split it:

```
components/expanded_view/
  component.tsx          orchestration only: gates, layout scaffold, wiring
  expanded_header.tsx    the whole top bar
  participant_panel.tsx  right-hand roster
  participant_tile.tsx   (modified: pin control, larger chrome, aspect ratio)
  grid_layout.tsx        (rewritten: measured sizing)
  speaker_layout.tsx     (modified: pin-aware, proportional sidebar)
  screen_focus_layout.tsx(modified: sharer removed from the thumbnail column)
  layout_switcher.tsx    (unchanged)
hooks/
  use_fullscreen.ts      requestFullscreen/exitFullscreen + fullscreenchange sync
  use_auto_hide.ts       idle timer -> boolean, with a hover hold
  use_call_shortcuts.ts  keydown bindings, active only while expanded
  use_panel_open.ts      localStorage-backed toggle, mirrors use_layout_mode
  use_grid_dimensions.ts ResizeObserver + best-fit column/row solver
```

### State placement

- **`pinnedParticipantId`** goes into `slice_session`, next to the existing
  `expanded` and `minimized` UI flags. All three layouts read it, so prop
  drilling through three components is the alternative and it is worse. New
  action `setPinnedParticipant(id: string | null)`; the `DISCONNECTED` case
  clears it, and `participantRemoved` must clear it when the pinned participant
  leaves (otherwise the layout pins a ghost).
- **Panel open/closed** uses a localStorage-backed hook, exactly like
  `use_layout_mode` does for the layout choice. Key `opentalk:panel-open:v1`.
- **Auto-hide visibility, fullscreen state, shortcut bindings** are local to the
  expanded view. They are transient and nothing else reads them.

---

## Tiles and layouts

### Grid sizing (`use_grid_dimensions` + `grid_layout.tsx`)

The current `repeat(auto-fit, minmax(240px, 1fr))` with `height: 140` wastes most
of a large screen. Replace with a measured best-fit:

- A `ResizeObserver` on the grid container reports `{width, height}`.
- For `n` tiles, evaluate every column count `c` in `1..n`: `rows = ceil(n / c)`,
  `tileWidth = (width - gap * (c - 1)) / c`, `tileHeight = tileWidth / ASPECT`
  with `ASPECT = 16 / 9`. A candidate is feasible when
  `rows * tileHeight + gap * (rows - 1) <= height`. Pick the feasible candidate
  with the largest `tileWidth * tileHeight`.
- If no candidate is feasible (very short viewport), fall back to deriving the
  tile height from the available height instead and accept a narrower tile.
- The hook returns `{columns, tileWidth, tileHeight}`; the grid renders a plain
  CSS grid with those explicit values and centers the block.

`gap` stays 8, `padding` stays 16.

### Tile chrome (`participant_tile.tsx`)

- Name label: 11px -> 13px. Show it permanently only when the tile is muted or
  the pointer is over the tile; otherwise fade it out. A wall of permanent name
  bars is what makes the current grid look busy.
- Badges (mic-off, hand, crown): icon size 14 -> 18, padding 3 -> 5.
- Add a pin control next to the existing `ParticipantMenu` trigger: pin when
  unpinned, unpin when this participant is the pinned one. Title/aria-label
  bilingual, and worded so it reads as a personal view change
  ("Für mich anpinnen" / "Pin for me").
- Keep `overflow: hidden` on the tile root — the moderation menu already
  portals out of it.

### Speaker layout

- The main slot shows the pinned participant when one is set, otherwise the
  active speaker, otherwise `order[0]` (today's behaviour minus the pin).
- Sidebar width: fixed 200px -> `clamp(160px, 15%, 260px)`.
- When a participant is pinned, mark the main tile so it is obvious the view is
  pinned rather than following the speaker.

### Screen-focus layout

- The thumbnail column currently repeats the screen sharer alongside their own
  screen. Filter the sharer out of the column.

---

## Header (`expanded_header.tsx`)

Left to right:

1. **Channel name** from `state.entities.channels.channels[channelID].display_name`
   via a new `selectChannelDisplayName(state, channelId)` following the exact
   shape of the existing `selectChannelType`. When it is empty — which happens
   for DMs and group DMs, whose display name is computed elsewhere in Mattermost
   — fall back to the current generic "OpenTalk-Meeting" / "OpenTalk meeting"
   title rather than inventing a lookup.
2. **Participant count** from `slice_session.participantCount`.
3. **Duration** from `useMeetingDuration` (unchanged).
4. **Screen-share notice**: when any participant has a screen track, show
   "<Name> teilt den Bildschirm" / "<Name> is sharing their screen". Derive it
   from the tracks slice, which already carries `screenTrackId` per participant.
5. Spacer.
6. **Layout switcher** (unchanged component).
7. **Panel toggle** — new icon, reflects open state.
8. **Fullscreen toggle** — new icon, reflects the real fullscreen state.

The raised-hands strip stays exactly as it is.

---

## Participant panel (`participant_panel.tsx`)

- Sits to the right of the video area as a flex sibling, so opening it reflows
  the tiles instead of covering them. Width 260px, hidden when closed.
- One row per participant in `order`: avatar initials, display name (self marked
  with "(Du)" / "(You)"), then badges for muted / hand raised / moderator /
  currently speaking.
- Each row carries the existing `ParticipantMenu` for the participant. The menu
  gates itself on host status and non-self, so the panel adds no gating of its
  own.
- Rows are also the pin affordance: clicking a row pins that participant.
- No search field.

---

## Interaction model

### Escape

`Escape` collapses the overlay back to the mini bar (`setExpanded(false)`). It
never leaves the meeting. If the browser is in real fullscreen, the browser
consumes the first Escape to exit fullscreen and the second collapses the
overlay — that is standard and acceptable.

### Real fullscreen (`use_fullscreen`)

A dedicated toggle calling `requestFullscreen()` on the overlay element and
`document.exitFullscreen()` to leave. The hook subscribes to `fullscreenchange`
so the button reflects state when the user leaves fullscreen by other means.
Deliberately separate from expanding: auto-requesting fullscreen on expand is
jarring, and browsers require a user gesture anyway.

### Keyboard shortcuts (`use_call_shortcuts`)

Bound to `window` only while the overlay is open:

| Key | Action |
| --- | --- |
| `M` | toggle microphone |
| `V` | toggle camera |
| `S` | toggle screen share |
| `H` | raise / lower hand |
| `F` | toggle real fullscreen |
| `1` / `2` / `3` | speaker / grid / screen-focus layout |
| `Escape` | collapse the overlay |

Digits for layouts rather than letters so the bindings stay language-neutral.

**A keypress with Ctrl, Meta or Alt held is ignored**, so Mattermost's own
shortcuts keep working. There is no text input inside the overlay in this round,
so no input-focus guard is needed yet — when chat or a panel search arrives, the
handler must start skipping events whose target is an input, textarea or
contenteditable.

### Auto-hide (`use_auto_hide`)

- Header, raised-hands strip and control bar fade out after 4s without pointer
  movement or key presses, and return on either.
- They stay visible while the pointer rests over them, so the bar cannot vanish
  under the cursor mid-click.
- The video area never hides.
- Implemented as opacity plus `pointer-events: none` while hidden, so hidden
  chrome cannot swallow clicks.

---

## Testing

Component tests follow the existing patterns (mock store, `@testing-library/react`).

- `use_grid_dimensions`: feasibility and best-fit selection for representative
  `(n, width, height)` combinations, including the no-feasible-candidate
  fallback. Pure function, no DOM needed for the solver itself.
- `use_auto_hide`: hides after the timeout with fake timers, returns on
  activity, stays visible while held.
- `use_call_shortcuts`: each binding fires its action; a keypress with Ctrl or
  Meta held fires nothing.
- `use_fullscreen`: request/exit called, state follows a `fullscreenchange`
  event.
- `use_panel_open`: default, persistence, invalid stored value.
- `participant_panel`: rows render with the right badges, self is marked,
  clicking a row pins, the moderation menu is present for a host.
- `expanded_header`: falls back to the generic title when the channel display
  name is empty; renders the screen-share notice only when a screen track
  exists.
- `slice_session`: `setPinnedParticipant`, cleared on disconnect, cleared when
  the pinned participant is removed.
- `participant_tile`: pin control pins and unpins; label visibility rule.
- Layout tests extended for pin-awareness and, for screen-focus, that the sharer
  no longer appears twice.

Full loop before each commit: `npm test`, `npx tsc --noEmit`,
`npx eslint src/` (baseline 56, must not grow), `bash -lc 'go test ./...'`,
`bash -lc 'make dist'`.

---

## Risks

- **Auto-hide vs. the moderation menu.** The menu portals to `document.body` and
  positions itself once on open. Hiding the chrome underneath it does not move
  the menu, but hiding chrome while a menu is open still looks wrong. Keep the
  chrome visible while any menu is open, or accept it and revisit — decide
  during implementation, and state which was chosen.
- **ResizeObserver in jsdom.** Not implemented there, so the hook needs its
  observation path stubbed in tests while the solver stays a pure, directly
  tested function.
- **Pinned ghost.** If the pinned participant leaves and the slice does not
  clear the pin, the speaker layout pins a missing id. Covered by a test.
- **Shortcut collisions.** `M`, `V`, `S`, `H`, `F` are unmodified single keys.
  They are bound only while the overlay is open and the overlay covers the whole
  viewport, so Mattermost's message box cannot have focus — but this is the
  assumption most likely to be wrong in practice, and it must be checked live.
- **Scope creep into the RHS.** This panel is deliberately overlay-local. When
  plan phase 3 builds the real RHS roster, the row component should be reused
  rather than the panel being widened here.
