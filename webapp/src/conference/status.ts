import {t} from '../util/i18n';

const PRIOR_STATUS_KEY = 'opentalk:prior-status:v1';

type CustomStatus = {emoji?: string; text?: string; duration?: string; expires_at?: string};

function readPriorStatus(): CustomStatus | null {
    try {
        const raw = window.localStorage.getItem(PRIOR_STATUS_KEY);
        return raw ? JSON.parse(raw) as CustomStatus : null;
    } catch {
        return null;
    }
}

function writePriorStatus(status: CustomStatus | null): void {
    try {
        if (status === null) {
            window.localStorage.removeItem(PRIOR_STATUS_KEY);
        } else {
            window.localStorage.setItem(PRIOR_STATUS_KEY, JSON.stringify(status));
        }
    } catch {
        // quota / private mode
    }
}

async function fetchCurrentStatus(): Promise<CustomStatus | null> {
    try {
        const r = await fetch('/api/v4/users/me', {
            method: 'GET',
            headers: {'X-Requested-With': 'XMLHttpRequest'},
            credentials: 'include',
        });
        if (!r.ok) {
            return null;
        }
        const me = await r.json() as {props?: {customStatus?: string}};
        const s = me.props?.customStatus;
        if (typeof s !== 'string' || s === '') {
            return null;
        }
        return JSON.parse(s) as CustomStatus;
    } catch {
        return null;
    }
}

const OPENTALK_STATUS_EMOJI = 'phone';

// Bumped by both set and clear. setOpenTalkStatusAsync captures the value at
// call time and bails before its PUT if it changed, so a late set cannot
// overwrite a clear that ran while its GET was in flight (status stuck 4h).
let statusEpoch = 0;

async function setOpenTalkStatusAsync(epoch: number): Promise<void> {
    const prior = await fetchCurrentStatus();
    if (epoch !== statusEpoch) {
        return;
    }
    if (prior && prior.emoji !== OPENTALK_STATUS_EMOJI) {
        writePriorStatus(prior);
    }

    // MM 6+ rejects custom-status PUTs with a duration but no expires_at
    // (400 Bad Request). Send both.
    const expiresAt = new Date(Date.now() + (4 * 60 * 60 * 1000)).toISOString();
    await fetch('/api/v4/users/me/status/custom', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({
            emoji: OPENTALK_STATUS_EMOJI,
            text: t({de: 'Im OpenTalk-Meeting', en: 'In an OpenTalk meeting'}),
            duration: 'four_hours',
            expires_at: expiresAt,
        }),
    }).catch(() => { /* swallow */ });
}

export function setOpenTalkStatus(): void {
    const epoch = ++statusEpoch;
    setOpenTalkStatusAsync(epoch).catch(() => { /* swallow */ });
}

export function clearOpenTalkStatus(): void {
    statusEpoch++;
    const prior = readPriorStatus();
    writePriorStatus(null);
    if (!prior || !prior.emoji) {
        fetch('/api/v4/users/me/status/custom', {
            method: 'DELETE',
            headers: {'X-Requested-With': 'XMLHttpRequest'},
            credentials: 'include',
        }).catch(() => { /* swallow */ });
        return;
    }
    fetch('/api/v4/users/me/status/custom', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify(prior),
    }).catch(() => { /* swallow */ });
}
