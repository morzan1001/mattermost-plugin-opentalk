import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useDispatch, useSelector, useStore} from 'react-redux';

import {dismissIncomingCall} from '../../client/rest';
import {startConferenceConnection} from '../../conference/controller';
import {useRingtone} from '../../hooks/use_ringtone';
import {
    incomingCallDismissed,
    incomingCallCleared,
    type IncomingCall,
} from '../../store/slice_incoming_calls';
import {ringtoneSettingKey} from '../../user_settings';
import {useT} from '../../util/i18n';
import {selectCurrentDisplayName, selectSessionStatus, selectIncomingCallsByChannelID} from '../../util/selectors';

function isRingtoneEnabled(): boolean {
    try {
        return window.localStorage.getItem(ringtoneSettingKey) !== 'false';
    } catch {
        return true;
    }
}

const IncomingCallModal: React.FC = () => {
    const dispatch = useDispatch();
    const store = useStore();
    const ringtone = useRingtone();
    const t = useT();

    const sessionStatus = useSelector(selectSessionStatus);
    const currentDisplayName = useSelector(selectCurrentDisplayName);

    const byChannelID = useSelector(selectIncomingCallsByChannelID);
    const call = useMemo<IncomingCall | null>(() => {
        const nonDismissed = Object.values(byChannelID).filter((c) => !c.dismissed);
        if (nonDismissed.length === 0) {
            return null;
        }
        return nonDismissed.reduce((latest, c) => (c.receivedAt > latest.receivedAt ? c : latest));
    }, [byChannelID]);

    const [busy, setBusy] = useState(false);
    const [avatarError, setAvatarError] = useState(false);
    const [barWidth, setBarWidth] = useState(100);
    const [barTransition, setBarTransition] = useState('none');

    // CRITICAL: always mounted as RootComponent — gate effects on isShowingCall
    // so the ringtone doesn't start at app-init when there's no incoming call.
    // Hand off to SwitchCallModal for every non-idle state ('connecting',
    // 'connected', 'leaving') so the two modals never overlap.
    const isShowingCall = call !== null && sessionStatus === 'idle';

    useEffect(() => {
        if (!isShowingCall) {
            return undefined;
        }
        if (!isRingtoneEnabled()) {
            return undefined;
        }
        ringtone.start();
        return () => {
            ringtone.stop();
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isShowingCall]);

    // Countdown bar: reset to full with no animation, then animate down to 0%
    // over 30s. The reset is essential -- this is a persistent root component,
    // so without it barWidth stays at 0 from the previous ring and every ring
    // after the first shows an empty bar.
    useEffect(() => {
        if (call === null) {
            return undefined;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBarTransition('none');
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBarWidth(100);
        const rafId = requestAnimationFrame(() => {
            setBarTransition('width 30s linear');
            setBarWidth(0);
        });
        return () => {
            cancelAnimationFrame(rafId);
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [call?.channelID, call?.receivedAt]);

    useEffect(() => {
        setAvatarError(false);
    }, [call?.hostUserID]);

    // Persistent root component: busy/avatarError carry over between mounts
    // of the same component instance. Reset them whenever a fresh call lands
    // or the modal hides, otherwise the Accept/Decline buttons stay disabled
    // for the next ring after the user accepted an earlier one.
    useEffect(() => {
        setBusy(false);
        setAvatarError(false);
    }, [isShowingCall, call?.channelID, call?.roomID]);

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
            setBusy(false);
            return;
        }

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
        await startConferenceConnection(call.roomID, call.channelID, currentDisplayName, store);

        // startConferenceConnection swallows connect errors and tears itself
        // back down to 'idle'. Only clear the ringing call once we actually
        // reached a live session; on failure keep it so the user can retry.
        if (selectSessionStatus(store.getState()) === 'idle') {
            setBusy(false);
            return;
        }
        dispatch(incomingCallCleared({channelID: call.channelID}));
    };

    // Keep the auto-decline pointed at the *current* onDecline closure even
    // when the effect re-runs only on channelID change. Without this the
    // 30s timeout captures whichever `call` object was live at mount time.
    const onDeclineRef = useRef(onDecline);
    const onAcceptRef = useRef(onAccept);
    useEffect(() => {
        onDeclineRef.current = onDecline;
        onAcceptRef.current = onAccept;
    });

    useEffect(() => {
        if (!isShowingCall) {
            return undefined;
        }
        const id = window.setTimeout(() => onDeclineRef.current(), 30000);
        return () => window.clearTimeout(id);
    }, [isShowingCall, call?.channelID]);

    // Keyboard access to a ringing call: focus Accept, answer with Enter,
    // decline with Escape.
    const acceptBtnRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!isShowingCall) {
            return undefined;
        }
        acceptBtnRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onAcceptRef.current();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onDeclineRef.current();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isShowingCall, call?.channelID]);

    if (!isShowingCall || call === null) {
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
            role='dialog'
            aria-modal={true}
            aria-label={`${call.hostName} ${t({de: 'ruft an', en: 'is calling'})}`}
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
                        transition: barTransition,
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
                    {`${call.hostName} ${t({de: 'ruft an', en: 'is calling'})}`}
                </div>

                {/* Subtitle */}
                <div style={{fontSize: 13, opacity: 0.6, marginBottom: 20}}>
                    {t({de: 'klingelt …', en: 'ringing …'})}
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
                        ref={acceptBtnRef}
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
                        {t({de: 'Annehmen', en: 'Accept'})}
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
                        {t({de: 'Ablehnen', en: 'Decline'})}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IncomingCallModal;
