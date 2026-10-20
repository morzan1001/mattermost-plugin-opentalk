import {render, screen, fireEvent, act} from '@testing-library/react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import ScreenPickerModal from './component';

import type {DesktopSource} from '../../conference/livekit/desktop_capturer';

type PickerState = {open: boolean; sources: DesktopSource[]};
type PickerMock = {resolveScreenPicker: jest.Mock; fireState: (state: PickerState) => void};

// The screen_picker module uses module-level singletons. Reset between tests.
jest.mock('../../conference/livekit/screen_picker', () => {
    let mockCb: ((state: PickerState) => void) | null = null;
    return {
        subscribeScreenPicker: jest.fn((listener: (state: PickerState) => void) => {
            mockCb = listener;

            // Immediately call with closed state, matching real behaviour.
            listener({open: false, sources: []});
            return () => {
                mockCb = null;
            };
        }),
        resolveScreenPicker: jest.fn(),

        // Helper exposed only in tests to push state changes.
        fireState: (state: PickerState) => {
            if (mockCb) {
                mockCb(state);
            }
        },
    };
});

// Use requireMock to access the full mock including fireState helper.
const mockPicker = jest.requireMock<PickerMock>('../../conference/livekit/screen_picker');

function makeStore() {
    return createStore(() => ({
        entities: {
            users: {
                currentUserId: 'u1',
                profiles: {u1: {}},
            },
        },
    }));
}

function renderModal() {
    const store = makeStore();
    return render(
        <Provider store={store}>
            <ScreenPickerModal/>
        </Provider>,
    );
}

describe('ScreenPickerModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders nothing when the picker is closed', () => {
        renderModal();
        expect(screen.queryByTestId('screen-picker-modal')).toBeNull();
    });

    it('renders tiles when subscriber state opens with sources', () => {
        renderModal();
        act(() => {
            mockPicker.fireState({
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
        renderModal();
        act(() => {
            mockPicker.fireState({
                open: true,
                sources: [{id: 'screen:0:0', name: 'Screen', thumbnailURL: ''}],
            });
        });

        fireEvent.click(screen.getByTestId('screen-picker-tile-screen:0:0'));
        expect(mockPicker.resolveScreenPicker).toHaveBeenCalledWith('screen:0:0');
    });

    it('pressing ESC calls resolveScreenPicker(null)', () => {
        renderModal();
        act(() => {
            mockPicker.fireState({
                open: true,
                sources: [{id: 'screen:0:0', name: 'Screen', thumbnailURL: ''}],
            });
        });

        fireEvent.keyDown(window, {key: 'Escape'});
        expect(mockPicker.resolveScreenPicker).toHaveBeenCalledWith(null);
    });
});
