import type {DesktopSource} from './desktop_capturer';

type Listener = (state: {open: boolean; sources: DesktopSource[]}) => void;

let pendingResolver: ((id: string | null) => void) | null = null;
let pendingSources: DesktopSource[] = [];
const listeners = new Set<Listener>();

function notify() {
    const state = {open: pendingResolver !== null, sources: pendingSources};
    listeners.forEach((cb) => cb(state));
}

export function subscribeScreenPicker(cb: Listener): () => void {
    listeners.add(cb);
    cb({open: pendingResolver !== null, sources: pendingSources});
    return () => listeners.delete(cb);
}

// id is null when the user cancels or presses ESC.
export function resolveScreenPicker(id: string | null): void {
    if (!pendingResolver) {
        return;
    }
    const r = pendingResolver;
    pendingResolver = null;
    pendingSources = [];
    r(id);
    notify();
}

// Resolves to null if the user cancels.
export function pickScreenSource(sources: DesktopSource[]): Promise<string | null> {
    // If already open, cancel the previous picker so we don't leak listeners.
    if (pendingResolver) {
        resolveScreenPicker(null);
    }
    pendingSources = sources;
    return new Promise<string | null>((resolve) => {
        pendingResolver = resolve;
        notify();
    });
}
