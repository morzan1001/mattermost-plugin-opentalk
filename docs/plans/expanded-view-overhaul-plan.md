# Expanded View Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fullscreen call view into a complete conference UI: tiles that fill the screen, a richer header, a participant panel, local pinning, and a keyboard/auto-hide interaction model.

**Architecture:** `components/expanded_view/component.tsx` is reduced to orchestration; the header and the participant panel become their own components; five hooks under `webapp/src/hooks/` carry the interaction and sizing logic. Pin state lives in `slice_session` next to the existing `expanded`/`minimized` flags. No signaling, server, or protocol changes.

**Tech Stack:** TypeScript, React 17 function components, Redux (hand-rolled reducers, no toolkit), Jest + @testing-library/react, inline styles.

**Design doc:** `docs/plans/expanded-view-overhaul.md`

## Global Constraints

- Comments only where they carry a non-obvious *why*, a hidden constraint, or an external invariant. One line is the default. English always. Never describe removed code, and never reference this plan, a task number, or a ticket.
- No dead code, no speculative fallbacks, no backwards-compatibility shims.
- Every user-visible string is bilingual via `useT()` in components (`t({de: '...', en: '...'})`). German uses proper umlauts.
- Never use emoji glyphs. Icons are Lucide-style SVG components in `webapp/src/components/icons.tsx`.
- Selectors are imported from `webapp/src/util/selectors.ts`. Never write inline `useSelector((s: any) => ...)`.
- localStorage keys carry a `:vN` suffix.
- Pinning is **local-only** — the verified OpenTalk signaling surface has no spotlight frame. UI copy must not imply it affects other participants.
- Verify loop before every commit, all must pass:
  `cd webapp && npm test`, `cd webapp && npx tsc --noEmit`, `cd webapp && npx eslint src/` (baseline 56 problems, must not grow), `bash -lc 'go test ./...'`, `bash -lc 'make dist'`.
  Go and make only via `bash -lc`. Never edit shell profiles.
- Do not push, do not open pull requests.
- Work on branch `feat/quick-wins`.

---

### Task 1: Pin state in the session slice

**Files:**
- Modify: `webapp/src/store/slice_session.ts`
- Modify: `webapp/src/store/slice_participants.ts`
- Modify: `webapp/src/util/selectors.ts`
- Test: `webapp/src/store/slice_session.test.ts`, `webapp/src/util/selectors.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `setPinnedParticipant(id: string | null)` action creator; `SessionState.pinnedParticipantId?: string`; `selectPinnedParticipantId(state): string | undefined`; exported const `PARTICIPANT_REMOVED` from `slice_participants.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `webapp/src/store/slice_session.test.ts`:

```ts
it('setPinnedParticipant stores and clears the pinned id', () => {
    const pinned = sessionReducer(undefined, setPinnedParticipant('p1'));
    expect(pinned.pinnedParticipantId).toBe('p1');
    expect(sessionReducer(pinned, setPinnedParticipant(null)).pinnedParticipantId).toBeUndefined();
});

it('clears the pin when the pinned participant is removed', () => {
    const pinned = sessionReducer(undefined, setPinnedParticipant('p1'));
    const after = sessionReducer(pinned, participantRemoved({id: 'p1'}));
    expect(after.pinnedParticipantId).toBeUndefined();
});

it('keeps the pin when a different participant is removed', () => {
    const pinned = sessionReducer(undefined, setPinnedParticipant('p1'));
    expect(sessionReducer(pinned, participantRemoved({id: 'p2'})).pinnedParticipantId).toBe('p1');
});

it('clears the pin on disconnect', () => {
    const pinned = sessionReducer(undefined, setPinnedParticipant('p1'));
    expect(sessionReducer(pinned, disconnected()).pinnedParticipantId).toBeUndefined();
});
```

Import `setPinnedParticipant` from `./slice_session` and `participantRemoved` from `./slice_participants` at the top of the file.

Add to `webapp/src/util/selectors.test.ts`:

```ts
it('selectPinnedParticipantId reads the pinned id', () => {
    expect(selectPinnedParticipantId({[PLUGIN_STATE_KEY]: {session: {pinnedParticipantId: 'p1'}}})).toBe('p1');
    expect(selectPinnedParticipantId({})).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd webapp && npx jest src/store/slice_session.test.ts src/util/selectors.test.ts`
Expected: FAIL — `setPinnedParticipant is not a function`, `selectPinnedParticipantId is not a function`.

- [ ] **Step 3: Export the removal action type from the participants slice**

In `webapp/src/store/slice_participants.ts`, the action types live in a module-private `ACTION_TYPES` object. Export the one other slices need, directly above it:

```ts
// The session slice reacts to this to drop a pin on a participant who left.
export const PARTICIPANT_REMOVED = 'opentalk/participants/removed';
```

Then reference it inside `ACTION_TYPES` so the string exists once:

```ts
const ACTION_TYPES = {
    ADDED: 'opentalk/participants/added',
    REMOVED: PARTICIPANT_REMOVED,
    // ... rest unchanged
} as const;
```

- [ ] **Step 4: Add the pin to the session slice**

In `webapp/src/store/slice_session.ts`:

Import the constant at the top:

```ts
import {PARTICIPANT_REMOVED} from './slice_participants';
```

Add to `ACTION_TYPES`:

```ts
    SET_PINNED_PARTICIPANT: 'opentalk/session/set_pinned_participant',
```

Add to `SessionState`, after `localParticipantId`:

```ts
    // Local-only spotlight: OpenTalk has no pin frame, so this never leaves the client.
    pinnedParticipantId?: string;
```

Add to `initial`:

```ts
    pinnedParticipantId: undefined,
```

Add the action creator next to `setIsHost`:

```ts
export function setPinnedParticipant(id: string | null) {
    return {type: ACTION_TYPES.SET_PINNED_PARTICIPANT, payload: {id}};
}
```

Add both reducer cases before `default`:

```ts
    case ACTION_TYPES.SET_PINNED_PARTICIPANT:
        return {...state, pinnedParticipantId: action.payload.id ?? undefined};
    case PARTICIPANT_REMOVED:
        return state.pinnedParticipantId === action.payload.id ? {...state, pinnedParticipantId: undefined} : state;
```

- [ ] **Step 5: Add the selector**

In `webapp/src/util/selectors.ts`, next to `selectLocalParticipantId`:

```ts
export function selectPinnedParticipantId(state: AnyState): string | undefined {
    return state?.[stateKey]?.session?.pinnedParticipantId as string | undefined;
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd webapp && npx jest src/store src/util`
Expected: PASS.

- [ ] **Step 7: Full verify loop and commit**

```bash
cd /home/user/project/webapp && npm test && npx tsc --noEmit && npx eslint src/
bash -lc 'cd /home/user/project && go test ./... && make dist'
cd /home/user/project && git add webapp/src/store webapp/src/util && git commit -m "feat(ui): local pin state for the expanded view"
```

---

### Task 2: Grid sizing hook

**Files:**
- Create: `webapp/src/hooks/use_grid_dimensions.ts`
- Test: `webapp/src/hooks/use_grid_dimensions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `bestGridFit(count: number, width: number, height: number, gap: number, aspect: number): GridFit` (pure, exported for tests) and `useGridDimensions(count: number, gap?: number): {containerRef: React.RefObject<HTMLDivElement | null>; fit: GridFit}`, where `GridFit = {columns: number; tileWidth: number; tileHeight: number}`.

The solver fits a 16:9 box inside each grid cell by taking `Math.min(widthPerTile, heightPerTile * aspect)`. That makes every column count produce a valid candidate, so no separate infeasible-viewport fallback is needed — a very short viewport simply wins with a height-derived tile.

- [ ] **Step 1: Write the failing test**

Create `webapp/src/hooks/use_grid_dimensions.test.ts`:

```ts
import {bestGridFit} from './use_grid_dimensions';

const ASPECT = 16 / 9;

describe('bestGridFit', () => {
    it('gives two participants one row on a wide viewport', () => {
        const fit = bestGridFit(2, 1920, 900, 8, ASPECT);
        expect(fit.columns).toBe(2);
        expect(fit.tileWidth).toBeGreaterThan(800);
    });

    it('prefers the arrangement with the largest tile area', () => {
        const fit = bestGridFit(4, 1000, 1000, 8, ASPECT);
        expect(fit.columns).toBe(2);
    });

    it('keeps the 16:9 aspect ratio', () => {
        const fit = bestGridFit(5, 1600, 900, 8, ASPECT);
        expect(fit.tileWidth / fit.tileHeight).toBeCloseTo(ASPECT, 5);
    });

    it('derives the tile from the height on a very short viewport', () => {
        const fit = bestGridFit(3, 1920, 200, 8, ASPECT);
        expect(fit.tileHeight).toBeLessThanOrEqual(200);
        expect(fit.tileWidth).toBeGreaterThan(0);
    });

    it('returns a zero-sized fit before the container is measured', () => {
        expect(bestGridFit(3, 0, 0, 8, ASPECT)).toEqual({columns: 1, tileWidth: 0, tileHeight: 0});
    });

    it('returns a zero-sized fit for an empty call', () => {
        expect(bestGridFit(0, 1920, 900, 8, ASPECT)).toEqual({columns: 1, tileWidth: 0, tileHeight: 0});
    });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd webapp && npx jest src/hooks/use_grid_dimensions.test.ts`
Expected: FAIL — cannot find module `./use_grid_dimensions`.

- [ ] **Step 3: Write the implementation**

Create `webapp/src/hooks/use_grid_dimensions.ts`:

```ts
import {useEffect, useRef, useState} from 'react';

export interface GridFit {
    columns: number;
    tileWidth: number;
    tileHeight: number;
}

const ASPECT = 16 / 9;
const EMPTY: GridFit = {columns: 1, tileWidth: 0, tileHeight: 0};

export function bestGridFit(count: number, width: number, height: number, gap: number, aspect: number): GridFit {
    if (count <= 0 || width <= 0 || height <= 0) {
        return EMPTY;
    }

    let best = EMPTY;
    for (let columns = 1; columns <= count; columns++) {
        const rows = Math.ceil(count / columns);
        const cellWidth = (width - (gap * (columns - 1))) / columns;
        const cellHeight = (height - (gap * (rows - 1))) / rows;
        if (cellWidth <= 0 || cellHeight <= 0) {
            continue;
        }

        // Letterbox the tile inside the cell so the aspect ratio always holds.
        const tileWidth = Math.min(cellWidth, cellHeight * aspect);
        const tileHeight = tileWidth / aspect;
        if (tileWidth * tileHeight > best.tileWidth * best.tileHeight) {
            best = {columns, tileWidth, tileHeight};
        }
    }
    return best;
}

export function useGridDimensions(count: number, gap = 8): {containerRef: React.RefObject<HTMLDivElement | null>; fit: GridFit} {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState<{width: number; height: number}>({width: 0, height: 0});

    useEffect(() => {
        const node = containerRef.current;
        if (!node || typeof ResizeObserver === 'undefined') {
            return undefined;
        }
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) {
                setSize((cur) => (cur.width === rect.width && cur.height === rect.height ? cur : {width: rect.width, height: rect.height}));
            }
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    return {containerRef, fit: bestGridFit(count, size.width, size.height, gap, ASPECT)};
}
```

The `typeof ResizeObserver === 'undefined'` guard is not defensive padding: jsdom does not implement it, and this is the boundary to a browser API.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd webapp && npx jest src/hooks/use_grid_dimensions.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Full verify loop and commit**

```bash
cd /home/user/project/webapp && npm test && npx tsc --noEmit && npx eslint src/
bash -lc 'cd /home/user/project && go test ./... && make dist'
cd /home/user/project && git add webapp/src/hooks && git commit -m "feat(ui): best-fit grid sizing hook"
```

---

### Task 3: Grid layout uses the measured fit

**Files:**
- Modify: `webapp/src/components/expanded_view/grid_layout.tsx`
- Test: `webapp/src/components/expanded_view/grid_layout.test.tsx`

**Interfaces:**
- Consumes: `useGridDimensions` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Add to `webapp/src/components/expanded_view/grid_layout.test.tsx`:

```ts
it('renders the grid with explicit measured columns', () => {
    // ResizeObserver is absent in jsdom, so the fit stays zero-sized; the grid
    // must still render one tile per participant without throwing.
    const store = makeStore(['p1', 'p2', 'p3']);
    const {container} = render(<Provider store={store}><GridLayout/></Provider>);
    const grid = container.querySelector('[data-testid="grid-layout"]') as HTMLElement;
    expect(grid.style.display).toBe('grid');
    expect(screen.getAllByTestId(/^participant-tile-/)).toHaveLength(3);
});
```

Follow the existing `makeStore` helper in that file; if it does not take a participant list yet, extend it in the same shape the other layout tests use.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd webapp && npx jest src/components/expanded_view/grid_layout.test.tsx`
Expected: FAIL — the current grid uses `gridTemplateColumns: repeat(auto-fit, ...)` and fixed tile heights, so the assertion on explicit columns fails.

- [ ] **Step 3: Rewrite the grid layout**

Replace the returned grid in `webapp/src/components/expanded_view/grid_layout.tsx` (keep the existing empty-state branch untouched):

```tsx
    const {containerRef, fit} = useGridDimensions(order.length);

    return (
        <div
            ref={containerRef}
            data-testid='grid-layout'
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${fit.columns}, ${fit.tileWidth}px)`,
                gap: 8,
                padding: 16,
                width: '100%',
                height: '100%',
                alignContent: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                overflow: 'hidden',
            }}
        >
            {order.map((id: string) => (
                <ParticipantTile
                    key={id}
                    participantId={id}
                    width={fit.tileWidth}
                    height={fit.tileHeight}
                />
            ))}
        </div>
    );
```

Import the hook: `import {useGridDimensions} from '../../hooks/use_grid_dimensions';`

The hook call must sit above the empty-state early return, so hooks run unconditionally.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd webapp && npx jest src/components/expanded_view`
Expected: PASS.

- [ ] **Step 5: Full verify loop and commit**

```bash
cd /home/user/project/webapp && npm test && npx tsc --noEmit && npx eslint src/
bash -lc 'cd /home/user/project && go test ./... && make dist'
cd /home/user/project && git add webapp/src/components/expanded_view && git commit -m "feat(ui): fill the grid with measured tile sizes"
```

---

### Task 4: Tile chrome and the pin control

**Files:**
- Modify: `webapp/src/components/icons.tsx`
- Modify: `webapp/src/components/expanded_view/participant_tile.tsx`
- Test: `webapp/src/components/expanded_view/participant_tile.test.tsx`

**Interfaces:**
- Consumes: `setPinnedParticipant`, `selectPinnedParticipantId` from Task 1.
- Produces: `PinIcon`, `PinOffIcon` in `icons.tsx`.

- [ ] **Step 1: Write the failing tests**

Add to `webapp/src/components/expanded_view/participant_tile.test.tsx`:

```ts
it('pins an unpinned participant', () => {
    const store = makeStore({participants: {byId: {p1: {id: 'p1', displayName: 'Anna'}}, order: ['p1']}});
    store.dispatch = jest.fn();
    render(<Provider store={store}><ParticipantTile participantId='p1' width={320} height={180}/></Provider>);
    fireEvent.click(screen.getByTestId('participant-tile-pin-p1'));
    expect(store.dispatch).toHaveBeenCalledWith(setPinnedParticipant('p1'));
});

it('unpins the participant that is currently pinned', () => {
    const store = makeStore({
        participants: {byId: {p1: {id: 'p1', displayName: 'Anna'}}, order: ['p1']},
        session: {pinnedParticipantId: 'p1'},
    });
    store.dispatch = jest.fn();
    render(<Provider store={store}><ParticipantTile participantId='p1' width={320} height={180}/></Provider>);
    fireEvent.click(screen.getByTestId('participant-tile-pin-p1'));
    expect(store.dispatch).toHaveBeenCalledWith(setPinnedParticipant(null));
});
```

Extend the file's `makeStore` helper so it accepts a session slice if it does not already.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd webapp && npx jest src/components/expanded_view/participant_tile.test.tsx`
Expected: FAIL — no element with testid `participant-tile-pin-p1`.

- [ ] **Step 3: Add the icons**

In `webapp/src/components/icons.tsx`, following the existing stroke-based component shape:

```tsx
export const PinIcon: React.FC<{size?: number}> = ({size = 16}) => (
    <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
        <line x1='12' y1='17' x2='12' y2='22'/>
        <path d='M5 17h14l-1.7-3.4a2 2 0 0 1-.3-1V4H7v8.6a2 2 0 0 1-.3 1L5 17z'/>
    </svg>
);

export const PinOffIcon: React.FC<{size?: number}> = ({size = 16}) => (
    <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
        <line x1='2' y1='2' x2='22' y2='22'/>
        <line x1='12' y1='17' x2='12' y2='22'/>
        <path d='M9 4h8v8.6a2 2 0 0 0 .3 1L19 17H8'/>
    </svg>
);
```

- [ ] **Step 4: Update the tile**

In `webapp/src/components/expanded_view/participant_tile.tsx`:

Enlarge the existing chrome — in the badge row change `padding: 3` to `padding: 5` and both `size={14}` props to `size={18}`; in `labelStyle` change `fontSize: 11` to `fontSize: 13`.

Make the label conditional. Add above the return:

```tsx
    const [hovered, setHovered] = useState(false);
    const showLabel = hovered || isMuted;
```

Put `onPointerEnter={() => setHovered(true)}` and `onPointerLeave={() => setHovered(false)}` on the tile root, and render the label as
`{showLabel && <span style={labelStyle}>{displayName || participantId.slice(0, 8)}</span>}`.

Add the pin control next to `<ParticipantMenu participantId={participantId}/>`:

```tsx
    const dispatch = useDispatch();
    const pinnedId = useSelector(selectPinnedParticipantId);
    const isPinned = pinnedId === participantId;
```

```tsx
            <button
                type='button'
                data-testid={`participant-tile-pin-${participantId}`}
                onClick={() => dispatch(setPinnedParticipant(isPinned ? null : participantId))}
                title={isPinned ? t({de: 'Anheftung lösen', en: 'Unpin'}) : t({de: 'Für mich anheften', en: 'Pin for me'})}
                aria-label={isPinned ? t({de: 'Anheftung lösen', en: 'Unpin'}) : t({de: 'Für mich anheften', en: 'Pin for me'})}
                style={{
                    position: 'absolute',
                    top: 4,
                    right: 32,
                    display: 'flex',
                    padding: 4,
                    borderRadius: 4,
                    border: 'none',
                    background: isPinned ? 'rgba(0,181,156,0.85)' : 'rgba(0,0,0,0.5)',
                    color: 'white',
                    cursor: 'pointer',
                    lineHeight: 0,
                }}
            >
                {isPinned ? <PinOffIcon size={16}/> : <PinIcon size={16}/>}
            </button>
```

`right: 32` keeps it clear of the moderation-menu trigger, which sits at `right: 4`.

Add the needed imports: `useState` from react, `useDispatch`/`useSelector` from react-redux, `setPinnedParticipant` from the session slice, `selectPinnedParticipantId` from selectors, `PinIcon`/`PinOffIcon` from `../icons`, and `useT` if the file does not already import it.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd webapp && npx jest src/components/expanded_view`
Expected: PASS.

- [ ] **Step 6: Full verify loop and commit**

```bash
cd /home/user/project/webapp && npm test && npx tsc --noEmit && npx eslint src/
bash -lc 'cd /home/user/project && go test ./... && make dist'
cd /home/user/project && git add webapp/src/components && git commit -m "feat(ui): larger tile chrome and a local pin control"
```

---

### Task 5: Pin-aware speaker layout and screen-focus cleanup

**Files:**
- Modify: `webapp/src/components/expanded_view/speaker_layout.tsx`
- Modify: `webapp/src/components/expanded_view/screen_focus_layout.tsx`
- Modify: `webapp/src/util/selectors.ts`
- Test: `webapp/src/components/expanded_view/speaker_layout.test.tsx`, `webapp/src/components/expanded_view/screen_focus_layout.test.tsx`, `webapp/src/util/selectors.test.ts`

**Interfaces:**
- Consumes: `selectPinnedParticipantId` from Task 1.
- Produces: `selectScreenSharerId(state): string | undefined` in `selectors.ts`, reused by Task 8's header.

- [ ] **Step 1: Write the failing tests**

`speaker_layout.test.tsx`:

```ts
it('shows the pinned participant in the main slot instead of the active speaker', () => {
    const store = makeStore({
        participants: {byId: {p1: {id: 'p1'}, p2: {id: 'p2'}}, order: ['p1', 'p2']},
        tracks: {perParticipant: {}, activeSpeakers: ['p1']},
        session: {pinnedParticipantId: 'p2'},
    });
    render(<Provider store={store}><SpeakerLayout/></Provider>);
    const main = screen.getByTestId('speaker-layout-main');
    expect(main.querySelector('[data-testid="participant-tile-p2"]')).not.toBeNull();
});
```

`screen_focus_layout.test.tsx`:

```ts
it('does not repeat the screen sharer in the thumbnail column', () => {
    const store = makeStore({
        participants: {byId: {p1: {id: 'p1'}, p2: {id: 'p2'}}, order: ['p1', 'p2']},
        tracks: {perParticipant: {p1: {screenTrackId: 's1'}}, activeSpeakers: []},
    });
    render(<Provider store={store}><ScreenFocusLayout/></Provider>);
    expect(screen.getAllByTestId('participant-tile-p1')).toHaveLength(1);
});
```

`selectors.test.ts`:

```ts
it('selectScreenSharerId finds the participant with a screen track', () => {
    const state = {[PLUGIN_STATE_KEY]: {
        participants: {byId: {p1: {id: 'p1'}, p2: {id: 'p2'}}, order: ['p1', 'p2']},
        tracks: {perParticipant: {p2: {screenTrackId: 's1'}}},
    }};
    expect(selectScreenSharerId(state)).toBe('p2');
    expect(selectScreenSharerId({})).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd webapp && npx jest src/components/expanded_view src/util`
Expected: FAIL — no `speaker-layout-main` testid, the sharer renders twice, `selectScreenSharerId` is not a function.

- [ ] **Step 3: Add the selector**

In `webapp/src/util/selectors.ts`, below `selectTracksPerParticipant`:

```ts
export function selectScreenSharerId(state: AnyState): string | undefined {
    const perParticipant = selectTracksPerParticipant(state);
    return selectParticipantOrder(state).find((id) => Boolean(perParticipant[id]?.screenTrackId));
}
```

- [ ] **Step 4: Make the speaker layout pin-aware**

In `webapp/src/components/expanded_view/speaker_layout.tsx`, replace the speaker resolution:

```tsx
    const pinnedId = useSelector(selectPinnedParticipantId);
    const activeSpeakerId = activeSpeakers.find((id: string) => byId[id] != null);
    const speakerId: string = (pinnedId && byId[pinnedId] ? pinnedId : undefined) ?? activeSpeakerId ?? order[0];
```

Add `data-testid='speaker-layout-main'` to the wrapper `div` around the main `ParticipantTile`, and change the sidebar width from `width: 200` to `width: 'clamp(160px, 15%, 260px)'`.

- [ ] **Step 5: Filter the sharer out of the screen-focus column**

In `webapp/src/components/expanded_view/screen_focus_layout.tsx`, replace the thumbnail map source with `order.filter((id: string) => id !== screenSharerId)` and use `selectScreenSharerId` in place of the inline `order.find(...)`.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd webapp && npx jest src/components/expanded_view src/util`
Expected: PASS.

- [ ] **Step 7: Full verify loop and commit**

```bash
cd /home/user/project/webapp && npm test && npx tsc --noEmit && npx eslint src/
bash -lc 'cd /home/user/project && go test ./... && make dist'
cd /home/user/project && git add webapp/src && git commit -m "feat(ui): pin-aware speaker layout and single-sharer screen focus"
```

---

### Task 6: Panel-open and fullscreen hooks

**Files:**
- Create: `webapp/src/hooks/use_panel_open.ts`, `webapp/src/hooks/use_fullscreen.ts`
- Test: `webapp/src/hooks/use_panel_open.test.ts`, `webapp/src/hooks/use_fullscreen.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `usePanelOpen(): [boolean, (open: boolean) => void]`; `useFullscreen(targetRef: React.RefObject<HTMLElement | null>): {isFullscreen: boolean; toggle: () => void}`.

- [ ] **Step 1: Write the failing tests**

`use_panel_open.test.ts`:

```ts
import {renderHook, act} from '@testing-library/react';
import {usePanelOpen} from './use_panel_open';

beforeEach(() => localStorage.clear());

it('defaults to open', () => {
    expect(renderHook(() => usePanelOpen()).result.current[0]).toBe(true);
});

it('persists the choice', () => {
    const {result} = renderHook(() => usePanelOpen());
    act(() => result.current[1](false));
    expect(localStorage.getItem('opentalk:panel-open:v1')).toBe('false');
    expect(renderHook(() => usePanelOpen()).result.current[0]).toBe(false);
});

it('falls back to the default on a corrupt stored value', () => {
    localStorage.setItem('opentalk:panel-open:v1', 'nonsense');
    expect(renderHook(() => usePanelOpen()).result.current[0]).toBe(true);
});
```

`use_fullscreen.test.ts`:

```ts
import {renderHook, act} from '@testing-library/react';
import {useFullscreen} from './use_fullscreen';

it('requests and exits fullscreen on the target', () => {
    const el = document.createElement('div');
    const request = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn().mockResolvedValue(undefined);
    (el as unknown as {requestFullscreen: unknown}).requestFullscreen = request;
    (document as unknown as {exitFullscreen: unknown}).exitFullscreen = exit;

    const ref = {current: el};
    const {result} = renderHook(() => useFullscreen(ref));

    act(() => result.current.toggle());
    expect(request).toHaveBeenCalled();

    Object.defineProperty(document, 'fullscreenElement', {value: el, configurable: true});
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(result.current.isFullscreen).toBe(true);

    act(() => result.current.toggle());
    expect(exit).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd webapp && npx jest src/hooks/use_panel_open.test.ts src/hooks/use_fullscreen.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `use_panel_open.ts`**

```ts
import {useState, useCallback} from 'react';

const STORAGE_KEY = 'opentalk:panel-open:v1';

function readStoredOpen(): boolean {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === 'true' || raw === 'false') {
            return raw === 'true';
        }
    } catch {
        // localStorage unavailable
    }
    return true;
}

export function usePanelOpen(): [boolean, (open: boolean) => void] {
    const [open, setOpen] = useState<boolean>(() => readStoredOpen());

    const setPanelOpen = useCallback((next: boolean) => {
        try {
            localStorage.setItem(STORAGE_KEY, String(next));
        } catch {
            // Storage may be unavailable — silently ignore
        }
        setOpen(next);
    }, []);

    return [open, setPanelOpen];
}
```

- [ ] **Step 4: Write `use_fullscreen.ts`**

```ts
import {useCallback, useEffect, useState} from 'react';
import type React from 'react';

export function useFullscreen(targetRef: React.RefObject<HTMLElement | null>): {isFullscreen: boolean; toggle: () => void} {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const toggle = useCallback(() => {
        if (document.fullscreenElement) {
            void document.exitFullscreen();
            return;
        }
        // Browsers reject this outside a user gesture; the caller is a click handler.
        void targetRef.current?.requestFullscreen();
    }, [targetRef]);

    return {isFullscreen, toggle};
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd webapp && npx jest src/hooks`
Expected: PASS.

- [ ] **Step 6: Full verify loop and commit**

```bash
cd /home/user/project/webapp && npm test && npx tsc --noEmit && npx eslint src/
bash -lc 'cd /home/user/project && go test ./... && make dist'
cd /home/user/project && git add webapp/src/hooks && git commit -m "feat(ui): panel-open and fullscreen hooks"
```

---

### Task 7: Auto-hide and keyboard-shortcut hooks

**Files:**
- Create: `webapp/src/hooks/use_auto_hide.ts`, `webapp/src/hooks/use_call_shortcuts.ts`
- Test: `webapp/src/hooks/use_auto_hide.test.ts`, `webapp/src/hooks/use_call_shortcuts.test.ts`

**Interfaces:**
- Consumes: `LayoutMode` from `use_layout_mode.ts`.
- Produces:
  - `useAutoHide(enabled: boolean, idleMs?: number): {visible: boolean; holdProps: {onPointerEnter: () => void; onPointerLeave: () => void}}`
  - `useCallShortcuts(enabled: boolean, handlers: CallShortcutHandlers): void` with
    `CallShortcutHandlers = {onToggleMic, onToggleCam, onToggleScreen, onToggleHand, onToggleFullscreen, onCollapse: () => void; onSetLayout: (mode: LayoutMode) => void}`.

- [ ] **Step 1: Write the failing tests**

`use_auto_hide.test.ts`:

```ts
import {renderHook, act} from '@testing-library/react';
import {useAutoHide} from './use_auto_hide';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('hides after the idle timeout and returns on activity', () => {
    const {result} = renderHook(() => useAutoHide(true, 4000));
    expect(result.current.visible).toBe(true);

    act(() => {
        jest.advanceTimersByTime(4000);
    });
    expect(result.current.visible).toBe(false);

    act(() => {
        window.dispatchEvent(new Event('pointermove'));
    });
    expect(result.current.visible).toBe(true);
});

it('stays visible while held', () => {
    const {result} = renderHook(() => useAutoHide(true, 4000));
    act(() => result.current.holdProps.onPointerEnter());
    act(() => {
        jest.advanceTimersByTime(10000);
    });
    expect(result.current.visible).toBe(true);
});

it('stays visible when disabled', () => {
    const {result} = renderHook(() => useAutoHide(false, 4000));
    act(() => {
        jest.advanceTimersByTime(10000);
    });
    expect(result.current.visible).toBe(true);
});
```

`use_call_shortcuts.test.ts`:

```ts
import {renderHook} from '@testing-library/react';
import {useCallShortcuts} from './use_call_shortcuts';

function makeHandlers() {
    return {
        onToggleMic: jest.fn(),
        onToggleCam: jest.fn(),
        onToggleScreen: jest.fn(),
        onToggleHand: jest.fn(),
        onToggleFullscreen: jest.fn(),
        onCollapse: jest.fn(),
        onSetLayout: jest.fn(),
    };
}

it('maps each key to its action', () => {
    const h = makeHandlers();
    renderHook(() => useCallShortcuts(true, h));

    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'm'}));
    expect(h.onToggleMic).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'v'}));
    expect(h.onToggleCam).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 's'}));
    expect(h.onToggleScreen).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'h'}));
    expect(h.onToggleHand).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'f'}));
    expect(h.onToggleFullscreen).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    expect(h.onCollapse).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: '2'}));
    expect(h.onSetLayout).toHaveBeenCalledWith('grid');
});

it('ignores keys held with a modifier so Mattermost shortcuts keep working', () => {
    const h = makeHandlers();
    renderHook(() => useCallShortcuts(true, h));
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'm', ctrlKey: true}));
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'm', metaKey: true}));
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'm', altKey: true}));
    expect(h.onToggleMic).not.toHaveBeenCalled();
});

it('binds nothing when disabled', () => {
    const h = makeHandlers();
    renderHook(() => useCallShortcuts(false, h));
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'm'}));
    expect(h.onToggleMic).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd webapp && npx jest src/hooks/use_auto_hide.test.ts src/hooks/use_call_shortcuts.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `use_auto_hide.ts`**

```ts
import {useCallback, useEffect, useRef, useState} from 'react';

export function useAutoHide(enabled: boolean, idleMs = 4000): {
    visible: boolean;
    holdProps: {onPointerEnter: () => void; onPointerLeave: () => void};
} {
    const [visible, setVisible] = useState(true);
    const heldRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const arm = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (!enabled || heldRef.current) {
            return;
        }
        timerRef.current = setTimeout(() => setVisible(false), idleMs);
    }, [enabled, idleMs]);

    useEffect(() => {
        if (!enabled) {
            setVisible(true);
            return undefined;
        }
        const onActivity = () => {
            setVisible(true);
            arm();
        };
        window.addEventListener('pointermove', onActivity);
        window.addEventListener('keydown', onActivity);
        arm();
        return () => {
            window.removeEventListener('pointermove', onActivity);
            window.removeEventListener('keydown', onActivity);
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [enabled, arm]);

    const onPointerEnter = useCallback(() => {
        heldRef.current = true;
        setVisible(true);
        arm();
    }, [arm]);

    const onPointerLeave = useCallback(() => {
        heldRef.current = false;
        arm();
    }, [arm]);

    return {visible, holdProps: {onPointerEnter, onPointerLeave}};
}
```

- [ ] **Step 4: Write `use_call_shortcuts.ts`**

```ts
import {useEffect, useRef} from 'react';

import type {LayoutMode} from './use_layout_mode';

export interface CallShortcutHandlers {
    onToggleMic: () => void;
    onToggleCam: () => void;
    onToggleScreen: () => void;
    onToggleHand: () => void;
    onToggleFullscreen: () => void;
    onCollapse: () => void;
    onSetLayout: (mode: LayoutMode) => void;
}

const LAYOUT_KEYS: Record<string, LayoutMode> = {
    1: 'speaker',
    2: 'grid',
    3: 'screen-focus',
};

export function useCallShortcuts(enabled: boolean, handlers: CallShortcutHandlers): void {
    // A ref keeps the listener bound once while still calling the latest handlers.
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    useEffect(() => {
        if (!enabled) {
            return undefined;
        }
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }
            const h = handlersRef.current;
            const layout = LAYOUT_KEYS[e.key];
            if (layout) {
                h.onSetLayout(layout);
                return;
            }
            switch (e.key.toLowerCase()) {
            case 'm':
                h.onToggleMic();
                break;
            case 'v':
                h.onToggleCam();
                break;
            case 's':
                h.onToggleScreen();
                break;
            case 'h':
                h.onToggleHand();
                break;
            case 'f':
                h.onToggleFullscreen();
                break;
            case 'escape':
                h.onCollapse();
                break;
            default:
                break;
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [enabled]);
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd webapp && npx jest src/hooks`
Expected: PASS.

- [ ] **Step 6: Full verify loop and commit**

```bash
cd /home/user/project/webapp && npm test && npx tsc --noEmit && npx eslint src/
bash -lc 'cd /home/user/project && go test ./... && make dist'
cd /home/user/project && git add webapp/src/hooks && git commit -m "feat(ui): auto-hide and keyboard-shortcut hooks"
```

---

### Task 8: Expanded header

**Files:**
- Create: `webapp/src/components/expanded_view/expanded_header.tsx`, `webapp/src/components/expanded_view/expanded_header.test.tsx`
- Modify: `webapp/src/util/selectors.ts`, `webapp/src/components/icons.tsx`
- Test: `webapp/src/util/selectors.test.ts`

**Interfaces:**
- Consumes: `selectScreenSharerId` (Task 5), `LayoutMode` and `LayoutSwitcher`.
- Produces: `ExpandedHeader` component with props
  `{mode: LayoutMode; onModeChange: (m: LayoutMode) => void; panelOpen: boolean; onTogglePanel: () => void; isFullscreen: boolean; onToggleFullscreen: () => void}`;
  `selectChannelDisplayName(state, channelId): string | undefined`;
  `PanelIcon`, `FullscreenIcon`, `FullscreenExitIcon` in `icons.tsx`.

- [ ] **Step 1: Write the failing tests**

`selectors.test.ts`:

```ts
it('selectChannelDisplayName reads the Mattermost channel entity', () => {
    const state = {entities: {channels: {channels: {c1: {display_name: 'Team'}}}}};
    expect(selectChannelDisplayName(state, 'c1')).toBe('Team');
    expect(selectChannelDisplayName(state, undefined)).toBeUndefined();
});
```

`expanded_header.test.tsx` (mirror the store-mocking style used by the other expanded-view tests):

```ts
it('shows the channel name when Mattermost provides one', () => {
    renderHeader({channelName: 'Team', participantCount: 3});
    expect(screen.getByText('Team')).toBeInTheDocument();
});

it('falls back to the generic title for channels without a display name', () => {
    renderHeader({channelName: '', participantCount: 3});
    expect(screen.getByText('OpenTalk meeting')).toBeInTheDocument();
});

it('names the participant who is sharing their screen', () => {
    renderHeader({sharer: {id: 'p2', displayName: 'Bernd'}});
    expect(screen.getByTestId('expanded-header-sharing')).toHaveTextContent('Bernd');
});

it('renders no sharing notice when nobody shares', () => {
    renderHeader({});
    expect(screen.queryByTestId('expanded-header-sharing')).toBeNull();
});

it('toggles the panel and fullscreen through their buttons', () => {
    const onTogglePanel = jest.fn();
    const onToggleFullscreen = jest.fn();
    renderHeader({onTogglePanel, onToggleFullscreen});
    fireEvent.click(screen.getByTestId('expanded-header-panel-toggle'));
    fireEvent.click(screen.getByTestId('expanded-header-fullscreen-toggle'));
    expect(onTogglePanel).toHaveBeenCalled();
    expect(onToggleFullscreen).toHaveBeenCalled();
});
```

Write a local `renderHeader(overrides)` helper in the test file that builds the mock store and renders `<ExpandedHeader {...props}/>`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd webapp && npx jest src/components/expanded_view/expanded_header.test.tsx src/util`
Expected: FAIL — module and selector missing.

- [ ] **Step 3: Add the selector**

In `webapp/src/util/selectors.ts`, next to `selectChannelType`:

```ts
export function selectChannelDisplayName(state: AnyState, channelId: string | undefined): string | undefined {
    if (!channelId) {
        return undefined;
    }
    return state?.entities?.channels?.channels?.[channelId]?.display_name as string | undefined;
}
```

- [ ] **Step 4: Add the icons**

In `webapp/src/components/icons.tsx`:

```tsx
export const PanelIcon: React.FC<{size?: number}> = ({size = 20}) => (
    <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
        <rect x='3' y='4' width='18' height='16' rx='2'/>
        <line x1='15' y1='4' x2='15' y2='20'/>
    </svg>
);

export const FullscreenIcon: React.FC<{size?: number}> = ({size = 20}) => (
    <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
        <path d='M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3'/>
    </svg>
);

export const FullscreenExitIcon: React.FC<{size?: number}> = ({size = 20}) => (
    <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
        <path d='M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M16 21v-3a2 2 0 0 1 2-2h3M8 21v-3a2 2 0 0 0-2-2H3'/>
    </svg>
);
```

- [ ] **Step 5: Write the header component**

Create `webapp/src/components/expanded_view/expanded_header.tsx`. It reads channel id, channel display name, participant count, `joinedAt`, the sharer id and the participants map from selectors; it takes the layout mode, panel state and fullscreen state as props. Structure:

```tsx
export interface ExpandedHeaderProps {
    mode: LayoutMode;
    onModeChange: (mode: LayoutMode) => void;
    panelOpen: boolean;
    onTogglePanel: () => void;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
}
```

Body: a 56px-high flex row with the same `background: 'rgba(255,255,255,0.04)'` and bottom border the current header uses, containing in order

1. `<span>` with `channelName || t({de: 'OpenTalk-Meeting', en: 'OpenTalk meeting'})` at `fontSize: 14, fontWeight: 600`;
2. participant count, `{count} {t({de: 'Teilnehmer', en: 'participants'})}` at `fontSize: 13, opacity: 0.7`;
3. the duration from `useMeetingDuration(joinedAt)` when set, same styling;
4. when `sharerName` is set, a `<span data-testid='expanded-header-sharing'>` reading
   `` `${sharerName} ${t({de: 'teilt den Bildschirm', en: 'is sharing their screen'})}` ``;
5. `<div style={{flex: 1}}/>`;
6. `<LayoutSwitcher mode={mode} onChange={onModeChange}/>`;
7. a panel toggle button, `data-testid='expanded-header-panel-toggle'`, `<PanelIcon/>`, title/aria-label
   `panelOpen ? t({de: 'Teilnehmerliste ausblenden', en: 'Hide participant list'}) : t({de: 'Teilnehmerliste einblenden', en: 'Show participant list'})`;
8. a fullscreen toggle button, `data-testid='expanded-header-fullscreen-toggle'`, `<FullscreenExitIcon/>` when `isFullscreen` else `<FullscreenIcon/>`, title/aria-label
   `isFullscreen ? t({de: 'Vollbild beenden', en: 'Exit fullscreen'}) : t({de: 'Vollbild', en: 'Fullscreen'})`.

Both buttons reuse `mutedButtonStyle` from `../controls_bar/component` so the header matches the control bar. That constant is currently module-private — add the `export` keyword to it in `webapp/src/components/controls_bar/component.tsx`. It was de-exported earlier for having no consumer; the header is a real one.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd webapp && npx jest src/components/expanded_view src/util`
Expected: PASS.

- [ ] **Step 7: Full verify loop and commit**

```bash
cd /home/user/project/webapp && npm test && npx tsc --noEmit && npx eslint src/
bash -lc 'cd /home/user/project && go test ./... && make dist'
cd /home/user/project && git add webapp/src && git commit -m "feat(ui): richer expanded-view header"
```

---

### Task 9: Participant panel

**Files:**
- Create: `webapp/src/components/expanded_view/participant_panel.tsx`, `webapp/src/components/expanded_view/participant_panel.test.tsx`

**Interfaces:**
- Consumes: `selectParticipantOrder`, `selectParticipantsById`, `selectLocalParticipantId`, `selectPinnedParticipantId` (Task 1), `setPinnedParticipant` (Task 1), `ParticipantMenu`.
- Produces: `ParticipantPanel` component, no props.

- [ ] **Step 1: Write the failing tests**

```ts
it('renders one row per participant with the self marker', () => {
    renderPanel({order: ['p1', 'p2'], byId: {p1: {id: 'p1', displayName: 'Anna'}, p2: {id: 'p2', displayName: 'Bernd'}}, localParticipantId: 'p1'});
    expect(screen.getAllByTestId(/^participant-row-/)).toHaveLength(2);
    expect(screen.getByTestId('participant-row-p1')).toHaveTextContent('(Du)');
});

it('shows mute, hand and moderator badges', () => {
    renderPanel({order: ['p1'], byId: {p1: {id: 'p1', displayName: 'Anna', muted: true, handRaised: true, role: 'moderator'}}});
    expect(screen.getByTestId('participant-row-muted-p1')).toBeInTheDocument();
    expect(screen.getByTestId('participant-row-hand-p1')).toBeInTheDocument();
    expect(screen.getByTestId('participant-row-moderator-p1')).toBeInTheDocument();
});

it('pins the participant when the row is clicked', () => {
    const store = renderPanel({order: ['p1'], byId: {p1: {id: 'p1', displayName: 'Anna'}}});
    fireEvent.click(screen.getByTestId('participant-row-p1'));
    expect(store.dispatch).toHaveBeenCalledWith(setPinnedParticipant('p1'));
});

it('offers the moderation menu to a host', () => {
    renderPanel({order: ['p1'], byId: {p1: {id: 'p1', displayName: 'Anna'}}, localParticipantId: 'me', isHost: true});
    expect(screen.getByTestId('participant-menu-trigger-p1')).toBeInTheDocument();
});
```

Use the testid the existing `ParticipantMenu` renders for its trigger; read it from `participant_menu/component.tsx` rather than assuming.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd webapp && npx jest src/components/expanded_view/participant_panel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the panel**

Create `webapp/src/components/expanded_view/participant_panel.tsx`: a `260px`-wide column with `background: 'rgba(255,255,255,0.04)'`, a left border matching the header's border colour, `overflowY: 'auto'` and `flexShrink: 0`. For each id in `order`, render a row `<div data-testid={`participant-row-${id}`}>` that is clickable (`onClick` dispatching `setPinnedParticipant(id)`, `cursor: 'pointer'`, and a highlighted background when `pinnedParticipantId === id`), containing:

- the initials circle, reusing the same `initialsOf` helper the tile uses. It is module-private at `participant_tile.tsx:10` — add the `export` keyword there rather than duplicating the function;
- the display name, with `` ` (${t({de: 'Du', en: 'You'})})` `` appended when the id equals `localParticipantId`;
- badges with testids `participant-row-muted-${id}`, `participant-row-hand-${id}`, `participant-row-moderator-${id}`, reusing `MicOffIcon`, `HandIcon`, `CrownIcon` at `size={14}`;
- a speaking indicator when `isSpeaking`;
- `<ParticipantMenu participantId={id}/>`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd webapp && npx jest src/components/expanded_view`
Expected: PASS.

- [ ] **Step 5: Full verify loop and commit**

```bash
cd /home/user/project/webapp && npm test && npx tsc --noEmit && npx eslint src/
bash -lc 'cd /home/user/project && go test ./... && make dist'
cd /home/user/project && git add webapp/src/components/expanded_view && git commit -m "feat(ui): participant panel in the expanded view"
```

---

### Task 10: Wire the expanded view together

**Files:**
- Modify: `webapp/src/components/expanded_view/component.tsx`
- Test: `webapp/src/components/expanded_view/component.test.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 1-9.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

```ts
it('collapses on Escape', () => {
    const store = renderExpanded({});
    fireEvent.keyDown(window, {key: 'Escape'});
    expect(store.dispatch).toHaveBeenCalledWith(setExpanded(false));
});

it('toggles the microphone on M', () => {
    renderExpanded({});
    fireEvent.keyDown(window, {key: 'm'});
    expect(toggleMic).toHaveBeenCalled();
});

it('switches to the grid layout on 2', () => {
    renderExpanded({});
    fireEvent.keyDown(window, {key: '2'});
    expect(screen.getByTestId('grid-layout')).toBeInTheDocument();
});

it('renders the participant panel when it is open', () => {
    localStorage.setItem('opentalk:panel-open:v1', 'true');
    renderExpanded({order: ['p1'], byId: {p1: {id: 'p1', displayName: 'Anna'}}});
    expect(screen.getAllByTestId(/^participant-row-/)).toHaveLength(1);
});

it('hides the panel when it is closed', () => {
    localStorage.setItem('opentalk:panel-open:v1', 'false');
    renderExpanded({order: ['p1'], byId: {p1: {id: 'p1', displayName: 'Anna'}}});
    expect(screen.queryByTestId('participant-row-p1')).toBeNull();
});

it('binds no shortcuts while collapsed', () => {
    renderExpanded({expanded: false});
    fireEvent.keyDown(window, {key: 'm'});
    expect(toggleMic).not.toHaveBeenCalled();
});
```

Mock `../../conference/controller` in this file the way `controls_bar/component.test.tsx` does.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd webapp && npx jest src/components/expanded_view/component.test.tsx`
Expected: FAIL — no Escape handling, no shortcuts, no panel.

- [ ] **Step 3: Rewire `component.tsx`**

Keep the existing gates (`if (!expanded || status !== 'connected') return null;`), the raised-hands strip and `LeaveCallModal` and `onLeaveClick` exactly as they are. Replace the header block with `<ExpandedHeader .../>`, and change the body row to hold the layout and the panel side by side.

Add above the gates:

```tsx
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const [panelOpen, setPanelOpen] = usePanelOpen();
    const {isFullscreen, toggle: toggleFullscreen} = useFullscreen(overlayRef);
    const chrome = useAutoHide(expanded && status === 'connected');

    useCallShortcuts(expanded && status === 'connected', {
        onToggleMic: () => void toggleMic(),
        onToggleCam: () => void toggleCam(),
        onToggleScreen: () => void toggleScreenShare(),
        onToggleHand: () => (isRaised ? lowerLocalHand() : raiseLocalHand()),
        onToggleFullscreen: toggleFullscreen,
        onCollapse: () => dispatch(setExpanded(false)),
        onSetLayout: setMode,
    });
```

`isRaised` comes from the local participant's `handRaised` flag, the same expression `controls_bar/component.tsx` uses.

All hooks must sit above the early returns.

Attach `ref={overlayRef}` to the root overlay `div`. Wrap the header and the control-bar footer so they carry the auto-hide state:

```tsx
    const chromeStyle: React.CSSProperties = {
        opacity: chrome.visible ? 1 : 0,
        pointerEvents: chrome.visible ? 'auto' : 'none',
        transition: 'opacity 200ms ease',
    };
```

Spread `chromeStyle` and `chrome.holdProps` onto the header wrapper and the footer wrapper.

Body row:

```tsx
                <div style={{flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden'}}>
                    <div style={{flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden'}}>
                        {mode === 'speaker' && <SpeakerLayout/>}
                        {mode === 'grid' && <GridLayout/>}
                        {mode === 'screen-focus' && <ScreenFocusLayout/>}
                    </div>
                    {panelOpen && <ParticipantPanel/>}
                </div>
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd webapp && npx jest src/components/expanded_view`
Expected: PASS.

- [ ] **Step 5: Decide the auto-hide / open-menu interaction**

The design flags this: hiding the chrome while a moderation menu is open looks wrong. Check the behaviour by reading `participant_menu/component.tsx` — the menu portals to `document.body`, so hidden chrome does not move it. Either leave it (the menu stays usable and the chrome fades independently) or keep the chrome visible while a menu is open. Pick one, implement it, and state the choice and the reason in the commit message.

- [ ] **Step 6: Full verify loop and commit**

```bash
cd /home/user/project/webapp && npm test && npx tsc --noEmit && npx eslint src/
bash -lc 'cd /home/user/project && go test ./... && make dist'
cd /home/user/project && git add webapp/src/components/expanded_view && git commit -m "feat(ui): wire header, panel, shortcuts and auto-hide into the expanded view"
```

---

## Manual verification (after Task 10)

jsdom cannot exercise any of this. Build a bundle and check in the real client:

1. Grid with 1, 2, 3, 5 and 9 participants — tiles fill the viewport, keep 16:9, and stay centred.
2. Pin a participant in the panel and on a tile; the speaker layout follows the pin, the pin survives a layout switch, and it clears when the pinned participant leaves.
3. `M`, `V`, `S`, `H`, `F`, `1`, `2`, `3`, `Escape`. Then check that Mattermost's own shortcuts still work with the overlay closed.
4. Auto-hide: chrome fades after 4s, returns on mouse movement, stays while the pointer rests on the control bar.
5. Real fullscreen: the toggle enters and leaves, the button reflects state when leaving via the browser's own Escape.
6. Panel open/closed survives a reload.
7. Screen share: the header names the sharer, and the sharer appears once in screen-focus.
