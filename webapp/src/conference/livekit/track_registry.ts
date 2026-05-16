import type {LocalTrack, RemoteTrack} from 'livekit-client';

export type RegisteredTrack = RemoteTrack | LocalTrack;

const tracks = new Map<string, RegisteredTrack>();

export function register(trackId: string, track: RegisteredTrack): void {
    tracks.set(trackId, track);
}

export function get(trackId: string): RegisteredTrack | undefined {
    return tracks.get(trackId);
}

export function unregister(trackId: string): void {
    tracks.delete(trackId);
}

export function clear(): void {
    tracks.clear();
}
