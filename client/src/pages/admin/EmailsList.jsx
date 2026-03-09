import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || '';

function StatusBadge({ status }) {
  const colors = {
    queued: 'bg-yellow-500/20 text-yellow-400',
    sent: 'bg-green-500/20 text-green-400',
    resent: 'bg-blue-500/20 text-blue-400',
    failed: 'bg-red-500/20 text-red-400',
    bounced: 'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-500/20 text-gray-400'}`}>
      {status}
    </span>
  );
}

export default function EmailsList() {
  const [emails, setEmails] = useState([]);
  const [stats, setStats] = useState({});
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('');
  const [events, setEvents] = useState([]);
  const [resending, setResending] = useState(null);

  const token = localStorage.getItem('admin_token');

  useEffect(() => {
    fetch(`${API}/api/events`)
      .then(r => r.json())
      .then(data => setEvents(Array.isArray(data) ? data : data.events || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchEmails();
  }, [eventFilter, pagination.page]);

  async function fetchEmails() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pagination.page, limit: 50 });
      if (eventFilter) params.set('eventId', eventFilter);
      const res = await fetch(`${API}/api/admin/emails?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setEmails(data.emails || []);
      setStats(data.stats || {});
      setPagination(data.pagination || { page: 1, pages: 1 });
    } catch (err) {
      console.error('Failed to fetch emails:', err);
    }
    setLoading(false);
  }

  async function handleResend(id) {
    if (!confirm('Resend this email?')) return;
    setResending(id);
    try {
      const res = await fetch(`${API}/api/admin/emails/${id}/resend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchEmails();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to resend');
      }
    } catch (err) {
      alert('Failed to resend email');
    }
    setResending(null);
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d + 'Z').toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Email Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Sent</p>
          <p className="text-2xl font-bold text-white mt-1">{stats.sent || 0}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Failed</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{stats.failed || 0}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Opened</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{stats.opened || 0}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Open Rate</p>
          <p className="text-2xl font-bold text-[#D4A843] mt-1">{stats.open_rate || 0}%</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Click Rate</p>
          <p className="text-2xl font-bold text-[#D4A843] mt-1">{stats.click_rate || 0}%</p>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select
          value={eventFilter}
          onChange={e => { setEventFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
          className="bg-[#12122a] text-white border border-gray-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Events</option>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>{ev.title}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#1a1a2e] rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
              <th className="text-left p-3">Recipient</th>
              <th className="text-left p-3">Event</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Sent</th>
              <th className="text-center p-3">Opened</th>
              <th className="text-center p-3">Clicked</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="text-center p-8 text-gray-500">Loading...</td></tr>
            ) : emails.length === 0 ? (
              <tr><td colSpan="7" className="text-center p-8 text-gray-500">No emails sent yet</td></tr>
            ) : emails.map(em => (
              <tr key={em.id} className="border-b border-gray-800/50 hover:bg-[#12122a]">
                <td className="p-3">
                  <p className="text-white">{em.recipient}</p>
                  <p className="text-gray-500 text-xs">{em.order_ref}</p>
                </td>
                <td className="p-3 text-gray-400">{em.event_title || '—'}</td>
                <td className="p-3"><StatusBadge status={em.status} /></td>
                <td className="p-3 text-gray-400">{formatDate(em.sent_at || em.created_at)}</td>
                <td className="p-3 text-center">
                  {em.opened_count > 0 ? (
                    <span className="text-green-400">✓ {em.opened_count}×</span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="p-3 text-center">
                  {em.clicked_count > 0 ? (
                    <span className="text-blue-400">✓ {em.clicked_count}×</span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  {(em.status === 'failed' || em.status === 'bounced') && (
                    <button
                      onClick={() => handleResend(em.id)}
                      disabled={resending === em.id}
                      className="px-3 py-1 bg-[#D4A843] text-[#1a1a2e] rounded text-xs font-medium hover:bg-[#c49a3a] disabled:opacity-50"
                    >
                      {resending === em.id ? 'Sending...' : 'Resend'}
                    </button>
                  )}
                  {em.error && (
                    <p className="text-red-400 text-xs mt-1 max-w-[200px] truncate" title={em.error}>{em.error}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
            disabled={pagination.page <= 1}
            className="px-3 py-1 bg-[#12122a] text-gray-400 rounded disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="px-3 py-1 text-gray-500">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            onClick={() => setPagination(p => ({ ...p, page: Math.min(p.pages, p.page + 1) }))}
            disabled={pagination.page >= pagination.pages}
            className="px-3 py-1 bg-[#12122a] text-gray-400 rounded disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
