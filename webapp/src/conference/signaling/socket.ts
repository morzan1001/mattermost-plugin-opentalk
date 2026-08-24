/*
 * SPDX-License-Identifier: EUPL-1.2
 * SPDX-FileCopyrightText: OpenTalk GmbH <mail@opentalk.eu>
 */

import camelcaseKeys from 'camelcase-keys';
import snakecaseKeys from 'snakecase-keys';

export type SignalingEvent = 'open' | 'message' | 'close' | 'error';

// Upstream parity: ping every 12s and treat a ping as dead when no echo
// arrived within 10s of it being sent.
const PING_INTERVAL_MS = 12 * 1000;
const ECHO_TIMEOUT_MS = 10 * 1000;
const HEARTBEAT_CLOSE_CODE = 4999;

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
    private heartbeat?: ReturnType<typeof setInterval>;
    private lastPingAt = 0;
    private lastEchoAt = 0;
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

    public connect(): void {
        const ws = new WebSocket(this.url, this.protocols);
        this.ws = ws;
        ws.onopen = (e) => {
            this.startHeartbeat();
            this.emit('open', e);
        };
        ws.onmessage = (e) => {
            try {
                const raw = JSON.parse((e as MessageEvent).data);
                if ((raw as {namespace?: string})?.namespace === 'echo') {
                    this.lastEchoAt = Date.now();
                }
                const message = camelcaseKeys(raw, {deep: true});
                this.emit('message', message);
            } catch (err) {
                this.emit('error', err);
            }
        };
        ws.onclose = (e) => {
            this.stopHeartbeat();
            this.emit('close', e);
        };
        ws.onerror = (e) => {
            this.stopHeartbeat();
            this.emit('error', e);
        };
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

    public off(event: SignalingEvent, listener: SignalingListener): void {
        const arr = this.listeners[event];
        const i = arr.indexOf(listener);
        if (i >= 0) {
            arr.splice(i, 1);
        }
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.lastPingAt = 0;
        this.lastEchoAt = 0;
        this.heartbeat = setInterval(() => this.heartbeatTick(), PING_INTERVAL_MS);
    }

    private stopHeartbeat(): void {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = undefined;
        }
    }

    private heartbeatTick(): void {
        // Only a server reply proves the connection is still alive; traffic we
        // send alone does not.
        if (this.lastPingAt !== 0 && this.lastEchoAt < this.lastPingAt && Date.now() - this.lastPingAt > ECHO_TIMEOUT_MS) {
            this.stopHeartbeat();
            this.ws?.close(HEARTBEAT_CLOSE_CODE, 'signaling heartbeat timeout');
            return;
        }
        this.lastPingAt = Date.now();
        try {
            this.send({namespace: 'echo', payload: {action: 'ping'}});
        } catch {
            // socket already closing
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private emit(event: SignalingEvent, data?: any): void {
        for (const l of this.listeners[event].slice()) {
            l(data);
        }
    }
}
