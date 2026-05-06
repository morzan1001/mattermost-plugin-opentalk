/*
 * Portiert aus opentalk/web-frontend@00241cd
 * app/src/api/types/incoming/raiseHands.ts
 * app/src/api/types/outgoing/raiseHands.ts
 *
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 *
 * Adaptations from the OpenTalk source:
 *   - File renamed to `raise_hands.ts` (snake_case) to match the wire
 *     namespace. Upstream filename is `raiseHands.ts` (camelCase). See
 *     phase5-port-plan.md "Surprises / Caveats" #4.
 *   - Discriminator key unified to `action` (upstream uses `message` for
 *     incoming and `action` for outgoing).
 *   - Action discriminants stored in camelCase; the SignalingSocket converts
 *     to/from snake_case on the wire.
 *   - The `handler = createModule<RootState>(...)` block is intentionally
 *     omitted (RTK runtime dep).
 */

export const RaiseHandsNamespace = 'raise_hands' as const;
export type RaiseHandsNamespace = typeof RaiseHandsNamespace;

/** Mirrors upstream `RaiseHandsError`. */
export type RaiseHandsError =
    | 'insufficientPermissions'
    | 'unknownParticipant'
    | 'raiseHandsDisabled';

// ---------- Outgoing ----------

export interface RaiseHandsEnable {
    action: 'enableRaiseHands';
}

export interface RaiseHandsDisable {
    action: 'disableRaiseHands';
}

export interface RaiseHandsRaiseHand {
    action: 'raiseHand';
}

export interface RaiseHandsLowerHand {
    action: 'lowerHand';
}

export interface RaiseHandsResetRaisedHands {
    action: 'resetRaisedHands';
    target?: string[];
}

export type RaiseHandsOutgoing =
    | RaiseHandsEnable
    | RaiseHandsDisable
    | RaiseHandsRaiseHand
    | RaiseHandsLowerHand
    | RaiseHandsResetRaisedHands;

// ---------- Incoming ----------

export interface RaiseHandsEnabled {
    action: 'raiseHandsEnabled';
    issuedBy: string;
}

export interface RaiseHandsDisabled {
    action: 'raiseHandsDisabled';
    issuedBy: string;
}

export interface RaiseHandsHandRaised {
    action: 'handRaised';
    participant: string;
}

export interface RaiseHandsHandLowered {
    action: 'handLowered';
    participant: string;
}

export interface RaiseHandsRaisedHandResetByModerator {
    action: 'raisedHandResetByModerator';
    issuedBy: string;
    participants: string[];
}

export interface RaiseHandsErrorMessage {
    action: 'error';
    error: RaiseHandsError;
}

export type RaiseHandsIncoming =
    | RaiseHandsEnabled
    | RaiseHandsDisabled
    | RaiseHandsHandRaised
    | RaiseHandsHandLowered
    | RaiseHandsRaisedHandResetByModerator
    | RaiseHandsErrorMessage;
