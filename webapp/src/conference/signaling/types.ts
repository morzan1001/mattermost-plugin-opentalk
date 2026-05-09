/*
 * Aggregated wire-types union for the OpenTalk Signaling protocol.
 *
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 *
 * Mirrors the per-namespace `Message` unions from
 * opentalk/web-frontend@00241cd (`app/src/api/types/incoming/index.ts` and
 * `app/src/api/types/outgoing/index.ts`) limited to the three MVP
 * namespaces (`control`, `livekit`, `moderation`).
 */

import type {SignalingFrame} from './frame';
import type {CoreIncoming, CoreOutgoing} from './modules/core';
import type {LiveKitIncoming, LiveKitOutgoing} from './modules/livekit';
import type {ModerationIncoming, ModerationOutgoing} from './modules/moderation';

export type IncomingMessage =
    | SignalingFrame<CoreIncoming['action'], CoreIncoming>
    | SignalingFrame<LiveKitIncoming['action'], LiveKitIncoming>
    | SignalingFrame<ModerationIncoming['action'], ModerationIncoming>;

export type OutgoingMessage =
    | SignalingFrame<CoreOutgoing['action'], CoreOutgoing>
    | SignalingFrame<LiveKitOutgoing['action'], LiveKitOutgoing>
    | SignalingFrame<ModerationOutgoing['action'], ModerationOutgoing>;

export type {CoreIncoming, CoreOutgoing, Participant} from './modules/core';
export type {LiveKitIncoming, LiveKitOutgoing} from './modules/livekit';
export type {ModerationIncoming, ModerationOutgoing} from './modules/moderation';
