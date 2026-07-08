// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const config = {
    presets: [
        ['@babel/preset-env', {
            targets: {
                chrome: 66,
                firefox: 60,
                edge: 42,
                safari: 12,
            },
            modules: false,
            debug: false,
            shippedProposals: true,
        }],
        ['@babel/preset-react'],

        // onlyRemoveTypeImports:false keeps Babel 7's behaviour of eliding
        // imports used only as types even without an explicit `import type`.
        ['@babel/typescript', {onlyRemoveTypeImports: false}],
    ],

    // Babel 8 removed preset-env's useBuiltIns/corejs; core-js usage injection
    // now lives in this plugin.
    plugins: [
        ['polyfill-corejs3', {method: 'usage-global', version: '3.49'}],
    ],
};

// Jest needs module transformation
config.env = {
    test: {
        presets: config.presets,
        plugins: config.plugins,
    },
};
config.env.test.presets[0][1].modules = 'auto';

module.exports = config;
