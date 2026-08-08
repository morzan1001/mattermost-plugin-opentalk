import {bestGridFit} from './use_grid_dimensions';

const ASPECT = 16 / 9;

describe('bestGridFit', () => {
    it('gives two participants one row on a wide viewport', () => {
        const fit = bestGridFit(2, 1920, 900, 8, ASPECT);
        expect(fit.columns).toBe(2);
        expect(fit.tileWidth).toBeGreaterThan(800);
    });

    it('prefers the arrangement with the largest tile area', () => {
        const fit = bestGridFit(4, 1000, 1000, 8, ASPECT);
        expect(fit.columns).toBe(2);
    });

    it('keeps the 16:9 aspect ratio', () => {
        const fit = bestGridFit(5, 1600, 900, 8, ASPECT);
        expect(fit.tileWidth / fit.tileHeight).toBeCloseTo(ASPECT, 5);
    });

    it('derives the tile from the height on a very short viewport', () => {
        const fit = bestGridFit(3, 1920, 200, 8, ASPECT);
        expect(fit.tileHeight).toBeLessThanOrEqual(200);
        expect(fit.tileWidth).toBeGreaterThan(0);
    });

    it('returns a zero-sized fit before the container is measured', () => {
        expect(bestGridFit(3, 0, 0, 8, ASPECT)).toEqual({columns: 1, tileWidth: 0, tileHeight: 0});
    });

    it('returns a zero-sized fit for an empty call', () => {
        expect(bestGridFit(0, 1920, 900, 8, ASPECT)).toEqual({columns: 1, tileWidth: 0, tileHeight: 0});
    });
});
