import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  Clock,
  ChevronLeft,
  Plus,
  Minus,
  Loader2,
  Share2,
  Copy,
  Check,
  Users,
  AlertCircle,
} from 'lucide-react';
import { fetchEvent, createCheckout } from '../lib/api';

// ─── Helpers ────────────────────────────────────────────────

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(pence) {
  return `\u00a3${(pence / 100).toFixed(2)}`;
}

function useCountdown(targetDate) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - now;
  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  return { days, hours, mins, secs };
}

// ─── Order Summary Sidebar ──────────────────────────────────

function OrderSummary({
  ticketTypes,
  quantities,
  totalPrice,
  customerInfo,
  setCustomerInfo,
  showCheckout,
  setShowCheckout,
  checkoutLoading,
  checkoutError,
  onCheckout,
}) {
  const selected = ticketTypes.filter((tt) => quantities[tt.id] > 0);

  return (
    <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-6">
      <h3 className="text-lg font-bold mb-4">Order Summary</h3>

      {selected.length === 0 ? (
        <p className="text-gray-500 text-sm">Select tickets to continue</p>
      ) : (
        <>
          <div className="space-y-3 mb-4">
            {selected.map((tt) => (
              <div key={tt.id} className="flex justify-between text-sm">
                <div>
                  <span className="text-gray-300">{tt.name}</span>
                  <span className="text-gray-500"> x{quantities[tt.id]}</span>
                </div>
                <span className="text-white font-medium">
                  {formatPrice(tt.price * quantities[tt.id])}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-pavilion-600/50 pt-4 mb-6">
            <div className="flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold text-gold-400">{formatPrice(totalPrice)}</span>
            </div>
          </div>

          {!showCheckout ? (
            <button
              onClick={() => setShowCheckout(true)}
              className="w-full py-3 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold rounded-lg transition-all text-lg"
            >
              Buy Tickets
            </button>
          ) : (
            <form onSubmit={onCheckout} className="space-y-3">
              <p className="text-sm text-gray-400 font-medium">Your Details</p>
              <input
                type="text"
                placeholder="Full Name"
                required
                value={customerInfo.name}
                onChange={(e) => setCustomerInfo((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
              />
              <input
                type="email"
                placeholder="Email Address"
                required
                value={customerInfo.email}
                onChange={(e) => setCustomerInfo((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={customerInfo.phone}
                onChange={(e) => setCustomerInfo((p) => ({ ...p, phone: e.target.value }))}
                className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
              />

              {checkoutError && <p className="text-red-400 text-sm">{checkoutError}</p>}

              <button
                type="submit"
                disabled={checkoutLoading}
                className="w-full py-3 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {checkoutLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Pay {formatPrice(totalPrice)}
              </button>
              <button
                type="button"
                onClick={() => setShowCheckout(false)}
                className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Back to selection
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export default function EventDetailPage() {
  const { slug } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [quantities, setQuantities] = useState({});
  const [customerInfo, setCustomerInfo] = useState({ name: '', email: '', phone: '' });
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [copied, setCopied] = useState(false);

  const countdown = useCountdown(event?.date);

  useEffect(() => {
    setLoading(true);
    fetchEvent(slug)
      .then((ev) => {
        setEvent(ev);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const ticketTypes = event?.ticketTypes || [];

  const totalItems = useMemo(
    () => Object.values(quantities).reduce((sum, q) => sum + q, 0),
    [quantities]
  );

  const totalPrice = useMemo(
    () =>
      ticketTypes.reduce((sum, tt) => {
        const qty = quantities[tt.id] || 0;
        return sum + tt.price * qty;
      }, 0),
    [quantities, ticketTypes]
  );

  function updateQty(id, delta) {
    setQuantities((prev) => {
      const tt = ticketTypes.find((t) => t.id === id);
      if (!tt) return prev;
      const available = tt.quantity - (tt.sold || 0);
      const current = prev[id] || 0;
      const next = Math.max(0, Math.min(current + delta, available, 10));
      if (next === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  }

  function isSoldOut(tt) {
    return tt.sold != null && tt.sold >= tt.quantity;
  }

  function isSaleActive(tt) {
    const now = new Date();
    if (tt.saleStart && new Date(tt.saleStart) > now) return false;
    if (tt.saleEnd && new Date(tt.saleEnd) < now) return false;
    return true;
  }

  async function handleCheckout(e) {
    e.preventDefault();
    setCheckoutError(null);
    setCheckoutLoading(true);

    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));

    try {
      const result = await createCheckout({
        eventId: event.id,
        items: items.map(i => ({ ticketTypeId: parseInt(i.ticketTypeId, 10), quantity: i.quantity })),
        customerName: customerInfo.name,
        customerEmail: customerInfo.email,
        customerPhone: customerInfo.phone,
      });
      if (result.url) {
        window.location.href = result.url;
      } else {
        setCheckoutError('No checkout URL returned.');
      }
    } catch (err) {
      setCheckoutError(err.message);
    } finally {
      setCheckoutLoading(false);
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function twitterShareUrl() {
    const text = `Check out ${event.title} at Ayr Pavilion!`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`;
  }

  // ─── Loading / Error States ─────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen pt-16">
        <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pt-16 px-4">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Event not found</h2>
        <p className="text-gray-400 mb-6">{error || 'This event does not exist.'}</p>
        <Link to="/events" className="text-gold-400 hover:text-gold-500 transition-colors flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Back to events
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <div className="relative h-64 sm:h-80 lg:h-96 overflow-hidden">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-pavilion-700 via-pavilion-800 to-pavilion-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-pavilion-900 via-pavilion-900/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 lg:p-12 max-w-7xl mx-auto">
          <Link
            to="/events"
            className="inline-flex items-center gap-1 text-sm text-gray-300 hover:text-gold-400 transition-colors mb-4 no-print"
          >
            <ChevronLeft className="w-4 h-4" /> Back to events
          </Link>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
            {event.title}
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="lg:grid lg:grid-cols-3 lg:gap-10">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Event info */}
            <div className="flex flex-wrap gap-4 text-gray-300">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gold-500" />
                <span>{formatDate(event.date)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-gold-500" />
                <span>{formatTime(event.date)}</span>
                {event.doorsOpen && (
                  <span className="text-gray-500 text-sm">(Doors {formatTime(event.doorsOpen)})</span>
                )}
              </div>
              {event.venue && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-gold-500" />
                  <span>{event.venue}</span>
                </div>
              )}
              {event.ageRestriction && (
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-gold-500" />
                  <span>{event.ageRestriction}</span>
                </div>
              )}
            </div>

            {/* Countdown */}
            {countdown && (
              <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-6">
                <p className="text-sm text-gray-400 mb-3 text-center uppercase tracking-wider">Event starts in</p>
                <div className="flex justify-center gap-4 sm:gap-6">
                  {[
                    { val: countdown.days, label: 'Days' },
                    { val: countdown.hours, label: 'Hours' },
                    { val: countdown.mins, label: 'Mins' },
                    { val: countdown.secs, label: 'Secs' },
                  ].map((item) => (
                    <div key={item.label} className="text-center">
                      <span className="block text-3xl sm:text-4xl font-bold text-gold-400 tabular-nums">
                        {String(item.val).padStart(2, '0')}
                      </span>
                      <span className="text-xs text-gray-500 uppercase tracking-wider">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div>
                <h2 className="text-xl font-bold mb-3">About This Event</h2>
                <div className="text-gray-300 leading-relaxed whitespace-pre-line">
                  {event.description}
                </div>
              </div>
            )}

            {/* Ticket selection */}
            <div>
              <h2 className="text-xl font-bold mb-4">Tickets</h2>
              <div className="space-y-3">
                {ticketTypes.length === 0 && (
                  <p className="text-gray-500">No tickets available yet.</p>
                )}
                {ticketTypes.map((tt) => {
                  const soldOut = isSoldOut(tt);
                  const saleActive = isSaleActive(tt);
                  const qty = quantities[tt.id] || 0;
                  const remaining = tt.quantity - (tt.sold || 0);

                  return (
                    <div
                      key={tt.id}
                      className={`bg-pavilion-800 border rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-all ${
                        soldOut || !saleActive
                          ? 'border-pavilion-600/30 opacity-60'
                          : 'border-pavilion-600/50 hover:border-pavilion-600'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-white">{tt.name}</h3>
                          {soldOut && (
                            <span className="px-2 py-0.5 text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 rounded-full">
                              SOLD OUT
                            </span>
                          )}
                          {!saleActive && !soldOut && tt.saleStart && new Date(tt.saleStart) > new Date() && (
                            <span className="px-2 py-0.5 text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full">
                              On sale {formatDate(tt.saleStart)}
                            </span>
                          )}
                        </div>
                        {tt.description && (
                          <p className="text-sm text-gray-400 mt-1">{tt.description}</p>
                        )}
                        <p className="text-gold-400 font-bold mt-1">{formatPrice(tt.price)}</p>
                        {!soldOut && saleActive && remaining <= 20 && remaining > 0 && (
                          <p className="text-xs text-amber-400 mt-1">{remaining} remaining</p>
                        )}
                      </div>

                      {!soldOut && saleActive && (
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <button
                            onClick={() => updateQty(tt.id, -1)}
                            disabled={qty === 0}
                            className="w-9 h-9 flex items-center justify-center rounded-lg bg-pavilion-700 border border-pavilion-600/50 text-gray-300 hover:bg-pavilion-600 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-8 text-center font-bold text-lg tabular-nums">{qty}</span>
                          <button
                            onClick={() => updateQty(tt.id, 1)}
                            disabled={qty >= Math.min(remaining, 10)}
                            className="w-9 h-9 flex items-center justify-center rounded-lg bg-pavilion-700 border border-pavilion-600/50 text-gray-300 hover:bg-pavilion-600 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Share */}
            <div className="flex items-center gap-3 no-print">
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-pavilion-800 border border-pavilion-600/50 text-gray-300 hover:text-white hover:bg-pavilion-700 transition-all"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <a
                href={twitterShareUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-pavilion-800 border border-pavilion-600/50 text-gray-300 hover:text-white hover:bg-pavilion-700 transition-all"
              >
                <Share2 className="w-4 h-4" />
                Share on X
              </a>
            </div>
          </div>

          {/* Right column - Order Summary (desktop sidebar) */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <OrderSummary
                ticketTypes={ticketTypes}
                quantities={quantities}
                totalPrice={totalPrice}
                customerInfo={customerInfo}
                setCustomerInfo={setCustomerInfo}
                showCheckout={showCheckout}
                setShowCheckout={setShowCheckout}
                checkoutLoading={checkoutLoading}
                checkoutError={checkoutError}
                onCheckout={handleCheckout}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile bottom bar */}
      {totalItems > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-pavilion-800/95 backdrop-blur-md border-t border-pavilion-600/50 p-4 no-print">
          {!showCheckout ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">{totalItems} ticket{totalItems !== 1 ? 's' : ''}</p>
                <p className="text-xl font-bold text-gold-400">{formatPrice(totalPrice)}</p>
              </div>
              <button
                onClick={() => setShowCheckout(true)}
                className="px-6 py-3 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold rounded-lg transition-all"
              >
                Buy Tickets
              </button>
            </div>
          ) : (
            <form onSubmit={handleCheckout} className="space-y-3">
              <input
                type="text"
                placeholder="Full Name"
                required
                value={customerInfo.name}
                onChange={(e) => setCustomerInfo((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
              />
              <input
                type="email"
                placeholder="Email"
                required
                value={customerInfo.email}
                onChange={(e) => setCustomerInfo((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={customerInfo.phone}
                onChange={(e) => setCustomerInfo((p) => ({ ...p, phone: e.target.value }))}
                className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
              />
              {checkoutError && <p className="text-red-400 text-sm">{checkoutError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCheckout(false)}
                  className="flex-1 px-4 py-2.5 bg-pavilion-700 text-gray-300 rounded-lg text-sm hover:bg-pavilion-600 transition-all"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={checkoutLoading}
                  className="flex-1 px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  {checkoutLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Pay {formatPrice(totalPrice)}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
