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
        id: 'even_odd_switcher',
        xml_file: 'even_odd_switcher',
        name: 'Even/Odd Switcher',
        description: 'Digit strategy that automatically switches between Even and Odd trade conditions with configurable stake management.',
        tab: 'NORMAL',
        difficulty: 'Intermediate',
    },
    {
        id: 'default_navigator',
        xml_file: 'default_navigator',
        name: 'Default Navigator',
        description: 'The standard Index Navigator strategy with accessible automated entry and trade-management settings.',
        tab: 'NORMAL',
        difficulty: 'Beginner',
    },
    {
        id: 'speed_bot',
        xml_file: 'speed_bot',
        name: 'Speed Bot',
        description: 'Fast automated strategy designed for rapid trade execution with configurable risk controls.',
        tab: 'NORMAL',
        difficulty: 'Beginner',
    },
    {
        id: 'dominator',
        xml_file: 'dominator',
        name: 'Dominator',
        description: 'Automated digit strategy with configurable entry conditions, stake management, and risk controls.',
        tab: 'NORMAL',
        difficulty: 'Intermediate',
    },
    {
        id: 'dominator_vol_2',
        xml_file: 'dominator_vol_2',
        name: 'Dominator Vol 2',
        description: 'Second Dominator configuration with automated trading conditions and configurable stake management.',
        tab: 'NORMAL',
        difficulty: 'Intermediate',
    },
    // ─── CLASSICS ────────────────────────────────────────────────────────────────
    {
        id: 'in_even_odd_pa_bot',
        xml_file: 'in_even_odd_pa_bot',
        name: 'IN Even/Odd PA Bot',
        description: 'Classic Even/Odd strategy built around price-action entry conditions and automated trade management.',
        tab: 'CLASSICS',
        difficulty: 'Advanced',
    },
    {
        id: 'auto_c4_pro_2',
        xml_file: 'auto_c4_pro_2',
        name: 'Auto C4 Pro 2',
        description: 'Automated Classic C4 strategy with configurable digit-trading conditions and stake progression.',
        tab: 'CLASSICS',
        difficulty: 'Advanced',
    },
    {
        id: 'candle_mine_version_2',
        xml_file: 'candle_mine_version_2',
        name: 'Candle-Mine Version 2',
        description: 'Candle-pattern strategy that uses recent price action to identify and manage trading opportunities.',
        tab: 'CLASSICS',
        difficulty: 'Advanced',
    },
    {
        id: 'digit_eliminator',
        xml_file: 'digit_eliminator',
        name: 'Digit Eliminator',
        description: 'Classic digit strategy with elimination-based entries and configurable recovery controls.',
        tab: 'CLASSICS',
        difficulty: 'Intermediate',
    },
    {
        id: 'even_odd_combo',
        xml_file: 'even_odd_combo',
        name: 'Even Odd Combo',
        description: 'Classic combined Even/Odd strategy with automated trade entries and configurable stake management.',
        tab: 'CLASSICS',
        difficulty: 'Intermediate',
    },
    {
        id: 'only_ups_only_downs',
        xml_file: 'only_ups_only_downs',
        name: 'Only Ups, Only Downs',
        description: 'Classic Rise/Fall strategy focused on directional price movements with automated entries.',
        tab: 'CLASSICS',
        difficulty: 'Intermediate',
    },
    {
        id: 'over_1_auto',
        xml_file: 'over_1_auto',
        name: 'Over 1 Auto',
        description: 'Automated digit-over strategy configured to target results above 1 with risk controls.',
        tab: 'CLASSICS',
        difficulty: 'Beginner',
    },
    {
        id: 'over_dominator',
        xml_file: 'over_dominator',
        name: 'Over Dominator',
        description: 'Classic digit-over strategy with automated entry logic and configurable stake progression.',
        tab: 'CLASSICS',
        difficulty: 'Advanced',
    },
    {
        id: 'rise_and_fall_macd',
        xml_file: 'rise_and_fall_macd',
        name: 'Rise and Fall MACD',
        description: 'Rise/Fall strategy that uses MACD indicator conditions to guide market entries.',
        tab: 'CLASSICS',
        difficulty: 'Advanced',
    },
    {
        id: 'rise_and_fall_changer',
        xml_file: 'rise_and_fall_changer',
        name: 'Rise and Fall Changer',
        description: 'Adaptive Rise/Fall strategy that changes direction according to its configured market conditions.',
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
