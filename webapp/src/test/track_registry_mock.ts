// Builds the module mock for conference/livekit/track_registry. Pass a getImpl
// that returns the fake track for an id; each test keeps its own attach/detach
// spies inside that closure so assertions stay file-local.
export function makeTrackRegistryMock(getImpl: (id: string) => unknown) {
    return {
        get: jest.fn().mockImplementation(getImpl),
        register: jest.fn(),
        unregister: jest.fn(),
        clear: jest.fn(),
    };
}
