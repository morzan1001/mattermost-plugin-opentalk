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

export interface CoreEnterRoom {
    action: 'enterRoom';
}

export interface CoreRaiseHand {
    action: 'raiseHand';
}

export interface CoreLowerHand {
    action: 'lowerHand';
}

export interface CoreGrantModeratorRole {
    action: 'grantModeratorRole';
    target: string;
}

export interface CoreRevokeModeratorRole {
    action: 'revokeModeratorRole';
    target: string;
}

export type CoreOutgoing =
    | CoreJoin
    | CoreEnterRoom
    | CoreRaiseHand
    | CoreLowerHand
    | CoreGrantModeratorRole
    | CoreRevokeModeratorRole;

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

export interface CoreJoinBlocked {
    action: 'joinBlocked';
    reason: JoinBlockedReason;
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

export interface CoreModeratorRoleGranted {
    action: 'moderatorRoleGranted';
    target: string;
}

export interface CoreModeratorRoleRevoked {
    action: 'moderatorRoleRevoked';
    target: string;
}

export interface CoreRoleUpdated {
    action: 'roleUpdated';
    newRole: ParticipantRole;
}

export type CoreIncoming =
    | CoreJoinSuccess
    | CoreJoinBlocked
    | CoreClosing
    | CoreRoomParametersChanged
    | CoreHandRaised
    | CoreHandLowered
    | CoreModeratorRoleGranted
    | CoreModeratorRoleRevoked
    | CoreRoleUpdated;
