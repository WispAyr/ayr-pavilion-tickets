import { useState, useEffect } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import EventCard from '../components/EventCard';
import { fetchEvents } from '../lib/api';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

function filterEvents(events, filter) {
  if (filter === 'all') return events;

  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);

  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  return events.filter((e) => {
    const d = new Date(e.date);
    if (filter === 'week') return d >= now && d <= endOfWeek;
    if (filter === 'month') return d >= now && d <= endOfMonth;
    return true;
  });
}

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    fetchEvents({ upcoming: 'true' })
      .then((data) => {
        const list = Array.isArray(data) ? data : data.events || [];
        setEvents(list);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filterEvents(events, filter);

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <div className="relative bg-gradient-to-b from-pavilion-700/50 via-pavilion-900 to-pavilion-900 pt-28 pb-12">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gold-500/5 via-transparent to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            <span className="text-gold-400">UPCOMING</span>{' '}
            <span className="text-white">EVENTS</span>
          </h1>
          <p className="mt-3 text-gray-400 text-lg max-w-xl mx-auto">
            Live music, comedy, and entertainment at Ayr Pavilion
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filter tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                filter === f.key
                  ? 'bg-gold-500 text-pavilion-900'
                  : 'bg-pavilion-800 text-gray-300 hover:bg-pavilion-700 hover:text-white border border-pavilion-600/50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-24">
            <p className="text-red-400 mb-4">Failed to load events</p>
            <p className="text-gray-500 text-sm">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-24">
            <Calendar className="w-16 h-16 text-pavilion-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-300 mb-2">No events found</h2>
            <p className="text-gray-500">
              {filter !== 'all'
                ? 'Try a different time filter, or check back soon.'
                : 'Check back soon for upcoming events.'}
            </p>
          </div>
        )}

        {/* Events grid */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((event) => (
              <EventCard key={event.id || event.slug} event={event} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-16 pb-8 text-center text-xs text-gray-600">
        <a href="/terms" className="hover:text-gold-400 transition-colors">Terms & Conditions</a>
        <span className="mx-2">·</span>
        <span>Ayr Pavilion</span>
      </footer>
    </div>
  );
}
