import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { LegacyChevronRight1pxIcon } from '@deriv/quill-icons/Legacy';
import { MenuItem, Text, useDevice } from '@deriv-com/ui';
import useMobileMenuConfig from './use-mobile-menu-config';

type TMenuContentProps = {
    enableThemeToggle?: boolean;
    onOpenSubmenu?: (submenu: string) => void;
    onLogout?: () => void;
};

const MenuContent = observer(({ enableThemeToggle = true, onOpenSubmenu, onLogout }: TMenuContentProps) => {
    const { isDesktop } = useDevice();
    const { client } = useStore();
    const { setTheme } = useThemeSwitcher();
    const textSize = isDesktop ? 'sm' : 'md';
    // Pass enableThemeToggle to control theme toggle visibility
    const { config } = useMobileMenuConfig(client, onLogout, enableThemeToggle);

    return (
        <div className='mobile-menu__content'>
            <div className='mobile-menu__content__items'>
                {config.map((item, index) => {
                    const removeBorderBottom = item.find(({ removeBorderBottom }) => removeBorderBottom);
                    const isLastSection = index === config.length - 1;
                    const isSocialSection = index === 0;

                    return (
                        <div
                            className={clsx('mobile-menu__content__items--padding', {
                                'mobile-menu__content__items--bottom-border': !removeBorderBottom && !isLastSection,
                                'mobile-menu__content__items--social': isSocialSection,
                            })}
                            data-testid='dt_menu_item'
                            key={index}
                        >
                            {item.map(
                                (
                                    {
                                        LeftComponent,
                                        RightComponent,
                                        as,
                                        href,
                                        label,
                                        onClick,
                                        submenu,
                                        target,
                                        isActive,
                                        appearance,
                                        theme,
                                        variant,
                                    },
                                    itemIndex
                                ) => {
                                    if (appearance) {
                                        return (
                                            <div className='mobile-menu__content__items__appearance' key={`${index}-${itemIndex}-${label}`}>
                                                <div className='mobile-menu__content__items__appearance__title'>Appearance</div>
                                                <div className='mobile-menu__content__items__appearance__options'>
                                                    <button
                                                        type='button'
                                                        className={clsx('mobile-menu__content__items__appearance__card', {
                                                            'mobile-menu__content__items__appearance__card--active': theme === 'light',
                                                        })}
                                                        onClick={() => setTheme('light')}
                                                        aria-pressed={theme === 'light'}
                                                    >
                                                        <span className='mobile-menu__content__items__appearance__icon' aria-hidden='true'>☼</span>
                                                        <span className='mobile-menu__content__items__appearance__copy'>
                                                            <strong>Light</strong>
                                                            <small>Bright surfaces, crisp contrast</small>
                                                        </span>
                                                    </button>
                                                    <button
                                                        type='button'
                                                        className={clsx('mobile-menu__content__items__appearance__card mobile-menu__content__items__appearance__card--dark', {
                                                            'mobile-menu__content__items__appearance__card--active': theme === 'dark',
                                                        })}
                                                        onClick={() => setTheme('dark')}
                                                        aria-pressed={theme === 'dark'}
                                                    >
                                                        <span className='mobile-menu__content__items__appearance__icon' aria-hidden='true'>☾</span>
                                                        <span className='mobile-menu__content__items__appearance__copy'>
                                                            <strong>Dark</strong>
                                                            <small>Easier on the eyes in low light</small>
                                                        </span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }
                                    const is_deriv_logo = label === 'Deriv.com';
                                    if (as === 'a') {
                                        return (
                                            <MenuItem
                                                as='a'
                                                className={clsx('mobile-menu__content__items__item', {
                                                    'mobile-menu__content__items__icons': !is_deriv_logo,
                                                    'mobile-menu__content__items__item--active': isActive,
                                                    'mobile-menu__content__items__item--social-card': isSocialSection,
                                                    'mobile-menu__content__items__item--logout': variant === 'logout',
                                                })}
                                                disableHover
                                                href={href}
                                                key={`${index}-${itemIndex}-${label}`}
                                                leftComponent={
                                                    <LeftComponent
                                                        className='mobile-menu__content__items--right-margin'
                                                        height={16}
                                                        width={16}
                                                    />
                                                }
                                                target={target}
                                            >
                                                <Text size={textSize}>{label}</Text>
                                            </MenuItem>
                                        );
                                    }
                                    return (
                                        <MenuItem
                                            as='button'
                                            className={clsx('mobile-menu__content__items__item', {
                                                'mobile-menu__content__items__icons': !is_deriv_logo,
                                                'mobile-menu__content__items__item--active': isActive,
                                                'mobile-menu__content__items__item--social-card': isSocialSection,
                                            })}
                                            disableHover
                                            key={`${index}-${itemIndex}-${label}`}
                                            leftComponent={
                                                <LeftComponent
                                                    className='mobile-menu__content__items--right-margin'
                                                    iconSize='xs'
                                                />
                                            }
                                            onClick={() => {
                                                if (submenu && onOpenSubmenu) {
                                                    onOpenSubmenu(submenu);
                                                } else if (onClick) {
                                                    onClick();
                                                }
                                            }}
                                            rightComponent={
                                                submenu ? (
                                                    <LegacyChevronRight1pxIcon
                                                        className='mobile-menu__content__items--chevron'
                                                        iconSize='xs'
                                                    />
                                                ) : (
                                                    RightComponent
                                                )
                                            }
                                        >
                                            <Text size={textSize}>{label}</Text>
                                        </MenuItem>
                                    );
                                }
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

export default MenuContent;
