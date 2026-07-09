import React from 'react';
import {useSelector, useDispatch} from 'react-redux';

import {toggleMic, toggleCam, toggleScreenShare, raiseLocalHand, lowerLocalHand, muteAll} from '../../conference/controller';
import {setExpanded} from '../../store/slice_session';
import {useT} from '../../util/i18n';
import {selectIsHost, selectIsRoomOwner, selectLocalParticipantId, selectMicEnabled, selectCamEnabled, selectScreenShareEnabled, selectParticipantsById} from '../../util/selectors';
import {
    MicIcon,
    MicOffIcon,
    VideoIcon,
    CameraOffIcon,
    ScreenShareIcon,
    ScreenShareOffIcon,
    HandIcon,
    HangupIcon,
    MinimizeIcon,
    ExpandIcon,
} from '../icons';

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

export interface ControlsBarProps {

    /** When true (mini-bar), include the Expand button. When false (expanded-view), hide it. */
    showExpand: boolean;

    /** What the hangup button does. Mini-bar: triggers host-popover or direct-leave. Expanded-view: directly calls leaveActiveConference. */
    onLeave: () => void;

    /** What the Minimize button does. Mini-bar: dispatch(setMinimized(true)). Expanded-view: dispatch(setExpanded(false)). */
    onMinimize: () => void;
}

export const ControlsBar: React.FC<ControlsBarProps> = ({showExpand, onLeave, onMinimize}) => {
    const dispatch = useDispatch();
    const t = useT();

    const micEnabled = useSelector(selectMicEnabled);
    const camEnabled = useSelector(selectCamEnabled);
    const screenShareEnabled = useSelector(selectScreenShareEnabled);
    const isHost = useSelector(selectIsHost);
    const isRoomOwner = useSelector(selectIsRoomOwner);
    const localId = useSelector(selectLocalParticipantId);
    const byId = useSelector(selectParticipantsById);
    const isRaised = localId ? Boolean(byId[localId]?.handRaised) : false;

    return (
        <>
            <button
                type='button'
                style={micEnabled ? activeButtonStyle : mutedDangerButtonStyle}
                onClick={() => toggleMic()}
                title={micEnabled ? t({de: 'Mikrofon stummschalten', en: 'Mute microphone'}) : t({de: 'Mikrofon einschalten', en: 'Unmute microphone'})}
                aria-label={micEnabled ? t({de: 'Mikrofon stummschalten', en: 'Mute microphone'}) : t({de: 'Mikrofon einschalten', en: 'Unmute microphone'})}
            >
                {micEnabled ? <MicIcon/> : <MicOffIcon/>}
            </button>

            <button
                type='button'
                style={camEnabled ? activeButtonStyle : mutedButtonStyle}
                onClick={() => toggleCam()}
                title={camEnabled ? t({de: 'Kamera ausschalten', en: 'Turn off camera'}) : t({de: 'Kamera einschalten', en: 'Turn on camera'})}
                aria-label={camEnabled ? t({de: 'Kamera ausschalten', en: 'Turn off camera'}) : t({de: 'Kamera einschalten', en: 'Turn on camera'})}
            >
                {camEnabled ? <VideoIcon/> : <CameraOffIcon/>}
            </button>

            <button
                type='button'
                style={screenShareEnabled ? activeButtonStyle : mutedButtonStyle}
                onClick={() => toggleScreenShare()}
                title={screenShareEnabled ? t({de: 'Bildschirmfreigabe beenden', en: 'Stop screen share'}) : t({de: 'Bildschirm teilen', en: 'Share screen'})}
                aria-label={screenShareEnabled ? t({de: 'Bildschirmfreigabe beenden', en: 'Stop screen share'}) : t({de: 'Bildschirm teilen', en: 'Share screen'})}
            >
                {screenShareEnabled ? <ScreenShareOffIcon/> : <ScreenShareIcon/>}
            </button>

            <button
                type='button'
                style={isRaised ? {...activeButtonStyle, background: '#00B59C'} : mutedButtonStyle}
                onClick={() => (isRaised ? lowerLocalHand() : raiseLocalHand())}
                title={isRaised ? t({de: 'Hand senken', en: 'Lower hand'}) : t({de: 'Hand heben', en: 'Raise hand'})}
                aria-label={isRaised ? t({de: 'Hand senken', en: 'Lower hand'}) : t({de: 'Hand heben', en: 'Raise hand'})}
            >
                <HandIcon/>
            </button>

            {isHost && (
                <button
                    type='button'
                    data-testid='controls-mute-all'
                    style={mutedButtonStyle}
                    onClick={() => muteAll()}
                    title={t({de: 'Alle stummschalten', en: 'Mute all'})}
                    aria-label={t({de: 'Alle stummschalten', en: 'Mute all'})}
                >
                    <MicOffIcon/>
                </button>
            )}

            <div style={{width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px'}}/>

            <button
                type='button'
                style={mutedButtonStyle}
                onClick={onMinimize}
                title={t({de: 'Minimieren', en: 'Minimize'})}
                aria-label={t({de: 'Minimieren', en: 'Minimize'})}
            >
                <MinimizeIcon/>
            </button>

            {showExpand && (
                <button
                    type='button'
                    style={mutedButtonStyle}
                    onClick={() => dispatch(setExpanded(true))}
                    title={t({de: 'Vollbild', en: 'Full screen'})}
                    aria-label={t({de: 'Vollbild', en: 'Full screen'})}
                >
                    <ExpandIcon/>
                </button>
            )}

            <button
                type='button'
                style={dangerButtonStyle}
                onClick={onLeave}
                title={isRoomOwner ? t({de: 'Verlassen / Meeting beenden', en: 'Leave / End meeting'}) : t({de: 'Meeting verlassen', en: 'Leave meeting'})}
                aria-label={isRoomOwner ? t({de: 'Verlassen oder Meeting beenden', en: 'Leave or end meeting'}) : t({de: 'Meeting verlassen', en: 'Leave meeting'})}
            >
                <HangupIcon/>
            </button>
        </>
    );
};

export default ControlsBar;
