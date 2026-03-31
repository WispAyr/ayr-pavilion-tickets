import { useState, useEffect, useRef } from 'react';
import { Loader2, Clock } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function SkatesPage() {
  const [activeEvent, setActiveEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const timerRef = useRef(null);
  const wsRef = useRef(null);

  // Auto-detect active event (no auth needed for display, but we need an event)
  useEffect(() => {
    async function findEvent() {
      try {
        const res = await fetch(`${API_BASE}/events`);
        const data = await res.json();
        const events = Array.isArray(data) ? data : data.events || [];
        const now = new Date();
        const twoHoursBefore = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const endOfDay = new Date(now.getTime() + 12 * 60 * 60 * 1000);

        const active = events.find(e => {
          const dt = new Date(e.dateTime || e.date_time || e.date);
          return dt >= twoHoursBefore && dt <= endOfDay && (e.status === 'on-sale' || e.status === 'sold-out');
        });
        setActiveEvent(active || null);
      } catch (err) {
        console.error('Failed to find event:', err);
      } finally {
        setLoading(false);
      }
    }
    findEvent();
    // Re-check every 5 minutes
    const interval = setInterval(findEvent, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket connection
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${window.location.host}/ws/door`;
    let ws;
    let reconnectTimer;

    function connect() {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === 'scan' && data.result === 'valid') {
            const entry = {
              id: Date.now() + Math.random(),
              name: data.customer_name || 'Guest',
              skateSize: data.skate_size || null,
              addonName: data.skate_addon_name || null,
              ticketType: data.ticket_type || '',
              timestamp: data.timestamp,
            };
            setQueue(prev => [...prev, entry]);
          }
        } catch {}
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // Process queue — show one at a time, 8 second display
  useEffect(() => {
    if (current || queue.length === 0) return;

    const next = queue[0];
    setCurrent(next);
    setQueue(prev => prev.slice(1));

    timerRef.current = setTimeout(() => {
      setCurrent(null);
    }, 8000);

    return () => clearTimeout(timerRef.current);
  }, [queue, current]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pavilion-900">
        <Loader2 className="w-10 h-10 text-gold-400 animate-spin" />
      </div>
    );
  }

  if (!activeEvent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-pavilion-900 px-4 text-center">
        <Clock className="w-20 h-20 text-gray-700 mb-4" />
        <h1 className="text-3xl font-bold text-gray-500">Waiting for Event</h1>
        <p className="text-gray-600 mt-2">Will auto-detect when an event is active</p>
        <div className={`mt-6 flex items-center gap-2 text-sm ${wsConnected ? 'text-green-500' : 'text-red-500'}`}>
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          {wsConnected ? 'Connected' : 'Reconnecting...'}
        </div>
      </div>
    );
  }

  // Idle state — waiting for scans
  if (!current) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-pavilion-900 px-4">
        <div className="text-center">
          <div className="mb-6">
            <svg className="w-24 h-24 mx-auto text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <h1 className="text-4xl font-black text-gray-600 mb-2">SKATE PREP</h1>
          <p className="text-lg text-gray-700">{activeEvent.title || activeEvent.name}</p>
          <div className={`mt-8 flex items-center justify-center gap-2 text-sm ${wsConnected ? 'text-green-600' : 'text-red-500'}`}>
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-600 animate-pulse' : 'bg-red-500'}`} />
            {wsConnected ? 'Waiting for next check-in...' : 'Reconnecting...'}
          </div>
          {queue.length > 0 && (
            <p className="mt-4 text-gold-400 text-sm">{queue.length} in queue</p>
          )}
        </div>
      </div>
    );
  }

  // Display current customer's skate info
  const hasSkates = !!current.skateSize;

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-8 transition-colors duration-500 ${hasSkates ? 'bg-pavilion-900' : 'bg-pavilion-900'}`}>
      <div className="animate-fade-in text-center max-w-2xl w-full">
        {/* Customer name */}
        <h1 className="text-5xl sm:text-7xl font-black text-white mb-6 tracking-tight">
          {current.name}
        </h1>

        {/* Skate size or own skates */}
        {hasSkates ? (
          <div className="mb-6">
            <div className="inline-block bg-gold-500 rounded-3xl px-12 py-8">
              <p className="text-sm font-bold text-pavilion-900 uppercase tracking-wider mb-1">
                {current.addonName || 'Skate Size'}
              </p>
              <p className="text-7xl sm:text-9xl font-black text-pavilion-900 leading-none">
                {current.skateSize}
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <div className="inline-block bg-pavilion-800 border-2 border-pavilion-600 rounded-3xl px-12 py-8">
              <p className="text-3xl sm:text-5xl font-bold text-gray-400">
                Own skates
              </p>
            </div>
          </div>
        )}

        {/* Ticket type */}
        <p className="text-lg text-gray-500">{current.ticketType}</p>

        {/* Queue indicator */}
        {queue.length > 0 && (
          <p className="mt-6 text-sm text-gray-600">{queue.length} more in queue</p>
        )}

        {/* Progress bar for auto-clear */}
        <div className="mt-8 max-w-md mx-auto">
          <div className="bg-pavilion-800 rounded-full h-1 overflow-hidden">
            <div className="bg-gold-500/50 h-full rounded-full animate-shrink" />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
        .animate-shrink {
          animation: shrink 8s linear forwards;
        }
      `}</style>
    </div>
  );
}
