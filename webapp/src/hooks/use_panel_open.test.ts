import {renderHook, act} from '@testing-library/react';

import {usePanelOpen} from './use_panel_open';

beforeEach(() => localStorage.clear());

it('defaults to open', () => {
    expect(renderHook(() => usePanelOpen()).result.current[0]).toBe(true);
});

it('persists the choice', () => {
    const {result} = renderHook(() => usePanelOpen());
    act(() => result.current[1](false));
    expect(localStorage.getItem('opentalk:panel-open:v1')).toBe('false');
    expect(renderHook(() => usePanelOpen()).result.current[0]).toBe(false);
});

it('falls back to the default on a corrupt stored value', () => {
    localStorage.setItem('opentalk:panel-open:v1', 'nonsense');
    expect(renderHook(() => usePanelOpen()).result.current[0]).toBe(true);
});
