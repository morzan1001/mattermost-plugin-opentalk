import React from 'react';
import {useSelector} from 'react-redux';

import {LayoutSwitcher} from './layout_switcher';

import type {LayoutMode} from '../../hooks/use_layout_mode';
import {useMeetingDuration} from '../../hooks/use_meeting_duration';
import {useT} from '../../util/i18n';
import {selectChannelDisplayName, selectChannelID, selectJoinedAt, selectParticipantsById, selectScreenSharerId, selectSession} from '../../util/selectors';
import {mutedButtonStyle} from '../controls_bar/component';
import {FullscreenExitIcon, FullscreenIcon, PanelIcon} from '../icons';

export interface ExpandedHeaderProps {
    mode: LayoutMode;
    onModeChange: (mode: LayoutMode) => void;
    panelOpen: boolean;
    onTogglePanel: () => void;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
}

const metaStyle: React.CSSProperties = {fontSize: 13, opacity: 0.7};

export const ExpandedHeader: React.FC<ExpandedHeaderProps> = ({mode, onModeChange, panelOpen, onTogglePanel, isFullscreen, onToggleFullscreen}) => {
    const t = useT();
    const channelID = useSelector(selectChannelID);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelName = useSelector((s: any) => selectChannelDisplayName(s, channelID));
    const {participantCount} = useSelector(selectSession);
    const joinedAt = useSelector(selectJoinedAt);
    const sharerId = useSelector(selectScreenSharerId);
    const byId = useSelector(selectParticipantsById);
    const duration = useMeetingDuration(joinedAt);
    const sharerName = sharerId ? byId[sharerId]?.displayName : undefined;

    const panelLabel = panelOpen ? t({de: 'Teilnehmerliste ausblenden', en: 'Hide participant list'}) : t({de: 'Teilnehmerliste einblenden', en: 'Show participant list'});
    const fullscreenLabel = isFullscreen ? t({de: 'Vollbild beenden', en: 'Exit fullscreen'}) : t({de: 'Vollbild', en: 'Fullscreen'});

    return (
        <div
            style={{
                height: 56,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '0 16px',
                background: 'rgba(255,255,255,0.04)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
        >
            <span style={{fontSize: 14, fontWeight: 600}}>{channelName || t({de: 'OpenTalk-Meeting', en: 'OpenTalk meeting'})}</span>
            <span style={metaStyle}>{`${participantCount} ${t({de: 'Teilnehmer', en: 'participants'})}`}</span>
            {duration && <span style={metaStyle}>{duration}</span>}
            {sharerName && (
                <span
                    data-testid='expanded-header-sharing'
                    style={metaStyle}
                >
                    {`${sharerName} ${t({de: 'teilt den Bildschirm', en: 'is sharing their screen'})}`}
                </span>
            )}

            <div style={{flex: 1}}/>

            <LayoutSwitcher
                mode={mode}
                onChange={onModeChange}
            />

            <button
                type='button'
                data-testid='expanded-header-panel-toggle'
                style={mutedButtonStyle}
                onClick={onTogglePanel}
                title={panelLabel}
                aria-label={panelLabel}
            >
                <PanelIcon/>
            </button>

            <button
                type='button'
                data-testid='expanded-header-fullscreen-toggle'
                style={mutedButtonStyle}
                onClick={onToggleFullscreen}
                title={fullscreenLabel}
                aria-label={fullscreenLabel}
            >
                {isFullscreen ? <FullscreenExitIcon/> : <FullscreenIcon/>}
            </button>
        </div>
    );
};

export default ExpandedHeader;
