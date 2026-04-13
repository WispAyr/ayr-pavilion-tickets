import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Loader2, Printer, ArrowLeft, Eye, EyeOff, Mail, Send, CheckCircle, Clock, Users, TrendingUp, AlertTriangle, ShieldCheck } from 'lucide-react';
import { canSeeFinancials } from '../../lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('admin_token');
const headers = () => ({ Authorization: `Bearer ${token()}` });

function fmt(pence) { return `£${((pence || 0) / 100).toFixed(2)}`; }
function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function fmtPct(n) { return `${(n || 0).toFixed(1)}%`; }
function fmtTime(d) { if (!d) return '—'; return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }

function BarCell({ pct, color = 'bg-green-500' }) {
  const p = Math.min(100, Math.max(0, pct || 0));
  const barColor = p > 80 ? 'bg-green-500' : p > 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color === 'auto' ? barColor : color} rounded-full transition-all`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-xs font-mono w-12 text-right">{fmtPct(pct)}</span>
    </div>
  );
}

function KpiCard({ label, value, sub, color = 'text-black' }) {
  return (
    <div className="text-center p-3 border border-gray-200 rounded-lg">
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export default function EventReportPage() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const forceNoFinancials = searchParams.get('financials') === '0';
  const [showFinancials, setShowFinancials] = useState(!forceNoFinancials && canSeeFinancials());

  // Support combined reports via ?ids=1,2,3 search param
  const combinedIds = searchParams.get('ids');
  const isCombined = !!combinedIds;

  useEffect(() => {
    setLoading(true);
    const url = isCombined
      ? `${API_BASE}/admin/stats/combined-report?ids=${combinedIds}`
      : `${API_BASE}/admin/stats/event-report/${eventId}`;
    fetch(url, { headers: headers() })
      .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [eventId, combinedIds]);

  async function handleSendEmail() {
    setSending(true);
    try {
      const url = isCombined
        ? `${API_BASE}/admin/events/close-group`
        : `${API_BASE}/admin/events/${eventId}/close-event`;
      const body = isCombined ? { event_ids: combinedIds.split(',').map(Number) } : {};
      const r = await fetch(url, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error('Failed');
      setSent(true);
      setTimeout(() => setSent(false), 5000);
    } catch (e) { alert('Failed to send report: ' + e.message); }
    finally { setSending(false); }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="w-10 h-10 text-gray-400 animate-spin" /></div>;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center"><p className="text-red-500">{error || 'No data'}</p></div>;

  // API returns snake_case keys. Combined reports have different shape.
  const dataCombined = data.is_combined;
  const sessions = data.sessions || [];
  const comps = data.comps || {};
  const event = data.event || {
    title: data.group_name || 'Combined Report',
    date_time: data.date_range?.first,
    doors_open: null,
    venue: data.venue || 'Ayr Pavilion',
    status: 'completed',
    capacity: null
  };
  const ticketTypes = data.ticket_types || data.ticketTypes || [];
  const financials = data.financials || {};
  const salesTimeline = data.sales_timeline || data.salesTimeline || [];
  const bookingVelocity = data.booking_velocity || data.bookingVelocity || {};
  const arrivalIntelligence = data.arrival_intelligence || data.arrivalIntelligence || {};
  const noShows = data.no_shows || data.noShows || [];
  const addonPerformance = data.addons || data.addonPerformance || [];
  const protectionClaims = data.protection_claims || data.protectionClaims || {};
  const customerIntelligence = data.customer_intelligence || data.customerIntelligence || {};
  const scannerPerformance = data.scanner_performance || data.scannerPerformance || [];
  const emailEngagement = data.email_engagement || data.emailEngagement || {};
  const manifest = data.manifest || [];

  const totalTickets = ticketTypes?.reduce((s, t) => s + (t.sold || 0), 0) || 0;
  const totalCheckedIn = ticketTypes?.reduce((s, t) => s + (t.checked_in || 0), 0) || 0;
  const checkinRate = totalTickets > 0 ? (totalCheckedIn / totalTickets * 100) : 0;
  const totalNoShows = noShows?.reduce((s, t) => s + (t.no_show_count || 0), 0) || 0;
  const noShowRate = totalTickets > 0 ? (totalNoShows / totalTickets * 100) : 0;

  const maxSalesHour = salesTimeline?.reduce((max, h) => h.orders > (max?.orders || 0) ? h : max, null);
  const maxArrivalBucket = arrivalIntelligence?.arrival_curve?.reduce((max, b) => b.count > (max?.count || 0) ? b : max, null);
  const maxArrivalCount = arrivalIntelligence?.arrival_curve?.reduce((max, b) => Math.max(max, b.count), 0) || 1;

  return (
    <div className="bg-white min-h-screen">
      {/* Toolbar */}
      <div className="print:hidden bg-gray-100 border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link to="/admin/events" className="flex items-center gap-2 text-gray-600 hover:text-black text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to Events
        </Link>
        <div className="flex items-center gap-3">
          {canSeeFinancials() && (
            <button onClick={() => setShowFinancials(!showFinancials)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${showFinancials ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-300 text-gray-600'}`}>
              {showFinancials ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {showFinancials ? 'Financials' : 'No Financials'}
            </button>
          )}
          <button onClick={handleSendEmail} disabled={sending || sent}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${sent ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <CheckCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {sent ? 'Sent!' : 'Email Report'}
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      <div className="max-w-[210mm] mx-auto px-6 py-8 text-black text-sm print:px-0 print:py-4">
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-6">
          <p className="text-xs font-bold tracking-[0.3em] text-gray-400 mb-1">AYR PAVILION — EVENT REPORT</p>
          <h1 className="text-2xl font-black">{event.title}</h1>
          <div className="flex flex-wrap gap-6 mt-2 text-gray-600 text-xs">
            <span>Date: {fmtDate(event.date_time)}</span>
            {event.doors_open && <span>Doors: {fmtDate(event.doors_open)}</span>}
            <span>Venue: {event.venue}</span>
            {event.capacity && <span>Capacity: {event.capacity}</span>}
            <span>Status: {event.status}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Generated: {fmtDate(data.generated_at)}
            {!showFinancials && ' · Operational copy (no financial data)'}
          </p>
        </div>

        {/* Hero KPIs */}
        <div className={`grid ${showFinancials ? 'grid-cols-5' : 'grid-cols-4'} gap-3 mb-8`}>
          {showFinancials && <KpiCard label="Gross Revenue" value={fmt(financials?.gross_revenue)} color="text-amber-600" />}
          <KpiCard label="Tickets Sold" value={totalTickets} sub={`of ${ticketTypes?.reduce((s,t) => s + (t.quantity||0), 0) || '?'} available`} />
          <KpiCard label="Checked In" value={totalCheckedIn} sub={fmtPct(checkinRate)} color="text-green-600" />
          <KpiCard label="No-shows" value={totalNoShows} sub={fmtPct(noShowRate)} color={noShowRate > 15 ? 'text-red-600' : 'text-gray-700'} />
          <KpiCard label="Orders" value={financials?.total_orders || 0} />
        </div>

        {/* Financial Summary */}
        {showFinancials && financials && (
          <>
            <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1">Financial Summary</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-6 text-xs max-w-md">
              <span>Ticket Revenue:</span><span className="text-right font-mono">{fmt(financials.gross_revenue)}</span>
              <span>Booking Fees:</span><span className="text-right font-mono">{fmt(financials.booking_fees)}</span>
              <span>Protection Fees:</span><span className="text-right font-mono">{fmt(financials.protection_fees)}</span>
              <span className="text-red-600">Refunds:</span><span className="text-right font-mono text-red-600">-{fmt(financials.refunds)}</span>
              <span className="font-bold border-t border-gray-300 pt-1">Net Revenue:</span>
              <span className="text-right font-mono font-bold border-t border-gray-300 pt-1">{fmt(financials.net_revenue)}</span>
            </div>
          </>
        )}

        {/* Ticket Types */}
        <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1">Ticket Types</h2>
        <table className="w-full mb-6 text-xs">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left py-1.5 font-semibold">Type</th>
              {showFinancials && <th className="text-right py-1.5 font-semibold">Price</th>}
              <th className="text-right py-1.5 font-semibold">Sold</th>
              <th className="text-right py-1.5 font-semibold">Checked In</th>
              <th className="text-right py-1.5 font-semibold">No-shows</th>
              <th className="py-1.5 font-semibold w-40 text-right">Sell-through</th>
              {showFinancials && <th className="text-right py-1.5 font-semibold">Revenue</th>}
            </tr>
          </thead>
          <tbody>
            {ticketTypes?.map((tt, i) => {
              const ns = noShows?.find(n => n.ticket_type || n.name === tt.name);
              return (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1.5 font-medium">{tt.name}</td>
                  {showFinancials && <td className="text-right py-1.5">{fmt(tt.price)}</td>}
                  <td className="text-right py-1.5">{tt.sold}/{tt.quantity}</td>
                  <td className="text-right py-1.5">{tt.checked_in}</td>
                  <td className="text-right py-1.5">{ns?.no_show_count || 0}</td>
                  <td className="py-1.5"><BarCell pct={tt.sell_through_pct} color="auto" /></td>
                  {showFinancials && <td className="text-right py-1.5 font-mono">{fmt(tt.price * tt.sold)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Sales Timeline */}
        {salesTimeline && salesTimeline.length > 0 && (
          <>
            <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1">Sales Timeline</h2>
            {bookingVelocity && (
              <div className="grid grid-cols-4 gap-3 mb-3 text-xs">
                <div className="p-2 bg-gray-50 rounded"><span className="text-gray-500">First Sale:</span><br/><span className="font-medium">{fmtDate(bookingVelocity.first_sale)}</span></div>
                <div className="p-2 bg-gray-50 rounded"><span className="text-gray-500">Last Sale:</span><br/><span className="font-medium">{fmtDate(bookingVelocity.last_sale)}</span></div>
                <div className="p-2 bg-gray-50 rounded"><span className="text-gray-500">Peak Hour:</span><br/><span className="font-medium">{bookingVelocity.peak_hour || '—'}</span></div>
                <div className="p-2 bg-gray-50 rounded"><span className="text-gray-500">Avg Between Orders:</span><br/><span className="font-medium">{bookingVelocity.avg_minutes_between_orders ? `${Math.round(bookingVelocity.avg_minutes_between_orders)} min` : '—'}</span></div>
              </div>
            )}
            <div className="flex items-end gap-px h-20 mb-6">
              {salesTimeline.map((h, i) => {
                const maxOrders = Math.max(...salesTimeline.map(x => x.orders));
                const height = maxOrders > 0 ? (h.orders / maxOrders * 100) : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div className="w-full bg-amber-400 rounded-t" style={{ height: `${height}%`, minHeight: h.orders > 0 ? '2px' : '0' }} title={`${h.hour}: ${h.orders} orders`} />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-px mb-6 -mt-4">
              {salesTimeline.map((h, i) => (
                <div key={i} className="flex-1 text-center" style={{ fontSize: '6px' }}>
                  {i % Math.ceil(salesTimeline.length / 8) === 0 ? h.hour?.split(' ')[1] || '' : ''}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Arrival Intelligence */}
        {arrivalIntelligence && arrivalIntelligence.arrival_curve && arrivalIntelligence.arrival_curve.length > 0 && (
          <>
            <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1">Arrival Intelligence</h2>
            <div className="grid grid-cols-4 gap-3 mb-3 text-xs">
              <div className="p-2 bg-green-50 rounded border border-green-200"><span className="text-gray-500">Peak Arrival:</span><br/><span className="font-bold text-green-700">{arrivalIntelligence.peak_arrival_time || '—'}</span></div>
              <div className="p-2 bg-blue-50 rounded border border-blue-200"><span className="text-gray-500">Early (before doors):</span><br/><span className="font-bold text-blue-700">{fmtPct(arrivalIntelligence.early_pct)}</span></div>
              <div className="p-2 bg-green-50 rounded border border-green-200"><span className="text-gray-500">On-time (first 30m):</span><br/><span className="font-bold text-green-700">{fmtPct(arrivalIntelligence.on_time_pct)}</span></div>
              <div className="p-2 bg-amber-50 rounded border border-amber-200"><span className="text-gray-500">Late (after 30m):</span><br/><span className="font-bold text-amber-700">{fmtPct(arrivalIntelligence.late_pct)}</span></div>
            </div>
            <div className="flex items-end gap-1 h-16 mb-6">
              {arrivalIntelligence.arrival_curve.map((b, i) => {
                const height = maxArrivalCount > 0 ? (b.count / maxArrivalCount * 100) : 0;
                const mins = b.offset_mins ?? b.offset_minutes ?? 0;
                const barColor = mins < 0 ? 'bg-blue-400' : mins <= 30 ? 'bg-green-500' : 'bg-amber-400';
                const label = b.label || `+${mins}m`;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div className={`w-full ${barColor} rounded-t`} style={{ height: `${height}%`, minHeight: b.count > 0 ? '2px' : '0' }} title={`${label}: ${b.count} arrivals`} />
                    <span style={{ fontSize: '5px' }} className="mt-0.5 text-gray-400">{label}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* No-show Analysis */}
        {noShows && noShows.length > 0 && noShows.some(n => n.no_show_count > 0) && (
          <>
            <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1">No-show Analysis</h2>
            <table className="w-full mb-6 text-xs">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-1.5 font-semibold">Ticket Type</th>
                  <th className="text-right py-1.5 font-semibold">Sold</th>
                  <th className="text-right py-1.5 font-semibold">No-shows</th>
                  <th className="py-1.5 font-semibold w-40 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {noShows.filter(n => n.no_show_count > 0).map((n, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1.5">{n.ticket_type || n.name}</td>
                    <td className="text-right py-1.5">{n.sold}</td>
                    <td className="text-right py-1.5 text-red-600 font-medium">{n.no_show_count}</td>
                    <td className="py-1.5"><BarCell pct={n.no_show_pct} color="bg-red-400" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Per-Session Breakdown (combined reports) */}
        {dataCombined && sessions.length > 0 && (
          <>
            <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1">Per-Session Breakdown ({sessions.length} sessions)</h2>
            <table className="w-full mb-6 text-xs">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-1.5 font-semibold">Session</th>
                  <th className="text-right py-1.5 font-semibold">Date</th>
                  {showFinancials && <th className="text-right py-1.5 font-semibold">Revenue</th>}
                  <th className="text-right py-1.5 font-semibold">Sold</th>
                  <th className="py-1.5 font-semibold w-24 text-right">Check-in</th>
                  <th className="py-1.5 font-semibold w-24 text-right">No-show</th>
                  <th className="text-right py-1.5 font-semibold">Orders</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1.5 font-medium">{s.title.replace(event.title + ' \u2014 ', '')}</td>
                    <td className="text-right py-1.5">{fmtDate(s.date_time)}</td>
                    {showFinancials && <td className="text-right py-1.5 font-mono">{fmt(s.gross_revenue)}</td>}
                    <td className="text-right py-1.5">{s.total_sold}</td>
                    <td className="py-1.5"><BarCell pct={s.checkin_rate} color="auto" /></td>
                    <td className="py-1.5"><BarCell pct={s.no_show_rate} color="bg-red-400" /></td>
                    <td className="text-right py-1.5">{s.total_orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Comps */}
        {comps && comps.total_comps > 0 && (
          <>
            <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1">Complimentary Tickets</h2>
            <div className="grid grid-cols-2 gap-3 mb-6 text-xs max-w-sm">
              <KpiCard label="Comp Orders" value={comps.total_comps} color="text-purple-600" />
              <KpiCard label="Codes Used" value={comps.comp_codes_used} />
            </div>
          </>
        )}

        {/* Add-on Performance */}
        {addonPerformance && addonPerformance.length > 0 && (
          <>
            <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1">Add-on Performance</h2>
            {addonPerformance.map((a, i) => (
              <div key={i} className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 flex justify-between items-center">
                  <span className="font-medium">{a.name}</span>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>{a.total_selected} selected</span>
                    <span>Uptake: <strong className="text-black">{fmtPct(a.uptake_pct)}</strong></span>
                    {showFinancials && <span>Revenue: <strong className="text-black">{fmt(a.revenue)}</strong></span>}
                  </div>
                </div>
                {a.options && a.options.length > 0 && (
                  <table className="w-full text-xs">
                    <tbody>
                      {a.options.map((o, j) => (
                        <tr key={j} className="border-t border-gray-100">
                          <td className="px-3 py-1.5">{o.label || o.option}</td>
                          <td className="text-right py-1.5 pr-3">{o.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </>
        )}

        {/* Protection Claims */}
        {protectionClaims && (protectionClaims.total_protected > 0 || protectionClaims.total_claims > 0) && (
          <>
            <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Protection & Claims
            </h2>
            <div className="grid grid-cols-4 gap-3 mb-6 text-xs">
              <div className="p-2 bg-green-50 rounded border border-green-200 text-center">
                <p className="text-lg font-black text-green-700">{protectionClaims.total_protected}</p>
                <p className="text-gray-500">Protected Tickets</p>
              </div>
              <div className="p-2 bg-gray-50 rounded border border-gray-200 text-center">
                <p className="text-lg font-black">{protectionClaims.total_claims}</p>
                <p className="text-gray-500">Claims Filed</p>
              </div>
              <div className="p-2 bg-gray-50 rounded border border-gray-200 text-center">
                <p className="text-lg font-black text-green-600">{protectionClaims.approved}</p>
                <p className="text-gray-500">Approved</p>
                <p className="text-gray-400">{protectionClaims.denied} denied · {protectionClaims.pending} pending</p>
              </div>
              {showFinancials && (
                <div className="p-2 bg-gray-50 rounded border border-gray-200 text-center">
                  <p className="text-lg font-black">{fmt(protectionClaims.total_refunded)}</p>
                  <p className="text-gray-500">Claimed Refunds</p>
                  <p className="text-gray-400">Revenue: {fmt(protectionClaims.protection_revenue)}</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Customer Intelligence */}
        {customerIntelligence && (
          <>
            <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1 flex items-center gap-2">
              <Users className="w-4 h-4" /> Customer Intelligence
            </h2>
            <div className="grid grid-cols-4 gap-3 mb-6 text-xs">
              <div className="p-2 bg-blue-50 rounded border border-blue-200 text-center">
                <p className="text-lg font-black text-blue-700">{customerIntelligence.new_customers}</p>
                <p className="text-gray-500">First-time Buyers</p>
              </div>
              <div className="p-2 bg-purple-50 rounded border border-purple-200 text-center">
                <p className="text-lg font-black text-purple-700">{customerIntelligence.repeat_customers}</p>
                <p className="text-gray-500">Repeat Customers</p>
              </div>
              <div className="p-2 bg-green-50 rounded border border-green-200 text-center">
                <p className="text-lg font-black text-green-700">{customerIntelligence.marketing_opt_in_count}</p>
                <p className="text-gray-500">Marketing Opt-in</p>
                <p className="text-gray-400">{fmtPct(customerIntelligence.opt_in_rate)} of customers</p>
              </div>
              {showFinancials && (
                <div className="p-2 bg-amber-50 rounded border border-amber-200 text-center">
                  <p className="text-lg font-black text-amber-700">{fmt(customerIntelligence.avg_spend)}</p>
                  <p className="text-gray-500">Avg Spend</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Scanner Performance */}
        {scannerPerformance && scannerPerformance.length > 0 && (
          <>
            <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1">Scanner Performance</h2>
            <table className="w-full mb-6 text-xs">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-1.5 font-semibold">Scanner</th>
                  <th className="text-right py-1.5 font-semibold">Total Scans</th>
                  <th className="text-right py-1.5 font-semibold">Valid</th>
                  <th className="text-right py-1.5 font-semibold">Invalid</th>
                  <th className="text-right py-1.5 font-semibold">First Scan</th>
                  <th className="text-right py-1.5 font-semibold">Last Scan</th>
                </tr>
              </thead>
              <tbody>
                {scannerPerformance.map((s, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1.5 font-medium">{s.name || 'Unknown'}</td>
                    <td className="text-right py-1.5">{s.total_scans}</td>
                    <td className="text-right py-1.5 text-green-600">{s.valid_scans}</td>
                    <td className="text-right py-1.5 text-red-600">{s.invalid_scans}</td>
                    <td className="text-right py-1.5">{fmtTime(s.first_scan)}</td>
                    <td className="text-right py-1.5">{fmtTime(s.last_scan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Email Engagement */}
        {emailEngagement && emailEngagement.total_sent > 0 && (
          <>
            <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1 flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email Engagement
            </h2>
            <div className="grid grid-cols-4 gap-3 mb-6 text-xs">
              <div className="p-2 bg-gray-50 rounded text-center"><p className="text-lg font-black">{emailEngagement.total_sent}</p><p className="text-gray-500">Emails Sent</p></div>
              <div className="p-2 bg-gray-50 rounded text-center"><p className="text-lg font-black">{emailEngagement.total_opened}</p><p className="text-gray-500">Opened</p></div>
              <div className="p-2 bg-gray-50 rounded text-center"><p className="text-lg font-black">{fmtPct(emailEngagement.open_rate)}</p><p className="text-gray-500">Open Rate</p></div>
              <div className="p-2 bg-gray-50 rounded text-center"><p className="text-lg font-black">{fmtPct(emailEngagement.click_rate)}</p><p className="text-gray-500">Click Rate</p></div>
            </div>
          </>
        )}

        {/* Order Manifest */}
        <div className="break-before-page">
          <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-1">Order Manifest ({manifest?.length || 0} bookings)</h2>
          <table className="w-full text-xs mb-6">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-1.5 font-semibold">Ref</th>
                <th className="text-left py-1.5 font-semibold">Customer</th>
                <th className="text-left py-1.5 font-semibold">Email</th>
                <th className="text-left py-1.5 font-semibold">Tickets</th>
                {showFinancials && <th className="text-right py-1.5 font-semibold">Total</th>}
                <th className="text-center py-1.5 font-semibold">Status</th>
                <th className="text-right py-1.5 font-semibold">Booked</th>
              </tr>
            </thead>
            <tbody>
              {manifest?.map((o, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1.5 font-mono text-xs">{o.order_ref}</td>
                  <td className="py-1.5">{o.customer_name}</td>
                  <td className="py-1.5 text-gray-500">{o.customer_email}</td>
                  <td className="py-1.5">
                    {o.tickets?.map((t, j) => (
                      <span key={j} className={`inline-block mr-1 px-1.5 py-0.5 rounded text-xs ${t.status === 'used' ? 'bg-green-100 text-green-700' : t.status === 'valid' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                        {t.ticket_type}
                      </span>
                    ))}
                  </td>
                  {showFinancials && <td className="text-right py-1.5 font-mono">{fmt(o.total)}</td>}
                  <td className="text-center py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${o.status === 'paid' ? 'bg-green-100 text-green-700' : o.status === 'refunded' ? 'bg-red-100 text-red-700' : o.status === 'comp' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100'}`}>{o.status}</span>
                  </td>
                  <td className="text-right py-1.5">{fmtDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-300 text-xs text-gray-400 text-center print:mt-4">
          <p>Ayr Pavilion — {showFinancials ? 'Full' : 'Operational'} Event Report — {event.title}</p>
          <p className="mt-1">Generated {fmtDate(data.generated_at)} — Contains personal data, keep secure</p>
        </div>
      </div>

      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .break-before-page { break-before: page; }
          @page { margin: 12mm; size: A4; }
        }
      `}</style>
    </div>
  );
}
