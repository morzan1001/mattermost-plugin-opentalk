import {
    participantsReducer,
    participantAdded,
    participantRemoved,
    participantsBulkSet,
    speakingChanged,
    participantsReset,
} from './slice_participants';

describe('participantsReducer', () => {
    it('starts with empty state', () => {
        expect(participantsReducer(undefined, {type: '@@INIT'})).toEqual({
            byId: {},
            order: [],
        });
    });

    it('ADDED — new participant: present in byId, appended to order', () => {
        const p = {id: 'a', displayName: 'Alice'};
        const state = participantsReducer(undefined, participantAdded({participant: p}));
        expect(state.byId[p.id]).toEqual(p);
        expect(state.order).toEqual([p.id]);
    });

    it('ADDED — duplicate id: byId entry merged, order unchanged', () => {
        const p1 = {id: 'a', displayName: 'Alice'};
        const p2 = {id: 'a', displayName: 'Alice Updated', role: 'moderator' as const};
        let state = participantsReducer(undefined, participantAdded({participant: p1}));
        state = participantsReducer(state, participantAdded({participant: p2}));
        expect(state.byId[p1.id].displayName).toBe('Alice Updated');
        expect(state.byId[p1.id].role).toBe('moderator');
        expect(state.order).toEqual([p1.id]);
    });

    it('REMOVED — present id: removed from both byId and order', () => {
        const p = {id: 'a', displayName: 'Alice'};
        let state = participantsReducer(undefined, participantAdded({participant: p}));
        state = participantsReducer(state, participantRemoved({id: p.id}));
        expect(state.byId[p.id]).toBeUndefined();
        expect(state.order).toEqual([]);
    });

    it('REMOVED — absent id: no-op', () => {
        const before = participantsReducer(undefined, {type: '@@INIT'});
        const after = participantsReducer(before, participantRemoved({id: 'nonexistent'}));
        expect(after).toEqual(before);
    });

    it('BULK_SET — replaces state entirely; order matches array order', () => {
        const p1 = {id: 'a', displayName: 'Alice'};
        const p2 = {id: 'b', displayName: 'Bob'};
        const pOld = {id: 'x', displayName: 'Old'};
        let state = participantsReducer(undefined, participantAdded({participant: pOld}));
        state = participantsReducer(state, participantsBulkSet({participants: [p1, p2]}));
        expect(state.order).toEqual([p1.id, p2.id]);
        expect(Object.keys(state.byId)).toHaveLength(2);
        expect(state.byId[p1.id]).toEqual(p1);
        expect(state.byId[p2.id]).toEqual(p2);
        expect(state.byId[pOld.id]).toBeUndefined();
    });

    it('SPEAKING_CHANGED — only listed IDs have isSpeaking=true; others become false', () => {
        const p1 = {id: 'a', displayName: 'Alice', isSpeaking: true};
        const p2 = {id: 'b', displayName: 'Bob', isSpeaking: false};
        let state = participantsReducer(undefined, participantsBulkSet({participants: [p1, p2]}));
        state = participantsReducer(state, speakingChanged({speakers: [p2.id]}));
        expect(state.byId[p1.id].isSpeaking).toBe(false);
        expect(state.byId[p2.id].isSpeaking).toBe(true);
    });

    it('RESET — back to empty state', () => {
        const p = {id: 'a', displayName: 'Alice'};
        let state = participantsReducer(undefined, participantAdded({participant: p}));
        state = participantsReducer(state, participantsReset());
        expect(state).toEqual({byId: {}, order: []});
    });
});
