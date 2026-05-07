/**
 * controller.test.ts
 *
 * Strategy:
 *   - Mock OpenTalkConferenceClient and LiveKitRoom with tiny EventEmitter shims.
 *     The shims expose a "trigger" function (no underscore) via a module-level
 *     registry so tests can fire events without violating no-underscore-dangle.
 *   - Mock rest / desktop / livekit helpers so no real I/O happens.
 *   - Use a lightweight Redux store (createStore + plain reducer) to inspect
 *     dispatched actions.
 *   - Call _reset() in beforeEach to wipe the module-level singletons.
 *   - Use jest.useFakeTimers() for the heartbeat setInterval.
 */

// eslint-disable-next-line import/order
import {createStore} from 'redux';

// ── shared registry for mock instances ───────────────────────────────────
// A virtual "helpers" module is registered before the real imports so the
// mock factories can use it to hand instances back to tests.
jest.mock('./controller.test.helpers', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reg: {client: any; lk: any} = {client: null, lk: null};
    return {
        reg,
        setClient(c: unknown) {
            reg.client = c;
        },
        setLiveKit(l: unknown) {
            reg.lk = l;
        },
    };
}, {virtual: true});

// ── mock: ./client ────────────────────────────────────────────────────────
jest.mock('./client', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const helpers = require('./controller.test.helpers');

    // Minimal EventEmitter built entirely inside the factory.
    class MockClient {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        private listeners: Record<string, Array<(d: any) => void>> = {};

        constructor(_url: string) { // eslint-disable-line @typescript-eslint/no-unused-vars
            helpers.setClient(this);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        on(ev: string, cb: (d: any) => void) {
            (this.listeners[ev] = this.listeners[ev] || []).push(cb);
            return () => { /* no-op */ };
        }

        // Called by tests via helpers.reg.client.trigger(ev, data)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trigger(ev: string, d?: any) {
            (this.listeners[ev] || []).slice().forEach((cb: (x: unknown) => void) => cb(d));
        }

        connect = jest.fn().mockResolvedValue(undefined);
        leave = jest.fn().mockResolvedValue(undefined);
        raiseHand = jest.fn();
        lowerHand = jest.fn();
        enableRaiseHands = jest.fn();
        getParticipants = jest.fn().mockReturnValue([]);
        getState = jest.fn().mockReturnValue('connected');
    }

    return {OpenTalkConferenceClient: MockClient};
});

// ── mock: ./livekit/room ──────────────────────────────────────────────────
jest.mock('./livekit/room', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const helpers = require('./controller.test.helpers');

    class MockLiveKitRoom {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        private listeners: Record<string, Array<(d: any) => void>> = {};

        constructor() {
            helpers.setLiveKit(this);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        on(ev: string, cb: (d: any) => void) {
            (this.listeners[ev] = this.listeners[ev] || []).push(cb);
            return () => { /* no-op */ };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trigger(ev: string, d?: any) {
            (this.listeners[ev] || []).slice().forEach((cb: (x: unknown) => void) => cb(d));
        }

        connect = jest.fn().mockResolvedValue(undefined);
        disconnect = jest.fn().mockResolvedValue(undefined);
        enableMic = jest.fn().mockResolvedValue(undefined);
        disableMic = jest.fn().mockResolvedValue(undefined);
        enableCam = jest.fn().mockResolvedValue(undefined);
        disableCam = jest.fn().mockResolvedValue(undefined);
        enableScreenShare = jest.fn().mockResolvedValue(undefined);
        enableScreenShareFromStream = jest.fn().mockResolvedValue(undefined);
        disableScreenShare = jest.fn().mockResolvedValue(undefined);
        isMicEnabled = jest.fn().mockReturnValue(false);
        isCamEnabled = jest.fn().mockReturnValue(false);
        isScreenShareEnabled = jest.fn().mockReturnValue(false);
        getLocalIdentity = jest.fn().mockReturnValue('local-id');
        getLocalScreenTrack = jest.fn().mockReturnValue(undefined);
        camTrack: unknown = undefined;
    }

    return {LiveKitRoom: MockLiveKitRoom};
});

// ── other mocks ───────────────────────────────────────────────────────────
jest.mock('../client/rest', () => ({
    getOrCreateDeviceSecret: jest.fn().mockReturnValue('device-secret-xyz'),
    heartbeat: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./livekit/desktop_capturer', () => ({
    isElectron: jest.fn().mockReturnValue(false),
    getDesktopSources: jest.fn().mockResolvedValue([{id: 'src-1', name: 'Screen 1', thumbnailURL: ''}]),
    captureDesktopStream: jest.fn().mockResolvedValue({
        getVideoTracks: () => [{kind: 'video'}],
    }),
}));

jest.mock('./livekit/screen_picker', () => ({
    pickScreenSource: jest.fn().mockResolvedValue('src-1'),
}));

jest.mock('./livekit/devices', () => ({
    getMuteOnJoin: jest.fn().mockReturnValue(true), // mute-on-join keeps tests simple
}));

jest.mock('./livekit/track_registry', () => ({
    register: jest.fn(),
    unregister: jest.fn(),
    clear: jest.fn(),
    get: jest.fn(),
}));

// ── module under test ─────────────────────────────────────────────────────
import {
    setActiveStore,
    startConferenceConnection,
    leaveActiveConference,
    endActiveMeeting,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    raiseLocalHand,
    lowerLocalHand,
    _reset, // eslint-disable-line no-underscore-dangle
} from './controller';
import {isElectron, getDesktopSources, captureDesktopStream} from './livekit/desktop_capturer';
import {pickScreenSource} from './livekit/screen_picker';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const helpers = require('./controller.test.helpers');

// ── convenience accessors ─────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function c(): any {
    return helpers.reg.client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lkRoom(): any {
    return helpers.reg.lk;
}

// ── store helper ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = {type: string; payload?: any};
let dispatched: AnyAction[] = [];

const PLUGIN_KEY = 'plugins-com.github.morzan1001.mattermost-plugin-opentalk';

function makeTestStore(channelID?: string) {
    dispatched = [];
    const store = createStore(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (state: any = {[PLUGIN_KEY]: {session: {channelID}}}, action: AnyAction) => {
            dispatched.push(action);
            return state;
        },
    );
    return store;
}

// ── fetch mock ────────────────────────────────────────────────────────────
const mockFetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({})});

// ── setup / teardown ──────────────────────────────────────────────────────
beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = mockFetch;
});

beforeEach(() => {
    _reset(); // eslint-disable-line no-underscore-dangle
    helpers.reg.client = null;
    helpers.reg.lk = null;
    dispatched = [];
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ok: true, json: async () => ({})});
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

// ── tests ─────────────────────────────────────────────────────────────────

describe('setActiveStore', () => {
    it('does not throw and stores the store reference', () => {
        const store = makeTestStore();
        expect(() => setActiveStore(store)).not.toThrow();
    });
});

describe('startConferenceConnection', () => {
    it('dispatches connectStarted with channelID and roomID', () => {
        const store = makeTestStore();
        startConferenceConnection('room-42', 'ch-99', 'Alice', store);
        const cs = dispatched.find((a) => a.type === 'opentalk/session/connect_started');
        expect(cs).toBeDefined();
        expect(cs?.payload).toMatchObject({channelID: 'ch-99', roomID: 'room-42'});
    });

    it('instantiates client and calls client.connect()', async () => {
        const store = makeTestStore();
        await startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        expect(c().connect).toHaveBeenCalledWith('room-1', 'ch-1', 'Alice', 'device-secret-xyz');
    });

    it('is a no-op when already connected (duplicate call)', () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        const prevLen = dispatched.length;
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        expect(dispatched.length).toBe(prevLen);
    });
});

describe('"connected" client event', () => {
    it('dispatches connected + participantsBulkSet and starts heartbeat', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();

        c().trigger('connected', {
            participants: [{id: 'p-self', displayName: 'Alice'}, {id: 'p-other', displayName: 'Bob'}],
            isHost: true,
            livekit: undefined,
        });

        const connectedAction = dispatched.find((a) => a.type === 'opentalk/session/connected');
        expect(connectedAction?.payload).toMatchObject({
            participantCount: 2,
            isHost: true,
            localParticipantId: 'p-self',
        });

        const bulkSet = dispatched.find((a) => a.type === 'opentalk/participants/bulk_set');
        expect(bulkSet?.payload?.participants).toHaveLength(2);

        // Heartbeat timer started
        expect(jest.getTimerCount()).toBeGreaterThan(0);

        // setOpenTalkStatus PUT
        expect(mockFetch).toHaveBeenCalledWith(
            '/api/v4/users/me/status/custom',
            expect.objectContaining({method: 'PUT'}),
        );
    });

    it('brings up LiveKit when livekit credentials are inline in connected event', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();

        c().trigger('connected', {
            participants: [{id: 'p-self', displayName: 'Alice'}],
            isHost: false,
            livekit: {url: 'wss://lk.example', token: 'tok-123'},
        });
        await Promise.resolve();

        expect(lkRoom().connect).toHaveBeenCalledWith('wss://lk.example', 'tok-123');
    });
});

describe('"closed" client event', () => {
    it('dispatches disconnected + participantsReset, stops heartbeat, clears status', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();

        c().trigger('connected', {
            participants: [{id: 'p-self', displayName: 'Alice'}],
            isHost: false,
        });

        dispatched = [];
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({ok: true});

        c().trigger('closed', {code: 1000});

        const types = dispatched.map((a) => a.type);
        expect(types).toContain('opentalk/session/disconnected');
        expect(types).toContain('opentalk/participants/reset');
        expect(jest.getTimerCount()).toBe(0);
        expect(mockFetch).toHaveBeenCalledWith(
            '/api/v4/users/me/status/custom',
            expect.objectContaining({method: 'DELETE'}),
        );
    });
});

describe('"error" client event', () => {
    it('dispatches connectError + participantsReset and cleans up', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();

        c().trigger('connected', {participants: [{id: 'self', displayName: 'Alice'}], isHost: false});
        dispatched = [];
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({ok: true});

        c().trigger('error', new Error('ws gone'));

        const errAction = dispatched.find((a) => a.type === 'opentalk/session/connect_error');
        expect(errAction?.payload?.error).toBe('ws gone');
        const types = dispatched.map((a) => a.type);
        expect(types).toContain('opentalk/participants/reset');
        expect(jest.getTimerCount()).toBe(0);
    });
});

describe('"participant_joined" / "participant_left" client events', () => {
    it('dispatches participantsChanged + participantAdded on participant_joined', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'self', displayName: 'Alice'}], isHost: false});

        dispatched = [];
        c().getParticipants.mockReturnValue([{id: 'self'}, {id: 'other'}]);
        c().trigger('participant_joined', {id: 'other', displayName: 'Bob'});

        const types = dispatched.map((a) => a.type);
        expect(types).toContain('opentalk/session/participants_changed');
        expect(types).toContain('opentalk/participants/added');
    });

    it('dispatches participantsChanged + participantRemoved on participant_left', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {
            participants: [{id: 'self', displayName: 'Alice'}, {id: 'other', displayName: 'Bob'}],
            isHost: false,
        });

        dispatched = [];
        c().getParticipants.mockReturnValue([{id: 'self'}]);
        c().trigger('participant_left', {id: 'other'});

        const types = dispatched.map((a) => a.type);
        expect(types).toContain('opentalk/session/participants_changed');
        expect(types).toContain('opentalk/participants/removed');
    });
});

describe('leaveActiveConference', () => {
    it('calls client.leave() and stops heartbeat', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'self', displayName: 'Alice'}], isHost: false});

        const clientRef = c();
        await leaveActiveConference();

        expect(clientRef.leave).toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });
});

describe('endActiveMeeting', () => {
    it('calls leaveActiveConference then POSTs /api/v1/meetings/end', async () => {
        const store = makeTestStore('ch-end');
        setActiveStore(store);

        startConferenceConnection('room-1', 'ch-end', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'self', displayName: 'Alice'}], isHost: false});

        mockFetch.mockResolvedValue({ok: true});
        await endActiveMeeting();

        const endCall = mockFetch.mock.calls.find(
            ([url]: [string]) => String(url).includes('/api/v1/meetings/end'),
        );
        expect(endCall).toBeDefined();
        expect(endCall![1].method).toBe('POST');
    });
});

describe('toggleMic', () => {
    it('is a no-op when activeLiveKit is null', async () => {
        const store = makeTestStore();
        setActiveStore(store);
        dispatched = [];
        await toggleMic();
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_mic_enabled')).toBeUndefined();
    });

    it('enables mic and dispatches setMicEnabled(true) when mic is off', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {
            participants: [{id: 'self', displayName: 'Alice'}],
            isHost: false,
            livekit: {url: 'wss://lk.example', token: 'tok'},
        });
        await Promise.resolve();

        setActiveStore(store);
        lkRoom().isMicEnabled.mockReturnValue(false);
        dispatched = [];

        await toggleMic();

        expect(lkRoom().enableMic).toHaveBeenCalled();
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_mic_enabled')?.payload?.value).toBe(true);
    });

    it('disables mic and dispatches setMicEnabled(false) when mic is on', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {
            participants: [{id: 'self', displayName: 'Alice'}],
            isHost: false,
            livekit: {url: 'wss://lk.example', token: 'tok'},
        });
        await Promise.resolve();

        setActiveStore(store);
        lkRoom().isMicEnabled.mockReturnValue(true);
        dispatched = [];

        await toggleMic();

        expect(lkRoom().disableMic).toHaveBeenCalled();
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_mic_enabled')?.payload?.value).toBe(false);
    });
});

describe('toggleCam', () => {
    it('is a no-op when activeLiveKit is null', async () => {
        const store = makeTestStore();
        setActiveStore(store);
        dispatched = [];
        await toggleCam();
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_cam_enabled')).toBeUndefined();
    });

    it('enables cam and dispatches setCamEnabled(true) when cam is off', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {
            participants: [{id: 'self', displayName: 'Alice'}],
            isHost: false,
            livekit: {url: 'wss://lk.example', token: 'tok'},
        });
        await Promise.resolve();

        setActiveStore(store);
        lkRoom().isCamEnabled.mockReturnValue(false);
        lkRoom().camTrack = undefined;
        dispatched = [];

        await toggleCam();

        expect(lkRoom().enableCam).toHaveBeenCalled();
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_cam_enabled')?.payload?.value).toBe(true);
    });
});

describe('toggleScreenShare', () => {
    it('is a no-op when activeLiveKit is null', async () => {
        const store = makeTestStore();
        setActiveStore(store);
        dispatched = [];
        await toggleScreenShare();
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_screen_share_enabled')).toBeUndefined();
    });

    it('calls lk.enableScreenShare() on the non-Electron path', async () => {
        (isElectron as jest.Mock).mockReturnValue(false);

        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {
            participants: [{id: 'self', displayName: 'Alice'}],
            isHost: false,
            livekit: {url: 'wss://lk.example', token: 'tok'},
        });
        await Promise.resolve();

        setActiveStore(store);
        lkRoom().isScreenShareEnabled.mockReturnValue(false);
        lkRoom().getLocalScreenTrack.mockReturnValue(undefined);
        dispatched = [];

        await toggleScreenShare();

        expect(lkRoom().enableScreenShare).toHaveBeenCalled();
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_screen_share_enabled')?.payload?.value).toBe(true);
    });

    it('uses Electron path: getDesktopSources → pickScreenSource → captureDesktopStream → enableScreenShareFromStream', async () => {
        (isElectron as jest.Mock).mockReturnValue(true);
        const fakeStream = {getVideoTracks: () => [{kind: 'video'}]};
        (captureDesktopStream as jest.Mock).mockResolvedValue(fakeStream);
        (pickScreenSource as jest.Mock).mockResolvedValue('src-1');
        (getDesktopSources as jest.Mock).mockResolvedValue([{id: 'src-1', name: 'Screen 1', thumbnailURL: ''}]);

        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {
            participants: [{id: 'self', displayName: 'Alice'}],
            isHost: false,
            livekit: {url: 'wss://lk.example', token: 'tok'},
        });
        await Promise.resolve();

        setActiveStore(store);
        lkRoom().isScreenShareEnabled.mockReturnValue(false);
        dispatched = [];

        await toggleScreenShare();

        expect(getDesktopSources).toHaveBeenCalled();
        expect(pickScreenSource).toHaveBeenCalled();
        expect(captureDesktopStream).toHaveBeenCalledWith('src-1');
        expect(lkRoom().enableScreenShareFromStream).toHaveBeenCalledWith(fakeStream);
    });
});

describe('raiseLocalHand / lowerLocalHand', () => {
    it('proxies raiseLocalHand() to client.raiseHand()', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();

        raiseLocalHand();
        expect(c().raiseHand).toHaveBeenCalled();
    });

    it('proxies lowerLocalHand() to client.lowerHand()', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();

        lowerLocalHand();
        expect(c().lowerHand).toHaveBeenCalled();
    });

    it('raiseLocalHand is a no-op when activeClient is null', () => {
        // _reset() was called in beforeEach → activeClient === null
        expect(() => raiseLocalHand()).not.toThrow();
    });
});

describe('LiveKit "disconnected" event (recently-fixed: activeLiveKit nulled)', () => {
    it('dispatches setLivekitConnected(false) + tracksReset and nulls activeLiveKit', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {
            participants: [{id: 'self', displayName: 'Alice'}],
            isHost: false,
            livekit: {url: 'wss://lk.example', token: 'tok'},
        });
        await Promise.resolve();

        dispatched = [];
        lkRoom().trigger('disconnected');

        const types = dispatched.map((a) => a.type);
        expect(types).toContain('opentalk/session/set_livekit_connected');
        expect(types).toContain('opentalk/tracks/reset');

        // activeLiveKit is now null — toggleMic should be a no-op
        setActiveStore(store);
        dispatched = [];
        await toggleMic();
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_mic_enabled')).toBeUndefined();
    });
});

describe('hand_raised / hand_lowered / raise_hands_toggled events', () => {
    it('dispatches handRaised on hand_raised', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'self', displayName: 'Alice'}], isHost: false});

        dispatched = [];
        c().trigger('hand_raised', {participantId: 'p42'});

        const action = dispatched.find((a) => a.type === 'opentalk/participants/hand_raised');
        expect(action?.payload?.participantID).toBe('p42');
    });

    it('dispatches handLowered on hand_lowered', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'self', displayName: 'Alice'}], isHost: false});

        dispatched = [];
        c().trigger('hand_lowered', {participantId: 'p42'});

        const action = dispatched.find((a) => a.type === 'opentalk/participants/hand_lowered');
        expect(action?.payload?.participantID).toBe('p42');
    });

    it('dispatches setRaiseHandsEnabled on raise_hands_toggled', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'self', displayName: 'Alice'}], isHost: false});

        dispatched = [];
        c().trigger('raise_hands_toggled', {enabled: false});

        const action = dispatched.find((a) => a.type === 'opentalk/session/set_raise_hands_enabled');
        expect(action?.payload?.value).toBe(false);
    });
});
