/*
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 */

import type {ParticipantRole} from './core';

export const ModerationNamespace = 'moderation' as const;
export type ModerationNamespace = typeof ModerationNamespace;

/**
 * Mirrors upstream `KickScope`. Wire values are snake_case
 * (`users_and_guests`); we keep camelCase here and rely on the socket layer
 * to convert.
 */
export type KickScope = 'all' | 'guests' | 'usersAndGuests';

/**
 * Mirrors upstream `ModerationError` (19 variants).
 */
export type ModerationError =
    | 'cannotChangeNameOfRegisteredUsers'
    | 'invalidDisplayName'
    | 'insufficientPermissions'
    | 'unknownParticipant'
    | 'unknownParticipants'
    | 'alreadyBanned'
    | 'alreadyUnbanned'
    | 'cannotBanRoomOwner'
    | 'cannotBanGuests'
    | 'cannotBanSelf'
    | 'cannotChangeRoomOwnerRole'
    | 'roleAlreadyAssigned'
    | 'notWaiting'
    | 'notAccepted'
    | 'cannotSendRoomOwnerToWaitingRoom'
    | 'cannotKickRoomOwner'
    | 'internal'
    | 'conflictingTask'
    | 'livekitUnavailable';

// ---------- Outgoing ----------

export interface ModerationKick {
    action: 'kick';
    target: string;
}

export interface ModerationBan {
    action: 'ban';
    target: string;
}

export interface ModerationUnban {
    action: 'unban';
    target: string;
}

export interface ModerationUpdateRole {
    action: 'updateRole';
    participantId: string;
    newRole: ParticipantRole;
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

export interface ModerationDisableDisplayNameChangeRestrictions {
    action: 'disableDisplayNameChangeRestrictions';
}

export interface ModerationEnableDisplayNameChangeRestrictions {
    action: 'enableDisplayNameChangeRestrictions';
    unrestrictedParticipants: string[];
}

export interface ModerationAccept {
    action: 'accept';
    target: string;
}

export interface ModerationMute {
    action: 'mute';
    participants?: string[];
}

export interface ModerationEnableMicrophoneRestrictions {
    action: 'enableMicrophoneRestrictions';
    unrestrictedParticipants: string[];
}

export interface ModerationDisableMicrophoneRestrictions {
    action: 'disableMicrophoneRestrictions';
}

export interface ModerationEnableRaiseHands {
    action: 'enableRaiseHands';
}

export interface ModerationDisableRaiseHands {
    action: 'disableRaiseHands';
}

export interface ModerationResetRaisedHands {
    action: 'resetRaisedHands';
    target?: string[];
}

export type ModerationOutgoing =
    | ModerationKick
    | ModerationBan
    | ModerationUnban
    | ModerationUpdateRole
    | ModerationDebrief
    | ModerationEnableWaitingRoom
    | ModerationDisableWaitingRoom
    | ModerationSendToWaitingRoom
    | ModerationChangeDisplayName
    | ModerationDisableDisplayNameChangeRestrictions
    | ModerationEnableDisplayNameChangeRestrictions
    | ModerationAccept
    | ModerationMute
    | ModerationEnableMicrophoneRestrictions
    | ModerationDisableMicrophoneRestrictions
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

export interface ModerationParticipantBanned {
    action: 'participantBanned';
    participantId: string;
    displayName: string;
    avatarUrl: string;
    bannedBy: string;
    bannedAt: string;
}

export interface ModerationParticipantUnbanned {
    action: 'participantUnbanned';
    participantId: string;
}

export interface ModerationRoleUpdated {
    action: 'roleUpdated';
    participantId: string;
    newRole: ParticipantRole;
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
    id: string;
}

export interface ModerationSentToWaitingRoom {
    action: 'sentToWaitingRoom';
}

export interface ModerationAccepted {
    action: 'accepted';
}

export interface ModerationParticipantAccepted {
    action: 'participantAccepted';
    participantId: string;
}

export interface ModerationDisplayNameChanged {
    action: 'displayNameChanged';
    target: string;
    issuedBy: string;
    oldName: string;
    newName: string;
}

export interface ModerationDisplayNameChangeRestrictionsDisabled {
    action: 'displayNameChangeRestrictionsDisabled';
}

export interface ModerationDisplayNameChangeRestrictionsEnabled {
    action: 'displayNameChangeRestrictionsEnabled';
}

export interface ModerationMuted {
    action: 'muted';
    moderator: string;
}

export interface ModerationMicrophoneRestrictionsEnabled {
    action: 'microphoneRestrictionsEnabled';
    unrestrictedParticipants: string[];
}

export interface ModerationMicrophoneRestrictionsDisabled {
    action: 'microphoneRestrictionsDisabled';
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
    participants: string[];
}

export type ModerationIncoming =
    | ModerationKicked
    | ModerationBanned
    | ModerationParticipantBanned
    | ModerationParticipantUnbanned
    | ModerationRoleUpdated
    | ModerationDebriefingStarted
    | ModerationWaitingRoomEnabled
    | ModerationWaitingRoomDisabled
    | ModerationSentToWaitingRoom
    | ModerationAccepted
    | ModerationParticipantAccepted
    | ModerationDisplayNameChanged
    | ModerationDisplayNameChangeRestrictionsDisabled
    | ModerationDisplayNameChangeRestrictionsEnabled
    | ModerationMuted
    | ModerationMicrophoneRestrictionsEnabled
    | ModerationMicrophoneRestrictionsDisabled
    | ModerationErrorMessage
    | ModerationRaiseHandsEnabled
    | ModerationRaiseHandsDisabled
    | ModerationRaisedHandResetByModerator;
