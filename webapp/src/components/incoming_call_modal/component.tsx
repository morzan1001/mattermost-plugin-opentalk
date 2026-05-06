import React, {useEffect, useState} from 'react';
import {useDispatch, useSelector, useStore} from 'react-redux';

import {dismissIncomingCall} from '../../client/rest';
import {startConferenceConnection} from '../../conference/controller';
import {useRingtone} from '../../hooks/use_ringtone';
import {
    incomingCallDismissed,
    incomingCallCleared,
    type IncomingCall,
} from '../../store/slice_incoming_calls';

const stateKey = 'plugins-de.opentalk.mattermost-plugin';

const IncomingCallModal: React.FC = () => {
    const dispatch = useDispatch();
    const store = useStore();
    const ringtone = useRingtone();

    // Session status — only show when idle
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionStatus = useSelector((s: any) => s?.[stateKey]?.session?.status ?? 'idle') as string;

    // Current display name: nickname > first+last > username (same as post_type_meeting)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentDisplayName = useSelector((s: any) => {
        const id = s?.entities?.users?.currentUserId;
        if (!id) {
            return '';
        }
        const u = s?.entities?.users?.profiles?.[id];
        if (!u) {
            return '';
        }
        const nick = (u.nickname ?? '').trim();
        if (nick) {
            return nick;
        }
        const full = ((u.first_name ?? '') + ' ' + (u.last_name ?? '')).trim();
        if (full) {
            return full;
        }
        return u.username ?? '';
    });

    // Pick the most recent non-dismissed incoming call
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = useSelector((s: any): IncomingCall | null => {
        const byChannelID = s?.[stateKey]?.incomingCalls?.byChannelID as Record<string, IncomingCall> | undefined;
        if (!byChannelID) {
            return null;
        }
        const nonDismissed = Object.values(byChannelID).filter((c) => !c.dismissed);
        if (nonDismissed.length === 0) {
            return null;
        }
        return nonDismissed.reduce((latest, c) => (c.receivedAt > latest.receivedAt ? c : latest));
    });

    const [busy, setBusy] = useState(false);
    const [avatarError, setAvatarError] = useState(false);
    const [barWidth, setBarWidth] = useState(100);

    // Start ringtone on mount, stop on unmount
    useEffect(() => {
        ringtone.start();
        return () => {
            ringtone.stop();
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Countdown bar: animate from 100% to 0% over 30s using CSS transition
    useEffect(() => {
        if (call === null) {
            return undefined;
        }
        const rafId = requestAnimationFrame(() => {
            setBarWidth(0);
        });
        return () => {
            cancelAnimationFrame(rafId);
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [call?.channelID]);

    // Reset avatar error when call changes
    useEffect(() => {
        setAvatarError(false);
    }, [call?.hostUserID]);

    const onDecline = async () => {
        if (!call) {
            return;
        }
        setBusy(true);
        ringtone.stop();
        dispatch(incomingCallDismissed({channelID: call.channelID}));
        try {
            await dismissIncomingCall(call.channelID, call.roomID);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[opentalk] dismiss failed:', (e as Error).message);
        }

        // Brief fade window, then fully clear.
        setTimeout(() => {
            dispatch(incomingCallCleared({channelID: call.channelID}));
        }, 250);
    };

    const onAccept = async () => {
        if (!call) {
            return;
        }
        setBusy(true);
        ringtone.stop();
        try {
            await startConferenceConnection(call.roomID, call.channelID, currentDisplayName, store);
            dispatch(incomingCallCleared({channelID: call.channelID}));
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[opentalk] accept-call failed:', (e as Error).message);

            // Re-enable so user can try again
            setBusy(false);
        }
    };

    // Auto-decline after 30s
    useEffect(() => {
        const id = window.setTimeout(() => onDecline(), 30000);
        return () => window.clearTimeout(id);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (sessionStatus !== 'idle' || call === null) {
        return null;
    }

    const avatarUrl = `/api/v4/users/${call.hostUserID}/image?_=${call.receivedAt}`;
    const initials = call.hostName.
        split(/\s+/).
        slice(0, 2).
        map((w) => w[0] ?? '').
        join('').
        toUpperCase();

    return (
        <div
            data-testid='incoming-call-modal'
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.55)',
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Inter, system-ui, sans-serif',
            }}
        >
            <div
                style={{
                    background: '#1c2230',
                    color: 'white',
                    borderRadius: 16,
                    padding: '24px 32px',
                    minWidth: 340,
                    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                    textAlign: 'center',
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                {/* Countdown bar */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: 4,
                        width: `${barWidth}%`,
                        background: '#00B59C',
                        transition: 'width 30s linear',
                        borderRadius: '16px 0 0 0',
                    }}
                />

                {/* Avatar or initials fallback */}
                <div style={{display: 'flex', justifyContent: 'center', marginBottom: 16, marginTop: 8}}>
                    {avatarError ? (
                        <div
                            style={{
                                width: 72,
                                height: 72,
                                borderRadius: '50%',
                                background: '#00B59C',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 24,
                                fontWeight: 700,
                                color: 'white',
                                flexShrink: 0,
                            }}
                        >
                            {initials}
                        </div>
                    ) : (
                        <img
                            src={avatarUrl}
                            alt={call.hostName}
                            width={72}
                            height={72}
                            style={{borderRadius: '50%', objectFit: 'cover'}}
                            onError={() => setAvatarError(true)}
                        />
                    )}
                </div>

                {/* Host name */}
                <div style={{fontSize: 18, fontWeight: 700, marginBottom: 4}}>
                    {`${call.hostName} ruft an`}
                </div>

                {/* Subtitle */}
                <div style={{fontSize: 13, opacity: 0.6, marginBottom: 20}}>
                    {'klingelt …'}
                </div>

                {/* Buttons */}
                <div
                    style={{
                        display: 'flex',
                        gap: 12,
                        marginTop: 20,
                    }}
                >
                    <button
                        type='button'
                        onClick={onAccept}
                        disabled={busy}
                        style={{
                            flex: 1,
                            padding: '12px 0',
                            background: '#1a8a40',
                            color: 'white',
                            border: 'none',
                            borderRadius: 10,
                            fontSize: 15,
                            fontWeight: 600,
                            cursor: busy ? 'not-allowed' : 'pointer',
                            opacity: busy ? 0.6 : 1,
                        }}
                    >
                        {'Annehmen'}
                    </button>
                    <button
                        type='button'
                        onClick={onDecline}
                        disabled={busy}
                        style={{
                            flex: 1,
                            padding: '12px 0',
                            background: 'rgba(255,255,255,0.1)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 10,
                            fontSize: 15,
                            fontWeight: 600,
                            cursor: busy ? 'not-allowed' : 'pointer',
                            opacity: busy ? 0.6 : 1,
                        }}
                    >
                        {'Ablehnen'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IncomingCallModal;
