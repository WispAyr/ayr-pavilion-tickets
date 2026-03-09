import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2,
  AlertCircle,
  Save,
  Plus,
  Trash2,
  ChevronLeft,
} from 'lucide-react';
import {
  fetchEvent,
  createEvent,
  updateEvent,
  fetchTicketTypes,
  createTicketType,
  updateTicketType,
  deleteTicketType,
} from '../../lib/api';

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function toLocalDatetime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

const emptyTicketType = () => ({
  _key: Math.random().toString(36).slice(2),
  id: null,
  name: '',
  price: '',
  quantity: '',
  description: '',
  saleStart: '',
  saleEnd: '',
});

export default function EventForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    title: '',
    slug: '',
    date: '',
    doorsOpen: '',
    venue: 'Ayr Pavilion',
    description: '',
    capacity: '',
    status: 'draft',
    ageRestriction: '',
    imageUrl: '',
  });

  const [ticketTypes, setTicketTypes] = useState([emptyTicketType()]);
  const [slugManual, setSlugManual] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);

    Promise.all([
      fetchEvent(id).catch(() => null),
      fetchTicketTypes(id).catch(() => []),
    ])
      .then(([ev, ttData]) => {
        if (ev) {
          setForm({
            title: ev.title || '',
            slug: ev.slug || '',
            date: toLocalDatetime(ev.date || ev.dateTime),
            doorsOpen: toLocalDatetime(ev.doorsOpen),
            venue: ev.venue || '',
            description: ev.description || '',
            capacity: ev.capacity || '',
            status: ev.status || 'draft',
            ageRestriction: ev.ageRestriction || '',
            imageUrl: ev.imageUrl || ev.heroImage || '',
          });
          setSlugManual(true);
        }

        const types = Array.isArray(ttData) ? ttData : ttData?.ticketTypes || [];
        if (types.length > 0) {
          setTicketTypes(
            types.map((tt) => ({
              _key: tt.id || Math.random().toString(36).slice(2),
              id: tt.id,
              name: tt.name || '',
              price: tt.price != null ? (tt.price / 100).toFixed(2) : '',
              quantity: tt.quantity || '',
              description: tt.description || '',
              saleStart: toLocalDatetime(tt.saleStart),
              saleEnd: toLocalDatetime(tt.saleEnd),
            }))
          );
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function handleFieldChange(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'title' && !slugManual) {
        next.slug = slugify(value);
      }
      return next;
    });
  }

  function handleTicketChange(index, field, value) {
    setTicketTypes((prev) =>
      prev.map((tt, i) => (i === index ? { ...tt, [field]: value } : tt))
    );
  }

  function addTicketType() {
    setTicketTypes((prev) => [...prev, emptyTicketType()]);
  }

  function removeTicketType(index) {
    setTicketTypes((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const eventData = {
        title: form.title,
        slug: form.slug,
        date_time: form.date ? new Date(form.date).toISOString() : null,
        doors_open: form.doorsOpen ? new Date(form.doorsOpen).toISOString() : null,
        venue: form.venue,
        description: form.description,
        hero_image: form.imageUrl,
        capacity: form.capacity ? parseInt(form.capacity, 10) : null,
        status: form.status,
        age_restriction: form.ageRestriction,
      };

      let eventId = id;

      if (isEdit) {
        await updateEvent(id, eventData);
      } else {
        const result = await createEvent(eventData);
        eventId = result.event?.id || result.id;
      }

      // Save ticket types
      for (const tt of ticketTypes) {
        if (!tt.name || !tt.price || !tt.quantity) continue;

        const ttData = {
          name: tt.name,
          price: Math.round(parseFloat(tt.price) * 100),
          quantity: parseInt(tt.quantity, 10),
          description: tt.description || '',
          sale_start: tt.saleStart ? new Date(tt.saleStart).toISOString() : null,
          sale_end: tt.saleEnd ? new Date(tt.saleEnd).toISOString() : null,
        };

        if (tt.id) {
          await updateTicketType(tt.id, ttData);
        } else {
          await createTicketType(eventId, ttData);
        }
      }

      navigate('/admin/events');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-3xl">
      <button
        onClick={() => navigate('/admin/events')}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors mb-6"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Events
      </button>

      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Event' : 'Create Event'}</h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Event details */}
        <section className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold mb-2">Event Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Title</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
              placeholder="Event title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Slug</label>
            <input
              type="text"
              required
              value={form.slug}
              onChange={(e) => {
                setSlugManual(true);
                handleFieldChange('slug', e.target.value);
              }}
              className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm font-mono"
              placeholder="event-slug"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Date & Time</label>
              <input
                type="datetime-local"
                required
                value={form.date}
                onChange={(e) => handleFieldChange('date', e.target.value)}
                className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white focus:border-gold-500 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Doors Open</label>
              <input
                type="datetime-local"
                value={form.doorsOpen}
                onChange={(e) => handleFieldChange('doorsOpen', e.target.value)}
                className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white focus:border-gold-500 focus:outline-none text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Venue</label>
              <input
                type="text"
                value={form.venue}
                onChange={(e) => handleFieldChange('venue', e.target.value)}
                className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
                placeholder="Venue name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Capacity</label>
              <input
                type="number"
                value={form.capacity}
                onChange={(e) => handleFieldChange('capacity', e.target.value)}
                className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
                placeholder="0"
                min="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              rows={5}
              className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm resize-y"
              placeholder="Event description..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => handleFieldChange('status', e.target.value)}
                className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white focus:border-gold-500 focus:outline-none text-sm"
              >
                <option value="draft">Draft</option>
                <option value="on-sale">On Sale</option>
                <option value="sold-out">Sold Out</option>
                <option value="sale-ended">Sale Ended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Age Restriction</label>
              <input
                type="text"
                value={form.ageRestriction}
                onChange={(e) => handleFieldChange('ageRestriction', e.target.value)}
                className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
                placeholder="e.g. 18+"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Image URL</label>
              <input
                type="url"
                value={form.imageUrl}
                onChange={(e) => handleFieldChange('imageUrl', e.target.value)}
                className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
                placeholder="https://..."
              />
            </div>
          </div>
        </section>

        {/* Ticket types */}
        <section className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Ticket Types</h2>
            <button
              type="button"
              onClick={addTicketType}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-pavilion-700 border border-pavilion-600/50 rounded-lg text-gold-400 hover:bg-pavilion-600 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Type
            </button>
          </div>

          <div className="space-y-4">
            {ticketTypes.map((tt, index) => (
              <div
                key={tt._key}
                className="bg-pavilion-700/50 border border-pavilion-600/30 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-400">
                    Ticket Type {index + 1}
                  </span>
                  {ticketTypes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTicketType(index)}
                      className="p-1 text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Name</label>
                    <input
                      type="text"
                      value={tt.name}
                      onChange={(e) => handleTicketChange(index, 'name', e.target.value)}
                      className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-600 focus:border-gold-500 focus:outline-none text-sm"
                      placeholder="e.g. General Admission"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Price (GBP)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={tt.price}
                      onChange={(e) => handleTicketChange(index, 'price', e.target.value)}
                      className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-600 focus:border-gold-500 focus:outline-none text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Quantity</label>
                    <input
                      type="number"
                      min="0"
                      value={tt.quantity}
                      onChange={(e) => handleTicketChange(index, 'quantity', e.target.value)}
                      className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-600 focus:border-gold-500 focus:outline-none text-sm"
                      placeholder="100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Description</label>
                  <input
                    type="text"
                    value={tt.description}
                    onChange={(e) => handleTicketChange(index, 'description', e.target.value)}
                    className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-600 focus:border-gold-500 focus:outline-none text-sm"
                    placeholder="Optional description"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Sale Start</label>
                    <input
                      type="datetime-local"
                      value={tt.saleStart}
                      onChange={(e) => handleTicketChange(index, 'saleStart', e.target.value)}
                      className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white focus:border-gold-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Sale End</label>
                    <input
                      type="datetime-local"
                      value={tt.saleEnd}
                      onChange={(e) => handleTicketChange(index, 'saleEnd', e.target.value)}
                      className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white focus:border-gold-500 focus:outline-none text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold rounded-lg transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Save Changes' : 'Create Event'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/events')}
            className="px-6 py-3 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
