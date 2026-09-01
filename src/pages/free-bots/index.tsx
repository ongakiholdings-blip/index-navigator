import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { load } from '@/external/bot-skeleton';
import { save_types } from '@/external/bot-skeleton/constants/save-type';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';
import { LabelPairedCircleStarCaptionBoldIcon } from '@deriv/quill-icons/LabelPaired';
import { Localize } from '@deriv-com/translations';
import './free-bots.scss';

type MiniTab = 'NORMAL' | 'PREMIUM' | 'CLASSICS';

const MINI_TABS: MiniTab[] = ['NORMAL', 'PREMIUM', 'CLASSICS'];

const TAB_LABELS: Record<MiniTab, string> = {
    NORMAL: 'NORMAL',
    PREMIUM: 'PREMIUM',
    CLASSICS: 'CLASSICS',
};

const TAB_CONFIG: Record<MiniTab, { badge: string; cardBorder: string }> = {
    NORMAL: {
        badge: '📊',
        cardBorder: 'linear-gradient(135deg, #f7c53b 0%, #3b82f6 50%, #f7c53b 100%)',
    },
    PREMIUM: {
        badge: '👑',
        cardBorder: 'linear-gradient(135deg, #ffd700 0%, #ff9500 50%, #ffd700 100%)',
    },
    CLASSICS: {
        badge: '🏛️',
        cardBorder: 'linear-gradient(135deg, #cd7f32 0%, #8b4513 50%, #cd7f32 100%)',
    },
};

type BotEntry = {
    id: string;
    xml_file: string;
    name: string;
    description: string;
    tab: MiniTab;
    difficulty: string;
};

const DIFFICULTY_COLORS: Record<string, string> = {
    Beginner: '#10b981',
    Intermediate: '#f59e0b',
    Advanced: '#ef4444',
};

// ─── Add bots here ────────────────────────────────────────────────────────────
// Each entry needs: id (unique), xml_file (filename in src/xml/ without .xml),
// name, description, tab ('NORMAL' | 'PREMIUM' | 'CLASSICS'), difficulty ('Beginner' | 'Intermediate' | 'Advanced')
const FREE_BOTS: BotEntry[] = [
    {
        id: 'under_8_pro_v1',
        xml_file: 'under_8_pro_v1',
        name: 'Under 8 Pro V1',
        description: 'Premium digit-under strategy configured to target results below 8 with automated stake and risk controls.',
        tab: 'PREMIUM',
        difficulty: 'Advanced',
    },
    {
        id: 'sixth_wave_under',
        xml_file: 'sixth_wave_under',
        name: 'Sixth Wave Under',
        description: 'Wave-based digit-under strategy with automated entry logic and configurable trade management.',
        tab: 'PREMIUM',
        difficulty: 'Advanced',
    },
    {
        id: 'even_odd_pulse',
        xml_file: 'even_odd_pulse',
        name: 'Even/Odd Pulse',
        description: 'Premium Even/Odd strategy that monitors digit patterns and manages entries with pulse-based conditions.',
        tab: 'PREMIUM',
        difficulty: 'Intermediate',
    },
    {
        id: 'navigator_entry_loop',
        xml_file: 'navigator_entry_loop',
        name: 'Navigator Entry Loop',
        description: 'Index Navigator entry-loop strategy that waits for its configured market conditions before placing trades.',
        tab: 'PREMIUM',
        difficulty: 'Advanced',
    },
    {
        id: 'candle_mine_version',
        xml_file: 'candle_mine_version',
        name: 'Candle-Mine Version',
        description: 'Candle-pattern strategy that uses recent price action to identify and manage trading opportunities.',
        tab: 'PREMIUM',
        difficulty: 'Intermediate',
    },
    {
        id: 'third_wave',
        xml_file: 'third_wave',
        name: 'Third Wave',
        description: 'Premium wave strategy with automated trade conditions and configurable stake progression.',
        tab: 'PREMIUM',
        difficulty: 'Advanced',
    },
    {
        id: 'digit_5_pivot',
        xml_file: 'digit_5_pivot',
        name: 'Digit 5 Pivot',
        description: 'Digit-focused pivot strategy that identifies its configured entry conditions before executing trades.',
        tab: 'PREMIUM',
        difficulty: 'Advanced',
    },
    {
        id: 'frosty_dominator_normal',
        xml_file: 'frosty_dominator_normal',
        name: 'Frosty Dominator',
        description: 'Over/Under digit strategy on Volatility 50 (1s) with entry-digit targeting, martingale recovery, and configurable take-profit and stop-loss.',
        tab: 'NORMAL',
        difficulty: 'Intermediate',
    },
    {
        id: 'frosty_version_normal',
        xml_file: 'frosty_version_normal',
        name: 'Frosty Version',
        description: 'Matches/Differs strategy on Volatility 10 (1s) with martingale recovery and configurable profit and loss thresholds.',
        tab: 'NORMAL',
        difficulty: 'Intermediate',
    },
    {
        id: 'frosty_speed_bot_normal',
        xml_file: 'frosty_speed_bot_normal',
        name: 'Frosty Speed Bot',
        description: 'Fast digit-over strategy on Volatility 100 (1s) built for rapid trade execution with take-profit and stop-loss controls.',
        tab: 'NORMAL',
        difficulty: 'Beginner',
    },
    {
        id: 'frosty_tick_scalper',
        xml_file: 'frosty_tick_scalper',
        name: 'Frosty Tick Scalper',
        description: 'Trades Rise (CALL) on every single tick of Volatility 100 (1s). Doubles stake on loss (martingale ×2) and resets on win. Stops automatically when take-profit or stop-loss is hit.',
        tab: 'NORMAL',
        difficulty: 'Beginner',
    },
    // ─── CLASSICS ────────────────────────────────────────────────────────────────
    {
        id: 'classics_under_8_v2',
        xml_file: 'classics_under_8_v2',
        name: 'Under 8 V2',
        description: 'Classic digit-under-8 strategy, version 2. Predicts the last digit will be under 8 on Volatility indices with optimised recovery logic and configurable stake management.',
        tab: 'CLASSICS',
        difficulty: 'Beginner',
    },
    {
        id: 'classics_even_odd_combo',
        xml_file: 'classics_even_odd_combo',
        name: 'Even/Odd Combo',
        description: 'Classic Even/Odd combination strategy that alternates between Even and Odd digit predictions. Features multi-condition entry logic and configurable recovery settings.',
        tab: 'CLASSICS',
        difficulty: 'Intermediate',
    },
    {
        id: 'classics_high_low_tick_combo',
        xml_file: 'classics_high_low_tick_combo',
        name: 'High/Low Tick Combo',
        description: 'Classic High/Low tick combination strategy trading higher and lower tick contracts. Uses adaptive entry conditions with take-profit and stop-loss controls.',
        tab: 'CLASSICS',
        difficulty: 'Intermediate',
    },
    {
        id: 'classics_higher_lower_combo',
        xml_file: 'classics_higher_lower_combo',
        name: 'Higher/Lower Combo',
        description: 'Classic Higher/Lower combination strategy trading rise and fall predictions on Volatility indices. Features combination entry logic with configurable stake and recovery.',
        tab: 'CLASSICS',
        difficulty: 'Intermediate',
    },
    {
        id: 'classics_only_ups_and_down_combo',
        xml_file: 'classics_only_ups_and_down_combo',
        name: 'Only Ups & Downs Combo',
        description: 'Classic Rise/Fall combination strategy targeting consistent upward and downward price movements. Includes multi-condition entry logic and automated recovery.',
        tab: 'CLASSICS',
        difficulty: 'Beginner',
    },
    {
        id: 'classics_candle_mine_v5',
        xml_file: 'classics_candle_mine_v5',
        name: 'Candle Mine V5.1',
        description: 'Community classic — Candle Mine Version 5.1. Uses candle-based entry conditions with advanced stake management and configurable profit and loss targets.',
        tab: 'CLASSICS',
        difficulty: 'Advanced',
    },
    {
        id: 'classics_auto_c4_pro_under9',
        xml_file: 'classics_auto_c4_pro_under9',
        name: 'Auto C4 Pro — Under 9',
        description: 'Auto C4 Pro 2 — classic automated Under-9 digit strategy with 6-level recovery. Predicts the last digit will be under 9 with systematic martingale recovery.',
        tab: 'CLASSICS',
        difficulty: 'Advanced',
    },
];
// ─────────────────────────────────────────────────────────────────────────────

const FreeBots = observer(() => {
    const { dashboard } = useStore();
    const { setActiveTab: setDashboardTab } = dashboard;
    const [importing, setImporting] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<MiniTab>('NORMAL');

    const handleImport = async (bot: BotEntry) => {
        setImporting(bot.id);
        try {
            const xml_module = await import(`../../xml/${bot.xml_file}.xml`);
            const block_string = xml_module.default;
            const workspace = (window as any).Blockly?.derivWorkspace;

            setDashboardTab(DBOT_TABS.BOT_BUILDER);

            if (workspace) {
                await load({
                    block_string,
                    workspace,
                    file_name: bot.name,
                    from: save_types.LOCAL,
                    show_snackbar: true,
                    drop_event: undefined,
                    strategy_id: undefined,
                    showIncompatibleStrategyDialog: undefined,
                });
            } else {
                setTimeout(async () => {
                    const ws = (window as any).Blockly?.derivWorkspace;
                    if (ws) {
                        await load({
                            block_string,
                            workspace: ws,
                            file_name: bot.name,
                            from: save_types.LOCAL,
                            show_snackbar: true,
                            drop_event: undefined,
                            strategy_id: undefined,
                            showIncompatibleStrategyDialog: undefined,
                        });
                    }
                }, 800);
            }
        } catch (err) {
            console.error('Failed to import bot:', err);
        } finally {
            setImporting(null);
        }
    };

    const visible_bots = FREE_BOTS.filter(bot => bot.tab === activeTab);

    return (
        <div className='free-bots'>
            <div className='free-bots__mini-tabs'>
                {MINI_TABS.map(tab => (
                    <button
                        key={tab}
                        className={`free-bots__mini-tab${activeTab === tab ? ' free-bots__mini-tab--active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        <span className='free-bots__mini-tab-badge'>{TAB_CONFIG[tab].badge}</span>
                        {TAB_LABELS[tab]}
                    </button>
                ))}
            </div>

            {visible_bots.length > 0 ? (
                <div className='free-bots__grid'>
                    {visible_bots.map(bot => {
                        const is_loading = importing === bot.id;
                        const cfg = TAB_CONFIG[bot.tab];
                        return (
                            <div
                                key={bot.id}
                                className={`free-bots__card${bot.tab === 'PREMIUM' ? ' free-bots__card--premium' : bot.tab === 'CLASSICS' ? ' free-bots__card--classics' : ' free-bots__card--normal-tab'}`}
                                style={{ '--card-border': cfg.cardBorder } as React.CSSProperties}
                            >
                                <div className='free-bots__card-icon-row'>
                                    <div className='free-bots__card-icon'>
                                        <LabelPairedCircleStarCaptionBoldIcon height='22px' width='22px' fill='#f7c53b' />
                                    </div>
                                    <span
                                        className='free-bots__card-special-tag'
                                        style={
                                            bot.tab === 'PREMIUM'
                                                ? { color: '#f7a800', background: 'rgb(247 168 0 / 12%)', borderColor: '#f7a80040' }
                                                : bot.tab === 'CLASSICS'
                                                ? { color: '#cd7f32', background: 'rgb(205 127 50 / 12%)', borderColor: '#cd7f3240' }
                                                : { color: '#3b82f6', background: 'rgb(59 130 246 / 12%)', borderColor: '#3b82f640' }
                                        }
                                    >
                                        <span>{cfg.badge}</span>
                                        {bot.tab}
                                    </span>
                                </div>
                                <div className='free-bots__card-body'>
                                    <div className='free-bots__card-top'>
                                        <span className='free-bots__card-category'>{bot.tab}</span>
                                        <span
                                            className='free-bots__card-difficulty'
                                            style={{ color: DIFFICULTY_COLORS[bot.difficulty] }}
                                        >
                                            {bot.difficulty}
                                        </span>
                                    </div>
                                    <h3 className='free-bots__card-name'>{bot.name}</h3>
                                    <p className='free-bots__card-description'>{bot.description}</p>
                                </div>
                                <button
                                    className={`free-bots__card-btn${bot.tab === 'PREMIUM' ? ' free-bots__card-btn--premium' : bot.tab === 'CLASSICS' ? ' free-bots__card-btn--classics' : ' free-bots__card-btn--normal-tab'}${is_loading ? ' free-bots__card-btn--loading' : ''}`}
                                    onClick={() => handleImport(bot)}
                                    disabled={is_loading}
                                >
                                    {is_loading ? (
                                        <Localize i18n_default_text='Importing…' />
                                    ) : (
                                        <Localize i18n_default_text='LOAD BOT' />
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className='free-bots__empty'>
                    <Localize i18n_default_text='No bots here yet. Check back soon!' />
                </div>
            )}
        </div>
    );
});

export default FreeBots;
