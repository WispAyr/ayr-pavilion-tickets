import { useState, useEffect } from 'react';
import { Loader2, Plus, Minus, X, ShoppingBag } from 'lucide-react';
import { fetchAddons, addAddonToOrder } from '../../lib/api';

function formatPrice(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

export default function AddAddonModal({ order, onClose, onSuccess }) {
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  // selections: { [addonId]: { addonOptionId, quantity, ticketId } }
  const [selections, setSelections] = useState({});

  const eventId = order.eventId || order.event_id;

  useEffect(() => {
    loadAddons();
  }, []);

  async function loadAddons() {
    try {
      const data = await fetchAddons(eventId);
      const list = Array.isArray(data) ? data : data.addons || [];
      setAddons(list);
    } catch (e) {
      setError('Failed to load addons');
    } finally {
      setLoading(false);
    }
  }

  function updateSelection(addonId, field, value) {
    setSelections((prev) => ({
      ...prev,
      [addonId]: { ...(prev[addonId] || {}), addonId, [field]: value },
    }));
  }

  function removeSelection(addonId) {
    setSelections((prev) => {
      const next = { ...prev };
      delete next[addonId];
      return next;
    });
  }

  function getTotal() {
    let total = 0;
    for (const sel of Object.values(selections)) {
      const addon = addons.find((a) => a.id === sel.addonId);
      if (!addon) continue;
      let price = addon.price;
      if (addon.type === 'select' && sel.addonOptionId && addon.options) {
        const opt = addon.options.find((o) => o.id === sel.addonOptionId);
        if (opt && opt.priceOverride !== null && opt.priceOverride !== undefined) {
          price = opt.priceOverride;
        }
      }
      total += price * (sel.quantity || 1);
    }
    return total;
  }

  async function handleSubmit() {
    const sels = Object.values(selections).filter((s) => s.quantity > 0);
    if (!sels.length) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await addAddonToOrder(order.id, {
        selections: sels.map((s) => ({
          addonId: s.addonId,
          addonOptionId: s.addonOptionId || null,
          quantity: s.quantity || 1,
          ticketId: s.ticketId || null,
        })),
        paymentMethod,
        notes,
      });
      onSuccess(result);
    } catch (e) {
      setError(e.message || 'Failed to add addons');
    } finally {
      setSubmitting(false);
    }
  }

  const total = getTotal();
  const hasSelections = Object.values(selections).some((s) => (s.quantity || 0) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in">
        {/* Header */}
        <div className="p-5 border-b border-pavilion-600/50 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-gold-400" />
              Add Addon Top-Up
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              Order {order.orderRef || order.order_ref} · {order.customerName || order.customer_name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gold-400" />
            </div>
          ) : addons.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No addons configured for this event</p>
          ) : (
            <>
              {/* Addon list */}
              {addons.map((addon) => {
                const sel = selections[addon.id];
                const isSelected = sel && (sel.quantity || 0) > 0;

                return (
                  <div
                    key={addon.id}
                    className={`rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'border-gold-500/50 bg-gold-500/5'
                        : 'border-pavilion-600/50 bg-pavilion-700/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium text-white">{addon.name}</span>
                        <span className="ml-2 text-sm text-gold-400">{formatPrice(addon.price)}</span>
                      </div>
                    </div>

                    {addon.description && (
                      <p className="text-xs text-gray-500 mb-3">{addon.description}</p>
                    )}

                    {/* Select type: show options dropdown */}
                    {addon.type === 'select' && addon.options && addon.options.length > 0 ? (
                      <div className="space-y-2">
                        <select
                          value={sel?.addonOptionId || ''}
                          onChange={(e) => {
                            const optId = parseInt(e.target.value, 10);
                            updateSelection(addon.id, 'addonOptionId', optId || null);
                            if (!sel?.quantity) updateSelection(addon.id, 'quantity', 1);
                          }}
                          className="w-full bg-pavilion-700 border border-pavilion-600 rounded-lg px-3 py-2 text-sm text-white focus:border-gold-500 focus:outline-none"
                        >
                          <option value="">Select option...</option>
                          {addon.options
                            .filter((o) => o.active !== 0)
                            .map((opt) => {
                              const inStock = !opt.stock || opt.reserved < opt.stock;
                              return (
                                <option key={opt.id} value={opt.id} disabled={!inStock}>
                                  {opt.label}
                                  {opt.priceOverride !== null && opt.priceOverride !== undefined
                                    ? ` (${formatPrice(opt.priceOverride)})`
                                    : ''}
                                  {!inStock ? ' — OUT OF STOCK' : ''}
                                </option>
                              );
                            })}
                        </select>

                        {/* Quantity controls */}
                        {sel?.addonOptionId && (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() =>
                                updateSelection(addon.id, 'quantity', Math.max(0, (sel?.quantity || 1) - 1))
                              }
                              className="w-8 h-8 rounded-lg bg-pavilion-700 border border-pavilion-600 flex items-center justify-center text-gray-400 hover:text-white"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="text-white font-medium w-8 text-center">
                              {sel?.quantity || 0}
                            </span>
                            <button
                              onClick={() => updateSelection(addon.id, 'quantity', (sel?.quantity || 0) + 1)}
                              className="w-8 h-8 rounded-lg bg-pavilion-700 border border-pavilion-600 flex items-center justify-center text-gray-400 hover:text-white"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            {isSelected && (
                              <button
                                onClick={() => removeSelection(addon.id)}
                                className="ml-auto text-xs text-red-400 hover:text-red-300"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Simple addon — just quantity */
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            updateSelection(addon.id, 'quantity', Math.max(0, (sel?.quantity || 0) - 1))
                          }
                          className="w-8 h-8 rounded-lg bg-pavilion-700 border border-pavilion-600 flex items-center justify-center text-gray-400 hover:text-white"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-white font-medium w-8 text-center">
                          {sel?.quantity || 0}
                        </span>
                        <button
                          onClick={() => updateSelection(addon.id, 'quantity', (sel?.quantity || 0) + 1)}
                          className="w-8 h-8 rounded-lg bg-pavilion-700 border border-pavilion-600 flex items-center justify-center text-gray-400 hover:text-white"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        {isSelected && (
                          <button
                            onClick={() => removeSelection(addon.id)}
                            className="ml-auto text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )}

                    {/* Link to ticket */}
                    {isSelected && order.tickets && order.tickets.length > 1 && addon.perTicket && (
                      <div className="mt-2">
                        <select
                          value={sel?.ticketId || ''}
                          onChange={(e) =>
                            updateSelection(addon.id, 'ticketId', parseInt(e.target.value, 10) || null)
                          }
                          className="w-full bg-pavilion-700 border border-pavilion-600 rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-gold-500 focus:outline-none"
                        >
                          <option value="">All tickets</option>
                          {order.tickets.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.ticketTypeName || t.type} — {t.holderName || t.code}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Payment method */}
              {hasSelections && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Payment Method</label>
                    <div className="flex gap-2">
                      {[
                        { value: 'cash', label: 'Cash', desc: 'Paid in cash' },
                        { value: 'card', label: 'Card (manual)', desc: 'Card taken separately' },
                        { value: 'comp', label: 'Complimentary', desc: 'No charge' },
                      ].map((m) => (
                        <button
                          key={m.value}
                          onClick={() => setPaymentMethod(m.value)}
                          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            paymentMethod === m.value
                              ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                              : 'bg-pavilion-700 text-gray-400 border border-pavilion-600/50 hover:text-white'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Notes (optional)</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Forgot to add skate hire"
                      className="w-full bg-pavilion-700 border border-pavilion-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-pavilion-600/50 flex items-center justify-between">
          <div className="text-sm">
            {hasSelections && (
              <span className="text-white">
                Total: <span className="font-bold text-gold-400">{formatPrice(total)}</span>
                {paymentMethod === 'comp' && (
                  <span className="text-gray-500 ml-1">(complimentary)</span>
                )}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!hasSelections || submitting}
              className="px-5 py-2 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-semibold rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add to Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
