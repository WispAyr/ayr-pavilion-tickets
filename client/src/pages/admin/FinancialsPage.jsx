import { useState, useEffect } from 'react';
import {
  Loader2,
  AlertCircle,
  ShieldAlert,
  Banknote,
  Receipt,
  ArrowDown,
  Shield,
  TrendingUp,
} from 'lucide-react';
import { canSeeFinancials } from '../../lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getHeaders() {
  const token = localStorage.getItem('admin_token');
  return { Authorization: `Bearer ${token}` };
}

function formatMoney(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

export default function FinancialsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortCol, setSortCol] = useState('gross');
  const [sortDir, setSortDir] = useState('desc');

  const hasAccess = canSeeFinancials();

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    loadData();
  }, [hasAccess]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/financials/overview`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to load financial data');
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <ShieldAlert className="w-16 h-16 text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-gray-400">You do not have permission to view financial data.</p>
      </div>
    );
  }

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

  const overview = data || {};
  const byEvent = overview.byEvent || [];
  const byType = overview.byTicketType || [];

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  const sortedEvents = [...byEvent].sort((a, b) => {
    let av = a[sortCol] ?? 0;
    let bv = b[sortCol] ?? 0;
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totals = byEvent.reduce(
    (acc, e) => ({
      gross: acc.gross + (e.gross || 0),
      fees: acc.fees + (e.fees || 0),
      refunds: acc.refunds + (e.refunds || 0),
      protection: acc.protection + (e.protection || 0),
      net: acc.net + (e.net || 0),
    }),
    { gross: 0, fees: 0, refunds: 0, protection: 0, net: 0 }
  );

  const SortHeader = ({ col, label }) => (
    <th
      onClick={() => handleSort(col)}
      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gold-400 transition-colors select-none whitespace-nowrap"
    >
      {label} {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="text-2xl font-bold">Financial Overview</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard icon={Banknote} label="Gross Revenue" value={formatMoney(overview.grossRevenue ?? 0)} color="text-gold-400" />
        <KPICard icon={Receipt} label="Booking Fees" value={formatMoney(overview.bookingFees ?? 0)} color="text-white" />
        <KPICard icon={ArrowDown} label="Refunds" value={formatMoney(overview.refunds ?? 0)} color="text-red-400" />
        <KPICard icon={Shield} label="Protection Revenue" value={formatMoney(overview.protectionRevenue ?? 0)} color="text-white" />
        <KPICard icon={TrendingUp} label="Net Revenue" value={formatMoney(overview.netRevenue ?? 0)} color="text-green-400" />
      </div>

      {/* Revenue by event */}
      <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-pavilion-600/50">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Revenue by Event</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-pavilion-600/50">
              <tr>
                <SortHeader col="title" label="Event" />
                <SortHeader col="gross" label="Gross" />
                <SortHeader col="fees" label="Fees" />
                <SortHeader col="refunds" label="Refunds" />
                <SortHeader col="protection" label="Protection" />
                <SortHeader col="net" label="Net" />
              </tr>
            </thead>
            <tbody className="divide-y divide-pavilion-600/30">
              {sortedEvents.map((ev, i) => (
                <tr key={i} className="hover:bg-pavilion-700/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-white font-medium">{ev.title}</td>
                  <td className="px-4 py-3 text-sm text-gold-400">{formatMoney(ev.gross ?? 0)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{formatMoney(ev.fees ?? 0)}</td>
                  <td className="px-4 py-3 text-sm text-red-400">{formatMoney(ev.refunds ?? 0)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{formatMoney(ev.protection ?? 0)}</td>
                  <td className="px-4 py-3 text-sm text-green-400 font-medium">{formatMoney(ev.net ?? 0)}</td>
                </tr>
              ))}
              {/* Totals row */}
              {sortedEvents.length > 0 && (
                <tr className="bg-pavilion-900/50 border-t-2 border-pavilion-600">
                  <td className="px-4 py-3 text-sm text-white font-bold">Total</td>
                  <td className="px-4 py-3 text-sm text-gold-400 font-bold">{formatMoney(totals.gross)}</td>
                  <td className="px-4 py-3 text-sm text-gray-300 font-bold">{formatMoney(totals.fees)}</td>
                  <td className="px-4 py-3 text-sm text-red-400 font-bold">{formatMoney(totals.refunds)}</td>
                  <td className="px-4 py-3 text-sm text-gray-300 font-bold">{formatMoney(totals.protection)}</td>
                  <td className="px-4 py-3 text-sm text-green-400 font-bold">{formatMoney(totals.net)}</td>
                </tr>
              )}
              {sortedEvents.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500">No revenue data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revenue by ticket type */}
      {byType.length > 0 && (
        <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-pavilion-600/50">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Revenue by Ticket Type</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-pavilion-600/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Events</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Revenue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Avg Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pavilion-600/30">
                {byType.map((t, i) => (
                  <tr key={i} className="hover:bg-pavilion-700/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-white font-medium">{t.type}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{t.eventCount}</td>
                    <td className="px-4 py-3 text-sm text-gold-400">{formatMoney(t.revenue ?? 0)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{formatMoney(t.avgPrice ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Avg order value */}
      {overview.avgOrderValue != null && (
        <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-6">
          <p className="text-sm text-gray-400 mb-1">Average Order Value</p>
          <p className="text-4xl font-bold text-gold-400">{formatMoney(overview.avgOrderValue)}</p>
        </div>
      )}
    </div>
  );
}

function KPICard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-gold-500/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-gold-400" />
        </div>
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
