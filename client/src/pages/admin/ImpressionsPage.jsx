import { useState, useEffect } from 'react';
import { Eye, Users, TrendingUp, Loader2, AlertCircle, Globe, CalendarDays } from 'lucide-react';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
}

function Section({ title, children }) {
  return (
    <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl">
      <div className="p-5 border-b border-pavilion-600/50">
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Card({ label, value, sub, icon: Icon, color = 'text-gold-400', bg = 'bg-gold-500/10' }) {
  return (
    <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-400">{label}</span>
        <div className={`p-2 rounded-lg ${bg}`}><Icon className={`w-4 h-4 ${color}`} /></div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function ImpressionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE_URL}/admin/stats/page-views?days=${days}`, { headers: getAuthHeaders() })
      .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json(); })
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
    </div>
  );

  if (error) return (
    <div className="text-center py-24">
      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
      <p className="text-red-400">{error}</p>
    </div>
  );

  const d = data || {};
  const today = d.today || {};
  const byDay = d.byDay || [];
  const byPage = d.byPage || [];
  const byEvent = d.byEvent || [];
  const maxViews = Math.max(...byDay.map(x => x.views || 0), 1);

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Page Impressions</h1>
        <div className="flex gap-2">
          {[7, 14, 30, 90].map(n => (
            <button
              key={n}
              onClick={() => setDays(n)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                days === n
                  ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                  : 'bg-pavilion-800 text-gray-400 hover:text-white border border-pavilion-600/50'
              }`}
            >
              {n}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Total Views" value={d.total || 0} sub={`Last ${days} days`} icon={Eye} color="text-blue-400" bg="bg-blue-500/10" />
        <Card label="Unique Visitors" value={d.unique || 0} sub={`Last ${days} days`} icon={Users} color="text-green-400" bg="bg-green-500/10" />
        <Card label="Today Views" value={today.views || 0} icon={TrendingUp} color="text-emerald-400" bg="bg-emerald-500/10" />
        <Card label="Today Unique" value={today.unique_views || 0} icon={Globe} color="text-purple-400" bg="bg-purple-500/10" />
      </div>

      {/* Daily chart */}
      <Section title={`Daily Views — Last ${days} Days`}>
        {byDay.length === 0 ? (
          <div className="text-center py-12">
            <Eye className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No page view data yet. Views will appear as visitors browse the site.</p>
          </div>
        ) : (
          <div className="flex items-end gap-[2px] h-48">
            {byDay.map((day, i) => {
              const h = Math.max((day.views / maxViews) * 100, 2);
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div
                    className="w-full bg-blue-500 rounded-t hover:bg-blue-400 transition-colors cursor-default"
                    style={{ height: `${h}%` }}
                  />
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-pavilion-700 text-xs text-white px-2 py-1 rounded whitespace-nowrap z-10">
                    {day.date}: {day.views} views ({day.unique_views} unique)
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Two columns: By Page + By Event */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Top Pages">
          {byPage.length === 0 ? (
            <p className="text-gray-500 text-sm">No data yet</p>
          ) : (
            <div className="space-y-3">
              {byPage.map((p, i) => {
                const maxP = byPage[0]?.views || 1;
                const w = Math.max((p.views / maxP) * 100, 5);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-300 truncate mr-3">{p.path}</span>
                      <span className="text-xs text-gray-500 shrink-0">{p.views} / {p.unique_views} unique</span>
                    </div>
                    <div className="bg-pavilion-700 rounded-full h-2 overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${w}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Views by Event">
          {byEvent.length === 0 ? (
            <p className="text-gray-500 text-sm">No event-specific views yet</p>
          ) : (
            <div className="space-y-3">
              {byEvent.map((ev, i) => {
                const maxE = byEvent[0]?.views || 1;
                const w = Math.max((ev.views / maxE) * 100, 5);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-300 truncate mr-3">{ev.title || `Event #${ev.event_id}`}</span>
                      <span className="text-xs text-gray-500 shrink-0">{ev.views} / {ev.unique_views} unique</span>
                    </div>
                    <div className="bg-pavilion-700 rounded-full h-2 overflow-hidden">
                      <div className="bg-green-500 h-full rounded-full transition-all" style={{ width: `${w}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
