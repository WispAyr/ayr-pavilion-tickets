import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  Clock,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  Loader2,
  Share2,
  Copy,
  Check,
  Users,
  AlertCircle,
  ShieldCheck,
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

// ─── Addon Selection Component ──────────────────────────────

function AddonSelector({ addon, ticketIndex, ticketLabel, value, onChange }) {
  const effectivePrice = (option) => option?.priceOverride !== null && option?.priceOverride !== undefined ? option.priceOverride : addon.price;

  if (addon.type === 'select') {
    const options = addon.options || [];
    return (
      <div className="space-y-1">
        <label className="block text-sm text-gray-300">
          {addon.name}
          {addon.required ? <span className="text-red-400 ml-1">*</span> : ''}
          {addon.price > 0 && <span className="text-gold-400 ml-2">{formatPrice(addon.price)}</span>}
        </label>
        {addon.description && <p className="text-xs text-gray-500">{addon.description}</p>}
        {ticketLabel && <p className="text-xs text-gold-400/70">{ticketLabel}</p>}
        <select
          value={value?.addonOptionId || ''}
          onChange={(e) => {
            const optId = e.target.value ? parseInt(e.target.value, 10) : null;
            const opt = options.find(o => o.id === optId);
            onChange(optId ? {
              addonId: addon.id,
              addonOptionId: optId,
              selectedOption: opt?.label,
              quantity: 1,
              price: effectivePrice(opt),
              ticketIndex,
            } : null);
          }}
          className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none"
        >
          <option value="">Select...</option>
          {options.map(opt => {
            const available = opt.stock > 0 ? opt.stock - (opt.reserved || 0) : null;
            const outOfStock = available !== null && available <= 0;
            return (
              <option key={opt.id} value={opt.id} disabled={outOfStock}>
                {opt.label}
                {opt.priceOverride !== null && opt.priceOverride !== undefined ? ` (${formatPrice(opt.priceOverride)})` : ''}
                {available !== null && available > 0 && available <= 10 ? ` - ${available} left` : ''}
                {outOfStock ? ' - Out of stock' : ''}
              </option>
            );
          })}
        </select>
      </div>
    );
  }

  if (addon.type === 'checkbox') {
    return (
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => {
            onChange(e.target.checked ? {
              addonId: addon.id,
              quantity: 1,
              price: addon.price,
              ticketIndex,
            } : null);
          }}
          className="mt-0.5 w-4 h-4 rounded border-pavilion-600 bg-pavilion-700 text-gold-500 focus:ring-gold-500/50"
        />
        <div>
          <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
            {addon.name}
            {addon.required ? <span className="text-red-400 ml-1">*</span> : ''}
          </span>
          {addon.price > 0 && <span className="text-gold-400 ml-2 text-sm">{formatPrice(addon.price)}</span>}
          {addon.description && <p className="text-xs text-gray-500 mt-0.5">{addon.description}</p>}
          {ticketLabel && <p className="text-xs text-gold-400/70">{ticketLabel}</p>}
        </div>
      </label>
    );
  }

  if (addon.type === 'quantity') {
    const qty = value?.quantity || 0;
    return (
      <div className="space-y-1">
        <label className="block text-sm text-gray-300">
          {addon.name}
          {addon.required ? <span className="text-red-400 ml-1">*</span> : ''}
          {addon.price > 0 && <span className="text-gold-400 ml-2">{formatPrice(addon.price)} each</span>}
        </label>
        {addon.description && <p className="text-xs text-gray-500">{addon.description}</p>}
        {ticketLabel && <p className="text-xs text-gold-400/70">{ticketLabel}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const next = Math.max(0, qty - 1);
              onChange(next > 0 ? { addonId: addon.id, quantity: next, price: addon.price, ticketIndex } : null);
            }}
            disabled={qty === 0}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-pavilion-700 border border-pavilion-600/50 text-gray-300 hover:bg-pavilion-600 disabled:opacity-30 transition-all"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-6 text-center font-bold tabular-nums">{qty}</span>
          <button
            type="button"
            onClick={() => {
              const next = Math.min(qty + 1, addon.maxQuantity || 10);
              onChange({ addonId: addon.id, quantity: next, price: addon.price, ticketIndex });
            }}
            disabled={qty >= (addon.maxQuantity || 10)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-pavilion-700 border border-pavilion-600/50 text-gray-300 hover:bg-pavilion-600 disabled:opacity-30 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Waiver Component ───────────────────────────────────────

function WaiverAcceptance({ waiver, accepted, onToggle }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-pavilion-700/50 border border-pavilion-600/30 rounded-xl p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={accepted}
          onChange={() => onToggle(waiver.id)}
          className="mt-1 w-4 h-4 rounded border-pavilion-600 bg-pavilion-700 text-gold-500 focus:ring-gold-500/50"
        />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-white">
            {waiver.name}
            {waiver.required ? <span className="text-red-400 ml-1">*</span> : ''}
          </span>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setExpanded(!expanded); }}
            className="flex items-center gap-1 text-xs text-gold-400 hover:text-gold-300 mt-1 transition-colors"
          >
            {expanded ? 'Hide details' : 'View full terms'}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </label>
      {expanded && (
        <div
          className="mt-3 p-3 bg-pavilion-800 rounded-lg text-xs text-gray-300 leading-relaxed max-h-60 overflow-y-auto prose prose-invert prose-sm"
          dangerouslySetInnerHTML={{ __html: waiver.content }}
        />
      )}
    </div>
  );
}

// ─── Order Summary Sidebar ──────────────────────────────────

function OrderSummary({
  ticketTypes,
  quantities,
  totalPrice,
  addonTotal,
  customerInfo,
  setCustomerInfo,
  showCheckout,
  setShowCheckout,
  checkoutLoading,
  checkoutError,
  onCheckout,
  waivers,
  acceptedWaivers,
  onToggleWaiver,
  addonSelections,
  addons,
  termsAccepted,
  setTermsAccepted,
  needsAdult,
}) {
  const selected = ticketTypes.filter((tt) => quantities[tt.id] > 0);
  const grandTotal = totalPrice + addonTotal;

  // Summarize addon selections for display
  const addonSummary = [];
  if (addonSelections && addons) {
    for (const [key, sel] of Object.entries(addonSelections)) {
      if (!sel) continue;
      const addon = addons.find(a => a.id === sel.addonId);
      if (!addon) continue;
      const label = sel.selectedOption ? `${addon.name}: ${sel.selectedOption}` : addon.name;
      const price = (sel.price || 0) * (sel.quantity || 1);
      addonSummary.push({ key, label, price, quantity: sel.quantity || 1 });
    }
  }

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
            {addonSummary.map((a) => (
              <div key={a.key} className="flex justify-between text-sm">
                <div>
                  <span className="text-gray-400">{a.label}</span>
                  {a.quantity > 1 && <span className="text-gray-500"> x{a.quantity}</span>}
                </div>
                {a.price > 0 && (
                  <span className="text-white font-medium">{formatPrice(a.price)}</span>
                )}
              </div>
            ))}
          </div>

          {grandTotal > 0 && (() => {
            const bookingFee = Math.ceil(grandTotal * 0.015) + 20;
            return (
              <div className="border-t border-pavilion-600/50 pt-4 mb-6 space-y-2">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Subtotal</span>
                  <span>{formatPrice(grandTotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Booking fee</span>
                  <span>{formatPrice(bookingFee)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-pavilion-600/30">
                  <span className="font-semibold">Total</span>
                  <span className="text-xl font-bold text-gold-400">{formatPrice(grandTotal + bookingFee)}</span>
                </div>
              </div>
            );
          })()}
          {grandTotal === 0 && (
          <div className="border-t border-pavilion-600/50 pt-4 mb-6">
            <div className="flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold text-gold-400">{formatPrice(0)}</span>
            </div>
          </div>
          )}

          {!showCheckout ? (
            <>
              {needsAdult && (
                <p className="text-amber-400 text-sm text-center mb-2 flex items-center justify-center gap-1">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Add an adult ticket to continue
                </p>
              )}
              <button
                onClick={() => setShowCheckout(true)}
                disabled={needsAdult}
                className="w-full py-3 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold rounded-lg transition-all text-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Buy Tickets
              </button>
            </>

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

              {/* Waivers */}
              {waivers && waivers.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-sm text-gray-400 font-medium flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-gold-500" />
                    Agreements
                  </p>
                  {waivers.map(w => (
                    <WaiverAcceptance
                      key={w.id}
                      waiver={w}
                      accepted={acceptedWaivers.includes(w.id)}
                      onToggle={onToggleWaiver}
                    />
                  ))}
                </div>
              )}

              {/* Terms & Conditions */}
              <label className="flex items-start gap-2.5 py-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-pavilion-600 bg-pavilion-700 text-gold-500 focus:ring-gold-500 focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors leading-relaxed">
                  I agree to the{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-gold-400 hover:text-gold-300 underline underline-offset-2">
                    Terms & Conditions
                  </a>
                </span>
              </label>

              {checkoutError && <p className="text-red-400 text-sm">{checkoutError}</p>}

              <button
                type="submit"
                disabled={checkoutLoading || !termsAccepted || needsAdult}
                className="w-full py-3 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkoutLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Pay {formatPrice(grandTotal + (grandTotal > 0 ? Math.ceil(grandTotal * 0.015) + 20 : 0))}
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

  // Addon selections: keyed by "addonId" or "addonId-ticketTypeId-ticketIndex"
  const [addonSelections, setAddonSelections] = useState({});
  // Waiver acceptances: array of waiver IDs
  const [acceptedWaivers, setAcceptedWaivers] = useState([]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Per-ticket accordion state
  const [expandedTickets, setExpandedTickets] = useState({});

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
  const addons = (event?.addons || []).map(a => ({ ...a, ticketTypeIds: a.ticket_type_ids || a.ticketTypeIds || [] }));
  const waivers = event?.waivers || [];

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

  const addonTotal = useMemo(() => {
    return Object.values(addonSelections).reduce((sum, sel) => {
      if (!sel) return sum;
      return sum + (sel.price || 0) * (sel.quantity || 1);
    }, 0);
  }, [addonSelections]);

  // Adult supervision check — true if child tickets selected without an adult
  const needsAdult = useMemo(() => {
    if (!event?.requireAdultSupervision) return false;
    const maxChildAge = event.supervisionChildMaxAge || 12;
    let adultCount = 0;
    let childCount = 0;
    for (const tt of ticketTypes) {
      const qty = quantities[tt.id] || 0;
      if (qty === 0) continue;
      if (tt.ageMax != null && tt.ageMax <= maxChildAge) {
        childCount += qty;
      } else {
        adultCount += qty;
      }
    }
    return childCount > 0 && adultCount < 1;
  }, [event, ticketTypes, quantities]);

  // Get addons relevant to selected ticket types
  const relevantAddons = useMemo(() => {
    const selectedTtIds = Object.keys(quantities).filter(id => quantities[id] > 0).map(Number);
    if (selectedTtIds.length === 0) return [];
    return addons.filter(a => {
      if (!a.ticketTypeIds || a.ticketTypeIds.length === 0) return true;
      return a.ticketTypeIds.some(id => selectedTtIds.includes(id));
    });
  }, [addons, quantities]);

  // Get waivers relevant to selected ticket types
  const relevantWaivers = useMemo(() => {
    const selectedTtIds = Object.keys(quantities).filter(id => quantities[id] > 0).map(Number);
    if (selectedTtIds.length === 0) return [];
    return waivers.filter(w => {
      if (!w.ticketTypeIds || w.ticketTypeIds.length === 0) return true;
      return w.ticketTypeIds.some(id => selectedTtIds.includes(id));
    });
  }, [waivers, quantities]);

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

  function updateAddonSelection(key, value) {
    setAddonSelections(prev => {
      const next = { ...prev };
      if (value === null) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  function toggleWaiver(waiverId) {
    setAcceptedWaivers(prev =>
      prev.includes(waiverId)
        ? prev.filter(id => id !== waiverId)
        : [...prev, waiverId]
    );
  }

  async function handleCheckout(e) {
    e.preventDefault();
    setCheckoutError(null);
    setCheckoutLoading(true);

    // Validate adult supervision rule
    if (event.requireAdultSupervision) {
      const maxChildAge = event.supervisionChildMaxAge || 12;
      let adultCount = 0;
      let childCount = 0;
      for (const tt of ticketTypes) {
        const qty = quantities[tt.id] || 0;
        if (qty === 0) continue;
        if (tt.age_max && tt.age_max <= maxChildAge) {
          childCount += qty;
        } else {
          adultCount += qty;
        }
      }
      if (childCount > 0 && adultCount < 1) {
        setCheckoutError(`Children under ${maxChildAge} must be accompanied by at least one adult. Please add an adult ticket.`);
        setCheckoutLoading(false);
        return;
      }
      const ratioStr = event.supervisionRatio || '1:any';
      if (ratioStr !== '1:any') {
        const ratio = ratioStr.split(':').map(Number);
        if (ratio.length === 2 && !isNaN(ratio[0]) && !isNaN(ratio[1]) && ratio[1] > 0) {
          const requiredAdults = Math.ceil(childCount * (ratio[0] / ratio[1]));
          if (adultCount < requiredAdults) {
            setCheckoutError(`At least ${requiredAdults} adult ticket(s) required for ${childCount} child ticket(s).`);
            setCheckoutLoading(false);
            return;
          }
        }
      }
    }

    // Validate required addons
    for (const addon of relevantAddons) {
      if (!addon.required) continue;
      if (addon.perTicket) {
        const selectedTtIds = Object.keys(quantities).filter(id => quantities[id] > 0).map(Number);
        for (const ttId of selectedTtIds) {
          if (addon.ticketTypeIds?.length > 0 && !addon.ticketTypeIds.includes(ttId)) continue;
          for (let i = 0; i < quantities[ttId]; i++) {
            const key = `${addon.id}-${ttId}-${i}`;
            if (!addonSelections[key]) {
              setCheckoutError(`"${addon.name}" is required for all tickets`);
              setCheckoutLoading(false);
              return;
            }
          }
        }
      } else {
        const key = `${addon.id}`;
        if (!addonSelections[key]) {
          setCheckoutError(`"${addon.name}" is required`);
          setCheckoutLoading(false);
          return;
        }
      }
    }

    // Validate required waivers
    for (const waiver of relevantWaivers) {
      if (waiver.required && !acceptedWaivers.includes(waiver.id)) {
        setCheckoutError(`You must accept "${waiver.name}" to proceed`);
        setCheckoutLoading(false);
        return;
      }
    }

    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId: parseInt(ticketTypeId, 10), quantity }));

    // Build addon selections array
    const addonSels = Object.entries(addonSelections)
      .filter(([, sel]) => sel !== null)
      .map(([key, sel]) => {
        const parts = key.split('-');
        const ticketTypeId = parts.length > 1 ? parseInt(parts[1], 10) : null;
        const ticketIndex = parts.length > 2 ? parseInt(parts[2], 10) : null;
        return {
          addonId: sel.addonId,
          addonOptionId: sel.addonOptionId || null,
          selectedOption: sel.selectedOption || null,
          quantity: sel.quantity || 1,
          ticketIndex,
          ticketTypeId,
        };
      });

    // Build waiver acceptances
    const waiverAccs = acceptedWaivers.map(id => ({
      waiverId: id,
      ipAddress: null,
      userAgent: navigator.userAgent,
    }));

    try {
      const result = await createCheckout({
        eventId: event.id,
        items,
        customerName: customerInfo.name,
        customerEmail: customerInfo.email,
        customerPhone: customerInfo.phone,
        addonSelections: addonSels.length > 0 ? addonSels : undefined,
        waiverAcceptances: waiverAccs.length > 0 ? waiverAccs : undefined,
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

  // Build per-ticket addon list
  const perTicketAddons = relevantAddons.filter(a => a.perTicket);
  const perOrderAddons = relevantAddons.filter(a => !a.perTicket);

  // Build ticket list for per-ticket addons
  const ticketList = [];
  const selectedTtIds = Object.keys(quantities).filter(id => quantities[id] > 0).map(Number);
  for (const ttId of selectedTtIds) {
    const tt = ticketTypes.find(t => t.id === ttId);
    if (!tt) continue;
    for (let i = 0; i < quantities[ttId]; i++) {
      ticketList.push({ ticketTypeId: ttId, ticketTypeName: tt.name, index: i });
    }
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
              {event.requireAdultSupervision && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-amber-200 text-sm">
                    Children under {event.supervisionChildMaxAge || 12} must be accompanied by at least one adult.
                    At least 1 adult ticket is required per order containing child tickets.
                  </p>
                </div>
              )}
              <div className="space-y-3">
                {ticketTypes.length === 0 && (
                  <p className="text-gray-500">No tickets available yet.</p>
                )}
                {ticketTypes.map((tt) => {
                  const soldOut = isSoldOut(tt);
                  const saleActive = isSaleActive(tt);
                  const qty = quantities[tt.id] || 0;
                  const remaining = tt.quantity - (tt.sold || 0);
                  const ageLabel = tt.ageLabel || (tt.ageMin || tt.ageMax ? `Ages ${tt.ageMin || '0'}${tt.ageMax ? '-' + tt.ageMax : '+'}` : null);

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
                          {ageLabel && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-pavilion-700 text-gray-300 border border-pavilion-600/50 rounded-full">
                              {ageLabel}
                            </span>
                          )}
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

            {/* Addons section */}
            {totalItems > 0 && relevantAddons.length > 0 && (
              <div>
                <h2 className="text-xl font-bold mb-4">Add-ons</h2>

                {/* Per-order addons */}
                {perOrderAddons.length > 0 && (
                  <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-5 space-y-4 mb-4">
                    {perOrderAddons.map(addon => (
                      <AddonSelector
                        key={addon.id}
                        addon={addon}
                        value={addonSelections[`${addon.id}`]}
                        onChange={(val) => updateAddonSelection(`${addon.id}`, val)}
                      />
                    ))}
                  </div>
                )}

                {/* Per-ticket addons */}
                {perTicketAddons.length > 0 && ticketList.length > 0 && (
                  <div className="space-y-3">
                    {ticketList.map((ticket, idx) => {
                      const ticketAddons = perTicketAddons.filter(a =>
                        !a.ticketTypeIds?.length || a.ticketTypeIds.includes(ticket.ticketTypeId)
                      );
                      if (ticketAddons.length === 0) return null;

                      const isExpanded = expandedTickets[idx] !== false;
                      return (
                        <div key={idx} className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedTickets(prev => ({ ...prev, [idx]: !isExpanded }))}
                            className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-pavilion-700/50 transition-colors"
                          >
                            <span className="text-sm font-medium text-white">
                              {ticket.ticketTypeName} #{ticket.index + 1}
                            </span>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </button>
                          {isExpanded && (
                            <div className="px-5 pb-4 space-y-4 border-t border-pavilion-600/30">
                              {ticketAddons.map(addon => (
                                <div key={addon.id} className="pt-3">
                                  <AddonSelector
                                    addon={addon}
                                    ticketIndex={ticket.index}
                                    value={addonSelections[`${addon.id}-${ticket.ticketTypeId}-${ticket.index}`]}
                                    onChange={(val) => updateAddonSelection(`${addon.id}-${ticket.ticketTypeId}-${ticket.index}`, val ? { ...val, ticketTypeId: ticket.ticketTypeId } : null)}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

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
                addonTotal={addonTotal}
                customerInfo={customerInfo}
                setCustomerInfo={setCustomerInfo}
                showCheckout={showCheckout}
                setShowCheckout={setShowCheckout}
                checkoutLoading={checkoutLoading}
                checkoutError={checkoutError}
                onCheckout={handleCheckout}
                waivers={relevantWaivers}
                acceptedWaivers={acceptedWaivers}
                onToggleWaiver={toggleWaiver}
                addonSelections={addonSelections}
                addons={addons}
                termsAccepted={termsAccepted}
                setTermsAccepted={setTermsAccepted}
                needsAdult={needsAdult}
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
                <p className="text-xl font-bold text-gold-400">{formatPrice(totalPrice + addonTotal)}</p>
                {needsAdult && (
                  <p className="text-amber-400 text-xs mt-0.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Add an adult ticket
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowCheckout(true)}
                disabled={needsAdult}
                className="px-6 py-3 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Buy Tickets
              </button>
            </div>
          ) : (
            <form onSubmit={handleCheckout} className="space-y-3 max-h-[70vh] overflow-y-auto">
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

              {/* Waivers (mobile) */}
              {relevantWaivers.length > 0 && (
                <div className="space-y-2">
                  {relevantWaivers.map(w => (
                    <WaiverAcceptance
                      key={w.id}
                      waiver={w}
                      accepted={acceptedWaivers.includes(w.id)}
                      onToggle={toggleWaiver}
                    />
                  ))}
                </div>
              )}

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
                  disabled={checkoutLoading || needsAdult}
                  className="flex-1 px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  {checkoutLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Pay {formatPrice(totalPrice + addonTotal + (totalPrice + addonTotal > 0 ? Math.ceil((totalPrice + addonTotal) * 0.015) + 20 : 0))}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
