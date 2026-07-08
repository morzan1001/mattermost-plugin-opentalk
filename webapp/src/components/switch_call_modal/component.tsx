import React, {useEffect, useMemo, useState} from 'react';
import {useDispatch, useSelector, useStore} from 'react-redux';

import {dismissIncomingCall} from '../../client/rest';
import {leaveActiveConference, startConferenceConnection} from '../../conference/controller';
import {
    incomingCallDismissed,
    incomingCallCleared,
    type IncomingCall,
} from '../../store/slice_incoming_calls';
import {useT} from '../../util/i18n';
import {selectCurrentDisplayName, selectSessionStatus, selectIncomingCallsByChannelID} from '../../util/selectors';

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
    const t = useT();

    const sessionStatus = useSelector(selectSessionStatus);

    const byChannelID = useSelector(selectIncomingCallsByChannelID);
    const call = useMemo<IncomingCall | null>(() => {
        const nonDismissed = Object.values(byChannelID).filter((c) => !c.dismissed);
        if (nonDismissed.length === 0) {
            return null;
        }
        return nonDismissed.reduce((latest, c) => (c.receivedAt > latest.receivedAt ? c : latest));
    }, [byChannelID]);

    const [busy, setBusy] = useState(false);

    // Persistent root component: busy survives between shows of this same
    // instance. Reset it whenever a fresh call lands or the modal hides,
    // otherwise both buttons stay disabled for the next ring after a switch.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBusy(false);
    }, [call?.channelID, call?.roomID]);

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

            // Brief settle so the leave-dispatches land before connect starts.
            await new Promise((r) => setTimeout(r, 50));

            const displayName = selectCurrentDisplayName(store.getState());
            await startConferenceConnection(call.roomID, call.channelID, displayName, store);
            if (selectSessionStatus(store.getState()) === 'idle') {
                // Connect failed and tore down; keep the ring for a retry.
                setBusy(false);
                return;
            }
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
                <div style={{fontSize: 16, fontWeight: 600, marginBottom: 6}}>{t({de: 'Du bist bereits in einem Meeting', en: 'You are already in a meeting'})}</div>
                <div style={{fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4, marginBottom: 16}}>
                    <strong style={{color: 'white'}}>{call.hostName}</strong>
                    {t({de: ' ruft dich an. Möchtest du das aktuelle Meeting verlassen und wechseln?', en: ' is calling you. Do you want to leave the current meeting and switch?'})}
                </div>
                <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
                    <button
                        type='button'
                        onClick={onCancel}
                        style={cancelStyle}
                        disabled={busy}
                    >{t({de: 'Abbrechen', en: 'Cancel'})}</button>
                    <button
                        type='button'
                        onClick={onSwitch}
                        style={switchStyle}
                        disabled={busy}
                    >{busy ? '...' : t({de: 'Wechseln', en: 'Switch'})}</button>
                </div>
            </div>
        </div>
    );
};

export default SwitchCallModal;
