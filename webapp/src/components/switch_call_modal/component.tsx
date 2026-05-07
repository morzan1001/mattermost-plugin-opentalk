import React, {useState} from 'react';
import {useDispatch, useSelector, useStore} from 'react-redux';

import {dismissIncomingCall} from '../../client/rest';
import {leaveActiveConference, startConferenceConnection} from '../../conference/controller';
import {
    incomingCallDismissed,
    incomingCallCleared,
    type IncomingCall,
} from '../../store/slice_incoming_calls';
import {selectCurrentDisplayName} from '../../util/display_name';

const stateKey = 'plugins-com.github.morzan1001.mattermost-plugin-opentalk';

const cancelStyle: React.CSSProperties = {
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    padding: '8px 14px',
    fontSize: 13,
    cursor: 'pointer',
};

const switchStyle: React.CSSProperties = {
    background: '#00B59C',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};

const SwitchCallModal: React.FC = () => {
    const dispatch = useDispatch();
    const store = useStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionStatus = useSelector((s: any) => s?.[stateKey]?.session?.status ?? 'idle') as string;

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

    // Only render when user is already in a meeting AND there is an incoming call
    if (sessionStatus === 'idle' || call === null) {
        return null;
    }

    const onCancel = async () => {
        setBusy(true);
        dispatch(incomingCallDismissed({channelID: call.channelID}));
        try {
            await dismissIncomingCall(call.channelID, call.roomID);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[opentalk] switch-cancel dismiss failed:', (e as Error).message);
        }
        setTimeout(() => {
            dispatch(incomingCallCleared({channelID: call.channelID}));
        }, 200);
    };

    const onSwitch = async () => {
        setBusy(true);
        try {
            await leaveActiveConference();

            // Brief settle so leave's redux dispatches land before connect.
            await new Promise((r) => setTimeout(r, 50));

            const displayName = selectCurrentDisplayName(store.getState());
            await startConferenceConnection(call.roomID, call.channelID, displayName, store);
            dispatch(incomingCallCleared({channelID: call.channelID}));
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[opentalk] switch-call failed:', (e as Error).message);
            setBusy(false);
        }
    };

    return (
        <div
            data-testid='switch-call-modal'
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
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
                    borderRadius: 12,
                    padding: '20px 24px',
                    minWidth: 320,
                    maxWidth: 420,
                    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                }}
            >
                <div style={{fontSize: 16, fontWeight: 600, marginBottom: 6}}>{'Du bist bereits in einem Meeting'}</div>
                <div style={{fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4, marginBottom: 16}}>
                    <strong style={{color: 'white'}}>{call.hostName}</strong>
                    {' ruft dich an. Möchtest du das aktuelle Meeting verlassen und wechseln?'}
                </div>
                <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
                    <button
                        type='button'
                        onClick={onCancel}
                        style={cancelStyle}
                        disabled={busy}
                    >{'Abbrechen'}</button>
                    <button
                        type='button'
                        onClick={onSwitch}
                        style={switchStyle}
                        disabled={busy}
                    >{busy ? '...' : 'Wechseln'}</button>
                </div>
            </div>
        </div>
    );
};

export default SwitchCallModal;
