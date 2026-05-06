import {render, screen, fireEvent} from '@testing-library/react';
import React from 'react';

import {LayoutSwitcher} from './layout_switcher';

describe('LayoutSwitcher', () => {
    it('renders three buttons with German labels', () => {
        const onChange = jest.fn();
        render(
            <LayoutSwitcher
                mode='speaker'
                onChange={onChange}
            />,
        );

        expect(screen.getByText('Sprecher')).toBeInTheDocument();
        expect(screen.getByText('Raster')).toBeInTheDocument();
        expect(screen.getByText('Bildschirm')).toBeInTheDocument();
    });

    it('marks the active button with data-active="true" and teal background', () => {
        const onChange = jest.fn();
        render(
            <LayoutSwitcher
                mode='grid'
                onChange={onChange}
            />,
        );

        const activeBtn = screen.getByTestId('layout-switcher-grid');
        expect(activeBtn).toHaveAttribute('data-active', 'true');
        expect(activeBtn).toHaveStyle({background: '#00B59C'});

        // Inactive buttons should not have data-active
        expect(screen.getByTestId('layout-switcher-speaker')).not.toHaveAttribute('data-active');
        expect(screen.getByTestId('layout-switcher-screen-focus')).not.toHaveAttribute('data-active');
    });

    it('marks "speaker" as active when mode is "speaker"', () => {
        const onChange = jest.fn();
        render(
            <LayoutSwitcher
                mode='speaker'
                onChange={onChange}
            />,
        );

        expect(screen.getByTestId('layout-switcher-speaker')).toHaveAttribute('data-active', 'true');
        expect(screen.getByTestId('layout-switcher-grid')).not.toHaveAttribute('data-active');
        expect(screen.getByTestId('layout-switcher-screen-focus')).not.toHaveAttribute('data-active');
    });

    it('marks "screen-focus" as active when mode is "screen-focus"', () => {
        const onChange = jest.fn();
        render(
            <LayoutSwitcher
                mode='screen-focus'
                onChange={onChange}
            />,
        );

        expect(screen.getByTestId('layout-switcher-screen-focus')).toHaveAttribute('data-active', 'true');
        expect(screen.getByTestId('layout-switcher-speaker')).not.toHaveAttribute('data-active');
        expect(screen.getByTestId('layout-switcher-grid')).not.toHaveAttribute('data-active');
    });

    it('clicking "Sprecher" calls onChange with "speaker"', () => {
        const onChange = jest.fn();
        render(
            <LayoutSwitcher
                mode='grid'
                onChange={onChange}
            />,
        );

        fireEvent.click(screen.getByText('Sprecher'));

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('speaker');
    });

    it('clicking "Raster" calls onChange with "grid"', () => {
        const onChange = jest.fn();
        render(
            <LayoutSwitcher
                mode='speaker'
                onChange={onChange}
            />,
        );

        fireEvent.click(screen.getByText('Raster'));

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('grid');
    });

    it('clicking "Bildschirm" calls onChange with "screen-focus"', () => {
        const onChange = jest.fn();
        render(
            <LayoutSwitcher
                mode='speaker'
                onChange={onChange}
            />,
        );

        fireEvent.click(screen.getByText('Bildschirm'));

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('screen-focus');
    });
});
