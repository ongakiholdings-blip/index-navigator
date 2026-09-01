import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import OnboardTourHandler from '../tutorials/dbot-tours/onboarding-tour';
import Announcements from './announcements';
import Cards from './cards';
import InfoPanel from './info-panel';

const TESTIMONIALS = [
    {
        initials: 'NM',
        name: 'Nadia Hassan',
        quote: 'The guided builder gave me enough structure to get started without making the process feel restrictive or overly technical.',
    },
    {
        initials: 'EW',
        name: 'Ethan Williams',
        quote: 'I like being able to review a setup, make one small change, and compare the result without losing my previous work.',
    },
    {
        initials: 'PN',
        name: 'Priya Nair',
        quote: 'The dashboard keeps the important tools close without feeling crowded. I spend less time searching and more time testing ideas.',
    },
    {
        initials: 'JM',
        name: 'Javier Morales',
        quote: 'Importing a strategy and checking every step was straightforward. It made my workflow much more consistent.',
    },
    {
        initials: 'AK',
        name: 'Aisha Kamau',
        quote: 'The analysis tools help me slow down and confirm my reasoning before I run anything. Dependable during longer testing sessions.',
    },
    {
        initials: 'DT',
        name: 'Daniel Thompson',
        quote: 'Everything responds quickly, even when I am switching between several strategies at once.',
    },
];

const TestimonialsStrip = observer(() => {
    const [active, setActive] = React.useState(3);
    const [paused, setPaused] = React.useState(false);
    const [cycle, setCycle] = React.useState(0); // restart CSS progress animation each slide

    React.useEffect(() => {
        if (paused) return undefined;
        const timer = setInterval(() => {
            setActive(prev => (prev + 1) % TESTIMONIALS.length);
            setCycle(c => c + 1);
        }, 5000);
        return () => clearInterval(timer);
    }, [paused]);

    const select = (index: number) => {
        setActive(index);
        setCycle(c => c + 1);
    };

    return (
        <section
            className={classNames('trader-voices', { 'trader-voices--paused': paused })}
            aria-label='What traders are saying'
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div className='trader-voices__head'>
                <h3 className='trader-voices__title'>What Traders Are Saying</h3>
                <span className='trader-voices__live-badge' aria-live='polite'>
                    <span className='trader-voices__live-dot' aria-hidden='true' />
                    {paused ? 'Paused' : 'Live'}
                </span>
            </div>
            <div className='trader-voices__rail'>
                {TESTIMONIALS.map((item, index) => (
                    <blockquote
                        key={item.name}
                        className={classNames('trader-voices__card', {
                            'trader-voices__card--active': index === active,
                        })}
                        onClick={() => select(index)}
                    >
                        <div className='trader-voices__card-head'>
                            <span className='trader-voices__avatar'>{item.initials}</span>
                            <span className='trader-voices__name'>{item.name}</span>
                            <span className='trader-voices__stars' aria-label='5 star rating'>
                                ★★★★★
                            </span>
                        </div>
                        <p className='trader-voices__quote'>“{item.quote}”</p>
                    </blockquote>
                ))}
            </div>
            <div className='trader-voices__dots' key={cycle}>
                {TESTIMONIALS.map((item, index) => (
                    <button
                        key={item.name}
                        type='button'
                        aria-label={`Show testimonial from ${item.name}`}
                        className={classNames('trader-voices__dot', {
                            'trader-voices__dot--active': index === active,
                        })}
                        onClick={() => select(index)}
                    >
                        {index === active && <span className='trader-voices__dot-progress' aria-hidden='true' />}
                    </button>
                ))}
            </div>
        </section>
    );
});

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

const DashboardComponent = observer(({ handleTabChange }: TMobileIconGuide) => {
    const { load_modal, dashboard, client, google_drive } = useStore();
    const { dashboard_strategies } = load_modal;
    const { is_google_drive_configured } = google_drive;
    const { active_tab, active_tour } = dashboard;
    const has_dashboard_strategies = !!dashboard_strategies?.length;
    const { isDesktop, isTablet } = useDevice();
    void is_google_drive_configured;

    return (
        <React.Fragment>
            <div
                className={classNames('tab__dashboard', {
                    'tab__dashboard--tour-active': active_tour,
                })}
            >
                <div className='tab__dashboard__content'>
                    {client.is_logged_in && (
                        <Announcements is_mobile={!isDesktop} is_tablet={isTablet} handleTabChange={handleTabChange} />
                    )}
                    <div className='quick-panel'>
                        <div
                            className={classNames('tab__dashboard__header', {
                                'tab__dashboard__header--listed': isDesktop && has_dashboard_strategies,
                            })}
                        >
                            {!has_dashboard_strategies && (
                                <Text
                                    className='title'
                                    as='h2'
                                    color='prominent'
                                    size={isDesktop ? 'sm' : 's'}
                                    lineHeight='xxl'
                                    weight='bold'
                                >
                                    {localize('Build smarter bots without the complexity.')}
                                </Text>
                            )}
                            <Text
                                as='p'
                                color='prominent'
                                lineHeight='s'
                                size={isDesktop ? 's' : 'xxs'}
                                className={classNames('subtitle', { 'subtitle__has-list': has_dashboard_strategies })}
                            >
                                {localize('🚀 Aim for consistency, not perfection.')}
                            </Text>
                        </div>
                        <Cards has_dashboard_strategies={has_dashboard_strategies} is_mobile={!isDesktop} />
                        <TestimonialsStrip />
                    </div>
                </div>
            </div>
            <InfoPanel />
            {active_tab === 0 && <OnboardTourHandler is_mobile={!isDesktop} />}
        </React.Fragment>
    );
});

export default DashboardComponent;
