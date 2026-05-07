import React from 'react';
import {useDispatch, useSelector, useStore} from 'react-redux';

import {startConferenceConnection} from '../../conference/controller';
import {activeMeetingDismissed, type ActiveMeeting} from '../../store/slice_active_meetings';
import {useT} from '../../util/i18n';
import {selectCurrentDisplayName, selectSessionStatus} from '../../util/selectors';

const stateKey = 'plugins-com.github.morzan1001.mattermost-plugin-opentalk';

const toastStyle: React.CSSProperties = {
    position: 'fixed',
    top: 60,
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#1c2230',
    color: 'white',
    padding: '8px 14px',
    borderRadius: 999,
    boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    zIndex: 9997,
    maxWidth: '90vw',
};

const joinButtonStyle: React.CSSProperties = {
    background: '#00B59C',
    color: 'white',
    border: 'none',
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};

const dismissButtonStyle: React.CSSProperties = {
    background: 'transparent',
    color: 'rgba(255,255,255,0.6)',
    border: 'none',
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    padding: 0,
    width: 22,
    height: 22,
};

const ChannelCallToast: React.FC = () => {
    const dispatch = useDispatch();
    const store = useStore();
    const t = useT();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentChannelID = useSelector((s: any) => s?.entities?.channels?.currentChannelId as string | undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelType = useSelector((s: any) => s?.entities?.channels?.channels?.[currentChannelID ?? '']?.type as string | undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meeting = useSelector((s: any): ActiveMeeting | null => {
        if (!currentChannelID) {
            return null;
        }
        return s?.[stateKey]?.activeMeetings?.byChannelID?.[currentChannelID] ?? null;
    });

    const sessionStatus = useSelector(selectSessionStatus);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionChannelID = useSelector((s: any) => s?.[stateKey]?.session?.channelID as string | undefined);

    if (!meeting || meeting.dismissed) {
        return null;
    }

    // Don't show the toast for DMs/GMs — incoming_call modal handles those.
    if (channelType === 'D' || channelType === 'G') {
        return null;
    }

    const userIsInMeeting = sessionStatus !== 'idle' && sessionChannelID === currentChannelID;
    if (userIsInMeeting) {
        return null;
    }

    const onJoin = async () => {
        const displayName = selectCurrentDisplayName(store.getState());
        try {
            await startConferenceConnection(meeting.roomID, meeting.channelID, displayName, store);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[opentalk] toast-join failed:', (e as Error).message);
        }
    };

    const onDismiss = () => {
        dispatch(activeMeetingDismissed({channelID: meeting.channelID}));
    };

    return (
        <div
            data-testid='channel-call-toast'
            style={toastStyle}
        >
            <span>{`📞 ${t({de: 'Meeting läuft · gestartet von', en: 'Meeting running · started by'})} ${meeting.hostName}`}</span>
            <button
                type='button'
                onClick={onJoin}
                style={joinButtonStyle}
            >
                {t({de: 'Beitreten', en: 'Join'})}
            </button>
            <button
                type='button'
                onClick={onDismiss}
                style={dismissButtonStyle}
                aria-label={t({de: 'Hinweis ausblenden', en: 'Dismiss notification'})}
            >
                {'×'}
            </button>
        </div>
    );
};

export default ChannelCallToast;
