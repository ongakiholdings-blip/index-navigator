import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { addComma, getCurrencyDisplayCode, getDecimalPlaces } from '@/components/shared';
import Text from '@/components/shared_ui/text';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { useApiBase } from '@/hooks/useApiBase';
import { useMarketingBalance } from '@/hooks/useMarketingBalance';
import { useStore } from '@/hooks/useStore';
import { isDemoAccount } from '@/utils/account-helpers';
import { getMarketingTradingAccount } from '@/utils/marketing-balance';
import { Localize } from '@deriv-com/translations';
import { TAccountSwitcher } from './common/types';
import AccountInfoWrapper from './account-info-wrapper';
import './account-switcher.scss';

const AccountSwitcher = observer(({ activeAccount }: TAccountSwitcher) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const { accountList, activeLoginid } = useApiBase();
    const { client, run_panel } = useStore() ?? {};

    // ── Marketing balance ─────────────────────────────────────────────────────
    const { isMarketingActive, marketingCRLoginid, marketingDemoLoginid, marketingBalance } = useMarketingBalance(
        accountList
    );

    const is_bot_running = run_panel?.is_running || api_base.is_running;
    const isSingleAccount = !accountList || accountList.length <= 1;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const toggleDropdown = useCallback(() => {
        if (is_bot_running || isSingleAccount) return;
        setIsOpen(prev => !prev);
    }, [is_bot_running, isSingleAccount]);

    const handleAccountSelect = useCallback(
        (selectedLoginid: string) => {
            // Route marketing accounts through their demo account for trading
            const tradingLoginid = getMarketingTradingAccount(selectedLoginid);
            localStorage.setItem('active_loginid', tradingLoginid);
            client?.checkAndRegenerateWebSocket();
            setIsOpen(false);
        },
        [client]
    );

    // Format balance helper — returns the string shown in the dropdown for an account.
    const formatAccountBalance = useCallback(
        (account: { loginid: string; balance?: number | string; currency: string }) => {
            // Override for the marketing CR (real) account.
            if (isMarketingActive && account.loginid === marketingCRLoginid && marketingBalance !== null) {
                return addComma(marketingBalance.toFixed(getDecimalPlaces(account.currency)));
            }
            return addComma(Number(account.balance ?? 0).toFixed(getDecimalPlaces(account.currency)));
        },
        [isMarketingActive, marketingCRLoginid, marketingBalance]
    );

    const formattedAccounts = useMemo(() => {
        if (!accountList) return [];
        return accountList
            .map(account => {
                // Check if this account is the marketing CR account and it's currently in use
                // (via its demo account for trading)
                const isMarketingCRActive =
                    isMarketingActive &&
                    account.loginid === marketingCRLoginid &&
                    activeLoginid === marketingDemoLoginid;

                return {
                    loginid: account.loginid,
                    currency: account.currency,
                    balance: formatAccountBalance(account),
                    isVirtual: isDemoAccount(account.loginid),
                    isActive: account.loginid === activeLoginid || isMarketingCRActive,
                };
            })
            .sort((a, b) => (a.isActive ? -1 : b.isActive ? 1 : 0));
    }, [accountList, activeLoginid, formatAccountBalance, isMarketingActive, marketingCRLoginid, marketingDemoLoginid]);

    if (!activeAccount) return null;

    const { currency, isVirtual, balance } = activeAccount;
    const showChevron = !isSingleAccount && !is_bot_running;

    // ── Override header balance for the marketing CR (real) account ──────────
    // Check if the active trading account is the demo account linked to a marketing CR account
    const isActiveAccountMarketingCR =
        isMarketingActive &&
        marketingCRLoginid &&
        marketingDemoLoginid &&
        activeLoginid === marketingDemoLoginid;

    const displayBalance =
        isActiveAccountMarketingCR && marketingBalance !== null
            ? addComma(marketingBalance.toFixed(getDecimalPlaces(currency ?? 'USD')))
            : balance;

    return (
        <div className='acc-info__wrapper' ref={wrapperRef}>
            <AccountInfoWrapper>
                <div
                    data-testid='dt_acc_info'
                    id='dt_core_account-info_acc-info'
                    role={showChevron ? 'button' : undefined}
                    tabIndex={showChevron ? 0 : -1}
                    aria-expanded={showChevron ? isOpen : undefined}
                    aria-haspopup={showChevron ? 'listbox' : undefined}
                    className={classNames('acc-info', {
                        'acc-info--is-virtual': isVirtual && !isActiveAccountMarketingCR,
                        'acc-info--interactive': showChevron,
                    })}
                    onClick={toggleDropdown}
                    onKeyDown={e => {
                        if (showChevron && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            toggleDropdown();
                        }
                    }}
                >
                    <span className='acc-info__id' aria-hidden='true'></span>
                    <span className='acc-info__avatar' aria-hidden='true'>
                        {isVirtual && !isActiveAccountMarketingCR ? 'D' : 'R'}
                    </span>
                    <div className='acc-info__content'>
                        <div className='acc-info__account-type-header'>
                            <Text as='p' size='xs' className='acc-info__account-type acc-info__account-type--visually-hidden'>
                                {isActiveAccountMarketingCR ? (
                                    <Localize i18n_default_text='Real account' />
                                ) : isVirtual ? (
                                    <Localize i18n_default_text='Demo account' />
                                ) : (
                                    <Localize i18n_default_text='Real account' />
                                )}
                            </Text>
                            <span className='acc-info__loginid'>{activeLoginid || activeAccount.loginid}</span>
                            {showChevron && (
                                <span
                                    className={classNames('acc-info__select-arrow', {
                                        'acc-info__select-arrow--invert': isOpen,
                                    })}
                                >
                                    <svg width='12' height='12' viewBox='0 0 12 12' fill='none'>
                                        <path
                                            d='M2 4L6 8L10 4'
                                            stroke='currentColor'
                                            strokeWidth='1.5'
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                        />
                                    </svg>
                                </span>
                            )}
                        </div>
                        {(typeof balance !== 'undefined' || !currency) && (
                            <div className='acc-info__balance-section'>
                                <p
                                    data-testid='dt_balance'
                                    className={classNames('acc-info__balance', {
                                        'acc-info__balance--no-currency': !currency && !isVirtual,
                                    })}
                                >
                                    {!currency ? (
                                        <Localize i18n_default_text='No currency assigned' />
                                    ) : (
                                        `${displayBalance} ${getCurrencyDisplayCode(currency)}`
                                    )}
                                </p>
                            </div>
                        )}
                    </div>
                    <span className='acc-info__selected' aria-hidden='true'>✓</span>
                </div>
            </AccountInfoWrapper>

            {isOpen && (
                <div className='acc-dropdown' role='listbox'>
                    {formattedAccounts.map(account => (
                        <div key={account.loginid}>
                            <div
                                role='option'
                                aria-selected={account.isActive}
                                tabIndex={0}
                                className={classNames('acc-dropdown__account', {
                                    'acc-dropdown__account--selected': account.isActive,
                                    'acc-dropdown__account--virtual': account.isVirtual,
                                })}
                                onClick={() => !account.isActive && handleAccountSelect(account.loginid)}
                                onKeyDown={e => {
                                    if (!account.isActive && (e.key === 'Enter' || e.key === ' ')) {
                                        e.preventDefault();
                                        handleAccountSelect(account.loginid);
                                    }
                                }}
                            >
                                <Text
                                    size='xxxs'
                                    className={classNames('acc-dropdown__account-type', {
                                        'acc-dropdown__account-type--virtual': account.isVirtual,
                                    })}
                                >
                                    {account.isVirtual ? (
                                        <Localize i18n_default_text='Demo account' />
                                    ) : (
                                        <Localize i18n_default_text='Real account' />
                                    )}
                                </Text>
                                <Text size='xs' weight='bold' className='acc-dropdown__balance'>
                                    {account.currency ? (
                                        `${account.balance} ${getCurrencyDisplayCode(account.currency)}`
                                    ) : (
                                        <Localize i18n_default_text='No currency assigned' />
                                    )}
                                </Text>
                            </div>

                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});

export default AccountSwitcher;
