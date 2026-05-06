import React from 'react';
import {useStore, useSelector} from 'react-redux';

import {startConferenceConnection} from '../../conference/controller';
import {OpenTalkLogoIcon, VideoIcon} from '../icons';

interface PostProps {
    room_id: string;
    invite_code: string;
    host_username: string;
    frontend_url: string;
    status: 'STARTED' | 'ENDED' | 'MISSED';
    started_at: number;
    ended_at?: number;
    duration_seconds?: number;
    dial_in_number?: string;
    dial_in_pin?: string;
}

interface Props {
    post: {
        id: string;
        channel_id?: string;
        props: PostProps;
    };
}

const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const stateKey = 'plugins-de.opentalk.mattermost-plugin';

const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 480,
    border: '1px solid var(--center-channel-color-rgb, rgba(63, 67, 80, 0.16))',
    borderColor: 'rgba(63, 67, 80, 0.16)',
    borderRadius: 12,
    background: 'var(--center-channel-bg, white)',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    fontFamily: 'inherit',
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    background: 'linear-gradient(135deg, #2d8cff 0%, #1768e0 100%)',
    color: 'white',
};

const bodyStyle: React.CSSProperties = {
    padding: '14px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
};

const metaRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: 'var(--center-channel-color, #3f4350)',
    opacity: 0.85,
};

const dialinStyle: React.CSSProperties = {
    fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    background: 'rgba(63, 67, 80, 0.06)',
    padding: '6px 10px',
    borderRadius: 6,
    color: 'var(--center-channel-color, #3f4350)',
};

const joinButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '10px 16px',
    background: '#2d8cff',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: 0.2,
    cursor: 'pointer',
    transition: 'background 120ms',
    marginTop: 4,
};

const joinButtonDisabledStyle: React.CSSProperties = {
    ...joinButtonStyle,
    background: 'rgba(63, 67, 80, 0.16)',
    color: 'rgba(63, 67, 80, 0.5)',
    cursor: 'not-allowed',
};

const statusBadgeBase: React.CSSProperties = {
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    padding: '3px 8px',
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
};

const livePulse: React.CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#3ad06a',
    boxShadow: '0 0 0 0 rgba(58, 208, 106, 0.7)',
};

const PostTypeMeeting: React.FC<Props> = ({post}) => {
    const store = useStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentUsername = useSelector((s: any) => {
        const id = s?.entities?.users?.currentUserId;
        if (!id) {
            return '';
        }
        return s?.entities?.users?.profiles?.[id]?.username ?? '';
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionStatus: string = useSelector((s: any) => s?.[stateKey]?.session?.status ?? 'idle');

    const p = post.props;
    const inMeetingAlready = sessionStatus !== 'idle';

    const onJoin = () => {
        if (inMeetingAlready) {
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channelID = (post as any).channel_id ?? '';
        startConferenceConnection(p.room_id, channelID, currentUsername, store);
    };

    let statusBadge: React.ReactNode = null;
    if (p.status === 'STARTED') {
        statusBadge = (
            <span style={{...statusBadgeBase, background: 'rgba(58, 208, 106, 0.16)', color: '#1a8a40'}}>
                <span style={livePulse}/>
                {'Live'}
            </span>
        );
    } else if (p.status === 'ENDED') {
        statusBadge = (
            <span style={{...statusBadgeBase, background: 'rgba(63, 67, 80, 0.1)', color: 'rgba(63, 67, 80, 0.7)'}}>
                {'Beendet'}
            </span>
        );
    } else if (p.status === 'MISSED') {
        statusBadge = (
            <span style={{...statusBadgeBase, background: 'rgba(227, 53, 76, 0.12)', color: '#b32a3e'}}>
                {'Verpasst'}
            </span>
        );
    }

    return (
        <div style={cardStyle}>
            <div style={headerStyle}>
                <OpenTalkLogoIcon size={22}/>
                <div style={{display: 'flex', flexDirection: 'column', lineHeight: 1.2}}>
                    <span style={{fontSize: 14, fontWeight: 600}}>{'OpenTalk-Meeting'}</span>
                    <span style={{fontSize: 11, opacity: 0.85}}>{'Audio · Video · Bildschirmfreigabe'}</span>
                </div>
                {statusBadge && <div style={{marginLeft: 'auto'}}>{statusBadge}</div>}
            </div>
            <div style={bodyStyle}>
                <div style={metaRowStyle}>
                    <strong style={{color: 'var(--center-channel-color, #3f4350)'}}>{`@${p.host_username}`}</strong>
                    <span style={{opacity: 0.6}}>{'lädt zum Meeting ein'}</span>
                </div>

                {p.dial_in_number && p.dial_in_pin && (
                    <div style={dialinStyle}>
                        {`📞  ${p.dial_in_number}    · PIN ${p.dial_in_pin}`}
                    </div>
                )}

                {p.status === 'STARTED' && (
                    <button
                        type='button'
                        onClick={onJoin}
                        style={inMeetingAlready ? joinButtonDisabledStyle : joinButtonStyle}
                        disabled={inMeetingAlready}
                        title={inMeetingAlready ? 'Du bist bereits in einem Meeting' : 'Meeting beitreten'}
                    >
                        <VideoIcon/>
                        <span>{inMeetingAlready ? 'Bereits im Meeting' : 'Meeting beitreten'}</span>
                    </button>
                )}

                {p.status === 'ENDED' && p.duration_seconds && (
                    <div style={{fontSize: 13, color: 'rgba(63, 67, 80, 0.7)'}}>
                        {`Meeting beendet · Dauer ${formatDuration(p.duration_seconds)}`}
                    </div>
                )}

                {p.status === 'MISSED' && (
                    <div style={{fontSize: 13, color: 'rgba(63, 67, 80, 0.7)'}}>
                        {'Meeting verpasst · niemand ist beigetreten'}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PostTypeMeeting;
