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
  Camera,
  Keyboard,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
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
      const data = await validateScannerPin(code);
      onAuthenticated(code, data?.user?.name || 'Staff');
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
    subtitle = result.checked_in_at
      ? `First scanned at ${new Date(result.checked_in_at).toLocaleString('en-GB')}`
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
          {(result.ticket.holder_name || result.ticket.holderName) && (
            <div className="flex justify-between">
              <span className="text-gray-400">Name</span>
              <span className="text-white font-semibold">{result.ticket.holder_name || result.ticket.holderName}</span>
            </div>
          )}
          {(result.ticket.ticket_type || result.ticket.ticketType) && (
            <div className="flex justify-between">
              <span className="text-gray-400">Type</span>
              <span className="text-white">{result.ticket.ticket_type || result.ticket.ticketType}</span>
            </div>
          )}
          {result.ticket.event && (
            <div className="flex justify-between">
              <span className="text-gray-400">Event</span>
              <span className="text-white">{result.ticket.event}</span>
            </div>
          )}
          {(result.ticket.order_ref || result.ticket.orderRef) && (
            <div className="flex justify-between">
              <span className="text-gray-400">Order</span>
              <span className="text-white font-mono">{result.ticket.order_ref || result.ticket.orderRef}</span>
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

// ─── Camera QR Scanner ──────────────────────────────────────

function CameraScanner({ onScan, enabled }) {
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);
  const lastScanRef = useRef(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(true);

  const handleScan = useCallback((decodedText) => {
    // Debounce — don't scan same code within 3 seconds
    const now = Date.now();
    if (lastScanRef.current && lastScanRef.current.text === decodedText && now - lastScanRef.current.time < 3000) {
      return;
    }
    lastScanRef.current = { text: decodedText, time: now };

    // Extract ticket code from URL or use raw code
    let ticketCode = decodedText;
    try {
      const url = new URL(decodedText);
      const parts = url.pathname.split('/');
      const ticketsIdx = parts.indexOf('tickets');
      if (ticketsIdx !== -1 && parts[ticketsIdx + 1]) {
        ticketCode = parts[ticketsIdx + 1];
      }
    } catch {
      // Not a URL, use raw value
    }

    onScan(ticketCode);
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const containerId = 'qr-reader';

    async function startScanner() {
      try {
        // Small delay to ensure DOM element is mounted
        await new Promise(r => setTimeout(r, 300));
        if (cancelled) return;

        const html5Qr = new Html5Qrcode(containerId);
        html5QrRef.current = html5Qr;

        // Use facingMode for mobile — more reliable than cameraId
        const config = {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minDim = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minDim * 0.7);
            return { width: size, height: size };
          },
          aspectRatio: 1,
          disableFlip: false,
        };

        if (cancelled) return;

        await html5Qr.start(
          { facingMode: 'environment' },
          config,
          handleScan,
          () => {} // ignore per-frame no-QR errors
        );

        if (!cancelled) setStarting(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Camera error:', err);

        // Fallback: try any available camera
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras && cameras.length > 0 && !cancelled) {
            const html5Qr = new Html5Qrcode(containerId);
            html5QrRef.current = html5Qr;
            await html5Qr.start(
              cameras[cameras.length - 1].id,
              { fps: 15, qrbox: { width: 250, height: 250 } },
              handleScan,
              () => {}
            );
            if (!cancelled) setStarting(false);
            return;
          }
        } catch {}

        if (!cancelled) {
          setError(err.message || 'Failed to access camera');
          setStarting(false);
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      if (html5QrRef.current) {
        html5QrRef.current.stop().catch(() => {});
        html5QrRef.current = null;
      }
    };
  }, [enabled, handleScan]);

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center">
        <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-red-300 text-sm">{error}</p>
        <p className="text-gray-500 text-xs mt-2">Make sure you've granted camera permissions and are using HTTPS</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {starting && (
        <div className="absolute inset-0 flex items-center justify-center bg-pavilion-800 rounded-xl z-10">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-gold-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-400 text-sm">Starting camera...</p>
          </div>
        </div>
      )}
      <div
        id="qr-reader"
        ref={scannerRef}
        className="rounded-xl overflow-hidden bg-pavilion-800"
        style={{ minHeight: 320 }}
      />
      {!starting && (
        <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
          <span className="bg-black/60 text-white text-xs px-3 py-1 rounded-full">
            Point at QR code on ticket
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Scanner Screen ────────────────────────────────────

function ScannerInterface({ pin, userName }) {
  const [mode, setMode] = useState('camera'); // 'camera' | 'manual'
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

  const doScan = useCallback(async (ticketCode) => {
    if (!ticketCode?.trim()) return;
    setScanning(true);
    setResult(null);

    console.log('[Scanner] Scanning code:', ticketCode.trim(), 'with pin:', pin ? '****' : 'NONE');

    try {
      const data = await scanTicket(ticketCode.trim(), pin);
      console.log('[Scanner] Response:', JSON.stringify(data));
      setResult(data);
      loadStats();

      // Vibrate on result (mobile)
      if (navigator.vibrate) {
        if (data.result === 'valid') navigator.vibrate(200);
        else navigator.vibrate([100, 50, 100]);
      }
    } catch (err) {
      console.error('[Scanner] Error:', err.message, err.status, err.body);
      setResult({
        result: 'error',
        error: err.message || 'Scan failed',
      });
    } finally {
      setScanning(false);
    }
  }, [pin, loadStats]);

  async function handleManualScan(e) {
    e?.preventDefault();
    await doScan(code);
  }

  function handleReset() {
    setResult(null);
    setCode('');
    if (mode === 'manual') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  return (
    <div className="min-h-screen bg-pavilion-900 px-4 pt-6 pb-12">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-6 h-6 text-gold-400" />
            <div>
              <h1 className="text-xl font-bold leading-tight">Door Scanner</h1>
              {userName && <p className="text-xs text-gray-500">Signed in as {userName}</p>}
            </div>
          </div>
          {stats && (
            <div className="text-right">
              <p className="text-2xl font-bold text-gold-400 tabular-nums">{stats.checked_in || stats.checkedIn || 0}</p>
              <p className="text-xs text-gray-500">scanned{stats.total_tickets || stats.totalTickets ? ` / ${stats.total_tickets || stats.totalTickets}` : ''}</p>
            </div>
          )}
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('camera')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
              mode === 'camera'
                ? 'bg-gold-500 text-pavilion-900'
                : 'bg-pavilion-800 border border-pavilion-600/50 text-gray-400 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            Camera
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
              mode === 'manual'
                ? 'bg-gold-500 text-pavilion-900'
                : 'bg-pavilion-800 border border-pavilion-600/50 text-gray-400 hover:text-white'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            Manual
          </button>
        </div>

        {/* Event selector */}
        {events.length > 0 && (
          <div className="relative mb-4">
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

        {/* Camera scanner */}
        {!result && mode === 'camera' && (
          <div className="space-y-3">
            <CameraScanner onScan={doScan} enabled={!result && mode === 'camera'} />
            {scanning && (
              <div className="flex items-center justify-center gap-2 text-gold-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Validating...</span>
              </div>
            )}
          </div>
        )}

        {/* Manual input */}
        {!result && mode === 'manual' && (
          <div className="space-y-4">
            <form onSubmit={handleManualScan}>
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
  const [auth, setAuth] = useState(null); // { pin, userName }

  if (!auth) {
    return <PinEntry onAuthenticated={(pin, userName) => setAuth({ pin, userName })} />;
  }

  return <ScannerInterface pin={auth.pin} userName={auth.userName} />;
}
