import React from 'react';
import {render, screen, fireEvent, act} from '@testing-library/react';

// The screen_picker module uses module-level singletons. Reset between tests.
jest.mock('../../conference/livekit/screen_picker', () => {
    let mockCb: ((state: {open: boolean; sources: any[]}) => void) | null = null;
    return {
        subscribeScreenPicker: jest.fn((listener: (state: {open: boolean; sources: any[]}) => void) => {
            mockCb = listener;
            // Immediately call with closed state, matching real behaviour.
            listener({open: false, sources: []});
            return () => {
                mockCb = null;
            };
        }),
        resolveScreenPicker: jest.fn(),
        // Helper exposed only in tests to push state changes.
        __fireState: (state: {open: boolean; sources: any[]}) => {
            if (mockCb) {
                mockCb(state);
            }
        },
    };
});

import ScreenPickerModal from './component';

// Use requireMock to access the full mock including __fireState helper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPicker: any = jest.requireMock('../../conference/livekit/screen_picker');

describe('ScreenPickerModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders nothing when the picker is closed', () => {
        render(<ScreenPickerModal />);
        expect(screen.queryByTestId('screen-picker-modal')).toBeNull();
    });

    it('renders tiles when subscriber state opens with sources', () => {
        render(<ScreenPickerModal />);
        act(() => {
            mockPicker.__fireState({
                open: true,
                sources: [
                    {id: 'screen:0:0', name: 'Entire Screen', thumbnailURL: ''},
                    {id: 'window:1:0', name: 'Terminal', thumbnailURL: 'data:image/png;base64,abc'},
                ],
            });
        });

        expect(screen.getByTestId('screen-picker-modal')).toBeTruthy();
        expect(screen.getByTestId('screen-picker-tile-screen:0:0')).toBeTruthy();
        expect(screen.getByTestId('screen-picker-tile-window:1:0')).toBeTruthy();
    });

    it('clicking a tile calls resolveScreenPicker with the source id', () => {
        render(<ScreenPickerModal />);
        act(() => {
            mockPicker.__fireState({
                open: true,
                sources: [{id: 'screen:0:0', name: 'Screen', thumbnailURL: ''}],
            });
        });

        fireEvent.click(screen.getByTestId('screen-picker-tile-screen:0:0'));
        expect(mockPicker.resolveScreenPicker).toHaveBeenCalledWith('screen:0:0');
    });

    it('pressing ESC calls resolveScreenPicker(null)', () => {
        render(<ScreenPickerModal />);
        act(() => {
            mockPicker.__fireState({
                open: true,
                sources: [{id: 'screen:0:0', name: 'Screen', thumbnailURL: ''}],
            });
        });

        fireEvent.keyDown(window, {key: 'Escape'});
        expect(mockPicker.resolveScreenPicker).toHaveBeenCalledWith(null);
    });
});
