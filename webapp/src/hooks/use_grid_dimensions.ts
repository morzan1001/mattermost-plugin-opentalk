import {useEffect, useRef, useState} from 'react';
import type React from 'react';

export interface GridFit {
    columns: number;
    tileWidth: number;
    tileHeight: number;
}

const ASPECT = 16 / 9;
const EMPTY: GridFit = {columns: 1, tileWidth: 0, tileHeight: 0};

export function bestGridFit(count: number, width: number, height: number, gap: number, aspect: number): GridFit {
    if (count <= 0 || width <= 0 || height <= 0) {
        return EMPTY;
    }

    let best = EMPTY;
    for (let columns = 1; columns <= count; columns++) {
        const rows = Math.ceil(count / columns);
        const cellWidth = (width - (gap * (columns - 1))) / columns;
        const cellHeight = (height - (gap * (rows - 1))) / rows;
        if (cellWidth <= 0 || cellHeight <= 0) {
            continue;
        }

        // Letterbox the tile inside the cell so the aspect ratio always holds.
        const tileWidth = Math.min(cellWidth, cellHeight * aspect);
        const tileHeight = tileWidth / aspect;
        if (tileWidth * tileHeight > best.tileWidth * best.tileHeight) {
            best = {columns, tileWidth, tileHeight};
        }
    }
    return best;
}

export function useGridDimensions(count: number, gap = 8): {containerRef: React.MutableRefObject<HTMLDivElement | null>; fit: GridFit} {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState<{width: number; height: number}>({width: 0, height: 0});

    useEffect(() => {
        const node = containerRef.current;
        if (!node || typeof ResizeObserver === 'undefined') {
            return undefined;
        }
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) {
                setSize((cur) => (cur.width === rect.width && cur.height === rect.height ? cur : {width: rect.width, height: rect.height}));
            }
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    return {containerRef, fit: bestGridFit(count, size.width, size.height, gap, ASPECT)};
}
