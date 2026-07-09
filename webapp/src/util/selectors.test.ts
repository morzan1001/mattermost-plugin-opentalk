import {
    selectSessionStatus,
    selectIsHost,
    selectIsRoomOwner,
    selectLocalParticipantId,
    selectIsExpanded,
    selectIsMinimized,
    selectCurrentDisplayName,
    PLUGIN_STATE_KEY,
} from './selectors';

const KEY = PLUGIN_STATE_KEY;

// Helper: build a minimal state object with the plugin slice populated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withSession(session: Record<string, any>) {
    return {[KEY]: {session}};
}

describe('PLUGIN_STATE_KEY', () => {
    it('equals the expected plugin identifier', () => {
        expect(KEY).toBe('plugins-com.github.morzan1001.mattermost-plugin-opentalk');
    });
});

describe('selectSessionStatus', () => {
    it('returns the session status when present', () => {
        expect(selectSessionStatus(withSession({status: 'connected'}))).toBe('connected');
    });

    it('returns "idle" when status is absent', () => {
        expect(selectSessionStatus(withSession({}))).toBe('idle');
    });

    it('returns "idle" for null / undefined state', () => {
        expect(selectSessionStatus(null)).toBe('idle');
        expect(selectSessionStatus(undefined)).toBe('idle');
    });

    it('returns "idle" for a completely empty object', () => {
        expect(selectSessionStatus({})).toBe('idle');
    });
});

describe('selectIsHost', () => {
    it('returns true when isHost is true', () => {
        expect(selectIsHost(withSession({isHost: true}))).toBe(true);
    });

    it('returns false when isHost is false', () => {
        expect(selectIsHost(withSession({isHost: false}))).toBe(false);
    });

    it('returns false when isHost is absent', () => {
        expect(selectIsHost(withSession({}))).toBe(false);
    });

    it('returns false for null state', () => {
        expect(selectIsHost(null)).toBe(false);
    });
});

describe('selectIsRoomOwner', () => {
    it('returns true when isRoomOwner is true', () => {
        expect(selectIsRoomOwner(withSession({isRoomOwner: true}))).toBe(true);
    });

    it('returns false when isRoomOwner is false', () => {
        expect(selectIsRoomOwner(withSession({isRoomOwner: false}))).toBe(false);
    });

    it('returns false when isRoomOwner is absent (moderator promoted mid-call, not the owner)', () => {
        expect(selectIsRoomOwner(withSession({isHost: true}))).toBe(false);
    });

    it('returns false for null state', () => {
        expect(selectIsRoomOwner(null)).toBe(false);
    });
});

describe('selectLocalParticipantId', () => {
    it('returns the localParticipantId when present', () => {
        expect(selectLocalParticipantId(withSession({localParticipantId: 'p-42'}))).toBe('p-42');
    });

    it('returns undefined when localParticipantId is absent', () => {
        expect(selectLocalParticipantId(withSession({}))).toBeUndefined();
    });

    it('returns undefined for null state', () => {
        expect(selectLocalParticipantId(null)).toBeUndefined();
    });
});

describe('selectIsExpanded', () => {
    it('returns true when expanded is true', () => {
        expect(selectIsExpanded(withSession({expanded: true}))).toBe(true);
    });

    it('returns false when expanded is false', () => {
        expect(selectIsExpanded(withSession({expanded: false}))).toBe(false);
    });

    it('returns false when expanded is absent', () => {
        expect(selectIsExpanded(withSession({}))).toBe(false);
    });

    it('returns false for null state', () => {
        expect(selectIsExpanded(null)).toBe(false);
    });
});

describe('selectIsMinimized', () => {
    it('returns true when minimized is true', () => {
        expect(selectIsMinimized(withSession({minimized: true}))).toBe(true);
    });

    it('returns false when minimized is false', () => {
        expect(selectIsMinimized(withSession({minimized: false}))).toBe(false);
    });

    it('returns false when minimized is absent', () => {
        expect(selectIsMinimized(withSession({}))).toBe(false);
    });

    it('returns false for null state', () => {
        expect(selectIsMinimized(null)).toBe(false);
    });
});

describe('selectCurrentDisplayName (re-export from display_name)', () => {
    it('returns nickname when set', () => {
        const state = {
            entities: {users: {currentUserId: 'u1', profiles: {u1: {nickname: 'Nicki', first_name: 'First', last_name: 'Last', username: 'user1'}}}},
        };
        expect(selectCurrentDisplayName(state)).toBe('Nicki');
    });

    it('returns first+last when nickname is empty', () => {
        const state = {
            entities: {users: {currentUserId: 'u1', profiles: {u1: {nickname: '', first_name: 'Alice', last_name: 'Smith', username: 'asmith'}}}},
        };
        expect(selectCurrentDisplayName(state)).toBe('Alice Smith');
    });

    it('returns username when nickname and name are both empty', () => {
        const state = {
            entities: {users: {currentUserId: 'u1', profiles: {u1: {nickname: '', first_name: '', last_name: '', username: 'jdoe'}}}},
        };
        expect(selectCurrentDisplayName(state)).toBe('jdoe');
    });

    it('returns empty string when no currentUserId', () => {
        const state = {entities: {users: {currentUserId: undefined, profiles: {}}}};
        expect(selectCurrentDisplayName(state)).toBe('');
    });

    it('returns empty string for null state', () => {
        expect(selectCurrentDisplayName(null)).toBe('');
    });
});
