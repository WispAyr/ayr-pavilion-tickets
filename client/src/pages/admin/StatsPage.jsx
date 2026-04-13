import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  PoundSterling,
  Ticket,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  QrCode,
  Mail,
  Users,
  CalendarDays,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import {
  fetchStatsOverview,
  fetchRevenueChart,
  fetchStatsByEvent,
  fetchTicketTypeStats,
  fetchScansTimeline,
  fetchScannerLeaderboard,
  fetchEmailStats,
  fetchHourlyPattern,
} from '../../lib/api';

function fmt(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

function pct(a, b) {
  if (!b) return '0%';
  return `${Math.round((a / b) * 100)}%`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ─── Mini bar chart (pure CSS) ──────────────────────────────
function MiniBar({ data, maxVal, color = 'bg-gold-500', height = 'h-16' }) {
  const max = maxVal || Math.max(...data.map(d => d.value), 1);
  return (
    <div className={`flex items-end gap-[2px] ${height}`}>
      {data.map((d, i) => (
        <div
          key={i}
          className={`flex-1 ${color} rounded-t-sm min-w-[2px] transition-all duration-300 opacity-80 hover:opacity-100`}
          style={{ height: `${Math.max((d.value / max) * 100, 2)}%` }}
          title={`${d.label}: ${d.value}`}
        />
      ))}
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'text-gold-400', bgColor = 'bg-gold-500/10', trend }) {
  return (
    <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-400">{label}</span>
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-gray-500'}`}>
          {trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : trend < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          {trend > 0 ? '+' : ''}{trend}% vs last period
        </div>
      )}
    </div>
  );
}

// ─── Section wrapper ────────────────────────────────────────
function Section({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`bg-pavilion-800 border border-pavilion-600/50 rounded-xl ${className}`}>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-pavilion-600/30">
        {Icon && <Icon className="w-4 h-4 text-gold-400" />}
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Hourly heatmap ─────────────────────────────────────────
function HourlyHeatmap({ purchases = [], checkins = [] }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const pMap = Object.fromEntries(purchases.map(p => [p.hour, p.count]));
  const cMap = Object.fromEntries(checkins.map(c => [c.hour, c.count]));
  const maxP = Math.max(...purchases.map(p => p.count), 1);
  const maxC = Math.max(...checkins.map(c => c.count), 1);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-gray-500 mb-1">Purchases by hour</p>
        <div className="flex gap-[2px]">
          {hours.map(h => {
            const v = pMap[h] || 0;
            const opacity = v ? Math.max(0.15, v / maxP) : 0.05;
            return (
              <div
                key={h}
                className="flex-1 h-8 rounded-sm bg-gold-500 transition-all"
                style={{ opacity }}
                title={`${String(h).padStart(2, '0')}:00 — ${v} orders`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-1">Check-ins by hour</p>
        <div className="flex gap-[2px]">
          {hours.map(h => {
            const v = cMap[h] || 0;
            const opacity = v ? Math.max(0.15, v / maxC) : 0.05;
            return (
              <div
                key={h}
                className="flex-1 h-8 rounded-sm bg-green-500 transition-all"
                style={{ opacity }}
                title={`${String(h).padStart(2, '0')}:00 — ${v} scans`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
export default function StatsPage() {
  const [overview, setOverview] = useState(null);
  const [revenueChart, setRevenueChart] = useState([]);
  const [eventStats, setEventStats] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [scansTimeline, setScansTimeline] = useState([]);
  const [scannerBoard, setScannerBoard] = useState([]);
  const [emailStats, setEmailStats] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartDays, setChartDays] = useState(30);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [ov, rev, ev, tt, st, sb, em, hp] = await Promise.all([
        fetchStatsOverview(),
        fetchRevenueChart(chartDays),
        fetchStatsByEvent(),
        fetchTicketTypeStats(),
        fetchScansTimeline(chartDays),
        fetchScannerLeaderboard(),
        fetchEmailStats(),
        fetchHourlyPattern(),
      ]);
      setOverview(ov);
      setRevenueChart(rev);
      setEventStats(ev);
      setTicketTypes(tt);
      setScansTimeline(st);
      setScannerBoard(sb);
      setEmailStats(em);
      setHourly(hp);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [chartDays]);

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="text-center py-24">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-red-400">{error}</p>
        <button onClick={loadAll} className="mt-4 text-sm text-gold-400 hover:underline">Retry</button>
      </div>
    );
  }

  const o = overview || {};
  const rev = o.revenue || {};
  const ord = o.orders || {};
  const tix = o.tickets || {};
  const evts = o.events || {};
  const scn = o.scans || {};
  const tod = o.today || {};

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-gold-400" />
            Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-1">Full stats suite — purchases, scans, revenue & more</p>
        </div>
        <button
          onClick={loadAll}
          className="flex items-center gap-2 px-3 py-2 bg-pavilion-800 border border-pavilion-600/50 rounded-lg text-sm text-gray-400 hover:text-white transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Today banner */}
      <div className="bg-gradient-to-r from-gold-500/10 via-pavilion-800 to-pavilion-800 border border-gold-500/20 rounded-xl p-5">
        <p className="text-xs text-gold-400/70 uppercase tracking-wider font-bold mb-3">Today</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-2xl font-bold text-white">{tod.orders || 0}</p>
            <p className="text-xs text-gray-500">Orders</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gold-400">{fmt(tod.revenue || 0)}</p>
            <p className="text-xs text-gray-500">Revenue</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-400">{tod.checkins || 0}</p>
            <p className="text-xs text-gray-500">Check-ins</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-400">{tod.scans || 0}</p>
            <p className="text-xs text-gray-500">Scans</p>
          </div>
        </div>
      </div>

      {/* Top-level stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Gross Revenue" value={fmt(rev.gross || 0)} sub={`Net: ${fmt(rev.net || 0)}`} icon={PoundSterling} color="text-gold-400" bgColor="bg-gold-500/10" />
        <StatCard label="Orders" value={ord.paid || 0} sub={`${ord.pending || 0} pending · ${ord.refunded || 0} refunded`} icon={ShoppingCart} color="text-blue-400" bgColor="bg-blue-500/10" />
        <StatCard label="Tickets Sold" value={(tix.valid || 0) + (tix.used || 0)} sub={`${tix.used || 0} used · ${tix.cancelled || 0} cancelled`} icon={Ticket} color="text-green-400" bgColor="bg-green-500/10" />
        <StatCard label="Scan Success" value={pct(scn.success, scn.total)} sub={`${scn.success || 0} of ${scn.total || 0} scans`} icon={QrCode} color="text-purple-400" bgColor="bg-purple-500/10" />
      </div>

      {/* Secondary stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Avg Order Value" value={fmt(rev.avg_order || 0)} icon={TrendingUp} color="text-cyan-400" bgColor="bg-cyan-500/10" />
        <StatCard label="Booking Fees" value={fmt(rev.fees || 0)} icon={PoundSterling} color="text-amber-400" bgColor="bg-amber-500/10" />
        <StatCard label="Refunds" value={fmt(rev.refunded || 0)} sub={`${rev.refund_count || 0} refunds issued`} icon={TrendingDown} color="text-red-400" bgColor="bg-red-500/10" />
        <StatCard label="Events" value={evts.total || 0} sub={`${evts.on_sale || 0} on-sale · ${evts.sold_out || 0} sold out`} icon={CalendarDays} color="text-indigo-400" bgColor="bg-indigo-500/10" />
      </div>

      {/* Revenue Chart */}
      <Section title="Revenue Over Time" icon={TrendingUp}>
        <div className="flex gap-2 mb-4">
          {[7, 14, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setChartDays(d)}
              className={`px-3 py-1 text-xs rounded-lg transition-all ${chartDays === d ? 'bg-gold-500 text-pavilion-900 font-bold' : 'bg-pavilion-700 text-gray-400 hover:text-white'}`}
            >
              {d}d
            </button>
          ))}
        </div>
        {revenueChart.length > 0 ? (
          <div>
            <MiniBar
              data={revenueChart.map(d => ({ label: d.date, value: d.revenue }))}
              color="bg-gold-500"
              height="h-24"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-1">
              <span>{fmtDate(revenueChart[0]?.date)}</span>
              <span>{fmtDate(revenueChart[revenueChart.length - 1]?.date)}</span>
            </div>
            <div className="flex gap-6 mt-3 text-xs text-gray-500">
              <span>Total: <strong className="text-gold-400">{fmt(revenueChart.reduce((s, d) => s + d.revenue, 0))}</strong></span>
              <span>Orders: <strong className="text-white">{revenueChart.reduce((s, d) => s + d.orders, 0)}</strong></span>
              <span>Refunds: <strong className="text-red-400">{fmt(revenueChart.reduce((s, d) => s + d.refunds, 0))}</strong></span>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No revenue data for this period</p>
        )}
      </Section>

      {/* Scans Timeline */}
      <Section title="Scans Timeline" icon={QrCode}>
        {scansTimeline.length > 0 ? (
          <div>
            <MiniBar
              data={scansTimeline.map(d => ({ label: d.date, value: d.total }))}
              color="bg-green-500"
              height="h-20"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-1">
              <span>{fmtDate(scansTimeline[0]?.date)}</span>
              <span>{fmtDate(scansTimeline[scansTimeline.length - 1]?.date)}</span>
            </div>
            <div className="flex gap-6 mt-3 text-xs text-gray-500">
              <span>Total: <strong className="text-white">{scansTimeline.reduce((s, d) => s + d.total, 0)}</strong></span>
              <span className="text-green-400">✓ {scansTimeline.reduce((s, d) => s + d.success, 0)}</span>
              <span className="text-yellow-400">⟳ {scansTimeline.reduce((s, d) => s + d.duplicate, 0)} dupes</span>
              <span className="text-red-400">✕ {scansTimeline.reduce((s, d) => s + d.invalid, 0)} invalid</span>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No scan data yet</p>
        )}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Event Performance */}
        <Section title="Event Performance" icon={CalendarDays}>
          {eventStats.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {eventStats.map(ev => {
                const soldPct = ev.capacity ? Math.round(((ev.tickets_sold || 0) / ev.capacity) * 100) : null;
                const checkinPct = ev.tickets_sold ? Math.round(((ev.checked_in || 0) / ev.tickets_sold) * 100) : 0;
                return (
                  <div key={ev.id} className="bg-pavilion-700/50 rounded-lg p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">{ev.title}</p>
                        <p className="text-xs text-gray-500">{fmtDate(ev.date_time)} · {ev.status}</p>
                      </div>
                      <p className="text-sm font-bold text-gold-400 ml-2">{fmt(ev.revenue)}</p>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-400">
                      <span>{ev.order_count} orders</span>
                      <span>{ev.tickets_sold} tickets</span>
                      <span className="text-green-400">{ev.checked_in} in</span>
                      {ev.refunded > 0 && <span className="text-red-400">{fmt(ev.refunded)} refunded</span>}
                    </div>
                    {soldPct !== null && (
                      <div className="mt-2">
                        <div className="h-1.5 bg-pavilion-600 rounded-full overflow-hidden">
                          <div className="h-full bg-gold-500 rounded-full transition-all" style={{ width: `${Math.min(soldPct, 100)}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-600 mt-0.5">{soldPct}% capacity · {checkinPct}% checked in</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No events yet</p>
          )}
        </Section>

        {/* Ticket Types Breakdown */}
        <Section title="Ticket Types" icon={Ticket}>
          {ticketTypes.length > 0 ? (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {Object.entries(ticketTypes.reduce((groups, tt) => {
                const key = tt.eventTitle || "Unknown";
                if (!groups[key]) groups[key] = [];
                groups[key].push(tt);
                return groups;
              }, {})).map(([eventTitle, types]) => (
                <div key={eventTitle} className="mb-3">
                  <p className="text-xs font-semibold text-gold-400 uppercase tracking-wider mb-1.5 px-1">{eventTitle}</p>
                  {types.map((tt, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-1 border-b border-pavilion-600/20 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{tt.name}</p>
                      </div>
                      <div className="text-right ml-3">
                        <p className="text-sm font-medium text-white">{tt.sold} / {tt.available}</p>
                        <p className="text-xs text-gray-500">{fmt(tt.price)} · {tt.used} used</p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No ticket types yet</p>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly Patterns */}
        <Section title="Activity Patterns" icon={Clock}>
          {hourly ? (
            <HourlyHeatmap purchases={hourly.purchases} checkins={hourly.checkins} />
          ) : (
            <p className="text-gray-500 text-sm">No data yet</p>
          )}
        </Section>

        {/* Scanner Leaderboard */}
        <Section title="Scanner Leaderboard" icon={Users}>
          {scannerBoard.length > 0 ? (
            <div className="space-y-2">
              {scannerBoard.map((s, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-pavilion-600/20 last:border-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-gold-500 text-pavilion-900' : i === 1 ? 'bg-gray-400 text-pavilion-900' : i === 2 ? 'bg-amber-700 text-white' : 'bg-pavilion-700 text-gray-400'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{s.name}</p>
                    <p className="text-xs text-gray-500">Last: {fmtDateTime(s.last_scan)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gold-400">{s.total_scans}</p>
                    <p className="text-xs text-gray-500">{s.successful} ✓</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No scans recorded yet</p>
          )}
        </Section>
      </div>

      {/* Email Stats */}
      {emailStats && (
        <Section title="Email Delivery" icon={Mail}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{emailStats.total || 0}</p>
              <p className="text-xs text-gray-500">Total Emails</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <p className="text-2xl font-bold text-green-400">{emailStats.sent || 0}</p>
              </div>
              <p className="text-xs text-gray-500">Delivered</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <XCircle className="w-4 h-4 text-red-400" />
                <p className="text-2xl font-bold text-red-400">{emailStats.failed || 0}</p>
              </div>
              <p className="text-xs text-gray-500">Failed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-400">{emailStats.unique_opens || 0}</p>
              <p className="text-xs text-gray-500">Opened ({pct(emailStats.unique_opens, emailStats.sent)})</p>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
