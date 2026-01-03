import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function DebugPayment() {
    const [input, setInput] = useState('');
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => setLogs(prev => [...prev, `${new Date().toISOString().split('T')[1]} - ${msg}`]);

    const runDebug = async () => {
        setLoading(true);
        setLogs([]);
        setResult(null);
        try {
            // 1. Resolve Order ID
            addLog(`Searching for order with number/id: ${input}`);
            let orderId = input;

            // If input is short number, find UUID
            if (input.length < 10) {
                const { data: orders, error: searchError } = await supabase
                    .from('orders')
                    .select('id, payment_status, payment_provider, status, total_amount')
                    .eq('order_number', input)

                if (searchError) throw searchError;
                if (!orders || orders.length === 0) throw new Error("Order not found by number");

                const order = orders[0];
                orderId = order.id;
                addLog(`Found UUID: ${orderId}`);
                addLog(`Current DB Status: ${order.status}, Payment: ${order.payment_status}, Provider: ${order.payment_provider}`);
            }

            // 2. Call Vercel API (Backend)
            addLog(`Invoking /api/verify-payment...`);

            const res = await fetch('/api/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId })
            });

            const data = await res.json();

            if (!res.ok) {
                addLog(`Function Error: ${data.error || res.statusText}`);
                console.error(data);
            } else {
                addLog(`Function Response: ${JSON.stringify(data, null, 2)}`);
            }
            setResult(data);

        } catch (e: any) {
            addLog(`Critical Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white p-8 font-mono text-xs">
            <h1 className="text-xl font-bold text-neon mb-4">Payment Debugger</h1>
            <div className="flex gap-2 max-w-md mb-4">
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Order ID or Number (e.g., 59)"
                    className="bg-zinc-900 border border-zinc-700 p-2 flex-1 rounded"
                />
                <button onClick={runDebug} disabled={loading} className="bg-neon text-black px-4 font-bold rounded hover:bg-white">{loading ? '...' : 'RUN'}</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900/50 p-4 rounded border border-zinc-800 h-[400px] overflow-auto">
                    <h3 className="text-zinc-500 mb-2 uppercase tracking-widest">Execution Logs</h3>
                    {logs.map((l, i) => <div key={i} className="mb-1">{l}</div>)}
                </div>
                <div className="bg-zinc-900/50 p-4 rounded border border-zinc-800 h-[400px] overflow-auto">
                    <h3 className="text-zinc-500 mb-2 uppercase tracking-widest">Function Result</h3>
                    <pre className="text-green-400">{JSON.stringify(result, null, 2)}</pre>
                </div>
            </div>
        </div>
    );
}
