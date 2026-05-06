/*
 * Inline-SVG icon set for the OpenTalk plugin. Stroke-based icons in the
 * Lucide style: 20x20, currentColor, 2px stroke. Drop-in for buttons and
 * channel-header decorations — no extra npm dependency.
 */
import React from 'react';

const baseProps = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
};

export const VideoIcon: React.FC = () => (
    <svg {...baseProps}>
        <path d='m22 8-6 4 6 4V8Z'/>
        <rect width='14' height='12' x='2' y='6' rx='2' ry='2'/>
    </svg>
);

export const MicIcon: React.FC = () => (
    <svg {...baseProps}>
        <path d='M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z'/>
        <path d='M19 10v2a7 7 0 0 1-14 0v-2'/>
        <line x1='12' x2='12' y1='19' y2='22'/>
    </svg>
);

export const MicOffIcon: React.FC = () => (
    <svg {...baseProps}>
        <line x1='2' x2='22' y1='2' y2='22'/>
        <path d='M18.89 13.23A7.12 7.12 0 0 0 19 12v-2'/>
        <path d='M5 10v2a7 7 0 0 0 12 5'/>
        <path d='M15 9.34V5a3 3 0 0 0-5.68-1.33'/>
        <path d='M9 9v3a3 3 0 0 0 5.12 2.12'/>
        <line x1='12' x2='12' y1='19' y2='22'/>
    </svg>
);

export const CameraIcon: React.FC = () => (
    <svg {...baseProps}>
        <path d='m22 8-6 4 6 4V8Z'/>
        <rect width='14' height='12' x='2' y='6' rx='2' ry='2'/>
    </svg>
);

export const CameraOffIcon: React.FC = () => (
    <svg {...baseProps}>
        <line x1='2' x2='22' y1='2' y2='22'/>
        <path d='M10.66 6H14a2 2 0 0 1 2 2v2.34l1 1L22 8v8'/>
        <path d='M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2l1.34-1'/>
    </svg>
);

export const ScreenShareIcon: React.FC = () => (
    <svg {...baseProps}>
        <path d='M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3'/>
        <path d='M8 21h8'/>
        <path d='M12 17v4'/>
        <path d='m17 8 5-5'/>
        <path d='M17 3h5v5'/>
    </svg>
);

export const ScreenShareOffIcon: React.FC = () => (
    <svg {...baseProps}>
        <path d='M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3'/>
        <path d='M8 21h8'/>
        <path d='M12 17v4'/>
        <path d='m22 3-5 5'/>
        <path d='m17 3 5 5'/>
    </svg>
);

export const PhoneOffIcon: React.FC = () => (
    <svg {...baseProps}>
        <path d='M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91'/>
        <line x1='22' x2='2' y1='2' y2='22'/>
    </svg>
);

export const HangupIcon: React.FC = () => (
    <svg {...baseProps}>
        <path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z'/>
    </svg>
);

export const OpenTalkLogoIcon: React.FC<{size?: number}> = ({size = 24}) => (
    <svg
        width={size}
        height={size}
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
        aria-hidden='true'
    >
        <rect width='14' height='12' x='2' y='6' rx='2' ry='2'/>
        <path d='m22 8-6 4 6 4V8Z'/>
        <circle cx='9' cy='12' r='1.5' fill='currentColor'/>
    </svg>
);
