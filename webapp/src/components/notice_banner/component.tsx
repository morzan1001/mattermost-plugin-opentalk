import React, {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';

import {noticeCleared} from '../../store/slice_notice';
import {useT} from '../../util/i18n';
import {selectNotice} from '../../util/selectors';

// Persistent root component: surfaces transient plugin notices (join failures,
// create errors) that would otherwise be swallowed when the widget tears down
// to idle. Info notices auto-dismiss; errors stay until dismissed.
const NoticeBanner: React.FC = () => {
    const dispatch = useDispatch();
    const t = useT();
    const notice = useSelector(selectNotice);

    useEffect(() => {
        if (!notice.message || notice.kind !== 'info') {
            return undefined;
        }
        const id = window.setTimeout(() => dispatch(noticeCleared()), 6000);
        return () => window.clearTimeout(id);

        // seq changes on every fresh notice, restarting the timer.
    }, [notice.seq, notice.message, notice.kind, dispatch]);

    if (!notice.message) {
        return null;
    }

    const isError = notice.kind === 'error';

    return (
        <div
            data-testid='opentalk-notice-banner'
            role='status'
            aria-live='polite'
            style={{
                position: 'fixed',
                top: 60,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 100000,
                maxWidth: '90vw',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 8,
                background: isError ? '#5a1b23' : '#1c2230',
                color: 'white',
                border: `1px solid ${isError ? 'rgba(227,53,76,0.5)' : 'rgba(255,255,255,0.12)'}`,
                boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 13,
            }}
        >
            <span>{notice.message}</span>
            <button
                type='button'
                onClick={() => dispatch(noticeCleared())}
                aria-label={t({de: 'Schließen', en: 'Dismiss'})}
                style={{
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.7)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                    padding: 0,
                    marginLeft: 4,
                }}
            >
                {'×'}
            </button>
        </div>
    );
};

export default NoticeBanner;
