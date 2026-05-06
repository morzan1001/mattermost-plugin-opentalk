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

// OpenTalk brand-accent: deep teal used as a single 4-px accent stripe down
// the card's left edge. The rest of the card stays neutral so it blends with
// both the light and dark Mattermost themes.
const opentalkTeal = '#00B59C';
const opentalkTealDark = '#008F7A';

const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    maxWidth: 480,
    border: '1px solid rgba(63, 67, 80, 0.12)',
    borderRadius: 10,
    background: 'var(--center-channel-bg, white)',
    overflow: 'hidden',
    fontFamily: 'inherit',
};

const accentStripeStyle: React.CSSProperties = {
    width: 4,
    background: opentalkTeal,
    flexShrink: 0,
};

const innerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px 8px',
    color: 'var(--center-channel-color, #3f4350)',
};

const logoBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'rgba(0, 181, 156, 0.12)',
    color: opentalkTealDark,
    flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
    padding: '0 16px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
};

const dialinStyle: React.CSSProperties = {
    fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    background: 'rgba(63, 67, 80, 0.05)',
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
    background: opentalkTeal,
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: 0.2,
    cursor: 'pointer',
    transition: 'background 120ms',
    marginTop: 2,
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
    background: opentalkTeal,
    boxShadow: '0 0 0 0 rgba(0, 181, 156, 0.7)',
};

const PostTypeMeeting: React.FC<Props> = ({post}) => {
    const store = useStore();

    // Display name with the same nickname > first+last > username priority
    // the server uses (see displayNameOf in server/plugin.go). This is what
    // OpenTalk shows on participant tiles, so keeping client and server
    // attribution in sync matters.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentDisplayName = useSelector((s: any) => {
        const id = s?.entities?.users?.currentUserId;
        if (!id) {
            return '';
        }
        const u = s?.entities?.users?.profiles?.[id];
        if (!u) {
            return '';
        }
        const nick = (u.nickname ?? '').trim();
        if (nick) {
            return nick;
        }
        const full = ((u.first_name ?? '') + ' ' + (u.last_name ?? '')).trim();
        if (full) {
            return full;
        }
        return u.username ?? '';
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
        startConferenceConnection(p.room_id, channelID, currentDisplayName, store);
    };

    let statusBadge: React.ReactNode = null;
    if (p.status === 'STARTED') {
        statusBadge = (
            <span style={{...statusBadgeBase, background: 'rgba(0, 181, 156, 0.14)', color: opentalkTealDark}}>
                <span style={livePulse}/>
                {'Live'}
            </span>
        );
    } else if (p.status === 'ENDED') {
        statusBadge = (
            <span style={{...statusBadgeBase, background: 'rgba(63, 67, 80, 0.08)', color: 'rgba(63, 67, 80, 0.7)'}}>
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
            <div style={accentStripeStyle}/>
            <div style={innerStyle}>
                <div style={headerStyle}>
                    <span style={logoBadgeStyle}>
                        <OpenTalkLogoIcon size={20}/>
                    </span>
                    <div style={{display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0}}>
                        <span style={{fontSize: 14, fontWeight: 600}}>{'OpenTalk-Meeting'}</span>
                        <span style={{fontSize: 12, opacity: 0.6}}>
                            <strong style={{fontWeight: 600}}>{`@${p.host_username}`}</strong>
                            {' lädt ein'}
                        </span>
                    </div>
                    {statusBadge && <div style={{marginLeft: 'auto'}}>{statusBadge}</div>}
                </div>
                <div style={bodyStyle}>
                    {p.dial_in_number && p.dial_in_pin && (
                        <div style={dialinStyle}>
                            {`Telefon ${p.dial_in_number} · PIN ${p.dial_in_pin}`}
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
        </div>
    );
};

export default PostTypeMeeting;
