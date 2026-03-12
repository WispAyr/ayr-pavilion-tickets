import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2,
  AlertCircle,
  Save,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  fetchEvent,
  createEvent,
  updateEvent,
  fetchTicketTypes,
  createTicketType,
  updateTicketType,
  deleteTicketType,
  fetchAddons,
  createAddon,
  updateAddon,
  deleteAddon,
  fetchWaivers,
  fetchWaiverTemplates,
  createWaiver,
  updateWaiver,
  deleteWaiver,
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
  ageMin: '',
  ageMax: '',
  ageLabel: '',
});

const emptyAddon = () => ({
  _key: Math.random().toString(36).slice(2),
  id: null,
  name: '',
  description: '',
  price: '',
  type: 'select',
  maxQuantity: 1,
  required: false,
  perTicket: true,
  ticketTypeIds: [],
  options: [],
});

const emptyAddonOption = () => ({
  _key: Math.random().toString(36).slice(2),
  label: '',
  stock: '',
  priceOverride: '',
});

const emptyWaiver = () => ({
  _key: Math.random().toString(36).slice(2),
  id: null,
  name: '',
  type: 'checkbox',
  content: '',
  required: true,
  ticketTypeIds: [],
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
  const [addons, setAddons] = useState([]);
  const [waivers, setWaivers] = useState([]);
  const [waiverTemplates, setWaiverTemplates] = useState([]);
  const [slugManual, setSlugManual] = useState(false);

  // Collapsible sections
  const [expandedAddon, setExpandedAddon] = useState(null);
  const [expandedWaiver, setExpandedWaiver] = useState(null);

  useEffect(() => {
    // Load waiver templates
    fetchWaiverTemplates().then(setWaiverTemplates).catch(() => {});

    if (!isEdit) return;
    setLoading(true);

    Promise.all([
      fetchEvent(id).catch(() => null),
      fetchTicketTypes(id).catch(() => []),
      fetchAddons(id).catch(() => []),
      fetchWaivers(id).catch(() => []),
    ])
      .then(([ev, ttData, addonData, waiverData]) => {
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
              ageMin: tt.ageMin || '',
              ageMax: tt.ageMax || '',
              ageLabel: tt.ageLabel || '',
            }))
          );
        }

        if (Array.isArray(addonData) && addonData.length > 0) {
          setAddons(addonData.map(a => ({
            _key: a.id || Math.random().toString(36).slice(2),
            id: a.id,
            name: a.name || '',
            description: a.description || '',
            price: a.price != null ? (a.price / 100).toFixed(2) : '',
            type: a.type || 'select',
            maxQuantity: a.maxQuantity || 1,
            required: !!a.required,
            perTicket: a.perTicket !== undefined ? !!a.perTicket : true,
            ticketTypeIds: a.ticketTypeIds || [],
            options: (a.options || []).map(o => ({
              _key: o.id || Math.random().toString(36).slice(2),
              id: o.id,
              label: o.label || '',
              stock: o.stock || '',
              priceOverride: o.priceOverride != null ? (o.priceOverride / 100).toFixed(2) : '',
            })),
          })));
        }

        if (Array.isArray(waiverData) && waiverData.length > 0) {
          setWaivers(waiverData.map(w => ({
            _key: w.id || Math.random().toString(36).slice(2),
            id: w.id,
            name: w.name || '',
            type: w.type || 'checkbox',
            content: w.content || '',
            required: w.required !== undefined ? !!w.required : true,
            ticketTypeIds: w.ticketTypeIds || [],
          })));
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

  // Addon handlers
  function handleAddonChange(index, field, value) {
    setAddons(prev => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  }

  function addAddonFn() {
    const newAddon = emptyAddon();
    setAddons(prev => [...prev, newAddon]);
    setExpandedAddon(addons.length);
  }

  function removeAddonFn(index) {
    setAddons(prev => prev.filter((_, i) => i !== index));
  }

  function handleAddonOptionChange(addonIndex, optIndex, field, value) {
    setAddons(prev => prev.map((a, i) => {
      if (i !== addonIndex) return a;
      const options = a.options.map((o, j) => (j === optIndex ? { ...o, [field]: value } : o));
      return { ...a, options };
    }));
  }

  function addAddonOption(addonIndex) {
    setAddons(prev => prev.map((a, i) => {
      if (i !== addonIndex) return a;
      return { ...a, options: [...a.options, emptyAddonOption()] };
    }));
  }

  function removeAddonOption(addonIndex, optIndex) {
    setAddons(prev => prev.map((a, i) => {
      if (i !== addonIndex) return a;
      return { ...a, options: a.options.filter((_, j) => j !== optIndex) };
    }));
  }

  // Waiver handlers
  function handleWaiverChange(index, field, value) {
    setWaivers(prev => prev.map((w, i) => (i === index ? { ...w, [field]: value } : w)));
  }

  function addWaiverFn() {
    const newWaiver = emptyWaiver();
    setWaivers(prev => [...prev, newWaiver]);
    setExpandedWaiver(waivers.length);
  }

  function removeWaiverFn(index) {
    setWaivers(prev => prev.filter((_, i) => i !== index));
  }

  function loadWaiverTemplate(index, templateIndex) {
    const tpl = waiverTemplates[templateIndex];
    if (!tpl) return;
    setWaivers(prev => prev.map((w, i) => (i === index ? { ...w, name: tpl.name, content: tpl.content } : w)));
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
          age_min: tt.ageMin ? parseInt(tt.ageMin, 10) : null,
          age_max: tt.ageMax ? parseInt(tt.ageMax, 10) : null,
          age_label: tt.ageLabel || null,
        };

        if (tt.id) {
          await updateTicketType(tt.id, ttData);
        } else {
          await createTicketType(eventId, ttData);
        }
      }

      // Save addons
      // Delete removed addons
      if (isEdit) {
        const existingAddons = await fetchAddons(eventId).catch(() => []);
        const currentIds = addons.filter(a => a.id).map(a => a.id);
        for (const existing of (existingAddons || [])) {
          if (!currentIds.includes(existing.id)) {
            await deleteAddon(existing.id);
          }
        }
      }

      for (const addon of addons) {
        if (!addon.name) continue;

        const addonData = {
          name: addon.name,
          description: addon.description || '',
          price: Math.round(parseFloat(addon.price || 0) * 100),
          type: addon.type,
          max_quantity: parseInt(addon.maxQuantity, 10) || 1,
          required: addon.required,
          per_ticket: addon.perTicket,
          ticket_type_ids: addon.ticketTypeIds || [],
          options: (addon.options || []).filter(o => o.label).map(o => ({
            label: o.label,
            stock: parseInt(o.stock, 10) || 0,
            price_override: o.priceOverride ? Math.round(parseFloat(o.priceOverride) * 100) : null,
          })),
        };

        if (addon.id) {
          await updateAddon(addon.id, addonData);
        } else {
          await createAddon(eventId, addonData);
        }
      }

      // Save waivers
      if (isEdit) {
        const existingWaivers = await fetchWaivers(eventId).catch(() => []);
        const currentIds = waivers.filter(w => w.id).map(w => w.id);
        for (const existing of (existingWaivers || [])) {
          if (!currentIds.includes(existing.id)) {
            await deleteWaiver(existing.id);
          }
        }
      }

      for (const waiver of waivers) {
        if (!waiver.name || !waiver.content) continue;

        const waiverData = {
          name: waiver.name,
          type: waiver.type,
          content: waiver.content,
          required: waiver.required,
          ticket_type_ids: waiver.ticketTypeIds || [],
        };

        if (waiver.id) {
          await updateWaiver(waiver.id, waiverData);
        } else {
          await createWaiver(eventId, waiverData);
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

                {/* Age Range */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Min Age</label>
                    <input
                      type="number"
                      min="0"
                      value={tt.ageMin}
                      onChange={(e) => handleTicketChange(index, 'ageMin', e.target.value)}
                      className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-600 focus:border-gold-500 focus:outline-none text-sm"
                      placeholder="e.g. 5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Max Age</label>
                    <input
                      type="number"
                      min="0"
                      value={tt.ageMax}
                      onChange={(e) => handleTicketChange(index, 'ageMax', e.target.value)}
                      className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-600 focus:border-gold-500 focus:outline-none text-sm"
                      placeholder="e.g. 12"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Age Label</label>
                    <input
                      type="text"
                      value={tt.ageLabel}
                      onChange={(e) => handleTicketChange(index, 'ageLabel', e.target.value)}
                      className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-600 focus:border-gold-500 focus:outline-none text-sm"
                      placeholder={tt.ageMin || tt.ageMax ? `Ages ${tt.ageMin || '0'}-${tt.ageMax || '∞'}` : 'Auto-generated'}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Addons */}
        <section className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Add-ons</h2>
            <button
              type="button"
              onClick={addAddonFn}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-pavilion-700 border border-pavilion-600/50 rounded-lg text-gold-400 hover:bg-pavilion-600 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Addon
            </button>
          </div>

          {addons.length === 0 ? (
            <p className="text-sm text-gray-500">No add-ons configured. Add-ons like skate hire, lockers, etc.</p>
          ) : (
            <div className="space-y-3">
              {addons.map((addon, index) => {
                const isExpanded = expandedAddon === index;
                return (
                  <div key={addon._key} className="bg-pavilion-700/50 border border-pavilion-600/30 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedAddon(isExpanded ? null : index)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-pavilion-700 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{addon.name || `Addon ${index + 1}`}</span>
                        <span className="text-xs text-gray-500 bg-pavilion-800 px-2 py-0.5 rounded">{addon.type}</span>
                        {addon.required && <span className="text-xs text-red-400">Required</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeAddonFn(index); }}
                          className="p-1 text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-pavilion-600/30">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Name</label>
                            <input
                              type="text"
                              value={addon.name}
                              onChange={(e) => handleAddonChange(index, 'name', e.target.value)}
                              className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-600 focus:border-gold-500 focus:outline-none text-sm"
                              placeholder="e.g. Skate Hire"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Base Price (GBP)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={addon.price}
                              onChange={(e) => handleAddonChange(index, 'price', e.target.value)}
                              className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-600 focus:border-gold-500 focus:outline-none text-sm"
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Description</label>
                          <input
                            type="text"
                            value={addon.description}
                            onChange={(e) => handleAddonChange(index, 'description', e.target.value)}
                            className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-600 focus:border-gold-500 focus:outline-none text-sm"
                            placeholder="Optional description"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Type</label>
                            <select
                              value={addon.type}
                              onChange={(e) => handleAddonChange(index, 'type', e.target.value)}
                              className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white focus:border-gold-500 focus:outline-none text-sm"
                            >
                              <option value="select">Select (dropdown)</option>
                              <option value="checkbox">Checkbox (yes/no)</option>
                              <option value="quantity">Quantity (number)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Max Qty</label>
                            <input
                              type="number"
                              min="1"
                              value={addon.maxQuantity}
                              onChange={(e) => handleAddonChange(index, 'maxQuantity', e.target.value)}
                              className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white focus:border-gold-500 focus:outline-none text-sm"
                            />
                          </div>
                          <div className="flex items-end gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={addon.required}
                                onChange={(e) => handleAddonChange(index, 'required', e.target.checked)}
                                className="rounded border-pavilion-600 bg-pavilion-700 text-gold-500"
                              />
                              <span className="text-xs text-gray-400">Required</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={addon.perTicket}
                                onChange={(e) => handleAddonChange(index, 'perTicket', e.target.checked)}
                                className="rounded border-pavilion-600 bg-pavilion-700 text-gold-500"
                              />
                              <span className="text-xs text-gray-400">Per ticket</span>
                            </label>
                          </div>
                        </div>

                        {/* Ticket type filter */}
                        {ticketTypes.filter(tt => tt.name).length > 0 && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Applies to ticket types (empty = all)</label>
                            <div className="flex flex-wrap gap-2">
                              {ticketTypes.filter(tt => tt.name && tt.id).map(tt => (
                                <label key={tt.id} className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={addon.ticketTypeIds.includes(tt.id)}
                                    onChange={(e) => {
                                      const ids = e.target.checked
                                        ? [...addon.ticketTypeIds, tt.id]
                                        : addon.ticketTypeIds.filter(x => x !== tt.id);
                                      handleAddonChange(index, 'ticketTypeIds', ids);
                                    }}
                                    className="rounded border-pavilion-600 bg-pavilion-700 text-gold-500"
                                  />
                                  <span className="text-xs text-gray-400">{tt.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Options (for select type) */}
                        {addon.type === 'select' && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="block text-xs text-gray-500">Options</label>
                              <button
                                type="button"
                                onClick={() => addAddonOption(index)}
                                className="text-xs text-gold-400 hover:text-gold-300 flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" /> Add Option
                              </button>
                            </div>
                            <div className="space-y-2">
                              {addon.options.map((opt, optIndex) => (
                                <div key={opt._key} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={opt.label}
                                    onChange={(e) => handleAddonOptionChange(index, optIndex, 'label', e.target.value)}
                                    className="flex-1 px-2 py-1.5 bg-pavilion-700 border border-pavilion-600 rounded text-white text-xs focus:border-gold-500 focus:outline-none"
                                    placeholder="Label (e.g. UK 8)"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    value={opt.stock}
                                    onChange={(e) => handleAddonOptionChange(index, optIndex, 'stock', e.target.value)}
                                    className="w-16 px-2 py-1.5 bg-pavilion-700 border border-pavilion-600 rounded text-white text-xs focus:border-gold-500 focus:outline-none"
                                    placeholder="Stock"
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={opt.priceOverride}
                                    onChange={(e) => handleAddonOptionChange(index, optIndex, 'priceOverride', e.target.value)}
                                    className="w-20 px-2 py-1.5 bg-pavilion-700 border border-pavilion-600 rounded text-white text-xs focus:border-gold-500 focus:outline-none"
                                    placeholder="Price £"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeAddonOption(index, optIndex)}
                                    className="p-1 text-red-400 hover:text-red-300"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Waivers */}
        <section className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Waivers & Agreements</h2>
            <button
              type="button"
              onClick={addWaiverFn}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-pavilion-700 border border-pavilion-600/50 rounded-lg text-gold-400 hover:bg-pavilion-600 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Waiver
            </button>
          </div>

          {waivers.length === 0 ? (
            <p className="text-sm text-gray-500">No waivers configured. Add liability waivers, T&Cs, etc.</p>
          ) : (
            <div className="space-y-3">
              {waivers.map((waiver, index) => {
                const isExpanded = expandedWaiver === index;
                return (
                  <div key={waiver._key} className="bg-pavilion-700/50 border border-pavilion-600/30 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedWaiver(isExpanded ? null : index)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-pavilion-700 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{waiver.name || `Waiver ${index + 1}`}</span>
                        {waiver.required && <span className="text-xs text-red-400">Required</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeWaiverFn(index); }}
                          className="p-1 text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-pavilion-600/30">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Name</label>
                            <input
                              type="text"
                              value={waiver.name}
                              onChange={(e) => handleWaiverChange(index, 'name', e.target.value)}
                              className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-600 focus:border-gold-500 focus:outline-none text-sm"
                              placeholder="e.g. Liability Waiver"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Load Template</label>
                            <select
                              value=""
                              onChange={(e) => loadWaiverTemplate(index, parseInt(e.target.value, 10))}
                              className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white focus:border-gold-500 focus:outline-none text-sm"
                            >
                              <option value="">Select a template...</option>
                              {waiverTemplates.map((tpl, i) => (
                                <option key={i} value={i}>{tpl.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={waiver.required}
                              onChange={(e) => handleWaiverChange(index, 'required', e.target.checked)}
                              className="rounded border-pavilion-600 bg-pavilion-700 text-gold-500"
                            />
                            <span className="text-xs text-gray-400">Required</span>
                          </label>
                        </div>

                        {/* Ticket type filter */}
                        {ticketTypes.filter(tt => tt.name && tt.id).length > 0 && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Applies to ticket types (empty = all)</label>
                            <div className="flex flex-wrap gap-2">
                              {ticketTypes.filter(tt => tt.name && tt.id).map(tt => (
                                <label key={tt.id} className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={(waiver.ticketTypeIds || []).includes(tt.id)}
                                    onChange={(e) => {
                                      const ids = e.target.checked
                                        ? [...(waiver.ticketTypeIds || []), tt.id]
                                        : (waiver.ticketTypeIds || []).filter(x => x !== tt.id);
                                      handleWaiverChange(index, 'ticketTypeIds', ids);
                                    }}
                                    className="rounded border-pavilion-600 bg-pavilion-700 text-gold-500"
                                  />
                                  <span className="text-xs text-gray-400">{tt.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Content (HTML)</label>
                          <textarea
                            value={waiver.content}
                            onChange={(e) => handleWaiverChange(index, 'content', e.target.value)}
                            rows={8}
                            className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-600 focus:border-gold-500 focus:outline-none text-sm font-mono resize-y"
                            placeholder="<h3>Waiver Title</h3><p>Waiver text...</p>"
                          />
                        </div>

                        {/* Preview */}
                        {waiver.content && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Preview</label>
                            <div
                              className="p-3 bg-pavilion-800 rounded-lg text-xs text-gray-300 leading-relaxed max-h-40 overflow-y-auto prose prose-invert prose-sm"
                              dangerouslySetInnerHTML={{ __html: waiver.content }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
