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
