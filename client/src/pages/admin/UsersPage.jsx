import { useState, useEffect } from 'react';
import {
  Users, UserPlus, Trash2, Edit3, Check, X, Shield, Loader2, Key, ToggleLeft, ToggleRight, Crown, UserCheck, User, DollarSign,
} from 'lucide-react';
import { fetchUsers, createUser, updateUser, deleteUser, changeUserPassword } from '../../lib/api';

const ROLE_BADGES = {
  owner: { label: 'Owner', cls: 'bg-gold-500/20 text-gold-400', icon: Crown },
  admin: { label: 'Admin', cls: 'bg-blue-500/20 text-blue-400', icon: Shield },
  staff: { label: 'Staff', cls: 'bg-gray-500/20 text-gray-400', icon: UserCheck },
};

function fmtDate(d) {
  if (!d) return 'Never';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', display_name: '', role: 'admin' });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [pwId, setPwId] = useState(null);
  const [newPw, setNewPw] = useState('');

  useEffect(() => { load(); }, []);

  function load() {
    setLoading(true);
    fetchUsers().then(setUsers).catch(e => setError(e.message)).finally(() => setLoading(false));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createUser(form);
      setForm({ username: '', email: '', password: '', display_name: '', role: 'admin' });
      setShowAdd(false);
      load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function handleUpdate(id) {
    setSaving(true);
    setError(null);
    try {
      await updateUser(id, editForm);
      setEditId(null);
      load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function handleToggle(user) {
    try {
      await updateUser(user.id, { active: user.active ? 0 : 1 });
      load();
    } catch (err) { setError(err.message); }
  }

  async function handleDelete(user) {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try { await deleteUser(user.id); load(); } catch (err) { setError(err.message); }
  }

  async function handlePwChange(id) {
    if (newPw.length < 8) { setError('Password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      await changeUserPassword(id, newPw);
      setPwId(null);
      setNewPw('');
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 text-gold-400 animate-spin" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6 text-gold-400" /> Admin Users</h1>
          <p className="text-sm text-gray-500 mt-1">Manage who can access the admin panel</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 bg-gold-500 text-pavilion-900 rounded-lg text-sm font-bold hover:bg-gold-600 transition-all">
          <UserPlus className="w-4 h-4" /> Add User
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white ml-2">✕</button>
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="mb-6 p-5 bg-pavilion-800 border border-pavilion-600/50 rounded-xl space-y-3">
          <p className="text-sm font-bold text-white mb-2">New User</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Username *</label>
              <input type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none" placeholder="johndoe" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Display Name</label>
              <input type="text" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none" placeholder="John Doe" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none" placeholder="john@example.com" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Password * (min 8 chars)</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={8} className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none" placeholder="••••••••" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none">
              <option value="staff">Staff — Door scanning & order viewing</option>
              <option value="admin">Admin — Full access except user management</option>
              <option value="owner">Owner — Full access including user management</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="px-4 py-2.5 bg-gold-500 text-pavilion-900 rounded-lg text-sm font-bold hover:bg-gold-600 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create User'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-pavilion-700 border border-pavilion-600/50 rounded-lg text-sm text-gray-400 hover:text-white">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {users.map(user => {
          const badge = ROLE_BADGES[user.role] || ROLE_BADGES.staff;
          const BadgeIcon = badge.icon;
          return (
            <div key={user.id} className={`bg-pavilion-800 border rounded-xl p-4 transition-all ${user.active ? 'border-pavilion-600/50' : 'border-red-500/20 opacity-60'}`}>
              {editId === user.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input type="text" value={editForm.display_name || ''} onChange={e => setEditForm({ ...editForm, display_name: e.target.value })} className="px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none" placeholder="Display name" />
                    <input type="email" value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none" placeholder="Email" />
                    <select value={editForm.role || 'admin'} onChange={e => setEditForm({ ...editForm, role: e.target.value })} className="px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none">
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editForm.can_see_financials || false} onChange={e => setEditForm({ ...editForm, can_see_financials: e.target.checked })} className="w-4 h-4 rounded border-pavilion-600 bg-pavilion-700 text-gold-500 focus:ring-gold-500" />
                    <span className="text-sm text-gray-400">Can see financials</span>
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(user.id)} disabled={saving} className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditId(null)} className="p-2 bg-pavilion-700 text-gray-400 rounded-lg hover:text-white"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              ) : pwId === user.id ? (
                <div className="flex items-center gap-3">
                  <Key className="w-4 h-4 text-gold-400" />
                  <span className="text-sm text-gray-400">New password for {user.username}:</span>
                  <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 chars" className="px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none w-48" />
                  <button onClick={() => handlePwChange(user.id)} disabled={saving} className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30"><Check className="w-4 h-4" /></button>
                  <button onClick={() => { setPwId(null); setNewPw(''); }} className="p-2 bg-pavilion-700 text-gray-400 rounded-lg hover:text-white"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-pavilion-700 border border-pavilion-600 flex items-center justify-center text-sm font-bold text-gold-400">
                    {(user.display_name || user.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{user.display_name || user.username}</span>
                      <span className="text-gray-500 text-sm">@{user.username}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full flex items-center gap-1 ${badge.cls}`}>
                        <BadgeIcon className="w-3 h-3" />{badge.label}
                      </span>
                      {user.can_see_financials ? <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1"><DollarSign className="w-3 h-3" />Financials</span> : null}
                      {!user.active && <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">Disabled</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>{user.email}</span>
                      <span>Last login: {fmtDate(user.last_login)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleToggle(user)} title={user.active ? 'Disable' : 'Enable'} className="p-2 text-gray-500 hover:text-white transition-all">
                      {user.active ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5 text-red-400" />}
                    </button>
                    <button onClick={() => { setPwId(user.id); setNewPw(''); }} title="Change password" className="p-2 text-gray-500 hover:text-gold-400 transition-all"><Key className="w-4 h-4" /></button>
                    <button onClick={() => { setEditId(user.id); setEditForm({ display_name: user.display_name, email: user.email, role: user.role, can_see_financials: !!user.can_see_financials }); }} title="Edit" className="p-2 text-gray-500 hover:text-white transition-all"><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(user)} title="Delete" className="p-2 text-gray-500 hover:text-red-400 transition-all"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-pavilion-800/50 border border-pavilion-600/30 rounded-xl text-sm text-gray-500">
        <p className="font-medium text-gray-400 mb-1">Role Permissions</p>
        <ul className="space-y-1 list-disc list-inside">
          <li><strong className="text-gold-400">Owner</strong> — Full access + user management</li>
          <li><strong className="text-blue-400">Admin</strong> — Events, orders, emails, analytics, scanner management</li>
          <li><strong className="text-gray-400">Staff</strong> — Door scanning, order viewing, live door stats</li>
        </ul>
      </div>
    </div>
  );
}
