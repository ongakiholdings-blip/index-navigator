import { lazy, Suspense } from 'react';
import React from 'react';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom';
import { cleanupUrl, handleOAuthCallback } from '@/external/deriv-core';
import LocalStorageSyncWrapper from '@/components/localStorage-sync-wrapper';
import RoutePromptDialog from '@/components/route-prompt-dialog';
import IndexNavigatorLoader from '@/components/loader/index-navigator-loader';
import { useAccountSwitching } from '@/hooks/useAccountSwitching';
import { useLanguageFromURL } from '@/hooks/useLanguageFromURL';
import { StoreProvider } from '@/hooks/useStore';
import { isPreviewMode, PREVIEW_BASE_PATH } from '@/utils/is-preview-mode';
import { localize, TranslationProvider } from '@deriv-com/translations';
import CoreStoreProvider from './CoreStoreProvider';
import i18nInstance from './i18n';
import './app-root.scss';

const Layout = lazy(() => import('../components/layout'));
const AppRoot = lazy(() => import('./app-root'));

/**
 * Component wrapper to handle language URL parameter
 * Uses the useLanguageFromURL hook to process language switching
 */
const LanguageHandler = ({ children }: { children: React.ReactNode }) => {
    useLanguageFromURL();
    return <>{children}</>;
};

// The static preview build is served under /bot/preview (see rsbuild.config.ts
// assetPrefix), so React Router must resolve routes under that prefix. Standalone
// partner deploys are served at the root, so no basename there.
const routerBasename = isPreviewMode() ? PREVIEW_BASE_PATH : undefined;

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route
            path='/'
            element={
                    <Suspense
                    fallback={<IndexNavigatorLoader />}
                >
                    <TranslationProvider defaultLang='EN' i18nInstance={i18nInstance}>
                        <LanguageHandler>
                            <StoreProvider>
                                <LocalStorageSyncWrapper>
                                    <RoutePromptDialog />
                                    <CoreStoreProvider>
                                        <Layout />
                                    </CoreStoreProvider>
                                </LocalStorageSyncWrapper>
                            </StoreProvider>
                        </LanguageHandler>
                    </TranslationProvider>
                </Suspense>
            }
        >
            {/* All child routes will be passed as children to Layout */}
            <Route index element={<AppRoot />} />
            {/* App Builder embeds the template at /preview — render the same app shell */}
            <Route path='preview' element={<AppRoot />} />
        </Route>
    ),
    { basename: routerBasename }
);

/**
 * Main App component
 *
 * Responsibilities:
 * 1. OAuth callback handling (via vendored deriv-core handleOAuthCallback)
 * 2. Account switching from URL (via useAccountSwitching hook)
 * 3. Router provider setup
 */
function App() {
    // Handle account switching via URL parameter
    useAccountSwitching();

    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);

        // Deriv sends ?error=... when it rejects the OAuth request (e.g. redirect_uri
        // mismatch, country restriction, cancelled login). Surface this immediately so
        // it's visible rather than a silent failure.
        if (urlParams.has('error')) {
            const oauthError = urlParams.get('error');
            const oauthErrorDesc = urlParams.get('error_description') || '';
            console.error('[OAuth] Deriv returned an error during login:', oauthError, oauthErrorDesc);
            // Show a user-visible alert so the problem is obvious, then clean up the URL.
            window.alert(
                `Login failed — Deriv returned an error:\n\n${oauthError}\n${oauthErrorDesc}\n\nCheck that your app's redirect URI is registered correctly in the Deriv developer dashboard.`
            );
            cleanupUrl(window.location.origin);
            return;
        }

        if (!urlParams.has('code')) return;

        const redirectUri = window.location.origin;
        console.log('[OAuth] Handling callback. redirect_uri used:', redirectUri);

        const handleCallback = async () => {
            try {
                const authInfo = await handleOAuthCallback(window.location.href, {
                    clientId: process.env.NEXT_PUBLIC_DERIV_APP_ID || '',
                    redirectUri,
                    scopes: 'trade',
                });

                console.log('[OAuth] Token exchange succeeded. Fetching accounts...');

                const { DerivWSAccountsService } = await import('@/services/derivws-accounts.service');
                const accounts = await DerivWSAccountsService.fetchAccountsList(authInfo.access_token);

                if (accounts && accounts.length > 0) {
                    DerivWSAccountsService.storeAccounts(accounts);
                    const firstAccount = accounts[0];
                    localStorage.setItem('active_loginid', firstAccount.account_id);
                    const isDemo =
                        firstAccount.account_id.startsWith('VRT') || firstAccount.account_id.startsWith('VRTC');
                    localStorage.setItem('account_type', isDemo ? 'demo' : 'real');

                    const { api_base } = await import('@/external/bot-skeleton');
                    await api_base.init(true);
                } else {
                    console.error('[OAuth] No accounts returned after authentication');
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                console.error('[OAuth] Callback error:', msg);
                // Surface the error so it's visible in the UI, not just the console.
                window.alert(`Login error: ${msg}\n\nOpen the browser console (F12) for details.`);
            } finally {
                cleanupUrl(window.location.origin);
            }
        };

        handleCallback();
    }, []);

    return <RouterProvider router={router} />;
}

export default App;
