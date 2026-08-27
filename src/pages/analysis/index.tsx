// @ts-nocheck — analysis page; store types have known upstream gaps
import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { TContractInfo } from '@/components/summary/summary-card.types';
import { transaction_elements } from '@/constants/transactions';
import { useStore } from '@/hooks/useStore';
import { Localize } from '@deriv-com/translations';
import './analysis.scss';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Extract the last digit (0-9) from a tick value like "12345.67" → 7 */
const getLastDigitFromTick = (tick: string | number | undefined): number | null => {
    if (tick === undefined || tick === null || tick === '') return null;
    const str = String(tick).trim();
    const digits = str.replace(/[^0-9]/g, '');
    if (!digits) return null;
    const d = parseInt(digits.slice(-1), 10);
    return isNaN(d) ? null : d;
};

/** Pull completed contracts out of the raw transactions array */
const getCompleted = (transactions: any[]): TContractInfo[] =>
    transactions
        .filter(t => t.type === transaction_elements.CONTRACT && typeof t.data === 'object')
        .map(t => t.data as TContractInfo)
        .filter(c => c.is_completed);

// ─── Digit Frequency Analyzer ────────────────────────────────────────────────

const DigitFrequency = observer(({ liveDigits }: { liveDigits: number[] }) => {
    const [manualInput, setManualInput] = useState('');
    const [manualDigits, setManualDigits] = useState<number[]>([]);
    const [mode, setMode] = useState<'live' | 'manual'>(liveDigits.length > 0 ? 'live' : 'manual');

    // Sync default mode when live data first arrives
    React.useEffect(() => {
        if (liveDigits.length > 0 && mode === 'manual' && manualDigits.length === 0) {
            setMode('live');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveDigits.length]);

    const digits = mode === 'live' ? liveDigits : manualDigits;

    const handleAdd = () => {
        const parsed = manualInput
            .split(/[\s,]+/)
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n >= 0 && n <= 9);
        if (parsed.length > 0) {
            setManualDigits(prev => [...prev, ...parsed]);
            setManualInput('');
        }
    };

    const counts: Record<number, number> = {};
    for (let i = 0; i <= 9; i++) counts[i] = 0;
    digits.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
    const max = Math.max(...Object.values(counts), 1);

    return (
        <div className='analysis__tool'>
            <div className='analysis__tool-header'>
                <div>
                    <h3 className='analysis__tool-title'>
                        <Localize i18n_default_text='Digit Frequency Analyzer' />
                    </h3>
                    <p className='analysis__tool-desc'>
                        {mode === 'live'
                            ? <Localize i18n_default_text='Showing exit-tick last digits from your bot&apos;s completed trades.' />
                            : <Localize i18n_default_text='Enter last-digit values (0–9) to see which digits appear most often.' />
                        }
                    </p>
                </div>
                <div className='analysis__mode-toggle'>
                    <button
                        className={`analysis__mode-btn${mode === 'live' ? ' analysis__mode-btn--active' : ''}`}
                        onClick={() => setMode('live')}
                        disabled={liveDigits.length === 0}
                        title={liveDigits.length === 0 ? 'Run a bot to get live digit data' : ''}
                    >
                        <span className={`analysis__live-dot${liveDigits.length > 0 ? ' analysis__live-dot--on' : ''}`} />
                        Live
                    </button>
                    <button
                        className={`analysis__mode-btn${mode === 'manual' ? ' analysis__mode-btn--active' : ''}`}
                        onClick={() => setMode('manual')}
                    >
                        Manual
                    </button>
                </div>
            </div>

            {mode === 'manual' && (
                <div className='analysis__input-row'>
                    <input
                        className='analysis__input'
                        type='text'
                        value={manualInput}
                        onChange={e => setManualInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        placeholder='e.g. 3, 7, 2, 5, 8'
                    />
                    <button className='analysis__btn' onClick={handleAdd}>
                        <Localize i18n_default_text='Add' />
                    </button>
                    <button
                        className='analysis__btn analysis__btn--secondary'
                        onClick={() => setManualDigits([])}
                    >
                        <Localize i18n_default_text='Clear' />
                    </button>
                </div>
            )}

            <p className='analysis__count-label'>
                <Localize i18n_default_text='Total samples: ' />{digits.length}
                {mode === 'live' && liveDigits.length > 0 && (
                    <span className='analysis__live-badge'>LIVE</span>
                )}
            </p>

            <div className='analysis__bar-chart'>
                {Array.from({ length: 10 }, (_, i) => {
                    const count = counts[i];
                    const pct = digits.length > 0 ? ((count / digits.length) * 100).toFixed(1) : '0.0';
                    const barH = max > 0 ? (count / max) * 100 : 0;
                    return (
                        <div key={i} className='analysis__bar-col'>
                            <span className='analysis__bar-pct'>{pct}%</span>
                            <div className='analysis__bar-wrap'>
                                <div className='analysis__bar' style={{ height: `${barH}%` }} />
                            </div>
                            <span className='analysis__bar-label'>{i}</span>
                            <span className='analysis__bar-count'>{count}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

// ─── Win / Loss Tracker ──────────────────────────────────────────────────────

type ManualTrade = {
    id: number;
    result: 'win' | 'loss';
    stake: number;
    payout: number;
    timestamp: string;
    source: 'manual';
};

const WinLossTracker = observer(({
    completedTrades,
    liveStats,
}: {
    completedTrades: TContractInfo[];
    liveStats: ReturnType<any>;
}) => {
    const [manualTrades, setManualTrades] = useState<ManualTrade[]>([]);
    const [stake, setStake] = useState('');
    const [payout, setPayout] = useState('');
    const [mode, setMode] = useState<'live' | 'manual'>(completedTrades.length > 0 ? 'live' : 'manual');
    const nextId = React.useRef(1);

    React.useEffect(() => {
        if (completedTrades.length > 0 && mode === 'manual' && manualTrades.length === 0) {
            setMode('live');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [completedTrades.length]);

    const addManual = (result: 'win' | 'loss') => {
        const s = parseFloat(stake) || 0;
        const p = parseFloat(payout) || 0;
        setManualTrades(prev => [
            { id: nextId.current++, result, stake: s, payout: p, timestamp: new Date().toLocaleTimeString(), source: 'manual' },
            ...prev,
        ]);
    };

    // ── aggregate stats ──
    const wins = mode === 'live' ? liveStats.won_contracts : manualTrades.filter(t => t.result === 'win').length;
    const losses = mode === 'live' ? liveStats.lost_contracts : manualTrades.filter(t => t.result === 'loss').length;
    const total = mode === 'live' ? liveStats.number_of_runs : manualTrades.length;
    const netPnL = mode === 'live' ? liveStats.total_profit : manualTrades.reduce((acc, t) => acc + (t.result === 'win' ? t.payout - t.stake : -t.stake), 0);
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';

    // ── recent trades list — computed directly so observer tracks splice updates ──
    const recentLive = completedTrades.slice(0, 20).map(c => ({
        id: c.contract_id,
        result: (Number(c.profit) > 0 ? 'win' : 'loss') as 'win' | 'loss',
        stake: Number(c.buy_price) || 0,
        payout: Number(c.payout) || Number((c as any).bid_price) || 0,
        profit: Number(c.profit) || 0,
        timestamp: typeof c.date_start === 'string' ? c.date_start.split(' ')[1] ?? '' : '',
        symbol: (c as any).display_name || c.underlying_symbol || '',
    }));

    return (
        <div className='analysis__tool'>
            <div className='analysis__tool-header'>
                <div>
                    <h3 className='analysis__tool-title'>
                        <Localize i18n_default_text='Win / Loss Tracker' />
                    </h3>
                    <p className='analysis__tool-desc'>
                        {mode === 'live'
                            ? <Localize i18n_default_text='Live results from your bot. Updates automatically as trades complete.' />
                            : <Localize i18n_default_text='Record each trade result to track your win rate and net profit/loss.' />
                        }
                    </p>
                </div>
                <div className='analysis__mode-toggle'>
                    <button
                        className={`analysis__mode-btn${mode === 'live' ? ' analysis__mode-btn--active' : ''}`}
                        onClick={() => setMode('live')}
                        disabled={completedTrades.length === 0}
                        title={completedTrades.length === 0 ? 'Run a bot to get live trade data' : ''}
                    >
                        <span className={`analysis__live-dot${completedTrades.length > 0 ? ' analysis__live-dot--on' : ''}`} />
                        Live
                    </button>
                    <button
                        className={`analysis__mode-btn${mode === 'manual' ? ' analysis__mode-btn--active' : ''}`}
                        onClick={() => setMode('manual')}
                    >
                        Manual
                    </button>
                </div>
            </div>

            {mode === 'manual' && (
                <div className='analysis__input-row'>
                    <input
                        className='analysis__input analysis__input--sm'
                        type='number' min='0' step='0.01'
                        value={stake} onChange={e => setStake(e.target.value)}
                        placeholder='Stake'
                    />
                    <input
                        className='analysis__input analysis__input--sm'
                        type='number' min='0' step='0.01'
                        value={payout} onChange={e => setPayout(e.target.value)}
                        placeholder='Payout (on win)'
                    />
                    <button className='analysis__btn analysis__btn--win' onClick={() => addManual('win')}>+ Win</button>
                    <button className='analysis__btn analysis__btn--loss' onClick={() => addManual('loss')}>+ Loss</button>
                    <button className='analysis__btn analysis__btn--secondary' onClick={() => setManualTrades([])}>
                        <Localize i18n_default_text='Clear' />
                    </button>
                </div>
            )}

            <div className='analysis__stats-row'>
                <div className='analysis__stat'>
                    <span className='analysis__stat-value'>
                        {total}
                        {mode === 'live' && completedTrades.length > 0 && (
                            <span className='analysis__live-badge analysis__live-badge--inline'>LIVE</span>
                        )}
                    </span>
                    <span className='analysis__stat-label'><Localize i18n_default_text='Total Trades' /></span>
                </div>
                <div className='analysis__stat'>
                    <span className='analysis__stat-value analysis__stat-value--win'>{wins}</span>
                    <span className='analysis__stat-label'><Localize i18n_default_text='Wins' /></span>
                </div>
                <div className='analysis__stat'>
                    <span className='analysis__stat-value analysis__stat-value--loss'>{losses}</span>
                    <span className='analysis__stat-label'><Localize i18n_default_text='Losses' /></span>
                </div>
                <div className='analysis__stat'>
                    <span className='analysis__stat-value'>{winRate}%</span>
                    <span className='analysis__stat-label'><Localize i18n_default_text='Win Rate' /></span>
                </div>
                <div className='analysis__stat'>
                    <span className={`analysis__stat-value ${netPnL >= 0 ? 'analysis__stat-value--win' : 'analysis__stat-value--loss'}`}>
                        {netPnL >= 0 ? '+' : ''}{netPnL.toFixed(2)}
                    </span>
                    <span className='analysis__stat-label'><Localize i18n_default_text='Net P&L' /></span>
                </div>
            </div>

            {/* Live trade history */}
            {mode === 'live' && recentLive.length > 0 && (
                <div className='analysis__history'>
                    <h4 className='analysis__history-title'><Localize i18n_default_text='Recent Bot Trades' /></h4>
                    <div className='analysis__history-list'>
                        {recentLive.map(t => (
                            <div key={t.id} className={`analysis__history-row analysis__history-row--${t.result}`}>
                                <span className='analysis__history-badge'>{t.result.toUpperCase()}</span>
                                {t.symbol && <span className='analysis__history-symbol'>{t.symbol}</span>}
                                <span>Stake: {t.stake.toFixed(2)}</span>
                                {t.result === 'win' && <span>Payout: {t.payout.toFixed(2)}</span>}
                                <span className={`analysis__history-profit ${t.profit >= 0 ? 'analysis__stat-value--win' : 'analysis__stat-value--loss'}`}>
                                    {t.profit >= 0 ? '+' : ''}{t.profit.toFixed(2)}
                                </span>
                                <span className='analysis__history-time'>{t.timestamp}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Manual trade history */}
            {mode === 'manual' && manualTrades.length > 0 && (
                <div className='analysis__history'>
                    <h4 className='analysis__history-title'><Localize i18n_default_text='Manual Trades' /></h4>
                    <div className='analysis__history-list'>
                        {manualTrades.slice(0, 20).map(t => (
                            <div key={t.id} className={`analysis__history-row analysis__history-row--${t.result}`}>
                                <span className='analysis__history-badge'>{t.result.toUpperCase()}</span>
                                <span>Stake: {t.stake.toFixed(2)}</span>
                                {t.result === 'win' && <span>Payout: {t.payout.toFixed(2)}</span>}
                                <span className='analysis__history-time'>{t.timestamp}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

// ─── Stake Calculator ────────────────────────────────────────────────────────

const StakeCalculator = () => {
    const [balance, setBalance] = useState('');
    const [riskPct, setRiskPct] = useState('2');
    const [multiplier, setMultiplier] = useState('2');
    const [steps, setSteps] = useState('5');

    const bal = parseFloat(balance) || 0;
    const risk = parseFloat(riskPct) || 0;
    const mult = parseFloat(multiplier) || 2;
    const numSteps = Math.min(Math.max(parseInt(steps, 10) || 5, 1), 15);
    const baseStake = bal * (risk / 100);

    const martingaleSteps = Array.from({ length: numSteps }, (_, i) => ({
        step: i + 1,
        stake: baseStake * Math.pow(mult, i),
    }));

    return (
        <div className='analysis__tool'>
            <h3 className='analysis__tool-title'>
                <Localize i18n_default_text='Stake Calculator' />
            </h3>
            <p className='analysis__tool-desc'>
                <Localize i18n_default_text='Calculate optimal stake sizes based on your balance and risk tolerance.' />
            </p>
            <div className='analysis__calc-grid'>
                <label className='analysis__label'>
                    <Localize i18n_default_text='Account Balance' />
                    <input className='analysis__input' type='number' min='0' step='0.01' value={balance} onChange={e => setBalance(e.target.value)} placeholder='e.g. 1000' />
                </label>
                <label className='analysis__label'>
                    <Localize i18n_default_text='Risk per trade (%)' />
                    <input className='analysis__input' type='number' min='0.1' max='100' step='0.1' value={riskPct} onChange={e => setRiskPct(e.target.value)} />
                </label>
                <label className='analysis__label'>
                    <Localize i18n_default_text='Martingale multiplier' />
                    <input className='analysis__input' type='number' min='1' step='0.1' value={multiplier} onChange={e => setMultiplier(e.target.value)} />
                </label>
                <label className='analysis__label'>
                    <Localize i18n_default_text='Steps to show' />
                    <input className='analysis__input' type='number' min='1' max='15' step='1' value={steps} onChange={e => setSteps(e.target.value)} />
                </label>
            </div>

            {bal > 0 && (
                <div className='analysis__calc-results'>
                    <p className='analysis__calc-base'>
                        <strong><Localize i18n_default_text='Base stake: ' /></strong>
                        {baseStake.toFixed(2)} ({risk}% of {bal.toFixed(2)})
                    </p>
                    <div className='analysis__steps'>
                        {martingaleSteps.map(({ step, stake }) => (
                            <div key={step} className='analysis__step-row'>
                                <span className='analysis__step-num'>Step {step}</span>
                                <div className='analysis__step-bar-wrap'>
                                    <div
                                        className='analysis__step-bar'
                                        style={{ width: `${Math.min((stake / (baseStake * Math.pow(mult, numSteps - 1))) * 100, 100)}%` }}
                                    />
                                </div>
                                <span className='analysis__step-val'>{stake.toFixed(2)}</span>
                                {stake > bal * 0.5 && <span className='analysis__step-warn'>⚠ &gt;50% balance</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Strategies ──────────────────────────────────────────────────────────────

type StrategyTab = 'over1' | 'over2' | 'under8' | 'under7' | 'even' | 'odd';

type StrategyTip = {
    title: string;
    body: string;
};

type StrategyData = {
    label: string;
    badge: string;
    badgeColor: string;
    intro: string;
    tips: StrategyTip[];
    risk: string;
    note: string;
};

const STRATEGY_DATA: Record<StrategyTab, StrategyData> = {
    over1: {
        label: 'Over 1',
        badge: '↑ > 1',
        badgeColor: '#10b981',
        intro:
            'The Over 1 contract wins when the last digit of the exit tick is 2, 3, 4, 5, 6, 7, 8, or 9 — giving you an 80% base win probability. It is one of the most conservative digit trades available.',
        tips: [
            {
                title: '1. Use it as a base recovery layer',
                body: 'Because the win rate is high (~80%), Over 1 is ideal as the first step in a recovery sequence. Start with a small stake and only escalate if you hit the rare losing streak. A 3-step recovery ladder (1×, 2×, 4×) covers up to 3 consecutive losses while staying well inside most balance limits.',
            },
            {
                title: '2. Avoid during high volatility spikes',
                body: 'Even with 80% odds, a volatile market can produce clusters of ticks ending in 0 or 1. Monitor the Digit Frequency Analyzer — if 0 and 1 have appeared more than 30% of the last 20 ticks combined, pause and wait for the distribution to normalise before entering.',
            },
            {
                title: '3. Set a strict stop-loss in units, not money',
                body: 'Define your stop-loss as a number of consecutive losses (e.g. 3) rather than a dollar amount. After 3 losses in a row, stop the bot and review the digit frequency before resuming. This prevents the martingale multiplier from compounding into an unrecoverable drawdown.',
            },
            {
                title: '4. Pair with a profit-lock target',
                body: 'Set a take-profit at 10–15% of your session balance. Once hit, stop the bot and bank the gains. The high frequency of small wins in Over 1 means targets are reached quickly; staying too long increases the chance of a bad cluster erasing the session profit.',
            },
            {
                title: '5. Best on low-volatility synthetic indices',
                body: 'Volatility 10 (V10) and Volatility 10(1s) tend to produce smoother digit distributions than V75 or V100. Over 1 performs most consistently on these lower-volatility instruments where extreme ticks are rare.',
            },
        ],
        risk: 'Low',
        note: 'Win probability is approximately 80%. Always verify digit distribution before entering.',
    },
    over2: {
        label: 'Over 2',
        badge: '↑ > 2',
        badgeColor: '#3b82f6',
        intro:
            'Over 2 wins when the last digit of the exit tick is 3 through 9 — a 70% base win probability. It offers a better payout than Over 1 while still sitting on the favourable side of the distribution.',
        tips: [
            {
                title: '1. Use a 2-step martingale maximum',
                body: 'With a 70% win rate, losing runs of 2 are common enough to plan for but runs of 4+ are rare. Cap your recovery multiplier at 2 steps (e.g. 1→2.5→6.25). Going deeper increases risk disproportionately; if you hit step 3 losses in a row, take the loss and reset to base stake.',
            },
            {
                title: '2. Exploit cold digits',
                body: 'Open the Digit Frequency Analyzer and look for digits 0, 1, or 2 that have appeared significantly more than the expected 10% each over the last 50 ticks. A "cold" run for those digits means the market has been unfavourable to you — but reversion is expected, making Over 2 entries more timely.',
            },
            {
                title: '3. Trade in short bursts of 10–20 contracts',
                body: 'Over 2 works best in short bursts rather than continuous running. Set the bot for 10–20 trades, evaluate the net result, then decide whether to continue. This limits exposure to any sustained adverse pattern while locking in gains from winning bursts.',
            },
            {
                title: '4. Scale stake to 1–2% of balance',
                body: 'The slightly lower win rate than Over 1 means your balance can dip faster on bad runs. Keep the base stake at 1–2% of your account balance. Use the Stake Calculator tab to compute the exact figure before starting any session.',
            },
            {
                title: '5. Cross-instrument confirmation',
                body: 'Before running Over 2 on one index, glance at the digit frequency on a related index. If V25 and V25(1s) both show digits 0–2 are hot, a broader pattern may be at play. Wait for one index to show a cleaner distribution before committing.',
            },
        ],
        risk: 'Low–Medium',
        note: 'Win probability is approximately 70%. Short sessions and strict stake sizing reduce variance significantly.',
    },
    under8: {
        label: 'Under 8',
        badge: '↓ < 8',
        badgeColor: '#f59e0b',
        intro:
            'Under 8 wins when the last digit of the exit tick is 0 through 7 — an 80% base win probability, mirroring Over 1 on the lower end of the scale. It is equally conservative and suits the same recovery-first approach.',
        tips: [
            {
                title: '1. Mirror your Over 1 settings',
                body: 'Under 8 and Over 1 are near-symmetric. If your Over 1 bot uses a 2% base stake and a 3-step recovery, apply the same parameters to Under 8. Running both simultaneously on different instruments can smooth out your overall P&L curve since adverse clusters rarely affect both at the same time.',
            },
            {
                title: '2. Watch for digit 8 and 9 hot streaks',
                body: 'Under 8 loses only on 8 or 9. Track their combined frequency in the Digit Frequency Analyzer. If 8+9 exceed 30% of the last 30 ticks, the current tick pattern is unfavourable — pause until their frequency drops back toward the expected 20%.',
            },
            {
                title: '3. Use as a hedge against Over strategies',
                body: 'Under 8 naturally hedges an Over 1 position on a different instrument. When your Over 1 bot is recovering from a loss sequence, an Under 8 bot on a second instrument provides concurrent wins that offset the recovery cost — reducing the effective drawdown on your combined balance.',
            },
            {
                title: '4. Set maximum consecutive loss alerts',
                body: 'Even at 80%, a run of 4 consecutive losses (probability ~0.16%) is possible in a long session. Configure your bot to stop and alert after 3 losses in a row. Manual review before resuming prevents compounding errors from runaway recovery multipliers.',
            },
            {
                title: '5. Prioritise 1-second tick indices for volume',
                body: 'Volatility 10(1s) and Volatility 25(1s) generate ticks every second. For Under 8, this means faster trade resolution and more opportunities per hour. Higher volume at low stake compounds profits more quickly than slow-tick instruments — but apply the same stop-loss rules.',
            },
        ],
        risk: 'Low',
        note: 'Win probability is approximately 80%. Symmetric to Over 1 — identical risk management rules apply.',
    },
    under7: {
        label: 'Under 7',
        badge: '↓ < 7',
        badgeColor: '#ec4899',
        intro:
            'Under 7 wins when the last digit of the exit tick is 0 through 6 — a 70% base win probability, symmetric with Over 2. It offers improved payouts versus Under 8 in exchange for a slightly higher loss frequency.',
        tips: [
            {
                title: '1. Combine with Over 2 for a balanced session',
                body: 'Running Under 7 and Over 2 concurrently on two different instruments at the same base stake creates a near-balanced book: both win on the majority of ticks while their losing digits (7–9 and 0–2 respectively) rarely cluster together across different instruments. Net drawdown is typically lower than running either alone.',
            },
            {
                title: '2. Use a digit-frequency entry filter',
                body: 'Before each Under 7 session, check the last 30 ticks. If digits 7, 8, or 9 have appeared more than 12 times combined (>40%), skip the session. Enter only when the high digits are at or below their expected 30% combined frequency, giving you a statistically cleaner starting point.',
            },
            {
                title: '3. Apply a flat-stake approach for longer sessions',
                body: 'Unlike martingale recovery, a flat-stake approach on Under 7 relies purely on the 70% win rate to generate profit over volume. Set stake to 0.5–1% of balance and run 50–100 trades without multiplier escalation. The positive expected value handles profitability; the lower stake handles variance.',
            },
            {
                title: '4. Monitor payout ratio before each run',
                body: 'Under 7 payouts vary by instrument and market conditions. Always verify the payout is high enough that expected value (0.7 × payout − 0.3 × stake) is positive before starting. If the payout drops below ~1.30× your stake, the edge disappears — switch instruments or wait.',
            },
            {
                title: '5. Avoid stacking with Under 8 on the same instrument',
                body: 'Running Under 7 and Under 8 on the same instrument at the same time doubles your exposure to the same digit distribution. If a cluster of high digits hits, both bots lose simultaneously, amplifying drawdown. Always run them on different instruments or at different times to maintain diversification.',
            },
        ],
        risk: 'Low–Medium',
        note: 'Win probability is approximately 70%. Symmetric to Over 2 — apply the same stake sizing discipline.',
    },
    even: {
        label: 'Even',
        badge: '≡ EVEN',
        badgeColor: '#8b5cf6',
        intro:
            'The Even contract wins when the last digit of the exit tick is 0, 2, 4, 6, or 8 — a theoretical 50% win probability. Because the payout is close to 2× stake, profitability over time is driven entirely by edge, discipline, and streak management rather than raw win rate.',
        tips: [
            {
                title: '1. Never run Even without a digit frequency check first',
                body: 'Even and Odd are pure 50/50 contracts with no structural edge — so timing matters more than with Over/Under strategies. Before every session, open the Digit Frequency Analyzer and look at the last 50 ticks. If even digits (0, 2, 4, 6, 8) account for more than 55% of recent ticks, the distribution is currently skewed in your favour. Enter only when even digits are at or above their expected 50% frequency.',
            },
            {
                title: '2. Use a strict 3-step D\'Alembert recovery, not martingale',
                body: 'Because Even is a 50/50 bet, martingale doubles your stake after every loss and can reach dangerous levels in just 5–6 bad ticks. The D\'Alembert system is safer: increase stake by one unit after a loss and decrease by one unit after a win. This flattens the recovery curve significantly and keeps your maximum exposure predictable even during extended losing streaks.',
            },
            {
                title: '3. Target small profit per session — stop at +5%',
                body: 'With a 50% win rate, profit only comes from disciplined target-setting, not volume. Set a session profit target of 5% of your balance and stop the bot the moment it is hit. Continuing past the target when running even-odds contracts statistically returns you to breakeven. Take the gain and re-enter fresh the next session.',
            },
            {
                title: '4. Alternate between Even and Odd based on recent history',
                body: 'Synthetic indices use a pseudorandom number generator that tends toward mean reversion in digit distribution. If the last 10 ticks produced 7 or more even digits, switch your next session to Odd instead of Even. This simple alternation exploits the reversion tendency without requiring any complex analysis — just count the last 10 ticks before each entry.',
            },
            {
                title: '5. Choose 1-second tick indices for maximum sample speed',
                body: 'On a 50/50 contract, your long-run expected profit depends on reaching a large number of trades quickly to let the law of large numbers work in your favour. Volatility 10(1s) and Volatility 25(1s) generate one tick per second, giving you 3× more trades per session than their standard counterparts. More trades means your profit target is hit faster and your stop-loss triggers earlier on bad sessions.',
            },
        ],
        risk: 'Medium',
        note: 'Win probability is exactly 50%. Edge comes from entry timing, session discipline, and recovery method — not from the contract itself.',
    },
    odd: {
        label: 'Odd',
        badge: '≢ ODD',
        badgeColor: '#f97316',
        intro:
            'The Odd contract wins when the last digit of the exit tick is 1, 3, 5, 7, or 9 — a theoretical 50% win probability, symmetric with Even. All Even strategies apply in mirror, with the entry filter flipped to favour odd digit frequency.',
        tips: [
            {
                title: '1. Enter when odd digits are running hot',
                body: 'Check the Digit Frequency Analyzer before every session. Count how many of the last 50 ticks ended in an odd digit (1, 3, 5, 7, 9). If odd digits account for 53% or more of the sample, the current distribution slightly favours you. Never enter Odd when the last 50 ticks show even digits dominating — wait for reversion or switch to Even instead.',
            },
            {
                title: '2. Keep base stake at 0.5% of balance — lower than Even',
                body: 'Odd and Even are functionally identical in probability, but experienced traders often find Odd generates slightly longer losing streaks in practice on low-volatility indices (because high even digits like 0 and 2 cluster more visibly). To account for this, keep your Odd base stake at 0.5% of balance — half what you might use for an Over 1 trade — and only scale up after 10 consecutive winning sessions.',
            },
            {
                title: '3. Use the streak rule: stop after 4 consecutive losses',
                body: 'On a 50/50 contract, 4 consecutive losses have roughly a 6.25% probability per 4-trade sequence — common enough to plan for. Set a hard rule: after 4 losses in a row with no wins, stop the bot completely regardless of your recovery position. Wait at least 10 minutes, re-check the digit frequency, and only re-enter if the distribution has moved back toward 50/50.',
            },
            {
                title: '4. Pair Odd on one instrument with Even on another',
                body: 'Running Odd on V10 and Even on V25 simultaneously creates a natural hedge. Because the two instruments use independent price feeds, a bad odd-digit cluster on V10 rarely coincides with a bad even-digit cluster on V25. Your combined win rate approaches 50% on each side, but the hedged position means your net drawdown on any given minute is typically half that of either standalone position.',
            },
            {
                title: '5. Flat stake beats martingale over 100+ trades',
                body: 'Backtesting on Deriv synthetic indices consistently shows that flat-stake Odd trading outperforms martingale Odd trading over sessions longer than 100 trades. Martingale amplifies both wins and losses but eventually requires one large bet that wipes out accumulated gains. Flat stake keeps every trade identical — letting the 50% win rate and favourable entry timing do the work gradually without catastrophic downside risk.',
            },
        ],
        risk: 'Medium',
        note: 'Win probability is exactly 50%. Mirror of Even — flip the entry filter to look for odd digit dominance in the last 50 ticks before entering.',
    },
};

const Strategies = () => {
    const [activeStrategy, setActiveStrategy] = useState<StrategyTab>('over1');
    const data = STRATEGY_DATA[activeStrategy];

    const strategyTabs: { id: StrategyTab; label: string }[] = [
        { id: 'over1', label: 'Over 1' },
        { id: 'over2', label: 'Over 2' },
        { id: 'under8', label: 'Under 8' },
        { id: 'under7', label: 'Under 7' },
        { id: 'even', label: 'Even' },
        { id: 'odd', label: 'Odd' },
    ];

    return (
        <div className='analysis__tool'>
            <h3 className='analysis__tool-title'>
                <Localize i18n_default_text='Strategies' />
            </h3>
            <p className='analysis__tool-desc'>
                <Localize i18n_default_text='Detailed trading strategies for each digit contract type. Select a category below to get started.' />
            </p>

            {/* Mini tab row */}
            <div className='analysis__strat-tabs'>
                {strategyTabs.map(t => (
                    <button
                        key={t.id}
                        className={`analysis__strat-tab${activeStrategy === t.id ? ' analysis__strat-tab--active' : ''}`}
                        style={activeStrategy === t.id ? { background: data.badgeColor, borderColor: data.badgeColor } : {}}
                        onClick={() => setActiveStrategy(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Strategy content */}
            <div className='analysis__strat-content'>
                <div className='analysis__strat-hero'>
                    <span className='analysis__strat-badge' style={{ background: data.badgeColor }}>
                        {data.badge}
                    </span>
                    <div>
                        <div className='analysis__strat-risk'>
                            Risk level: <strong>{data.risk}</strong>
                        </div>
                        <p className='analysis__strat-intro'>{data.intro}</p>
                    </div>
                </div>

                <div className='analysis__strat-tips'>
                    {data.tips.map((tip, idx) => (
                        <div key={idx} className='analysis__strat-tip'>
                            <div className='analysis__strat-tip-title'>{tip.title}</div>
                            <p className='analysis__strat-tip-body'>{tip.body}</p>
                        </div>
                    ))}
                </div>

                <div className='analysis__strat-note'>
                    <span className='analysis__strat-note-icon'>ℹ</span>
                    {data.note}
                </div>
            </div>
        </div>
    );
};

// ─── Main Analysis Page ──────────────────────────────────────────────────────

type ToolTab = 'digit' | 'tracker' | 'calc' | 'strategies';

const AnalysisTools = observer(() => {
    const [activeTab, setActiveTab] = useState<ToolTab>('digit');
    const store = useStore();
    const transactionsStore = store?.transactions;

    // Pull live data from the transactions store.
    // Computed directly (no useMemo) so MobX observer tracks every observable
    // access — including in-place splice updates — and re-renders on any change.
    const rawTransactions: any[] = transactionsStore?.transactions ?? [];
    const completedTrades = getCompleted(rawTransactions);
    const liveDigits = completedTrades
        .map(c => getLastDigitFromTick(c.exit_tick))
        .filter((d): d is number => d !== null);

    const liveStats = transactionsStore?.statistics ?? {
        won_contracts: 0,
        lost_contracts: 0,
        total_profit: 0,
        total_stake: 0,
        total_payout: 0,
        number_of_runs: 0,
    };

    const toolTabs: { id: ToolTab; label: string }[] = [
        { id: 'digit', label: 'Digit Frequency' },
        { id: 'tracker', label: 'Win/Loss Tracker' },
        { id: 'calc', label: 'Stake Calculator' },
        { id: 'strategies', label: 'Strategies' },
    ];

    const hasLiveData = completedTrades.length > 0;

    return (
        <div className='analysis'>
            <div className='analysis__header'>
                <div className='analysis__header-left'>
                    <h2 className='analysis__title'>
                        <Localize i18n_default_text='Risk Calculator' />
                    </h2>
                    <p className='analysis__subtitle'>
                        <Localize i18n_default_text='Study market patterns, track your performance, and plan your staking strategy.' />
                    </p>
                </div>
                {hasLiveData && (
                    <div className='analysis__live-status'>
                        <span className='analysis__live-dot analysis__live-dot--on' />
                        <span>{completedTrades.length} bot trade{completedTrades.length !== 1 ? 's' : ''} loaded</span>
                    </div>
                )}
            </div>

            <div className='analysis__tool-tabs'>
                {toolTabs.map(t => (
                    <button
                        key={t.id}
                        className={`analysis__tool-tab${activeTab === t.id ? ' analysis__tool-tab--active' : ''}`}
                        onClick={() => setActiveTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div className='analysis__content'>
                {activeTab === 'digit' && <DigitFrequency liveDigits={liveDigits} />}
                {activeTab === 'tracker' && <WinLossTracker completedTrades={completedTrades} liveStats={liveStats} />}
                {activeTab === 'calc' && <StakeCalculator />}
                {activeTab === 'strategies' && <Strategies />}
            </div>
        </div>
    );
});

export { Strategies };
export default AnalysisTools;
