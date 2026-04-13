import { QrCode, CheckCircle2, XCircle, Printer } from "lucide-react";

function QRImg({ value, size = 200 }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&format=svg`;
  return <img src={url} alt={value} width={size} height={size} className="rounded-lg" />;
}

const TEST_CODES = [
  { label: "Test Ticket A", qr: "https://tickets.ayrpavilion.com/tickets/TEST-DEMO-ALPHA" },
  { label: "Test Ticket B", qr: "https://tickets.ayrpavilion.com/tickets/TEST-DEMO-BRAVO" },
  { label: "Test Ticket C", qr: "https://tickets.ayrpavilion.com/tickets/TEST-DEMO-CHARLIE" },
];

const INVALID_CODE = "https://tickets.ayrpavilion.com/tickets/FAKE-TICKET-00000";

export default function ScannerTestPage() {
  return (
    <div className="min-h-screen bg-pavilion-900 text-white px-4 py-8 print:bg-white print:text-black">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8 print:hidden">
          <div className="flex items-center gap-3">
            <QrCode className="w-8 h-8 text-gold-400" />
            <div>
              <h1 className="text-2xl font-bold">Scanner Test Page</h1>
              <p className="text-gray-400 text-sm">Print this page and scan the QR codes to test your scanner hardware</p>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-gold-500 text-pavilion-900 font-bold rounded-lg hover:bg-gold-600 transition-all"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>

        {/* Test tickets - these are dummy codes, not real tickets */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-400 print:text-green-700" />
            <h2 className="text-lg font-bold text-green-400 print:text-green-700">TEST QR CODES — Verify scanner reads the code</h2>
          </div>
          <p className="text-gray-400 text-sm mb-4">These are dummy codes. Scanning them will show RED (invalid) — this confirms the scanner hardware is working and sending data to the app correctly.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {TEST_CODES.map((t, i) => (
              <div key={i} className="bg-pavilion-800 print:bg-gray-100 border border-pavilion-600/50 print:border-gray-300 rounded-xl p-5 text-center">
                <QRImg value={t.qr} size={180} />
                <p className="mt-3 text-sm font-bold text-white print:text-black">{t.label}</p>
                <p className="text-[10px] text-gray-600 print:text-gray-400 font-mono mt-2 break-all">{t.qr.split("/tickets/")[1]}</p>
                <span className="inline-block mt-2 px-2 py-0.5 text-xs font-bold bg-blue-500/20 text-blue-400 print:bg-blue-100 print:text-blue-700 rounded-full">
                  TEST CODE
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Invalid code */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <XCircle className="w-5 h-5 text-red-400 print:text-red-700" />
            <h2 className="text-lg font-bold text-red-400 print:text-red-700">INVALID TICKET — Should show RED</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-pavilion-800 print:bg-gray-100 border border-pavilion-600/50 print:border-gray-300 rounded-xl p-5 text-center">
              <QRImg value={INVALID_CODE} size={180} />
              <p className="mt-3 text-sm font-bold text-white print:text-black">Fake Ticket</p>
              <p className="text-xs text-gray-400 print:text-gray-600 mt-1">This is not a real ticket</p>
              <p className="text-[10px] text-gray-600 print:text-gray-400 font-mono mt-2">{INVALID_CODE.split("/tickets/")[1]}</p>
              <span className="inline-block mt-2 px-2 py-0.5 text-xs font-bold bg-red-500/20 text-red-400 print:bg-red-100 print:text-red-700 rounded-full">
                INVALID
              </span>
            </div>
          </div>
        </section>

        {/* Instructions */}
        <section className="bg-pavilion-800 print:bg-gray-100 border border-pavilion-600/50 print:border-gray-300 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-3">Testing Instructions</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300 print:text-gray-700">
            <li>Print this page or display it on a second screen</li>
            <li>Open <strong className="text-gold-400 print:text-black">tickets.ayrpavilion.com/scan</strong> on the scanning device</li>
            <li>Enter the scanner PIN and select an event</li>
            <li>Scan any of the QR codes above</li>
            <li>All codes should show <strong className="text-red-400 print:text-red-700">RED (Invalid)</strong> — this confirms the scanner is reading and submitting codes correctly</li>
            <li>Once confirmed, the scanner is ready for real tickets on event day</li>
          </ol>
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-xs text-amber-300 print:text-amber-700">
              <strong>Note:</strong> These are safe test codes — no real tickets will be affected. The scanner is working correctly if it shows the red "INVALID" result screen.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
