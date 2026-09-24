import { useMemo, useState } from 'react';
import './matches-hub.scss';

const DIGITS = [2, 0, 8, 6, 4, 9, 1, 7, 3, 5];
const CHART_FREQUENCIES = [12.1, 10.5, 10.2, 10.1, 10.0, 9.9, 9.8, 9.7, 9.0, 8.7];
const CHART_HEIGHTS = [92, 58, 47, 40, 28, 30, 44, 56, 72, 92];

const MatchesHub = () => {
    const [market, setMarket] = useState('Volatility 100 Index');
    const [ticks, setTicks] = useState('1000');
    const [contractType, setContractType] = useState<'Matches' | 'Differs'>('Matches');
    const [batch, setBatch] = useState<'One digit' | 'Up to 5 digits (batch)'>('One digit');
    const [stake, setStake] = useState('1');
    const [selectedDigit, setSelectedDigit] = useState<number | null>(null);

    const recommendedDigit = DIGITS[0];
    const liveDigit = DIGITS[1];
    const activeLabel = useMemo(() => (
        selectedDigit === null ? 'Select a digit to trade' : `${contractType} ${selectedDigit}`
    ), [contractType, selectedDigit]);

    return (
        <section className='matches-hub' aria-label='Matches-HUB'>
            <div className='matches-hub__shell'>
                <header className='matches-hub__header'>
                    <div>
                        <p className='matches-hub__eyebrow'>NAVIGATOR SYSTEMS</p>
                        <h1>♛ King of Matches</h1>
                    </div>
                    <div className='matches-hub__digit-pills'>
                        <div><span>RECOMMENDED DIGIT</span><strong>{recommendedDigit}</strong></div>
                        <div><span>LIVE LAST DIGIT</span><strong>{liveDigit}</strong></div>
                    </div>
                </header>

                <div className='matches-hub__toolbar'>
                    <label>Market
                        <select value={market} onChange={event => setMarket(event.target.value)}>
                            <option>Volatility 100 Index</option>
                            <option>Volatility 75 Index</option>
                            <option>Volatility 50 Index</option>
                            <option>Volatility 25 Index</option>
                            <option>Volatility 10 Index</option>
                        </select>
                    </label>
                    <label>Ticks
                        <input min='10' type='number' value={ticks} onChange={event => setTicks(event.target.value)} />
                    </label>
                </div>

                <div className='matches-hub__chart' aria-label='Digit frequency chart'>
                    {DIGITS.map((digit, index) => (
                        <div className={`matches-hub__bar matches-hub__bar--${index < 5 ? 'green' : 'red'}`} key={digit}>
                            <span>{CHART_FREQUENCIES[index].toFixed(2)}%</span>
                            <div style={{ height: `${CHART_HEIGHTS[index]}%` }} />
                            <strong>{digit}</strong>
                        </div>
                    ))}
                    <div className='matches-hub__chart-divider' aria-hidden='true' />
                    <div className='matches-hub__legend'><span>● Green: five most frequent</span><span>● Red: five least frequent</span></div>
                </div>

                <div className='matches-hub__direction'>
                    <button className={contractType === 'Matches' ? 'is-active' : ''} onClick={() => setContractType('Matches')} type='button'>Match most appearing digit</button>
                    <button className={contractType === 'Differs' ? 'is-active is-red' : 'is-red'} onClick={() => setContractType('Differs')} type='button'>Match least appearing digit (Differs)</button>
                </div>

                <section className='matches-hub__trade-card'>
                    <div className='matches-hub__section-heading'>
                        <h2>Digit trade dock</h2>
                        <p>Stake on the last tick digit — Match wins if it equals your pick; Differs wins if it does not.</p>
                    </div>
                    <div className='matches-hub__segmented'>
                        <button className={contractType === 'Matches' ? 'is-active' : ''} onClick={() => setContractType('Matches')} type='button'>Matches</button>
                        <button className={contractType === 'Differs' ? 'is-active is-red' : ''} onClick={() => setContractType('Differs')} type='button'>Differs</button>
                    </div>
                    <div className='matches-hub__segmented'>
                        <button className={batch === 'One digit' ? 'is-active' : ''} onClick={() => setBatch('One digit')} type='button'>One digit</button>
                        <button className={batch === 'Up to 5 digits (batch)' ? 'is-active' : ''} onClick={() => setBatch('Up to 5 digits (batch)')} type='button'>Up to 5 digits (batch)</button>
                    </div>
                    <div className='matches-hub__inputs'>
                        <label>Stake (USD)<input min='0.35' step='0.01' type='number' value={stake} onChange={event => setStake(event.target.value)} /></label>
                        <label>Ticks<input min='1' type='number' value={ticks} onChange={event => setTicks(event.target.value)} /></label>
                    </div>
                    <p className='matches-hub__pick-label'>Tap one digit to trade</p>
                    <div className='matches-hub__digits'>
                        {Array.from({ length: 10 }, (_, digit) => (
                            <button className={selectedDigit === digit ? 'is-selected' : ''} key={digit} onClick={() => setSelectedDigit(digit)} type='button'>{digit}</button>
                        ))}
                    </div>
                    <button className='matches-hub__trade-button' disabled={selectedDigit === null} type='button'>{activeLabel}</button>
                </section>

                <section className='matches-hub__contracts'>
                    <h2>Contracts from this session</h2>
                    <p>Open positions update every few seconds; closed rows show final profit or loss.</p>
                    <div className='matches-hub__contract-columns'>
                        <div><strong>OPEN</strong><span>No open contracts yet.</span></div>
                        <div><strong>CLOSED</strong><span>No settled contracts yet.</span></div>
                    </div>
                </section>
            </div>
        </section>
    );
};

export default MatchesHub;
