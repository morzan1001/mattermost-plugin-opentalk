// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any;

export {selectCurrentDisplayName} from './display_name';

export const PLUGIN_STATE_KEY = 'plugins-com.github.morzan1001.mattermost-plugin-opentalk';

const stateKey = PLUGIN_STATE_KEY;

// Session selectors

export function selectSessionStatus(state: AnyState): string {
    return state?.[stateKey]?.session?.status ?? 'idle';
}

export function selectIsHost(state: AnyState): boolean {
    return state?.[stateKey]?.session?.isHost ?? false;
}

export function selectIsRoomOwner(state: AnyState): boolean {
    return state?.[stateKey]?.session?.isRoomOwner ?? false;
}

export function selectLocalParticipantId(state: AnyState): string | undefined {
    return state?.[stateKey]?.session?.localParticipantId;
}

export function selectPinnedParticipantId(state: AnyState): string | undefined {
    return state?.[stateKey]?.session?.pinnedParticipantId as string | undefined;
}

export function selectIsExpanded(state: AnyState): boolean {
    return state?.[stateKey]?.session?.expanded ?? false;
}

export function selectIsMinimized(state: AnyState): boolean {
    return state?.[stateKey]?.session?.minimized === true;
}

export function selectJoinedAt(state: AnyState): number | undefined {
    return state?.[stateKey]?.session?.joinedAt as number | undefined;
}

export function selectSession(state: AnyState): import('../store/slice_session').SessionState {
    return state?.[stateKey]?.session ?? {status: 'idle', participantCount: 0, micEnabled: false, camEnabled: false, screenShareEnabled: false, livekitConnected: false, isHost: false, isRoomOwner: false, expanded: false, minimized: false, raiseHandsEnabled: false, reconnectAttempt: 0};
}

export function selectMicEnabled(state: AnyState): boolean {
    return state?.[stateKey]?.session?.micEnabled === true;
}

export function selectCamEnabled(state: AnyState): boolean {
    return state?.[stateKey]?.session?.camEnabled === true;
}

export function selectScreenShareEnabled(state: AnyState): boolean {
    return state?.[stateKey]?.session?.screenShareEnabled === true;
}

export function selectChannelID(state: AnyState): string | undefined {
    return state?.[stateKey]?.session?.channelID as string | undefined;
}

export function selectReconnectAttempt(state: AnyState): number {
    return state?.[stateKey]?.session?.reconnectAttempt ?? 0;
}

// Participants slice

export function selectParticipantOrder(state: AnyState): string[] {
    return state?.[stateKey]?.participants?.order ?? [];
}

export function selectParticipantsById(state: AnyState): Record<string, import('../store/slice_participants').ParticipantInfo> {
    return state?.[stateKey]?.participants?.byId ?? {};
}

// Tracks slice

export function selectTracksPerParticipant(state: AnyState): Record<string, import('../store/slice_tracks').ParticipantTracks> {
    return state?.[stateKey]?.tracks?.perParticipant ?? {};
}

export function selectActiveSpeakers(state: AnyState): string[] {
    return state?.[stateKey]?.tracks?.activeSpeakers ?? [];
}

export function selectScreenSharerId(state: AnyState): string | undefined {
    const perParticipant = selectTracksPerParticipant(state);
    return selectParticipantOrder(state).find((id) => Boolean(perParticipant[id]?.screenTrackId));
}

// Incoming calls slice

export function selectIncomingCallsByChannelID(state: AnyState): Record<string, import('../store/slice_incoming_calls').IncomingCall> {
    return state?.[stateKey]?.incomingCalls?.byChannelID ?? {};
}

// OAuth slice

export function selectOAuthConnected(state: AnyState): boolean {
    return state?.[stateKey]?.oauth?.connected === true;
}

// Notice slice

export function selectNotice(state: AnyState): import('../store/slice_notice').NoticeState {
    return state?.[stateKey]?.notice ?? {message: null, kind: 'error', seq: 0};
}

// Active meetings slice

export function selectActiveMeetingsByChannelID(state: AnyState): Record<string, import('../store/slice_active_meetings').ActiveMeeting> {
    return state?.[stateKey]?.activeMeetings?.byChannelID ?? {};
}

// Mattermost entities — not in the plugin slice, but commonly used alongside plugin selectors

export function selectCurrentUserId(state: AnyState): string | undefined {
    return state?.entities?.users?.currentUserId as string | undefined;
}

export function selectCurrentUserLocale(state: AnyState): string | undefined {
    const id = selectCurrentUserId(state);
    if (!id) {
        return undefined;
    }
    return state?.entities?.users?.profiles?.[id]?.locale as string | undefined;
}

export function selectCurrentChannelId(state: AnyState): string | undefined {
    return state?.entities?.channels?.currentChannelId as string | undefined;
}

export function selectChannelType(state: AnyState, channelId: string | undefined): string | undefined {
    if (!channelId) {
        return undefined;
    }
    return state?.entities?.channels?.channels?.[channelId]?.type as string | undefined;
}

export function selectChannelDisplayName(state: AnyState, channelId: string | undefined): string | undefined {
    if (!channelId) {
        return undefined;
    }
    return state?.entities?.channels?.channels?.[channelId]?.display_name as string | undefined;
}
