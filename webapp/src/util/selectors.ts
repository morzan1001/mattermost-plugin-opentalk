// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;

export {selectCurrentDisplayName} from './display_name';

export const PLUGIN_STATE_KEY = 'plugins-com.github.morzan1001.mattermost-plugin-opentalk';

const stateKey = PLUGIN_STATE_KEY;

// Session selectors

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectSessionStatus(state: AnyState): string {
    return state?.[stateKey]?.session?.status ?? 'idle';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectIsHost(state: AnyState): boolean {
    return state?.[stateKey]?.session?.isHost ?? false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectLocalParticipantId(state: AnyState): string | undefined {
    return state?.[stateKey]?.session?.localParticipantId;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectIsExpanded(state: AnyState): boolean {
    return state?.[stateKey]?.session?.expanded ?? false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectIsMinimized(state: AnyState): boolean {
    return state?.[stateKey]?.session?.minimized === true;
}
