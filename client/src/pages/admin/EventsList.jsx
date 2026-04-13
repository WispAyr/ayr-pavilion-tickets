import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Loader2,
  AlertCircle,
  Calendar,
  Edit,
  Trash2,
  Search,
  BarChart3,
  Printer,
  Archive,
  FileCheck,
  CheckCircle,
} from 'lucide-react';
import { fetchEvents, deleteEvent } from '../../lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getHeaders() {
  const token = localStorage.getItem('admin_token');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
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
    'on-sale': 'bg-green-500/20 text-green-400 border-green-500/30',
    'sold-out': 'bg-red-500/20 text-red-400 border-red-500/30',
    draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    'sale-ended': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };
  const labels = {
    'on-sale': 'On Sale',
    'sold-out': 'Sold Out',
    draft: 'Draft',
    cancelled: 'Cancelled',
    'sale-ended': 'Sale Ended',
  };

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full border ${styles[status] || styles.draft}`}>
      {labels[status] || status}
    </span>
  );
}

export default function EventsList() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [timeView, setTimeView] = useState('upcoming');
  const [retiring, setRetiring] = useState(false);
  const [closing, setClosing] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadEvents();
  }, []);

  function loadEvents() {
    setLoading(true);
    fetchEvents({ all: true })
      .then((data) => {
        const list = Array.isArray(data) ? data : data.events || [];
        setEvents(list);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this event?')) return;
    setDeleting(id);
    try {
      await deleteEvent(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleting(null);
    }
  }

  async function handleRetirePast() {
    if (!confirm('Retire all past events still showing as on-sale or sold-out?')) return;
    setRetiring(true);
    try {
      const res = await fetch(`${API_BASE}/admin/events/retire-past`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to retire events');
      loadEvents();
    } catch (err) {
      alert('Retire failed: ' + err.message);
    } finally {
      setRetiring(false);
    }
  }

  async function handleCloseEvent(id) {
    setClosing(id);
    try {
      const res = await fetch(`${API_BASE}/admin/events/${id}/close-event`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to close event');
      setToast('Report sent!');
      setTimeout(() => setToast(null), 3000);
      loadEvents();
    } catch (err) {
      alert('Close failed: ' + err.message);
    } finally {
      setClosing(null);
    }
  }

  function isPastEvent(event) {
    const eventDate = new Date(event.date || event.dateTime);
    const now = new Date();
    return eventDate < now || event.status === 'completed';
  }

  const pastEventsStillActive = events.filter(
    (e) => isPastEvent(e) && (e.status === 'on-sale' || e.status === 'sold-out')
  );

  const statuses = ['all', ...new Set(events.map((e) => e.status).filter(Boolean))];

  const filtered = events.filter((e) => {
    if (filter !== 'all' && e.status !== filter) return false;
    if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
    const past = isPastEvent(e);
    if (timeView === 'upcoming' && past) return false;
    if (timeView === 'past' && !past) return false;
    return true;
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Events</h1>
        <Link
          to="/admin/events/new"
          className="flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-semibold rounded-lg transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          Create Event
        </Link>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm animate-fade-in">
          <CheckCircle className="w-4 h-4" />
          {toast}
        </div>
      )}

      {/* Past / Upcoming toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-pavilion-800 border border-pavilion-600/50 rounded-lg p-1">
          {['upcoming', 'past'].map((v) => (
            <button
              key={v}
              onClick={() => setTimeView(v)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                timeView === v
                  ? 'bg-gold-500 text-pavilion-900'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {timeView === 'upcoming' && pastEventsStillActive.length > 0 && (
          <button
            onClick={handleRetirePast}
            disabled={retiring}
            className="flex items-center gap-2 px-3 py-2 bg-pavilion-700 border border-pavilion-600/50 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-pavilion-600 transition-all disabled:opacity-50"
          >
            {retiring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
            Retire Past Events ({pastEventsStillActive.length})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events..."
            className="w-full pl-10 pr-4 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap capitalize ${
                filter === s
                  ? 'bg-gold-500 text-pavilion-900'
                  : 'bg-pavilion-800 text-gray-400 hover:text-white border border-pavilion-600/50'
              }`}
            >
              {s === 'all' ? 'All' : s.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Combined Report buttons for multi-session event groups (past view only) */}
      {timeView === 'past' && (() => {
        const groups = {};
        for (const e of filtered) {
          const dash = e.title.indexOf(' \u2014 ');
          const prefix = dash > -1 ? e.title.substring(0, dash) : null;
          if (prefix) {
            if (!groups[prefix]) groups[prefix] = [];
            groups[prefix].push(e);
          }
        }
        const multiGroups = Object.entries(groups).filter(([, evts]) => evts.length > 1);
        if (multiGroups.length === 0) return null;
        return (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Combined Reports</h3>
            <div className="flex flex-wrap gap-2">
              {multiGroups.map(([name, evts]) => {
                const ids = evts.map(e => e.id).join(',');
                return (
                  <Link key={name} to={`/admin/event-report/combined?ids=${ids}`} target="_blank"
                    className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/10 border border-purple-500/20 rounded-lg text-sm text-purple-400 hover:bg-purple-500/20 transition-all">
                    <Printer className="w-3.5 h-3.5" />
                    {name} ({evts.length} sessions)
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Events list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 text-pavilion-600 mx-auto mb-3" />
          <p className="text-gray-500">No events found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((event) => (
            <div
              key={event.id}
              className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-semibold text-white truncate">{event.title}</h3>
                  <StatusBadge status={event.status} />
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span>{formatDate(event.date || event.dateTime)}</span>
                  {event.venue && <span>{event.venue}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  to={`/admin/events/${event.id}/ops`}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gold-500/10 border border-gold-500/20 rounded-lg text-sm text-gold-400 hover:bg-gold-500/20 transition-all"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Ops
                </Link>
                
                <Link
                  to={`/admin/event-report/${event.id}`}
                  target="_blank"
                  className="flex items-center gap-1.5 px-3 py-2 bg-pavilion-700 border border-pavilion-600/50 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-pavilion-600 transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Report
                </Link>
                {isPastEvent(event) && event.status !== 'completed' && (
                  <button
                    onClick={() => handleCloseEvent(event.id)}
                    disabled={closing === event.id}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-50"
                  >
                    {closing === event.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileCheck className="w-3.5 h-3.5" />
                    )}
                    Close & Report
                  </button>
                )}
                <Link
                  to={`/admin/events/${event.id}/edit`}
                  className="flex items-center gap-1.5 px-3 py-2 bg-pavilion-700 border border-pavilion-600/50 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-pavilion-600 transition-all"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(event.id)}
                  disabled={deleting === event.id}
                  className="flex items-center gap-1.5 px-3 py-2 bg-pavilion-700 border border-red-500/20 rounded-lg text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all disabled:opacity-50"
                >
                  {deleting === event.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
