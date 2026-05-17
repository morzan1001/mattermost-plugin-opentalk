/*
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
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
