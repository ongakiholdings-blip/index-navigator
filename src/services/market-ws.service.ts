// Lightweight Deriv WebSocket market feed for live ticks
/* eslint-disable no-console */
type OnTick = (data: { symbol: string; price: number; epoch?: number }) => void;

export function createDerivWsFeed(
    symbols: string[],
    onTick: OnTick,
    opts: { endpoint?: string; reconnectMs?: number } = {}
) {
    const endpoint =
        opts.endpoint ||
        `wss://ws.derivws.com/websockets/v3?app_id=${process.env.NEXT_PUBLIC_DERIV_APP_ID || '34dW9DIkkb8AWcPRK27Mh'}`;
    const reconnectBase = opts.reconnectMs || 1500;

    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectDelay = reconnectBase;

    const pendingSubs = new Set(symbols);

    function subscribeAll() {
        pendingSubs.forEach(symbol => {
            try {
                ws?.send(JSON.stringify({ ticks: symbol }));
            } catch (e) {
                // ignore send errors — will reconnect
            }
        });
    }

    function handleMessage(ev: MessageEvent) {
        try {
            const msg = JSON.parse(ev.data as string);
            if (msg.error) return;
            if (msg.tick) {
                // Deriv echoes the original request in echo_req
                const symbol = msg.echo_req?.ticks || Array.from(pendingSubs)[0] || 'unknown';
                const price = Number(msg.tick.quote ?? msg.tick.tick ?? msg.tick.value ?? NaN);
                const epoch = msg.tick.epoch ?? undefined;
                if (!Number.isNaN(price)) onTick({ symbol, price, epoch });
            }
        } catch (e) {
            console.warn('ws parse err', e);
        }
    }

    function connect() {
        if (closed) return;
        ws = new WebSocket(endpoint);
        ws.onopen = () => {
            reconnectDelay = reconnectBase;
            subscribeAll();
        };
        ws.onmessage = handleMessage;
        ws.onclose = () => {
            if (closed) return;
            ws = null;
            setTimeout(() => {
                reconnectDelay = Math.min(reconnectDelay * 1.8, 60_000);
                connect();
            }, reconnectDelay);
        };
        ws.onerror = () => {
            // let onclose handle reconnect
        };
    }

    connect();

    return {
        stop: () => {
            closed = true;
            try {
                ws?.close();
            } catch (e) {}
            ws = null;
        },
    };
}

export default createDerivWsFeed;
