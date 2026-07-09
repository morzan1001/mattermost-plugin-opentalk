import manifest from '../manifest';

const pluginId: string = manifest.id;

export interface CreateMeetingResponse {
    room_id: string;
    invite_code: string;
    ticket: string;
    resumption: string;
    roomserver_url: string;
    post_id: string;
}

export interface MeResponse {
    connected: boolean;
    email?: string;
    sub?: string;
}

export async function getConnectionStatus(): Promise<MeResponse> {
    const r = await fetch(pluginURL('/api/v1/me'), {
        method: 'GET',
        credentials: 'include',
    });
    if (!r.ok) {
        return {connected: false};
    }
    return r.json();
}

function pluginURL(path: string): string {
    return `/plugins/${pluginId}${path}`;
}

export async function createMeeting(channelID: string, deviceSecret: string): Promise<CreateMeetingResponse> {
    const r = await fetch(pluginURL('/api/v1/meetings'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({channel_id: channelID, device_secret: deviceSecret}),
    });
    if (r.status === 409) {
        const body = (await r.json()) as {error?: string; room_id: string; post_id?: string; host_user_id?: string};
        const err: Error & {status?: number; existing?: typeof body} = new Error(body.error ?? 'meeting already active');
        err.status = 409;
        err.existing = body;
        throw err;
    }
    if (!r.ok) {
        throw new Error(`createMeeting failed: ${r.status}`);
    }
    return (await r.json()) as CreateMeetingResponse;
}

export interface JoinMeetingResponse {
    ticket: string;
    resumption: string;
    roomserver_url: string;
}

export async function joinMeeting(
    roomID: string,
    channelID: string,
    deviceSecret: string,
    resumption?: string,
): Promise<JoinMeetingResponse> {
    const body: Record<string, string> = {
        channel_id: channelID,
        device_secret: deviceSecret,
    };
    if (resumption) {
        body.resumption = resumption;
    }
    const r = await fetch(pluginURL(`/api/v1/meetings/${encodeURIComponent(roomID)}/join`), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify(body),
    });
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`joinMeeting ${r.status}: ${text}`);
    }
    return r.json();
}

export async function heartbeat(channelID: string): Promise<void> {
    const r = await fetch(pluginURL('/api/v1/meetings/heartbeat'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({channel_id: channelID}),
    });

    // fetch only rejects on network errors; a 5xx would otherwise be swallowed,
    // defeating the caller's failure logging.
    if (!r.ok) {
        throw new Error(`heartbeat failed: ${r.status}`);
    }
}

export async function dismissIncomingCall(channelID: string, roomID: string): Promise<void> {
    const r = await fetch(pluginURL('/api/v1/meetings/dismiss'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({channel_id: channelID, room_id: roomID}),
    });
    if (!r.ok && r.status !== 204) {
        throw new Error(`dismiss failed: ${r.status}`);
    }
}

export function getOrCreateDeviceSecret(): string {
    const KEY = 'opentalk:device-secret:v1';
    let s = localStorage.getItem(KEY);
    if (!s) {
        s = Array.from(crypto.getRandomValues(new Uint8Array(32))).
            map((b) => b.toString(16).padStart(2, '0')).
            join('');
        localStorage.setItem(KEY, s);
    }
    return s;
}
