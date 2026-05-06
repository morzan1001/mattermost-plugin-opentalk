import {createLocalAudioTrack, createLocalVideoTrack, type LocalAudioTrack, type LocalVideoTrack, type Room} from 'livekit-client';

export interface MicOptions {
    deviceId?: string;
}

export class MicPermissionDeniedError extends Error {
    constructor(public readonly cause: Error) {
        super(`mic_permission_denied: ${cause.message}`);
        this.name = 'MicPermissionDeniedError';
    }
}

/**
 * Creates a LocalAudioTrack via getUserMedia and publishes it to the local
 * participant. Returns the track so the caller can later mute or unpublish it.
 *
 * Throws MicPermissionDeniedError if the browser denies microphone access.
 */
export async function publishMic(room: Room, opts: MicOptions = {}): Promise<LocalAudioTrack> {
    let track: LocalAudioTrack;
    try {
        track = await createLocalAudioTrack({
            echoCancellation: true,
            noiseSuppression: true,
            ...(opts.deviceId ? {deviceId: opts.deviceId} : {}),
        });
    } catch (err) {
        throw new MicPermissionDeniedError(err as Error);
    }
    await room.localParticipant.publishTrack(track);
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

/**
 * Creates a LocalVideoTrack via getUserMedia and publishes it to the local
 * participant. Returns the track so the caller can later mute or unpublish it.
 *
 * Throws CamPermissionDeniedError if the browser denies camera access.
 */
export async function publishCam(room: Room, opts: CamOptions = {}): Promise<LocalVideoTrack> {
    let track: LocalVideoTrack;
    try {
        track = await createLocalVideoTrack({
            ...(opts.deviceId ? {deviceId: opts.deviceId} : {}),
        });
    } catch (err) {
        throw new CamPermissionDeniedError(err as Error);
    }
    await room.localParticipant.publishTrack(track);
    return track;
}

export async function unpublishCam(room: Room, track: LocalVideoTrack): Promise<void> {
    await room.localParticipant.unpublishTrack(track);
    track.stop();
}
