import {tracksReducer, trackSubscribed, trackUnsubscribed, activeSpeakersChanged, tracksReset} from './slice_tracks';

describe('tracksReducer', () => {
    it('starts empty', () => {
        expect(tracksReducer(undefined, {type: '@@INIT'})).toEqual({perParticipant: {}, activeSpeakers: []});
    });
    it('adds an audio track for a participant', () => {
        const next = tracksReducer(undefined, trackSubscribed({participantId: 'p1', kind: 'audio', trackId: 't1'}));
        expect(next.perParticipant.p1).toEqual({audioTrackId: 't1'});
    });
    it('adds video alongside existing audio', () => {
        let s = tracksReducer(undefined, trackSubscribed({participantId: 'p1', kind: 'audio', trackId: 'a1'}));
        s = tracksReducer(s, trackSubscribed({participantId: 'p1', kind: 'video', trackId: 'v1'}));
        expect(s.perParticipant.p1).toEqual({audioTrackId: 'a1', videoTrackId: 'v1'});
    });
    it('removes a single track but keeps the other', () => {
        let s = tracksReducer(undefined, trackSubscribed({participantId: 'p1', kind: 'audio', trackId: 'a1'}));
        s = tracksReducer(s, trackSubscribed({participantId: 'p1', kind: 'video', trackId: 'v1'}));
        s = tracksReducer(s, trackUnsubscribed({participantId: 'p1', kind: 'video'}));
        expect(s.perParticipant.p1).toEqual({audioTrackId: 'a1'});
    });
    it('removes the participant entry when last track goes', () => {
        let s = tracksReducer(undefined, trackSubscribed({participantId: 'p1', kind: 'audio', trackId: 'a1'}));
        s = tracksReducer(s, trackUnsubscribed({participantId: 'p1', kind: 'audio'}));
        expect(s.perParticipant).toEqual({});
    });
    it('updates activeSpeakers', () => {
        const s = tracksReducer(undefined, activeSpeakersChanged({speakers: ['p1', 'p2']}));
        expect(s.activeSpeakers).toEqual(['p1', 'p2']);
    });
    it('resets state', () => {
        let s = tracksReducer(undefined, trackSubscribed({participantId: 'p1', kind: 'audio', trackId: 'a1'}));
        s = tracksReducer(s, tracksReset());
        expect(s).toEqual({perParticipant: {}, activeSpeakers: []});
    });
});
