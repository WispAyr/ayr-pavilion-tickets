import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, RefreshCw, Ticket, PoundSterling,
  ShoppingCart, QrCode, Package, Users, Clock, TrendingUp,
  AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Download,
} from 'lucide-react';
import { fetchEventOps } from '../../lib/api';

function fmt(pence) { return `£${(pence / 100).toFixed(2)}`; }
function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function timeUntil(d) {
  if (!d) return '';
  const ms = new Date(d) - new Date();
  if (ms < 0) return 'Started';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// ─── Progress Ring ──────────────────────────────────────────
function Ring({ value, max, size = 64, stroke = 5, color = '#D4A843', label, sub }) {
  const p = max ? Math.min(value / max, 1) : 0;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#2a2a3e" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - p)}
          strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div>
        <p className="text-lg font-bold text-white">{value}<span className="text-sm text-gray-500">/{max}</span></p>
        {label && <p className="text-xs text-gray-400">{label}</p>}
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Stock Bar ──────────────────────────────────────────────
function StockBar({ used, total, label, color = 'bg-gold-500' }) {
  const p = total ? Math.min((used / total) * 100, 100) : 0;
  const danger = p > 85;
  const warn = p > 65;
  const barColor = danger ? 'bg-red-500' : warn ? 'bg-amber-500' : color;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-300">{label}</span>
        <span className={`text-sm font-mono font-bold ${danger ? 'text-red-400' : warn ? 'text-amber-400' : 'text-white'}`}>
          {used}/{total}
          {danger && <AlertTriangle className="w-3 h-3 inline ml-1" />}
        </span>
      </div>
      <div className="h-2 bg-pavilion-700 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${p}%` }} />
      </div>
      <p className="text-[10px] text-gray-600 mt-0.5 text-right">{total - used} remaining</p>
    </div>
  );
}

// ─── Mini Timeline ──────────────────────────────────────────
function SalesTimeline({ data }) {
  if (!data || data.length === 0) return <p className="text-gray-500 text-sm">No sales yet</p>;
  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div>
      <div className="flex items-end gap-[3px] h-16">
        {data.map((d, i) => (
          <div key={i} className="flex-1 min-w-[4px] bg-gold-500 rounded-t-sm opacity-70 hover:opacity-100 transition-all"
            style={{ height: `${Math.max((d.revenue / maxRev) * 100, 4)}%` }}
            title={`${d.hour}\n${d.orders} orders · ${fmt(d.revenue)}`} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-600 mt-1">
        <span>{data[0]?.hour?.split(' ')[0]}</span>
        <span>{data[data.length-1]?.hour?.split(' ')[0]}</span>
      </div>
    </div>
  );
}

// ─── CSV Export ─────────────────────────────────────────────
function exportCSV(data) {
  const { event, ticketTypes, orders, recentOrders, addons, checkins } = data;
  const rows = [];
  const add = (...cols) => rows.push(cols.map(c => {
    const s = String(c ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(','));

  // Event summary
  add('Event Report', event.title);
  add('Date', fmtDate(event.date_time));
  add('Venue', event.venue || '');
  add('Status', event.status);
  add('Generated', new Date().toLocaleString('en-GB'));
  add('');

  // Orders & Revenue
  add('ORDERS & REVENUE');
  add('Metric', 'Value');
  add('Total Revenue', fmt(orders.revenue));
  add('Booking Fees', fmt(orders.total_fees));
  add('Refunds', fmt(orders.total_refunds));
  add('Net Revenue', fmt(orders.revenue - orders.total_refunds));
  add('Paid Orders', orders.paid);
  add('Pending Orders', orders.pending);
  add('Refunded Orders', orders.refunded);
  add('');

  // Ticket Types
  add('TICKET TYPES');
  add('Type', 'Price', 'Sold', 'Capacity', 'Remaining', '% Sold', 'Checked In');
  for (const tt of ticketTypes) {
    add(tt.name, fmt(tt.price), tt.sold, tt.quantity, tt.quantity - tt.sold, `${pct(tt.sold, tt.quantity)}%`, tt.checked_in);
  }
  const totalCap = ticketTypes.reduce((s, t) => s + t.quantity, 0);
  const totalSold = ticketTypes.reduce((s, t) => s + t.sold, 0);
  add('TOTAL', '', totalSold, totalCap, totalCap - totalSold, `${pct(totalSold, totalCap)}%`, checkins.checked_in);
  add('');

  // Addons
  for (const addon of addons) {
    if (addon.type === 'select' && addon.options) {
      add(`ADD-ON: ${addon.name}`, addon.price > 0 ? fmt(addon.price) + ' each' : 'Free');
      add('Option / Size', 'Reserved', 'Stock', 'Remaining', '% Used', 'Status');
      for (const opt of addon.options) {
        const remaining = opt.stock - opt.reserved;
        const status = remaining <= 0 ? 'SOLD OUT' : remaining <= 2 ? 'LOW STOCK' : 'Available';
        add(opt.label, opt.reserved, opt.stock, remaining, `${pct(opt.reserved, opt.stock)}%`, status);
      }
      add('TOTAL', addon.total_reserved, addon.total_stock, addon.total_stock - addon.total_reserved, `${pct(addon.total_reserved, addon.total_stock)}%`, '');
      add('');
    } else if (addon.type === 'checkbox') {
      add(`ADD-ON: ${addon.name}`, `${addon.selected_count || 0} selected`);
      add('');
    } else if (addon.type === 'quantity') {
      add(`ADD-ON: ${addon.name}`, `${addon.total_quantity || 0} total`);
      add('');
    }
  }

  // Recent orders
  if (recentOrders.length > 0) {
    add('RECENT ORDERS');
    add('Order Ref', 'Customer', 'Email', 'Tickets', 'Total', 'Date');
    for (const o of recentOrders) {
      add(o.order_ref, o.customer_name, o.customer_email || '', o.ticket_count, fmt(o.total), fmtShort(o.created_at));
    }
  }

  // Download
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = event.title.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  a.href = url;
  a.download = `${slug}-report-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═════════════════════════════════════════════════════════════
export default function EventOpsPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showOrders, setShowOrders] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  async function load() {
    try {
      const d = await fetchEventOps(eventId);
      setData(d);
      setError(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [eventId]);
  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [autoRefresh, eventId]);

  if (loading && !data) {
    return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 text-gold-400 animate-spin" /></div>;
  }

  if (error && !data) {
    return (
      <div className="text-center py-24">
        <p className="text-red-400 mb-2">{error}</p>
        <button onClick={load} className="text-gold-400 text-sm hover:underline">Retry</button>
      </div>
    );
  }

  const { event, ticketTypes, orders, recentOrders, addons, checkins, timeline } = data;
  const totalCapacity = ticketTypes.reduce((s, t) => s + t.quantity, 0);
  const totalSold = ticketTypes.reduce((s, t) => s + t.sold, 0);
  const countdown = timeUntil(event.date_time);
  const isLive = new Date(event.date_time) <= new Date();

  return (
    <div className="animate-fade-in space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={() => navigate(-1)} className="p-2 bg-pavilion-800 border border-pavilion-600/50 rounded-lg text-gray-400 hover:text-white mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white truncate">{event.title}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {fmtDate(event.date_time)}</span>
              {event.doors_open && <span>Doors: {fmtDate(event.doors_open).split(', ')[1]}</span>}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                event.status === 'on-sale' ? 'bg-green-500/20 text-green-400' :
                event.status === 'sold-out' ? 'bg-red-500/20 text-red-400' :
                'bg-gray-500/20 text-gray-400'
              }`}>{event.status}</span>
              {countdown && !isLive && <span className="text-gold-400 font-medium">⏱ {countdown}</span>}
              {isLive && <span className="text-green-400 font-medium animate-pulse">● LIVE</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => data && exportCSV(data)}
            disabled={!data}
            className="flex items-center gap-1.5 px-3 py-2 bg-pavilion-800 border border-pavilion-600/50 rounded-lg text-sm text-gray-400 hover:text-white hover:border-gold-500/30 transition-all disabled:opacity-30"
            title="Export spreadsheet"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              autoRefresh ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-pavilion-800 text-gray-400 border border-pavilion-600/50'
            }`}
          >
            {autoRefresh ? '● Auto' : 'Auto'}
          </button>
          <button onClick={load} className="p-2 bg-pavilion-800 border border-pavilion-600/50 rounded-lg text-gray-400 hover:text-white">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Top metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-400"><PoundSterling className="w-3.5 h-3.5 text-gold-400" /> Revenue</div>
          <p className="text-2xl font-bold text-gold-400">{fmt(orders.revenue)}</p>
          <p className="text-xs text-gray-500 mt-1">{fmt(orders.total_fees)} fees · {fmt(orders.total_refunds)} refunded</p>
        </div>
        <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-400"><ShoppingCart className="w-3.5 h-3.5 text-blue-400" /> Orders</div>
          <p className="text-2xl font-bold text-white">{orders.paid}</p>
          <p className="text-xs text-gray-500 mt-1">{orders.pending} pending · {orders.refunded} refunded</p>
        </div>
        <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-400"><Ticket className="w-3.5 h-3.5 text-green-400" /> Tickets</div>
          <p className="text-2xl font-bold text-white">{totalSold}<span className="text-sm text-gray-500">/{totalCapacity}</span></p>
          <div className="mt-1.5 h-1.5 bg-pavilion-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${pct(totalSold, totalCapacity) > 85 ? 'bg-red-500' : pct(totalSold, totalCapacity) > 65 ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${pct(totalSold, totalCapacity)}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{pct(totalSold, totalCapacity)}% sold</p>
        </div>
        <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-400"><QrCode className="w-3.5 h-3.5 text-purple-400" /> Check-ins</div>
          <p className="text-2xl font-bold text-white">{checkins.checked_in}<span className="text-sm text-gray-500">/{checkins.total}</span></p>
          <div className="mt-1.5 h-1.5 bg-pavilion-700 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${pct(checkins.checked_in, checkins.total)}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{checkins.remaining} remaining</p>
        </div>
      </div>

      {/* Ticket Types Breakdown */}
      <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-pavilion-600/30">
          <Ticket className="w-4 h-4 text-gold-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Ticket Types</h2>
        </div>
        <div className="p-5 space-y-4">
          {ticketTypes.map(tt => (
            <StockBar
              key={tt.id}
              label={`${tt.name} — ${fmt(tt.price)}`}
              used={tt.sold}
              total={tt.quantity}
              color="bg-gold-500"
            />
          ))}
        </div>
      </div>

      {/* Addons — the key operational view */}
      {addons.length > 0 && (
        <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-pavilion-600/30">
            <Package className="w-4 h-4 text-gold-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Add-ons & Equipment</h2>
          </div>
          <div className="p-5 space-y-6">
            {addons.map(addon => (
              <div key={addon.id}>
                {/* Addon header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{addon.name}</h3>
                    <p className="text-xs text-gray-500">
                      {addon.type === 'select' && addon.options && `${addon.total_reserved ?? 0} reserved of ${addon.total_stock ?? 0} total`}
                      {addon.type === 'checkbox' && `${addon.selected_count || 0} selected`}
                      {addon.type === 'quantity' && `${addon.total_quantity || 0} total`}
                      {addon.price > 0 && ` · ${fmt(addon.price)} each`}
                      {addon.price === 0 && ' · Free'}
                    </p>
                  </div>
                  {addon.type === 'select' && addon.total_stock > 0 && (
                    <div className="text-right">
                      <span className={`text-lg font-bold ${
                        pct(addon.total_reserved, addon.total_stock) > 85 ? 'text-red-400' :
                        pct(addon.total_reserved, addon.total_stock) > 65 ? 'text-amber-400' : 'text-green-400'
                      }`}>
                        {pct(addon.total_reserved, addon.total_stock)}%
                      </span>
                      <p className="text-[10px] text-gray-500">utilisation</p>
                    </div>
                  )}
                </div>

                {/* Select-type: show each option as a stock bar */}
                {addon.type === 'select' && addon.options && (
                  <div className="space-y-2 pl-3 border-l-2 border-pavilion-600/30">
                    {addon.options.map(opt => (
                      <div key={opt.id} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-28 shrink-0 truncate" title={opt.label}>{opt.label}</span>
                        <div className="flex-1">
                          <div className="h-3 bg-pavilion-700 rounded-full overflow-hidden relative">
                            <div className={`h-full rounded-full transition-all duration-500 ${
                              opt.stock > 0 && opt.reserved >= opt.stock ? 'bg-red-500' :
                              opt.stock > 0 && pct(opt.reserved, opt.stock) > 65 ? 'bg-amber-500' : 'bg-cyan-500'
                            }`} style={{ width: `${opt.stock ? pct(opt.reserved, opt.stock) : 0}%` }} />
                          </div>
                        </div>
                        <span className={`text-xs font-mono w-12 text-right ${
                          opt.stock > 0 && opt.reserved >= opt.stock ? 'text-red-400 font-bold' : 'text-gray-400'
                        }`}>
                          {opt.reserved}/{opt.stock}
                        </span>
                        {opt.stock > 0 && opt.reserved >= opt.stock && (
                          <span className="text-[10px] text-red-400 font-bold">FULL</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Checkbox-type: simple count display */}
                {addon.type === 'checkbox' && (
                  <div className="flex items-center gap-2 pl-3 border-l-2 border-pavilion-600/30">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-gray-300">{addon.selected_count || 0} people</span>
                    {totalSold > 0 && (
                      <span className="text-xs text-gray-500">
                        ({pct(addon.selected_count || 0, totalSold)}% of ticket holders)
                      </span>
                    )}
                  </div>
                )}

                {/* Quantity-type: total with optional per-ticket average */}
                {addon.type === 'quantity' && (
                  <div className="flex items-center gap-2 pl-3 border-l-2 border-pavilion-600/30">
                    <Package className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm text-gray-300">{addon.total_quantity || 0} total</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales Timeline */}
      {timeline && timeline.length > 0 && (
        <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-pavilion-600/30">
            <TrendingUp className="w-4 h-4 text-gold-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Sales Timeline</h2>
          </div>
          <div className="p-5">
            <SalesTimeline data={timeline} />
            <div className="flex gap-4 mt-3 text-xs text-gray-500">
              <span>Total: <strong className="text-gold-400">{fmt(timeline.reduce((s, d) => s + d.revenue, 0))}</strong></span>
              <span>Orders: <strong className="text-white">{timeline.reduce((s, d) => s + d.orders, 0)}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Recent Orders (collapsible) */}
      <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl">
        <button
          onClick={() => setShowOrders(!showOrders)}
          className="flex items-center justify-between w-full px-5 py-4 text-left"
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gold-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Recent Orders</h2>
            <span className="text-xs text-gray-500">({recentOrders.length})</span>
          </div>
          {showOrders ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {showOrders && (
          <div className="border-t border-pavilion-600/30 divide-y divide-pavilion-600/20">
            {recentOrders.length === 0 ? (
              <p className="p-5 text-gray-500 text-sm text-center">No orders yet</p>
            ) : recentOrders.map(o => (
              <div key={o.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white">{o.customer_name}</p>
                  <p className="text-xs text-gray-500">{o.order_ref} · {o.ticket_count} tickets · {fmtShort(o.created_at)}</p>
                </div>
                <p className="text-sm font-bold text-gold-400">{fmt(o.total)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
