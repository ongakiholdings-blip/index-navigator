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
    BULK_TRADER: 4,
    OVER_UNDER_ENGINE: 5,
    SIGNAL_ZONE: 6,
    SCANNER: 7,
    MATCHES_HUB: 8,
    CHART: 9,
    DERIV_T_VIEW: 10,
    COPY_TRADING: 11,
    ANALYSIS: 12,
    TUTORIAL: 13,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-deriv-homes',
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-free-bots',
    'id-bulk-trader',
    'id-over-under-engine',
    'id-signal-zone',
    'id-scanner',
    'id-matches-hub',
    'id-charts',
    'id-deriv-t-view',
    'id-copy-trading',
    'id-analysis',
    'id-tutorials',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
