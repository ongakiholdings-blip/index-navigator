import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL } from '@/components/shared';
import Button from '@/components/shared_ui/button';
import useActiveAccount from '@/hooks/api/account/useActiveAccount';
import { useApiBase } from '@/hooks/useApiBase';
import { useLogout } from '@/hooks/useLogout';
import { useStore } from '@/hooks/useStore';
import { navigateToTransfer } from '@/utils/transfer-utils';
import { Localize } from '@deriv-com/translations';
import { Header, useDevice, Wrapper } from '@deriv-com/ui';
import { AppLogo } from '../app-logo';
import AccountSwitcher from './account-switcher';
import ApiTokenModal from './api-token-modal';
import MenuItems from './menu-items';
import MobileMenu from './mobile-menu';
import './header.scss';

const AppHeader = observer(() => {
    const { isDesktop } = useDevice();
    const { isAuthorizing, activeLoginid, setIsAuthorizing, authData } = useApiBase();
    const { client } = useStore() ?? {};
    const [authTimeout, setAuthTimeout] = useState(false);
    const [showApiTokenModal, setShowApiTokenModal] = useState(false);
    const [showCurrencyDrawer, setShowCurrencyDrawer] = useState(false);
    const [displayCurrency, setDisplayCurrency] = useState<'KES' | 'USD'>(() =>
        localStorage.getItem('index_navigator_display_currency') === 'USD' ? 'USD' : 'KES'
    );
    const [usdToKes, setUsdToKes] = useState<number | null>(null);
    const is_account_regenerating = client?.is_account_regenerating || false;

    // Detect OAuth callback on mount (before App.tsx cleans up the URL).
    // When ?code=...&state=... is present the full auth flow can take 7-15 s
    // (token exchange → accounts fetch → OTP → WebSocket auth), so we must
    // suppress the short fallback timeout and keep the spinner throughout.
    const [isOAuthPending, setIsOAuthPending] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return Boolean(params.get('code') && params.get('state'));
    });

    const { data: activeAccount } = useActiveAccount({
        allBalanceData: client?.all_accounts_balance,
        directBalance: client?.balance,
    });

    const handleLogout = useLogout();

    // Clear OAuth-pending flag once the account is set (auth succeeded)
    // or after a generous timeout in case something goes wrong.
    useEffect(() => {
        if (!isOAuthPending) return;

        if (activeLoginid) {
            setIsOAuthPending(false);
            return;
        }

        // Safety net: give up after 30 s and let the normal flow decide
        const timer = setTimeout(() => setIsOAuthPending(false), 30_000);
        return () => clearTimeout(timer);
    }, [isOAuthPending, activeLoginid]);

    // Handle direct URL access with legacy token param
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const account_id = urlParams.get('account_id');
        if (account_id) {
            setIsAuthorizing(true);
        }
    }, [setIsAuthorizing]);

    // Fallback timeout: show login button if auth never resolves.
    // Suppressed during the OAuth callback flow (isOAuthPending = true).
    useEffect(() => {
        if (isOAuthPending) return;

        const timer = setTimeout(() => {
            if (isAuthorizing && !activeLoginid) {
                setAuthTimeout(true);
                setIsAuthorizing(false);
            }
        }, 5000);

        if (activeLoginid || !isAuthorizing) {
            if (authTimeout) setAuthTimeout(false);
            clearTimeout(timer);
        }

        return () => clearTimeout(timer);
    }, [isAuthorizing, activeLoginid, setIsAuthorizing, authTimeout, isOAuthPending]);

    const handleSignup = useCallback(async () => {
        try {
            setIsAuthorizing(true);
            const oauthUrl = await generateOAuthURL('registration');

            if (oauthUrl) {
                window.location.replace(oauthUrl);
            } else {
                setIsAuthorizing(false);
            }
        } catch (error) {
            console.error('Sign-up redirection failed:', error);
            setIsAuthorizing(false);
        }
    }, [setIsAuthorizing]);

    const handleLogin = useCallback(async () => {
        try {
            // Set authorizing state immediately when login is clicked
            setIsAuthorizing(true);

            // Generate OAuth URL with CSRF token and PKCE parameters
            const oauthUrl = await generateOAuthURL();

            if (oauthUrl) {
                // Redirect to OAuth URL
                window.location.replace(oauthUrl);
            } else {
                console.error('Failed to generate OAuth URL');
                setIsAuthorizing(false);
            }
        } catch (error) {
            console.error('Login redirection failed:', error);
            // Reset authorizing state if redirection fails
            setIsAuthorizing(false);
        }
    }, [setIsAuthorizing]);

    const handleTransfer = useCallback(() => {
        const transferCurrency = authData?.currency;
        if (!transferCurrency) {
            console.error('No currency available for transfer');
            return;
        }
        navigateToTransfer(transferCurrency);
    }, [authData?.currency]);

    useEffect(() => {
        let cancelled = false;
        const cached = Number(localStorage.getItem('index_navigator_usd_kes_rate'));
        const cachedAt = Number(localStorage.getItem('index_navigator_usd_kes_rate_at'));
        if (cached > 0 && Date.now() - cachedAt < 6 * 60 * 60 * 1000) setUsdToKes(cached);
        fetch('https://api.frankfurter.app/latest?from=USD&to=KES')
            .then(response => {
                if (!response.ok) throw new Error(`Exchange-rate request failed (${response.status})`);
                return response.json() as Promise<{ rates?: { KES?: number } }>;
            })
            .then(data => {
                const rate = Number(data.rates?.KES);
                if (!cancelled && rate > 0) {
                    setUsdToKes(rate);
                    localStorage.setItem('index_navigator_usd_kes_rate', String(rate));
                    localStorage.setItem('index_navigator_usd_kes_rate_at', String(Date.now()));
                }
            })
            .catch(error => console.warn('[Currency] Unable to refresh USD/KES rate:', error));
        return () => {
            cancelled = true;
        };
    }, []);

    const selectDisplayCurrency = (currency: 'KES' | 'USD') => {
        setDisplayCurrency(currency);
        localStorage.setItem('index_navigator_display_currency', currency);
        setShowCurrencyDrawer(false);
    };

    const accountBalance = Number(String(activeAccount?.balance ?? client?.balance ?? '0').replace(/,/g, '')) || 0;
    const accountCurrency = activeAccount?.currency || authData?.currency || 'USD';
    const balanceInUsd = accountCurrency === 'USD' ? accountBalance : accountBalance / (usdToKes || 1);
    const displayedBalance =
        displayCurrency === 'KES' && usdToKes ? balanceInUsd * usdToKes : balanceInUsd;

    const renderAccountSection = useCallback(
        (position: 'left' | 'right' = 'right') => {
            // Show account switcher and logout when user is fully authenticated
            if (activeLoginid && !is_account_regenerating) {
                if (position === 'left' && !isDesktop) {
                    // Keep mobile account controls together on the right, after Transfer.
                    return null;
                } else if (position === 'right') {
                    // Keep the display balance and currency choice before transfer.
                    return (
                        <div className='auth-actions'>
                            <div className='currency-control'>
                                <button
                                    className='currency-control__button'
                                    type='button'
                                    onClick={() => setShowCurrencyDrawer(value => !value)}
                                    aria-expanded={showCurrencyDrawer}
                                    aria-label='Choose display currency'
                                >
                                    {displayCurrency}
                                </button>
                                {showCurrencyDrawer && (
                                    <div className='currency-control__drawer' role='dialog' aria-label='Display currency'>
                                        <strong>Display balance in</strong>
                                        <button type='button' onClick={() => selectDisplayCurrency('KES')} className={displayCurrency === 'KES' ? 'is-selected' : ''}>
                                            KSH — Kenyan Shilling
                                        </button>
                                        <button type='button' onClick={() => selectDisplayCurrency('USD')} className={displayCurrency === 'USD' ? 'is-selected' : ''}>
                                            USD — US Dollar
                                        </button>
                                        {usdToKes && <small>1 USD ≈ {usdToKes.toFixed(2)} KSH</small>}
                                    </div>
                                )}
                            </div>
                            <div className='auth-actions__balance'>
                                <span>Balance</span>
                                <strong>{displayCurrency} {displayedBalance.toFixed(2)}</strong>
                            </div>
                            <Button
                                className='auth-actions__transfer-btn'
                                primary
                                disabled={client?.is_logging_out || !authData?.currency}
                                onClick={handleTransfer}
                            >
                                <Localize i18n_default_text='Transfer' />
                            </Button>
                            <div className='account-info'><AccountSwitcher activeAccount={activeAccount} /></div>
                        </div>
                    );
                }
            }
            // Show login button only when fully settled (not during OAuth flow)
            else if (
                position === 'right' &&
                !isOAuthPending &&
                ((!is_account_regenerating && !isAuthorizing && !activeLoginid) || authTimeout)
            ) {
                // NEXT_PUBLIC_DERIV_APP_ID is baked in at build time by rsbuild.
                // If it is empty the OAuth flow cannot work — surface a clear banner
                // so the issue is immediately visible rather than silently disabled buttons.
                const isAuthConfigured = Boolean(process.env.NEXT_PUBLIC_DERIV_APP_ID);

                if (!isAuthConfigured) {
                    return (
                        <div className='auth-actions auth-actions--unconfigured'>
                            <span className='auth-actions__warning'>
                                ⚠️&nbsp;
                                <strong>App ID not set.</strong>&nbsp;
                                Add&nbsp;<code>NEXT_PUBLIC_DERIV_APP_ID</code>&nbsp;to your Vercel environment variables,
                                then redeploy.&nbsp;
                                <a
                                    href='https://developers.deriv.com/dashboard/'
                                    target='_blank'
                                    rel='noopener noreferrer'
                                >
                                    Get an App ID ↗
                                </a>
                            </span>
                        </div>
                    );
                }

                return (
                    <div className='auth-actions'>
                        <button
                            className='auth-actions__api-token-btn'
                            onClick={() => setShowApiTokenModal(true)}
                            title='Connect using a Deriv API token'
                        >
                            🔑&nbsp;<Localize i18n_default_text='API Token' />
                        </button>
                        <Button tertiary onClick={handleLogin}>
                            <Localize i18n_default_text='Log in' />
                        </Button>
                        <Button primary_light onClick={handleSignup}>
                            <Localize i18n_default_text='Sign up' />
                        </Button>
                    </div>
                );
            }
            // Default: Show spinner during loading states or when authorizing
            else if (position === 'right') {
                return (
                    <div className='auth-actions auth-actions--loading'>
                        <svg
                            className='auth-actions__spinner'
                            viewBox='0 0 24 24'
                            fill='none'
                            xmlns='http://www.w3.org/2000/svg'
                        >
                            <circle
                                cx='12'
                                cy='12'
                                r='10'
                                stroke='currentColor'
                                strokeWidth='2.5'
                                strokeLinecap='round'
                                strokeDasharray='31.416'
                                strokeDashoffset='10'
                            />
                        </svg>
                    </div>
                );
            }

            return null;
        },
        [
            isAuthorizing,
            isDesktop,
            activeLoginid,
            client,
            activeAccount,
            authTimeout,
            is_account_regenerating,
            isOAuthPending,
            authData,
            displayCurrency,
            displayedBalance,
            handleTransfer,
            selectDisplayCurrency,
            showCurrencyDrawer,
            usdToKes,
            handleLogin,
            handleSignup,
        ]
    );

    if (client?.should_hide_header) return null;

    return (
        <>
            <Header
                className={clsx('app-header', {
                    'app-header--desktop': isDesktop,
                    'app-header--mobile': !isDesktop,
                })}
            >
                <Wrapper variant='left'>
                    <MobileMenu onLogout={handleLogout} />
                    <AppLogo />
                    {isDesktop ? <MenuItems /> : renderAccountSection('left')}
                </Wrapper>
                <Wrapper variant='right'>
                    {renderAccountSection('right')}
                </Wrapper>
            </Header>
            {showApiTokenModal && (
                <ApiTokenModal onClose={() => setShowApiTokenModal(false)} />
            )}
        </>
    );
});

export default AppHeader;
