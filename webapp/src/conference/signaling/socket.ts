/*
 * Portiert aus opentalk/web-frontend@00241cd
 * app/src/modules/WebRTC/SignalingSocket.ts
 *
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 *
 * Adaptations from the OpenTalk source:
 *   - Removed window.debugKillSignaling debug hook (Phase-1-Inventory: must be
 *     removed before shipping).
 *   - Stripped OpenTalk-internal imports (../../api/types/{incoming,outgoing},
 *     ../../logger, ../../types, ../EventListener) that don't apply to the
 *     plugin's webapp.
 *   - Replaced BaseEventEmitter (mitt-based) with a tiny self-contained
 *     listener registry; mitt is a Task-7 (EventListener) dependency, not
 *     needed here.
 *   - Constructor signature simplified to (roomserverURL, ticket) and the WS
 *     URL is built as `${baseURL}/v1/signaling/${ticket}` (Phase-0-Spike
 *     confirmed path).
 *   - Public surface trimmed to: connect(), disconnect(), send(payload),
 *     on(event, listener), isOpen(). Heartbeat / reconnect / close-code-driven
 *     state machine from the OpenTalk original is intentionally out of scope
 *     for this task and will be re-added in a later phase if required.
 *   - Event names are 'open' | 'message' | 'close' | 'error' (vs the original
 *     'connectionstatechange' | 'message'); the plugin webapp consumes raw
 *     lifecycle events.
 */

import camelcaseKeys from 'camelcase-keys';
import snakecaseKeys from 'snakecase-keys';

export type SignalingEvent = 'open' | 'message' | 'close' | 'error';

const camelToSnake = (s: string): string => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

/**
 * Recursively rewrites any `action` string value (anywhere in the tree) from
 * camelCase to snake_case. The OpenTalk wire protocol uses snake_case for the
 * `action` discriminant value (e.g. `join_success`, not `joinSuccess`); the
 * upstream `snakecase-keys` package only converts keys, not values, so callers
 * that pass camelCase action tokens would otherwise emit invalid frames.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const snakeCaseActionValues = (input: any): any => {
    if (Array.isArray(input)) {
        return input.map(snakeCaseActionValues);
    }
    if (input !== null && typeof input === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(input)) {
            if (k === 'action' && typeof v === 'string') {
                out[k] = camelToSnake(v);
            } else {
                out[k] = snakeCaseActionValues(v);
            }
        }
        return out;
    }
    return input;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SignalingListener = (data?: any) => void;

export class SignalingSocket {
    private ws?: WebSocket;
    private readonly url: string;
    private readonly protocols: string[];
    private readonly listeners: Record<SignalingEvent, SignalingListener[]> = {
        open: [],
        message: [],
        close: [],
        error: [],
    };

    constructor(roomserverURL: string, ticket: string) {
        const base = roomserverURL.replace(/\/+$/, '');
        // OpenTalk authenticates the WS upgrade via a Sec-WebSocket-Protocol
        // entry of the form `ticket#<ticket-id>#<random>` (the # marker stays
        // unencoded; it is part of the protocol-name token, not a URL
        // component). The url itself is just /signaling.
        this.url = `${base}/signaling`;
        this.protocols = [`ticket#${ticket}`, 'opentalk-signaling-json-v1.0'];
    }

    public getURL(): string {
        return this.url;
    }

    public isOpen(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    public connect(): void {
        const ws = new WebSocket(this.url, this.protocols);
        this.ws = ws;
        ws.onopen = (e) => this.emit('open', e);
        ws.onmessage = (e) => {
            try {
                const raw = JSON.parse((e as MessageEvent).data);
                const message = camelcaseKeys(raw, {deep: true});
                this.emit('message', message);
            } catch (err) {
                this.emit('error', err);
            }
        };
        ws.onclose = (e) => this.emit('close', e);
        ws.onerror = (e) => this.emit('error', e);
    }

    public disconnect(): void {
        this.ws?.close(1000, 'Normal Shutdown');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public send(payload: Record<string, any>): void {
        if (!this.ws) {
            throw new Error('SignalingSocket: send() called before connect()');
        }
        const wire = snakeCaseActionValues(snakecaseKeys(payload, {deep: true}));
        this.ws.send(JSON.stringify(wire));
    }

    public on(event: SignalingEvent, listener: SignalingListener): void {
        this.listeners[event].push(listener);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private emit(event: SignalingEvent, data?: any): void {
        for (const l of this.listeners[event]) {
            l(data);
        }
    }
}
