import React from 'react';

import type {LayoutMode} from '../../hooks/use_layout_mode';
import {useT} from '../../util/i18n';

export interface LayoutSwitcherProps {
    mode: LayoutMode;
    onChange: (mode: LayoutMode) => void;
}

const TEAL = '#00B59C';

const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 2,
    gap: 2,
};

const MODES: LayoutMode[] = ['speaker', 'grid', 'screen-focus'];

function buttonStyle(active: boolean): React.CSSProperties {
    return {
        padding: '6px 12px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        border: active ? '1px solid transparent' : '1px solid rgba(255,255,255,0.15)',
        background: active ? TEAL : 'transparent',
        color: active ? 'white' : 'rgba(255,255,255,0.7)',
        cursor: 'pointer',
    };
}

export const LayoutSwitcher: React.FC<LayoutSwitcherProps> = ({mode, onChange}) => {
    const t = useT();

    const labels: Record<LayoutMode, string> = {
        speaker: t({de: 'Sprecher', en: 'Speaker'}),
        grid: t({de: 'Raster', en: 'Grid'}),
        'screen-focus': t({de: 'Bildschirm', en: 'Screen'}),
    };

    return (
        <div style={containerStyle}>
            {MODES.map((btnMode) => {
                const active = btnMode === mode;
                return (
                    <button
                        key={btnMode}
                        type='button'
                        data-testid={`layout-switcher-${btnMode}`}
                        data-active={active ? 'true' : undefined}
                        style={buttonStyle(active)}
                        onClick={() => onChange(btnMode)}
                    >
                        {labels[btnMode]}
                    </button>
                );
            })}
        </div>
    );
};

export default LayoutSwitcher;
