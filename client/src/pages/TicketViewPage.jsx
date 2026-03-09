import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  Clock,
  Ticket,
  Loader2,
  AlertCircle,
  Printer,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { fetchTicket } from '../lib/api';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function googleCalendarUrl(event) {
  if (!event) return '#';
  const start = new Date(event.date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(new Date(event.date).getTime() + 3 * 60 * 60 * 1000)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title || '',
    dates: `${start}/${end}`,
    location: event.venue || '',
    details: `Ticket for ${event.title} at ${event.venue || 'Ayr Pavilion'}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function StatusBadge({ status }) {
  if (status === 'valid') {
    return (
      <div className="flex items-center gap-2 text-green-400">
        <CheckCircle2 className="w-5 h-5" />
        <span className="font-semibold uppercase tracking-wider text-sm">Valid</span>
      </div>
    );
  }
  if (status === 'used') {
    return (
      <div className="flex items-center gap-2 text-amber-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="font-semibold uppercase tracking-wider text-sm">Used</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-red-400">
      <XCircle className="w-5 h-5" />
      <span className="font-semibold uppercase tracking-wider text-sm">
        {status === 'cancelled' ? 'Cancelled' : status || 'Invalid'}
      </span>
    </div>
  );
}

export default function TicketViewPage() {
  const { code } = useParams();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchTicket(code)
      .then((data) => {
        setTicket(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen pt-16">
        <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen pt-16 px-4">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Ticket not found</h2>
        <p className="text-gray-400 mb-6">{error || 'This ticket does not exist or the link is invalid.'}</p>
        <Link to="/events" className="text-gold-400 hover:text-gold-500 transition-colors">
          Browse events
        </Link>
      </div>
    );
  }

  const event = ticket.event || {};

  return (
    <div className="animate-fade-in min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-md mx-auto">
        {/* Ticket card */}
        <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="bg-gradient-to-r from-gold-600 via-gold-500 to-gold-400 p-5 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Ticket className="w-5 h-5 text-pavilion-900" />
              <span className="text-pavilion-900 font-bold text-sm tracking-widest uppercase">Ayr Pavilion</span>
            </div>
            <h1 className="text-xl font-black text-pavilion-900 leading-tight">
              {event.title || 'Event Ticket'}
            </h1>
          </div>

          {/* Event details */}
          <div className="p-6 space-y-4">
            <div className="space-y-2 text-sm text-gray-300">
              {event.date && (
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-gold-500 flex-shrink-0" />
                  <span>{formatDate(event.date)}</span>
                </div>
              )}
              {event.date && (
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-gold-500 flex-shrink-0" />
                  <span>{formatTime(event.date)}</span>
                  {event.doorsOpen && (
                    <span className="text-gray-500">(Doors {formatTime(event.doorsOpen)})</span>
                  )}
                </div>
              )}
              {event.venue && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-gold-500 flex-shrink-0" />
                  <span>{event.venue}</span>
                </div>
              )}
            </div>

            {/* Ticket type and holder */}
            <div className="border-t border-pavilion-600/50 pt-4 space-y-2">
              {ticket.ticketType && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Ticket Type</span>
                  <span className="text-white font-medium">{ticket.ticketType.name || ticket.ticketType}</span>
                </div>
              )}
              {ticket.holderName && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Name</span>
                  <span className="text-white font-medium">{ticket.holderName}</span>
                </div>
              )}
              {ticket.holderEmail && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Email</span>
                  <span className="text-white font-medium">{ticket.holderEmail}</span>
                </div>
              )}
            </div>

            {/* QR Code */}
            <div className="border-t border-pavilion-600/50 pt-6 text-center">
              <div className="inline-block bg-white rounded-xl p-4">
                <img
                  src={`/api/tickets/${code}/qr`}
                  alt="Ticket QR Code"
                  className="w-48 h-48 sm:w-56 sm:h-56"
                />
              </div>
              <p className="mt-3 font-mono text-xs text-gray-500 break-all tracking-wider">
                {code}
              </p>
            </div>

            {/* Status */}
            <div className="border-t border-pavilion-600/50 pt-4 flex justify-center">
              <StatusBadge status={ticket.status} />
            </div>

            {ticket.status === 'used' && ticket.scannedAt && (
              <p className="text-center text-xs text-gray-500">
                Scanned at {new Date(ticket.scannedAt).toLocaleString('en-GB')}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-3 no-print">
          {event.date && (
            <a
              href={googleCalendarUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-pavilion-800 border border-pavilion-600/50 rounded-xl text-gray-300 hover:text-white hover:bg-pavilion-700 transition-all text-sm"
            >
              <Calendar className="w-4 h-4" />
              Add to Google Calendar
            </a>
          )}

          {event.venue && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue + ', Ayr, Scotland')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-pavilion-800 border border-pavilion-600/50 rounded-xl text-gray-300 hover:text-white hover:bg-pavilion-700 transition-all text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Get Directions
            </a>
          )}

          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 w-full py-3 bg-pavilion-800 border border-pavilion-600/50 rounded-xl text-gray-300 hover:text-white hover:bg-pavilion-700 transition-all text-sm"
          >
            <Printer className="w-4 h-4" />
            Print Ticket
          </button>
        </div>
      </div>
    </div>
  );
}
