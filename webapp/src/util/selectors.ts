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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectJoinedAt(state: AnyState): number | undefined {
    return state?.[stateKey]?.session?.joinedAt as number | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectSession(state: AnyState): import('../store/slice_session').SessionState {
    return state?.[stateKey]?.session ?? {status: 'idle', participantCount: 0, micEnabled: false, camEnabled: false, screenShareEnabled: false, livekitConnected: false, isHost: false, expanded: false, minimized: false, raiseHandsEnabled: false};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectMicEnabled(state: AnyState): boolean {
    return state?.[stateKey]?.session?.micEnabled === true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectCamEnabled(state: AnyState): boolean {
    return state?.[stateKey]?.session?.camEnabled === true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectScreenShareEnabled(state: AnyState): boolean {
    return state?.[stateKey]?.session?.screenShareEnabled === true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectChannelID(state: AnyState): string | undefined {
    return state?.[stateKey]?.session?.channelID as string | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectParticipantCount(state: AnyState): number {
    return state?.[stateKey]?.session?.participantCount ?? 0;
}

// Participants slice

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectParticipantOrder(state: AnyState): string[] {
    return state?.[stateKey]?.participants?.order ?? [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectParticipantsById(state: AnyState): Record<string, import('../store/slice_participants').ParticipantInfo> {
    return state?.[stateKey]?.participants?.byId ?? {};
}

// Tracks slice

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectTracksPerParticipant(state: AnyState): Record<string, import('../store/slice_tracks').ParticipantTracks> {
    return state?.[stateKey]?.tracks?.perParticipant ?? {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectActiveSpeakers(state: AnyState): string[] {
    return state?.[stateKey]?.tracks?.activeSpeakers ?? [];
}

// Incoming calls slice

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectIncomingCallsByChannelID(state: AnyState): Record<string, import('../store/slice_incoming_calls').IncomingCall> {
    return state?.[stateKey]?.incomingCalls?.byChannelID ?? {};
}

// Active meetings slice

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectActiveMeetingsByChannelID(state: AnyState): Record<string, import('../store/slice_active_meetings').ActiveMeeting> {
    return state?.[stateKey]?.activeMeetings?.byChannelID ?? {};
}

// Mattermost entities — not in the plugin slice, but commonly used alongside plugin selectors

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectCurrentChannelId(state: AnyState): string | undefined {
    return state?.entities?.channels?.currentChannelId as string | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function selectChannelType(state: AnyState, channelId: string | undefined): string | undefined {
    if (!channelId) {
        return undefined;
    }
    return state?.entities?.channels?.channels?.[channelId]?.type as string | undefined;
}
