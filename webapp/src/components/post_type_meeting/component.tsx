import React from 'react';
import {useStore, useSelector} from 'react-redux';

import {startConferenceConnection} from '../../conference/controller';

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

    const p = post.props;

    const onJoin = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channelID = (post as any).channel_id ?? '';
        startConferenceConnection(p.room_id, channelID, currentUsername, store);
    };

    let statusBadge: React.ReactNode = null;
    if (p.status === 'STARTED') {
        statusBadge = <span className='opentalk-meeting-post__status opentalk-meeting-post__status--started'>{'\u{1F7E2} Live'}</span>;
    } else if (p.status === 'ENDED') {
        statusBadge = <span className='opentalk-meeting-post__status opentalk-meeting-post__status--ended'>{'\u{1F534} Ended'}</span>;
    } else if (p.status === 'MISSED') {
        statusBadge = <span className='opentalk-meeting-post__status opentalk-meeting-post__status--missed'>{'⚫ Missed'}</span>;
    }

    return (
        <div className='opentalk-meeting-post'>
            <div className='opentalk-meeting-post__header'>
                <span>{'\u{1F3A5} OpenTalk Meeting'}</span>
                {statusBadge}
            </div>
            <div className='opentalk-meeting-post__body'>
                <div>{'Hosted by '}<strong>{`@${p.host_username}`}</strong></div>
                {p.dial_in_number && p.dial_in_pin && (
                    <div className='opentalk-meeting-post__dialin'>
                        {`\u{1F4DE} Dial-in: ${p.dial_in_number} · PIN ${p.dial_in_pin}`}
                    </div>
                )}
                {p.status === 'STARTED' && (
                    <button
                        className='opentalk-meeting-post__join'
                        type='button'
                        onClick={onJoin}
                    >
                        {'JOIN MEETING'}
                    </button>
                )}
                {p.status === 'ENDED' && p.duration_seconds && (
                    <div>{`Meeting beendet · Dauer ${formatDuration(p.duration_seconds)}`}</div>
                )}
                {p.status === 'MISSED' && (
                    <div>{'Meeting verpasst · niemand ist beigetreten'}</div>
                )}
            </div>
        </div>
    );
};

export default PostTypeMeeting;
