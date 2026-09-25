import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load } from '@/external/bot-skeleton';
import { save_types } from '@/external/bot-skeleton/constants/save-type';
import { scanMarkets, ScanResult, ScanProgress, ScanMode, UnifiedScanOutput } from './ai-scanner-service';
import './ai-scanner.scss';

// ─── types ────────────────────────────────────────────────────────────────────

type ScanState = 'idle' | 'scanning' | 'done' | 'error';

// ─── XML injection helpers ────────────────────────────────────────────────────

function replaceVarInit(xml: string, varId: string, value: number): string {
    const escaped = varId.replace(/[.*+?^${}()|[\]\\`]/g, '\\$&');
    return xml.replace(
        new RegExp(`(id="${escaped}"[^<]*<\\/field>[\\s\\S]*?<field name="NUM">)[\\d.]+(?=<\\/field>)`),
        `$1${value}`
    );
}

type InjectOpts = {
    symbol: string;
    stake: number;
    martingale: number;
    takeProfit: number;
    stopLoss: number;
    tradeType: string;
    entryPoint?: number;
};

function injectOverUnderParams(xml: string, opts: InjectOpts): string {
    xml = xml.replace(/(<field name="SYMBOL_LIST">)[^<]+/, `$1${opts.symbol}`);

    let digit: number | undefined;
    let purchase = 'DIGITOVER';
    const m = opts.tradeType.trim().match(/^(Over|Under)\s+(\d+)$/i);
    if (m) {
        digit    = parseInt(m[2], 10);
        purchase = m[1].toLowerCase() === 'under' ? 'DIGITUNDER' : 'DIGITOVER';
    }

    if (digit !== undefined) xml = replaceVarInit(xml, 'a6O1@UOPwLx_RSp+20T$', digit);
    if (opts.entryPoint !== undefined) xml = replaceVarInit(xml, 'e.`,j$8^KyE-2P_|[+x8', opts.entryPoint);
    xml = xml.replace(/(<field name="PURCHASE_LIST">)DIGIT(?:OVER|UNDER)/g, `$1${purchase}`);
    xml = replaceVarInit(xml, '9dQ4tsj$@`vWpu;:2{K=',  opts.stake);
    xml = replaceVarInit(xml, '/D.KK%;1:%C[vPyr}FX9',  opts.martingale);
    xml = replaceVarInit(xml, ':Fbza.{0*q*jalJ+tc#.',  opts.takeProfit);
    xml = replaceVarInit(xml, 'BTQ{$u318X:bRnhP(mQ9',  opts.stopLoss);
    return xml;
}

function injectEvenOddParams(xml: string, opts: InjectOpts): string {
    if (opts.tradeType !== 'Even' && opts.tradeType !== 'Odd') {
        throw new Error(`[AiScanner] Invalid even/odd direction: "${opts.tradeType}"`);
    }
    xml = xml.replace(/(<field name="SYMBOL_LIST">)[^<]+/, `$1${opts.symbol}`);
    xml = replaceVarInit(xml, 'xd#F6X!PKV4M@A!Ya@5R', opts.stake);
    xml = replaceVarInit(xml, 'I=[4-i8Yh!8yyyJ@i`3I', opts.martingale);
    xml = replaceVarInit(xml, '1:(EhN=[H:b-?Xr#{Df+', opts.takeProfit);
    xml = replaceVarInit(xml, 'rXm$y.Rn8Ec_$@!MDo^e', opts.stopLoss);
    const purchase = opts.tradeType === 'Even' ? 'DIGITEVEN' : 'DIGITODD';
    xml = xml.replace(/(<field name="PURCHASE_LIST">)[^<]+/, `$1${purchase}`);
    return xml;
}

// ─── component ────────────────────────────────────────────────────────────────

const AiScanner = () => {
    const store = useStore();

    // ── drag state ───────────────────────────────────────────────────────────
    const [pos, setPos] = useState({ right: 24, bottom: 120 });
    const isDragging  = useRef(false);
    const hasDragged  = useRef(false);
    const dragStart   = useRef({ x: 0, y: 0, right: 0, bottom: 0 });
    const btnRef      = useRef<HTMLButtonElement>(null);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0 && e.pointerType !== 'touch') return;
        isDragging.current  = true;
        hasDragged.current  = false;
        dragStart.current   = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom };
        btnRef.current?.setPointerCapture(e.pointerId);
    }, [pos]);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
        if (!isDragging.current) return;
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasDragged.current = true;
        setPos({ right: Math.max(8, dragStart.current.right - dx), bottom: Math.max(8, dragStart.current.bottom - dy) });
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
        isDragging.current = false;
        btnRef.current?.releasePointerCapture(e.pointerId);
    }, []);

    // ── scanner state ─────────────────────────────────────────────────────────
    const [isOpen,     setIsOpen]     = useState(false);
    const [scanMode,  setScanMode]  = useState<ScanMode>('overunder1');
    const [ticks,      setTicks]      = useState(3000);
    const [scanState,  setScanState]  = useState<ScanState>('idle');
    const [progress,   setProgress]   = useState<ScanProgress | null>(null);
    const [output,     setOutput]     = useState<UnifiedScanOutput | null>(null);
    const [statusMsg,  setStatusMsg]  = useState('');

    // ── bot parameters ────────────────────────────────────────────────────────
    const [stake,      setStake]      = useState(1);
    const [martingale, setMartingale] = useState(1.5);
    const [takeProfit, setTakeProfit] = useState(5);
    const [stopLoss,   setStopLoss]   = useState(10);

    const abortRef = useRef<AbortController | null>(null);
    const scanAlarmRef = useRef<HTMLAudioElement | null>(null);

    const stopScanAlarm = useCallback(() => {
        const alarm = scanAlarmRef.current;
        if (!alarm) return;
        alarm.pause();
        alarm.currentTime = 0;
        scanAlarmRef.current = null;
    }, []);

    const startScanAlarm = useCallback(() => {
        stopScanAlarm();
        const alarm = document.getElementById('ai-scan-alert') as HTMLAudioElement | null;
        if (!alarm) {
            console.warn('[AiScanner] Scan alarm audio element is unavailable.');
            return;
        }
        alarm.loop = true;
        alarm.currentTime = 0;
        scanAlarmRef.current = alarm;
        void alarm.play().catch(error => {
            console.warn('[AiScanner] Scan alarm could not start:', error);
        });
    }, [stopScanAlarm]);

    useEffect(() => stopScanAlarm, [stopScanAlarm]);

    // Reset results when mode changes so stale data is never shown
    useEffect(() => {
        if (scanState === 'scanning') abortRef.current?.abort();
        setScanState('idle');
        setOutput(null);
        setProgress(null);
        setStatusMsg('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scanMode]);

    const bestResult: ScanResult | null = output?.best ?? null;

    const progressPct = progress && progress.total > 0
        ? Math.round(((progress.index + 1) / progress.total) * 100)
        : 0;

    function statusFor(state: ScanState, prog: ScanProgress | null, out: UnifiedScanOutput | null): string {
        switch (state) {
            case 'idle':     return 'Ready — set parameters and scan';
            case 'scanning': return prog ? `Scanning ${prog.symbol} (${prog.index + 1}/${prog.total})…` : 'Starting…';
            case 'done':     return out?.best
                ? `Best: ${out.best.name} — ${out.best.tradeType} (${out.best.percentage})`
                : 'No results — check connection.';
            case 'error':    return 'Scan failed. Check connection and retry.';
        }
    }

    // ── handlers ──────────────────────────────────────────────────────────────
    const handleToggle = () => {
        if (hasDragged.current) return;
        setIsOpen(o => !o);
    };

    const handleScan = async () => {
        if (scanState === 'scanning') {
            abortRef.current?.abort();
            setScanState('idle');
            setStatusMsg(statusFor('idle', null, null));
            return;
        }
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        startScanAlarm();
        setScanState('scanning');
        setOutput(null);
        setProgress(null);
        setStatusMsg('Starting scan…');
        try {
            const result = await scanMarkets(scanMode, ticks, p => {
                setProgress(p);
                setStatusMsg(statusFor('scanning', p, null));
            }, ctrl.signal);
            if (ctrl.signal.aborted) return;
            setOutput(result);
            setScanState('done');
            setStatusMsg(statusFor('done', null, result));
        } catch {
            if (ctrl.signal.aborted) return;
            setScanState('error');
            setStatusMsg(statusFor('error', null, null));
        } finally {
            stopScanAlarm();
        }
    };

    const buildAndLoadBot = async (): Promise<void> => {
        if (!bestResult) return;

        const xmlFile = 'dominator_vol_2';
        const botName = 'DOMINATOR VOL 2';

        const xml_module = await import(`../../xml/${xmlFile}.xml`);
        let block_string: string = xml_module.default;

        const opts: InjectOpts = {
            symbol:    bestResult.symbol,
            stake,
            martingale,
            takeProfit,
            stopLoss,
            tradeType: bestResult.tradeType,
            entryPoint: bestResult.entryPoint,
        };

        block_string = injectOverUnderParams(block_string, opts);

        if (store?.dashboard) store.dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
        setIsOpen(false);

        const doLoad = async (workspace: any) => {
            await load({
                block_string,
                workspace,
                file_name: botName,
                from: save_types.LOCAL,
                show_snackbar: true,
                drop_event: undefined,
                strategy_id: undefined,
                showIncompatibleStrategyDialog: undefined,
            });
        };

        const workspace = (window as any).Blockly?.derivWorkspace;
        if (workspace) {
            await doLoad(workspace);
        } else {
            await new Promise<void>(resolve => {
                setTimeout(async () => {
                    const ws = (window as any).Blockly?.derivWorkspace;
                    if (ws) await doLoad(ws);
                    resolve();
                }, 800);
            });
        }
    };

    const handleLoadBot = async () => {
        try { await buildAndLoadBot(); }
        catch (err) { console.error('[AiScanner] Failed to load bot XML:', err); }
    };

    const handleLoadAndRun = async () => {
        try {
            await buildAndLoadBot();
            setTimeout(() => { store?.run_panel?.onRunButtonClick?.(); }, 600);
        } catch (err) { console.error('[AiScanner] Failed to load and run bot:', err); }
    };

    const handleClose = () => {
        abortRef.current?.abort();
        setIsOpen(false);
    };

    const clamp    = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
    const parseNum = (s: string, fallback: number) => { const n = parseFloat(s); return isNaN(n) ? fallback : n; };

    const modalStyle: React.CSSProperties = {
        position: 'fixed',
        bottom: pos.bottom + 64,
        right:  pos.right,
    };

    // Derived display values
    const isDone  = scanState === 'done' && !!bestResult;
    const aiMarket        = isDone ? bestResult!.name       : '—';
    const aiContractType  = isDone ? 'Over / Under' : '—';
    const aiPrediction    = isDone ? bestResult!.tradeType  : '—';
    const aiPercentage    = isDone ? bestResult!.percentage : '—';
    const aiEntryPoint    = isDone && bestResult!.entryPoint !== undefined
        ? String(bestResult!.entryPoint)
        : '—';
    const sourceLabel     = isDone
        ? (output!.used1s ? '1s volatility' : 'standard volatility')
        : '';

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <>
            {/* ── Draggable trigger button ──────────────────────────────── */}
            <button
                ref={btnRef}
                className={`ai-scanner-trigger${isOpen ? ' ai-scanner-trigger--active' : ''}`}
                style={{ position: 'fixed', right: pos.right, bottom: pos.bottom }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onClick={handleToggle}
                aria-label='AI Entry Scanner'
                title='AI Entry Scanner'
                touch-action='none'
            >
                <span className='ai-scanner-trigger__wave' aria-hidden='true' />
                <span className='ai-scanner-trigger__wave' aria-hidden='true' />
                <span className='ai-scanner-trigger__wave' aria-hidden='true' />
                <span>AI</span>
                <div className='ai-scanner-trigger__dot' />
            </button>

            {isOpen && <div className='ai-scanner-backdrop' onClick={handleClose} />}

            {isOpen && (
                <div className='ai-scanner-modal' style={modalStyle} role='dialog' aria-label='AI Entry Scanner'>

                    {/* ── Header ───────────────────────────────────────────── */}
                    <div className='ai-scanner-modal__header'>
                        <h3>AI Entry Scanner</h3>
                        <button className='ai-scanner-modal__close' onClick={handleClose} aria-label='Close'>✕</button>
                    </div>

                    {/* ── Mode toggle ──────────────────────────────────────── */}
                    <div className='ai-scanner-modal__mode-bar'>
                        <button
                            className={`ai-scanner-modal__mode-btn${scanMode === 'overunder1' ? ' ai-scanner-modal__mode-btn--active' : ''}`}
                            onClick={() => setScanMode('overunder1')}
                            disabled={scanState === 'scanning'}
                        >
                            Over 1 / Under 8
                        </button>
                        <button
                            className={`ai-scanner-modal__mode-btn${scanMode === 'overunder2' ? ' ai-scanner-modal__mode-btn--active' : ''}`}
                            onClick={() => setScanMode('overunder2')}
                            disabled={scanState === 'scanning'}
                        >
                            Over 2 / Under 7
                        </button>
                    </div>


                    {/* ── Body ─────────────────────────────────────────────── */}
                    <div className='ai-scanner-modal__body'>

                        {/* Tick count */}
                        <div className='ai-scanner-modal__strategy-header'>
                            <div className='ai-scanner-modal__strategy-info'>
                                <h4>Unified Contract Scanner</h4>
                                <p>Auto-detects best contract type &amp; market.</p>
                            </div>
                            <div className='ai-scanner-modal__ticks'>
                                <label>TICKS</label>
                                <input
                                    type='number' min={100} max={5000} step={100}
                                    value={ticks}
                                    onChange={e => setTicks(clamp(parseInt(e.target.value) || 100, 100, 5000))}
                                    disabled={scanState === 'scanning'}
                                />
                            </div>
                        </div>

                        {/* ── Bot Parameters ────────────────────────────────── */}
                        <div className='ai-scanner-modal__section-label'>BOT PARAMETERS</div>
                        <div className='ai-scanner-modal__params'>
                            <div className='ai-scanner-modal__param'>
                                <label>STAKE</label>
                                <input
                                    type='number' min={0.35} step={0.01}
                                    value={stake}
                                    onChange={e => setStake(clamp(parseNum(e.target.value, 1), 0.35, 9999))}
                                    disabled={scanState === 'scanning'}
                                />
                            </div>
                            <div className='ai-scanner-modal__param'>
                                <label>MARTINGALE</label>
                                <input
                                    type='number' min={1} step={0.1}
                                    value={martingale}
                                    onChange={e => setMartingale(clamp(parseNum(e.target.value, 1.5), 1, 99))}
                                    disabled={scanState === 'scanning'}
                                />
                            </div>
                            <div className='ai-scanner-modal__param'>
                                <label>TAKE PROFIT</label>
                                <input
                                    type='number' min={1} step={1}
                                    value={takeProfit}
                                    onChange={e => setTakeProfit(clamp(parseNum(e.target.value, 5), 1, 99999))}
                                    disabled={scanState === 'scanning'}
                                />
                            </div>
                            <div className='ai-scanner-modal__param'>
                                <label>STOP LOSS</label>
                                <input
                                    type='number' min={1} step={1}
                                    value={stopLoss}
                                    onChange={e => setStopLoss(clamp(parseNum(e.target.value, 10), 1, 99999))}
                                    disabled={scanState === 'scanning'}
                                />
                            </div>
                        </div>

                        {/* ── AI Scanner Results ────────────────────────────── */}
                        <div className='ai-scanner-modal__section-label'>
                            AI STRATEGY RESULTS
                            {isDone && (
                                <span className={`ai-scanner-modal__source-badge${output!.used1s ? ' ai-scanner-modal__source-badge--1s' : ''}`}>
                                    {sourceLabel}
                                </span>
                            )}
                        </div>

                        {/* Best-signal card */}
                        <div className={`ai-scanner-modal__best-card${isDone ? ' ai-scanner-modal__best-card--active' : ''}`}>
                            <div className='ai-scanner-modal__best-card-row'>
                                <div className='ai-scanner-modal__field'>
                                    <label>MARKET</label>
                                    <span className={isDone ? 'ai-scanner-modal__field-value--ai' : ''} title={aiMarket}>
                                        {aiMarket}
                                    </span>
                                </div>
                                <div className='ai-scanner-modal__field'>
                                    <label>STRATEGY</label>
                                    <span className={isDone ? 'ai-scanner-modal__field-value--ai' : ''}>
                                        {aiContractType}
                                    </span>
                                </div>
                            </div>
                            <div className='ai-scanner-modal__best-card-row'>
                                <div className='ai-scanner-modal__field'>
                                    <label>PREDICTION</label>
                                    <span className={isDone ? 'ai-scanner-modal__field-value--ai ai-scanner-modal__field-value--prediction' : ''}>
                                        {aiPrediction}
                                    </span>
                                </div>
                                <div className='ai-scanner-modal__field'>
                                    <label>WIN RATE</label>
                                    <span className={isDone ? 'ai-scanner-modal__field-value--ai ai-scanner-modal__field-value--rate' : ''}>
                                        {aiPercentage}
                                    </span>
                                </div>
                            </div>
                            {isDone && bestResult!.contractGroup === 'overunder' && (
                                <div className='ai-scanner-modal__best-card-row'>
                                    <div className='ai-scanner-modal__field'>
                                        <label>ENTRY POINT</label>
                                        <span
                                            className={isDone ? 'ai-scanner-modal__field-value--ai' : ''}
                                            title='Last digit the bot watches before placing a trade'
                                        >
                                            {aiEntryPoint}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Progress bar */}
                        {scanState === 'scanning' && (
                            <div className='ai-scanner-modal__progress'>
                                <div className='ai-scanner-modal__progress-bar' style={{ width: `${progressPct}%` }} />
                            </div>
                        )}

                        {/* Status */}
                        <div className={`ai-scanner-modal__status${scanState !== 'idle' ? ` ai-scanner-modal__status--${scanState}` : ''}`}>
                            {scanState === 'scanning' && <div className='ai-scanner-spinner' />}
                            {statusMsg || statusFor(scanState, progress, output)}
                        </div>

                        {/* Action buttons */}
                        <div className='ai-scanner-modal__actions'>
                            <button
                                className='ai-scanner-modal__btn ai-scanner-modal__btn--primary ai-scanner-modal__btn--scan'
                                onClick={handleScan}
                            >
                                {scanState === 'scanning' ? 'Stop Scan' : 'Scan Markets'}
                            </button>
                            <div className='ai-scanner-modal__actions-row'>
                                <button
                                    className='ai-scanner-modal__btn ai-scanner-modal__btn--secondary'
                                    onClick={handleLoadBot}
                                    disabled={scanState !== 'done' || !bestResult}
                                >
                                    Load Bot
                                </button>
                                <button
                                    className='ai-scanner-modal__btn ai-scanner-modal__btn--success'
                                    onClick={handleLoadAndRun}
                                    disabled={scanState !== 'done' || !bestResult}
                                >
                                    ▶ Load &amp; Run
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AiScanner;
