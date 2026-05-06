import React from 'react';
import {useSelector, useStore} from 'react-redux';

import {leaveActiveConference, toggleMic, toggleCam, toggleScreenShare} from '../../conference/controller';

const stateKey = 'plugins-de.opentalk.mattermost-plugin';

const buttonStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 4,
    border: 'none',
    background: 'rgba(255,255,255,0.1)',
    color: 'white',
    cursor: 'pointer',
    fontSize: 12,
    minWidth: 60,
};

const activeButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: '#28a745',
};

const dangerButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: '#e3354c',
    minWidth: 0,
};

const MeetingMiniBar: React.FC = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = useSelector((s: any) => s?.[stateKey]?.session ?? {status: 'idle', participantCount: 0});
    const store = useStore();

    if (session.status === 'idle') {
        return null;
    }

    return (
        <div
            className='opentalk-mini-bar'
            style={{
                position: 'fixed',
                bottom: 12,
                right: 12,
                background: '#1c2230',
                color: 'white',
                padding: '10px 16px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                zIndex: 9999,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
        >
            {session.status === 'connecting' && <span>{'Verbinde mit OpenTalk-Meeting …'}</span>}
            {session.status === 'leaving' && <span>{'Trenne …'}</span>}
            {session.status === 'connected' && (
                <>
                    <span style={{marginRight: 8}}>{`\u{1F4DE} ${session.participantCount}`}</span>
                    <button
                        type='button'
                        style={session.micEnabled ? activeButtonStyle : buttonStyle}
                        onClick={() => toggleMic(store)}
                        title={session.micEnabled ? 'Mikrofon stummschalten' : 'Mikrofon einschalten'}
                    >
                        {session.micEnabled ? '\u{1F3A4} An' : '\u{1F3A4} Aus'}
                    </button>
                    <button
                        type='button'
                        style={session.camEnabled ? activeButtonStyle : buttonStyle}
                        onClick={() => toggleCam(store)}
                        title={session.camEnabled ? 'Kamera ausschalten' : 'Kamera einschalten'}
                    >
                        {session.camEnabled ? '\u{1F4F9} An' : '\u{1F4F9} Aus'}
                    </button>
                    <button
                        type='button'
                        style={session.screenShareEnabled ? activeButtonStyle : buttonStyle}
                        onClick={() => toggleScreenShare(store)}
                        title={session.screenShareEnabled ? 'Bildschirmfreigabe beenden' : 'Bildschirm teilen'}
                    >
                        {session.screenShareEnabled ? '\u{1F5A5}\u{FE0F} An' : '\u{1F5A5}\u{FE0F} Teilen'}
                    </button>
                    <button
                        type='button'
                        style={dangerButtonStyle}
                        onClick={() => leaveActiveConference()}
                    >
                        {'Verlassen'}
                    </button>
                </>
            )}
        </div>
    );
};

export default MeetingMiniBar;
