import { useState, useEffect } from 'react';
import {
  Loader2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ShoppingCart,
} from 'lucide-react';
import { fetchOrders, refundOrder } from '../../lib/api';

function formatPrice(pence) {
  return `\u00a3${(pence / 100).toFixed(2)}`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }) {
  const styles = {
    paid: 'bg-green-500/20 text-green-400 border-green-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    refunded: 'bg-red-500/20 text-red-400 border-red-500/30',
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border capitalize ${styles[status] || styles.pending}`}>
      {status || 'unknown'}
    </span>
  );
}

export default function OrdersList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [refunding, setRefunding] = useState(null);
  const [refundModal, setRefundModal] = useState(null); // order object or null
  const [refundType, setRefundType] = useState('full');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundNotes, setRefundNotes] = useState('');

  useEffect(() => {
    loadOrders();
  }, []);

  function loadOrders() {
    setLoading(true);
    fetchOrders()
      .then((data) => {
        const list = Array.isArray(data) ? data : data.orders || [];
        setOrders(list);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function openRefundModal(order) {
    setRefundModal(order);
    setRefundType('full');
    setRefundAmount(((order.total || 0) / 100).toFixed(2));
    setRefundReason('');
    setRefundNotes('');
  }

  async function handleRefund() {
    if (!refundModal) return;
    const orderId = refundModal.id;
    setRefunding(orderId);
    try {
      const body = {
        reason: refundReason || undefined,
        notes: refundNotes || undefined,
      };
      if (refundType === 'partial') {
        body.amount = Math.round(parseFloat(refundAmount) * 100);
      }
      await refundOrder(orderId, body);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: refundType === 'full' ? 'refunded' : o.status } : o))
      );
      setRefundModal(null);
    } catch (err) {
      alert('Refund failed: ' + err.message);
    } finally {
      setRefunding(null);
    }
  }

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.customerName || '').toLowerCase().includes(q) ||
      (o.customerEmail || '').toLowerCase().includes(q) ||
      (o.orderRef || o.reference || '').toLowerCase().includes(q) ||
      (o.id || '').toString().toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="text-2xl font-bold">Orders</h1>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or reference..."
          className="w-full pl-10 pr-4 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
        />
      </div>

      {/* Orders */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingCart className="w-12 h-12 text-pavilion-600 mx-auto mb-3" />
          <p className="text-gray-500">{search ? 'No matching orders' : 'No orders yet'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header (desktop) */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-4 px-5 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="col-span-2">Reference</div>
            <div className="col-span-3">Customer</div>
            <div className="col-span-3">Event</div>
            <div className="col-span-1">Total</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2">Date</div>
          </div>

          {filtered.map((order) => {
            const isExpanded = expandedId === order.id;
            const canRefund =
              order.status === 'paid' || order.status === 'completed';

            return (
              <div
                key={order.id}
                className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl overflow-hidden"
              >
                {/* Row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-pavilion-700/50 transition-all"
                >
                  <div className="hidden sm:grid sm:grid-cols-12 gap-4 flex-1 items-center">
                    <div className="col-span-2 font-mono text-sm text-gray-300 truncate">
                      {order.orderRef || order.reference || order.id}
                    </div>
                    <div className="col-span-3 text-sm truncate">
                      <span className="text-white">{order.customerName || '-'}</span>
                      <br />
                      <span className="text-gray-500 text-xs">{order.customerEmail || ''}</span>
                    </div>
                    <div className="col-span-3 text-sm text-gray-300 truncate">
                      {order.event?.title || order.eventTitle || '-'}
                    </div>
                    <div className="col-span-1 text-sm font-semibold text-gold-400">
                      {formatPrice(order.totalAmount || order.total || 0)}
                    </div>
                    <div className="col-span-1">
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="col-span-2 text-xs text-gray-500">
                      {formatDate(order.createdAt)}
                    </div>
                  </div>

                  {/* Mobile layout */}
                  <div className="sm:hidden flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">
                        {order.customerName || order.customerEmail || 'Unknown'}
                      </span>
                      <span className="text-sm font-semibold text-gold-400">
                        {formatPrice(order.totalAmount || order.total || 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {order.orderRef || order.reference || order.id}
                      </span>
                      <StatusBadge status={order.status} />
                    </div>
                  </div>

                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  )}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-pavilion-600/30 px-5 py-4 bg-pavilion-700/30 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500">Customer:</span>{' '}
                        <span className="text-white">{order.customerName || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Email:</span>{' '}
                        <span className="text-white">{order.customerEmail || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Phone:</span>{' '}
                        <span className="text-white">{order.customerPhone || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Event:</span>{' '}
                        <span className="text-white">{order.event?.title || order.eventTitle || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Date:</span>{' '}
                        <span className="text-white">{formatDate(order.createdAt)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Stripe ID:</span>{' '}
                        <span className="text-white font-mono text-xs">{order.stripeSessionId || '-'}</span>
                      </div>
                    </div>

                    {/* Tickets in order */}
                    {order.tickets && order.tickets.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Tickets</p>
                        <div className="space-y-1">
                          {order.tickets.map((ticket, i) => (
                            <div key={i} className="flex items-center justify-between text-sm bg-pavilion-800/50 rounded-lg px-3 py-2">
                              <div>
                                <span className="text-white">{ticket.ticketType?.name || ticket.type || '-'}</span>
                                {ticket.holderName && (
                                  <span className="text-gray-500 ml-2">({ticket.holderName})</span>
                                )}
                              </div>
                              <span className="font-mono text-xs text-gray-400">{ticket.code}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Refund button */}
                    {canRefund && (
                      <div className="pt-2">
                        <button
                          onClick={() => openRefundModal(order)}
                          disabled={refunding === order.id}
                          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
                        >
                          {refunding === order.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                          Refund Order
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Refund Modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-2xl w-full max-w-md animate-fade-in">
            <div className="p-5 border-b border-pavilion-600/50">
              <h3 className="text-lg font-bold">Process Refund</h3>
              <p className="text-sm text-gray-400 mt-1">
                Order {refundModal.orderRef || refundModal.order_ref} · {refundModal.customerName || refundModal.customer_name}
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Refund type */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Refund Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setRefundType('full'); setRefundAmount(((refundModal.total || 0) / 100).toFixed(2)); }}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      refundType === 'full'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-pavilion-700 text-gray-400 border border-pavilion-600/50 hover:text-white'
                    }`}
                  >
                    Full Refund
                  </button>
                  <button
                    onClick={() => { setRefundType('partial'); setRefundAmount(''); }}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      refundType === 'partial'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-pavilion-700 text-gray-400 border border-pavilion-600/50 hover:text-white'
                    }`}
                  >
                    Partial Refund
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Amount {refundType === 'full' ? '' : '(£)'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">£</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={((refundModal.total || 0) / 100).toFixed(2)}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    disabled={refundType === 'full'}
                    className="w-full pl-8 pr-4 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none disabled:opacity-50"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Original order total: £{((refundModal.total || 0) / 100).toFixed(2)}
                </p>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Reason</label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none"
                >
                  <option value="">Select a reason...</option>
                  <option value="Customer request">Customer request</option>
                  <option value="Event cancelled">Event cancelled</option>
                  <option value="Event rescheduled">Event rescheduled</option>
                  <option value="Duplicate purchase">Duplicate purchase</option>
                  <option value="Wrong tickets">Wrong tickets purchased</option>
                  <option value="Technical issue">Technical issue</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Notes (optional)</label>
                <textarea
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none resize-none"
                  placeholder="Internal notes about this refund..."
                />
              </div>
            </div>

            <div className="p-5 border-t border-pavilion-600/50 flex gap-3">
              <button
                onClick={() => setRefundModal(null)}
                className="flex-1 py-2.5 bg-pavilion-700 border border-pavilion-600/50 rounded-lg text-sm text-gray-400 hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={refunding || (refundType === 'partial' && (!refundAmount || parseFloat(refundAmount) <= 0))}
                className="flex-1 py-2.5 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400 font-medium hover:bg-red-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {refunding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Refund £{refundAmount || '0.00'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
