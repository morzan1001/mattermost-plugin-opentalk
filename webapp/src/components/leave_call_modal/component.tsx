import React from 'react';

import {useT} from '../../util/i18n';

export interface LeaveCallModalProps {
    open: boolean;
    onClose: () => void;
    onLeaveOnly: () => void;
    onEndForAll: () => void;
}

export const LeaveCallModal: React.FC<LeaveCallModalProps> = ({open, onClose, onLeaveOnly, onEndForAll}) => {
    const t = useT();

    if (!open) {
        return null;
    }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
            onClick={onClose}
        >
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
                    zIndex: 10001,
                }}
                role='dialog'
                aria-label={t({de: 'Meeting verlassen oder beenden?', en: 'Leave or end meeting?'})}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{fontSize: 14, fontWeight: 600, marginBottom: 4}}>{t({de: 'Meeting verlassen?', en: 'Leave meeting?'})}</div>
                <div style={{fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 14}}>
                    {t({de: 'Du bist Host. Möchtest du nur dich selbst entfernen oder das Meeting für alle beenden?', en: 'You are the host. Do you want to remove only yourself or end the meeting for everyone?'})}
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
                        onClick={onLeaveOnly}
                    >
                        {t({de: 'Nur mich verlassen', en: 'Leave just for me'})}
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
                        onClick={onEndForAll}
                    >
                        {t({de: 'Meeting für alle beenden', en: 'End meeting for everyone'})}
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
                        onClick={onClose}
                    >
                        {t({de: 'Abbrechen', en: 'Cancel'})}
                    </button>
                </div>
            </div>
        </div>
    );
};
