import {render, screen, fireEvent, act} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

jest.mock('../../conference/controller', () => ({
    applyMicDeviceChange: jest.fn(),
    applyCamDeviceChange: jest.fn(),
}));
jest.mock('../../conference/livekit/devices', () => ({
    getPreferredMicId: jest.fn(() => null),
    setPreferredMicId: jest.fn(),
    getPreferredCamId: jest.fn(() => null),
    setPreferredCamId: jest.fn(),
    getMuteOnJoin: jest.fn(() => false),
    setMuteOnJoin: jest.fn(),
}));
jest.mock('../../client/rest', () => ({
    getConnectionStatus: jest.fn(),
    setRingtonePref: jest.fn(() => Promise.resolve()),
}));

import {OpenTalkSettingsSection} from './component';

import {setRingtonePref} from '../../client/rest';
import {RINGTONE_CHANGED_EVENT, ringtoneSettingKey} from '../../user_settings';

function makeStore() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reducer = (state: any = {}) => state;
    return createStore(reducer, {
        entities: {users: {currentUserId: 'u1', profiles: {u1: {locale: 'en'}}}},
    });
}

function renderSection() {
    return render(
        <Provider store={makeStore()}>
            <OpenTalkSettingsSection/>
        </Provider>,
    );
}

function ringtoneCheckbox(): HTMLInputElement {
    // The ringtone checkbox is the first of the two toggles.
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    return boxes[0];
}

describe('OpenTalkSettingsSection ringtone sync', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    it('reflects the stored setting on mount', () => {
        window.localStorage.setItem(ringtoneSettingKey, 'false');
        renderSection();
        expect(ringtoneCheckbox().checked).toBe(false);
    });

    it('updates when the custom change event fires (same-tab writer)', () => {
        renderSection();
        expect(ringtoneCheckbox().checked).toBe(true);

        // Writers always pair the storage write with the event.
        act(() => {
            window.localStorage.setItem(ringtoneSettingKey, 'false');
            window.dispatchEvent(new CustomEvent(RINGTONE_CHANGED_EVENT, {detail: false}));
        });

        expect(ringtoneCheckbox().checked).toBe(false);

        act(() => {
            window.localStorage.setItem(ringtoneSettingKey, 'true');
            window.dispatchEvent(new CustomEvent(RINGTONE_CHANGED_EVENT, {detail: true}));
        });

        expect(ringtoneCheckbox().checked).toBe(true);
    });

    it('updates on a storage event for the ringtone key (other tab)', () => {
        renderSection();

        act(() => {
            window.localStorage.setItem(ringtoneSettingKey, 'false');
            window.dispatchEvent(new StorageEvent('storage', {key: ringtoneSettingKey}));
        });

        expect(ringtoneCheckbox().checked).toBe(false);
    });

    it('ignores storage events for other keys', () => {
        renderSection();

        act(() => {
            window.localStorage.setItem(ringtoneSettingKey, 'false');
            window.dispatchEvent(new StorageEvent('storage', {key: 'some:other:key'}));
        });

        expect(ringtoneCheckbox().checked).toBe(true);
    });

    it('toggling persists locally and POSTs the preference once', async () => {
        renderSection();

        await act(async () => {
            fireEvent.click(ringtoneCheckbox());
        });

        expect(ringtoneCheckbox().checked).toBe(false);
        expect(window.localStorage.getItem(ringtoneSettingKey)).toBe('false');
        expect(setRingtonePref).toHaveBeenCalledTimes(1);
        expect(setRingtonePref).toHaveBeenCalledWith(false);
    });

    it('toggling back on POSTs enabled=true', async () => {
        window.localStorage.setItem(ringtoneSettingKey, 'false');
        renderSection();

        await act(async () => {
            fireEvent.click(ringtoneCheckbox());
        });

        expect(ringtoneCheckbox().checked).toBe(true);
        expect(setRingtonePref).toHaveBeenCalledWith(true);
    });
});
