/*
 * Portiert aus opentalk/web-frontend@00241cd
 * app/src/types/common.ts (Frame-Definition, lines ~57-63)
 *
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 *
 * Adaptations from the OpenTalk source:
 *   - Replaced `T extends string = Namespaces` with `T extends string = string`
 *     to drop the @opentalk/rest-api-rtk-query dependency. The compile-time
 *     exhaustiveness loss is tolerable; we have per-module unions in
 *     ./modules/* and an aggregated union in ./types.ts.
 *   - Renamed `Namespaced` -> `SignalingFrame` for clarity at the plugin
 *     boundary.
 *   - Dropped the `NamespacedIncoming` `timestamp` field for now (added by the
 *     server, not used by Tasks 8/9). Can be re-added when needed.
 *   - Added `buildFrame` and `isFrame` helpers for ergonomic outgoing-frame
 *     construction and runtime type-narrowing on incoming frames.
 */

export interface SignalingFrame<TAction extends string = string, TPayload extends object = Record<string, unknown>> {
    namespace: string;
    payload: {action: TAction} & TPayload;
}

export function buildFrame<A extends string, P extends object>(namespace: string, action: A, payload: P): SignalingFrame<A, P> {
    return {
        namespace,
        payload: {action, ...payload} as {action: A} & P,
    };
}

export function isFrame(x: unknown): x is SignalingFrame {
    if (typeof x !== 'object' || x === null) {
        return false;
    }
    const f = x as Partial<SignalingFrame>;
    if (typeof f.namespace !== 'string') {
        return false;
    }
    if (typeof f.payload !== 'object' || f.payload === null) {
        return false;
    }
    return typeof (f.payload as {action?: unknown}).action === 'string';
}
