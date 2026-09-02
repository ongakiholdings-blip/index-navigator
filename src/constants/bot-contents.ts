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
    DASHBOARD: 0,
    BOT_BUILDER: 1,
    FREE_BOTS: 2,
    OVER_UNDER_ENGINE: 3,
    CHART: 4,
    COPY_TRADING: 5,
    ANALYSIS: 6,
    TUTORIAL: 7,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-free-bots',
    'id-over-under-engine',
    'id-charts',
    'id-copy-trading',
    'id-analysis',
    'id-tutorials',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
