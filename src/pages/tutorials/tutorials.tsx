// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import NoSearchResult from './common/no-search-result-found';
import SearchInput from './common/search-input';
import QuickStrategyGuides from './quick-strategy-content/quick-strategy-guides';
import FAQContent from './faq-content';
import GuideContent from './guide-content';
import { LabelPairedSearchSmRegularIcon } from '@deriv/quill-icons/LabelPaired';

type TTutorialsTab = {
    handleTabChange: (active_number: number) => void;
};

const TutorialsTab = observer(({ handleTabChange }: TTutorialsTab) => {
    const { dashboard } = useStore();
    const {
        active_tab_tutorials,
        faq_search_value,
        guide_tab_content,
        video_tab_content,
        faq_tab_content,
        quick_strategy_tab_content,
        is_dialog_open,
        setActiveTabTutorial,
    } = dashboard;

    const tabs = [localize('Guide'), localize('FAQ'), localize('Quick strategy guides')];
    const hasContent =
        guide_tab_content().length > 0 ||
        video_tab_content().length > 0 ||
        faq_tab_content().length > 0 ||
        quick_strategy_tab_content().length > 0;

    return (
        <div className='tutorials-page'>
            <aside className='tutorials-page__sidebar'>
                <div className='tutorials-page__search'>
                    <LabelPairedSearchSmRegularIcon width='16px' height='16px' />
                    <SearchInput
                        faq_value={faq_search_value}
                        setFaqSearchContent={dashboard.setFAQSearchValue}
                        prev_active_tutorials={active_tab_tutorials}
                    />
                </div>
                <nav aria-label='Tutorial sections'>
                    {tabs.map((label, index) => (
                        <button
                            className={index === active_tab_tutorials ? 'tutorials-page__nav-item tutorials-page__nav-item--active' : 'tutorials-page__nav-item'}
                            key={label}
                            onClick={() => setActiveTabTutorial(index)}
                            type='button'
                        >
                            {label}
                        </button>
                    ))}
                </nav>
            </aside>

            <main className='tutorials-page__content'>
                {active_tab_tutorials === 0 ? (
                    <GuideContent
                        guide_tab_content={guide_tab_content()}
                        video_tab_content={video_tab_content()}
                        is_dialog_open={is_dialog_open}
                    />
                ) : active_tab_tutorials === 1 ? (
                    <FAQContent faq_list={faq_tab_content()} handleTabChange={handleTabChange} />
                ) : active_tab_tutorials === 2 ? (
                    <QuickStrategyGuides quick_strategy_tab_content={quick_strategy_tab_content()} />
                ) : hasContent ? (
                    <>
                        <GuideContent
                            guide_tab_content={guide_tab_content()}
                            video_tab_content={video_tab_content()}
                            is_dialog_open={is_dialog_open}
                        />
                        <FAQContent faq_list={faq_tab_content()} handleTabChange={handleTabChange} />
                        <QuickStrategyGuides quick_strategy_tab_content={quick_strategy_tab_content()} />
                    </>
                ) : (
                    <NoSearchResult />
                )}
            </main>
        </div>
    );
});

export default TutorialsTab;
