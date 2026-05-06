/*
 * Portiert aus opentalk/web-frontend@00241cd
 * app/src/api/types/incoming/livekit.ts
 * app/src/api/types/outgoing/livekit.ts
 *
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 *
 * Adaptations from the OpenTalk source:
 *   - Discriminator key unified to `action` (upstream uses `message` for
 *     incoming and `action` for outgoing).
 *   - Action discriminants stored in camelCase; the SignalingSocket converts
 *     to/from snake_case on the wire.
 *   - The `handler = createModule<RootState>(...)` block is intentionally
 *     omitted (RTK runtime dep).
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

export type LiveKitOutgoing =
    | LiveKitGrantScreenSharePermission
    | LiveKitRevokeScreenSharePermission
    | LiveKitRequestPopoutStreamAccessToken
    | LiveKitCreateNewAccessToken;

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

export type LiveKitIncoming =
    | LiveKitPopoutStreamAccessToken
    | LiveKitCredentials
    | LiveKitScreenSharePermissionsUpdated
    | LiveKitErrorMessage;
