import {joinMeeting} from '../client/rest';

import {ConferenceRoom, type AuthProvider, type RoomState} from './signaling/conference_room';
import type {Participant} from './signaling/modules/core';

export interface ConnectedEvent {
    participants: Participant[];
    livekit?: {url: string; token: string};
}

export interface LiveKitCredentialsEvent {
    url: string;
    token: string;
}

export type ConferenceEvent =
    | 'connected'
    | 'participant_joined'
    | 'participant_left'
    | 'livekit_credentials'
    | 'hand_raised'
    | 'hand_lowered'
    | 'raise_hands_toggled'
    | 'closed'
    | 'error';

const restAuth: AuthProvider = {
    async getTicket(roomID, channelID, deviceSecret, _displayName) {
        const r = await joinMeeting(roomID, channelID, deviceSecret);
        return {
            ticket: r.ticket,
            resumption: r.resumption,
            roomserverURL: r.roomserver_url,
        };
    },
};

export class OpenTalkConferenceClient {
    private readonly room: ConferenceRoom;

    constructor(defaultRoomserverURL: string) {
        this.room = new ConferenceRoom(restAuth, defaultRoomserverURL);
    }

    public connect(roomID: string, channelID: string, displayName: string, deviceSecret: string): Promise<void> {
        return this.room.connect(roomID, channelID, displayName, deviceSecret);
    }

    public leave(): Promise<void> {
        return this.room.leave();
    }

    public on(event: 'connected', cb: (data: ConnectedEvent) => void): () => void;
    public on(event: 'participant_joined', cb: (p: Participant) => void): () => void;
    public on(event: 'participant_left', cb: (data: {id: string}) => void): () => void;
    public on(event: 'livekit_credentials', cb: (data: LiveKitCredentialsEvent) => void): () => void;
    public on(event: 'hand_raised', cb: (data: {participantId: string}) => void): () => void;
    public on(event: 'hand_lowered', cb: (data: {participantId: string}) => void): () => void;
    public on(event: 'raise_hands_toggled', cb: (data: {enabled: boolean}) => void): () => void;
    public on(event: 'closed', cb: (data: {code: number}) => void): () => void;
    public on(event: 'error', cb: (err: Error) => void): () => void;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public on(event: ConferenceEvent, cb: (data: any) => void): () => void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.room.on(event as any, cb);
    }

    public raiseHand(): void {
        this.room.raiseHand();
    }

    public lowerHand(): void {
        this.room.lowerHand();
    }

    public getState(): RoomState {
        return this.room.getState();
    }

    public getParticipants(): Participant[] {
        return this.room.getParticipants();
    }
}

export type {RoomState, Participant};
