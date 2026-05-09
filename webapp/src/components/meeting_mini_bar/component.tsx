import React, {useState} from 'react';
import {useSelector, useDispatch} from 'react-redux';

import {SelfPreview} from './self_preview';
import {TileStrip} from './tile_strip';

import {leaveActiveConference, endActiveMeeting} from '../../conference/controller';
import {useDraggable} from '../../hooks/use_draggable';
import {useMeetingDuration} from '../../hooks/use_meeting_duration';
import {useResizable} from '../../hooks/use_resizable';
import {setMinimized} from '../../store/slice_session';
import {useT} from '../../util/i18n';
import {PLUGIN_STATE_KEY, selectIsHost, selectIsMinimized, selectLocalParticipantId} from '../../util/selectors';
import {ControlsBar} from '../controls_bar/component';
import {LeaveCallModal} from '../leave_call_modal';

const stateKey = PLUGIN_STATE_KEY;

const MeetingMiniBar: React.FC = () => {
    const dispatch = useDispatch();
    const t = useT();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = useSelector((s: any) => s?.[stateKey]?.session ?? {status: 'idle', participantCount: 0});
    const isHost = useSelector(selectIsHost);
    const isMinimized = useSelector(selectIsMinimized);
    const [showLeavePrompt, setShowLeavePrompt] = useState(false);

    const drag = useDraggable({
        storageKey: 'opentalk:widget-position:v2',
        defaultPosition: {
            x: typeof window === 'undefined' ? 16 : window.innerWidth - 620,
            y: typeof window === 'undefined' ? 16 : window.innerHeight - 100,
        },
    });

    const localId = useSelector(selectLocalParticipantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const remoteCount: number = useSelector((s: any) => {
        const order = s?.[stateKey]?.participants?.order ?? [];
        return localId ? order.filter((id: string) => id !== localId).length : order.length;
    });

    const baseMinWidth = 200;

    const resize = useResizable({
        storageKey: 'opentalk:widget-size:v7',
        defaultSize: {width: baseMinWidth, height: 0},
        minSize: {width: baseMinWidth, height: 0},
    });

    const widgetWidth = Math.max(typeof resize.style.width === 'number' ? resize.style.width : baseMinWidth, baseMinWidth);

    const duration = useMeetingDuration(session.joinedAt);

    if (session.status === 'idle') {
        return null;
    }

    if (session.expanded) {
        return null;
    }

    const onLeaveClick = () => {
        if (isHost) {
            setShowLeavePrompt(true);
        } else {
            leaveActiveConference();
        }
    };

    if (session.status === 'connected' && isMinimized) {
        return (
            <button
                type='button'
                onClick={() => dispatch(setMinimized(false))}
                title={t({de: 'Wiederherstellen', en: 'Restore'})}
                aria-label={t({de: 'Wiederherstellen', en: 'Restore'})}
                style={{
                    position: 'fixed',
                    bottom: 16,
                    right: 16,
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#1c2230',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                }}
            >
                {session.participantCount}
            </button>
        );
    }

    return (
        <>
            <div
                className='opentalk-mini-bar'
                style={{
                    background: '#1c2230',
                    color: 'white',
                    padding: 0,
                    borderRadius: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 9999,
                    boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    overflow: 'hidden',
                    ...drag.style,

                    width: widgetWidth,
                }}
            >
                {/* Drag handle — full-width grab strip at the top */}
                <div
                    {...drag.handleProps}
                    style={{
                        height: 16,
                        cursor: 'grab',
                        borderRadius: '8px 8px 0 0',
                        userSelect: 'none',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <div
                        style={{
                            width: 24,
                            height: 3,
                            borderRadius: 2,
                            background: 'rgba(255,255,255,0.2)',
                        }}
                    />
                </div>

                {/* Main content row */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '0 10px 8px 10px',
                        minWidth: 0,
                    }}
                >
                    {session.status === 'connecting' && (
                        <span style={{padding: '0 12px', fontSize: 13}}>{t({de: 'Verbinde mit OpenTalk-Meeting …', en: 'Connecting to OpenTalk meeting …'})}</span>
                    )}
                    {session.status === 'leaving' && (
                        <span style={{padding: '0 12px', fontSize: 13}}>{t({de: 'Trenne …', en: 'Disconnecting …'})}</span>
                    )}
                    {session.status === 'connected' && (
                        <>
                            <div
                                style={{
                                    padding: '0 8px 0 4px',
                                    color: 'rgba(255,255,255,0.85)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    lineHeight: 1.1,
                                    minWidth: 0,
                                }}
                            >
                                <span style={{fontSize: 13, fontWeight: 500}}>
                                    {`${session.participantCount} ${t({de: 'Teilnehmer', en: 'participants'})}`}
                                </span>
                                {duration && (
                                    <span style={{fontSize: 11, opacity: 0.65}}>{duration}</span>
                                )}
                            </div>

                            <SelfPreview/>

                            <ControlsBar
                                showExpand={true}
                                onLeave={onLeaveClick}
                                onMinimize={() => dispatch(setMinimized(true))}
                            />
                        </>
                    )}

                </div>

                {/* Tile-strip row — remote participants only; self is in SelfPreview above. */}
                {session.status === 'connected' && remoteCount > 0 && (
                    <div
                        style={{
                            padding: '0 10px 10px 10px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 6,
                            flexWrap: 'wrap',
                            alignContent: 'flex-start',
                        }}
                    >
                        <TileStrip/>
                    </div>
                )}

                {/* Resize handle — SE corner, only when not minimized */}
                {!isMinimized && (
                    <div
                        {...resize.handleProps}
                        title={t({de: 'Breite ziehen', en: 'Drag to resize'})}
                        style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: 6,
                            cursor: 'ew-resize',
                            background: 'transparent',
                        }}
                    />
                )}
            </div>

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
            />
        </>
    );
};

export default MeetingMiniBar;
