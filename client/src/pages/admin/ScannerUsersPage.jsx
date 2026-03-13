import { useState, useEffect } from 'react';
import {
  UserPlus,
  Trash2,
  Edit3,
  Check,
  X,
  Shield,
  Loader2,
  QrCode,
  Clock,
} from 'lucide-react';
import { fetchScannerUsers, createScannerUser, updateScannerUser, deleteScannerUser } from '../../lib/api';

export default function ScannerUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPin, setEditPin] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  function loadUsers() {
    setLoading(true);
    fetchScannerUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim() || !newPin.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createScannerUser({ name: newName.trim(), pin: newPin.trim() });
      setNewName('');
      setNewPin('');
      setShowAdd(false);
      loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id) {
    setSaving(true);
    setError(null);
    try {
      await updateScannerUser(id, { name: editName.trim(), pin: editPin.trim() });
      setEditId(null);
      loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(user) {
    try {
      await updateScannerUser(user.id, { active: user.active ? 0 : 1 });
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(user) {
    if (!confirm(`Delete scanner user "${user.name}"? Their scan history will be kept.`)) return;
    try {
      await deleteScannerUser(user.id);
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(user) {
    setEditId(user.id);
    setEditName(user.name);
    setEditPin(user.pin);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-gold-400" />
            Scanner PINs
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage door scanner users and their PIN codes</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-gold-500 text-pavilion-900 rounded-lg text-sm font-bold hover:bg-gold-600 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 p-4 bg-pavilion-800 border border-pavilion-600/50 rounded-xl">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. John, Door Staff 1"
                autoFocus
                className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none"
              />
            </div>
            <div className="w-full sm:w-36">
              <label className="block text-xs text-gray-500 mb-1">PIN (4+ digits)</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="1234"
                className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm font-mono tracking-widest focus:border-gold-500 focus:outline-none"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={saving || !newName.trim() || newPin.length < 4}
                className="px-4 py-2.5 bg-gold-500 text-pavilion-900 rounded-lg text-sm font-bold hover:bg-gold-600 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setNewName(''); setNewPin(''); }}
                className="px-4 py-2.5 bg-pavilion-700 border border-pavilion-600/50 rounded-lg text-sm text-gray-400 hover:text-white transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Users list */}
      {loading ? (
        <div className="text-center py-20">
          <Loader2 className="w-8 h-8 text-gold-400 animate-spin mx-auto" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No scanner users yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className={`bg-pavilion-800 border rounded-xl p-4 transition-all ${
                user.active ? 'border-pavilion-600/50' : 'border-red-500/20 opacity-60'
              }`}
            >
              {editId === user.id ? (
                /* Edit mode */
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none"
                    />
                  </div>
                  <div className="w-full sm:w-36">
                    <label className="block text-xs text-gray-500 mb-1">PIN</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editPin}
                      onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm font-mono tracking-widest focus:border-gold-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdate(user.id)}
                      disabled={saving}
                      className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="p-2 bg-pavilion-700 text-gray-400 rounded-lg hover:text-white transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{user.name}</span>
                      {!user.active && (
                        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">Disabled</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span className="font-mono tracking-widest text-gold-400/70">PIN: {user.pin}</span>
                      <span className="flex items-center gap-1">
                        <QrCode className="w-3 h-3" />
                        {user.scanCount || 0} scans
                      </span>
                      {user.lastScan && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last: {new Date(user.lastScan).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggle(user)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        user.active
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                      }`}
                    >
                      {user.active ? 'Active' : 'Disabled'}
                    </button>
                    <button
                      onClick={() => startEdit(user)}
                      className="p-2 text-gray-500 hover:text-white transition-all"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(user)}
                      className="p-2 text-gray-500 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="mt-6 p-4 bg-pavilion-800/50 border border-pavilion-600/30 rounded-xl text-sm text-gray-500">
        <p className="font-medium text-gray-400 mb-1">How it works</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Each door staff member gets their own PIN code</li>
          <li>When they scan tickets, their name is logged against each scan</li>
          <li>View who scanned what in the Live Door feed and scan reports</li>
          <li>Disable a PIN without deleting it to temporarily revoke access</li>
        </ul>
      </div>
    </div>
  );
}
