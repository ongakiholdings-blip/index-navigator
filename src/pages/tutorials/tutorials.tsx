import React from 'react';

const TutorialsTab = () => {
    return (
        <div className='tutorials-youtube'>
            <div className='tutorials-youtube__card'>
                <div className='tutorials-youtube__icon'>
                    <svg viewBox='0 0 90 90' fill='none' xmlns='http://www.w3.org/2000/svg'>
                        <circle cx='45' cy='45' r='45' fill='#FF0000' />
                        <path d='M63.5 45C63.5 45 63.5 37.3 62.5 33.6C62 31.6 60.4 30 58.4 29.5C54.8 28.5 45 28.5 45 28.5C45 28.5 35.2 28.5 31.6 29.5C29.6 30 28 31.6 27.5 33.6C26.5 37.3 26.5 45 26.5 45C26.5 45 26.5 52.7 27.5 56.4C28 58.4 29.6 60 31.6 60.5C35.2 61.5 45 61.5 45 61.5C45 61.5 54.8 61.5 58.4 60.5C60.4 60 62 58.4 62.5 56.4C63.5 52.7 63.5 45 63.5 45Z' fill='white' />
                        <path d='M41 52.5V37.5L53 45L41 52.5Z' fill='#FF0000' />
                    </svg>
                </div>
                <h2 className='tutorials-youtube__title'>INDEX NAVIGATOR Tutorials</h2>
                <p className='tutorials-youtube__description'>
                    Learn how to use every tool on <strong>indexnavigator.site</strong> — from building your first bot to
                    advanced strategy setups. New videos posted regularly.
                </p>
                <a
                    href='http://www.youtube.com/@frostydbot'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='tutorials-youtube__button'
                >
                    <svg viewBox='0 0 24 24' fill='currentColor' xmlns='http://www.w3.org/2000/svg'>
                        <path d='M19.59 6.69a4.83 4.83 0 0 1-3.77-2.75 12.64 12.64 0 0 0-8.07 0A4.83 4.83 0 0 1 4 6.69 49.7 49.7 0 0 0 3.18 12a49.7 49.7 0 0 0 .82 5.31 4.83 4.83 0 0 1 3.75 2.75 12.64 12.64 0 0 0 8.07 0 4.83 4.83 0 0 1 3.77-2.75A49.7 49.7 0 0 0 20.82 12a49.7 49.7 0 0 0-.82-5.31ZM9.75 15V9l5.25 3-5.25 3Z' />
                    </svg>
                    Visit our YouTube Channel
                </a>
            </div>
        </div>
    );
};

export default TutorialsTab;
