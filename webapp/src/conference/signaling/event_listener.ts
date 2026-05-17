/*
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 */

import mitt, {type Emitter, type Handler} from 'mitt';

import type {SignalingSocket} from './socket';

interface NormalizedFrame {
    namespace: string;
    payload: {action: string; [k: string]: unknown};
}

type Events = Record<string, NormalizedFrame['payload']> & {
    '*': NormalizedFrame;
};

function snakeToCamel(s: string): string {
    return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function normalize(raw: unknown): NormalizedFrame | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const f = raw as {namespace?: unknown; payload?: unknown};
    if (typeof f.namespace !== 'string' || typeof f.payload !== 'object' || f.payload === null) {
        return null;
    }
    const p = f.payload as Record<string, unknown>;
    const rawAction = p.action ?? p.message;
    if (typeof rawAction !== 'string') {
        return null;
    }
    const actionValue = snakeToCamel(rawAction);

    // Some incoming frames carry the action under `message` (livekit
    // namespace) instead of `action`; rebuild a normalised payload either way.
    const normalizedPayload: {action: string; [k: string]: unknown} = {action: actionValue};
    for (const [key, value] of Object.entries(p)) {
        if (key === 'action' || key === 'message') {
            continue;
        }
        normalizedPayload[key] = value;
    }

    return {namespace: f.namespace, payload: normalizedPayload};
}

export class EventListener {
    private readonly emitter: Emitter<Events>;
    private readonly onSocketMessage: (raw: unknown) => void;
    private readonly anyListeners = new Set<(msg: NormalizedFrame) => void>();

    constructor(private readonly socket: SignalingSocket) {
        this.emitter = mitt<Events>();
        this.onSocketMessage = (raw: unknown) => {
            const f = normalize(raw);
            if (!f) {
                return;
            }

            // mitt fires '*' handlers automatically for every emit() call,
            // receiving (type, payload). We want onAny() listeners to get the
            // full normalized frame, so we route through a non-'*' channel and
            // bridge in onAny() below.
            const key = `${f.namespace}:${f.payload.action}`;
            this.anyListeners.forEach((l) => l(f));
            this.emitter.emit(key as keyof Events, f.payload as Events[keyof Events]);
        };
        this.socket.on('message', this.onSocketMessage);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public on(namespace: string, action: string, handler: (payload: any) => void): () => void {
        const key = `${namespace}:${action}`;
        const wrapped: Handler<Events[keyof Events]> = (payload) => handler(payload);
        this.emitter.on(key as keyof Events, wrapped);
        return () => this.emitter.off(key as keyof Events, wrapped);
    }

    public onAny(handler: (msg: NormalizedFrame) => void): () => void {
        this.anyListeners.add(handler);
        return () => this.anyListeners.delete(handler);
    }

    public dispose(): void {
        this.socket.off('message', this.onSocketMessage);
        this.emitter.all.clear();
        this.anyListeners.clear();
    }
}

export type {NormalizedFrame};
