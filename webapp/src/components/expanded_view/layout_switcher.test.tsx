import {render, screen, fireEvent} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import {LayoutSwitcher} from './layout_switcher';

// Wrap with a minimal store so useT() / useSelector() works.
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

function renderSwitcher(mode: Parameters<typeof LayoutSwitcher>[0]['mode'], onChange: jest.Mock) {
    const store = makeStore();
    return render(
        <Provider store={store}>
            <LayoutSwitcher
                mode={mode}
                onChange={onChange}
            />
        </Provider>,
    );
}

describe('LayoutSwitcher', () => {
    it('renders three buttons with English labels (default locale)', () => {
        const onChange = jest.fn();
        renderSwitcher('speaker', onChange);

        expect(screen.getByText('Speaker')).toBeInTheDocument();
        expect(screen.getByText('Grid')).toBeInTheDocument();
        expect(screen.getByText('Screen')).toBeInTheDocument();
    });

    it('marks the active button with data-active="true" and teal background', () => {
        const onChange = jest.fn();
        renderSwitcher('grid', onChange);

        const activeBtn = screen.getByTestId('layout-switcher-grid');
        expect(activeBtn).toHaveAttribute('data-active', 'true');
        expect(activeBtn).toHaveStyle({background: '#00B59C'});

        // Inactive buttons should not have data-active
        expect(screen.getByTestId('layout-switcher-speaker')).not.toHaveAttribute('data-active');
        expect(screen.getByTestId('layout-switcher-screen-focus')).not.toHaveAttribute('data-active');
    });

    it('marks "speaker" as active when mode is "speaker"', () => {
        const onChange = jest.fn();
        renderSwitcher('speaker', onChange);

        expect(screen.getByTestId('layout-switcher-speaker')).toHaveAttribute('data-active', 'true');
        expect(screen.getByTestId('layout-switcher-grid')).not.toHaveAttribute('data-active');
        expect(screen.getByTestId('layout-switcher-screen-focus')).not.toHaveAttribute('data-active');
    });

    it('marks "screen-focus" as active when mode is "screen-focus"', () => {
        const onChange = jest.fn();
        renderSwitcher('screen-focus', onChange);

        expect(screen.getByTestId('layout-switcher-screen-focus')).toHaveAttribute('data-active', 'true');
        expect(screen.getByTestId('layout-switcher-speaker')).not.toHaveAttribute('data-active');
        expect(screen.getByTestId('layout-switcher-grid')).not.toHaveAttribute('data-active');
    });

    it('clicking "Speaker" calls onChange with "speaker"', () => {
        const onChange = jest.fn();
        renderSwitcher('grid', onChange);

        fireEvent.click(screen.getByText('Speaker'));

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('speaker');
    });

    it('clicking "Grid" calls onChange with "grid"', () => {
        const onChange = jest.fn();
        renderSwitcher('speaker', onChange);

        fireEvent.click(screen.getByText('Grid'));

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('grid');
    });

    it('clicking "Screen" calls onChange with "screen-focus"', () => {
        const onChange = jest.fn();
        renderSwitcher('speaker', onChange);

        fireEvent.click(screen.getByText('Screen'));

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('screen-focus');
    });
});
