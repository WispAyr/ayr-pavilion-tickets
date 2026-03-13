import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  Clock,
  Ticket,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  DoorOpen,
  PoundSterling,
  Activity,
} from 'lucide-react';
import { fetchDoorStats, fetchEvents } from '../../lib/api';

function StatCard({ icon: Icon, label, value, sub, color = 'gold' }) {
  const colors = {
    gold: 'text-gold-400 border-gold-500/20 bg-gold-500/5',
    green: 'text-green-400 border-green-500/20 bg-green-500/5',
    blue: 'text-blue-400 border-blue-500/20 bg-blue-500/5',
    purple: 'text-purple-400 border-purple-500/20 bg-purple-500/5',
  };

  return (
    <div className={`rounded-xl border p-4 sm:p-5 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 opacity-70" />
        <span className="text-xs uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <p className="text-3xl sm:text-4xl font-black tabular-nums">{value}</p>
      {sub && <p className="text-xs opacity-50 mt-1">{sub}</p>}
    </div>
  );
}

function ProgressBar({ percentage, checkedIn, total }) {
  return (
    <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/30 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-400 font-medium">Door Progress</span>
        <span className="text-2xl font-black text-gold-400 tabular-nums">{percentage}%</span>
      </div>
      <div className="w-full h-4 bg-pavilion-900 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-gold-600 to-gold-400 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>{checkedIn} through the door</span>
        <span>{total - checkedIn} remaining</span>
      </div>
    </div>
  );
}

function TypeBreakdown({ types }) {
  if (!types || types.length === 0) return null;

  return (
    <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/30 p-5">
      <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
        <Ticket className="w-4 h-4" />
        By Ticket Type
      </h3>
      <div className="space-y-3">
        {types.map((t, i) => {
          const pct = t.total > 0 ? Math.round((t.checkedIn / t.total) * 100) : 0;
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-white font-medium">{t.name}</span>
                <span className="text-sm tabular-nums">
                  <span className="text-gold-400 font-bold">{t.checkedIn}</span>
                  <span className="text-gray-500"> / {t.total}</span>
                </span>
              </div>
              <div className="w-full h-2 bg-pavilion-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold-500/60 rounded-full transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScanFeed({ scans }) {
  if (!scans || scans.length === 0) {
    return (
      <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/30 p-5 text-center">
        <DoorOpen className="w-8 h-8 text-gray-600 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">No scans yet</p>
      </div>
    );
  }

  return (
    <div className="bg-pavilion-800 rounded-xl border border-pavilion-600/30 overflow-hidden">
      <div className="px-5 py-3 border-b border-pavilion-600/30 flex items-center gap-2">
        <Activity className="w-4 h-4 text-gold-400" />
        <h3 className="text-sm font-medium text-gray-400">Live Scan Feed</h3>
      </div>
      <div className="divide-y divide-pavilion-700/50 max-h-96 overflow-y-auto">
        {scans.map((scan, i) => {
          const isValid = scan.result === 'valid';
          const isAlready = scan.result === 'already_used' || scan.result === 'alreadyUsed';
          const time = scan.scannedAt
            ? new Date(scan.scannedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '';

          return (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              {isValid ? (
                <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
              ) : isAlready ? (
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">
                  {scan.customerName || scan.holderName || 'Unknown'}
                </p>
                <p className="text-xs text-gray-500">
                  {scan.ticketType || 'Ticket'} · {scan.orderRef || scan.code}
                </p>
              </div>
              <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">{time}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LiveDoorPage() {
  const { eventId } = useParams();
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(eventId || '');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Load events list
  useEffect(() => {
    fetchEvents({ all: true })
      .then((data) => {
        const list = Array.isArray(data) ? data : data.events || [];
        setEvents(list);
        if (!selectedEvent && list.length > 0) {
          // Pick the nearest upcoming or most recent event
          const now = new Date();
          const upcoming = list
            .filter((e) => e.date && new Date(e.date) >= new Date(now - 24 * 60 * 60 * 1000))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
          if (upcoming.length > 0) setSelectedEvent(String(upcoming[0].id));
          else setSelectedEvent(String(list[0].id));
        }
      })
      .catch(() => {});
  }, []);

  const loadStats = useCallback(() => {
    if (!selectedEvent) return;
    fetchDoorStats(selectedEvent)
      .then((data) => {
        setStats(data);
        setLastUpdate(new Date());
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedEvent]);

  // Initial load + auto-refresh
  useEffect(() => {
    loadStats();
    if (!autoRefresh) return;

    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [loadStats, autoRefresh]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Link to="/admin" className="text-gray-500 hover:text-gray-300 text-sm flex items-center gap-1 mb-1">
            <ArrowLeft className="w-3 h-3" /> Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DoorOpen className="w-6 h-6 text-gold-400" />
            Live Door
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Event picker */}
          <select
            value={selectedEvent}
            onChange={(e) => { setSelectedEvent(e.target.value); setLoading(true); }}
            className="px-3 py-2 bg-pavilion-800 border border-pavilion-600/50 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              autoRefresh
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-pavilion-800 text-gray-400 border border-pavilion-600/50 hover:text-white'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} style={autoRefresh ? { animationDuration: '3s' } : {}} />
            <span className="hidden sm:inline">{autoRefresh ? 'Live' : 'Paused'}</span>
          </button>
        </div>
      </div>

      {loading && !stats ? (
        <div className="text-center py-20">
          <RefreshCw className="w-8 h-8 text-gold-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-400">Loading door stats...</p>
        </div>
      ) : stats ? (
        <div className="space-y-5">
          {/* Event title */}
          {stats.event && (
            <div className="text-center">
              <h2 className="text-lg font-bold text-white">{stats.event.title}</h2>
              {stats.event.dateTime && (
                <p className="text-sm text-gray-500 mt-1">
                  {new Date(stats.event.dateTime).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {' · '}
                  {new Date(stats.event.dateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          )}

          {/* Big stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={Users}
              label="Tickets Sold"
              value={stats.totalTickets}
              color="blue"
            />
            <StatCard
              icon={UserCheck}
              label="Checked In"
              value={stats.checkedIn}
              color="green"
            />
            <StatCard
              icon={Clock}
              label="Remaining"
              value={stats.remaining}
              sub={stats.remaining === 0 ? "Everyone's in! 🎉" : null}
              color="gold"
            />
            <StatCard
              icon={PoundSterling}
              label="Revenue"
              value={`£${((stats.totalRevenue || 0) / 100).toFixed(0)}`}
              sub={`${stats.totalOrders || 0} orders`}
              color="purple"
            />
          </div>

          {/* Progress bar */}
          <ProgressBar
            percentage={stats.percentage}
            checkedIn={stats.checkedIn}
            total={stats.totalTickets}
          />

          {/* Two columns on desktop */}
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Ticket type breakdown */}
            <TypeBreakdown types={stats.byType} />

            {/* Recent scans */}
            <ScanFeed scans={stats.recentScans} />
          </div>

          {/* Last update */}
          {lastUpdate && (
            <p className="text-center text-xs text-gray-600">
              Last updated: {lastUpdate.toLocaleTimeString('en-GB')}
              {autoRefresh && ' · refreshing every 5s'}
            </p>
          )}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-500">Select an event to view door stats</p>
        </div>
      )}
    </div>
  );
}
