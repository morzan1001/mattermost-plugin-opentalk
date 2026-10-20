import {render, renderHook} from '@testing-library/react';
import React, {useLayoutEffect} from 'react';

import {useCallShortcuts} from './use_call_shortcuts';
import type {CallShortcutHandlers} from './use_call_shortcuts';

function makeHandlers() {
    return {
        onToggleMic: jest.fn(),
        onToggleCam: jest.fn(),
        onToggleScreen: jest.fn(),
        onToggleHand: jest.fn(),
        onToggleFullscreen: jest.fn(),
        onCollapse: jest.fn(),
        onSetLayout: jest.fn(),
    };
}

it('maps each key to its action', () => {
    const h = makeHandlers();
    renderHook(() => useCallShortcuts(true, h));

    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'm'}));
    expect(h.onToggleMic).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'v'}));
    expect(h.onToggleCam).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 's'}));
    expect(h.onToggleScreen).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'h'}));
    expect(h.onToggleHand).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'f'}));
    expect(h.onToggleFullscreen).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    expect(h.onCollapse).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', {key: '2'}));
    expect(h.onSetLayout).toHaveBeenCalledWith('grid');
});

it('ignores keys held with a modifier so Mattermost shortcuts keep working', () => {
    const h = makeHandlers();
    renderHook(() => useCallShortcuts(true, h));
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'm', ctrlKey: true}));
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'm', metaKey: true}));
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'm', altKey: true}));
    expect(h.onToggleMic).not.toHaveBeenCalled();
});

it('binds nothing when disabled', () => {
    const h = makeHandlers();
    renderHook(() => useCallShortcuts(false, h));
    window.dispatchEvent(new KeyboardEvent('keydown', {key: 'm'}));
    expect(h.onToggleMic).not.toHaveBeenCalled();
});

function ShortcutHarness({handlers}: {handlers: CallShortcutHandlers}) {
    useCallShortcuts(true, handlers);
    return null;
}

// Fires after the harness's layout effects but before its passive ones, as a real keydown can.
function KeydownInLayoutPhase() {
    useLayoutEffect(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'm'}));
    });
    return null;
}

it('uses the latest handlers even when a keydown races the passive-effect flush', () => {
    const h1 = makeHandlers();
    const h2 = makeHandlers();

    const {rerender} = render(React.createElement(ShortcutHarness, {handlers: h1}));
    rerender(
        React.createElement(
            React.Fragment,
            null,
            React.createElement(ShortcutHarness, {handlers: h2}),
            React.createElement(KeydownInLayoutPhase),
        ),
    );

    expect(h2.onToggleMic).toHaveBeenCalled();
    expect(h1.onToggleMic).not.toHaveBeenCalled();
});
