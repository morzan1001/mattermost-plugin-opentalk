/*
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 */

import {EventListener} from './event_listener';
import {buildFrame} from './frame';
import {CoreNamespace, type Participant} from './modules/core';
import {LivekitNamespace} from './modules/livekit';
import {ModerationNamespace, type KickScope} from './modules/moderation';
import {SignalingSocket} from './socket';

const RESUMPTION_KEY_PREFIX = 'opentalk:resumption:';

function readResumption(roomID: string): string | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }
    try {
        const v = window.localStorage.getItem(RESUMPTION_KEY_PREFIX + roomID);
        return v ?? undefined;
    } catch {
        return undefined;
    }
}

function writeResumption(roomID: string, value: string): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(RESUMPTION_KEY_PREFIX + roomID, value);
    } catch {
        /* swallow — quota/private mode */
    }
}

function clearResumption(roomID: string): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.removeItem(RESUMPTION_KEY_PREFIX + roomID);
    } catch {
        /* swallow */
    }
}

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
    | 'hand_raised'
    | 'hand_lowered'
    | 'raise_hands_toggled'
    | 'closed'
    | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (data?: any) => void;

export class ConferenceRoom {
    private readonly auth: AuthProvider;
    private readonly defaultRoomserverURL: string;
    private state: RoomState = 'idle';
    private roomID: string = '';
    private socket?: SignalingSocket;
    private listener?: EventListener;
    private participants: Participant[] = [];
    private localId: string = '';
    private closedEmitted = false;
    private listeners: Record<EventName, Listener[]> = {
        connected: [],
        participant_joined: [],
        participant_left: [],
        livekit_credentials: [],
        hand_raised: [],
        hand_lowered: [],
        raise_hands_toggled: [],
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
        this.roomID = roomID;
        this.state = 'authenticating';

        return this.auth.getTicket(roomID, channelID, deviceSecret, displayName).then(
            (r) => {
                const ticket = r.ticket;

                // Prefer a server-confirmed token from a prior joinSuccess
                // over the fresh ticket-time value, so the first attempt of
                // a reconnect re-presents the same resumption the server has
                // already acknowledged.
                const initialResumption = readResumption(roomID) || r.resumption || '';
                const roomserverURL = r.roomserverURL || this.defaultRoomserverURL;

                this.state = 'connecting';
                this.socket = new SignalingSocket(roomserverURL, ticket);
                this.listener = new EventListener(this.socket);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.listener.on(CoreNamespace, 'joinSuccess', (payload: any) => {
                    // Server-confirmed resumption: only persist once the join
                    // has been accepted. Writing the ticket-time value would
                    // leave a stale token in localStorage if the join itself
                    // was rejected (joinBlocked, banned, etc.).
                    if (typeof payload.resumption === 'string' && payload.resumption) {
                        writeResumption(roomID, payload.resumption);
                    }

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
                    this.localId = self.id;
                    this.state = 'connected';

                    // Normalize livekit bootstrap if present in joinSuccess.
                    // OpenTalk inlines {publicUrl, room, token} here on
                    // current builds; older variants may use {url, token} or
                    // ship them via a separate livekit:credentials frame
                    // (handled below).
                    let livekit: {url: string; token: string} | undefined;
                    if (payload.livekit && typeof payload.livekit === 'object') {
                        const lk = payload.livekit as Record<string, unknown>;
                        const url = (lk.publicUrl ?? lk.public_url ?? lk.url) as string | undefined;
                        const token = lk.token as string | undefined;
                        if (url && token) {
                            livekit = {url, token};
                        }
                    }

                    this.emit('connected', {
                        participants: list,
                        livekit,
                        isHost: payload.is_room_owner === true || payload.isRoomOwner === true,
                    });

                    // Uniform path regardless of joinSuccess vs. separate credentials frame.
                    if (livekit) {
                        this.emit('livekit_credentials', livekit);
                    }
                });

                // Listen for both joined and participantConnected for forward-compat.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const onJoinedFrame = (payload: any) => {
                    if (this.state !== 'connected') {
                        return;
                    }
                    const p = this.normalizeParticipant(payload);

                    // De-dupe in case the roomserver re-emits or both event
                    // names fire — push only when not already present.
                    if (!this.participants.some((existing) => existing.id === p.id)) {
                        this.participants.push(p);
                    }
                    this.emit('participant_joined', p);
                };
                this.listener.on(CoreNamespace, 'joined', onJoinedFrame);
                this.listener.on(CoreNamespace, 'participantConnected', onJoinedFrame);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const onLeftFrame = (payload: any) => {
                    if (this.state !== 'connected') {
                        return;
                    }
                    const id = payload.id ?? payload.participantId;
                    this.participants = this.participants.filter((p) => p.id !== id);
                    this.emit('participant_left', {id});
                };
                this.listener.on(CoreNamespace, 'left', onLeftFrame);
                this.listener.on(CoreNamespace, 'participantDisconnected', onLeftFrame);

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

                // OpenTalk's control:handRaised / handLowered frames don't
                // carry a participant id when they confirm the local user's
                // own action (the ID is implicit). For broadcasts about other
                // participants, payload includes participant_id. Fall back to
                // localId so the local user's hand-state updates either way.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.listener.on(CoreNamespace, 'handRaised', (payload: any) => {
                    const participant = payload.participantId ?? payload.participant_id ?? payload.participant ?? this.localId;
                    if (participant) {
                        this.emit('hand_raised', {participantId: participant as string});
                    }
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.listener.on(CoreNamespace, 'handLowered', (payload: any) => {
                    const participant = payload.participantId ?? payload.participant_id ?? payload.participant ?? this.localId;
                    if (participant) {
                        this.emit('hand_lowered', {participantId: participant as string});
                    }
                });
                this.listener.on(ModerationNamespace, 'raiseHandsEnabled', () => {
                    this.emit('raise_hands_toggled', {enabled: true});
                });
                this.listener.on(ModerationNamespace, 'raiseHandsDisabled', () => {
                    this.emit('raise_hands_toggled', {enabled: false});
                });

                this.socket.on('open', () => {
                    this.socket?.send(buildFrame(CoreNamespace, 'join', {
                        displayName,
                        ...(initialResumption ? {resumption: initialResumption} : {}),
                    }));
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.socket.on('close', (e: any) => {
                    this.state = 'closed';
                    this.listener?.dispose();
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

    public raiseHand(): void {
        if (this.state !== 'connected' || !this.socket) {
            return;
        }
        this.socket.send(buildFrame(CoreNamespace, 'raiseHand', {}));
    }

    public lowerHand(): void {
        if (this.state !== 'connected' || !this.socket) {
            return;
        }
        this.socket.send(buildFrame(CoreNamespace, 'lowerHand', {}));
    }

    /** Host-only: turn the raise-hands feature on for the room. OpenTalk
     * disables it by default, so participants' raiseHand calls no-op until
     * a moderator enables it. */
    public enableRaiseHands(): void {
        if (this.state !== 'connected' || !this.socket) {
            return;
        }
        this.socket.send(buildFrame(ModerationNamespace, 'enableRaiseHands', {}));
    }

    /** Host-only: kick all participants out of the room. Used when ending the
     * meeting for everyone so connected peers are disconnected on the OpenTalk
     * side before the host leaves. */
    public sendDebrief(kickScope: KickScope): void {
        if (this.state !== 'connected' || !this.socket) {
            return;
        }
        this.socket.send(buildFrame(ModerationNamespace, 'debrief', {kickScope}));
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
        this.listener?.dispose();
        this.state = 'closed';
        if (this.roomID) {
            clearResumption(this.roomID);
        }

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

    // OpenTalk's BackendParticipant nests the display name under control.* in
    // both joinSuccess.participants[] entries and joined frames. Older paths
    // we keep handle the flat shape used by the inline self entry we build
    // for joinSuccess.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private normalizeParticipant(p: any): Participant {
        const ctrl = (p.control ?? p.participant ?? {}) as Record<string, unknown>;
        const id = (p.id ?? ctrl.id) as string;
        const displayName =
            (p.displayName ?? p.display_name ?? ctrl.displayName ?? ctrl.display_name) as string | undefined;
        const role = (p.role ?? ctrl.role) as string | undefined;
        return {
            id,
            displayName: displayName ?? id,
            ...(role && {role: role as Participant['role']}),
        };
    }
}
