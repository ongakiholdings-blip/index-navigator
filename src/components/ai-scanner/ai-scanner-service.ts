/**
 * AI Scanner Service
 *
 * Connects to the Deriv WebSocket API, fetches tick history for each
 * synthetic-digits market, and scores every valid strategy in the selected
 * contract family.
 *
 * Every requested standard and 1-second volatility market is evaluated. The
 * highest-scoring market is returned as the single recommendation.
 */
import DerivAPIBasic from '@deriv/deriv-api/dist/DerivAPIBasic';
import { getSocketURL } from '@/components/shared';

// ─── constants ────────────────────────────────────────────────────────────────

/**
 * Symbols are grouped by market family for progress reporting. Selection is
 * global across the complete list; ordering is only used for deterministic
 * ties.
 */
export const SCAN_SYMBOLS_1S = [
    { symbol: '1HZ10V',  name: 'Volatility 10 (1s)',  is1s: true  },
    { symbol: '1HZ15V',  name: 'Volatility 15 (1s)',  is1s: true  },
    { symbol: '1HZ25V',  name: 'Volatility 25 (1s)',  is1s: true  },
    { symbol: '1HZ30V',  name: 'Volatility 30 (1s)',  is1s: true  },
    { symbol: '1HZ50V',  name: 'Volatility 50 (1s)',  is1s: true  },
    { symbol: '1HZ75V',  name: 'Volatility 75 (1s)',  is1s: true  },
    { symbol: '1HZ90V',  name: 'Volatility 90 (1s)',  is1s: true  },
    { symbol: '1HZ100V', name: 'Volatility 100 (1s)', is1s: true  },
];

export const SCAN_SYMBOLS_PLAIN = [
    { symbol: 'R_10',    name: 'Volatility 10',       is1s: false },
    { symbol: 'R_25',    name: 'Volatility 25',       is1s: false },
    { symbol: 'R_50',    name: 'Volatility 50',       is1s: false },
    { symbol: 'R_75',    name: 'Volatility 75',      is1s: false },
    { symbol: 'R_100',   name: 'Volatility 100',      is1s: false },
];

/** All symbols: 1s first, then plain — preserves priority ordering. */
export const SCAN_SYMBOLS = [...SCAN_SYMBOLS_1S, ...SCAN_SYMBOLS_PLAIN];

// ─── types ────────────────────────────────────────────────────────────────────

/** Which contract-type group the winning signal belongs to. */
export type ContractGroup = 'overunder' | 'evenodd' | 'risefall' | 'matchesdiffers';

/** Contract families scanned by the dedicated Scanner tab. */
export type ScanMode = 'overunder1' | 'overunder2' | 'overunder' | 'evenodd' | 'risefall' | 'matchesdiffers';

export type ScanResult = {
    symbol: string;
    name: string;
    is1s: boolean;
    score: number;
    tradeType: string;      // e.g. "Over 2", "Under 7", "Even", "Odd"
    percentage: string;     // formatted win-rate string
    contractGroup: ContractGroup;
    digitCounts: number[];
    entryPoint?: number;    // Over/Under only — digit that most often precedes a win
};

export type ScanProgress = {
    symbol: string;
    index: number;
    total: number;
};

export type UnifiedScanOutput = {
    /** The single recommended outcome — 1s volatility when fit, plain otherwise. */
    best: ScanResult;
    /** All scanned results sorted by score (no duplicate volatilities). */
    all: ScanResult[];
    /** Whether the result came from the 1s group. */
    used1s: boolean;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function getLastDigit(price: number | string): number {
    const str = price.toString();
    return parseInt(str[str.length - 1], 10);
}

function buildDigitCounts(digits: number[]): number[] {
    const counts = new Array(10).fill(0);
    digits.forEach(d => counts[d]++);
    return counts;
}

/**
 * Finds the entry-point digit — the last digit that, when observed, most often
 * precedes a winning tick for the given Over/Under trade type.
 */
function computeEntryPoint(digits: number[], tradeType: string): number {
    const m = tradeType.trim().match(/^(Over|Under)\s+(\d+)$/i);
    if (!m || digits.length < 2) return 0;

    const threshold = parseInt(m[2], 10);
    const isWin = m[1].toLowerCase() === 'over'
        ? (d: number) => d > threshold
        : (d: number) => d < threshold;

    const winCount   = new Array(10).fill(0);
    const totalCount = new Array(10).fill(0);

    for (let i = 0; i < digits.length - 1; i++) {
        const cur  = digits[i];
        const next = digits[i + 1];
        totalCount[cur]++;
        if (isWin(next)) winCount[cur]++;
    }

    let bestDigit = 0;
    let bestProb  = -1;
    let bestObs   = 0;

    for (let d = 0; d < 10; d++) {
        if (totalCount[d] === 0) continue;
        const prob = winCount[d] / totalCount[d];
        if (prob > bestProb || (prob === bestProb && totalCount[d] > bestObs)) {
            bestProb  = prob;
            bestDigit = d;
            bestObs   = totalCount[d];
        }
    }

    return bestDigit;
}

/**
 * Scores a digit stream for a single Over/Under variant.
 * Returns { score, tradeType, percentage } for the stronger side.
 */
function scoreOverUnder(
    digits: number[],
    overThreshold: number,
    underThreshold: number,
): { score: number; tradeType: string; percentage: string } {
    const total     = digits.length;
    const overRate  = digits.filter(d => d > overThreshold).length  / total;
    const underRate = digits.filter(d => d < underThreshold).length / total;
    const overEdge  = overRate - ((9 - overThreshold) / 10);
    const underEdge = underRate - (underThreshold / 10);
    if (Math.abs(overEdge) >= Math.abs(underEdge)) {
        return {
            score:      Math.abs(overEdge),
            tradeType:  `Over ${overThreshold}`,
            percentage: `${(overRate * 100).toFixed(1)}%`,
        };
    }
    return {
        score:      Math.abs(underEdge),
        tradeType:  `Under ${underThreshold}`,
        percentage: `${(underRate * 100).toFixed(1)}%`,
    };
}

function scoreMarketFamily(digits: number[], prices: number[], mode: ScanMode): {
    score: number;
    tradeType: string;
    percentage: string;
    contractGroup: ContractGroup;
    entryPoint?: number;
} {
    if (!digits.length) return { score: 0, tradeType: '', percentage: '0%', contractGroup: 'overunder' };

    const candidates: Array<{
        score: number; tradeType: string; percentage: string;
        contractGroup: ContractGroup; entryPoint?: number;
    }> = [];

    if (mode === 'overunder' || mode === 'overunder1' || mode === 'overunder2') {
        const pairs = mode === 'overunder1'
            ? [[1, 8]]
            : mode === 'overunder2'
                ? [[2, 7]]
                : [[1, 8], [2, 7], [3, 6], [4, 5]];
        pairs.forEach(([over, under]) => {
            const scored = scoreOverUnder(digits, over, under);
            candidates.push({ ...scored, contractGroup: 'overunder', entryPoint: computeEntryPoint(digits, scored.tradeType) });
        });
    } else if (mode === 'evenodd') {
        const evenRate = digits.filter(digit => digit % 2 === 0).length / digits.length;
        const oddRate = 1 - evenRate;
        candidates.push(
            { score: Math.abs(evenRate - 0.5), tradeType: 'Even', percentage: `${(evenRate * 100).toFixed(1)}%`, contractGroup: 'evenodd' },
            { score: Math.abs(oddRate - 0.5), tradeType: 'Odd', percentage: `${(oddRate * 100).toFixed(1)}%`, contractGroup: 'evenodd' }
        );
    } else if (mode === 'risefall') {
        const changes = prices.slice(1).map((price, index) => price >= prices[index]);
        const riseRate = changes.filter(Boolean).length / Math.max(1, changes.length);
        const fallRate = 1 - riseRate;
        candidates.push(
            { score: Math.abs(riseRate - 0.5), tradeType: 'Rise', percentage: `${(riseRate * 100).toFixed(1)}%`, contractGroup: 'risefall' },
            { score: Math.abs(fallRate - 0.5), tradeType: 'Fall', percentage: `${(fallRate * 100).toFixed(1)}%`, contractGroup: 'risefall' }
        );
    } else {
        const counts = buildDigitCounts(digits);
        counts.forEach((count, barrier) => {
            const matchesRate = count / digits.length;
            const differsRate = 1 - matchesRate;
            candidates.push(
                { score: Math.abs(matchesRate - 0.1), tradeType: `Matches ${barrier}`, percentage: `${(matchesRate * 100).toFixed(1)}%`, contractGroup: 'matchesdiffers', entryPoint: barrier },
                { score: Math.abs(differsRate - 0.9), tradeType: `Differs ${barrier}`, percentage: `${(differsRate * 100).toFixed(1)}%`, contractGroup: 'matchesdiffers', entryPoint: barrier }
            );
        });
    }

    return candidates.reduce((best, candidate) => candidate.score > best.score ? candidate : best);
}

// ─── WebSocket connection helper ──────────────────────────────────────────────

function openConnection(wsURL: string, timeoutMs = 15_000): Promise<{
    api: InstanceType<typeof DerivAPIBasic>;
    ws: WebSocket;
}> {
    return new Promise((resolve, reject) => {
        let settled = false;

        const ws  = new WebSocket(wsURL);
        const api = new DerivAPIBasic({ connection: ws });

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                ws.close();
                reject(new Error('[AiScanner] WebSocket connection timed out'));
            }
        }, timeoutMs);

        ws.addEventListener('open', () => {
            if (!settled) { settled = true; clearTimeout(timer); resolve({ api, ws }); }
        });
        ws.addEventListener('error', (err) => {
            if (!settled) { settled = true; clearTimeout(timer); reject(err); }
        });
    });
}

// ─── main scan ────────────────────────────────────────────────────────────────

/**
 * Scans all synthetic-digit markets and returns a single recommended outcome.
 *
 * The dedicated 'overunder' mode evaluates all supported Over/Under pairs.
 * The legacy overunder1 and overunder2 modes remain available to the floating
 * scanner and evaluate their specific pair.
 *
 * The best result is selected globally across the complete market list.
 */
export async function scanMarkets(
    mode: ScanMode,
    tickCount: number,
    onProgress: (p: ScanProgress) => void,
    signal?: AbortSignal
): Promise<UnifiedScanOutput> {
    const wsURL = await getSocketURL();
    const { api, ws } = await openConnection(wsURL);

    const results1s:    ScanResult[] = [];
    const resultsPlain: ScanResult[] = [];

    try {
        for (let i = 0; i < SCAN_SYMBOLS.length; i++) {
            if (signal?.aborted) break;

            const { symbol, name, is1s } = SCAN_SYMBOLS[i];
            onProgress({ symbol, index: i, total: SCAN_SYMBOLS.length });

            try {
                const response = await (api as any).send({
                    ticks_history: symbol,
                    count: Math.min(tickCount, 5000),
                    end: 'latest',
                    style: 'ticks',
                });

                const prices: number[] = response?.history?.prices ?? [];
                const digits      = prices.map(p => getLastDigit(p));
                const digitCounts = buildDigitCounts(digits);
                const numericPrices = prices.map(Number).filter(Number.isFinite);
                const scored = scoreMarketFamily(digits, numericPrices, mode);

                const result: ScanResult = {
                    symbol, name, is1s, digitCounts,
                    score:         scored.score,
                    tradeType:     scored.tradeType,
                    percentage:    scored.percentage,
                    contractGroup: scored.contractGroup,
                    entryPoint:    scored.entryPoint,
                };

                if (is1s) results1s.push(result);
                else      resultsPlain.push(result);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn(`[AiScanner] Failed to fetch ${symbol}:`, err);
            }
        }
    } finally {
        try { ws.close(); } catch { /* ignore */ }
    }

    // Sort each group by score descending
    results1s.sort((a, b) => b.score - a.score);
    resultsPlain.sort((a, b) => b.score - a.score);

    // Choose one best market from the complete requested market universe.
    // Keep the original ordering as the deterministic tie-breaker.
    const all = [...results1s, ...resultsPlain];
    const best = all.reduce<ScanResult | null>(
        (current, result) => !current || result.score > current.score ? result : current,
        null
    );
    if (!best) throw new Error('[AiScanner] No market results were available');
    const used1s = best.is1s;

    return { best, all, used1s };
}
