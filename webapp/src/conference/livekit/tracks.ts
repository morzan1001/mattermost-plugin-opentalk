import {createLocalAudioTrack, createLocalVideoTrack, type LocalAudioTrack, type LocalVideoTrack, type Room} from 'livekit-client';

import {getPreferredMicId, getPreferredCamId} from './devices';

export interface MicOptions {
    deviceId?: string;
}

export class MicPermissionDeniedError extends Error {
    constructor(public readonly cause: Error) {
        super(`mic_permission_denied: ${cause.message}`);
        this.name = 'MicPermissionDeniedError';
    }
}

// Throws MicPermissionDeniedError if the browser denies microphone access.
export async function publishMic(room: Room, opts: MicOptions = {}): Promise<LocalAudioTrack> {
    let track: LocalAudioTrack;
    try {
        const deviceId = opts.deviceId ?? getPreferredMicId();
        track = await createLocalAudioTrack({
            echoCancellation: true,
            noiseSuppression: true,
            ...(deviceId ? {deviceId} : {}),
        });
    } catch (err) {
        throw new MicPermissionDeniedError(err as Error);
    }
    try {
        await room.localParticipant.publishTrack(track);
    } catch (err) {
        // Publish failed (e.g. teardown/reconnect mid-acquire); release the
        // device so the mic isn't left hot with no publication tracking it.
        track.stop();
        throw err;
    }
    return track;
}

export async function unpublishMic(room: Room, track: LocalAudioTrack): Promise<void> {
    await room.localParticipant.unpublishTrack(track);
    track.stop();
}

export interface CamOptions {
    deviceId?: string;
}

export class CamPermissionDeniedError extends Error {
    constructor(public readonly cause: Error) {
        super(`cam_permission_denied: ${cause.message}`);
        this.name = 'CamPermissionDeniedError';
    }
}

// Throws CamPermissionDeniedError if the browser denies camera access.
export async function publishCam(room: Room, opts: CamOptions = {}): Promise<LocalVideoTrack> {
    let track: LocalVideoTrack;
    try {
        const deviceId = opts.deviceId ?? getPreferredCamId();
        track = await createLocalVideoTrack({
            ...(deviceId ? {deviceId} : {}),
        });
    } catch (err) {
        throw new CamPermissionDeniedError(err as Error);
    }
    try {
        await room.localParticipant.publishTrack(track);
    } catch (err) {
        // Publish failed (e.g. teardown/reconnect mid-acquire); release the
        // device so the camera light isn't left on with no publication.
        track.stop();
        throw err;
    }
    return track;
}

export async function unpublishCam(room: Room, track: LocalVideoTrack): Promise<void> {
    await room.localParticipant.unpublishTrack(track);
    track.stop();
}
