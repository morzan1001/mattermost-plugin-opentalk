import React from 'react';

import type {LayoutMode} from '../../hooks/use_layout_mode';

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

const BUTTONS: Array<{mode: LayoutMode; label: string}> = [
    {mode: 'speaker', label: 'Sprecher'},
    {mode: 'grid', label: 'Raster'},
    {mode: 'screen-focus', label: 'Bildschirm'},
];

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
    return (
        <div style={containerStyle}>
            {BUTTONS.map(({mode: btnMode, label}) => {
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
                        {label}
                    </button>
                );
            })}
        </div>
    );
};

export default LayoutSwitcher;
