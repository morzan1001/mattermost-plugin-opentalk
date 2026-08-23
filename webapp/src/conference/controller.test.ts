// eslint-disable-next-line import/order
import {createStore} from 'redux';

// ── shared registry for mock instances ───────────────────────────────────
// A virtual "helpers" module is registered before the real imports so the
// mock factories can use it to hand instances back to tests.
jest.mock('./controller.test.helpers', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reg: {client: any; lk: any; livekitConnectError: Error | null; livekitConnectFactory: (() => Promise<void>) | null; clientConnectFactory: (() => Promise<void>) | null} = {client: null, lk: null, livekitConnectError: null, livekitConnectFactory: null, clientConnectFactory: null};
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

        connect = jest.fn().mockImplementation(() => {
            if (helpers.reg.clientConnectFactory) {
                return helpers.reg.clientConnectFactory();
            }
            return Promise.resolve();
        });
        leave = jest.fn().mockResolvedValue(undefined);
        raiseHand = jest.fn();
        lowerHand = jest.fn();
        enableRaiseHands = jest.fn();
        sendDebrief = jest.fn();
        forceMute = jest.fn();
        kick = jest.fn();
        ban = jest.fn();
        grantModerator = jest.fn();
        revokeModerator = jest.fn();
        resetRaisedHands = jest.fn();
        grantScreenShare = jest.fn();
        revokeScreenShare = jest.fn();
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

        connect = jest.fn().mockImplementation(() => {
            if (helpers.reg.livekitConnectFactory) {
                return helpers.reg.livekitConnectFactory();
            }
            return helpers.reg.livekitConnectError ? Promise.reject(helpers.reg.livekitConnectError) : Promise.resolve();
        });
        disconnect = jest.fn().mockResolvedValue(undefined);
        enableMic = jest.fn().mockResolvedValue(undefined);
        disableMic = jest.fn().mockResolvedValue(undefined);
        enableCam = jest.fn().mockResolvedValue(undefined);
        disableCam = jest.fn().mockResolvedValue(undefined);
        enableScreenShareFromStream = jest.fn().mockResolvedValue(undefined);
        disableScreenShare = jest.fn().mockResolvedValue(undefined);
        isMicEnabled = jest.fn().mockReturnValue(false);
        isCamEnabled = jest.fn().mockReturnValue(false);
        isScreenShareEnabled = jest.fn().mockReturnValue(false);
        getLocalIdentity = jest.fn().mockReturnValue('local-id');
        getLocalScreenTrack = jest.fn().mockReturnValue(undefined);
        camTrack: unknown = undefined;
    }

    return {
        LiveKitRoom: MockLiveKitRoom,
        participantIdFromIdentity: (identity: string) => identity.split(':')[0],
    };
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
    forceMute,
    muteAll,
    kick,
    ban,
    grantModerator,
    revokeModerator,
    resetHand,
    grantScreenShare,
    revokeScreenShare,
    _reset, // eslint-disable-line no-underscore-dangle
} from './controller';
import {isElectron, getDesktopSources, captureDesktopStream} from './livekit/desktop_capturer';
import {pickScreenSource} from './livekit/screen_picker';
import {JoinCancelledError} from './signaling/conference_room';

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

function makeTestStoreWithSession(session: Record<string, unknown>) {
    dispatched = [];
    const store = createStore(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (state: any = {[PLUGIN_KEY]: {session}}, action: AnyAction) => {
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
    helpers.reg.livekitConnectError = null;
    helpers.reg.livekitConnectFactory = null;
    helpers.reg.clientConnectFactory = null;
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

describe('"livekit_credentials" client event', () => {
    it('surfaces a notice when the media connection cannot be established', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();

        helpers.reg.livekitConnectError = new Error('could not establish pc connection');
        c().trigger('livekit_credentials', {url: 'wss://livekit.example', token: 'tok'});
        await Promise.resolve();
        await Promise.resolve();

        const notice = dispatched.find((a) => a.type === 'opentalk/notice/set');
        expect(notice?.payload?.kind).toBe('error');
        expect(notice?.payload?.message).toContain('Audio');
        expect(dispatched.some((a) => a.type === 'opentalk/session/set_livekit_connected' && a.payload?.value === false)).toBe(true);
    });

    it('dispatches no notice when the media connection succeeds', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();

        c().trigger('livekit_credentials', {url: 'wss://livekit.example', token: 'tok'});
        await Promise.resolve();
        await Promise.resolve();

        expect(dispatched.find((a) => a.type === 'opentalk/notice/set')).toBeUndefined();
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

        // setOpenTalkStatus first GETs /api/v4/users/me to snapshot the
        // user's prior status, then PUTs the OpenTalk one — flush both
        // microtasks before asserting.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
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
    const flush = async () => {
        for (let i = 0; i < 5; i++) {
            // eslint-disable-next-line no-await-in-loop
            await Promise.resolve();
        }
    };

    it('waits for the classified close event on a mid-call socket error', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();

        c().trigger('connected', {participants: [{id: 'self', displayName: 'Alice'}], isHost: false});
        await Promise.resolve();
        dispatched = [];
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({ok: true});

        c().trigger('error', new Error('signaling connection lost'));
        await flush();

        // Every socket error is followed by a close carrying the code;
        // reporting here would mislabel the drop as a failed join.
        expect(dispatched.find((a) => a.type === 'opentalk/session/connect_error')).toBeUndefined();
        expect(dispatched.find((a) => a.type === 'opentalk/notice/set')).toBeUndefined();

        c().trigger('closed', {code: 1006, recoverable: true});
        await flush();

        const notice = dispatched.find((a) => a.type === 'opentalk/notice/set');
        expect(notice?.payload?.message).toBe('Lost connection to the meeting server');
        expect(dispatched.find((a) => a.type === 'opentalk/participants/reset')).toBeDefined();
        expect(jest.getTimerCount()).toBe(0);
    });

    it('reports a join-phase socket error immediately as a join failure', async () => {
        const store = makeTestStore();
        let rejectConnect!: (e: Error) => void;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        helpers.reg.clientConnectFactory = (): Promise<void> => new Promise((_resolve, reject) => {
            rejectConnect = reject;
        });
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();

        c().trigger('error', new Error('could not reach the signaling server'));
        await flush();

        const errAction = dispatched.find((a) => a.type === 'opentalk/session/connect_error');
        expect(errAction?.payload?.error).toBe('could not reach the signaling server');
        expect(dispatched.filter((a) => a.type === 'opentalk/notice/set')).toHaveLength(1);

        // The eventual close of the aborted socket must not add a second toast.
        rejectConnect(new Error('socket closed before joinSuccess'));
        await flush();
        expect(dispatched.filter((a) => a.type === 'opentalk/notice/set')).toHaveLength(1);
    });
});

describe('classified drop notices', () => {
    const flush = async () => {
        for (let i = 0; i < 5; i++) {
            // eslint-disable-next-line no-await-in-loop
            await Promise.resolve();
        }
    };

    async function connectActive(withLiveKit = false) {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {
            participants: [{id: 'self', displayName: 'Alice'}],
            isHost: false,
            ...(withLiveKit && {livekit: {url: 'wss://lk.example', token: 'tok'}}),
        });
        await Promise.resolve();
    }

    function notices(): AnyAction[] {
        return dispatched.filter((a) => a.type === 'opentalk/notice/set');
    }

    it('shows the connection-lost notice on a recoverable remote close', async () => {
        await connectActive();
        dispatched = [];

        c().trigger('closed', {code: 1006, recoverable: true});
        await flush();

        expect(notices()).toHaveLength(1);
        expect(notices()[0].payload?.kind).toBe('error');
        expect(notices()[0].payload?.message).toBe('Lost connection to the meeting server');
    });

    it('shows a neutral notice on a terminal remote close', async () => {
        await connectActive();
        dispatched = [];

        c().trigger('closed', {code: 1000, recoverable: false});
        await flush();

        expect(notices()).toHaveLength(1);
        expect(notices()[0].payload?.message).toBe('The meeting connection was closed');
    });

    it('shows the media-drop notice when LiveKit drops unexpectedly', async () => {
        await connectActive(true);
        dispatched = [];

        lkRoom().trigger('disconnected');
        await flush();

        expect(notices()).toHaveLength(1);
        expect(notices()[0].payload?.message).toBe('Media connection dropped');
    });

    it('dispatches exactly one notice when signaling and media both drop', async () => {
        await connectActive(true);
        const staleLk = lkRoom();
        dispatched = [];

        c().trigger('closed', {code: 1006, recoverable: true});
        await flush();
        staleLk.trigger('disconnected');
        await flush();

        expect(notices()).toHaveLength(1);
    });

    it('defers a close during the join to the connect rejection path', async () => {
        let rejectConnect!: (e: Error) => void;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        helpers.reg.clientConnectFactory = (): Promise<void> => new Promise((_resolve, reject) => {
            rejectConnect = reject;
        });
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();

        c().trigger('closed', {code: 1006, recoverable: true});
        await flush();

        // The rejection path owns join-phase reporting; reporting here too
        // would double up with the join-failure toast.
        expect(dispatched.find((a) => a.type === 'opentalk/notice/set')).toBeUndefined();
        expect(dispatched.find((a) => a.type === 'opentalk/session/disconnected')).toBeUndefined();

        rejectConnect(new Error('socket closed before joinSuccess'));
        await flush();

        expect(notices()).toHaveLength(1);
        expect(dispatched.find((a) => a.type === 'opentalk/session/connect_error')).toBeDefined();
    });
});

describe('stale session events after teardown', () => {
    const flush = async () => {
        for (let i = 0; i < 5; i++) {
            // eslint-disable-next-line no-await-in-loop
            await Promise.resolve();
        }
    };

    it('a late socket error after an intentional leave dispatches nothing', async () => {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'self', displayName: 'Alice'}], isHost: false});
        await leaveActiveConference();

        dispatched = [];
        c().trigger('error', new Error('ws gone'));
        await flush();

        expect(dispatched.find((a) => a.type === 'opentalk/notice/set')).toBeUndefined();
        expect(dispatched.find((a) => a.type === 'opentalk/session/connect_error')).toBeUndefined();
        expect(dispatched.find((a) => a.type === 'opentalk/session/disconnected')).toBeUndefined();
    });

    it("a stale client's late closed/error cannot tear down a newer call", async () => {
        const store1 = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store1);
        await Promise.resolve();
        const stale = c();
        stale.trigger('connected', {participants: [{id: 'self', displayName: 'Alice'}], isHost: false});
        await leaveActiveConference();

        const store2 = makeTestStore();
        startConferenceConnection('room-2', 'ch-2', 'Bob', store2);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'self', displayName: 'Bob'}], isHost: false});
        await Promise.resolve();

        dispatched = [];
        stale.trigger('closed', {code: 1000});
        stale.trigger('error', new Error('ws gone'));
        await flush();

        expect(dispatched.find((a) => a.type === 'opentalk/session/disconnected')).toBeUndefined();
        expect(dispatched.find((a) => a.type === 'opentalk/notice/set')).toBeUndefined();
        expect(dispatched.find((a) => a.type === 'opentalk/participants/reset')).toBeUndefined();

        // The newer call's heartbeat keeps running.
        expect(jest.getTimerCount()).toBeGreaterThan(0);
    });

    it("a stale LiveKit room's late disconnect cannot tear down a newer call", async () => {
        const store1 = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store1);
        await Promise.resolve();
        c().trigger('connected', {
            participants: [{id: 'self', displayName: 'Alice'}],
            isHost: false,
            livekit: {url: 'wss://lk.example', token: 'tok'},
        });
        await Promise.resolve();
        const staleLk = lkRoom();
        await leaveActiveConference();

        const store2 = makeTestStore();
        startConferenceConnection('room-2', 'ch-2', 'Bob', store2);
        await Promise.resolve();
        c().trigger('connected', {
            participants: [{id: 'self', displayName: 'Bob'}],
            isHost: false,
            livekit: {url: 'wss://lk.example', token: 'tok'},
        });
        await Promise.resolve();

        dispatched = [];
        staleLk.trigger('disconnected');
        await flush();

        expect(dispatched.find((a) => a.type === 'opentalk/session/disconnected')).toBeUndefined();

        // The newer call's heartbeat keeps running.
        expect(jest.getTimerCount()).toBeGreaterThan(0);
    });

    it('a late LiveKit connect rejection leaves the active room intact', async () => {
        let rejectConnect!: (err: Error) => void;
        helpers.reg.livekitConnectFactory = () => new Promise((_resolve, reject) => {
            rejectConnect = reject;
        });

        const store1 = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store1);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'self', displayName: 'Alice'}], isHost: false});
        c().trigger('livekit_credentials', {url: 'wss://lk.example', token: 'tok'});
        await Promise.resolve();
        await leaveActiveConference();

        helpers.reg.livekitConnectFactory = null;
        const store2 = makeTestStore();
        startConferenceConnection('room-2', 'ch-2', 'Bob', store2);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'self', displayName: 'Bob'}], isHost: false});
        c().trigger('livekit_credentials', {url: 'wss://lk.example', token: 'tok'});
        await Promise.resolve();

        dispatched = [];
        rejectConnect(new Error('late pc failure'));
        await flush();

        expect(dispatched.find((a) => a.type === 'opentalk/session/set_livekit_connected' && a.payload?.value === false)).toBeUndefined();
        expect(dispatched.find((a) => a.type === 'opentalk/session/disconnected')).toBeUndefined();
        expect(dispatched.find((a) => a.type === 'opentalk/notice/set')).toBeUndefined();

        // Positive: the surviving room still drives media controls.
        setActiveStore(store2);
        dispatched = [];
        await toggleMic();
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_mic_enabled')).toBeDefined();
    });

    it('reports no failure when leave cancels an in-flight join', async () => {
        helpers.reg.clientConnectFactory = () => Promise.reject(new JoinCancelledError());
        const store = makeTestStore();
        await startConferenceConnection('room-1', 'ch-1', 'Alice', store);

        expect(dispatched.find((a) => a.type === 'opentalk/notice/set')).toBeUndefined();
        expect(dispatched.find((a) => a.type === 'opentalk/session/connect_error')).toBeUndefined();
    });

    it('still reports a genuine join failure through the connect rejection path', async () => {
        helpers.reg.clientConnectFactory = () => Promise.reject(new Error('boom'));
        const store = makeTestStore();
        await startConferenceConnection('room-1', 'ch-1', 'Alice', store);

        expect(dispatched.find((a) => a.type === 'opentalk/session/connect_error')?.payload?.error).toBe('boom');
        expect(dispatched.find((a) => a.type === 'opentalk/notice/set')).toBeDefined();
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

    it('surfaces a notice and still leaves when the end REST call fails', async () => {
        const store = makeTestStore('ch-end');
        setActiveStore(store);

        startConferenceConnection('room-1', 'ch-end', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'self', displayName: 'Alice'}], isHost: true});

        const clientRef = c();
        mockFetch.mockResolvedValue({ok: false, status: 403, json: async () => ({})});
        dispatched = [];

        await endActiveMeeting();

        // Local leave still completed.
        expect(clientRef.leave).toHaveBeenCalled();
        expect(dispatched.map((a) => a.type)).toContain('opentalk/session/disconnected');

        const notice = dispatched.find((a) => a.type === 'opentalk/notice/set');
        expect(notice).toBeDefined();
        expect(notice?.payload?.kind).toBe('error');
        expect(notice?.payload?.message).toBe('Failed to end the meeting');
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

    it('uses getDisplayMedia on the non-Electron path', async () => {
        (isElectron as jest.Mock).mockReturnValue(false);
        const fakeStream = {getVideoTracks: () => [{kind: 'video'}]};
        Object.defineProperty(navigator, 'mediaDevices', {
            value: {getDisplayMedia: jest.fn().mockResolvedValue(fakeStream)},
            configurable: true,
        });

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

        expect(lkRoom().enableScreenShareFromStream).toHaveBeenCalledWith(fakeStream);
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_screen_share_enabled')?.payload?.value).toBe(true);
    });

    it('falls back to Electron desktopAPI bridge when getDisplayMedia rejects in Electron', async () => {
        (isElectron as jest.Mock).mockReturnValue(true);
        Object.defineProperty(navigator, 'mediaDevices', {
            value: {getDisplayMedia: jest.fn().mockRejectedValue(new Error('not supported'))},
            configurable: true,
        });
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

describe('host moderation actions', () => {
    async function connectHost() {
        const store = makeTestStoreWithSession({localParticipantId: 'p-self'});
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'p-self', displayName: 'Alice'}], isHost: true});
        return store;
    }

    it('forwards each moderation action to the client', async () => {
        await connectHost();
        forceMute('p2');
        kick('p2');
        ban('p2');
        grantModerator('p2');
        revokeModerator('p2');
        resetHand('p2');
        grantScreenShare('p2');
        revokeScreenShare('p2');

        expect(c().forceMute).toHaveBeenCalledWith(['p2']);
        expect(c().kick).toHaveBeenCalledWith('p2');
        expect(c().ban).toHaveBeenCalledWith('p2');
        expect(c().grantModerator).toHaveBeenCalledWith('p2');
        expect(c().revokeModerator).toHaveBeenCalledWith('p2');
        expect(c().resetRaisedHands).toHaveBeenCalledWith('p2');
        expect(c().grantScreenShare).toHaveBeenCalledWith(['p2']);
        expect(c().revokeScreenShare).toHaveBeenCalledWith(['p2']);
    });

    it('muteAll sends one forceMute with all non-self ids', async () => {
        await connectHost();
        c().getParticipants.mockReturnValue([{id: 'p-self'}, {id: 'p2'}, {id: 'p3'}]);

        muteAll();

        expect(c().forceMute).toHaveBeenCalledTimes(1);
        expect(c().forceMute).toHaveBeenCalledWith(['p2', 'p3']);
    });

    it('is a no-op when there is no active client', () => {
        // _reset() in beforeEach cleared activeClient.
        expect(() => kick('p2')).not.toThrow();
        expect(() => muteAll()).not.toThrow();
    });
});

describe('force_muted / role_updated client events', () => {
    it('force_muted disables the local mic and dispatches setMicEnabled(false)', async () => {
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
        c().trigger('force_muted', {moderator: 'mod-1'});

        expect(lkRoom().disableMic).toHaveBeenCalled();
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_mic_enabled')?.payload?.value).toBe(false);
    });

    it('role_updated for self dispatches participantRoleChanged and setIsHost', async () => {
        const store = makeTestStoreWithSession({localParticipantId: 'p-self'});
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'p-self', displayName: 'Alice'}], isHost: false});

        dispatched = [];
        c().trigger('role_updated', {participantId: 'p-self', newRole: 'moderator'});

        expect(dispatched.find((a) => a.type === 'opentalk/participants/role_changed')?.payload).toEqual({id: 'p-self', role: 'moderator'});
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_is_host')?.payload?.value).toBe(true);
    });

    it('role_updated for another id dispatches role change but leaves isHost untouched', async () => {
        const store = makeTestStoreWithSession({localParticipantId: 'p-self'});
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {participants: [{id: 'p-self', displayName: 'Alice'}], isHost: true});

        dispatched = [];
        c().trigger('role_updated', {participantId: 'p-other', newRole: 'moderator'});

        expect(dispatched.find((a) => a.type === 'opentalk/participants/role_changed')?.payload).toEqual({id: 'p-other', role: 'moderator'});
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_is_host')).toBeUndefined();
    });
});

describe('LiveKit track events', () => {
    async function connectWithLiveKit() {
        const store = makeTestStore();
        startConferenceConnection('room-1', 'ch-1', 'Alice', store);
        await Promise.resolve();
        c().trigger('connected', {
            participants: [{id: 'self', displayName: 'Alice'}],
            isHost: false,
            livekit: {url: 'wss://lk.example', token: 'tok'},
        });
        await Promise.resolve();
        return store;
    }

    it('normalizes the LiveKit identity to the bare participant id on track_subscribed', async () => {
        await connectWithLiveKit();
        dispatched = [];
        lkRoom().trigger('track_subscribed', {
            participant: {identity: 'uuid-remote:conn-9'},
            publication: {trackSid: 't1', source: 'camera'},
            track: {kind: 'video', sid: 't1'},
        });
        const sub = dispatched.find((a) => a.type === 'opentalk/tracks/subscribed');
        expect(sub?.payload?.participantId).toBe('uuid-remote');
    });

    it('normalizes the LiveKit identity to the bare participant id on track_unsubscribed', async () => {
        await connectWithLiveKit();
        dispatched = [];
        lkRoom().trigger('track_unsubscribed', {
            participant: {identity: 'uuid-remote:conn-9'},
            publication: {trackSid: 't1', source: 'camera'},
            track: {kind: 'video', sid: 't1'},
        });
        const unsub = dispatched.find((a) => a.type === 'opentalk/tracks/unsubscribed');
        expect(unsub?.payload?.participantId).toBe('uuid-remote');
    });

    it('disables the mic button when the local mic track is muted server-side', async () => {
        await connectWithLiveKit();
        lkRoom().getLocalIdentity.mockReturnValue('local-id');
        dispatched = [];
        lkRoom().trigger('track_muted', {participantId: 'local-id', source: 'microphone', muted: true});
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_mic_enabled')?.payload?.value).toBe(false);
    });

    it('leaves the mic button untouched when a remote mic track is muted', async () => {
        await connectWithLiveKit();
        lkRoom().getLocalIdentity.mockReturnValue('local-id');
        dispatched = [];
        lkRoom().trigger('track_muted', {participantId: 'remote-id', source: 'microphone', muted: true});
        expect(dispatched.find((a) => a.type === 'opentalk/session/set_mic_enabled')).toBeUndefined();
    });
});
