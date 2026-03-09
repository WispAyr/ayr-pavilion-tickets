import { Link } from 'react-router-dom';
import { Calendar, MapPin } from 'lucide-react';

function formatEventDate(dateStr) {
  const date = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = days[date.getDay()];
  const d = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = date.getHours();
  const mins = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${day} ${d} ${month} ${year} \u2022 ${h}:${mins} ${ampm}`;
}

function formatPrice(pence) {
  if (pence == null) return '';
  return `\u00a3${(pence / 100).toFixed(2)}`;
}

function getStatusBadge(status) {
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
  return {
    className: styles[status] || styles.draft,
    label: labels[status] || status,
  };
}

export default function EventCard({ event }) {
  const lowestPrice = event.ticketTypes?.length
    ? Math.min(...event.ticketTypes.map((t) => t.price))
    : event.lowestPrice;

  const badge = getStatusBadge(event.status);

  return (
    <Link
      to={`/events/${event.slug}`}
      className="group block bg-pavilion-800 border border-pavilion-600/50 rounded-xl overflow-hidden hover:-translate-y-1 hover:shadow-2xl hover:shadow-gold-500/5 transition-all duration-200"
    >
      {/* Image / Gradient placeholder */}
      <div className="relative aspect-[16/9] overflow-hidden">
        {event.imageUrl ? (
          <img
            src={event.imageUrl}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-pavilion-700 via-pavilion-800 to-pavilion-900 flex items-center justify-center">
            <span className="text-4xl font-bold text-pavilion-600/50 tracking-widest">
              {event.title?.charAt(0) || 'E'}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-pavilion-900/80 to-transparent" />

        {/* Status badge */}
        <span className={`absolute top-3 right-3 px-2.5 py-0.5 text-xs font-semibold rounded-full border ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Details */}
      <div className="p-4 space-y-3">
        <h3 className="text-lg font-bold text-white group-hover:text-gold-400 transition-colors line-clamp-2">
          {event.title}
        </h3>

        <div className="space-y-1.5 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gold-500 flex-shrink-0" />
            <span>{formatEventDate(event.date)}</span>
          </div>
          {event.venue && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gold-500 flex-shrink-0" />
              <span>{event.venue}</span>
            </div>
          )}
        </div>

        {lowestPrice != null && (
          <div className="pt-2 border-t border-pavilion-600/30">
            <span className="text-gold-400 font-semibold">
              From {formatPrice(lowestPrice)}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
