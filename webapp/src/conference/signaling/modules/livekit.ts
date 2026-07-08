/*
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 */

export const LivekitNamespace = 'livekit' as const;
export type LivekitNamespace = typeof LivekitNamespace;

/** Errors the server may report for the livekit namespace. */
export type LivekitError = 'livekitUnavailable';

// ---------- Outgoing ----------

export interface LiveKitGrantScreenSharePermission {
    action: 'grantScreenSharePermission';
    participants: string[];
}

export interface LiveKitRevokeScreenSharePermission {
    action: 'revokeScreenSharePermission';
    participants: string[];
}

export interface LiveKitRequestPopoutStreamAccessToken {
    action: 'requestPopoutStreamAccessToken';
}

export interface LiveKitCreateNewAccessToken {
    action: 'createNewAccessToken';
}

export interface LiveKitForceMute {
    action: 'forceMute';
    participants: string[];
}

export interface LiveKitEnableMicrophoneRestrictions {
    action: 'enableMicrophoneRestrictions';
    unrestrictedParticipants: string[];
}

export interface LiveKitDisableMicrophoneRestrictions {
    action: 'disableMicrophoneRestrictions';
}

export type LiveKitOutgoing =
    | LiveKitGrantScreenSharePermission
    | LiveKitRevokeScreenSharePermission
    | LiveKitRequestPopoutStreamAccessToken
    | LiveKitCreateNewAccessToken
    | LiveKitForceMute
    | LiveKitEnableMicrophoneRestrictions
    | LiveKitDisableMicrophoneRestrictions;

// ---------- Incoming ----------

export interface LiveKitPopoutStreamAccessToken {
    action: 'popoutStreamAccessToken';
    token: string;
}

export interface LiveKitCredentials {
    action: 'credentials';
    room: string;
    token: string;
    publicUrl: string;
}

export interface LiveKitScreenSharePermissionsUpdated {
    action: 'screenSharePermissionsUpdated';
    grant: boolean;
    participants: string[];
}

export interface LiveKitErrorMessage {
    action: 'error';
    error: LivekitError;
}

export interface LiveKitForceMuted {
    action: 'forceMuted';
    moderator: string;
}

export interface LiveKitMicrophoneRestrictionsEnabled {
    action: 'microphoneRestrictionsEnabled';
    unrestrictedParticipants: string[];
}

export interface LiveKitMicrophoneRestrictionsDisabled {
    action: 'microphoneRestrictionsDisabled';
}

export type LiveKitIncoming =
    | LiveKitPopoutStreamAccessToken
    | LiveKitCredentials
    | LiveKitScreenSharePermissionsUpdated
    | LiveKitErrorMessage
    | LiveKitForceMuted
    | LiveKitMicrophoneRestrictionsEnabled
    | LiveKitMicrophoneRestrictionsDisabled;
