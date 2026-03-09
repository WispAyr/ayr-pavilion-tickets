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

  async function handleRefund(orderId) {
    if (!confirm('Are you sure you want to refund this order? This cannot be undone.')) return;
    setRefunding(orderId);
    try {
      await refundOrder(orderId);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: 'refunded' } : o))
      );
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
                          onClick={() => handleRefund(order.id)}
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
    </div>
  );
}
