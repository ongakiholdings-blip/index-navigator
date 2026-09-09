/**
 * Marketing Account Virtual Balance
 *
 * Gives specific CR accounts a custom display balance that tracks real trade
 * deltas from the associated demo account — so wins/losses reflect accurately
 * — and resets to the configured default on demand.
 *
 * How it works:
 *   1. On first login we set the display balance to the configured default
 *      (e.g. 258.23 USD) and record the demo account's current Deriv balance
 *      as the reference point.
 *   2. Every time Deriv sends a live balance update for the demo account we
 *      compute the delta (new Deriv balance − stored reference) and apply it
 *      to our display balance. Both are persisted to localStorage.
 *   3. Reset: record the current Deriv balance as the new reference and snap
 *      the display balance back to the configured default.
 *
 * Storage is keyed by the CR loginid so the balance survives page reloads and
 * is tied to the correct marketing account regardless of which demo loginid is
 * in the session.
 *
 * To add more marketing accounts, extend MARKETING_ACCOUNTS below.
 */

import { isDemoAccount } from '@/utils/account-helpers';

// ── Configuration ─────────────────────────────────────────────────────────────

export interface MarketingAccountConfig {
    /** Balance the account starts at (and resets to). */
    defaultBalance: number;
    /** ISO currency code, used for display formatting. */
    currency: string;
    /** Human-readable label shown on the reset button. */
    label?: string;
    /**
     * The demo account loginid paired with this real account.
     * When set, the hook tracks demo balance deltas and applies them to the
     * display balance. Identified by exact match, not prefix, so numeric or
     * UUID-format loginids are supported.
     */
    demoLoginid?: string;
}

/** Map of real account loginids → their marketing balance config. */
export const MARKETING_ACCOUNTS: Record<string, MarketingAccountConfig> = {
    '019eb5cd-4fff-7be6-8897-7eee94417835': {
        defaultBalance: 258.23,
        currency: 'USD',
        label: 'Marketing Demo',
        /** The associated demo account loginid for delta tracking. */
        demoLoginid: '690312599',
    },
    'ROT91867724': {
        defaultBalance: 356.21,
        currency: 'USD',
        /** The associated demo account loginid for delta tracking. */
        demoLoginid: 'DOT93169225',
    },
};

// ── Storage helpers ───────────────────────────────────────────────────────────

/** localStorage key for the tracked display balance (keyed by CR loginid). */
const balKey = (crLoginid: string) => `mktbal_v2_${crLoginid}`;

/** localStorage key for the Deriv reference balance (keyed by CR loginid). */
const refKey = (crLoginid: string) => `mktref_v2_${crLoginid}`;

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns true if `loginid` is one of the configured marketing CR accounts. */
export function isMarketingCR(loginid: string): boolean {
    return Object.prototype.hasOwnProperty.call(MARKETING_ACCOUNTS, loginid);
}

/** Returns the configured default balance for a marketing CR account. */
export function getDefaultBalance(crLoginid: string): number {
    return MARKETING_ACCOUNTS[crLoginid]?.defaultBalance ?? 0;
}

/** Returns the configured currency for a marketing CR account. */
export function getMarketingCurrency(crLoginid: string): string {
    return MARKETING_ACCOUNTS[crLoginid]?.currency ?? 'USD';
}

/**
 * Returns the configured demo loginid paired with this real account, or null
 * if no demo account is configured. Used for exact-ID matching rather than
 * relying on loginid prefixes (which don't work for numeric / UUID IDs).
 */
export function getMarketingDemoLoginid(crLoginid: string): string | null {
    return MARKETING_ACCOUNTS[crLoginid]?.demoLoginid ?? null;
}

/** Returns the configured real account paired with a demo loginid. */
export function getMarketingRealLoginid(demoLoginid: string): string | null {
    const entry = Object.entries(MARKETING_ACCOUNTS).find(([, config]) => config.demoLoginid === demoLoginid);
    return entry?.[0] ?? null;
}

/**
 * Auto-detect which account should act as the copy-trading leader for the
 * currently logged-in session. For demo accounts this is the current account;
 * for marketing real accounts it uses the paired demo account (for example
 * ROT -> DOT); for other real accounts it falls back to the current loginid.
 */
export function getAutoDetectedCopyTradingLeader(loginid: string, isVirtualAccountFlag?: boolean): string | null {
    if (!loginid) return null;

    if (isVirtualAccountFlag || isDemoAccount(loginid)) {
        return loginid;
    }

    return getMarketingDemoLoginid(loginid) ?? loginid;
}

/**
 * Call once when the marketing CR account is first detected in the account list.
 * If no prior session exists it initialises the balance to the configured
 * default and records `currentDerivBalance` as the reference point.
 * Returns the current display balance (default on first call, persisted value
 * thereafter).
 *
 * `currentDerivBalance` is the demo account's current balance; pass 0 if the
 * demo account is not available.
 */
export function initMarketingBalance(crLoginid: string, currentDerivBalance: number): number {
    const bKey = balKey(crLoginid);
    const rKey = refKey(crLoginid);
    const storedBal = localStorage.getItem(bKey);
    const storedRef = localStorage.getItem(rKey);

    const balNum = storedBal !== null ? parseFloat(storedBal) : NaN;
    const refNum = storedRef !== null ? parseFloat(storedRef) : NaN;

    // Reinitialise if either key is missing OR if either value parsed to NaN.
    if (isNaN(balNum) || isNaN(refNum)) {
        const defaultBal = getDefaultBalance(crLoginid);
        localStorage.setItem(bKey, String(defaultBal));
        localStorage.setItem(rKey, String(currentDerivBalance));
        return defaultBal;
    }

    // Returning visit — the persisted balance is already correct.
    return balNum;
}

/**
 * Called whenever the Deriv WebSocket sends a live balance update for the
 * demo account. Computes the delta relative to the last recorded reference,
 * applies it to our display balance, persists both, and returns the new
 * display balance. Returns null if the account has not been initialised.
 */
export function applyDerivUpdate(crLoginid: string, newDerivBalance: number): number | null {
    const bKey = balKey(crLoginid);
    const rKey = refKey(crLoginid);

    const storedBal = localStorage.getItem(bKey);
    const storedRef = localStorage.getItem(rKey);

    if (storedBal === null || storedRef === null) return null;

    const prevRef = parseFloat(storedRef);
    const currentDisplay = parseFloat(storedBal);
    if (isNaN(prevRef) || isNaN(currentDisplay)) return null;

    const delta = newDerivBalance - prevRef;
    if (delta === 0) return currentDisplay;

    const newDisplay = Math.max(0, parseFloat((currentDisplay + delta).toFixed(6)));
    localStorage.setItem(bKey, String(newDisplay));
    localStorage.setItem(rKey, String(newDerivBalance));

    return newDisplay;
}

/**
 * Resets the display balance back to the configured default.
 * `currentDerivBalance` becomes the new reference so future trade deltas are
 * computed correctly. Returns the new display balance (i.e. the default).
 */
export function resetMarketingBalance(crLoginid: string, currentDerivBalance: number): number {
    const defaultBal = getDefaultBalance(crLoginid);
    localStorage.setItem(balKey(crLoginid), String(defaultBal));
    localStorage.setItem(refKey(crLoginid), String(currentDerivBalance));
    return defaultBal;
}

/**
 * Returns the current stored display balance without modifying anything.
 * Returns null if the account has not been initialised yet.
 */
export function getStoredMarketingBalance(crLoginid: string): number | null {
    const stored = localStorage.getItem(balKey(crLoginid));
    return stored !== null ? parseFloat(stored) : null;
}

/**
 * Account routing for trading: if the given loginid is a marketing CR account,
 * returns the paired demo account loginid so trades execute on the demo.
 * Otherwise returns the original loginid unchanged.
 *
 * Usage: Use this function to determine which account should actually execute trades.
 * Example: tradingLoginid = getMarketingTradingAccount(selectedLoginid)
 */
export function getMarketingTradingAccount(loginid: string): string {
    if (isMarketingCR(loginid)) {
        const demoLoginid = getMarketingDemoLoginid(loginid);
        return demoLoginid ?? loginid; // Fallback to CR if demo not configured
    }
    return loginid;
}
