import type {ComponentType, ReactNode} from 'react';
import type {Reducer} from 'redux';

// The part of Mattermost 12's webapp/channels/src/plugins/registry.ts this plugin uses.
export interface PluginRegistry {
    registerChannelHeaderButtonAction: (icon: ReactNode, action: (channel?: {id: string}) => void, dropdownText: ReactNode, tooltipText: ReactNode) => string;
    registerPostTypeComponent: <TPost>(typeName: string, component: ComponentType<{post: TPost}>) => string;
    registerWebSocketEventHandler: <TData>(event: string, handler: (msg: {data: TData; broadcast: {user_id: string; channel_id: string}}) => void) => void;
    registerReducer: (reducer: Reducer) => void;
    registerRootComponent: (component: ComponentType) => string;
    registerReconnectHandler: (handler: () => void) => void;
    registerUserSettings: (setting: {
        id: string;
        uiName: string;
        icon?: string;
        sections: Array<{title: string; component: ComponentType}>;
    }) => void;
}
