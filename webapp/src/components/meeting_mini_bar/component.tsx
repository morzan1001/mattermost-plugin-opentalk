import React, {useState} from 'react';
import {useSelector} from 'react-redux';

import {leaveActiveConference, toggleMic, toggleCam, toggleScreenShare, endActiveMeeting} from '../../conference/controller';
import {
    MicIcon,
    MicOffIcon,
    VideoIcon,
    CameraOffIcon,
    ScreenShareIcon,
    ScreenShareOffIcon,
    HangupIcon,
} from '../icons';

const stateKey = 'plugins-de.opentalk.mattermost-plugin';

const baseButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    padding: 0,
    borderRadius: 8,
    border: 'none',
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.92)',
    cursor: 'pointer',
    transition: 'background 120ms',
};

const activeButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    background: '#2d8cff',
    color: 'white',
};

const dangerButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    background: '#e3354c',
    color: 'white',
};

const mutedDangerButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    background: 'rgba(227, 53, 76, 0.18)',
    color: '#ff7a8a',
};

const mutedButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.55)',
};

const MeetingMiniBar: React.FC = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = useSelector((s: any) => s?.[stateKey]?.session ?? {status: 'idle', participantCount: 0});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isHost = useSelector((s: any) => s?.[stateKey]?.session?.isHost ?? false);
    const [showLeavePrompt, setShowLeavePrompt] = useState(false);

    if (session.status === 'idle') {
        return null;
    }

    const onLeaveClick = () => {
        if (isHost) {
            setShowLeavePrompt(true);
        } else {
            leaveActiveConference();
        }
    };

    return (
        <div
            className='opentalk-mini-bar'
            style={{
                position: 'fixed',
                bottom: 16,
                right: 16,
                background: '#1c2230',
                color: 'white',
                padding: 10,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                zIndex: 9999,
                boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
                fontFamily: 'Inter, system-ui, sans-serif',
            }}
        >
            {session.status === 'connecting' && (
                <span style={{padding: '0 12px', fontSize: 13}}>{'Verbinde mit OpenTalk-Meeting …'}</span>
            )}
            {session.status === 'leaving' && (
                <span style={{padding: '0 12px', fontSize: 13}}>{'Trenne …'}</span>
            )}
            {session.status === 'connected' && (
                <>
                    <span
                        style={{
                            padding: '0 8px 0 4px',
                            fontSize: 13,
                            fontWeight: 500,
                            color: 'rgba(255,255,255,0.8)',
                        }}
                    >
                        {session.participantCount}
                        {' Teilnehmer'}
                    </span>

                    <button
                        type='button'
                        style={session.micEnabled ? activeButtonStyle : mutedDangerButtonStyle}
                        onClick={() => {
                            // eslint-disable-next-line no-console
                            console.warn('[opentalk] mini-bar mic onClick');
                            toggleMic();
                        }}
                        title={session.micEnabled ? 'Mikrofon stummschalten' : 'Mikrofon einschalten'}
                        aria-label={session.micEnabled ? 'Mikrofon stummschalten' : 'Mikrofon einschalten'}
                    >
                        {session.micEnabled ? <MicIcon/> : <MicOffIcon/>}
                    </button>

                    <button
                        type='button'
                        style={session.camEnabled ? activeButtonStyle : mutedButtonStyle}
                        onClick={() => {
                            // eslint-disable-next-line no-console
                            console.warn('[opentalk] mini-bar cam onClick');
                            toggleCam();
                        }}
                        title={session.camEnabled ? 'Kamera ausschalten' : 'Kamera einschalten'}
                        aria-label={session.camEnabled ? 'Kamera ausschalten' : 'Kamera einschalten'}
                    >
                        {session.camEnabled ? <VideoIcon/> : <CameraOffIcon/>}
                    </button>

                    <button
                        type='button'
                        style={session.screenShareEnabled ? activeButtonStyle : mutedButtonStyle}
                        onClick={() => {
                            // eslint-disable-next-line no-console
                            console.warn('[opentalk] mini-bar screen onClick');
                            toggleScreenShare();
                        }}
                        title={session.screenShareEnabled ? 'Bildschirmfreigabe beenden' : 'Bildschirm teilen'}
                        aria-label={session.screenShareEnabled ? 'Bildschirmfreigabe beenden' : 'Bildschirm teilen'}
                    >
                        {session.screenShareEnabled ? <ScreenShareOffIcon/> : <ScreenShareIcon/>}
                    </button>

                    <div style={{width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px'}}/>

                    <button
                        type='button'
                        style={dangerButtonStyle}
                        onClick={onLeaveClick}
                        title={isHost ? 'Verlassen / Meeting beenden' : 'Meeting verlassen'}
                        aria-label={isHost ? 'Verlassen oder Meeting beenden' : 'Meeting verlassen'}
                    >
                        <HangupIcon/>
                    </button>
                </>
            )}

            {showLeavePrompt && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 8px)',
                        right: 0,
                        background: '#22293a',
                        color: 'white',
                        padding: 16,
                        borderRadius: 10,
                        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                        minWidth: 260,
                    }}
                    role='dialog'
                    aria-label='Meeting verlassen oder beenden?'
                >
                    <div style={{fontSize: 14, fontWeight: 600, marginBottom: 4}}>{'Meeting verlassen?'}</div>
                    <div style={{fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 14}}>
                        {'Du bist Host. Möchtest du nur dich selbst entfernen oder das Meeting für alle beenden?'}
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                        <button
                            type='button'
                            style={{
                                padding: '8px 12px',
                                borderRadius: 6,
                                border: '1px solid rgba(255,255,255,0.15)',
                                background: 'transparent',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: 13,
                            }}
                            onClick={() => {
                                setShowLeavePrompt(false);
                                leaveActiveConference();
                            }}
                        >
                            {'Nur mich verlassen'}
                        </button>
                        <button
                            type='button'
                            style={{
                                padding: '8px 12px',
                                borderRadius: 6,
                                border: 'none',
                                background: '#e3354c',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 600,
                            }}
                            onClick={() => {
                                setShowLeavePrompt(false);
                                endActiveMeeting();
                            }}
                        >
                            {'Meeting für alle beenden'}
                        </button>
                        <button
                            type='button'
                            style={{
                                padding: '6px 12px',
                                borderRadius: 6,
                                border: 'none',
                                background: 'transparent',
                                color: 'rgba(255,255,255,0.55)',
                                cursor: 'pointer',
                                fontSize: 12,
                            }}
                            onClick={() => setShowLeavePrompt(false)}
                        >
                            {'Abbrechen'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MeetingMiniBar;
