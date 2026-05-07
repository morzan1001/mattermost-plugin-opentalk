import React, {useEffect, useState} from 'react';

import type {DesktopSource} from '../../conference/livekit/desktop_capturer';
import {subscribeScreenPicker, resolveScreenPicker} from '../../conference/livekit/screen_picker';

const ScreenPickerModal: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [sources, setSources] = useState<DesktopSource[]>([]);

    useEffect(() => {
        return subscribeScreenPicker((s) => {
            setOpen(s.open);
            setSources(s.sources);
        });
    }, []);

    useEffect(() => {
        if (!open) {
            return undefined;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                resolveScreenPicker(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    if (!open) {
        return null;
    }

    return (
        <div
            data-testid='screen-picker-modal'
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.55)',
                zIndex: 99998,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Inter, system-ui, sans-serif',
            }}
        >
            <div
                style={{
                    background: '#1c2230',
                    color: 'white',
                    borderRadius: 12,
                    padding: 24,
                    width: 'min(900px, 92vw)',
                    maxHeight: '88vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                }}
                role='dialog'
                aria-label='Bildschirm oder Fenster auswählen'
            >
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14}}>
                    <div style={{fontSize: 16, fontWeight: 600}}>{'Bildschirm oder Fenster auswählen'}</div>
                    <button
                        type='button'
                        onClick={() => resolveScreenPicker(null)}
                        style={{
                            background: 'transparent',
                            color: 'rgba(255,255,255,0.7)',
                            border: 'none',
                            fontSize: 20,
                            cursor: 'pointer',
                            padding: 4,
                        }}
                        aria-label='Schließen'
                    >
                        {'×'}
                    </button>
                </div>
                {sources.length === 0 ? (
                    <div style={{padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.6)'}}>
                        {'Keine Bildschirme oder Fenster verfügbar.'}
                    </div>
                ) : (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                            gap: 12,
                            overflowY: 'auto',
                        }}
                    >
                        {sources.map((s) => (
                            <button
                                key={s.id}
                                type='button'
                                onClick={() => resolveScreenPicker(s.id)}
                                data-testid={`screen-picker-tile-${s.id}`}
                                style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    borderRadius: 8,
                                    padding: 8,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    color: 'white',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6,
                                }}
                            >
                                {s.thumbnailURL ? (
                                    <img
                                        src={s.thumbnailURL}
                                        alt={s.name}
                                        style={{
                                            width: '100%',
                                            aspectRatio: '16/9',
                                            objectFit: 'cover',
                                            borderRadius: 4,
                                            background: '#000',
                                        }}
                                    />
                                ) : (
                                    <div
                                        style={{
                                            width: '100%',
                                            aspectRatio: '16/9',
                                            background: '#000',
                                            borderRadius: 4,
                                        }}
                                    />
                                )}
                                <span style={{fontSize: 13, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                    {s.name || s.id}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ScreenPickerModal;
