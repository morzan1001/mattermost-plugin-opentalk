// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import '@testing-library/jest-dom';

// Polyfill TextEncoder/TextDecoder for jsdom — needed by livekit-client's
// transitive `jose` dependency, which is loaded as soon as anything imports
// `livekit-client` (e.g. controller.ts → livekit/room.ts).
import {TextEncoder, TextDecoder} from 'util';

if (typeof (global as unknown as {TextEncoder?: unknown}).TextEncoder === 'undefined') {
    (global as unknown as {TextEncoder: unknown}).TextEncoder = TextEncoder;
}
if (typeof (global as unknown as {TextDecoder?: unknown}).TextDecoder === 'undefined') {
    (global as unknown as {TextDecoder: unknown}).TextDecoder = TextDecoder;
}

export {};
