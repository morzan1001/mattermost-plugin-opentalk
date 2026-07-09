const mockRoomOn = jest.fn();
const mockRoomConnect = jest.fn().mockResolvedValue(undefined);
const mockRoomDisconnect = jest.fn().mockResolvedValue(undefined);
const mockCreateLocalAudioTrack = jest.fn();
const mockCreateLocalVideoTrack = jest.fn();
const mockPublishTrack = jest.fn().mockResolvedValue(undefined);
const mockUnpublishTrack = jest.fn().mockResolvedValue(undefined);
const mockSetScreenShareEnabled = jest.fn().mockResolvedValue(undefined);
let mockIsScreenShareEnabled = false;

jest.mock('livekit-client', () => {
    return {
        Room: jest.fn().mockImplementation(() => ({
            on: mockRoomOn,
            connect: mockRoomConnect,
            disconnect: mockRoomDisconnect,
            localParticipant: {
                publishTrack: mockPublishTrack,
                unpublishTrack: mockUnpublishTrack,
                setScreenShareEnabled: mockSetScreenShareEnabled,
                get isScreenShareEnabled() {
                    return mockIsScreenShareEnabled;
                },
            },
        })),
        RoomEvent: {
            Disconnected: 'disconnected',
            TrackSubscribed: 'track_subscribed',
            TrackUnsubscribed: 'track_unsubscribed',
            ActiveSpeakersChanged: 'active_speakers_changed',
        },
        createLocalAudioTrack: (...args: unknown[]) => mockCreateLocalAudioTrack(...args),
        createLocalVideoTrack: (...args: unknown[]) => mockCreateLocalVideoTrack(...args),
    };
});

import {LiveKitRoom} from './room';

beforeEach(() => {
    mockRoomOn.mockReset();
    mockRoomConnect.mockReset().mockResolvedValue(undefined);
    mockRoomDisconnect.mockReset().mockResolvedValue(undefined);
});

describe('LiveKitRoom', () => {
    it('registers event handlers on the underlying Room', () => {
        new LiveKitRoom();
        const eventNames = mockRoomOn.mock.calls.map((c) => c[0]);
        expect(eventNames).toContain('disconnected');
        expect(eventNames).toContain('track_subscribed');
        expect(eventNames).toContain('track_unsubscribed');
        expect(eventNames).toContain('active_speakers_changed');
    });

    it('connect() invokes Room.connect with url+token and emits "connected"', async () => {
        const r = new LiveKitRoom();
        const onConnected = jest.fn();
        r.on('connected', onConnected);
        await r.connect('wss://lk.example', 'tok-xyz');
        expect(mockRoomConnect).toHaveBeenCalledWith('wss://lk.example', 'tok-xyz');
        expect(onConnected).toHaveBeenCalled();
    });

    it('disconnect() invokes Room.disconnect', async () => {
        const r = new LiveKitRoom();
        await r.disconnect();
        expect(mockRoomDisconnect).toHaveBeenCalled();
    });

    it('forwards Disconnected → "disconnected" listener', () => {
        const r = new LiveKitRoom();
        const cb = jest.fn();
        r.on('disconnected', cb);

        // Find the handler that was registered for 'disconnected' and call it.
        const disconnectedHandler = mockRoomOn.mock.calls.find((c) => c[0] === 'disconnected')?.[1];
        expect(disconnectedHandler).toBeDefined();
        disconnectedHandler();
        expect(cb).toHaveBeenCalled();
    });

    it('on() returns an unsubscribe function', () => {
        const r = new LiveKitRoom();
        const cb = jest.fn();
        const unsub = r.on('connected', cb);
        unsub();

        // Trigger a fake connected emit by re-running connect:
        return r.connect('u', 't').then(() => {
            expect(cb).not.toHaveBeenCalled();
        });
    });
});

describe('LiveKitRoom mic API', () => {
    beforeEach(() => {
        mockCreateLocalAudioTrack.mockReset();
        mockPublishTrack.mockReset().mockResolvedValue(undefined);
        mockUnpublishTrack.mockReset().mockResolvedValue(undefined);
    });

    it('enableMic creates + publishes a track', async () => {
        const fakeTrack = {stop: jest.fn(), kind: 'audio'};
        mockCreateLocalAudioTrack.mockResolvedValue(fakeTrack);
        const r = new LiveKitRoom();
        await r.enableMic();
        expect(r.isMicEnabled()).toBe(true);
        expect(mockPublishTrack).toHaveBeenCalledWith(fakeTrack);
    });

    it('enableMic is idempotent', async () => {
        const fakeTrack = {stop: jest.fn(), kind: 'audio'};
        mockCreateLocalAudioTrack.mockResolvedValue(fakeTrack);
        const r = new LiveKitRoom();
        await r.enableMic();
        await r.enableMic();
        expect(mockPublishTrack).toHaveBeenCalledTimes(1);
    });

    it('disableMic unpublishes + stops + clears the track', async () => {
        const fakeTrack = {stop: jest.fn(), kind: 'audio'};
        mockCreateLocalAudioTrack.mockResolvedValue(fakeTrack);
        const r = new LiveKitRoom();
        await r.enableMic();
        await r.disableMic();
        expect(mockUnpublishTrack).toHaveBeenCalledWith(fakeTrack);
        expect(fakeTrack.stop).toHaveBeenCalled();
        expect(r.isMicEnabled()).toBe(false);
    });

    it('disableMic is a noop when no mic enabled', async () => {
        const r = new LiveKitRoom();
        await r.disableMic();
        expect(mockUnpublishTrack).not.toHaveBeenCalled();
    });
});

describe('LiveKitRoom cam API', () => {
    beforeEach(() => {
        mockCreateLocalVideoTrack.mockReset();
        mockPublishTrack.mockReset().mockResolvedValue(undefined);
        mockUnpublishTrack.mockReset().mockResolvedValue(undefined);
    });

    it('enableCam creates + publishes a video track', async () => {
        const fakeTrack = {stop: jest.fn(), kind: 'video'};
        mockCreateLocalVideoTrack.mockResolvedValue(fakeTrack);
        const r = new LiveKitRoom();
        await r.enableCam();
        expect(r.isCamEnabled()).toBe(true);
        expect(mockPublishTrack).toHaveBeenCalledWith(fakeTrack);
    });

    it('enableCam is idempotent', async () => {
        const fakeTrack = {stop: jest.fn(), kind: 'video'};
        mockCreateLocalVideoTrack.mockResolvedValue(fakeTrack);
        const r = new LiveKitRoom();
        await r.enableCam();
        await r.enableCam();
        expect(mockPublishTrack).toHaveBeenCalledTimes(1);
    });

    it('disableCam unpublishes + stops + clears the track', async () => {
        const fakeTrack = {stop: jest.fn(), kind: 'video'};
        mockCreateLocalVideoTrack.mockResolvedValue(fakeTrack);
        const r = new LiveKitRoom();
        await r.enableCam();
        await r.disableCam();
        expect(mockUnpublishTrack).toHaveBeenCalledWith(fakeTrack);
        expect(fakeTrack.stop).toHaveBeenCalled();
        expect(r.isCamEnabled()).toBe(false);
    });

    it('disableCam is a noop when no cam enabled', async () => {
        const r = new LiveKitRoom();
        await r.disableCam();
        expect(mockUnpublishTrack).not.toHaveBeenCalled();
    });
});

describe('LiveKitRoom screenshare API', () => {
    beforeEach(() => {
        mockSetScreenShareEnabled.mockReset().mockResolvedValue(undefined);
        mockIsScreenShareEnabled = false;
    });

    it('disableScreenShare calls setScreenShareEnabled(false)', async () => {
        const r = new LiveKitRoom();
        await r.disableScreenShare();
        expect(mockSetScreenShareEnabled).toHaveBeenCalledWith(false);
    });

    it('isScreenShareEnabled reflects underlying state', () => {
        const r = new LiveKitRoom();
        expect(r.isScreenShareEnabled()).toBe(false);
        mockIsScreenShareEnabled = true;
        expect(r.isScreenShareEnabled()).toBe(true);
    });
});
