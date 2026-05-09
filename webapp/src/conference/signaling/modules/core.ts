/*
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 */

// Wire-protocol namespace. Despite the file/type name being "Core", the
// actual on-the-wire namespace is "control" in OpenTalk Backend v25.x/v26.x.
export const CoreNamespace = 'control' as const;
export type CoreNamespace = typeof CoreNamespace;

/** Roles for participants. Mirrors `Role` from `app/src/types/common.ts`. */
export type ParticipantRole = 'user' | 'moderator';

/**
 * Minimal MVP shape for a participant. Upstream `BackendParticipant` carries
 * media state, meeting-notes state, breakout state, etc. — all out of scope
 * for Tasks 8/9. Re-add fields here as the meeting UI grows.
 */
export interface Participant {
    id: string;
    displayName: string;
    role?: ParticipantRole;
    avatarUrl?: string;
    joinedAt?: string;
    isRoomOwner?: boolean;
    handIsUp?: boolean;
}

/**
 * Reasons the server may report when blocking a join attempt.
 * Mirrors upstream `JoinBlockedReason`.
 */
export type JoinBlockedReason = 'participantLimitReached';

/**
 * Reasons a participant may have disconnected.
 * Mirrors upstream `DisconnectReason`.
 */
export type DisconnectReason =
    | 'leave'
    | 'connectionLost'
    | 'kicked'
    | 'banned'
    | 'internalError'
    | 'sentToWaitingRoom';

/**
 * Reasons a room may be closing.
 * Mirrors upstream `RoomCloseReason`.
 */
export type RoomCloseReason =
    | 'gracefulShutdown'
    | 'immediateShutdown'
    | 'fatalError'
    | 'timeLimitReached'
    | 'idleTimeoutReached';

// ---------- Outgoing ----------

/**
 * Join the room with a chosen display name. (MVP wire shape.)
 */
export interface CoreJoin {
    action: 'join';
    displayName: string;
}

/**
 * Leave the room. (MVP wire shape.)
 */
export interface CoreLeave {
    action: 'leave';
}

/**
 * Confirm room entry after the join handshake. Mirrors upstream
 * `enter_room` command.
 */
export interface CoreEnterRoom {
    action: 'enterRoom';
}

export interface CoreRaiseHand {
    action: 'raiseHand';
}

export interface CoreLowerHand {
    action: 'lowerHand';
}

export type CoreOutgoing = CoreJoin | CoreLeave | CoreEnterRoom | CoreRaiseHand | CoreLowerHand;

// ---------- Incoming ----------

/**
 * Server-confirmed join. **MVP subset**: only fields the meeting UI consumes
 * in Tasks 8/9 (participants list + livekit bootstrap). The full
 * `JoinSuccessRoomserver` shape in upstream pulls in ~12 module shapes
 * which we deliberately omit. See file header for details.
 */
export interface CoreJoinSuccess {
    action: 'joinSuccess';
    participants: Participant[];
    livekit?: {
        url: string;
        token: string;
        room?: string;
    };

    /** The participant id assigned by the server, if known. */
    id?: string;

    /** True when the joining user owns the room. */
    isRoomOwner?: boolean;

    /** Catch-all for upstream balloon fields the MVP doesn't use yet. */
    [extra: string]: unknown;
}

export interface CoreParticipantConnected {
    action: 'participantConnected';
    participantId: string;
    connectionId?: string;

    /** Per-module peer state. MVP keeps it loose; upstream is `PeerModuleData`. */
    peerData?: Record<string, unknown>;
}

export interface CoreJoinBlocked {
    action: 'joinBlocked';
    reason: JoinBlockedReason;
}

export interface CoreParticipantDisconnected {
    action: 'participantDisconnected';
    participantId: string;
    connectionId?: string;
    reason: DisconnectReason;
}

export interface CoreJoinedWaitingRoom {
    action: 'joinedWaitingRoom';
    id: string;
    displayName?: string;
}

export interface CoreLeftWaitingRoom {
    action: 'leftWaitingRoom';
    id: string;
    connectionId?: string;
}

export interface CoreInWaitingRoom {
    action: 'inWaitingRoom';
    participantId: string;
    connectionId?: string;
}

export interface CoreClosing {
    action: 'closing';
    reason: RoomCloseReason;
}

export interface CoreRoomParametersChanged {
    action: 'roomParametersChanged';
    change: {
        password?: string;
        title?: string;
    };
}

export interface CoreHandRaised {
    action: 'handRaised';
    participant: string;
}

export interface CoreHandLowered {
    action: 'handLowered';
    participant: string;
}

export type CoreIncoming =
    | CoreJoinSuccess
    | CoreParticipantConnected
    | CoreJoinBlocked
    | CoreParticipantDisconnected
    | CoreJoinedWaitingRoom
    | CoreLeftWaitingRoom
    | CoreInWaitingRoom
    | CoreClosing
    | CoreRoomParametersChanged
    | CoreHandRaised
    | CoreHandLowered;
