import {
    Room,
    RoomEvent,
    Track,
    LocalVideoTrack,
    type RemoteTrack,
    type RemoteTrackPublication,
    type RemoteParticipant,
    type LocalAudioTrack,
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
 * Thin wrapper around livekit-client's Room: connect/disconnect,
 * track-subscribe events, active-speakers, and mic/cam/screen publishing.
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
        return Boolean(this.micTrack);
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
        return Boolean(this.camTrack);
    }

    public async enableScreenShare(): Promise<void> {
        await this.room.localParticipant.setScreenShareEnabled(true);
    }

    public async disableScreenShare(): Promise<void> {
        await this.room.localParticipant.setScreenShareEnabled(false);
    }

    /**
     * Publishes a pre-captured MediaStream's video track as a screen-share
     * publication. Used by the Electron desktop-bridge flow where
     * setScreenShareEnabled(true) doesn't surface a native picker.
     */
    public async enableScreenShareFromStream(stream: MediaStream): Promise<void> {
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
            throw new Error('Stream hat keinen Video-Track');
        }
        const localTrack = new LocalVideoTrack(videoTrack);
        await this.room.localParticipant.publishTrack(localTrack, {
            source: Track.Source.ScreenShare,
        });

        // When user stops via OS share-controls, the track ends. Tear down our
        // publication so isScreenShareEnabled() flips back to false.
        videoTrack.addEventListener('ended', () => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.disableScreenShare();
        });
    }

    public isScreenShareEnabled(): boolean {
        return this.room.localParticipant.isScreenShareEnabled;
    }

    /** Local participant's identity, matching the OpenTalk-Roomserver
     * participant id. Used to key local-track-publications into the same
     * tracks slice that holds remote subscriptions. */
    public getLocalIdentity(): string {
        return this.room.localParticipant.identity;
    }

    /** The currently-published local screen-share video track, if any. */
    public getLocalScreenTrack(): LocalVideoTrack | undefined {
        const pubs = this.room.localParticipant.getTrackPublications();
        for (const pub of pubs) {
            if (pub.source === Track.Source.ScreenShare && pub.track) {
                return pub.track as LocalVideoTrack;
            }
        }
        return undefined;
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
