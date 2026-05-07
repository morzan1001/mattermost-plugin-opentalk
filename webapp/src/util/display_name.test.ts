import {selectCurrentDisplayName} from './display_name';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeState(profile: Record<string, any> | undefined, currentUserId: string | undefined = 'u1') {
    return {
        entities: {
            users: {
                currentUserId,
                profiles: profile ? {[currentUserId as string]: profile} : {},
            },
        },
    };
}

describe('selectCurrentDisplayName', () => {
    it('returns nickname when nickname is set (wins over first+last and username)', () => {
        expect(selectCurrentDisplayName(makeState({
            nickname: 'NickWins',
            first_name: 'Alice',
            last_name: 'Smith',
            username: 'asmith',
        }))).toBe('NickWins');
    });

    it('trims whitespace from nickname', () => {
        expect(selectCurrentDisplayName(makeState({
            nickname: '  Padded  ',
            first_name: 'Alice',
            last_name: 'Smith',
            username: 'asmith',
        }))).toBe('Padded');
    });

    it('returns first+last when nickname is empty', () => {
        expect(selectCurrentDisplayName(makeState({
            nickname: '',
            first_name: 'Bob',
            last_name: 'Jones',
            username: 'bjones',
        }))).toBe('Bob Jones');
    });

    it('returns username when nickname and first+last are all empty', () => {
        expect(selectCurrentDisplayName(makeState({
            nickname: '',
            first_name: '',
            last_name: '',
            username: 'plain_user',
        }))).toBe('plain_user');
    });

    it('returns empty string when no profile found for current user', () => {
        // currentUserId is set but profiles map has no matching entry
        const state = {
            entities: {
                users: {
                    currentUserId: 'missing',
                    profiles: {},
                },
            },
        };
        expect(selectCurrentDisplayName(state)).toBe('');
    });

    it('returns empty string when currentUserId is absent', () => {
        expect(selectCurrentDisplayName(makeState(undefined, undefined))).toBe('');
    });

    it('returns empty string for null state', () => {
        expect(selectCurrentDisplayName(null)).toBe('');
    });
});
