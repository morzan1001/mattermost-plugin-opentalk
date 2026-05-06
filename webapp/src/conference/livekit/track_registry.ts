import type {RemoteTrack} from 'livekit-client';

const tracks = new Map<string, RemoteTrack>();

export function register(trackId: string, track: RemoteTrack): void {
    tracks.set(trackId, track);
}

export function get(trackId: string): RemoteTrack | undefined {
    return tracks.get(trackId);
}

export function unregister(trackId: string): void {
    tracks.delete(trackId);
}

export function clear(): void {
    tracks.clear();
}
