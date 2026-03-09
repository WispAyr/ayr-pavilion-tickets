import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  QrCode,
  Hash,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { validateScannerPin, scanTicket, fetchScanStats, fetchEvents } from '../lib/api';

// ─── PIN Entry Screen ───────────────────────────────────────

function PinEntry({ onAuthenticated }) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handleDigit(d) {
    if (pin.length < 4) {
      const next = pin + d;
      setPin(next);
      if (next.length === 4) {
        submitPin(next);
      }
    }
  }

  function handleDelete() {
    setPin((p) => p.slice(0, -1));
    setError(null);
  }

  async function submitPin(code) {
    setLoading(true);
    setError(null);
    try {
      await validateScannerPin(code);
      onAuthenticated(code);
    } catch (err) {
      setError(err.message || 'Invalid PIN');
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
        <h1 className="text-2xl font-bold mb-1">Door Scanner</h1>
        <p className="text-gray-400 text-sm">Enter your 4-digit PIN to continue</p>
      </div>

      {/* PIN display */}
      <div className="flex gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
              pin.length > i
                ? 'border-gold-500 bg-pavilion-800 text-gold-400'
                : 'border-pavilion-600 bg-pavilion-800 text-transparent'
            }`}
          >
            {pin[i] ? '\u2022' : ''}
          </div>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {loading && <Loader2 className="w-6 h-6 text-gold-400 animate-spin mb-4" />}

      {/* Numeric keypad */}
      <div className="grid grid-cols-3 gap-3 max-w-xs w-full">
        {digits.map((d, i) => {
          if (d === null) return <div key={i} />;
          if (d === 'del') {
            return (
              <button
                key={i}
                onClick={handleDelete}
                className="h-16 rounded-xl bg-pavilion-800 border border-pavilion-600/50 text-gray-400 hover:bg-pavilion-700 hover:text-white transition-all text-sm font-medium"
              >
                Delete
              </button>
            );
          }
          return (
            <button
              key={i}
              onClick={() => handleDigit(String(d))}
              disabled={loading || pin.length >= 4}
              className="h-16 rounded-xl bg-pavilion-800 border border-pavilion-600/50 text-white text-xl font-bold hover:bg-pavilion-700 active:bg-pavilion-600 transition-all disabled:opacity-50"
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Scan Result Display ────────────────────────────────────

function ScanResult({ result, onReset }) {
  if (!result) return null;

  const isValid = result.result === 'valid' || result.status === 'valid' || result.valid === true;
  const isAlreadyScanned = result.result === 'already_used' || result.status === 'already-scanned' || result.alreadyScanned === true;
  const isInvalid = !isValid && !isAlreadyScanned;

  let bgClass, icon, title, subtitle;
  if (isValid) {
    bgClass = 'from-green-900/80 to-green-900/20 border-green-500/50';
    icon = <CheckCircle2 className="w-20 h-20 text-green-400" />;
    title = 'VALID TICKET';
    subtitle = 'Entry approved';
  } else if (isAlreadyScanned) {
    bgClass = 'from-amber-900/80 to-amber-900/20 border-amber-500/50';
    icon = <AlertTriangle className="w-20 h-20 text-amber-400" />;
    title = 'ALREADY SCANNED';
    subtitle = result.checkedInAt
      ? `First scanned at ${new Date(result.checkedInAt).toLocaleString('en-GB')}`
      : 'This ticket has already been used';
  } else {
    bgClass = 'from-red-900/80 to-red-900/20 border-red-500/50';
    icon = <XCircle className="w-20 h-20 text-red-400" />;
    title = 'INVALID';
    subtitle = result.error || result.message || 'Ticket not recognised';
  }

  return (
    <div className={`bg-gradient-to-b ${bgClass} border rounded-2xl p-8 text-center animate-fade-in`}>
      <div className="flex justify-center mb-4">{icon}</div>
      <h2 className="text-2xl font-black tracking-wider mb-1">{title}</h2>
      <p className="text-gray-300 text-sm mb-4">{subtitle}</p>

      {result.ticket && (
        <div className="bg-pavilion-900/50 rounded-xl p-4 mb-4 text-left space-y-2 text-sm">
          {result.ticket.holderName && (
            <div className="flex justify-between">
              <span className="text-gray-400">Name</span>
              <span className="text-white font-semibold">{result.ticket.holderName}</span>
            </div>
          )}
          {result.ticket.ticketType && (
            <div className="flex justify-between">
              <span className="text-gray-400">Type</span>
              <span className="text-white">{result.ticket.ticketType}</span>
            </div>
          )}
          {result.ticket.event && (
            <div className="flex justify-between">
              <span className="text-gray-400">Event</span>
              <span className="text-white">{result.ticket.event}</span>
            </div>
          )}
          {result.ticket.orderRef && (
            <div className="flex justify-between">
              <span className="text-gray-400">Order</span>
              <span className="text-white font-mono">{result.ticket.orderRef}</span>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onReset}
        className="mt-2 px-6 py-3 bg-pavilion-800 border border-pavilion-600/50 rounded-xl text-white font-medium hover:bg-pavilion-700 transition-all flex items-center justify-center gap-2 mx-auto"
      >
        <RotateCcw className="w-4 h-4" />
        Scan Next
      </button>
    </div>
  );
}

// ─── Main Scanner Screen ────────────────────────────────────

function ScannerInterface({ pin }) {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const inputRef = useRef(null);

  // Load events list
  useEffect(() => {
    fetchEvents()
      .then((data) => {
        const list = Array.isArray(data) ? data : data.events || [];
        setEvents(list);
      })
      .catch(() => {});
  }, []);

  // Load scan stats
  const loadStats = useCallback(() => {
    if (selectedEvent) {
      fetchScanStats(selectedEvent, pin)
        .then(setStats)
        .catch(() => {});
    }
  }, [selectedEvent, pin]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function handleScan(e) {
    e?.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setScanning(true);
    setResult(null);

    try {
      const data = await scanTicket(trimmed, pin);
      setResult(data);
      loadStats();
    } catch (err) {
      setResult({
        status: 'invalid',
        error: err.message || 'Scan failed',
      });
    } finally {
      setScanning(false);
    }
  }

  function handleReset() {
    setResult(null);
    setCode('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  return (
    <div className="min-h-screen bg-pavilion-900 px-4 pt-6 pb-12">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <QrCode className="w-6 h-6 text-gold-400" />
            <h1 className="text-xl font-bold">Door Scanner</h1>
          </div>
          {stats && (
            <div className="text-right">
              <p className="text-2xl font-bold text-gold-400 tabular-nums">{stats.checkedIn || 0}</p>
              <p className="text-xs text-gray-500">scanned{stats.totalTickets ? ` / ${stats.totalTickets}` : ''}</p>
            </div>
          )}
        </div>

        {/* Event selector */}
        {events.length > 0 && (
          <div className="relative mb-6">
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="w-full appearance-none px-4 py-3 bg-pavilion-800 border border-pavilion-600/50 rounded-xl text-white text-sm focus:border-gold-500 focus:outline-none pr-10"
            >
              <option value="">All Events</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        )}

        {/* Result display */}
        {result && <ScanResult result={result} onReset={handleReset} />}

        {/* Scan input */}
        {!result && (
          <div className="space-y-4">
            <form onSubmit={handleScan}>
              <div className="relative">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter or scan ticket code..."
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  className="w-full pl-12 pr-4 py-4 bg-pavilion-800 border border-pavilion-600/50 rounded-xl text-white text-lg font-mono placeholder-gray-600 focus:border-gold-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!code.trim() || scanning}
                className="w-full mt-4 py-4 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold text-lg rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {scanning ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    Validate Ticket
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-xs text-gray-600">
              Type the ticket code or use an external QR scanner app to paste the code
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page Wrapper ───────────────────────────────────────────

export default function ScannerPage() {
  const [pin, setPin] = useState(null);

  if (!pin) {
    return <PinEntry onAuthenticated={setPin} />;
  }

  return <ScannerInterface pin={pin} />;
}
