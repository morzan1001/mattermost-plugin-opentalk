import React from 'react';
import {useSelector} from 'react-redux';

import {useT} from '../../util/i18n';
import {selectReconnectAttempt} from '../../util/selectors';

const bannerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#1c2230',
    color: 'white',
    padding: '8px 14px',
    borderRadius: 999,
    boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    zIndex: 9997,
    maxWidth: '90vw',
};

const ReconnectingBanner: React.FC = () => {
    const t = useT();
    const attempt = useSelector(selectReconnectAttempt);

    if (attempt <= 0) {
        return null;
    }

    return (
        <div
            data-testid='reconnecting-banner'
            style={bannerStyle}
        >
            <span>{t({de: 'Verbindung wird wiederhergestellt …', en: 'Restoring connection…'})}</span>
        </div>
    );
};

export default ReconnectingBanner;
