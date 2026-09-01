import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { resolvePairedAccountInfo } from '@/stores/copy-trading-store';
import { isDemoAccount } from '@/utils/account-helpers';
import { getAutoDetectedCopyTradingLeader } from '@/utils/marketing-balance';
import './copy-trading.scss';

// ── icons ────────────────────────────────────────────────────────────────────

const IconPlay = () => (
    <svg width='13' height='13' viewBox='0 0 24 24' fill='currentColor'>
        <polygon points='5 3 19 12 5 21 5 3' />
    </svg>
);
const IconStop = () => (
    <svg width='13' height='13' viewBox='0 0 24 24' fill='currentColor'>
        <rect x='3' y='3' width='18' height='18' rx='2' />
    </svg>
);
const IconClose = () => (
    <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5'>
        <line x1='18' y1='6' x2='6' y2='18' />
        <line x1='6' y1='6' x2='18' y2='18' />
    </svg>
);
const IconKey = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
        <circle cx='7.5' cy='15.5' r='5.5' />
        <path d='M21 2l-9.6 9.6' />
        <path d='M15.5 7.5l3 3' />
    </svg>
);
const IconUsers = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
        <path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' />
        <circle cx='9' cy='7' r='4' />
        <path d='M23 21v-2a4 4 0 0 0-3-3.87' />
        <path d='M16 3.13a4 4 0 0 1 0 7.75' />
    </svg>
);
const IconDemoReal = () => (
    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
        <rect x='2' y='3' width='20' height='14' rx='2' />
        <path d='M8 21h8M12 17v4' />
        <path d='M9 10l2 2 4-4' />
    </svg>
);
const IconTag = () => (
    <svg width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' opacity='0.35'>
        <path d='M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z' />
        <line x1='7' y1='7' x2='7.01' y2='7' />
    </svg>
);
const IconCopy = () => (
    <svg width='52' height='52' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' opacity='0.8'>
        <circle cx='12' cy='12' r='3' />
        <path d='M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83' />
    </svg>
);
const IconDisconnect = () => (
    <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5'>
        <path d='M18.36 6.64a9 9 0 1 1-12.73 0' />
        <line x1='12' y1='2' x2='12' y2='12' />
    </svg>
);
const IconAlert = () => (
    <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
        <circle cx='12' cy='12' r='10' />
        <line x1='12' y1='8' x2='12' y2='12' />
        <line x1='12' y1='16' x2='12.01' y2='16' />
    </svg>
);
const IconEye = () => (
    <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'>
        <path d='M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z' />
        <circle cx='12' cy='12' r='2.8' />
    </svg>
);

// ── helpers ───────────────────────────────────────────────────────────────────

const maskToken = (t: string) => (t.length > 10 ? `${t.slice(0, 4)}...${t.slice(-4)}` : t);
const fmtBalance = (b: number, currency: string) => `${b.toFixed(2)} ${currency}`;
const fmtDate = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ── main page ─────────────────────────────────────────────────────────────────

const CopyTrading = observer(() => {
    const store = useStore();
    const ct = store.copy_trading;

    const handleFollowerKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') ct.addFollower();
    };

    const handleConnectLeader = async () => {
        try {
            const client = store.client;
            const liveApi = api_base?.api || undefined;
            const liveAccountInfo = (api_base as any)?.account_info || {};
            const activeLoginid = client?.loginid || liveAccountInfo?.loginid || api_base?.account_id || '';
            const activeBalance = client?.balance ?? liveAccountInfo?.balance ?? 0;
            const activeCurrency = client?.currency ?? liveAccountInfo?.currency ?? 'USD';
            const activeIsVirtual = client?.is_virtual ?? liveAccountInfo?.is_virtual ?? (activeLoginid ? isDemoAccount(activeLoginid) : false);
            const detectedLeaderLoginid = getAutoDetectedCopyTradingLeader(activeLoginid, !!activeIsVirtual);

            if (!activeLoginid || !detectedLeaderLoginid || !liveApi) return;

            await ct.connectLeaderFromApi(liveApi, {
                loginid: detectedLeaderLoginid,
                balance: parseFloat(String(activeBalance)) || 0,
                currency: activeCurrency,
                is_virtual: activeIsVirtual ? 1 : 0,
            });

            if (activeLoginid !== detectedLeaderLoginid) {
                await ct.connectFollowerFromApi(liveApi, {
                    loginid: activeLoginid,
                    balance: parseFloat(String(activeBalance)) || 0,
                    currency: activeCurrency,
                    is_virtual: activeIsVirtual ? 1 : 0,
                });
            }
        } catch (e) {
            // ignore auto-detect failures
        }
    };

    const client = store.client;
    const liveAccountInfo = (api_base as any)?.account_info || {};
    const activeLoginid = client?.loginid || liveAccountInfo?.loginid || api_base?.account_id || '';
    const activeBalance = client?.balance ?? liveAccountInfo?.balance ?? 0;
    const activeCurrency = client?.currency ?? liveAccountInfo?.currency ?? 'USD';
    const activeIsVirtual = client?.is_virtual ?? liveAccountInfo?.is_virtual ?? (activeLoginid ? isDemoAccount(activeLoginid) : false);
    const storedAccounts = DerivWSAccountsService.getStoredAccounts();
    const pairedAccount = resolvePairedAccountInfo({
        currentLoginid: activeLoginid,
        isVirtualAccount: !!activeIsVirtual,
        accounts: storedAccounts,
    });
    const connectedFollowers = ct.followers.filter(f => f.status === 'connected');
    const connectedFollowerAccount = connectedFollowers.find(f => f.account)?.account ?? null;
    const displayAccount = connectedFollowerAccount ?? pairedAccount ?? ct.leader_account;
    const hasActiveFollower = connectedFollowers.length > 0 || !!ct.leader_account;
    const canStart = ct.leader_status === 'connected' && !ct.is_running && hasActiveFollower;
    const canStop = ct.is_running;
    const connectionSummary = ct.is_running
        ? localize('Copy trading is active and listening for new trades.')
        : ct.leader_status === 'connected' && hasActiveFollower
            ? localize('Leader and follower accounts are connected. Press Start to begin copying.')
            : ct.leader_status === 'connected'
                ? localize('Leader account connected. Waiting for a follower account to become active.')
                : ct.leader_status === 'connecting'
                    ? localize('Connecting your account for copy trading…')
                    : localize('Not connected yet. Connect your account to begin.');

    return (
        <div className='ct2'>
            {(ct.error_messages?.length ?? 0) > 0 && (
                <div className='ct2__toasts'>
                    {ct.error_messages.map((msg, i) => (
                        <div key={i} className='ct2__toast'>
                            <IconAlert />
                            <span className='ct2__toast-text'>{msg}</span>
                            <button
                                className='ct2__toast-close'
                                onClick={() => ct.dismissError(i)}
                                aria-label={localize('Dismiss')}
                            >
                                <IconClose />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className='ct2__panel'>
                <header className='ct2__panel-header'>
                    <div>
                        <div className='ct2__title-row'>
                            <h1>{localize('Copy Trading')}</h1>
                            <span className={`ct2__status ct2__status--${ct.is_running ? 'active' : 'offline'}`}>
                                <span />
                                {ct.is_running ? localize('Active') : localize('Offline')}
                            </span>
                        </div>
                        <p>{localize('Copy trades from this account to your connected client accounts.')}</p>
                    </div>
                    {canStop ? (
                        <button className='ct2__start-btn ct2__start-btn--stop' onClick={() => ct.stopCopying()}>
                            <IconStop /> {localize('Stop')}
                        </button>
                    ) : (
                        <button className='ct2__start-btn' onClick={() => void ct.startCopying()} disabled={!canStart}>
                            <IconPlay /> {localize('Start')}
                        </button>
                    )}
                </header>

                <section className='ct2__section'>
                    <div className='ct2__section-heading'>
                        <h2>{localize('Client API Token')}</h2>
                        {ct.leader_status === 'connected' ? (
                            <span className='ct2__leader-status'>{localize('Source account connected')}</span>
                        ) : (
                            <button
                                className='ct2__connect-btn'
                                onClick={handleConnectLeader}
                                disabled={ct.leader_status === 'connecting' || ct.is_running}
                            >
                                {ct.leader_status === 'connecting' ? localize('Connecting…') : localize('Connect source account')}
                            </button>
                        )}
                    </div>
                    <div className='ct2__token-row'>
                        <div className='ct2__token-input-wrap'>
                            <input
                                className='ct2__token-input'
                                type='text'
                                placeholder={localize('Paste a token with trading permission')}
                                value={ct.new_follower_token}
                                onChange={e => ct.setNewFollowerToken(e.target.value)}
                                onKeyDown={handleFollowerKeyDown}
                                disabled={ct.is_running}
                            />
                            <IconEye />
                        </div>
                        <button className='ct2__add-btn' onClick={() => ct.addFollower()} disabled={!ct.new_follower_token || ct.is_running}>
                            + {localize('Add')}
                        </button>
                    </div>
                    <div className='ct2__multiplier-row'>
                        <label className='ct2__multiplier-label' htmlFor='ct2-mult'>{localize('Stake multiplier')}</label>
                        <input id='ct2-mult' className='ct2__multiplier-input' type='number' min='0.01' max='100' step='0.1'
                            value={ct.stake_multiplier} onChange={e => ct.setStakeMultiplier(parseFloat(e.target.value) || 1)}
                            disabled={ct.is_running} />
                        <span className='ct2__multiplier-hint'>{localize('1.0 copies the original stake')}</span>
                    </div>
                    {ct.leader_error && <span className='ct2__error-text'>{ct.leader_error}</span>}
                </section>

                <section className='ct2__section ct2__clients'>
                    <div className='ct2__section-heading'>
                        <h2>{localize('Connected Clients')}</h2>
                        <span className='ct2__client-count'>{connectedFollowers.length} <small>{ct.followers.length}</small></span>
                    </div>
                    {ct.followers.length === 0 ? (
                        <div className='ct2__empty-state'>{localize('No clients yet')}</div>
                    ) : (
                        <div className='ct2__account-list'>
                            {ct.followers.map(f => (
                                <div key={f.token} className='ct2__account-row'>
                                    <div className='ct2__account-row-left'>
                                        <span className={`ct2__acct-status-dot ct2__acct-status-dot--${f.status}`} />
                                        <div className='ct2__account-row-info'>
                                            <span className='ct2__account-row-id'>{f.account?.loginid ?? maskToken(f.token)}</span>
                                            {f.account && <span className='ct2__account-row-bal'>{fmtBalance(f.account.balance, f.account.currency)}</span>}
                                            {f.status === 'error' && <span className='ct2__account-row-status ct2__account-row-status--err'>{f.error || localize('Error')}</span>}
                                        </div>
                                    </div>
                                    {!ct.is_running && <button className='ct2__remove-btn' title={localize('Remove')} onClick={() => ct.removeFollower(f.token)}><IconClose /></button>}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
});

export default CopyTrading;
