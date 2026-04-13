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
  Usb,
} from 'lucide-react';
import jsQR from 'jsqr';
import { validateScannerPin, scanTicket, fetchScanStats, fetchEvents, fetchCurrentEvent } from '../lib/api';

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
  const isGroupValid = result.result === "group_valid";
  const isGroupAlreadyUsed = result.result === "group_already_used";
  const isAlreadyScanned = result.result === 'already_used' || result.status === 'already-scanned' || result.alreadyScanned === true;

  const isWrongEvent = isValid && result.wrong_event;

  let bgClass, icon, title, subtitle;
  if (isValid && isWrongEvent) {
    bgClass = 'from-orange-900/80 to-orange-900/20 border-orange-500/50';
    icon = <AlertTriangle className="w-20 h-20 text-orange-400" />;
    title = 'WRONG SESSION';
    subtitle = 'Valid ticket but for a DIFFERENT event/session';
  } else if (isValid) {
    bgClass = 'from-green-900/80 to-green-900/20 border-green-500/50';
    icon = <CheckCircle2 className="w-20 h-20 text-green-400" />;
    title = 'VALID TICKET';
    subtitle = 'Entry approved';
  } else if (isGroupValid) {
    bgClass = 'from-green-900/80 to-green-900/20 border-green-500/50';
    icon = <CheckCircle2 className="w-20 h-20 text-green-400" />;
    title = 'GROUP CHECK-IN';
    subtitle = result.message || `Checked in ${result.checked_in_now}/${result.total}`;
  } else if (isGroupAlreadyUsed) {
    bgClass = 'from-amber-900/80 to-amber-900/20 border-amber-500/50';
    icon = <AlertTriangle className="w-20 h-20 text-amber-400" />;
    title = 'ALL ALREADY CHECKED IN';
    subtitle = result.message || `All ${result.total} tickets already scanned`;
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

      {/* Group pass ticket list */}
      {(isGroupValid || isGroupAlreadyUsed) && (
        <div className="bg-pavilion-900/50 rounded-xl p-4 mb-4 text-left space-y-1 text-sm">
          {result.customer_name && (
            <div className="flex justify-between mb-2">
              <span className="text-gray-400">Customer</span>
              <span className="text-white font-semibold">{result.customer_name}</span>
            </div>
          )}
          {result.event && (
            <div className="flex justify-between mb-2">
              <span className="text-gray-400">Event</span>
              <span className="text-white">{result.event}</span>
            </div>
          )}
          {result.tickets && result.tickets.map((t, i) => (
            <div key={i} className="flex justify-between py-1 border-t border-pavilion-700/50">
              <span className="text-white">{t.holder_name}</span>
              <span className="text-gray-400">{t.ticket_type}</span>
            </div>
          ))}
          {result.already_used > 0 && (
            <p className="text-amber-400 text-xs mt-2">{result.already_used} ticket{result.already_used > 1 ? 's' : ''} already scanned earlier</p>
          )}
        </div>
      )}

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
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const lastScanRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.setAttribute("autoplay", "true");
        await video.play();
        if (!cancelled) setStarting(false);

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        function tick() {
          if (cancelled || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
          if (code && code.data) {
            const now = Date.now();
            if (!lastScanRef.current || lastScanRef.current.text !== code.data || now - lastScanRef.current.time > 3000) {
              lastScanRef.current = { text: code.data, time: now };
              let ticketCode = code.data;
              try {
                const url = new URL(code.data);
                const parts = url.pathname.split("/");
                const idx = parts.indexOf("tickets");
                if (idx !== -1 && parts[idx + 1]) ticketCode = parts[idx + 1];
              } catch {}
              onScan(ticketCode);
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (!cancelled) {
          console.error("Camera error:", err);
          setError(err.message || "Failed to access camera");
          setStarting(false);
        }
      }
    }
    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [enabled, onScan]);

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center">
        <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-red-300 text-sm">{error}</p>
        <p className="text-gray-500 text-xs mt-2">Make sure you have granted camera permissions and are using HTTPS</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-black">
      {starting && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-pavilion-900/80">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-gold-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-400 text-sm">Starting camera...</p>
          </div>
        </div>
      )}
      <video ref={videoRef} className="w-full rounded-xl" playsInline autoPlay muted />
      <canvas ref={canvasRef} className="hidden" />
      {/* Scan guide overlay */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-56 h-56 border-2 border-gold-400/50 rounded-2xl" />
      </div>
    </div>
  );
}

// ─── Compact Scan Lane (for USB multi-lane) ────────────────

function ScanLane({ laneId, label, result, scanning }) {
  if (scanning) {
    return (
      <div className="flex-1 bg-blue-900/30 border-2 border-blue-500/50 rounded-2xl flex flex-col items-center justify-center p-4 min-h-[200px]">
        <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-2" />
        <p className="text-blue-300 font-bold text-sm">{label}</p>
        <p className="text-blue-400/60 text-xs">Validating...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex-1 bg-pavilion-800/50 border-2 border-pavilion-600/30 border-dashed rounded-2xl flex flex-col items-center justify-center p-4 min-h-[200px]">
        <QrCode className="w-12 h-12 text-pavilion-600 mb-2" />
        <p className="text-gray-500 font-bold text-sm">{label}</p>
        <p className="text-gray-600 text-xs">Waiting for scan...</p>
      </div>
    );
  }

  const isValid = result.result === 'valid' || result.status === 'valid' || result.valid === true;
  const isGroupValid = result.result === 'group_valid';
  const isGroupAlreadyUsed = result.result === 'group_already_used';
  const isAlreadyScanned = result.result === 'already_used' || result.status === 'already-scanned';
  const isWrongEvent = isValid && result.wrong_event;

  let bgClass, borderClass, icon, title, textColor;
  if (isValid && isWrongEvent) {
    bgClass = 'bg-orange-900/40'; borderClass = 'border-orange-500'; textColor = 'text-orange-400';
    icon = <AlertTriangle className="w-16 h-16 text-orange-400" />;
    title = 'WRONG SESSION';
  } else if (isGroupValid) {
    bgClass = 'bg-green-900/40'; borderClass = 'border-green-500'; textColor = 'text-green-400';
    icon = <CheckCircle2 className="w-16 h-16 text-green-400" />;
    title = `GROUP ${result.checked_in_now}/${result.total}`;
  } else if (isGroupAlreadyUsed) {
    bgClass = 'bg-amber-900/40'; borderClass = 'border-amber-500'; textColor = 'text-amber-400';
    icon = <AlertTriangle className="w-16 h-16 text-amber-400" />;
    title = 'GROUP DONE';
  } else if (isValid) {
    bgClass = 'bg-green-900/40'; borderClass = 'border-green-500'; textColor = 'text-green-400';
    icon = <CheckCircle2 className="w-16 h-16 text-green-400" />;
    title = 'VALID';
  } else if (isAlreadyScanned) {
    bgClass = 'bg-amber-900/40'; borderClass = 'border-amber-500'; textColor = 'text-amber-400';
    icon = <AlertTriangle className="w-16 h-16 text-amber-400" />;
    title = 'ALREADY USED';
  } else {
    bgClass = 'bg-red-900/40'; borderClass = 'border-red-500'; textColor = 'text-red-400';
    icon = <XCircle className="w-16 h-16 text-red-400" />;
    title = 'INVALID';
  }

  return (
    <div className={`flex-1 ${bgClass} border-2 ${borderClass} rounded-2xl flex flex-col items-center justify-center p-4 min-h-[200px] animate-fade-in`}>
      {icon}
      <p className={`${textColor} font-black text-xl tracking-wider mt-2`}>{title}</p>
      <p className="text-gray-500 font-bold text-xs mt-1">{label}</p>
      {result.ticket && (
        <div className="mt-2 text-center">
          {result.ticket.holder_name && <p className="text-white text-sm font-semibold">{result.ticket.holder_name}</p>}
          {result.ticket.ticket_type && <p className="text-gray-400 text-xs">{result.ticket.ticket_type}</p>}
          {result.ticket.event && <p className="text-gray-500 text-xs">{result.ticket.event}</p>}
        </div>
      )}
      {result.error && <p className="text-gray-400 text-xs mt-1">{result.error}</p>}
    </div>
  );
}

// ─── USB Scanner Mode ───────────────────────────────────────

function UsbScannerMode({ pin, selectedEvent }) {
  const hiddenInputRef = useRef(null);
  const bufferRef = useRef([]);
  const staleTimerRef = useRef(null);
  const nextLaneRef = useRef(1);
  const [lanes, setLanes] = useState({ 1: { result: null, scanning: false } });
  const [detectedScanners, setDetectedScanners] = useState(1);
  const laneTimersRef = useRef({});

  // Keep hidden input focused
  useEffect(() => {
    const el = hiddenInputRef.current;
    if (el) el.focus();
    const refocus = setInterval(() => {
      if (hiddenInputRef.current && document.activeElement !== hiddenInputRef.current) {
        hiddenInputRef.current.focus();
      }
    }, 200);
    return () => clearInterval(refocus);
  }, []);

  // Auto-reset lanes after delay
  const autoResetLane = useCallback((laneId, delay) => {
    if (laneTimersRef.current[laneId]) clearTimeout(laneTimersRef.current[laneId]);
    laneTimersRef.current[laneId] = setTimeout(() => {
      setLanes(prev => ({ ...prev, [laneId]: { result: null, scanning: false } }));
    }, delay);
  }, []);

  // Process a completed scan buffer
  const processScan = useCallback(async (rawText) => {
    // Check for prefix pattern: N|code
    const prefixMatch = rawText.match(/^(\d+)\|(.+)$/);
    let laneId, code;

    if (prefixMatch) {
      laneId = parseInt(prefixMatch[1], 10);
      code = prefixMatch[2];
      // Auto-expand lanes if new scanner detected
      if (laneId > detectedScanners) {
        setDetectedScanners(laneId);
      }
    } else {
      // Round-robin assignment
      laneId = nextLaneRef.current;
      code = rawText;
      if (detectedScanners > 1) {
        nextLaneRef.current = (nextLaneRef.current % detectedScanners) + 1;
      }
    }

    // Ensure lane exists
    setLanes(prev => {
      const next = { ...prev };
      if (!next[laneId]) next[laneId] = { result: null, scanning: false };
      next[laneId] = { ...next[laneId], scanning: true, result: null };
      return next;
    });

    // Extract ticket code from URL if needed
    let ticketCode = code;
    try {
      const url = new URL(code);
      const parts = url.pathname.split('/');
      const idx = parts.indexOf('tickets');
      if (idx !== -1 && parts[idx + 1]) ticketCode = parts[idx + 1];
    } catch {}

    // Call the scan API
    const deviceId = localStorage.getItem('scanner_device_id') || undefined;
    try {
      const data = await scanTicket(ticketCode.trim(), pin, deviceId, selectedEvent || null);
      setLanes(prev => ({ ...prev, [laneId]: { result: data, scanning: false } }));
      const isValid = data.result === 'valid' || data.result === 'group_valid' || data.status === 'valid';
      autoResetLane(laneId, isValid ? 4000 : 4000);
    } catch (err) {
      setLanes(prev => ({
        ...prev,
        [laneId]: { result: { result: 'error', error: err.message || 'Scan failed' }, scanning: false }
      }));
      autoResetLane(laneId, 4000);
    }
  }, [detectedScanners, selectedEvent, autoResetLane]);

  // Handle keystrokes from hidden input
  const handleKeyDown = useCallback((e) => {
    // Clear stale buffer timer
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);

    if (e.key === 'Enter') {
      e.preventDefault();
      const text = bufferRef.current.join('').trim();
      bufferRef.current = [];
      if (text.length > 3) {
        processScan(text);
      }
      // Clear the input value
      if (hiddenInputRef.current) hiddenInputRef.current.value = '';
      return;
    }

    // Only buffer printable characters
    if (e.key.length === 1) {
      bufferRef.current.push(e.key);
    }

    // Stale buffer cleanup (500ms no input = discard)
    staleTimerRef.current = setTimeout(() => {
      bufferRef.current = [];
      if (hiddenInputRef.current) hiddenInputRef.current.value = '';
    }, 500);
  }, [processScan]);

  const laneCount = Math.max(detectedScanners, Object.keys(lanes).length);
  const laneIds = Array.from({ length: laneCount }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      {/* Hidden input captures all keystrokes */}
      <input
        ref={hiddenInputRef}
        type="text"
        className="fixed -top-96 left-0 opacity-0 w-0 h-0"
        onKeyDown={handleKeyDown}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        tabIndex={0}
      />

      {/* Status bar */}
      <div className="flex items-center justify-between bg-pavilion-800 border border-pavilion-600/50 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <Usb className="w-4 h-4 text-green-400" />
          <span className="text-sm text-gray-300">USB Scanner Mode</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{laneCount === 1 ? '1 scanner' : `${laneCount} scanners`}</span>
          <button
            onClick={() => {
              const next = detectedScanners >= 3 ? 1 : detectedScanners + 1;
              setDetectedScanners(next);
              const newLanes = {};
              for (let i = 1; i <= next; i++) newLanes[i] = lanes[i] || { result: null, scanning: false };
              setLanes(newLanes);
            }}
            className="text-xs text-gold-400 hover:text-gold-300 transition-colors"
          >
            {laneCount === 1 ? '+ Add lane' : laneCount >= 3 ? 'Reset to 1' : '+ Add lane'}
          </button>
        </div>
      </div>

      {/* Scanner lanes */}
      <div className={`flex gap-4 ${laneCount === 1 ? '' : ''}`}>
        {laneIds.map(id => (
          <ScanLane
            key={id}
            laneId={id}
            label={laneCount > 1 ? `Scanner ${id}` : 'Scanner'}
            result={lanes[id]?.result}
            scanning={lanes[id]?.scanning}
          />
        ))}
      </div>

      {/* Instructions */}
      <div className="text-center space-y-1">
        <p className="text-gray-500 text-xs">Point USB scanner at ticket QR code — results appear automatically</p>
        {laneCount === 1 && (
          <p className="text-gray-600 text-xs">Configure scanner prefix (1| or 2|) for multi-scanner support</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Scanner Screen ────────────────────────────────────

function ScannerInterface({ pin, userName }) {
  const [mode, setMode] = useState('camera'); // 'camera' | 'manual' | 'usb'
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [autoEvent, setAutoEvent] = useState(null);
  const [eventMode, setEventMode] = useState('');
  const [manualOverride, setManualOverride] = useState(false);
  const [deviceName, setDeviceName] = useState(() => localStorage.getItem('scanner_device_id') || '');
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const inputRef = useRef(null);

  // Auto-detect current event + load all events as fallback
  useEffect(() => {
    fetchCurrentEvent(pin)
      .then((data) => {
        if (data.event) {
          setAutoEvent(data.event);
          setEventMode(data.mode);
          if (!manualOverride) setSelectedEvent(String(data.event.id));
        }
      })
      .catch(() => {});
    fetchEvents()
      .then((data) => {
        const list = Array.isArray(data) ? data : data.events || [];
        setEvents(list);
      })
      .catch(() => {});
    // Re-check every 5 minutes
    const iv = setInterval(() => {
      fetchCurrentEvent(pin).then((data) => {
        if (data.event) {
          setAutoEvent(data.event);
          setEventMode(data.mode);
          if (!manualOverride) setSelectedEvent(String(data.event.id));
        }
      }).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [pin, manualOverride]);

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

    const deviceId = localStorage.getItem('scanner_device_id') || undefined;
    console.log('[Scanner] Scanning code:', ticketCode.trim(), 'with pin:', pin ? '****' : 'NONE');

    try {
      const data = await scanTicket(ticketCode.trim(), pin, deviceId, selectedEvent || null);
      console.log('[Scanner] Response:', JSON.stringify(data));
      setResult(data);
      loadStats();

      // Vibrate on result (mobile)
      if (navigator.vibrate) {
        if (data.result === 'valid' || data.result === 'group_valid') navigator.vibrate(200);
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

        {/* Device name setting */}
        <div className="mb-4">
          <button onClick={() => setShowDeviceSettings(!showDeviceSettings)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            {deviceName ? `Device: ${deviceName}` : 'Set device name'}
          </button>
          {showDeviceSettings && (
            <div className="mt-2 flex gap-2">
              <input
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                placeholder="e.g. Front Door, Side Gate"
                className="flex-1 px-3 py-2 bg-pavilion-800 border border-pavilion-600/50 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none"
              />
              <button onClick={() => { localStorage.setItem('scanner_device_id', deviceName); setShowDeviceSettings(false); }} className="px-3 py-2 bg-gold-500 text-pavilion-900 text-sm font-medium rounded-lg">Save</button>
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
          <button
            onClick={() => setMode('usb')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
              mode === 'usb'
                ? 'bg-gold-500 text-pavilion-900'
                : 'bg-pavilion-800 border border-pavilion-600/50 text-gray-400 hover:text-white'
            }`}
          >
            <Usb className="w-4 h-4" />
            USB
          </button>
        </div>

        {/* Event selector */}
        {/* Active event display */}
        {autoEvent && !manualOverride && (
          <div className={`mb-4 rounded-xl p-3 border ${
            eventMode === "live" ? "bg-green-500/10 border-green-500/30" :
            eventMode === "pre-event" ? "bg-amber-500/10 border-amber-500/30" :
            "bg-pavilion-800 border-pavilion-600/50"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  {eventMode === "live" && <span className="text-green-400 text-xs font-bold animate-pulse">{String.fromCharCode(9679)} LIVE</span>}
                  {eventMode === "pre-event" && <span className="text-amber-400 text-xs font-bold">DOORS SOON</span>}
                  {eventMode === "upcoming" && <span className="text-gray-400 text-xs font-bold">NEXT EVENT</span>}
                </div>
                <p className="text-white text-sm font-semibold mt-0.5">{autoEvent.title}</p>
              </div>
              <button
                onClick={() => setManualOverride(true)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Change
              </button>
            </div>
          </div>
        )}

        {/* Manual event selector (shown if override or no auto-event) */}
        {(manualOverride || !autoEvent) && events.length > 0 && (
          <div className="relative mb-4">
            <select
              value={selectedEvent}
              onChange={(e) => { setSelectedEvent(e.target.value); setManualOverride(true); }}
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
            {manualOverride && autoEvent && (
              <button
                onClick={() => { setManualOverride(false); setSelectedEvent(String(autoEvent.id)); }}
                className="mt-2 text-xs text-gold-400 hover:underline"
              >
                {String.fromCharCode(8592)} Back to auto-detect ({autoEvent.title})
              </button>
            )}
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

        {/* USB scanner mode */}
        {mode === 'usb' && (
          <UsbScannerMode pin={pin} selectedEvent={selectedEvent} />
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
