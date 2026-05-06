import React, {useState} from 'react';
import {useSelector, useDispatch} from 'react-redux';

import {TileStrip} from './tile_strip';

import {leaveActiveConference, endActiveMeeting} from '../../conference/controller';
import {useDraggable} from '../../hooks/use_draggable';
import {useMeetingDuration} from '../../hooks/use_meeting_duration';
import {useResizable} from '../../hooks/use_resizable';
import {setMinimized} from '../../store/slice_session';
import {ControlsBar} from '../controls_bar/component';

const stateKey = 'plugins-de.opentalk.mattermost-plugin';

const MeetingMiniBar: React.FC = () => {
    const dispatch = useDispatch();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = useSelector((s: any) => s?.[stateKey]?.session ?? {status: 'idle', participantCount: 0});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isHost = useSelector((s: any) => s?.[stateKey]?.session?.isHost ?? false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isMinimized = useSelector((s: any) => s?.[stateKey]?.session?.minimized === true);
    const [showLeavePrompt, setShowLeavePrompt] = useState(false);

    // Storage-key suffix bumped to v2 because the layout changed
    // significantly (added drag-handle, tile-strip, mini/expand, resize),
    // making any size persisted from earlier builds undersized — content
    // would overflow and the rightmost buttons (hangup, expand) would get
    // clipped under overflow:hidden.
    const drag = useDraggable({
        storageKey: 'opentalk:widget-position:v2',
        defaultPosition: {
            x: typeof window === 'undefined' ? 16 : window.innerWidth - 620,
            y: typeof window === 'undefined' ? 16 : window.innerHeight - 100,
        },
    });

    const resize = useResizable({
        storageKey: 'opentalk:widget-size:v2',
        defaultSize: {width: 600, height: 88},
        minSize: {width: 540, height: 80},
    });

    // Only constrain widget WIDTH from the resize hook. Height is content-
    // driven so the tile-strip row below the controls can grow with the
    // number of participants without the user having to drag the SE handle.
    const widgetWidthStyle: React.CSSProperties = {width: resize.style.width};

    const duration = useMeetingDuration(session.joinedAt);

    if (session.status === 'idle') {
        return null;
    }

    // NOTE: Phase 7b will add the Expanded-View component which then takes over
    // the screen. Until that ships, the widget stays visible regardless of the
    // expanded flag — otherwise clicking the expand-button would hide the widget
    // with nothing to replace it.

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
                title='Wiederherstellen'
                aria-label='Wiederherstellen'
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
                    ...widgetWidthStyle,
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
                                {duration && (
                                    <span style={{opacity: 0.7, marginLeft: 6}}>{`· ${duration}`}</span>
                                )}
                            </span>

                            <div style={{flex: 1}}/>

                            <ControlsBar
                                showExpand={true}
                                onLeave={onLeaveClick}
                                onMinimize={() => dispatch(setMinimized(true))}
                            />
                        </>
                    )}

                </div>

                {/* Tile-strip row — participant videos / initials, dragged with widget */}
                {session.status === 'connected' && (
                    <div
                        style={{
                            padding: '0 10px 10px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexWrap: 'wrap',
                        }}
                    >
                        <TileStrip/>
                    </div>
                )}

                {/* Resize handle — SE corner, only when not minimized */}
                {!isMinimized && (
                    <div
                        {...resize.handleProps}
                        style={{
                            position: 'absolute',
                            right: 0,
                            bottom: 0,
                            width: 12,
                            height: 12,
                            cursor: 'nwse-resize',
                            background: 'transparent',
                        }}
                    />
                )}
            </div>

            {/* Leave-prompt popover — rendered outside the widget root so the
            widget's overflow:hidden doesn't clip it. Centered above the
            widget bottom-right corner. */}
            {showLeavePrompt && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: 120,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#22293a',
                        color: 'white',
                        padding: 16,
                        borderRadius: 10,
                        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                        minWidth: 260,
                        zIndex: 10000,
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
        </>
    );
};

export default MeetingMiniBar;
