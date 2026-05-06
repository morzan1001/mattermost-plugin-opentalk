const ACTION_TYPES = {
    SUBSCRIBED: 'opentalk/tracks/subscribed',
    UNSUBSCRIBED: 'opentalk/tracks/unsubscribed',
    SPEAKERS: 'opentalk/tracks/speakers',
    RESET: 'opentalk/tracks/reset',
} as const;

export type TrackKind = 'audio' | 'video' | 'screen';

export interface ParticipantTracks {
    audioTrackId?: string;
    videoTrackId?: string;
    screenTrackId?: string;
}

export interface TracksState {
    perParticipant: Record<string, ParticipantTracks>;
    activeSpeakers: string[];
}

const initial: TracksState = {perParticipant: {}, activeSpeakers: []};

export function trackSubscribed(payload: {participantId: string; kind: TrackKind; trackId: string}) {
    return {type: ACTION_TYPES.SUBSCRIBED, payload};
}
export function trackUnsubscribed(payload: {participantId: string; kind: TrackKind}) {
    return {type: ACTION_TYPES.UNSUBSCRIBED, payload};
}
export function activeSpeakersChanged(payload: {speakers: string[]}) {
    return {type: ACTION_TYPES.SPEAKERS, payload};
}
export function tracksReset() {
    return {type: ACTION_TYPES.RESET};
}

function fieldFor(kind: TrackKind): keyof ParticipantTracks {
    if (kind === 'audio') {
        return 'audioTrackId';
    }
    if (kind === 'video') {
        return 'videoTrackId';
    }
    return 'screenTrackId';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = {type: string; payload?: any};

export function tracksReducer(state: TracksState = initial, action: AnyAction): TracksState {
    switch (action.type) {
    case ACTION_TYPES.SUBSCRIBED: {
        const {participantId, kind, trackId} = action.payload;
        const existing = state.perParticipant[participantId] ?? {};
        const field = fieldFor(kind);
        return {
            ...state,
            perParticipant: {
                ...state.perParticipant,
                [participantId]: {...existing, [field]: trackId},
            },
        };
    }
    case ACTION_TYPES.UNSUBSCRIBED: {
        const {participantId, kind} = action.payload;
        const existing = state.perParticipant[participantId];
        if (!existing) {
            return state;
        }
        const field = fieldFor(kind);
        const next: ParticipantTracks = {...existing};
        delete next[field];
        const isEmpty = !next.audioTrackId && !next.videoTrackId && !next.screenTrackId;
        const perParticipant = {...state.perParticipant};
        if (isEmpty) {
            delete perParticipant[participantId];
        } else {
            perParticipant[participantId] = next;
        }
        return {...state, perParticipant};
    }
    case ACTION_TYPES.SPEAKERS:
        return {...state, activeSpeakers: action.payload.speakers};
    case ACTION_TYPES.RESET:
        return initial;
    default:
        return state;
    }
}
