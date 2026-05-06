/*
 * Portiert aus opentalk/web-frontend@00241cd
 * app/src/api/types/incoming/core.ts
 * app/src/api/types/outgoing/core.ts
 *
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 *
 * Adaptations from the OpenTalk source:
 *   - Discriminator key unified to `action` (upstream uses `message` for
 *     incoming and `action` for outgoing). The plugin's webapp consumes both
 *     directions through the same `SignalingFrame<...>` shape.
 *   - Action discriminants stored in camelCase. The wire format is snake_case;
 *     the `SignalingSocket` (sibling) handles snake_case<->camelCase
 *     conversion of action values on outgoing frames.
 *   - The `handler = createModule<RootState>(...)` block is intentionally
 *     omitted (RTK runtime dep, see phase5-port-plan.md "DO NOT PORT").
 *   - `Participant` is a minimal MVP shape (id + displayName + a couple of
 *     optional fields). Upstream uses `RoomserverParticipant` with ~12 module
 *     references that aren't used in Tasks 8/9.
 *   - `JoinSuccess` is an MVP subset: only `participants` + `livekit`
 *     bootstrap. Upstream `JoinSuccess extends JoinSuccessRoomserver` pulls in
 *     ~12 module shapes (chat, breakout, polls, automod, sharedFolder,
 *     legalVote, whiteboard, recording, timer, meetingNotes, …) which are
 *     all out of MVP scope. See phase5-port-plan.md "Surprises / Caveats" #5.
 *   - Outgoing actions include `join` + `leave` (the unified MVP wire) plus
 *     `enterRoom` (the upstream `enter_room` command).
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

export type CoreOutgoing = CoreJoin | CoreLeave | CoreEnterRoom;

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

export type CoreIncoming =
    | CoreJoinSuccess
    | CoreParticipantConnected
    | CoreJoinBlocked
    | CoreParticipantDisconnected
    | CoreJoinedWaitingRoom
    | CoreLeftWaitingRoom
    | CoreInWaitingRoom
    | CoreClosing
    | CoreRoomParametersChanged;
