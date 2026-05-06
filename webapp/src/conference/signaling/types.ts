/*
 * Aggregated wire-types union for the OpenTalk Signaling protocol.
 *
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 *
 * Mirrors the per-namespace `Message` unions from
 * opentalk/web-frontend@00241cd (`app/src/api/types/incoming/index.ts` and
 * `app/src/api/types/outgoing/index.ts`) but limited to the four MVP
 * namespaces (`core`, `livekit`, `moderation`, `raise_hands`).
 */

import type {SignalingFrame} from './frame';
import type {CoreIncoming, CoreOutgoing} from './modules/core';
import type {LiveKitIncoming, LiveKitOutgoing} from './modules/livekit';
import type {ModerationIncoming, ModerationOutgoing} from './modules/moderation';
import type {RaiseHandsIncoming, RaiseHandsOutgoing} from './modules/raise_hands';

export type IncomingMessage =
    | SignalingFrame<CoreIncoming['action'], CoreIncoming>
    | SignalingFrame<LiveKitIncoming['action'], LiveKitIncoming>
    | SignalingFrame<ModerationIncoming['action'], ModerationIncoming>
    | SignalingFrame<RaiseHandsIncoming['action'], RaiseHandsIncoming>;

export type OutgoingMessage =
    | SignalingFrame<CoreOutgoing['action'], CoreOutgoing>
    | SignalingFrame<LiveKitOutgoing['action'], LiveKitOutgoing>
    | SignalingFrame<ModerationOutgoing['action'], ModerationOutgoing>
    | SignalingFrame<RaiseHandsOutgoing['action'], RaiseHandsOutgoing>;

export type {CoreIncoming, CoreOutgoing, Participant} from './modules/core';
export type {LiveKitIncoming, LiveKitOutgoing} from './modules/livekit';
export type {ModerationIncoming, ModerationOutgoing} from './modules/moderation';
export type {RaiseHandsIncoming, RaiseHandsOutgoing} from './modules/raise_hands';
