/*
 * Portiert aus opentalk/web-frontend@00241cd
 * app/src/modules/WebRTC/ConferenceRoom.ts
 *
 * Adaptions vs upstream:
 * - apiUtils-based ticket request replaced by injected AuthProvider.
 * - Waiting-room flow, retry-with-resumption, heartbeats, breakout-room
 *   transitions, and PKCE generation are out of scope for Phase 5 (MVP).
 *   Add them in a later phase if/when needed.
 *
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 */

import {EventListener} from './event_listener';
import {buildFrame} from './frame';
import {CoreNamespace, type Participant} from './modules/core';
import {LivekitNamespace} from './modules/livekit';
import {SignalingSocket} from './socket';

export interface AuthProvider {
    getTicket(roomID: string, channelID: string, deviceSecret: string, displayName: string): Promise<{
        ticket: string;
        resumption: string;
        roomserverURL: string;
    }>;
}

export type RoomState = 'idle' | 'authenticating' | 'connecting' | 'connected' | 'leaving' | 'closed';

type EventName =
    | 'connected'
    | 'participant_joined'
    | 'participant_left'
    | 'livekit_credentials'
    | 'closed'
    | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (data?: any) => void;

export class ConferenceRoom {
    private readonly auth: AuthProvider;
    private readonly defaultRoomserverURL: string;
    private state: RoomState = 'idle';
    private socket?: SignalingSocket;
    private listener?: EventListener;
    private participants: Participant[] = [];
    private closedEmitted = false;
    private listeners: Record<EventName, Listener[]> = {
        connected: [],
        participant_joined: [],
        participant_left: [],
        livekit_credentials: [],
        closed: [],
        error: [],
    };

    constructor(auth: AuthProvider, defaultRoomserverURL: string) {
        this.auth = auth;
        this.defaultRoomserverURL = defaultRoomserverURL;
    }

    public getState(): RoomState {
        return this.state;
    }

    public getParticipants(): Participant[] {
        return [...this.participants];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public on(event: EventName, cb: (data: any) => void): () => void {
        this.listeners[event].push(cb);
        return () => {
            const i = this.listeners[event].indexOf(cb);
            if (i >= 0) {
                this.listeners[event].splice(i, 1);
            }
        };
    }

    public connect(roomID: string, channelID: string, displayName: string, deviceSecret: string): Promise<void> {
        if (this.state !== 'idle') {
            return Promise.reject(new Error(`ConferenceRoom: connect() called from non-idle state (${this.state})`));
        }
        this.state = 'authenticating';

        return this.auth.getTicket(roomID, channelID, deviceSecret, displayName).then(
            (r) => {
                const ticket = r.ticket;
                const roomserverURL = r.roomserverURL || this.defaultRoomserverURL;

                this.state = 'connecting';
                this.socket = new SignalingSocket(roomserverURL, ticket);
                this.listener = new EventListener(this.socket);

                // Diagnostic wire-log: prints every incoming signaling frame.
                // Lets us see what the OpenTalk roomserver actually sends —
                // critical when a namespace handler "looks right" but the
                // frame doesn't arrive in the shape we expect (e.g. livekit
                // credentials carrying the URL under a different key).
                this.listener.onAny((msg) => {
                    // eslint-disable-next-line no-console
                    console.warn('[opentalk] WS frame:', msg.namespace + ':' + msg.payload.action, msg.payload);
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.listener.on(CoreNamespace, 'joinSuccess', (payload: any) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const others = (payload.participants ?? []).map((p: any) => this.normalizeParticipant(p));
                    // OpenTalk's joinSuccess lists only the OTHER participants;
                    // our own user info is at the top-level (id, display_name, role).
                    const self = this.normalizeParticipant({
                        id: payload.id,
                        display_name: payload.displayName ?? payload.display_name,
                        role: payload.role,
                    });
                    const list = [self, ...others];
                    this.participants = list;
                    this.state = 'connected';
                    this.emit('connected', {
                        participants: list,
                        livekit: payload.livekit,
                        isHost: payload.is_room_owner === true || payload.isRoomOwner === true,
                    });
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.listener.on(CoreNamespace, 'participantConnected', (payload: any) => {
                    if (this.state !== 'connected') {
                        return;
                    }
                    const p = this.normalizeParticipant(payload.participant ?? payload);
                    this.participants.push(p);
                    this.emit('participant_joined', p);
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.listener.on(CoreNamespace, 'participantDisconnected', (payload: any) => {
                    if (this.state !== 'connected') {
                        return;
                    }
                    const id = payload.id ?? payload.participantId;
                    this.participants = this.participants.filter((p) => p.id !== id);
                    this.emit('participant_left', {id});
                });

                // OpenTalk delivers LiveKit bootstrap as a separate frame
                // {namespace:'livekit', payload:{action:'credentials', publicUrl, token, room}}
                // *after* joinSuccess — not embedded in joinSuccess itself.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.listener.on(LivekitNamespace, 'credentials', (payload: any) => {
                    const url = payload.publicUrl ?? payload.public_url ?? payload.url;
                    const token = payload.token;
                    if (!url || !token) {
                        return;
                    }
                    this.emit('livekit_credentials', {url, token});
                });

                this.socket.on('open', () => {
                    this.socket?.send(buildFrame(CoreNamespace, 'join', {displayName}));
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.socket.on('close', (e: any) => {
                    this.state = 'closed';
                    if (!this.closedEmitted) {
                        this.closedEmitted = true;
                        this.emit('closed', {code: e?.code ?? 1006});
                    }
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.socket.on('error', (e: any) => {
                    this.emit('error', e instanceof Error ? e : new Error(String(e)));
                });

                this.socket.connect();

                // Wait for the 'connected' transition (or close/error).
                return new Promise<void>((resolve, reject) => {
                    const offConnected = this.on('connected', () => {
                        offConnected();
                        offClosed();
                        offError();
                        resolve();
                    });
                    const offClosed = this.on('closed', () => {
                        offConnected();
                        offClosed();
                        offError();
                        reject(new Error('socket closed before joinSuccess'));
                    });
                    const offError = this.on('error', (err) => {
                        offConnected();
                        offClosed();
                        offError();
                        reject(err);
                    });
                });
            },
            (err) => {
                this.state = 'idle';
                throw err;
            },
        );
    }

    public async leave(): Promise<void> {
        if (this.state !== 'connected') {
            this.state = 'closed';
            if (!this.closedEmitted) {
                this.closedEmitted = true;
                this.emit('closed', {code: 1000});
            }
            return;
        }
        this.state = 'leaving';
        try {
            this.socket?.send(buildFrame(CoreNamespace, 'leave', {}));
        } catch {
            // socket may already be closed; ignore
        }
        this.socket?.disconnect();
        this.state = 'closed';
        // Emit `closed` synchronously so the UI updates immediately. The
        // browser's WS onclose handler (which would also emit) is gated by
        // closedEmitted so we never double-fire.
        if (!this.closedEmitted) {
            this.closedEmitted = true;
            this.emit('closed', {code: 1000});
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private emit(event: EventName, data?: any) {
        // Snapshot to allow handlers to unsubscribe themselves during invocation.
        const snapshot = [...this.listeners[event]];
        for (const cb of snapshot) {
            cb(data);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private normalizeParticipant(p: any): Participant {
        return {
            id: p.id,
            displayName: p.displayName ?? p.display_name,
            ...(p.role && {role: p.role}),
        };
    }
}
