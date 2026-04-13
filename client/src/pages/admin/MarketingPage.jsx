import { useState, useEffect } from 'react';
import {
  Users,
  TrendingUp,
  Mail,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
  Repeat,
  Star,
  Loader2,
  AlertCircle,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getHeaders() {
  const token = localStorage.getItem('admin_token');
  return { Authorization: `Bearer ${token}` };
}

function formatMoney(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function MarketingPage() {
  const [tab, setTab] = useState('insights');
  const [insights, setInsights] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('totalSpent');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const headers = getHeaders();
      const [insRes, custRes] = await Promise.all([
        fetch(`${API_BASE}/admin/marketing/insights`, { headers }),
        fetch(`${API_BASE}/admin/marketing/customers`, { headers }),
      ]);
      if (!insRes.ok) throw new Error('Failed to load insights');
      if (!custRes.ok) throw new Error('Failed to load customers');
      setInsights(await insRes.json());
      setCustomers(await custRes.json());
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

  function exportCSV() {
    const headers = ['Name', 'Email', 'Orders', 'Total Spent', 'Last Booking', 'Events Attended'];
    const rows = sortedCustomers.map((c) => [
      c.name,
      c.email,
      c.orderCount,
      (c.totalSpent / 100).toFixed(2),
      c.lastBooking || '',
      c.eventsAttended || 0,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredCustomers = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
  });

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    let av = a[sortCol];
    let bv = b[sortCol];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
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

  const SortHeader = ({ col, label }) => (
    <th
      onClick={() => handleSort(col)}
      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gold-400 transition-colors select-none"
    >
      {label} {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Marketing & CRM</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {['insights', 'customers'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              tab === t
                ? 'bg-gold-500 text-pavilion-900'
                : 'bg-pavilion-800 text-gray-400 hover:text-white border border-pavilion-600/50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'insights' && insights && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard icon={Mail} label="Opted-in Customers" value={insights.optedInCount ?? 0} />
            <KPICard icon={Repeat} label="Repeat Rate" value={`${(insights.repeatRate ?? 0).toFixed(1)}%`} />
            <KPICard icon={TrendingUp} label="Avg Orders/Customer" value={(insights.avgOrdersPerCustomer ?? 0).toFixed(1)} />
            <KPICard icon={Star} label="Total Revenue" value={formatMoney(insights.totalRevenue ?? 0)} gold />
          </div>

          {/* Opt-in rate */}
          <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-6">
            <p className="text-sm text-gray-400 mb-2">Marketing Opt-in Rate</p>
            <p className="text-5xl font-bold text-gold-400">{(insights.optInRate ?? 0).toFixed(1)}%</p>
            <div className="mt-3 w-full bg-pavilion-700 rounded-full h-3">
              <div
                className="bg-gold-500 h-3 rounded-full transition-all"
                style={{ width: `${Math.min(insights.optInRate ?? 0, 100)}%` }}
              />
            </div>
          </div>

          {/* Top events among opted-in */}
          {insights.topEvents && insights.topEvents.length > 0 && (
            <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-6">
              <h3 className="text-sm font-medium text-gray-400 mb-4">Top Events (Opted-in Customers)</h3>
              <div className="space-y-3">
                {insights.topEvents.map((ev, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-white text-sm">{ev.title}</span>
                    <span className="text-gold-400 text-sm font-semibold">{ev.count} bookings</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'customers' && (
        <div className="space-y-4">
          {/* Search + export */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-4 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
              />
            </div>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-pavilion-700 border border-pavilion-600/50 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-pavilion-600 transition-all"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>

          {/* Table */}
          <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-pavilion-600/50">
                  <tr>
                    <th className="w-8" />
                    <SortHeader col="name" label="Name" />
                    <SortHeader col="email" label="Email" />
                    <SortHeader col="orderCount" label="Orders" />
                    <SortHeader col="totalSpent" label="Total Spent" />
                    <SortHeader col="lastBooking" label="Last Booking" />
                    <SortHeader col="eventsAttended" label="Events" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-pavilion-600/30">
                  {sortedCustomers.map((c) => (
                    <>
                      <tr
                        key={c.email}
                        onClick={() => setExpanded(expanded === c.email ? null : c.email)}
                        className="hover:bg-pavilion-700/50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-3 text-gray-500">
                          {expanded === c.email ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-white font-medium">
                          {c.name}
                          {c.orderCount >= 2 && (
                            <span className="ml-2 inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded bg-gold-500/20 text-gold-400 border border-gold-500/30">
                              Repeat
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">{c.email}</td>
                        <td className="px-4 py-3 text-sm text-white">{c.orderCount}</td>
                        <td className="px-4 py-3 text-sm text-gold-400 font-medium">{formatMoney(c.totalSpent)}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{formatDate(c.lastBooking)}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{c.eventsAttended ?? 0}</td>
                      </tr>
                      {expanded === c.email && c.orders && (
                        <tr key={`${c.email}-detail`}>
                          <td colSpan={7} className="bg-pavilion-900/50 px-8 py-4">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Order History</p>
                            <div className="space-y-2">
                              {c.orders.map((o, i) => (
                                <div key={i} className="flex items-center justify-between text-sm">
                                  <span className="text-white">{o.eventTitle || `Order #${o.id}`}</span>
                                  <div className="flex items-center gap-4">
                                    <span className="text-gray-400">{formatDate(o.createdAt)}</span>
                                    <span className="text-gold-400 font-medium">{formatMoney(o.totalPence)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {sortedCustomers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-500">
                        <Users className="w-10 h-10 mx-auto mb-2 text-pavilion-600" />
                        No customers found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({ icon: Icon, label, value, gold }) {
  return (
    <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-gold-500/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-gold-400" />
        </div>
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${gold ? 'text-gold-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}
