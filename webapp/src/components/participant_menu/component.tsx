import React, {useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom';
import {useSelector} from 'react-redux';

import {
    forceMute,
    kick,
    ban,
    grantModerator,
    revokeModerator,
    resetHand,
    grantScreenShare,
    revokeScreenShare,
} from '../../conference/controller';
import {useT} from '../../util/i18n';
import {selectIsHost, selectLocalParticipantId, selectParticipantsById} from '../../util/selectors';
import {MoreVerticalIcon} from '../icons';

const triggerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 4,
    right: 4,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    padding: 0,
    borderRadius: 6,
    border: 'none',
    background: 'rgba(0,0,0,0.45)',
    color: 'rgba(255,255,255,0.92)',
    cursor: 'pointer',
};

// Portaled to document.body: the tile root clips overflow, so an in-tree
// popover would be cut off. z-index above the expanded view (9998), mini
// bar (9999) and leave modal (10001).
const menuStyle: React.CSSProperties = {
    position: 'fixed',
    background: '#22293a',
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
    padding: 4,
    minWidth: 190,
    zIndex: 10002,
    display: 'flex',
    flexDirection: 'column',
};

const itemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '6px 10px',
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: 'white',
    cursor: 'pointer',
    fontSize: 13,
    whiteSpace: 'nowrap',
};

const dangerItemStyle: React.CSSProperties = {
    ...itemStyle,
    color: '#e3354c',
};

// Rough eight-item menu height for the flip-up decision; the real height is
// unknown until the portal has rendered.
const ESTIMATED_MENU_HEIGHT = 260;

type MenuPosition = {top?: number; bottom?: number; right: number};

export interface ParticipantMenuProps {
    participantId: string;
}

export const ParticipantMenu: React.FC<ParticipantMenuProps> = ({participantId}) => {
    const t = useT();
    const isHost = useSelector(selectIsHost);
    const localParticipantId = useSelector(selectLocalParticipantId);
    const byId = useSelector(selectParticipantsById);
    const [position, setPosition] = useState<MenuPosition | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const open = position !== null;

    useEffect(() => {
        if (!open) {
            return undefined;
        }
        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
                return;
            }
            setPosition(null);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setPosition(null);
            }
        };
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    if (!isHost || participantId === localParticipantId) {
        return null;
    }

    const participant = byId[participantId];
    const isModerator = participant?.role === 'moderator';
    const handRaised = participant?.handRaised === true;

    const toggleMenu = () => {
        if (position) {
            setPosition(null);
            return;
        }
        const rect = triggerRef.current!.getBoundingClientRect();
        const right = Math.max(4, window.innerWidth - rect.right);
        if (rect.bottom + ESTIMATED_MENU_HEIGHT > window.innerHeight) {
            setPosition({bottom: (window.innerHeight - rect.top) + 4, right});
        } else {
            setPosition({top: rect.bottom + 4, right});
        }
    };

    const runAndClose = (fn: () => void) => () => {
        fn();
        setPosition(null);
    };

    return (
        <>
            <button
                ref={triggerRef}
                type='button'
                data-testid={`participant-menu-trigger-${participantId}`}
                title={t({de: 'Weitere Optionen', en: 'More options'})}
                aria-label={t({de: 'Weitere Optionen', en: 'More options'})}
                style={triggerStyle}
                onClick={toggleMenu}
            >
                <MoreVerticalIcon size={16}/>
            </button>
            {position && ReactDOM.createPortal(
                <div
                    ref={menuRef}
                    style={{...menuStyle, ...position}}
                >
                    <button
                        type='button'
                        data-testid={`participant-menu-mute-${participantId}`}
                        style={itemStyle}
                        onClick={runAndClose(() => forceMute(participantId))}
                    >
                        {t({de: 'Stummschalten', en: 'Mute'})}
                    </button>
                    {handRaised && (
                        <button
                            type='button'
                            data-testid={`participant-menu-lower-hand-${participantId}`}
                            style={itemStyle}
                            onClick={runAndClose(() => resetHand(participantId))}
                        >
                            {t({de: 'Hand senken', en: 'Lower hand'})}
                        </button>
                    )}
                    {isModerator ? (
                        <button
                            type='button'
                            data-testid={`participant-menu-role-toggle-${participantId}`}
                            style={itemStyle}
                            onClick={runAndClose(() => revokeModerator(participantId))}
                        >
                            {t({de: 'Moderator entfernen', en: 'Remove moderator'})}
                        </button>
                    ) : (
                        <button
                            type='button'
                            data-testid={`participant-menu-role-toggle-${participantId}`}
                            style={itemStyle}
                            onClick={runAndClose(() => grantModerator(participantId))}
                        >
                            {t({de: 'Zum Moderator machen', en: 'Make moderator'})}
                        </button>
                    )}
                    <button
                        type='button'
                        data-testid={`participant-menu-grant-screen-share-${participantId}`}
                        style={itemStyle}
                        onClick={runAndClose(() => grantScreenShare(participantId))}
                    >
                        {t({de: 'Bildschirmfreigabe erlauben', en: 'Allow screen share'})}
                    </button>
                    <button
                        type='button'
                        data-testid={`participant-menu-revoke-screen-share-${participantId}`}
                        style={itemStyle}
                        onClick={runAndClose(() => revokeScreenShare(participantId))}
                    >
                        {t({de: 'Bildschirmfreigabe entziehen', en: 'Revoke screen share'})}
                    </button>
                    <button
                        type='button'
                        data-testid={`participant-menu-kick-${participantId}`}
                        style={dangerItemStyle}
                        onClick={runAndClose(() => kick(participantId))}
                    >
                        {t({de: 'Entfernen', en: 'Kick'})}
                    </button>
                    <button
                        type='button'
                        data-testid={`participant-menu-ban-${participantId}`}
                        style={dangerItemStyle}
                        onClick={runAndClose(() => ban(participantId))}
                    >
                        {t({de: 'Verbannen', en: 'Ban'})}
                    </button>
                </div>,
                document.body,
            )}
        </>
    );
};

export default ParticipantMenu;
