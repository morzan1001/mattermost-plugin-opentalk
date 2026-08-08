import React, {useMemo, useRef, useState} from 'react';
import ReactDOM from 'react-dom';
import {useDispatch, useSelector} from 'react-redux';

import {ExpandedHeader} from './expanded_header';
import {GridLayout} from './grid_layout';
import {ParticipantPanel} from './participant_panel';
import {ScreenFocusLayout} from './screen_focus_layout';
import {SpeakerLayout} from './speaker_layout';

import {leaveActiveConference, endActiveMeeting, resetHand, toggleMic, toggleCam, toggleScreenShare, raiseLocalHand, lowerLocalHand} from '../../conference/controller';
import {useAutoHide} from '../../hooks/use_auto_hide';
import {useCallShortcuts} from '../../hooks/use_call_shortcuts';
import {useFullscreen} from '../../hooks/use_fullscreen';
import {useLayoutMode} from '../../hooks/use_layout_mode';
import {usePanelOpen} from '../../hooks/use_panel_open';
import type {ParticipantInfo} from '../../store/slice_participants';
import type {SessionStatus} from '../../store/slice_session';
import {setExpanded} from '../../store/slice_session';
import {useT} from '../../util/i18n';
import {selectIsExpanded, selectIsHost, selectIsRoomOwner, selectLocalParticipantId, selectSessionStatus, selectParticipantOrder, selectParticipantsById, selectChannelID, selectChannelType} from '../../util/selectors';
import {ControlsBar} from '../controls_bar/component';
import {HandIcon} from '../icons';
import {LeaveCallModal} from '../leave_call_modal';

const ExpandedView: React.FC = () => {
    const t = useT();
    const expanded = useSelector(selectIsExpanded);
    const status = useSelector(selectSessionStatus) as SessionStatus;
    const isHost = useSelector(selectIsHost);
    const isRoomOwner = useSelector(selectIsRoomOwner);
    const channelID = useSelector(selectChannelID);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelType = useSelector((s: any) => selectChannelType(s, channelID));
    const isDM = channelType === 'D' || channelType === 'G';

    const order = useSelector(selectParticipantOrder);
    const byId = useSelector(selectParticipantsById);
    const localParticipantId = useSelector(selectLocalParticipantId);
    const isRaised = localParticipantId ? Boolean(byId[localParticipantId]?.handRaised) : false;
    const raisedParticipants = useMemo<ParticipantInfo[]>(
        () => order.map((id) => byId[id]).filter((p): p is ParticipantInfo => Boolean(p) && p.handRaised === true),
        [order, byId],
    );

    const [mode, setMode] = useLayoutMode();
    const dispatch = useDispatch();
    const [showLeavePrompt, setShowLeavePrompt] = useState(false);
    const collapse = () => {
        setShowLeavePrompt(false);
        dispatch(setExpanded(false));
    };

    const overlayRef = useRef<HTMLDivElement | null>(null);
    const [panelOpen, setPanelOpen] = usePanelOpen();
    const {isFullscreen, toggle: toggleFullscreen} = useFullscreen(overlayRef);
    const active = expanded && status === 'connected';
    const chrome = useAutoHide(active);

    useCallShortcuts(active, {
        onToggleMic: () => toggleMic(),
        onToggleCam: () => toggleCam(),
        onToggleScreen: () => toggleScreenShare(),
        onToggleHand: () => (isRaised ? lowerLocalHand() : raiseLocalHand()),
        onToggleFullscreen: toggleFullscreen,
        onCollapse: collapse,
        onSetLayout: setMode,
    });

    if (!active) {
        return null;
    }

    const chromeStyle: React.CSSProperties = {
        opacity: chrome.visible ? 1 : 0,
        pointerEvents: chrome.visible ? 'auto' : 'none',
        transition: 'opacity 200ms ease',
    };

    const onLeaveClick = () => {
        // Only the room owner can end for everyone; the server end-endpoint
        // authorizes the meeting creator, not mid-call moderators. DM owners end
        // outright -- "leave just for me" would strand an empty room in KV until
        // the reaper, blocking re-rings. Mirrors the mini-bar hangup.
        if (isRoomOwner && isDM) {
            endActiveMeeting();
        } else if (isRoomOwner) {
            setShowLeavePrompt(true);
        } else {
            leaveActiveConference();
        }
    };

    return (
        <>
            <div
                ref={overlayRef}
                data-testid='expanded-view'
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: '#0c1018',
                    zIndex: 9998,
                    display: 'flex',
                    flexDirection: 'column',
                    color: 'white',
                    fontFamily: 'Inter, system-ui, sans-serif',
                }}
            >
                <div
                    style={{flexShrink: 0, ...chromeStyle}}
                    {...chrome.holdProps}
                >
                    <ExpandedHeader
                        mode={mode}
                        onModeChange={setMode}
                        panelOpen={panelOpen}
                        onTogglePanel={() => setPanelOpen(!panelOpen)}
                        isFullscreen={isFullscreen}
                        onToggleFullscreen={toggleFullscreen}
                    />
                </div>

                {/* raised-hand queue strip */}
                {raisedParticipants.length > 0 && (
                    <div
                        style={{
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 16px',
                            background: 'rgba(0, 181, 156, 0.12)',
                            borderBottom: '1px solid rgba(0, 181, 156, 0.3)',
                            fontSize: 13,
                        }}
                    >
                        <HandIcon/>
                        <span style={{color: '#00B59C', fontWeight: 600, marginRight: 6}}>{t({de: 'Wartereihe:', en: 'Queue:'})}</span>
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                            {raisedParticipants.map((p) => {
                                const name = p.displayName || p.id.slice(0, 8);
                                const chipStyle: React.CSSProperties = {
                                    padding: '2px 8px',
                                    borderRadius: 12,
                                    border: 'none',
                                    background: 'rgba(0, 181, 156, 0.2)',
                                    color: 'white',
                                    fontSize: 13,
                                };
                                if (!isHost) {
                                    return (
                                        <span
                                            key={p.id}
                                            data-testid={`raised-hand-chip-${p.id}`}
                                            style={chipStyle}
                                        >
                                            {name}
                                        </span>
                                    );
                                }
                                return (
                                    <button
                                        key={p.id}
                                        type='button'
                                        data-testid={`raised-hand-chip-${p.id}`}
                                        style={{...chipStyle, cursor: 'pointer'}}
                                        onClick={() => resetHand(p.id)}
                                        title={t({de: 'Hand senken', en: 'Lower hand'})}
                                    >
                                        {name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div style={{flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden'}}>
                    <div style={{flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden'}}>
                        {mode === 'speaker' && <SpeakerLayout/>}
                        {mode === 'grid' && <GridLayout/>}
                        {mode === 'screen-focus' && <ScreenFocusLayout/>}
                    </div>
                    {panelOpen && <ParticipantPanel/>}
                </div>

                <div
                    style={{
                        flexShrink: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 8,
                        padding: 16,
                        background: 'rgba(255,255,255,0.04)',
                        borderTop: '1px solid rgba(255,255,255,0.08)',
                        ...chromeStyle,
                    }}
                    {...chrome.holdProps}
                >
                    <ControlsBar
                        showExpand={false}
                        onLeave={onLeaveClick}
                        onMinimize={collapse}
                    />
                </div>
            </div>

            {ReactDOM.createPortal(
                <LeaveCallModal
                    open={showLeavePrompt}
                    onClose={() => setShowLeavePrompt(false)}
                    onLeaveOnly={() => {
                        setShowLeavePrompt(false);
                        leaveActiveConference();
                    }}
                    onEndForAll={() => {
                        setShowLeavePrompt(false);
                        endActiveMeeting();
                    }}
                />,

                // Same target as the moderation menu, so their z-order survives the
                // top layer: the fullscreen element hides anything left on the body.
                document.fullscreenElement ?? document.body,
            )}
        </>
    );
};

export default ExpandedView;
