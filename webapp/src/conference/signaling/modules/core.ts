/*
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 */

// On-the-wire namespace is "control" in OpenTalk Backend v25.x/v26.x.
export const CoreNamespace = 'control' as const;
export type CoreNamespace = typeof CoreNamespace;

export type ParticipantRole = 'user' | 'moderator';

export interface Participant {
    id: string;
    displayName: string;
    role?: ParticipantRole;
    avatarUrl?: string;
    joinedAt?: string;
    isRoomOwner?: boolean;
    handIsUp?: boolean;
}

export type JoinBlockedReason = 'participantLimitReached';

export type DisconnectReason =
    | 'leave'
    | 'connectionLost'
    | 'kicked'
    | 'banned'
    | 'internalError'
    | 'sentToWaitingRoom';

export type RoomCloseReason =
    | 'gracefulShutdown'
    | 'immediateShutdown'
    | 'fatalError'
    | 'timeLimitReached'
    | 'idleTimeoutReached';

// ---------- Outgoing ----------

export interface CoreJoin {
    action: 'join';
    displayName: string;
}

export interface CoreLeave {
    action: 'leave';
}

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

export interface CoreJoinSuccess {
    action: 'joinSuccess';
    participants: Participant[];
    livekit?: {
        url: string;
        token: string;
        room?: string;
    };
    id?: string;
    isRoomOwner?: boolean;
    [extra: string]: unknown;
}

export interface CoreParticipantConnected {
    action: 'participantConnected';
    participantId: string;
    connectionId?: string;
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
