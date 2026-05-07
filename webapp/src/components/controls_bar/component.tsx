import React from 'react';
import {useSelector, useDispatch} from 'react-redux';

import {toggleMic, toggleCam, toggleScreenShare, raiseLocalHand, lowerLocalHand} from '../../conference/controller';
import {setExpanded} from '../../store/slice_session';
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

const stateKey = 'plugins-com.github.morzan1001.mattermost-plugin-opentalk';

export const baseButtonStyle: React.CSSProperties = {
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

export const activeButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    background: '#2d8cff',
    color: 'white',
};

export const dangerButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    background: '#e3354c',
    color: 'white',
};

export const mutedDangerButtonStyle: React.CSSProperties = {
    ...baseButtonStyle,
    background: 'rgba(227, 53, 76, 0.18)',
    color: '#ff7a8a',
};

export const mutedButtonStyle: React.CSSProperties = {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const micEnabled = useSelector((s: any) => s?.[stateKey]?.session?.micEnabled ?? false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const camEnabled = useSelector((s: any) => s?.[stateKey]?.session?.camEnabled ?? false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const screenShareEnabled = useSelector((s: any) => s?.[stateKey]?.session?.screenShareEnabled ?? false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isHost = useSelector((s: any) => s?.[stateKey]?.session?.isHost ?? false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isRaised = useSelector((s: any) => {
        const localId = s?.[stateKey]?.session?.localParticipantId;
        return localId ? Boolean(s?.[stateKey]?.participants?.byId?.[localId]?.handRaised) : false;
    });

    return (
        <>
            <button
                type='button'
                style={micEnabled ? activeButtonStyle : mutedDangerButtonStyle}
                onClick={() => toggleMic()}
                title={micEnabled ? 'Mikrofon stummschalten' : 'Mikrofon einschalten'}
                aria-label={micEnabled ? 'Mikrofon stummschalten' : 'Mikrofon einschalten'}
            >
                {micEnabled ? <MicIcon/> : <MicOffIcon/>}
            </button>

            <button
                type='button'
                style={camEnabled ? activeButtonStyle : mutedButtonStyle}
                onClick={() => toggleCam()}
                title={camEnabled ? 'Kamera ausschalten' : 'Kamera einschalten'}
                aria-label={camEnabled ? 'Kamera ausschalten' : 'Kamera einschalten'}
            >
                {camEnabled ? <VideoIcon/> : <CameraOffIcon/>}
            </button>

            <button
                type='button'
                style={screenShareEnabled ? activeButtonStyle : mutedButtonStyle}
                onClick={() => toggleScreenShare()}
                title={screenShareEnabled ? 'Bildschirmfreigabe beenden' : 'Bildschirm teilen'}
                aria-label={screenShareEnabled ? 'Bildschirmfreigabe beenden' : 'Bildschirm teilen'}
            >
                {screenShareEnabled ? <ScreenShareOffIcon/> : <ScreenShareIcon/>}
            </button>

            <button
                type='button'
                style={isRaised ? {...activeButtonStyle, background: '#00B59C'} : mutedButtonStyle}
                onClick={() => (isRaised ? lowerLocalHand() : raiseLocalHand())}
                title={isRaised ? 'Hand senken' : 'Hand heben'}
                aria-label={isRaised ? 'Hand senken' : 'Hand heben'}
            >
                <HandIcon/>
            </button>

            <div style={{width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px'}}/>

            <button
                type='button'
                style={mutedButtonStyle}
                onClick={onMinimize}
                title='Minimieren'
                aria-label='Minimieren'
            >
                <MinimizeIcon/>
            </button>

            {showExpand && (
                <button
                    type='button'
                    style={mutedButtonStyle}
                    onClick={() => dispatch(setExpanded(true))}
                    title='Vollbild'
                    aria-label='Vollbild'
                >
                    <ExpandIcon/>
                </button>
            )}

            <button
                type='button'
                style={dangerButtonStyle}
                onClick={onLeave}
                title={isHost ? 'Verlassen / Meeting beenden' : 'Meeting verlassen'}
                aria-label={isHost ? 'Verlassen oder Meeting beenden' : 'Meeting verlassen'}
            >
                <HangupIcon/>
            </button>
        </>
    );
};

export default ControlsBar;
