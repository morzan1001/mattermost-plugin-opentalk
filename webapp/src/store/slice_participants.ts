const ACTION_TYPES = {
    ADDED: 'opentalk/participants/added',
    REMOVED: 'opentalk/participants/removed',
    BULK_SET: 'opentalk/participants/bulk_set',
    SPEAKING_CHANGED: 'opentalk/participants/speaking_changed',
    RESET: 'opentalk/participants/reset',
    HAND_RAISED: 'opentalk/participants/hand_raised',
    HAND_LOWERED: 'opentalk/participants/hand_lowered',
    HANDS_RESET: 'opentalk/participants/hands_reset',
} as const;

export interface ParticipantInfo {
    id: string;
    displayName: string;
    role?: 'moderator' | 'user' | 'guest';
    isHost?: boolean;
    isSpeaking?: boolean;
    handRaised?: boolean;
}

export interface ParticipantsState {
    byId: Record<string, ParticipantInfo>;
    order: string[]; // insertion order — for deterministic tile rendering
}

const initial: ParticipantsState = {byId: {}, order: []};

export function participantAdded(payload: {participant: ParticipantInfo}) {
    return {type: ACTION_TYPES.ADDED, payload};
}
export function participantRemoved(payload: {id: string}) {
    return {type: ACTION_TYPES.REMOVED, payload};
}
export function participantsBulkSet(payload: {participants: ParticipantInfo[]}) {
    return {type: ACTION_TYPES.BULK_SET, payload};
}
export function speakingChanged(payload: {speakers: string[]}) {
    return {type: ACTION_TYPES.SPEAKING_CHANGED, payload};
}
export function participantsReset() {
    return {type: ACTION_TYPES.RESET};
}
export function handRaised(payload: {participantID: string}) {
    return {type: ACTION_TYPES.HAND_RAISED, payload};
}
export function handLowered(payload: {participantID: string}) {
    return {type: ACTION_TYPES.HAND_LOWERED, payload};
}
export function handsReset() {
    return {type: ACTION_TYPES.HANDS_RESET};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = {type: string; payload?: any};

export function participantsReducer(state: ParticipantsState = initial, action: AnyAction): ParticipantsState {
    switch (action.type) {
    case ACTION_TYPES.ADDED: {
        const {participant} = action.payload as {participant: ParticipantInfo};
        const existing = state.byId[participant.id];
        const byId = {
            ...state.byId,
            [participant.id]: existing ? {...existing, ...participant} : participant,
        };
        const order = existing ? state.order : [...state.order, participant.id];
        return {byId, order};
    }
    case ACTION_TYPES.REMOVED: {
        const {id} = action.payload as {id: string};
        if (!state.byId[id]) {
            return state;
        }
        const byId = {...state.byId};
        delete byId[id];
        const order = state.order.filter((oid) => oid !== id);
        return {byId, order};
    }
    case ACTION_TYPES.BULK_SET: {
        const {participants} = action.payload as {participants: ParticipantInfo[]};
        const byId: Record<string, ParticipantInfo> = {};
        const order: string[] = [];
        for (const p of participants) {
            byId[p.id] = p;
            order.push(p.id);
        }
        return {byId, order};
    }
    case ACTION_TYPES.SPEAKING_CHANGED: {
        const {speakers} = action.payload as {speakers: string[]};
        const speakerSet = new Set(speakers);
        const byId: Record<string, ParticipantInfo> = {};
        for (const id of state.order) {
            byId[id] = {...state.byId[id], isSpeaking: speakerSet.has(id)};
        }
        return {...state, byId};
    }
    case ACTION_TYPES.RESET:
        return initial;
    case ACTION_TYPES.HAND_RAISED: {
        const {participantID} = action.payload as {participantID: string};
        const existing = state.byId[participantID];
        if (!existing) {
            return state;
        }
        return {
            ...state,
            byId: {...state.byId, [participantID]: {...existing, handRaised: true}},
        };
    }
    case ACTION_TYPES.HAND_LOWERED: {
        const {participantID} = action.payload as {participantID: string};
        const existing = state.byId[participantID];
        if (!existing) {
            return state;
        }
        return {
            ...state,
            byId: {...state.byId, [participantID]: {...existing, handRaised: false}},
        };
    }
    case ACTION_TYPES.HANDS_RESET: {
        const next: Record<string, ParticipantInfo> = {};
        for (const [id, p] of Object.entries(state.byId)) {
            next[id] = {...p, handRaised: false};
        }
        return {...state, byId: next};
    }
    default:
        return state;
    }
}
