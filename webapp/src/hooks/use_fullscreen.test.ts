import {renderHook, act} from '@testing-library/react';

import {useFullscreen} from './use_fullscreen';

it('requests and exits fullscreen on the target', () => {
    const el = document.createElement('div');
    const request = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn().mockResolvedValue(undefined);
    (el as unknown as {requestFullscreen: unknown}).requestFullscreen = request;
    (document as unknown as {exitFullscreen: unknown}).exitFullscreen = exit;

    const ref = {current: el};
    const {result} = renderHook(() => useFullscreen(ref));

    act(() => result.current.toggle());
    expect(request).toHaveBeenCalled();

    Object.defineProperty(document, 'fullscreenElement', {value: el, configurable: true});
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(result.current.isFullscreen).toBe(true);

    act(() => result.current.toggle());
    expect(exit).toHaveBeenCalled();
});
