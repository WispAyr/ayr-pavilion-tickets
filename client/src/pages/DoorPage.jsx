import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  ArrowRightLeft,
  Users,
  Clock,
  Wifi,
  WifiOff,
  RefreshCw,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ─── PIN Entry (reuse scanner PIN auth) ─────────────────────

function PinEntry({ onAuthenticated }) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handleDigit(d) {
    if (pin.length < 4) {
      const next = pin + d;
      setPin(next);
      if (next.length === 4) submitPin(next);
    }
  }

  function handleDelete() {
    setPin(p => p.slice(0, -1));
    setError(null);
  }

  async function submitPin(code) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/scan/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) throw new Error(data.error || 'Invalid PIN');
      onAuthenticated(code, data.user?.name || 'Staff');
    } catch (err) {
      setError(err.message);
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-pavilion-900">
      <div className="text-center mb-8">
        <ShieldCheck className="w-12 h-12 text-gold-400 mx-auto mb-3" />
        <h1 className="text-2xl font-bold mb-1">Door Operator</h1>
        <p className="text-gray-400 text-sm">Enter your 4-digit PIN to continue</p>
      </div>
      <div className="flex gap-3 mb-6">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${pin.length > i ? 'border-gold-500 bg-pavilion-800 text-gold-400' : 'border-pavilion-600 bg-pavilion-800 text-transparent'}`}>
            {pin[i] ? '\u2022' : ''}
          </div>
        ))}
      </div>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {loading && <Loader2 className="w-6 h-6 text-gold-400 animate-spin mb-4" />}
      <div className="grid grid-cols-3 gap-3 max-w-xs w-full">
        {digits.map((d, i) => {
          if (d === null) return <div key={i} />;
          if (d === 'del') return (
            <button key={i} onClick={handleDelete} className="h-16 rounded-xl bg-pavilion-800 border border-pavilion-600/50 text-gray-400 hover:bg-pavilion-700 hover:text-white transition-all text-sm font-medium">Delete</button>
          );
          return (
            <button key={i} onClick={() => handleDigit(String(d))} disabled={loading || pin.length >= 4} className="h-16 rounded-xl bg-pavilion-800 border border-pavilion-600/50 text-white text-xl font-bold hover:bg-pavilion-700 active:bg-pavilion-600 transition-all disabled:opacity-50">{d}</button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Transfer Modal ─────────────────────────────────────────

function TransferModal({ ticket, sessions, pin, onClose, onTransferred }) {
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [capacityWarning, setCapacityWarning] = useState(null);

  async function doTransfer(force = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/door/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticket.ticketId, to_event_id: Number(targetId), reason, force }),
      });
      const data = await res.json();
      if (res.status === 409 && data.requires_override) {
        setCapacityWarning(data);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Transfer failed');
      onTransferred(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const availableSessions = sessions.filter(s => s.id !== ticket.eventId);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-pavilion-800 rounded-2xl border border-pavilion-600/50 max-w-md w-full p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">Transfer Ticket</h3>
        <p className="text-sm text-gray-400 mb-4">{ticket.customerName} — {ticket.ticketTypeName}</p>

        <label className="text-sm text-gray-400 block mb-1">Move to session:</label>
        <select value={targetId} onChange={e => { setTargetId(e.target.value); setCapacityWarning(null); }} className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none mb-3">
          <option value="">Select session...</option>
          {availableSessions.map(s => (
            <option key={s.id} value={s.id}>{s.title} — {new Date(s.dateTime || s.date_time).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</option>
          ))}
        </select>

        <label className="text-sm text-gray-400 block mb-1">Reason (optional):</label>
        <input value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none mb-4" placeholder="e.g. Customer requested change" />

        {capacityWarning && (
          <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg p-3 mb-4 text-sm">
            <p className="text-amber-300 font-medium">Session at capacity ({capacityWarning.current_count}/{capacityWarning.capacity})</p>
            <button onClick={() => doTransfer(true)} disabled={loading} className="mt-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg font-medium transition-all disabled:opacity-50">
              Override and Transfer Anyway
            </button>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 bg-pavilion-700 border border-pavilion-600/50 rounded-xl text-gray-300 text-sm font-medium hover:bg-pavilion-600 transition-all">Cancel</button>
          <button onClick={() => doTransfer(false)} disabled={!targetId || loading} className="flex-1 py-2.5 bg-gold-500 hover:bg-gold-600 text-pavilion-900 text-sm font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            Transfer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Door Interface ────────────────────────────────────

function DoorInterface({ pin, userName }) {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanFeed, setScanFeed] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [transferTicket, setTransferTicket] = useState(null);
  const [familySessions, setFamilySessions] = useState([]);
  const wsRef = useRef(null);
  const searchTimeout = useRef(null);

  // Load active event
  const loadEvent = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/door/active-event`, {});
      const data = await res.json();
      setEvent(data.event);
      if (data.event) {
        // Load recent scans
        const scansRes = await fetch(`${API_BASE}/door/recent-scans/${data.event.id}`, {});
        const scansData = await scansRes.json();
        setScanFeed(scansData.scans || []);

        // Load family sessions for transfer
        const slug = data.event.slug;
        const slugBase = slug.replace(/-\d+$/, '').replace(/-(?:am|pm|morning|afternoon|evening|early|late)$/i, '');
        const eventsRes = await fetch(`${API_BASE}/events`);
        const eventsData = await eventsRes.json();
        const events = Array.isArray(eventsData) ? eventsData : eventsData.events || [];
        const eventDate = (data.event.date_time || '').split('T')[0];
        const family = events.filter(e => {
          const eSlug = e.slug || '';
          const eDate = (e.dateTime || e.date_time || e.date || '').split('T')[0];
          return eSlug.startsWith(slugBase) || eDate === eventDate;
        });
        setFamilySessions(family);
      }
    } catch (err) {
      console.error('Failed to load event:', err);
    } finally {
      setLoading(false);
    }
  }, [pin]);

  useEffect(() => { loadEvent(); }, [loadEvent]);

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
          if (data.type === 'scan') {
            setScanFeed(prev => [{
              id: Date.now(),
              scanned_at: data.timestamp,
              result: data.result,
              scanned_by: data.scanner,
              device_id: data.device_id,
              ticket_id: data.ticket_id,
              holder_name: data.customer_name,
              customer_name: data.customer_name,
              ticket_type_name: data.ticket_type,
              order_ref: data.order_ref,
            }, ...prev].slice(0, 100));
            // Update event stats
            if (data.result === 'valid') {
              setEvent(prev => prev ? { ...prev, checked_in: (prev.checked_in || 0) + 1 } : prev);
            }
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

  // Search with debounce
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const eventParam = event ? `&event_id=${event.id}` : '';
        const res = await fetch(`${API_BASE}/door/search?q=${encodeURIComponent(searchQuery)}${eventParam}`, {});
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [searchQuery, event, pin]);

  function handleTransferred() {
    setTransferTicket(null);
    setSearchQuery('');
    setSearchResults([]);
    loadEvent();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pavilion-900">
        <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-pavilion-900 px-4 text-center">
        <Clock className="w-16 h-16 text-gray-600 mb-4" />
        <h1 className="text-2xl font-bold mb-2">No Active Event</h1>
        <p className="text-gray-400 mb-6">No event found within the next 2 hours.</p>
        <button onClick={() => { setLoading(true); loadEvent(); }} className="px-6 py-3 bg-pavilion-800 border border-pavilion-600/50 rounded-xl text-white font-medium hover:bg-pavilion-700 transition-all flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
    );
  }

  const percentage = event.total_tickets > 0 ? Math.round((event.checked_in / event.total_tickets) * 100) : 0;

  return (
    <div className="min-h-screen bg-pavilion-900">
      {/* Header */}
      <div className="bg-pavilion-800 border-b border-pavilion-600/50 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{event.title}</h1>
            <p className="text-xs text-gray-400">
              {new Date(event.date_time).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {userName && <> &middot; {userName}</>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 text-xs ${wsConnected ? 'text-green-400' : 'text-red-400'}`}>
              {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {wsConnected ? 'Live' : 'Offline'}
            </div>
            <button onClick={() => { setLoading(true); loadEvent(); }} className="p-2 rounded-lg bg-pavilion-700 hover:bg-pavilion-600 transition-all">
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/50 p-4 text-center">
            <p className="text-3xl font-black text-gold-400 tabular-nums">{event.checked_in || 0}</p>
            <p className="text-xs text-gray-400">Checked In</p>
          </div>
          <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/50 p-4 text-center">
            <p className="text-3xl font-black text-white tabular-nums">{event.total_tickets || 0}</p>
            <p className="text-xs text-gray-400">Total Tickets</p>
          </div>
          <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/50 p-4 text-center">
            <p className="text-3xl font-black text-white tabular-nums">{percentage}%</p>
            <p className="text-xs text-gray-400">Arrived</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-pavilion-800 rounded-full h-3 mb-4 overflow-hidden border border-pavilion-600/50">
          <div className="bg-gold-500 h-full rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
        </div>

        {/* By type breakdown */}
        {event.by_type && event.by_type.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
            {event.by_type.map((t, i) => (
              <div key={i} className="bg-pavilion-800/50 rounded-lg border border-pavilion-600/30 px-3 py-2">
                <p className="text-xs text-gray-400 truncate">{t.name}</p>
                <p className="text-sm font-bold tabular-nums">{t.checked_in} / {t.total}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search customer name or email..."
            className="w-full pl-10 pr-4 py-3 bg-pavilion-800 border border-pavilion-600/50 rounded-xl text-white text-sm focus:border-gold-500 focus:outline-none"
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gold-400 animate-spin" />}
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/50 mb-4 overflow-hidden">
            <div className="px-4 py-2 border-b border-pavilion-600/50">
              <p className="text-xs text-gray-400 font-medium">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="divide-y divide-pavilion-600/30 max-h-80 overflow-y-auto">
              {searchResults.map(r => (
                <div key={r.ticket_id || r.ticketId} className="px-4 py-3 hover:bg-pavilion-700/50 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{r.customer_name || r.customerName}</p>
                      <p className="text-xs text-gray-400 truncate">{r.customer_email || r.customerEmail}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <span className="text-gray-500">{r.ticket_type_name || r.ticketTypeName}</span>
                        <span className="text-gray-600">&middot;</span>
                        <span className="text-gray-500">{r.event_title || r.eventTitle}</span>
                        <span className="text-gray-600">&middot;</span>
                        <span className="font-mono text-gray-500">{(r.code || '').slice(0, 8)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      {(r.status === 'used') ? (
                        <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full">In</span>
                      ) : (
                        <span className="text-xs bg-pavilion-700 text-gray-300 px-2 py-0.5 rounded-full">Not in</span>
                      )}
                      {familySessions.length > 1 && r.status !== 'used' && (
                        <button
                          onClick={() => setTransferTicket(r)}
                          className="p-1.5 rounded-lg bg-pavilion-700 hover:bg-pavilion-600 transition-all"
                          title="Transfer to another session"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-gold-400" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live scan feed */}
        <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/50 overflow-hidden">
          <div className="px-4 py-2 border-b border-pavilion-600/50 flex items-center justify-between">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-gold-400" /> Live Check-ins
            </p>
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          </div>
          <div className="divide-y divide-pavilion-600/20 max-h-[500px] overflow-y-auto">
            {scanFeed.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">No scans yet. Waiting for check-ins...</div>
            )}
            {scanFeed.map((s, i) => {
              const isValid = s.result === 'valid';
              const isAlready = s.result === 'already_used';
              return (
                <div key={s.id || i} className={`px-4 py-2.5 flex items-center gap-3 ${i === 0 ? 'animate-fade-in' : ''}`}>
                  <div className="flex-shrink-0">
                    {isValid && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                    {isAlready && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                    {!isValid && !isAlready && <XCircle className="w-5 h-5 text-red-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{s.holder_name || s.customer_name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{s.ticket_type_name || ''}{s.scanned_by ? ` · ${s.scanned_by}` : ''}{s.device_id ? ` (${s.device_id})` : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-medium ${isValid ? 'text-green-400' : isAlready ? 'text-amber-400' : 'text-red-400'}`}>
                      {isValid ? 'Valid' : isAlready ? 'Already used' : 'Invalid'}
                    </p>
                    <p className="text-xs text-gray-600">{s.scanned_at ? new Date(s.scanned_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Transfer modal */}
      {transferTicket && (
        <TransferModal
          ticket={transferTicket}
          sessions={familySessions}
          pin={pin}
          onClose={() => setTransferTicket(null)}
          onTransferred={handleTransferred}
        />
      )}
    </div>
  );
}

// ─── Page Wrapper ───────────────────────────────────────────

export default function DoorPage() {
  return <DoorInterface pin={null} userName="Staff" />;
}
