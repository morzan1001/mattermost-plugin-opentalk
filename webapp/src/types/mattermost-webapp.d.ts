export interface PluginRegistry {
    registerChannelHeaderButtonAction?: (icon: any, action: any, dropdownText?: string, tooltipText?: string) => string;
    registerPostTypeComponent?: (typeName: string, component: any) => string;
    registerWebSocketEventHandler?: (event: string, handler: (msg: any) => void) => void;
    registerReducer?: (reducer: any) => void;
    registerRootComponent?: (component: any) => string;
    registerReconnectHandler?: (handler: () => void) => void;
    registerTranslations?: (getTranslations: (locale: string) => Record<string, string>) => void;
    [key: string]: any;
}
