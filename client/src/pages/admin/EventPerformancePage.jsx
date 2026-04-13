import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  Users,
  TrendingUp,
  XCircle,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function camelizeKeys(obj) {
  if (Array.isArray(obj)) return obj.map(camelizeKeys);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        camelizeKeys(v)
      ])
    );
  }
  return obj;
}

function getHeaders() {
  const token = localStorage.getItem('admin_token');
  return { Authorization: `Bearer ${token}` };
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function pctColor(pct) {
  if (pct >= 80) return '#22c55e';
  if (pct >= 50) return '#eab308';
  return '#ef4444';
}

function PctBar({ value }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-pavilion-700 rounded-full overflow-hidden min-w-[60px]">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${Math.min(v, 100)}%`, backgroundColor: pctColor(v) }}
        />
      </div>
      <span className="text-sm font-medium" style={{ color: pctColor(v) }}>
        {v.toFixed(1)}%
      </span>
    </div>
  );
}

export default function EventPerformancePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/performance/events`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to load performance data');
      setData(camelizeKeys(await res.json()));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
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

  const events = data?.events || [];
  const summary = data?.summary || {};

  const sorted = [...events].sort((a, b) => {
    let av = a[sortCol];
    let bv = b[sortCol];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av == null) av = 0;
    if (bv == null) bv = 0;
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Event Performance</h1>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-pavilion-700 border border-pavilion-600/50 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-pavilion-600 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={CheckCircle} label="Avg Check-in Rate" value={`${(summary.avgCheckinRate ?? 0).toFixed(1)}%`} color="text-green-400" />
        <KPICard icon={TrendingUp} label="Avg Sell-Through" value={`${(summary.avgSellThrough ?? 0).toFixed(1)}%`} color="text-gold-400" />
        <KPICard icon={XCircle} label="Avg No-Show Rate" value={`${(summary.avgNoShowRate ?? 0).toFixed(1)}%`} color="text-red-400" />
        <KPICard icon={Users} label="Total Events" value={summary.totalEvents ?? events.length} color="text-white" />
      </div>

      {/* Events table */}
      <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-pavilion-600/50">
              <tr>
                <SortHeader col="title" label="Event" />
                <SortHeader col="date" label="Date" />
                <SortHeader col="sellThrough" label="Sell-Through" />
                <SortHeader col="checkinRate" label="Check-in" />
                <SortHeader col="noShowRate" label="No-Show" />
                <SortHeader col="addOnUptake" label="Add-on Uptake" />
                <SortHeader col="protectionClaimRate" label="Claims" />
              </tr>
            </thead>
            <tbody className="divide-y divide-pavilion-600/30">
              {sorted.map((ev) => (
                <tr key={ev.id} className="hover:bg-pavilion-700/50 transition-colors">
                  <td className="px-4 py-3 text-sm">
                    <Link
                      to={`/admin/events/${ev.id}/ops`}
                      className="text-gold-400 hover:text-gold-300 font-medium transition-colors"
                    >
                      {ev.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">{formatDate(ev.date)}</td>
                  <td className="px-4 py-3"><PctBar value={ev.sellThrough} /></td>
                  <td className="px-4 py-3"><PctBar value={ev.checkinRate} /></td>
                  <td className="px-4 py-3"><PctBar value={ev.noShowRate} /></td>
                  <td className="px-4 py-3"><PctBar value={ev.addOnUptake} /></td>
                  <td className="px-4 py-3"><PctBar value={ev.protectionClaimRate} /></td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">No event data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
