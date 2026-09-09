type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DERIV_HOMES: 0,
    DASHBOARD: 1,
    BOT_BUILDER: 2,
    FREE_BOTS: 3,
    OVER_UNDER_ENGINE: 4,
    SIGNAL_ZONE: 5,
    CHART: 6,
    DERIV_T_VIEW: 7,
    COPY_TRADING: 8,
    ANALYSIS: 9,
    TUTORIAL: 10,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-deriv-homes',
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-free-bots',
    'id-over-under-engine',
    'id-signal-zone',
    'id-charts',
    'id-deriv-t-view',
    'id-copy-trading',
    'id-analysis',
    'id-tutorials',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
