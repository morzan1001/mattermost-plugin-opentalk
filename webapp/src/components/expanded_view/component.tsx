import React, {useState} from 'react';
import {useDispatch, useSelector} from 'react-redux';

import {GridLayout} from './grid_layout';
import {LayoutSwitcher} from './layout_switcher';
import {ScreenFocusLayout} from './screen_focus_layout';
import {SpeakerLayout} from './speaker_layout';

import {leaveActiveConference, endActiveMeeting} from '../../conference/controller';
import {useLayoutMode} from '../../hooks/use_layout_mode';
import {useMeetingDuration} from '../../hooks/use_meeting_duration';
import type {ParticipantInfo} from '../../store/slice_participants';
import type {SessionStatus} from '../../store/slice_session';
import {setExpanded} from '../../store/slice_session';
import {useT} from '../../util/i18n';
import {PLUGIN_STATE_KEY, selectIsExpanded, selectIsHost, selectJoinedAt, selectSessionStatus} from '../../util/selectors';
import {ControlsBar} from '../controls_bar/component';
import {HandIcon} from '../icons';
import {LeaveCallModal} from '../leave_call_modal';

const stateKey = PLUGIN_STATE_KEY;

const ExpandedView: React.FC = () => {
    const t = useT();
    const expanded = useSelector(selectIsExpanded);
    const status = useSelector(selectSessionStatus) as SessionStatus;
    const isHost = useSelector(selectIsHost);
    const joinedAt = useSelector(selectJoinedAt);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raisedParticipants = useSelector((s: any): ParticipantInfo[] => {
        const order = s?.[stateKey]?.participants?.order ?? [];
        const byId = s?.[stateKey]?.participants?.byId ?? {};
        return order.map((id: string) => byId[id]).filter((p: ParticipantInfo) => p && p.handRaised);
    });

    const [mode, setMode] = useLayoutMode();
    const duration = useMeetingDuration(joinedAt);
    const dispatch = useDispatch();
    const [showLeavePrompt, setShowLeavePrompt] = useState(false);

    if (!expanded || status !== 'connected') {
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
        <>
            <div
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
                {/* header */}
                <div
                    style={{
                        height: 56,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '0 16px',
                        background: 'rgba(255,255,255,0.04)',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    <span style={{fontSize: 14, fontWeight: 600}}>{t({de: 'OpenTalk-Meeting', en: 'OpenTalk meeting'})}</span>
                    {duration && <span style={{fontSize: 13, opacity: 0.7}}>{duration}</span>}
                    <div style={{flex: 1}}/>
                    <LayoutSwitcher
                        mode={mode}
                        onChange={setMode}
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
                        <span>{raisedParticipants.map((p) => p.displayName || p.id.slice(0, 8)).join(' · ')}</span>
                    </div>
                )}

                {/* layout body */}
                <div style={{flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden'}}>
                    {mode === 'speaker' && <SpeakerLayout/>}
                    {mode === 'grid' && <GridLayout/>}
                    {mode === 'screen-focus' && <ScreenFocusLayout/>}
                </div>

                {/* controls-bar footer */}
                <div
                    style={{
                        flexShrink: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 8,
                        padding: 16,
                        background: 'rgba(255,255,255,0.04)',
                        borderTop: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    <ControlsBar
                        showExpand={false}
                        onLeave={onLeaveClick}
                        onMinimize={() => dispatch(setExpanded(false))}
                    />
                </div>
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

export default ExpandedView;
