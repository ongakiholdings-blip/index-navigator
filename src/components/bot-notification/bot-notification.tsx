import React from 'react';
import { toast } from 'react-toastify';
import { notification_style, TAction, TNotificationContent, TNotificationStyle } from './bot-notification-utils';

export const NotificationContent: React.FC<TNotificationContent> = ({ message, primary_action, closeToast }) => {
    React.useEffect(() => {
        const handleToastVisibility = () => {
            if (document.visibilityState === 'hidden') {
                toast.dismiss();
            }
        };

        document.addEventListener('visibilitychange', handleToastVisibility);

        return () => {
            document.removeEventListener('visibilitychange', handleToastVisibility);
        };
    }, []);

    return (
        <div className='notification-content' data-testid='dt_bot_notification'>
            <div>{message}</div>
            {primary_action && (
                <button onClick={() => primary_action.onClick(closeToast)}>{primary_action.label}</button>
            )}
        </div>
    );
};

export const botNotification = (
    message: string,
    primary_action?: TAction,
    custom_style?: Partial<TNotificationStyle>
) => {
    return toast(
        ({ closeToast }) => (
            <NotificationContent message={message} primary_action={primary_action} closeToast={closeToast} />
        ),
        {
            type: custom_style?.type ?? notification_style.type,
            position: custom_style?.position ?? notification_style.position,
            autoClose: custom_style?.autoClose ?? notification_style.autoClose,
            hideProgressBar: custom_style?.hideProgressBar ?? notification_style.hideProgressBar,
            closeOnClick: custom_style?.closeOnClick ?? notification_style.closeOnClick,
            pauseOnHover: custom_style?.pauseOnHover ?? notification_style.pauseOnHover,
            pauseOnFocusLoss: custom_style?.pauseOnFocusLoss ?? notification_style.pauseOnFocusLoss,
            closeButton: custom_style?.closeButton ?? true,
            className: custom_style?.className ?? '',
        }
    );
};

export const sessionCompleteNotification = ({
    profit,
    trades,
    won,
    lost,
    reason,
}: {
    profit: number;
    trades: number;
    won: number;
    lost: number;
    reason: 'take-profit' | 'stop-loss';
}) => {
    return toast(
        ({ closeToast }) => (
            <div className='session-complete-notification'>
                <span className='session-complete-notification__eyebrow'>BULK SESSION COMPLETE</span>
                <strong className='session-complete-notification__title'>
                    {reason === 'take-profit' ? 'Take Profit Reached' : 'Stop Loss Reached'}
                </strong>
                <strong className={`session-complete-notification__profit${profit < 0 ? ' session-complete-notification__profit--negative' : ''}`}>
                    {profit >= 0 ? '+' : ''}{profit.toFixed(2)} USD
                </strong>
                <div className='session-complete-notification__stats'>
                    <div><span>TRADES</span><strong>{trades}</strong></div>
                    <div><span>WON</span><strong>{won}</strong></div>
                    <div><span>LOST</span><strong>{lost}</strong></div>
                </div>
                <button className='session-complete-notification__continue' onClick={closeToast} type='button'>
                    CONTINUE
                </button>
            </div>
        ),
        {
            type: profit >= 0 ? 'success' : 'error',
            position: 'top-center',
            autoClose: false,
            closeButton: false,
            closeOnClick: false,
            className: 'session-complete-toast',
        }
    );
};
