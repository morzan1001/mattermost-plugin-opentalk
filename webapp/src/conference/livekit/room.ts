import {
    Room,
    RoomEvent,
    type RemoteTrack,
    type RemoteTrackPublication,
    type RemoteParticipant,
    type LocalAudioTrack,
    type LocalVideoTrack,
} from 'livekit-client';

import {publishMic, publishCam, unpublishMic, unpublishCam, type MicOptions, type CamOptions} from './tracks';

export type LiveKitEvent =
    | 'connected'
    | 'disconnected'
    | 'track_subscribed'
    | 'track_unsubscribed'
    | 'active_speakers_changed';

export interface TrackSubscribedData {
    track: RemoteTrack;
    publication: RemoteTrackPublication;
    participant: RemoteParticipant;
}

type Listener<T = unknown> = (data: T) => void;

/**
 * Thin wrapper around livekit-client's Room class. Phase 6 uses only a small
 * subset of the API: connect, disconnect, track-subscribe events, active-
 * speakers events. Mic/cam/screen publishing live in tracks.ts (Tasks 2/3/7).
 */
export class LiveKitRoom {
    private readonly room: Room;
    private readonly listeners: Record<LiveKitEvent, Listener[]> = {
        connected: [],
        disconnected: [],
        track_subscribed: [],
        track_unsubscribed: [],
        active_speakers_changed: [],
    };

    // Phase 2/3 will populate these:
    public micTrack?: LocalAudioTrack;
    public camTrack?: LocalVideoTrack;

    constructor() {
        this.room = new Room({adaptiveStream: true, dynacast: true});
        this.room.on(RoomEvent.Disconnected, () => this.emit('disconnected'));
        this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
            this.emit('track_subscribed', {track, publication, participant} as TrackSubscribedData);
        });
        this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            this.emit('track_unsubscribed', {track, publication, participant} as TrackSubscribedData);
        });
        this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            this.emit('active_speakers_changed', speakers.map((s) => s.identity));
        });
    }

    /** Wraps the underlying livekit-client Room — needed by track helpers. */
    public getRoom(): Room {
        return this.room;
    }

    public async connect(url: string, token: string): Promise<void> {
        await this.room.connect(url, token);
        this.emit('connected', {});
    }

    public async disconnect(): Promise<void> {
        await this.room.disconnect();
    }

    public async enableMic(opts?: MicOptions): Promise<void> {
        if (this.micTrack) {
            return;
        }
        this.micTrack = await publishMic(this.room, opts);
    }

    public async disableMic(): Promise<void> {
        if (!this.micTrack) {
            return;
        }
        await unpublishMic(this.room, this.micTrack);
        this.micTrack = undefined;
    }

    public isMicEnabled(): boolean {
        return !!this.micTrack;
    }

    public async enableCam(opts?: CamOptions): Promise<void> {
        if (this.camTrack) {
            return;
        }
        this.camTrack = await publishCam(this.room, opts);
    }

    public async disableCam(): Promise<void> {
        if (!this.camTrack) {
            return;
        }
        await unpublishCam(this.room, this.camTrack);
        this.camTrack = undefined;
    }

    public isCamEnabled(): boolean {
        return !!this.camTrack;
    }

    public async enableScreenShare(): Promise<void> {
        await this.room.localParticipant.setScreenShareEnabled(true);
    }

    public async disableScreenShare(): Promise<void> {
        await this.room.localParticipant.setScreenShareEnabled(false);
    }

    public isScreenShareEnabled(): boolean {
        return this.room.localParticipant.isScreenShareEnabled;
    }

    public on(event: LiveKitEvent, cb: Listener): () => void {
        this.listeners[event].push(cb);
        return () => {
            const i = this.listeners[event].indexOf(cb);
            if (i >= 0) {
                this.listeners[event].splice(i, 1);
            }
        };
    }

    private emit(event: LiveKitEvent, data?: unknown): void {
        for (const l of this.listeners[event].slice()) {
            l(data);
        }
    }
}
