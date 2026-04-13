import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Clock, RefreshCw, Users, Package, CheckCircle2, User, HandMetal, RotateCcw, AlertTriangle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function handOut(ticket_id, event_id, skate_size) {
  const res = await fetch(`${API_BASE}/door/skate-handout`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id, event_id, skate_size }),
  });
  return res.json();
}

async function returnSkate(handout_id) {
  const res = await fetch(`${API_BASE}/door/skate-return`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handout_id }),
  });
  return res.json();
}

async function returnAll(event_id) {
  const res = await fetch(`${API_BASE}/door/skate-return-all`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id }),
  });
  return res.json();
}

function SizeCard({ size, expected, arrived }) {
  const isOwnSkates = size.toLowerCase().includes('own') || size.toLowerCase().includes('bring');
  if (isOwnSkates) return null;
  const remaining = expected - arrived;
  const allArrived = remaining <= 0 && expected > 0;
  return (
    <div className={`rounded-xl border p-4 transition-all ${allArrived ? 'bg-green-900/20 border-green-500/30' : arrived > 0 ? 'bg-gold-500/10 border-gold-500/30' : 'bg-pavilion-800 border-pavilion-600/50'}`}>
      <p className="text-xs font-medium text-gray-400 mb-2 truncate">{size}</p>
      <p className={`text-4xl font-black tabular-nums leading-none ${allArrived ? 'text-green-400' : 'text-white'}`}>{expected}</p>
      <p className="text-xs text-gray-500 mt-1">pairs needed</p>
      {arrived > 0 && (
        <div className="mt-2 pt-2 border-t border-pavilion-600/30 flex items-center justify-between">
          <span className="text-xs text-green-400 font-medium">{arrived} arrived</span>
          {remaining > 0 ? <span className="text-xs text-gray-500">{remaining} waiting</span> : <CheckCircle2 className="w-4 h-4 text-green-400" />}
        </div>
      )}
    </div>
  );
}

function PersonRow({ person, eventId, onAction }) {
  const [busy, setBusy] = useState(false);
  const isOwn = person.skate_size.toLowerCase().includes('own') || person.skate_size.toLowerCase().includes('bring');
  const isCheckedIn = person.status === 'used';
  const isHandedOut = !!person.handout_id && !person.returned_at;

  async function doHandOut() {
    setBusy(true);
    try { await handOut(person.ticket_id, eventId, person.skate_size); onAction(); }
    catch {} finally { setBusy(false); }
  }

  async function doReturn() {
    setBusy(true);
    try { await returnSkate(person.handout_id); onAction(); }
    catch {} finally { setBusy(false); }
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${isHandedOut ? 'bg-blue-900/10' : isCheckedIn ? 'bg-green-900/10' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isHandedOut ? 'bg-blue-900/30 text-blue-400' : isCheckedIn ? 'bg-green-900/30 text-green-400' : 'bg-pavilion-700 text-gray-500'
      }`}>
        <User className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate">{person.customer_name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500">{person.ticket_type}</span>
          {isHandedOut && <span className="text-xs text-blue-400">⛸️ Out</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isOwn ? (
          <span className="text-xs bg-pavilion-700 text-gray-400 px-2 py-1 rounded-full">Own skates</span>
        ) : (
          <>
            <span className={`text-sm font-bold px-3 py-1 rounded-lg ${
              isHandedOut ? 'bg-blue-900/30 text-blue-400' : isCheckedIn ? 'bg-green-900/30 text-green-400' : 'bg-pavilion-700 text-white'
            }`}>{person.skate_size}</span>
            {isHandedOut ? (
              <button onClick={doReturn} disabled={busy} title="Return skates"
                className="p-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-all disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              </button>
            ) : !isOwn ? (
              <button onClick={doHandOut} disabled={busy} title="Hand out skates"
                className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandMetal className="w-4 h-4" />}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function SkatesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [tab, setTab] = useState('all');
  const [returning, setReturning] = useState(false);
  const timerRef = useRef(null);
  const wsRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/door/skate-prep`);
      const json = await res.json();
      setData(json);
    } catch (err) { console.error('Failed to fetch:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 15000); return () => clearInterval(i); }, [fetchData]);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    let ws, rt;
    function connect() {
      ws = new WebSocket(`${proto}://${window.location.host}/ws/door`); wsRef.current = ws;
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => { setWsConnected(false); rt = setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (msg) => {
        try {
          const d = JSON.parse(msg.data);
          if (d.type === 'scan' && d.result === 'valid') {
            setQueue(prev => [...prev, { id: Date.now() + Math.random(), name: d.customer_name || 'Guest', skateSize: d.skate_size || null, addonName: d.skate_addon_name || null, ticketType: d.ticket_type || '' }]);
            fetchData();
          }
        } catch {}
      };
    }
    connect();
    return () => { clearTimeout(rt); if (ws) ws.close(); };
  }, [fetchData]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    setCurrent(queue[0]); setQueue(prev => prev.slice(1));
    timerRef.current = setTimeout(() => setCurrent(null), 8000);
    return () => clearTimeout(timerRef.current);
  }, [queue, current]);

  async function handleReturnAll() {
    if (!data?.event || !confirm('Return ALL outstanding skates for this event?')) return;
    setReturning(true);
    try { await returnAll(data.event.id); fetchData(); } catch {} finally { setReturning(false); }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-pavilion-900"><Loader2 className="w-10 h-10 text-gold-400 animate-spin" /></div>;
  if (!data?.event) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-pavilion-900 px-4 text-center">
      <Clock className="w-20 h-20 text-gray-700 mb-4" />
      <h1 className="text-3xl font-bold text-gray-500">No Skate Events</h1>
      <p className="text-gray-600 mt-2">No upcoming events with skate hire found</p>
    </div>
  );

  const { event, expected, arrived, people = [], handoutStats = {} } = data;

  const sizeMap = new Map();
  for (const e of expected) sizeMap.set(e.size, { size: e.size, expected: e.count, arrived: 0 });
  for (const a of arrived) { if (sizeMap.has(a.size)) sizeMap.get(a.size).arrived = a.count; else sizeMap.set(a.size, { size: a.size, expected: 0, arrived: a.count }); }

  const allSizes = Array.from(sizeMap.values());
  const hireSizes = allSizes.filter(s => !s.size.toLowerCase().includes('own') && !s.size.toLowerCase().includes('bring'));
  const ownSkates = allSizes.filter(s => s.size.toLowerCase().includes('own') || s.size.toLowerCase().includes('bring'));
  const totalExpectedHire = hireSizes.reduce((sum, s) => sum + s.expected, 0);
  const totalOwn = ownSkates.reduce((sum, s) => sum + s.expected, 0);

  const outstanding = handoutStats.outstanding || 0;
  const handedOut = handoutStats.total_handed_out || 0;
  const returned = handoutStats.returned || 0;

  const handedOutPeople = people.filter(p => p.handout_id && !p.returned_at);
  const checkedInPeople = people.filter(p => p.status === 'used' && !p.handout_id);
  const notYetPeople = people.filter(p => p.status !== 'used' && !p.handout_id);

  const eventDate = new Date(event.date_time);
  const isToday = new Date().toDateString() === eventDate.toDateString();
  const checkinPct = event.total_tickets > 0 ? Math.round((event.checked_in || 0) / event.total_tickets * 100) : 0;

  return (
    <div className="min-h-screen bg-pavilion-900">
      {current && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-pavilion-900/95 px-8 animate-fade-in">
          <h1 className="text-5xl sm:text-7xl font-black text-white mb-6 tracking-tight text-center">{current.name}</h1>
          {current.skateSize ? (
            <div className="mb-6"><div className="inline-block bg-gold-500 rounded-3xl px-12 py-8">
              <p className="text-sm font-bold text-pavilion-900 uppercase tracking-wider mb-1">{current.addonName || 'Skate Size'}</p>
              <p className="text-7xl sm:text-9xl font-black text-pavilion-900 leading-none">{current.skateSize}</p>
            </div></div>
          ) : (
            <div className="mb-6"><div className="inline-block bg-pavilion-800 border-2 border-pavilion-600 rounded-3xl px-12 py-8">
              <p className="text-3xl sm:text-5xl font-bold text-gray-400">Own skates</p>
            </div></div>
          )}
          <p className="text-lg text-gray-500">{current.ticketType}</p>
          <div className="mt-8 max-w-md w-full mx-auto"><div className="bg-pavilion-800 rounded-full h-1 overflow-hidden"><div className="bg-gold-500/50 h-full rounded-full animate-shrink" /></div></div>
        </div>
      )}

      <div className="bg-pavilion-800 border-b border-pavilion-600/50 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">⛸️ Skate Prep</h1>
            <p className="text-xs text-gray-400">
              {event.title} — {isToday ? 'Today' : eventDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
              {eventDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 text-xs ${wsConnected ? 'text-green-400' : 'text-red-400'}`}>
              <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              {wsConnected ? 'Live' : 'Offline'}
            </div>
            <button onClick={fetchData} className="p-2 rounded-lg bg-pavilion-700 hover:bg-pavilion-600 transition-all">
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {/* Summary */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/50 p-3 text-center">
            <Package className="w-4 h-4 text-gold-400 mx-auto mb-1" />
            <p className="text-2xl font-black text-gold-400 tabular-nums">{totalExpectedHire}</p>
            <p className="text-xs text-gray-400">To Prep</p>
          </div>
          <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/50 p-3 text-center">
            <HandMetal className="w-4 h-4 text-blue-400 mx-auto mb-1" />
            <p className="text-2xl font-black text-blue-400 tabular-nums">{outstanding}</p>
            <p className="text-xs text-gray-400">Out Now</p>
          </div>
          <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/50 p-3 text-center">
            <RotateCcw className="w-4 h-4 text-green-400 mx-auto mb-1" />
            <p className="text-2xl font-black text-green-400 tabular-nums">{returned}</p>
            <p className="text-xs text-gray-400">Returned</p>
          </div>
          <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/50 p-3 text-center">
            <Users className="w-4 h-4 text-gray-400 mx-auto mb-1" />
            <p className="text-2xl font-black text-white tabular-nums">{totalOwn}</p>
            <p className="text-xs text-gray-400">Own Skates</p>
          </div>
        </div>

        {/* Size grid */}
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Package className="w-4 h-4" /> Sizes to Prepare
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
          {hireSizes.map(s => <SizeCard key={s.size} size={s.size} expected={s.expected} arrived={s.arrived} />)}
        </div>

        {/* People list */}
        <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/50 overflow-hidden mb-5">
          <div className="flex border-b border-pavilion-600/50">
            <button onClick={() => setTab('all')} className={`flex-1 py-2.5 text-sm font-medium transition-all ${tab === 'all' ? 'text-gold-400 border-b-2 border-gold-400' : 'text-gray-500 hover:text-gray-300'}`}>
              All ({people.length})
            </button>
            <button onClick={() => setTab('out')} className={`flex-1 py-2.5 text-sm font-medium transition-all ${tab === 'out' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>
              ⛸️ Out ({handedOutPeople.length})
            </button>
            <button onClick={() => setTab('arrived')} className={`flex-1 py-2.5 text-sm font-medium transition-all ${tab === 'arrived' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-500 hover:text-gray-300'}`}>
              Arrived ({checkedInPeople.length})
            </button>
          </div>
          <div className="divide-y divide-pavilion-600/20 max-h-[500px] overflow-y-auto">
            {tab === 'all' && (
              <>
                {handedOutPeople.length > 0 && <div className="px-4 py-1.5 bg-blue-900/10"><p className="text-xs font-medium text-blue-400">⛸️ Skates Out</p></div>}
                {handedOutPeople.map((p, i) => <PersonRow key={`ho-${i}`} person={p} eventId={event.id} onAction={fetchData} />)}
                {checkedInPeople.length > 0 && <div className="px-4 py-1.5 bg-green-900/10"><p className="text-xs font-medium text-green-400">Checked In — Ready for Skates</p></div>}
                {checkedInPeople.map((p, i) => <PersonRow key={`ci-${i}`} person={p} eventId={event.id} onAction={fetchData} />)}
                {notYetPeople.length > 0 && <div className="px-4 py-1.5 bg-pavilion-700/30"><p className="text-xs font-medium text-gray-400">Not Yet Arrived</p></div>}
                {notYetPeople.map((p, i) => <PersonRow key={`ny-${i}`} person={p} eventId={event.id} onAction={fetchData} />)}
              </>
            )}
            {tab === 'out' && (
              <>
                {handedOutPeople.length === 0 && <div className="px-4 py-8 text-center text-gray-500 text-sm">No skates currently out</div>}
                {handedOutPeople.map((p, i) => <PersonRow key={`o-${i}`} person={p} eventId={event.id} onAction={fetchData} />)}
              </>
            )}
            {tab === 'arrived' && (
              <>
                {checkedInPeople.length === 0 && <div className="px-4 py-8 text-center text-gray-500 text-sm">No check-ins waiting for skates</div>}
                {checkedInPeople.map((p, i) => <PersonRow key={`a-${i}`} person={p} eventId={event.id} onAction={fetchData} />)}
              </>
            )}
          </div>
        </div>

        {/* Return All button */}
        {outstanding > 0 && (
          <button onClick={handleReturnAll} disabled={returning}
            className="w-full mb-5 py-3 bg-amber-500/20 border border-amber-500/30 text-amber-400 font-medium rounded-xl hover:bg-amber-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
            {returning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Return All {outstanding} Outstanding Pairs
          </button>
        )}

        {/* Progress */}
        <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/50 p-4">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>Check-in progress</span>
            <span className="tabular-nums">{event.checked_in || 0} / {event.total_tickets || 0} ({checkinPct}%)</span>
          </div>
          <div className="bg-pavilion-700 rounded-full h-3 overflow-hidden">
            <div className="bg-gold-500 h-full rounded-full transition-all duration-500" style={{ width: `${checkinPct}%` }} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shrink { from { width: 100%; } to { width: 0%; } }
        .animate-shrink { animation: shrink 8s linear forwards; }
      `}</style>
    </div>
  );
}
