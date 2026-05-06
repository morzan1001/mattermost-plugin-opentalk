const mockCreateLocalAudioTrack = jest.fn();
const mockCreateLocalVideoTrack = jest.fn();
const mockPublishTrack = jest.fn().mockResolvedValue(undefined);
const mockUnpublishTrack = jest.fn().mockResolvedValue(undefined);
const mockTrackStop = jest.fn();

jest.mock('livekit-client', () => ({
    createLocalAudioTrack: (...args: unknown[]) => mockCreateLocalAudioTrack(...args),
    createLocalVideoTrack: (...args: unknown[]) => mockCreateLocalVideoTrack(...args),
}));

import {publishMic, unpublishMic, MicPermissionDeniedError, publishCam, unpublishCam, CamPermissionDeniedError} from './tracks';

function makeFakeRoom() {
    return {
        localParticipant: {
            publishTrack: mockPublishTrack,
            unpublishTrack: mockUnpublishTrack,
        },
    } as any;
}

function makeFakeTrack() {
    return {
        stop: mockTrackStop,
        kind: 'audio',
    } as any;
}

beforeEach(() => {
    mockCreateLocalAudioTrack.mockReset();
    mockCreateLocalVideoTrack.mockReset();
    mockPublishTrack.mockReset().mockResolvedValue(undefined);
    mockUnpublishTrack.mockReset().mockResolvedValue(undefined);
    mockTrackStop.mockReset();
});

describe('publishMic', () => {
    it('creates a track with EC + NS and publishes it', async () => {
        const fakeTrack = makeFakeTrack();
        mockCreateLocalAudioTrack.mockResolvedValue(fakeTrack);
        const room = makeFakeRoom();
        const track = await publishMic(room);
        expect(mockCreateLocalAudioTrack).toHaveBeenCalledWith(expect.objectContaining({
            echoCancellation: true,
            noiseSuppression: true,
        }));
        expect(mockPublishTrack).toHaveBeenCalledWith(fakeTrack);
        expect(track).toBe(fakeTrack);
    });

    it('passes deviceId when provided', async () => {
        mockCreateLocalAudioTrack.mockResolvedValue(makeFakeTrack());
        const room = makeFakeRoom();
        await publishMic(room, {deviceId: 'mic-123'});
        expect(mockCreateLocalAudioTrack).toHaveBeenCalledWith(
            expect.objectContaining({deviceId: 'mic-123'}),
        );
    });

    it('throws MicPermissionDeniedError when getUserMedia rejects', async () => {
        const cause = new Error('NotAllowedError: Permission denied');
        mockCreateLocalAudioTrack.mockRejectedValue(cause);
        const room = makeFakeRoom();
        try {
            await publishMic(room);
            fail('expected throw');
        } catch (err) {
            expect(err).toBeInstanceOf(MicPermissionDeniedError);
            expect((err as MicPermissionDeniedError).cause).toBe(cause);
            expect((err as Error).message).toContain('mic_permission_denied');
        }
        expect(mockPublishTrack).not.toHaveBeenCalled();
    });
});

describe('unpublishMic', () => {
    it('unpublishes and stops the track', async () => {
        const room = makeFakeRoom();
        const track = makeFakeTrack();
        await unpublishMic(room, track);
        expect(mockUnpublishTrack).toHaveBeenCalledWith(track);
        expect(mockTrackStop).toHaveBeenCalled();
    });
});

describe('publishCam', () => {
    it('creates a video track and publishes it', async () => {
        const fakeTrack = {stop: mockTrackStop, kind: 'video'};
        mockCreateLocalVideoTrack.mockResolvedValue(fakeTrack);
        const room = makeFakeRoom();
        const track = await publishCam(room);
        expect(mockCreateLocalVideoTrack).toHaveBeenCalled();
        expect(mockPublishTrack).toHaveBeenCalledWith(fakeTrack);
        expect(track).toBe(fakeTrack);
    });

    it('passes deviceId when provided', async () => {
        mockCreateLocalVideoTrack.mockResolvedValue({stop: mockTrackStop, kind: 'video'});
        await publishCam(makeFakeRoom(), {deviceId: 'cam-456'});
        expect(mockCreateLocalVideoTrack).toHaveBeenCalledWith(
            expect.objectContaining({deviceId: 'cam-456'}),
        );
    });

    it('throws CamPermissionDeniedError when getUserMedia rejects', async () => {
        const cause = new Error('NotAllowedError: Permission denied for camera');
        mockCreateLocalVideoTrack.mockRejectedValue(cause);
        try {
            await publishCam(makeFakeRoom());
            fail('expected throw');
        } catch (err) {
            expect(err).toBeInstanceOf(CamPermissionDeniedError);
            expect((err as CamPermissionDeniedError).cause).toBe(cause);
            expect((err as Error).message).toContain('cam_permission_denied');
        }
        expect(mockPublishTrack).not.toHaveBeenCalled();
    });
});

describe('unpublishCam', () => {
    it('unpublishes and stops the cam track', async () => {
        const room = makeFakeRoom();
        const track = {stop: mockTrackStop, kind: 'video'} as any;
        await unpublishCam(room, track);
        expect(mockUnpublishTrack).toHaveBeenCalledWith(track);
        expect(mockTrackStop).toHaveBeenCalled();
    });
});
