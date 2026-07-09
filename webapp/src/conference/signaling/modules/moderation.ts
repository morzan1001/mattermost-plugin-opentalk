/*
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 */

export const ModerationNamespace = 'moderation' as const;
export type ModerationNamespace = typeof ModerationNamespace;

// The socket layer snake-cases keys and the `action` value only; other string
// values pass through verbatim, so these must be the wire literals upstream
// KickScope expects.
export type KickScope = 'all' | 'guests' | 'users_and_guests';

// Upstream moderation `Error` enum (tag `error`, snake_case wire values).
export type ModerationError =
    | 'cannot_ban_guest'
    | 'cannot_send_room_owner_to_waiting_room'
    | 'cannot_change_name_of_registered_users'
    | 'invalid_display_name'
    | 'insufficient_permissions';

// ---------- Outgoing ----------

export interface ModerationKick {
    action: 'kick';
    target: string;
}

export interface ModerationBan {
    action: 'ban';
    target: string;
}

export interface ModerationDebrief {
    action: 'debrief';
    kickScope: KickScope;
}

export interface ModerationEnableWaitingRoom {
    action: 'enableWaitingRoom';
}

export interface ModerationDisableWaitingRoom {
    action: 'disableWaitingRoom';
}

export interface ModerationSendToWaitingRoom {
    action: 'sendToWaitingRoom';
    target: string;
}

export interface ModerationChangeDisplayName {
    action: 'changeDisplayName';
    target: string;
    newName: string;
}

export interface ModerationAccept {
    action: 'accept';
    target: string;
}

export interface ModerationEnableRaiseHands {
    action: 'enableRaiseHands';
}

export interface ModerationDisableRaiseHands {
    action: 'disableRaiseHands';
}

export interface ModerationResetRaisedHands {
    action: 'resetRaisedHands';
    target?: string | string[];
}

export type ModerationOutgoing =
    | ModerationKick
    | ModerationBan
    | ModerationDebrief
    | ModerationEnableWaitingRoom
    | ModerationDisableWaitingRoom
    | ModerationSendToWaitingRoom
    | ModerationChangeDisplayName
    | ModerationAccept
    | ModerationEnableRaiseHands
    | ModerationDisableRaiseHands
    | ModerationResetRaisedHands;

// ---------- Incoming ----------

export interface ModerationKicked {
    action: 'kicked';
}

export interface ModerationBanned {
    action: 'banned';
}

export interface ModerationDebriefingStarted {
    action: 'debriefingStarted';
    issuedBy: string;
}

export interface ModerationWaitingRoomEnabled {
    action: 'waitingRoomEnabled';
}

export interface ModerationWaitingRoomDisabled {
    action: 'waitingRoomDisabled';
}

export interface ModerationInWaitingRoom {
    action: 'inWaitingRoom';
}

export interface ModerationJoinedWaitingRoom {
    action: 'joinedWaitingRoom';
    id: string;
    control?: Record<string, unknown>;
}

export interface ModerationLeftWaitingRoom {
    action: 'leftWaitingRoom';
    id: string;
}

export interface ModerationSentToWaitingRoom {
    action: 'sentToWaitingRoom';
}

export interface ModerationAccepted {
    action: 'accepted';
}

export interface ModerationDisplayNameChanged {
    action: 'displayNameChanged';
    target: string;
    issuedBy: string;
    oldName: string;
    newName: string;
}

export interface ModerationSessionEnded {
    action: 'sessionEnded';
    issuedBy: string;
}

export interface ModerationErrorMessage {
    action: 'error';
    error: ModerationError;
}

export interface ModerationRaiseHandsEnabled {
    action: 'raiseHandsEnabled';
    issuedBy: string;
}

export interface ModerationRaiseHandsDisabled {
    action: 'raiseHandsDisabled';
    issuedBy: string;
}

export interface ModerationRaisedHandResetByModerator {
    action: 'raisedHandResetByModerator';
    issuedBy: string;
}

export type ModerationIncoming =
    | ModerationKicked
    | ModerationBanned
    | ModerationDebriefingStarted
    | ModerationWaitingRoomEnabled
    | ModerationWaitingRoomDisabled
    | ModerationInWaitingRoom
    | ModerationJoinedWaitingRoom
    | ModerationLeftWaitingRoom
    | ModerationSentToWaitingRoom
    | ModerationAccepted
    | ModerationDisplayNameChanged
    | ModerationSessionEnded
    | ModerationErrorMessage
    | ModerationRaiseHandsEnabled
    | ModerationRaiseHandsDisabled
    | ModerationRaisedHandResetByModerator;
