import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { contract_stages } from '@/constants/contract-stage';
import {
    STRATEGY_DEFINITIONS,
    STRATEGY_ORDER,
    getStrategyEntryDigits,
    matchesStrategyEntrySequence,
    isWinningDigit,
    isCautionCluster,
    type StrategyId,
} from '@/constants/over-under-strategies';
import { localize } from '@deriv-com/translations';
import { botNotification } from '@/components/bot-notification/bot-notification';
import './over-under-engine.scss';

// ─── constants ────────────────────────────────────────────────────────────────

const OVER_BARRIER  = '5';
const UNDER_BARRIER = '4';
const MAX_DIGITS    = 30;
const DIGIT_WINDOW  = 1000;

/** Digits that act as entry triggers */
const ENTRY_DIGITS = new Set([4, 5]);

export interface Market { symbol: string; label: string; short: string; code: string; }

export const MARKETS: Market[] = [
    { symbol: '1HZ10V',  label: 'Volatility 10 (1s) Index',  short: 'V10 (1s)',  code: '10\n(1s)'  },
    { symbol: '1HZ15V',  label: 'Volatility 15 (1s) Index',  short: 'V15 (1s)',  code: '15\n(1s)'  },
    { symbol: '1HZ25V',  label: 'Volatility 25 (1s) Index',  short: 'V25 (1s)',  code: '25\n(1s)'  },
    { symbol: '1HZ30V',  label: 'Volatility 30 (1s) Index',  short: 'V30 (1s)',  code: '30\n(1s)'  },
    { symbol: '1HZ50V',  label: 'Volatility 50 (1s) Index',  short: 'V50 (1s)',  code: '50\n(1s)'  },
    { symbol: '1HZ75V',  label: 'Volatility 75 (1s) Index',  short: 'V75 (1s)',  code: '75\n(1s)'  },
    { symbol: '1HZ90V',  label: 'Volatility 90 (1s) Index',  short: 'V90 (1s)',  code: '90\n(1s)'  },
    { symbol: '1HZ100V', label: 'Volatility 100 (1s) Index', short: 'V100 (1s)', code: '100\n(1s)' },
    { symbol: 'R_10',    label: 'Volatility 10 Index',        short: 'V10',       code: '10'        },
    { symbol: 'R_25',    label: 'Volatility 25 Index',        short: 'V25',       code: '25'        },
    { symbol: 'R_50',    label: 'Volatility 50 Index',        short: 'V50',       code: '50'        },
    { symbol: 'R_75',    label: 'Volatility 75 Index',        short: 'V75',       code: '75'        },
    { symbol: 'R_100',   label: 'Volatility 100 Index',       short: 'V100',      code: '100'       },
    { symbol: 'JD10',    label: 'Jump 10 Index',              short: 'JD10',      code: 'JD10'      },
    { symbol: 'JD25',    label: 'Jump 25 Index',              short: 'JD25',      code: 'JD25'      },
    { symbol: 'JD50',    label: 'Jump 50 Index',              short: 'JD50',      code: 'JD50'      },
    { symbol: 'JD75',    label: 'Jump 75 Index',              short: 'JD75',      code: 'JD75'      },
    { symbol: 'JD100',   label: 'Jump 100 Index',             short: 'JD100',     code: 'JD100'     },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function getDecimalPlaces(pipSize: number): number {
    if (!Number.isFinite(pipSize) || pipSize <= 0) return 0;
    // api_base.pip_sizes stores the already-normalized decimal count
    // (for example 3 means three places), while some tick payloads expose
    // the increment itself (for example 0.001).
    if (Number.isInteger(pipSize) && pipSize >= 1) return pipSize;
    const asString = pipSize.toString();
    if (asString.includes('e-')) return Number(asString.split('e-')[1]);
    return asString.split('.')[1]?.length ?? 0;
}

function formatQuote(quote: number | string, pipSize?: number): string {
    const rawQuote = String(quote).trim();
    const value = Number(rawQuote);
    if (!Number.isFinite(value)) return rawQuote;

    const decimalPlaces = getDecimalPlaces(Number(pipSize));
    if (decimalPlaces === 0) return rawQuote;

    // Do not use toFixed here: it rounds a quote before the last digit is
    // read (for example 123.4567 would become 123.457). Deriv quotes already
    // carry the market precision; when a numeric quote has lost trailing
    // zeroes, pad them back without changing any supplied digits.
    const [integerPart, decimalPart = ''] = rawQuote.split('.');
    if (decimalPart.length >= decimalPlaces) return rawQuote;
    return `${integerPart}.${decimalPart.padEnd(decimalPlaces, '0')}`;
}

function getLastDigit(quote: number | string, pipSize?: number): number | null {
    const s = formatQuote(quote, pipSize);
    const lastChar = s[s.length - 1];
    const digit = Number(lastChar);
    return Number.isInteger(digit) && digit >= 0 && digit <= 9 ? digit : null;
}

function getApiData(message: any): any {
    // The Deriv API observable emits { data: response }; keeping the fallback
    // makes this component tolerant of the direct response shape used by mocks.
    return message?.data ?? message;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

// ─── types ────────────────────────────────────────────────────────────────────

interface EngineState {
    running:              boolean;
    baseStake:            number;
    martingale:           number;
    takeProfit:           number;
    stopLoss:             number;
    overStake:            number;
    underStake:           number;
    totalProfit:          number;
    overWins:             number;
    overLosses:           number;
    underWins:            number;
    underLosses:          number;
    overContractIds:      number[];
    underContractIds:     number[];
    overSettledIds:       number[];
    underSettledIds:      number[];
    overSettled:          boolean;
    underSettled:         boolean;
    overSubId:            string | null;
    underSubId:           string | null;
    tickSubId:            string | null;
    roundInFlight:        boolean;
    // entry-point
    useEntryMode:         boolean;
    waitingForEntry:      boolean;
    entryDigit:           number | null;
    // per-round profit tracking
    currentRoundOverStake:  number;
    currentRoundUnderStake: number;
    overRoundProfit:        number | null;
    underRoundProfit:       number | null;
    roundCounter:           number;
    // AI strategy engine
    strategyId:             StrategyId;
    consecutiveLosses:      number;
}

function makeInitState(
    stake: number,
    martingale: number,
    tp: number,
    sl: number,
    useEntry: boolean,
    strategyId: StrategyId = 'dual',
): EngineState {
    return {
        running: false,
        baseStake: stake,
        martingale,
        takeProfit: tp,
        stopLoss: sl,
        overStake: stake,
        underStake: stake,
        totalProfit: 0,
        overWins: 0,
        overLosses: 0,
        underWins: 0,
        underLosses: 0,
        overContractIds: [],
        underContractIds: [],
        overSettledIds: [],
        underSettledIds: [],
        overSettled: true,
        underSettled: true,
        overSubId: null,
        underSubId: null,
        tickSubId: null,
        roundInFlight: false,
        useEntryMode: useEntry,
        waitingForEntry: useEntry,
        entryDigit: null,
        currentRoundOverStake: stake,
        currentRoundUnderStake: stake,
        overRoundProfit: null,
        underRoundProfit: null,
        roundCounter: 0,
        strategyId,
        consecutiveLosses: 0,
    };
}

// ─── component ────────────────────────────────────────────────────────────────

const OverUnderEngine: React.FC = observer(() => {
    const { client, dashboard, transactions, run_panel, summary_card, ui } = useStore();

    // Config
    const [stake, setStake]           = useState('0.5');
    const [martingale]                = useState(2);
    const [takeProfit, setTakeProfit] = useState('5');
    const [stopLoss, setStopLoss]     = useState('5');
    const [bulkEnabled, setBulkEnabled] = useState(false);
    const [bulkCount, setBulkCount] = useState('3');
    const [symbol, setSymbol]         = useState('1HZ10V');
    const [marketOpen, setMarketOpen] = useState(false);
    const [entryMode, setEntryMode]   = useState(true);
    const [entryTriggerMode, setEntryTriggerMode] = useState<'single' | 'pair'>('pair');
    // AI strategy engine — 'dual' keeps the original Over 5 / Under 4 pair,
    // any other value runs a single-leg strategy using the recommendations
    // from the Strategy tab (entry filter, recovery method, stake sizing).
    const [strategyId, setStrategyId] = useState<StrategyId>('dual');
    const [strategyOpen, setStrategyOpen] = useState(false);
    const [singleWins, setSingleWins]     = useState(0);
    const [singleLosses, setSingleLosses] = useState(0);
    const [singleStake, setSingleStake]   = useState(0.5);
    const [lastSingleResult, setLastSingleResult] = useState<'won' | 'lost' | null>(null);
    const [lastSkipReason, setLastSkipReason] = useState<string | null>(null);

    // Display state
    const [isRunning, setIsRunning]                       = useState(false);
    const [statusMsg, setStatusMsg]                       = useState('Ready to trade');
    const [digits, setDigits]                             = useState<number[]>([]);
    const [digitWindow, setDigitWindow]                   = useState<number[]>([]);
    const [currentDigit, setCurrentDigit]                 = useState<number | null>(null);
    const [cursorTick, setCursorTick]                     = useState(0);
    const [prices, setPrices]                             = useState<string[]>([]);
    const [totalProfit, setTotalProfit]                   = useState(0);
    const [overWins, setOverWins]                         = useState(0);
    const [overLosses, setOverLosses]                     = useState(0);
    const [underWins, setUnderWins]                       = useState(0);
    const [underLosses, setUnderLosses]                   = useState(0);
    const [overCurrentStake, setOverCurrentStake]         = useState(0.5);
    const [underCurrentStake, setUnderCurrentStake]       = useState(0.5);
    const [lastOverResult, setLastOverResult]             = useState<'won' | 'lost' | null>(null);
    const [lastUnderResult, setLastUnderResult]           = useState<'won' | 'lost' | null>(null);
    const [isWaitingEntry, setIsWaitingEntry]             = useState(false);
    const [lastEntryDigit, setLastEntryDigit]             = useState<number | null>(null);

    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

    const stakeValue = Number(stake) || 0;
    const takeProfitValue = Number(takeProfit) || 0;
    const stopLossValue = Number(stopLoss) || 0;
    const eng              = useRef<EngineState>(makeInitState(stakeValue, martingale, takeProfitValue, stopLossValue, entryMode, strategyId));
    const msgSub           = useRef<{ unsubscribe: () => void } | null>(null);
    const passiveSub       = useRef<{ unsubscribe: () => void } | null>(null);
    const passiveTickId    = useRef<string | null>(null);
    // Track which api_base.api instance the passiveSub is using so we can
    // detect when api_base.init() replaces it with a new instance (reconnect,
    // account switch, window-focus reconnect) and restart the subscription.
    const passiveApiRef    = useRef<any>(null);
    // Set to true when stopPassiveSub is called before the subscription ID has
    // arrived — signals that the next resolved ID must be immediately forgotten.
    const pendingForget    = useRef<boolean>(false);
    const fireRoundRef     = useRef<() => void>(() => {});
    const symbolRef        = useRef(symbol);
    const entryTriggerModeRef = useRef(entryTriggerMode);
    const digitWindowRef   = useRef<number[]>([]);
    const subscriptionGenerationRef = useRef(0);
    const latestDigitRef   = useRef<number | null>(null);   // always the most recent tick digit
    const lastTickAtRef    = useRef(0);
    const marketTriggerRef = useRef<HTMLButtonElement>(null);
    const marketDropdownRef = useRef<HTMLDivElement>(null);
    useEffect(() => { symbolRef.current = symbol; }, [symbol]);
    useEffect(() => { entryTriggerModeRef.current = entryTriggerMode; }, [entryTriggerMode]);

    // Close dropdown on outside click — must exclude both the trigger and the portaled dropdown
    useEffect(() => {
        if (!marketOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            const inTrigger  = marketTriggerRef.current?.closest('.oue__market-selector')?.contains(target);
            const inDropdown = marketDropdownRef.current?.contains(target);
            if (!inTrigger && !inDropdown) setMarketOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [marketOpen]);

    const openMarket = useCallback(() => {
        if (isRunning) return;
        if (!marketOpen && marketTriggerRef.current) {
            const rect = marketTriggerRef.current.getBoundingClientRect();
            const DROPDOWN_W = 320; // min-width: 20rem ≈ 320px
            const MARGIN = 8;
            // Align right edge of dropdown with right edge of trigger, then clamp inside viewport
            let left = rect.right - DROPDOWN_W;
            left = Math.max(MARGIN, Math.min(left, window.innerWidth - DROPDOWN_W - MARGIN));
            setDropdownPos({ top: rect.bottom + 8, left });
        }
        setMarketOpen(o => !o);
    }, [isRunning, marketOpen]);

    // ── cleanup ───────────────────────────────────────────────────────────────

    const forgetId = useCallback((id: string | null) => {
        if (id && api_base.api) {
            try { (api_base.api as any).send({ forget: id }); } catch { /* ignore */ }
        }
    }, []);

    // ── passive tick subscription (always on when API ready) ─────────────────

    const stopPassiveSub = useCallback(() => {
        if (passiveTickId.current && api_base.api) {
            try { (api_base.api as any).send({ forget: passiveTickId.current }); } catch { /* ignore */ }
            passiveTickId.current = null;
        } else if (passiveSub.current) {
            // The subscription ID hasn't arrived yet — flag it so startPassiveSub
            // can forget the server-side subscription as soon as the ID resolves.
            pendingForget.current = true;
        }
        if (passiveSub.current) { passiveSub.current.unsubscribe(); passiveSub.current = null; }
    }, []);

    const cleanupSubs = useCallback(() => {
        const e = eng.current;
        forgetId(e.overSubId);
        forgetId(e.underSubId);
        e.overSubId  = null;
        e.underSubId = null;
        if (msgSub.current) { msgSub.current.unsubscribe(); msgSub.current = null; }
    }, [forgetId]);

    // ── stop ──────────────────────────────────────────────────────────────────

    const stopEngine = useCallback((reason: string) => {
        eng.current.running       = false;
        eng.current.roundInFlight = false;
        eng.current.waitingForEntry = false;
        cleanupSubs();
        setIsRunning(false);
        setIsWaitingEntry(false);
        setStatusMsg(reason);

        // Mirror run-panel stop: reset global running state and re-enable account switching
        run_panel.setIsRunning(false);
        run_panel.setContractStage(contract_stages.NOT_RUNNING);
        (ui as any)?.setAccountSwitcherDisabledMessage?.();
        (ui as any)?.setPromptHandler?.(false);
    }, [cleanupSubs, run_panel, ui]);

    // ── limits ────────────────────────────────────────────────────────────────

    const checkLimits = useCallback((): boolean => {
        const { totalProfit: profit, takeProfit: tp, stopLoss: sl } = eng.current;
        if (profit >= tp) {
            const amount = profit.toFixed(2);
            botNotification(`🎉 Take profit reached — congratulations! You won ${amount}`, undefined, {
                type: 'success',
                position: toast.POSITION.TOP_CENTER,
                autoClose: 8000,
                className: 'ai-bots-limit-notification',
            });
            stopEngine(`✅ Take Profit hit (+${amount})`);
            return true;
        }
        if (profit <= -sl) {
            const amount = Math.abs(profit).toFixed(2);
            botNotification(`🛑 Stop loss reached — the session ended at -${amount}`, undefined, {
                type: 'error',
                position: toast.POSITION.TOP_CENTER,
                autoClose: 8000,
                className: 'ai-bots-limit-notification',
            });
            stopEngine(`🛑 Stop Loss hit (${profit.toFixed(2)})`);
            return true;
        }
        return false;
    }, [stopEngine]);

    // ── fire a round ──────────────────────────────────────────────────────────

    const fireRound = useCallback(async () => {
        const e = eng.current;
        if (!e.running || e.roundInFlight) return;

        const selectedStrategy = e.strategyId === 'dual' ? null : STRATEGY_DEFINITIONS[e.strategyId];

        const bulkTrades = bulkEnabled ? Number(bulkCount) : 1;

        e.roundInFlight = true;
        e.overContractIds = [];
        e.underContractIds = [];
        e.overSettledIds = [];
        e.underSettledIds = [];
        e.overSettled   = false;
        e.underSettled  = selectedStrategy ? true : false;
        e.overRoundProfit  = null;
        e.underRoundProfit = null;
        e.currentRoundOverStake  = e.overStake;
        e.currentRoundUnderStake = e.underStake;

        setIsWaitingEntry(false);

        const currency = (api_base as any).account_info?.currency
            || (client as any).currency
            || 'USD';

        const makeBuy = (contract_type: string, barrier: string | null, amount: number) => ({
            buy: '1',
            price: amount,
            parameters: {
                amount,
                basis: 'stake',
                contract_type,
                currency,
                duration: 1,
                duration_unit: 't',
                ...(barrier ? { barrier } : {}),
                underlying_symbol: symbolRef.current,
            },
        });

        const entryLabel = e.entryDigit !== null ? ` [entry: ${e.entryDigit}]` : '';
        const promptLabel = selectedStrategy
            ? `${selectedStrategy.label} strategy`
            : 'Over 5 + Under 4';
        setStatusMsg(`⚡ Placing ${promptLabel}${entryLabel}…`);

        try {
            const api = api_base.api as any;
            if (selectedStrategy) {
                const tradeAmount = Math.max(0.05, stakeValue || 0.05);
                const buyRequests = Array.from({ length: bulkTrades }, () => makeBuy(selectedStrategy.contractType ?? 'DIGITOVER', selectedStrategy.barrier, tradeAmount));
                const buyResponses = await Promise.all(buyRequests.map(request => api.send(request)));
                const contractIds = buyResponses
                    .map((response: any) => response?.buy?.contract_id ?? null)
                    .filter((id: number | null): id is number => id !== null);

                e.overContractIds = contractIds;
                e.overSettled = contractIds.length === 0;

                const recordPendingBuy = (response: any, contract_type: string, barrier: string | null, amount: number) => {
                    const buy = response?.buy;
                    if (!buy?.contract_id) return;
                    transactions.onBotContractEvent({
                        ...buy,
                        contract_id: buy.contract_id,
                        contract_type,
                        barrier: barrier ?? '',
                        underlying_symbol: symbolRef.current,
                        currency: buy.currency ?? currency,
                        buy_price: buy.buy_price ?? amount,
                        date_start: buy.date_start ?? buy.purchase_time ?? Math.floor(Date.now() / 1000),
                        status: 'open',
                        profit: 0,
                        transaction_ids: {
                            ...(buy.transaction_ids ?? {}),
                            buy: buy.transaction_id ?? buy.transaction_ids?.buy ?? buy.contract_id,
                        },
                    } as any);
                };

                buyResponses.forEach((response: any) => recordPendingBuy(response, selectedStrategy.contractType ?? 'DIGITOVER', selectedStrategy.barrier, tradeAmount));

                if (contractIds.length > 0) {
                    const subscriptionResults = await Promise.all(contractIds.map(contractId => api.send({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 })));
                    e.overSubId = subscriptionResults[0]?.subscription?.id ?? null;
                }
                setStatusMsg(`${selectedStrategy.label} bot is running — waiting for ${bulkTrades} trade${bulkTrades > 1 ? 's' : ''} to settle…`);
                return;
            }

            const overRequestList = Array.from({ length: bulkTrades }, () => makeBuy('DIGITOVER', OVER_BARRIER, e.overStake));
            const underRequestList = Array.from({ length: bulkTrades }, () => makeBuy('DIGITUNDER', UNDER_BARRIER, e.underStake));
            const [overResults, underResults] = await Promise.all([
                Promise.all(overRequestList.map(request => api.send(request))),
                Promise.all(underRequestList.map(request => api.send(request))),
            ]);

            const overIds = overResults
                .map((response: any) => response?.buy?.contract_id ?? null)
                .filter((id: number | null): id is number => id !== null);
            const underIds = underResults
                .map((response: any) => response?.buy?.contract_id ?? null)
                .filter((id: number | null): id is number => id !== null);

            e.overContractIds = overIds;
            e.underContractIds = underIds;
            e.overSettled = overIds.length === 0;
            e.underSettled = underIds.length === 0;

            const recordPendingBuy = (response: any, contract_type: string, barrier: string, amount: number) => {
                const buy = response?.buy;
                if (!buy?.contract_id) return;

                transactions.onBotContractEvent({
                    ...buy,
                    contract_id: buy.contract_id,
                    contract_type,
                    barrier,
                    underlying_symbol: symbolRef.current,
                    currency: buy.currency ?? currency,
                    buy_price: buy.buy_price ?? amount,
                    date_start: buy.date_start ?? buy.purchase_time ?? Math.floor(Date.now() / 1000),
                    status: 'open',
                    profit: 0,
                    transaction_ids: {
                        ...(buy.transaction_ids ?? {}),
                        buy: buy.transaction_id ?? buy.transaction_ids?.buy ?? buy.contract_id,
                    },
                } as any);
            };

            overResults.forEach((response: any) => recordPendingBuy(response, 'DIGITOVER', OVER_BARRIER, e.currentRoundOverStake));
            underResults.forEach((response: any) => recordPendingBuy(response, 'DIGITUNDER', UNDER_BARRIER, e.currentRoundUnderStake));

            if (overIds.length > 0) {
                const r = await Promise.all(overIds.map(contractId => api.send({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 })));
                e.overSubId = r[0]?.subscription?.id ?? null;
            }
            if (underIds.length > 0) {
                const r = await Promise.all(underIds.map(contractId => api.send({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 })));
                e.underSubId = r[0]?.subscription?.id ?? null;
            }

            setStatusMsg(`Running — waiting for ${bulkTrades} bulk trade${bulkTrades > 1 ? 's' : ''} to settle…`);
        } catch (err: any) {
            const msg = err?.error?.message || err?.message || 'Buy failed';
            e.overSettled  = true;
            e.underSettled = true;
            e.roundInFlight = false;
            setStatusMsg(`⚠ ${msg}`);
            setTimeout(() => { if (eng.current.running) fireRound(); }, 1500);
        }
    }, [client, stakeValue, bulkEnabled, bulkCount]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep fireRoundRef in sync so passiveSub's closure always calls the latest version
    useEffect(() => { fireRoundRef.current = fireRound; }, [fireRound]);

    const selectStrategy = useCallback((nextStrategy: StrategyId) => {
        setStrategyId(nextStrategy);
        const e = eng.current;
        e.strategyId = nextStrategy;
        e.entryDigit = null;
        setLastEntryDigit(null);
        if (e.running) {
            e.waitingForEntry = e.useEntryMode;
            setIsWaitingEntry(e.useEntryMode);
            setLastSkipReason(null);
            setStatusMsg(
                e.useEntryMode
                    ? `👀 Switched to ${nextStrategy === 'dual' ? 'Dual Over 5 / Under 4' : STRATEGY_DEFINITIONS[nextStrategy].label} — waiting for a fresh entry trigger…`
                    : `⚡ Switched to ${nextStrategy === 'dual' ? 'Dual Over 5 / Under 4' : STRATEGY_DEFINITIONS[nextStrategy].label}`
            );
        }
    }, []);

    // ── settle ────────────────────────────────────────────────────────────────

    const onSettled = useCallback((contractId: number, won: boolean, profit: number) => {
        const e = eng.current;
        const isOver  = e.overContractIds.includes(contractId);
        const isUnder = e.underContractIds.includes(contractId);
        if (!isOver && !isUnder) return;

        if (isOver && e.overSettledIds.includes(contractId)) return;
        if (isUnder && e.underSettledIds.includes(contractId)) return;

        e.totalProfit = round2(e.totalProfit + profit);
        setTotalProfit(e.totalProfit);

        if (isOver) {
            e.overSettledIds = [...e.overSettledIds, contractId];
            e.overRoundProfit = (e.overRoundProfit ?? 0) + profit;
            if (won) { e.overWins++;   e.overStake = e.baseStake;                setLastOverResult('won'); }
            else     { e.overLosses++; e.overStake = round2(e.overStake * e.martingale); setLastOverResult('lost'); }
            setOverWins(e.overWins);
            setOverLosses(e.overLosses);
            setOverCurrentStake(e.overStake);
            if (e.overContractIds.length > 0 && e.overContractIds.every(id => e.overSettledIds.includes(id))) {
                e.overSettled = true;
            }
        }

        if (isUnder) {
            e.underSettledIds = [...e.underSettledIds, contractId];
            e.underRoundProfit = (e.underRoundProfit ?? 0) + profit;
            if (won) { e.underWins++;   e.underStake = e.baseStake;                   setLastUnderResult('won'); }
            else     { e.underLosses++; e.underStake = round2(e.underStake * e.martingale); setLastUnderResult('lost'); }
            setUnderWins(e.underWins);
            setUnderLosses(e.underLosses);
            setUnderCurrentStake(e.underStake);
            if (e.underContractIds.length > 0 && e.underContractIds.every(id => e.underSettledIds.includes(id))) {
                e.underSettled = true;
            }
        }

        if (e.strategyId !== 'dual') {
            const singleWon = won;
            const nextSingleStake = e.currentRoundOverStake || stakeValue;
            setSingleStake(nextSingleStake);
            if (singleWon) {
                setSingleWins(prev => prev + 1);
                setLastSingleResult('won');
            } else {
                setSingleLosses(prev => prev + 1);
                setLastSingleResult('lost');
            }
        }

        if (e.overSettled && e.underSettled) {
            e.roundCounter++;
            const overP   = e.overRoundProfit  ?? 0;
            const underP  = e.underRoundProfit ?? 0;
            const roundPnl = round2(overP + underP);

            e.roundInFlight = false;
            e.entryDigit    = null;

            if (checkLimits() || !e.running) return;

            if (e.useEntryMode) {
                e.waitingForEntry = true;
                setIsWaitingEntry(true);
                setStatusMsg('Round complete — waiting for the next entry condition…');
            } else {
                const sign = roundPnl >= 0 ? '+' : '';
                setStatusMsg(`✅ Round complete — P&L: ${sign}${roundPnl.toFixed(2)} | Total: ${sign}${e.totalProfit.toFixed(2)}`);
                setTimeout(() => { if (eng.current.running) fireRoundRef.current(); }, 1500);
            }
        }
    }, [checkLimits, stakeValue]);

    // ── passive subscription: stream ticks as soon as a market is chosen ─────

    const startPassiveSub = useCallback(async (sym: string, resetHistory = true) => {
        if (!api_base.api) return;
        const generation = ++subscriptionGenerationRef.current;
        pendingForget.current = false; // reset before stopping so stopPassiveSub can set it fresh
        stopPassiveSub();
        if (resetHistory) {
            setDigits([]);
            setDigitWindow([]);
            setCurrentDigit(null);
            setPrices([]);
        }
        // Record which API instance this subscription is for so the health-check
        // effect can detect when api_base.init() replaces it with a new instance.
        passiveApiRef.current = api_base.api;

        if (resetHistory) {
            let historyResponse: any;
            try {
                historyResponse = await (api_base.api as any).send({
                    ticks_history: sym,
                    count: DIGIT_WINDOW,
                    end: 'latest',
                    style: 'ticks',
                });
            } catch {
                setStatusMsg('⚠ Unable to load live tick history');
                return;
            }
            const history = historyResponse?.history;
            const pricesFromHistory = Array.isArray(history?.prices) ? history.prices : [];
            const historyPipSize = Number(
                historyResponse?.pip_size ?? history?.pip_size ?? (api_base.api as any).pip_sizes?.[sym]
            );
            const historyQuotes = pricesFromHistory
                .map((quote: number | string) => formatQuote(quote, historyPipSize));
            const historyDigits = historyQuotes
                .map((quote: string) => getLastDigit(quote, historyPipSize))
                .filter((digit: number | null): digit is number => digit !== null);
            const latestHistoryQuote = historyQuotes[historyQuotes.length - 1];
            const latestHistoryDigit = historyDigits[historyDigits.length - 1];
            if (generation !== subscriptionGenerationRef.current || symbolRef.current !== sym) return;
            const nextWindow = historyDigits.slice(-DIGIT_WINDOW);
            digitWindowRef.current = nextWindow;
            setDigitWindow(nextWindow);
            setDigits(historyDigits.slice(-MAX_DIGITS));
            setPrices(historyQuotes.slice(-MAX_DIGITS));
            if (latestHistoryQuote !== undefined) {
                setCurrentDigit(latestHistoryDigit ?? null);
                latestDigitRef.current = latestHistoryDigit ?? null;
                lastTickAtRef.current = Date.now();
            }
        }

        passiveSub.current = (api_base.api as any).onMessage().subscribe((msg: any) => {
            const data = getApiData(msg);
            const tick = data?.msg_type === 'tick' ? data.tick : data?.tick;
            if (tick?.quote !== undefined && symbolRef.current === sym && (!tick.symbol || tick.symbol === sym)) {
                // Numeric quotes can lose trailing zeroes (for example 123.450),
                // so use Deriv's pip size before reading the final digit.
                const pipSize = Number(tick.pip_size ?? (api_base as any).pip_sizes?.[sym]);
                const priceStr = formatQuote(tick.quote, pipSize);
                const d        = getLastDigit(priceStr);
                if (d === null) return;
                latestDigitRef.current = d;
                lastTickAtRef.current = Date.now();
                setCurrentDigit(d);
                setCursorTick(prev => prev + 1);
                setDigits(prev  => {
                    const n = [...prev, d];
                    const next = n.length > MAX_DIGITS ? n.slice(-MAX_DIGITS) : n;
                    return next;
                });
                setDigitWindow(prev => {
                    const next = [...prev, d];
                    const bounded = next.length > DIGIT_WINDOW ? next.slice(-DIGIT_WINDOW) : next;
                    digitWindowRef.current = bounded;
                    return bounded;
                });
                setPrices(prev  => { const n = [...prev,  priceStr]; return n.length > MAX_DIGITS ? n.slice(-MAX_DIGITS) : n; });

                // Entry-point trigger (only active while engine is running)
                const e = eng.current;
                if (e.running && e.useEntryMode && e.waitingForEntry && !e.roundInFlight) {
                    const selectedStrategy = e.strategyId === 'dual' ? null : STRATEGY_DEFINITIONS[e.strategyId];
                    // Include the current tick and read from a ref so this
                    // long-lived subscription never evaluates a stale window.
                    const nextWindow = [...digitWindowRef.current, d].slice(-DIGIT_WINDOW);
                    digitWindowRef.current = nextWindow;
                    const recentDigits = nextWindow.slice(-6);
                    const hasDualEntryPair =
                        recentDigits.length >= 2 &&
                        ((recentDigits[recentDigits.length - 2] === 4 && recentDigits[recentDigits.length - 1] === 5) ||
                            (recentDigits[recentDigits.length - 2] === 5 && recentDigits[recentDigits.length - 1] === 4));
                    const useDualPairTrigger = !selectedStrategy && entryTriggerModeRef.current === 'pair';

                    if (selectedStrategy) {
                        const strategyEntryDigits = getStrategyEntryDigits(e.strategyId);
                        if (isCautionCluster(selectedStrategy, recentDigits)) {
                            setLastSkipReason(`Skipped ${selectedStrategy.label}: caution cluster detected (${selectedStrategy.cautionDigits.join(', ')})`);
                            setIsWaitingEntry(true);
                            return;
                        }

                        const sequenceMatched = matchesStrategyEntrySequence(e.strategyId, recentDigits);
                        const shouldTrigger = e.strategyId === 'over1' || e.strategyId === 'over2' || e.strategyId === 'under8' || e.strategyId === 'under7' || e.strategyId === 'even' || e.strategyId === 'odd'
                            ? sequenceMatched
                            : strategyEntryDigits.includes(d);

                        if (shouldTrigger) {
                            e.waitingForEntry = false;
                            e.entryDigit      = d;
                            setLastEntryDigit(d);
                            setLastSkipReason(null);
                            setIsWaitingEntry(false);
                            fireRoundRef.current();
                        } else {
                            setLastSkipReason(
                                e.strategyId === 'over1'
                                    ? `Waiting for Over 1 entry sequence: 1 → 3, 4, 5, or 6 — got ${d}`
                                    : e.strategyId === 'over2'
                                        ? `Waiting for Over 2 entry sequence: 0, 1, or 2 → 3, 4, 5, or 6 — got ${d}`
                                        : e.strategyId === 'under8'
                                            ? `Waiting for Under 8 entry sequence: 8 → 5, 6, 7, 8, or 9 — got ${d}`
                                            : e.strategyId === 'under7'
                                                ? `Waiting for Under 7 entry sequence: 7, 8, or 9 → 3, 6, 7, 8, or 9 — got ${d}`
                                                            : e.strategyId === 'even'
                                                                ? `Waiting for Even entry sequence: odd, odd, odd, skip, even — got ${d}`
                                                                : e.strategyId === 'odd'
                                                                    ? `Waiting for Odd entry sequence: even, even, even, skip, odd — got ${d}`
                                                                    : `Waiting for ${selectedStrategy.label} entry trigger — got ${d}`
                            );
                        }
                        return;
                    }

                    if (useDualPairTrigger ? hasDualEntryPair : ENTRY_DIGITS.has(d)) {
                        e.waitingForEntry = false;
                        e.entryDigit      = d;
                        setLastEntryDigit(d);
                        setLastSkipReason(null);
                        setIsWaitingEntry(false);
                        fireRoundRef.current();
                        return;
                    }

                    if (ENTRY_DIGITS.has(d)) {
                        setLastSkipReason(
                            useDualPairTrigger
                                ? 'Waiting for the 4/5 pair to confirm the dual Over 5 / Under 4 entry.'
                                : 'Waiting for the next 4 or 5 trigger for the dual Over 5 / Under 4 entry.'
                        );
                    }
                }
            }
        });

        try {
            const r = await (api_base.api as any).send({ ticks: sym, subscribe: 1 });
            const subId = r?.subscription?.id ?? null;
            if (pendingForget.current) {
                // stopPassiveSub was called while we were waiting for this ID —
                // the Rx subscription is already gone, but the server-side
                // subscription is still live. Forget it immediately so we don't
                // accumulate duplicate server subscriptions.
                pendingForget.current = false;
                if (subId && api_base.api) {
                    try { (api_base.api as any).send({ forget: subId }); } catch { /* ignore */ }
                }
            } else {
                passiveTickId.current = subId;
            }
        } catch {
            // Do not leave a dead Rx subscription behind; the readiness poll
            // below can retry once the API connection is available.
            if (passiveSub.current) {
                passiveSub.current.unsubscribe();
                passiveSub.current = null;
            }
        }
    }, [stopPassiveSub]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── start ─────────────────────────────────────────────────────────────────

    const startEngine = useCallback(async () => {
        if (eng.current.running) return;
        if (bulkEnabled && (!/^\d+$/.test(bulkCount) || Number(bulkCount) < 1)) {
            setStatusMsg('⚠ Enter a whole number of bulk purchases before starting');
            return;
        }
        if (!api_base.api) { setStatusMsg('⚠ Not connected — please log in first'); return; }

        const resolvedStrategy = strategyId === 'dual' ? null : STRATEGY_DEFINITIONS[strategyId];
        const strategyTakeProfit = resolvedStrategy ? resolvedStrategy.takeProfit : takeProfitValue;
        const strategyStopLoss = resolvedStrategy ? resolvedStrategy.stopLoss : stopLossValue;
        eng.current = makeInitState(stakeValue, martingale, strategyTakeProfit, strategyStopLoss, entryMode, strategyId);
        eng.current.running = true;
        if (resolvedStrategy) {
            eng.current.baseStake = stakeValue;
            eng.current.overStake = stakeValue;
            eng.current.underStake = stakeValue;
            setSingleStake(stakeValue);
            setSingleWins(0);
            setSingleLosses(0);
            setLastSingleResult(null);
            setLastSkipReason(null);
        }

        setIsRunning(true);
        setTotalProfit(0);
        setOverWins(0); setOverLosses(0);
        setUnderWins(0); setUnderLosses(0);
        setOverCurrentStake(stakeValue);
        setUnderCurrentStake(stakeValue);
        setLastOverResult(null);
        setLastUnderResult(null);
        setLastEntryDigit(null);
        setIsWaitingEntry(entryMode);
        const statusStart = resolvedStrategy
            ? (strategyId === 'over1'
                ? '👀 Watching for Over 1 sequence: 1 → 3, 4, 5, or 6…'
                : strategyId === 'over2'
                    ? '👀 Watching for Over 2 sequence: 0, 1, or 2 → 3, 4, 5, or 6…'
                    : strategyId === 'under8'
                        ? '👀 Watching for Under 8 sequence: 8 → 5, 6, 7, 8, or 9…'
                        : strategyId === 'under7'
                            ? '👀 Watching for Under 7 sequence: 7, 8, or 9 → 3, 6, 7, 8, or 9…'
                                : strategyId === 'even'
                                    ? '👀 Watching for Even sequence: odd, odd, odd, skip, even…'
                                    : strategyId === 'odd'
                                        ? '👀 Watching for Odd sequence: even, even, even, skip, odd…'
                                        : `👀 Watching for ${resolvedStrategy.label} trigger ${getStrategyEntryDigits(strategyId).join(', ')}…`)
            : entryMode
                ? (entryTriggerMode === 'pair' ? '👀 Waiting for 4/5 pair to confirm entry…' : '👀 Waiting for a 4 or 5 trigger…')
                : 'Connecting…';
        setStatusMsg(statusStart);

        // Mirror run-panel start: activate global running state, open drawer, disable account switching
        run_panel.run_id = `run-${Date.now()}`;
        summary_card.clear();
        run_panel.setIsRunning(true);
        run_panel.setContractStage(contract_stages.STARTING);
        run_panel.toggleDrawer(true);
        (ui as any)?.setAccountSwitcherDisabledMessage?.(
            localize('Account switching is disabled while your bot is running. Please stop your bot before switching accounts.')
        );
        (ui as any)?.setPromptHandler?.(true);

        // Keep the existing passive tick history while ensuring the selected
        // market subscription is live for the engine.
        await startPassiveSub(symbolRef.current, false);

        // msgSub handles contract results only — ticks are in passiveSub
        if (msgSub.current) msgSub.current.unsubscribe();
        msgSub.current = (api_base.api as any).onMessage().subscribe((msg: any) => {
            const data = getApiData(msg);
            if (data?.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
                const poc = data.proposal_open_contract;
                if (poc.status === 'won' || poc.status === 'lost') {
                    // Push settled contract into the shared Transactions widget
                    transactions.onBotContractEvent(poc);
                    onSettled(poc.contract_id, poc.status === 'won', parseFloat(poc.profit ?? '0'));
                }
            }
        });

        try {
            if (!entryMode) {
                setStatusMsg('Connected — firing first round…');
                await fireRound();
            } else if (digitWindowRef.current.length > 0) {
                // Evaluate loaded history immediately when entry mode starts,
                // so a ready condition is not missed until the next tick.
                const activeStrategyId = eng.current.strategyId;
                const selectedStrategy = activeStrategyId === 'dual' ? null : STRATEGY_DEFINITIONS[activeStrategyId];
                const recentDigits = digitWindowRef.current.slice(-6);
                const latestDigit = recentDigits[recentDigits.length - 1];
                const hasDualEntryPair =
                    recentDigits.length >= 2 &&
                    ((recentDigits[recentDigits.length - 2] === 4 && latestDigit === 5) ||
                        (recentDigits[recentDigits.length - 2] === 5 && latestDigit === 4));
                const shouldTrigger = selectedStrategy
                    ? !isCautionCluster(selectedStrategy, recentDigits) &&
                        (['over1', 'over2', 'under8', 'under7', 'even', 'odd'].includes(activeStrategyId)
                            ? matchesStrategyEntrySequence(activeStrategyId, recentDigits)
                            : getStrategyEntryDigits(activeStrategyId).includes(latestDigit))
                    : entryTriggerModeRef.current === 'pair'
                        ? hasDualEntryPair
                        : ENTRY_DIGITS.has(latestDigit);

                if (shouldTrigger && latestDigit !== undefined) {
                    eng.current.waitingForEntry = false;
                    eng.current.entryDigit = latestDigit;
                    setLastEntryDigit(latestDigit);
                    setLastSkipReason(null);
                    setIsWaitingEntry(false);
                    setStatusMsg('Entry condition ready — firing round…');
                    await fireRound();
                }
            }
        } catch (err: any) {
            stopEngine(`⚠ ${err?.error?.message || err?.message || 'Failed to start'}`);
        }
    }, [stakeValue, martingale, takeProfitValue, stopLossValue, entryMode, entryTriggerMode, strategyId, bulkEnabled, bulkCount, fireRound, onSettled, startPassiveSub, stopEngine, transactions, run_panel, summary_card, ui]);

    // Start passive ticks whenever the selected symbol changes (or on first
    // mount). The engine can render before authentication finishes, so retry
    // until api_base has a live API instead of permanently showing an empty
    // digit strip.
    useEffect(() => {
        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const ensureSubscription = () => {
            if (cancelled) return;
            if (!api_base.api) {
                retryTimer = setTimeout(ensureSubscription, 500);
                return;
            }
            // Always restart when `symbol` changes. The previous subscription
            // can still be active, so checking passiveSub.current here would
            // leave the old market streaming after a selection change.
            startPassiveSub(symbol);
        };

        ensureSubscription();
        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [symbol, startPassiveSub]);

    // Health-check: restart the passive subscription whenever api_base.api is
    // replaced by a new instance (happens on reconnect, account switch, or the
    // window-focus reconnect triggered by reconnectIfNotConnected). The
    // ensureSubscription effect above only catches the initial mount / symbol
    // change; it cannot detect a mid-session API instance swap because
    // passiveSub.current is still non-null (pointing to the old instance).
    useEffect(() => {
        const checkHealth = () => {
            const apiChanged = api_base.api && passiveApiRef.current !== api_base.api;
            if ((apiChanged || !passiveSub.current) && api_base.api) {
                startPassiveSub(symbolRef.current);
            }
        };

        // Poll every 3 s — cheap enough and fast enough to recover within a
        // few seconds after a reconnect.
        const interval = setInterval(checkHealth, 3000);
        // Also fire immediately on window focus: that is exactly when
        // api_base.reconnectIfNotConnected() runs and may swap the instance.
        window.addEventListener('focus', checkHealth);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', checkHealth);
        };
    }, [startPassiveSub]);

    // Recover a stalled stream as well as a disconnected stream. The API
    // object can remain present while a server-side subscription has stopped.
    useEffect(() => {
        const interval = setInterval(() => {
            if (api_base.api && passiveSub.current && lastTickAtRef.current > 0 &&
                Date.now() - lastTickAtRef.current > 7000) {
                startPassiveSub(symbolRef.current, false);
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [startPassiveSub]);

    // Teardown on unmount — kill everything including the passive subscription
    useEffect(() => () => {
        eng.current.running = false;
        cleanupSubs();
        stopPassiveSub();
    }, [cleanupSubs, stopPassiveSub]);

    // ── render ────────────────────────────────────────────────────────────────

    const currency    = (client as any)?.currency || 'USD';
    const totalRounds = Math.max(overWins + overLosses, underWins + underLosses);
    const latestPrice = prices.length > 0 ? prices[prices.length - 1] : null;
    const latestPriceBody = latestPrice ? latestPrice.slice(0, -1) : '';
    const latestPriceDigit = latestPrice ? latestPrice.slice(-1) : '';
    const profitPct   = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) : 0;
    const activeMarket = MARKETS.find(m => m.symbol === symbol) ?? MARKETS[0];
    const digitCounts = Array.from({ length: 10 }, (_, digit) => digitWindow.filter(value => value === digit).length);
    const digitPercentages = digitCounts.map(count => digitWindow.length > 0 ? (count / digitWindow.length) * 100 : 0);
    const isSingleStrategyMode = strategyId !== 'dual';
    const activeStrategyDef = isSingleStrategyMode ? STRATEGY_DEFINITIONS[strategyId] : null;

    return (
        <div className='oue'>

            {/* ── digit strip ── */}
            <div className='oue__header'>
                <div className='oue__title'>
                    <span className='oue__title-icon'>🤖</span>
                    <span>{isSingleStrategyMode ? `${activeStrategyDef?.label.toUpperCase()} AI BOT` : 'AI BOTS'}</span>

                    {/* entry-mode indicator badge */}
                    {entryMode && (
                        <span className='oue__entry-badge'>
                            {isSingleStrategyMode
                                ? strategyId === 'over1'
                                    ? <>Entry: <strong>1 → 3–6</strong></>
                                    : strategyId === 'over2'
                                        ? <>Entry: <strong>0/1/2 → 3–6</strong></>
                                        : strategyId === 'under8'
                                            ? <>Entry: <strong>8 → 5–9</strong></>
                                            : strategyId === 'under7'
                                                ? <>Entry: <strong>7/8/9 → 3/6/7/8/9</strong></>
                                                        : strategyId === 'even'
                                                            ? <>Entry: <strong>odd, odd, odd, skip, even</strong></>
                                                            : strategyId === 'odd'
                                                                ? <>Entry: <strong>even, even, even, skip, odd</strong></>
                                                                : <>Entry: <strong>{getStrategyEntryDigits(strategyId).join(', ')}</strong></>
                                : entryTriggerMode === 'pair'
                                    ? <>Entry: <strong>4/5</strong> pair</>
                                    : <>Entry: <strong>4</strong> or <strong>5</strong></>}
                            {isWaitingEntry && <span className='oue__entry-pulse' />}
                        </span>
                    )}

                    {/* D-Circles shortcut */}
                    <button
                        className='oue__dcircles-btn'
                        onClick={() => (dashboard as any).setDCirclesModalVisibility()}
                        type='button'
                        title='Open D-Circles analysis tool'
                    >
                        ◎ D-Circles
                    </button>

                    {/* market selector */}
                    <div className={`oue__market-selector oue__market-selector--header${marketOpen ? ' oue__market-selector--open' : ''}`}>
                        <button
                            ref={marketTriggerRef}
                            className='oue__market-trigger oue__market-trigger--header'
                            onClick={openMarket}
                            disabled={isRunning}
                            type='button'
                            title='Change market'
                        >
                            <span className='oue__market-trigger-short'>
                                {MARKETS.find(m => m.symbol === symbol)?.short ?? symbol}
                            </span>
                            <span className={`oue__market-chevron${marketOpen ? ' oue__market-chevron--open' : ''}`}>▼</span>
                        </button>
                        {marketOpen && dropdownPos && createPortal(
                            <div
                                ref={marketDropdownRef}
                                className='oue__market-dropdown'
                                style={{ top: dropdownPos.top, left: dropdownPos.left, right: 'auto' }}
                            >
                                <div className='oue__market-category'>CONTINUOUS INDICES</div>
                                <div className='oue__market-list'>
                                    {MARKETS.map(m => {
                                        const isActive = symbol === m.symbol;
                                        const [codeMain, codeSub] = m.code.split('\n');
                                        return (
                                            <button
                                                key={m.symbol}
                                                className={`oue__market-row${isActive ? ' oue__market-row--active' : ''}`}
                                                onClick={() => { setSymbol(m.symbol); setMarketOpen(false); }}
                                                disabled={isRunning}
                                                type='button'
                                            >
                                                <span className='oue__market-code'>
                                                    <span className='oue__market-code-main'>{codeMain}</span>
                                                    {codeSub && <span className='oue__market-code-sub'>{codeSub}</span>}
                                                </span>
                                                <span className='oue__market-name'>{m.label}</span>
                                                {isActive && <span className='oue__market-active-icon'>⚡</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>
                </div>

                <div className='oue__course-price-row'>
                    <div className='oue__course-price'>
                        {latestPrice ? (
                            <span>
                                <span className='oue__course-price-body'>{latestPriceBody}</span>
                                <span className='oue__course-price-digit'>{latestPriceDigit}</span>
                            </span>
                        ) : (
                            <span className='oue__course-price-empty'>—</span>
                        )}
                    </div>

                    <div className='oue__course-window'>
                        <span>WINDOW</span>
                        <strong>{DIGIT_WINDOW}</strong>
                        <span>TICKS</span>
                    </div>
                </div>

                <div className='oue__digit-course' aria-label={`Digit distribution over ${digitWindow.length} ticks`}>
                    <div className='oue__digit-course-grid'>
                        {digitCounts.map((count, digit) => {
                            const isCurrent = currentDigit === digit;
                            return (
                                <div
                                    className={`oue__course-digit${isCurrent ? ' oue__course-digit--current' : ''}`}
                                    key={digit}
                                    aria-current={isCurrent ? 'true' : undefined}
                                    aria-label={`Digit ${digit}: ${digitPercentages[digit].toFixed(1)} percent, ${count} ticks${isCurrent ? ', latest generated digit' : ''}`}
                                >
                                    {isCurrent && <span className='oue__course-cursor' key={cursorTick} aria-hidden='true'>▼</span>}
                                    <span className='oue__course-digit-value'>{digit}</span>
                                    <span className='oue__course-digit-percent'>{digitPercentages[digit].toFixed(1)}%</span>
                                    <span className='oue__course-digit-count'>{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className='oue__digit-legend'>
                    <span className='oue__legend-dot oue__legend-dot--over'/>Over 5 (6–9)
                    {entryMode && <><span className='oue__legend-dot oue__legend-dot--entry'/>Entry (4–5)</>}
                    <span className='oue__legend-dot oue__legend-dot--neutral'/>Neutral
                    <span className='oue__legend-dot oue__legend-dot--under'/>Under 4 (0–3)
                </div>

                {/* waiting-for-entry status */}
                {isWaitingEntry && (
                    <div className='oue__entry-waiting'>
                        <span className='oue__entry-waiting-dot' />
                        {isSingleStrategyMode
                            ? strategyId === 'over1'
                                ? <>Watching for the sequence <strong>1 → 3, 4, 5, or 6</strong> before the next Over 1 trade…</>
                                : strategyId === 'over2'
                                    ? <>Watching for the sequence <strong>0/1/2 → 3, 4, 5, or 6</strong> before the next Over 2 trade…</>
                                    : strategyId === 'under8'
                                        ? <>Watching for the sequence <strong>8 → 5, 6, 7, 8, or 9</strong> before the next Under 8 trade…</>
                                        : strategyId === 'under7'
                                            ? <>Watching for the sequence <strong>7/8/9 → 3, 6, 7, 8, or 9</strong> before the next Under 7 trade…</>
                                                : strategyId === 'even'
                                                    ? <>Watching for the sequence <strong>odd, odd, odd, skip, even</strong> before the next Even trade…</>
                                                    : strategyId === 'odd'
                                                        ? <>Watching for the sequence <strong>even, even, even, skip, odd</strong> before the next Odd trade…</>
                                                        : `Watching for ${activeStrategyDef?.label} trigger digit${getStrategyEntryDigits(strategyId).length > 1 ? 's' : ''} ${getStrategyEntryDigits(strategyId).join(', ')}…`
                            : entryTriggerMode === 'pair'
                                ? <>Waiting for the <strong>4/5</strong> pair before triggering the next trade…</>
                                : <>Watching for digit <strong>4</strong> or <strong>5</strong> to trigger next trade…</>}
                        {lastEntryDigit !== null && (
                            <span className='oue__entry-last'>Last entry: <strong>{lastEntryDigit}</strong></span>
                        )}
                        {digits.length > 0 && (
                            <span className='oue__entry-recent'>Recent: {digits.slice(-6).join(' ')}</span>
                        )}
                    </div>
                )}
            </div>

            <div className='oue__strategy-panel'>
                <div className='oue__strategy-header'>
                    <span className='oue__strategy-label'>Strategy</span>
                    <span className='oue__strategy-pill'>
                        {strategyId === 'dual' ? 'Dual Over/Under' : STRATEGY_DEFINITIONS[strategyId].label}
                    </span>
                </div>
                <div className='oue__strategy-tabs'>
                    <button
                        type='button'
                        className={`oue__strategy-tab${strategyId === 'dual' ? ' oue__strategy-tab--active' : ''}`}
                        onClick={() => selectStrategy('dual')}
                    >
                        Dual
                    </button>
                    {STRATEGY_ORDER.map(id => (
                        <button
                            key={id}
                            type='button'
                            className={`oue__strategy-tab${strategyId === id ? ' oue__strategy-tab--active' : ''}`}
                            onClick={() => selectStrategy(id)}
                            style={strategyId === id ? { background: STRATEGY_DEFINITIONS[id].badgeColor } : undefined}
                        >
                            {STRATEGY_DEFINITIONS[id].label}
                        </button>
                    ))}
                </div>
                {strategyId !== 'dual' && (
                    <div className='oue__single-stats'>
                        <span>Wins: <strong>{singleWins}</strong></span>
                        <span>Losses: <strong>{singleLosses}</strong></span>
                        <span>Stake: <strong>{singleStake.toFixed(2)}</strong></span>
                        {lastSingleResult && <span>Last: <strong>{lastSingleResult}</strong></span>}
                    </div>
                )}
                {lastSkipReason && <div className='oue__strategy-skip'>{lastSkipReason}</div>}
            </div>

            {/* ── strategy cards ── */}
            {isSingleStrategyMode ? (
                <div className='oue__panel oue__panel--single'>
                    <div className='oue__panel-top'>
                        <span className='oue__panel-name'>{activeStrategyDef?.label.toUpperCase()}</span>
                        <span className='oue__panel-win-pct'>{profitPct(singleWins, singleWins + singleLosses)}% win</span>
                    </div>
                    <div className='oue__panel-subtitle'>
                        {activeStrategyDef?.contractType === 'DIGITEVEN' && 'Digit must be even (0, 2, 4, 6, 8)'}
                        {activeStrategyDef?.contractType === 'DIGITODD' && 'Digit must be odd (1, 3, 5, 7, 9)'}
                        {activeStrategyDef?.contractType === 'DIGITOVER' && `Digit must be ${activeStrategyDef.barrier ? `greater than ${activeStrategyDef.barrier}` : 'above the selected barrier'}`}
                        {activeStrategyDef?.contractType === 'DIGITUNDER' && `Digit must be ${activeStrategyDef.barrier ? `less than ${activeStrategyDef.barrier}` : 'below the selected barrier'}`}
                    </div>
                    <div className='oue__wl-row'>
                        <div className='oue__wl oue__wl--win'>
                            <span className='oue__wl-num'>{singleWins}</span>
                            <span className='oue__wl-label'>WINS</span>
                        </div>
                        <div className='oue__wl-divider' />
                        <div className='oue__wl oue__wl--loss'>
                            <span className='oue__wl-num'>{singleLosses}</span>
                            <span className='oue__wl-label'>LOSSES</span>
                        </div>
                    </div>
                    <div className='oue__panel-stats'>
                        <div className='oue__stat'><span className='oue__stat-label'>Stake</span><span className='oue__stat-val'>{singleStake.toFixed(2)}</span></div>
                    </div>
                    {lastSingleResult && <div className={`oue__badge oue__badge--${lastSingleResult}`}>{lastSingleResult === 'won' ? '✓ WIN' : '✗ LOSS'}</div>}
                </div>
            ) : (
                <div className='oue__panels'>
                    <div className={`oue__panel oue__panel--over${lastOverResult ? ` oue__panel--${lastOverResult}` : ''}`}>
                        <div className='oue__panel-top'>
                            <span className='oue__panel-name'>OVER 5</span>
                            <span className='oue__panel-win-pct'>{profitPct(overWins, overWins + overLosses)}% win</span>
                        </div>
                        <div className='oue__panel-subtitle'>Digit must be 6, 7, 8, or 9</div>
                        <div className='oue__wl-row'>
                            <div className='oue__wl oue__wl--win'>
                                <span className='oue__wl-num'>{overWins}</span>
                                <span className='oue__wl-label'>WINS</span>
                            </div>
                            <div className='oue__wl-divider' />
                            <div className='oue__wl oue__wl--loss'>
                                <span className='oue__wl-num'>{overLosses}</span>
                                <span className='oue__wl-label'>LOSSES</span>
                            </div>
                        </div>
                        <div className='oue__panel-stats'>
                            <div className='oue__stat'><span className='oue__stat-label'>Stake</span><span className='oue__stat-val'>{overCurrentStake.toFixed(2)}</span></div>
                        </div>
                        {lastOverResult && <div className={`oue__badge oue__badge--${lastOverResult}`}>{lastOverResult === 'won' ? '✓ WIN' : '✗ LOSS'}</div>}
                    </div>

                    <div className={`oue__panel oue__panel--under${lastUnderResult ? ` oue__panel--${lastUnderResult}` : ''}`}>
                        <div className='oue__panel-top'>
                            <span className='oue__panel-name'>UNDER 4</span>
                            <span className='oue__panel-win-pct'>{profitPct(underWins, underWins + underLosses)}% win</span>
                        </div>
                        <div className='oue__panel-subtitle'>Digit must be 0, 1, 2, or 3</div>
                        <div className='oue__wl-row'>
                            <div className='oue__wl oue__wl--win'>
                                <span className='oue__wl-num'>{underWins}</span>
                                <span className='oue__wl-label'>WINS</span>
                            </div>
                            <div className='oue__wl-divider' />
                            <div className='oue__wl oue__wl--loss'>
                                <span className='oue__wl-num'>{underLosses}</span>
                                <span className='oue__wl-label'>LOSSES</span>
                            </div>
                        </div>
                        <div className='oue__panel-stats'>
                            <div className='oue__stat'><span className='oue__stat-label'>Stake</span><span className='oue__stat-val'>{underCurrentStake.toFixed(2)}</span></div>
                        </div>
                        {lastUnderResult && <div className={`oue__badge oue__badge--${lastUnderResult}`}>{lastUnderResult === 'won' ? '✓ WIN' : '✗ LOSS'}</div>}
                    </div>
                </div>
            )}

            {/* ── summary bar ── */}
            <div className='oue__summary'>
                <div className='oue__pnl'>
                    <span className='oue__pnl-label'>Total P&amp;L</span>
                    <span className={`oue__pnl-val${totalProfit > 0 ? ' oue__pnl-val--pos' : totalProfit < 0 ? ' oue__pnl-val--neg' : ''}`}>
                        {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)} {currency}
                    </span>
                </div>

                <div className='oue__live-price'>
                    <span className='oue__live-price-label'>Live Price</span>
                    {latestPrice ? (
                        <span className='oue__live-price-val'>
                            <span className='oue__live-price-body'>{latestPriceBody}</span>
                            <span className='oue__live-price-digit'>{latestPriceDigit}</span>
                        </span>
                    ) : (
                        <span className='oue__live-price-empty'>—</span>
                    )}
                </div>

                <div className='oue__rounds'><span className='oue__rounds-label'>Rounds</span><span className='oue__rounds-val'>{totalRounds}</span></div>
                <div className='oue__rounds'><span className='oue__rounds-label'>Market</span><span className='oue__rounds-val' style={{ fontSize: '1.1rem' }}>{activeMarket.short}</span></div>
            </div>


            {/* ── controls ── */}
            <div className='oue__controls'>
                <div className='oue__config'>
                    <label className='oue__field'>
                        <span>Stake ({currency})</span>
                        <input
                            type='number'
                            min='0'
                            step='0.05'
                            value={stake}
                            onChange={e => setStake(e.target.value === '' ? '' : e.target.value)}
                            disabled={isRunning}
                            className='oue__input'
                        />
                    </label>
                    <label className='oue__field'>
                        <span>Take Profit</span>
                        <input
                            type='number'
                            min='0'
                            step='0.5'
                            value={takeProfit}
                            onChange={e => setTakeProfit(e.target.value === '' ? '' : e.target.value)}
                            disabled={isRunning}
                            className='oue__input'
                        />
                    </label>
                    <label className='oue__field'>
                        <span>Stop Loss</span>
                        <input
                            type='number'
                            min='0'
                            step='0.5'
                            value={stopLoss}
                            onChange={e => setStopLoss(e.target.value === '' ? '' : e.target.value)}
                            disabled={isRunning}
                            className='oue__input'
                        />
                    </label>
                </div>

                <label className='oue__entry-toggle'>
                    <span className='oue__entry-toggle-label'>
                        Bulk purchase
                    </span>
                    <div
                        className={`oue__toggle${bulkEnabled ? ' oue__toggle--on' : ''}`}
                        onClick={() => !isRunning && setBulkEnabled(v => !v)}
                        role='switch'
                        aria-checked={bulkEnabled}
                        aria-disabled={isRunning}
                        tabIndex={0}
                        onKeyDown={e => { if (!isRunning && (e.key === ' ' || e.key === 'Enter')) setBulkEnabled(v => !v); }}
                    >
                        <div className='oue__toggle-thumb' />
                    </div>
                </label>

                {bulkEnabled && (
                    <label className='oue__field'>
                        <span>Bulk count</span>
                        <input
                            type='number'
                            min='1'
                            step='1'
                            value={bulkCount}
                            onChange={e => setBulkCount(e.target.value)}
                            disabled={isRunning}
                            className='oue__input'
                        />
                    </label>
                )}

                {/* entry mode toggle */}
                <label className='oue__entry-toggle'>
                    <span className='oue__entry-toggle-label'>
                        Entry point mode
                    </span>
                    <div
                        className={`oue__toggle${entryMode ? ' oue__toggle--on' : ''}`}
                        onClick={() => !isRunning && setEntryMode(v => !v)}
                        role='switch'
                        aria-checked={entryMode}
                        aria-disabled={isRunning}
                        tabIndex={0}
                        onKeyDown={e => { if (!isRunning && (e.key === ' ' || e.key === 'Enter')) setEntryMode(v => !v); }}
                    >
                        <div className='oue__toggle-thumb' />
                    </div>
                </label>

                {entryMode && !isSingleStrategyMode && (
                    <div className='oue__entry-button-group'>
                        <button
                            type='button'
                            className={`oue__entry-button${entryTriggerMode === 'single' ? ' oue__entry-button--active' : ''}`}
                            onClick={() => !isRunning && setEntryTriggerMode('single')}
                            disabled={isRunning}
                        >
                            4 / 5
                        </button>
                        <button
                            type='button'
                            className={`oue__entry-button${entryTriggerMode === 'pair' ? ' oue__entry-button--active' : ''}`}
                            onClick={() => !isRunning && setEntryTriggerMode('pair')}
                            disabled={isRunning}
                        >
                            4 / 5 Pair
                        </button>
                    </div>
                )}

                <div className='oue__action'>
                    <div className={`oue__status${isRunning ? ' oue__status--running' : ''}`}>
                        {isRunning && <span className='oue__pulse' />}
                        {statusMsg}
                    </div>
                    {!isRunning ? (
                        <button className='oue__btn oue__btn--start' onClick={startEngine}>▶&nbsp;START ENGINE</button>
                    ) : (
                        <button className='oue__btn oue__btn--stop' onClick={() => stopEngine('Stopped by user')}>■&nbsp;STOP</button>
                    )}
                </div>
            </div>


        </div>
    );
});

export default OverUnderEngine;
