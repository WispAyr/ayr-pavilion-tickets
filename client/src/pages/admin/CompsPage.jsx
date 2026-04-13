import { useState, useEffect } from 'react';
import {
  Loader2,
  AlertCircle,
  Gift,
  Plus,
  Copy,
  Check,
  X,
  ExternalLink,
  Send,
  RotateCcw,
} from 'lucide-react';
import { fetchCompCodes, createCompCode, updateCompCode, deleteCompCode, fetchEvents, sendCompInvite, resetCompCode } from '../../lib/api';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function CompsPage() {
  const [comps, setComps] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const [sendingInvite, setSendingInvite] = useState(null);

  const [form, setForm] = useState({
    event_id: '',
    max_tickets: 4,
    recipient_name: '',
    recipient_email: '',
    notes: '',
    send_invite: true,
  });

  useEffect(() => {
    Promise.all([
      fetchCompCodes(),
      fetchEvents({ all: true }),
    ]).then(([compData, eventData]) => {
      setComps(compData);
      const evList = Array.isArray(eventData) ? eventData : eventData?.events || [];
      setEvents(evList);
    }).catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function reload() {
    fetchCompCodes().then(setComps).catch(() => {});
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.event_id) return;
    setCreating(true);
    try {
      await createCompCode(form);
      setShowCreate(false);
      setForm({ event_id: '', max_tickets: 4, recipient_name: '', recipient_email: '', notes: '', send_invite: true });
      reload();
    } catch (err) {
      alert(err.message || 'Failed to create comp code');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeactivate(id) {
    if (!confirm('Deactivate this comp code?')) return;
    try {
      await deleteCompCode(id);
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleReset(comp) {
    if (!confirm(`Reset usage for ${comp.code}? This sets used tickets back to 0.`)) return;
    try {
      await resetCompCode(comp.id);
      reload();
    } catch (err) {
      alert(err.message || 'Failed to reset');
    }
  }

  async function handleSendInvite(comp) {
    const email = comp.recipientEmail || prompt('Enter email address to send invite to:');
    if (!email) return;
    setSendingInvite(comp.id);
    try {
      await sendCompInvite(comp.id, email);
      alert(`Invite sent to ${email}`);
    } catch (err) {
      alert(err.message || 'Failed to send invite');
    } finally {
      setSendingInvite(null);
    }
  }

  function compUrl(comp) {
    const base = window.location.origin;
    return `${base}/events/${comp.eventSlug}?comp=${comp.code}`;
  }

  function copyLink(comp) {
    navigator.clipboard.writeText(compUrl(comp)).then(() => {
      setCopiedId(comp.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-gold-400 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Gift className="w-6 h-6 text-gold-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Complimentary Tickets</h1>
            <p className="text-sm text-gray-500">Create comp codes for free ticket access</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-semibold rounded-lg text-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          New Comp
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-6 mb-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Create Comp Code</h3>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Event *</label>
            <select
              value={form.event_id}
              onChange={(e) => setForm(f => ({ ...f, event_id: e.target.value ? parseInt(e.target.value) : '' }))}
              required
              className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none"
            >
              <option value="">Select event...</option>
              {events.filter(e => e.status === 'on-sale' || e.status === 'sold-out').map(ev => (
                <option key={ev.id} value={ev.id}>{ev.title} — {formatDate(ev.date)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Tickets</label>
              <input
                type="number"
                min="1"
                max="50"
                value={form.max_tickets}
                onChange={(e) => setForm(f => ({ ...f, max_tickets: parseInt(e.target.value) || 1 }))}
                className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Recipient Name</label>
              <input
                type="text"
                placeholder="Optional"
                value={form.recipient_name}
                onChange={(e) => setForm(f => ({ ...f, recipient_name: e.target.value }))}
                className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 text-sm focus:border-gold-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Recipient Email</label>
            <input
              type="email"
              placeholder="Optional"
              value={form.recipient_email}
              onChange={(e) => setForm(f => ({ ...f, recipient_email: e.target.value }))}
              className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 text-sm focus:border-gold-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Notes</label>
            <input
              type="text"
              placeholder="e.g. VIP, press, staff"
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 text-sm focus:border-gold-500 focus:outline-none"
            />
          </div>

          {form.recipient_email && (
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.send_invite}
                onChange={(e) => setForm(f => ({ ...f, send_invite: e.target.checked }))}
                className="w-4 h-4 rounded border-pavilion-600 bg-pavilion-700 text-purple-500 focus:ring-purple-500/50"
              />
              <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                Send VIP invite email with claim instructions
              </span>
            </label>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={creating || !form.event_id}
              className="px-6 py-2.5 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-semibold rounded-lg text-sm transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {creating && <Loader2 className="w-3 h-3 animate-spin" />}
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2.5 text-gray-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Comp codes list */}
      {comps.length === 0 && !loading && (
        <div className="text-center py-20">
          <Gift className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">No comp codes yet</p>
        </div>
      )}

      {comps.length > 0 && (
        <div className="space-y-3">
          {comps.map((comp) => {
            const remaining = comp.maxTickets - comp.usedTickets;
            const isActive = comp.active && remaining > 0;
            return (
              <div
                key={comp.id}
                className={`bg-pavilion-800 border rounded-xl p-5 ${isActive ? 'border-pavilion-600/50' : 'border-pavilion-600/30 opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-mono text-gold-400 font-semibold">{comp.code}</span>
                      {isActive ? (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 rounded-full">Active</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-gray-500/20 text-gray-400 border border-gray-500/30 rounded-full">
                          {!comp.active ? 'Deactivated' : 'Fully Used'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white">{comp.eventTitle}</p>
                    <p className="text-xs text-gray-500">{formatDate(comp.dateTime)}</p>
                    {comp.recipientName && <p className="text-xs text-gray-400 mt-1">For: {comp.recipientName}</p>}
                    {comp.notes && <p className="text-xs text-gray-500 mt-0.5">{comp.notes}</p>}
                    <p className="text-xs text-gray-500 mt-1">
                      {comp.usedTickets} / {comp.maxTickets} tickets used
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isActive && (
                      <>
                        <button
                          onClick={() => copyLink(comp)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-pavilion-700 hover:bg-pavilion-600 border border-pavilion-600/50 rounded-lg text-xs text-gray-300 hover:text-white transition-all"
                        >
                          {copiedId === comp.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                          {copiedId === comp.id ? 'Copied!' : 'Copy Link'}
                        </button>
                        <button
                          onClick={() => handleSendInvite(comp)}
                          disabled={sendingInvite === comp.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-xs text-purple-400 hover:text-purple-300 transition-all disabled:opacity-50"
                          title="Send invite email"
                        >
                          {sendingInvite === comp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Invite
                        </button>
                        <a
                          href={compUrl(comp)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-white transition-colors"
                          title="Open link"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </>
                    )}
                    {comp.active && comp.usedTickets > 0 && (
                      <button
                        onClick={() => handleReset(comp)}
                        className="p-1.5 text-gray-500 hover:text-amber-400 transition-colors"
                        title="Reset usage"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    {comp.active ? (
                      <button
                        onClick={() => handleDeactivate(comp.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                        title="Deactivate"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
