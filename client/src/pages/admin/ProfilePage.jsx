import { useState, useEffect } from 'react';
import { User, Mail, Shield, Clock, Save, Key, Loader2, Check } from 'lucide-react';
import { fetchProfile, updateProfile, changePassword } from '../../lib/api';

function fmtDate(d) {
  if (!d) return 'Never';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', staff: 'Staff' };

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ display_name: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [pwError, setPwError] = useState(null);

  useEffect(() => {
    fetchProfile()
      .then(p => { setProfile(p); setForm({ display_name: p.display_name || '', email: p.email || '' }); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setMsg(null); setError(null);
    try {
      await updateProfile(form);
      setMsg('Profile updated');
      localStorage.setItem('admin_display_name', form.display_name);
      setTimeout(() => setMsg(null), 3000);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function handlePwChange(e) {
    e.preventDefault();
    setPwMsg(null); setPwError(null);
    if (pwForm.new_password !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    if (pwForm.new_password.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    setPwSaving(true);
    try {
      await changePassword(pwForm.current_password, pwForm.new_password);
      setPwMsg('Password changed successfully');
      setPwForm({ current_password: '', new_password: '', confirm: '' });
      setTimeout(() => setPwMsg(null), 3000);
    } catch (err) { setPwError(err.message); } finally { setPwSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 text-gold-400 animate-spin" /></div>;

  return (
    <div className="animate-fade-in max-w-2xl">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <User className="w-6 h-6 text-gold-400" /> My Profile
      </h1>

      {/* Info strip */}
      <div className="flex items-center gap-6 mb-6 p-4 bg-pavilion-800 border border-pavilion-600/50 rounded-xl">
        <div className="w-14 h-14 rounded-full bg-pavilion-700 border-2 border-gold-500/50 flex items-center justify-center text-xl font-bold text-gold-400">
          {(profile?.display_name || profile?.username || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="text-white font-medium">{profile?.display_name || profile?.username}</p>
          <p className="text-sm text-gray-500">@{profile?.username}</p>
        </div>
        <div className="text-right text-xs text-gray-500 space-y-1">
          <div className="flex items-center gap-1 justify-end"><Shield className="w-3 h-3" /> {ROLE_LABELS[profile?.role] || profile?.role}</div>
          <div className="flex items-center gap-1 justify-end"><Clock className="w-3 h-3" /> Last login: {fmtDate(profile?.last_login)}</div>
          <div className="flex items-center gap-1 justify-end">Member since {fmtDate(profile?.created_at)}</div>
        </div>
      </div>

      {/* Edit profile */}
      <form onSubmit={handleSave} className="mb-6 p-5 bg-pavilion-800 border border-pavilion-600/50 rounded-xl space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Edit Profile</h2>

        {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}
        {msg && <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center gap-2"><Check className="w-4 h-4" />{msg}</div>}

        <div>
          <label className="block text-xs text-gray-500 mb-1">Display Name</label>
          <input type="text" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Email</label>
          <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none" />
        </div>
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 text-pavilion-900 rounded-lg text-sm font-bold hover:bg-gold-600 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
        </button>
      </form>

      {/* Change password */}
      <form onSubmit={handlePwChange} className="p-5 bg-pavilion-800 border border-pavilion-600/50 rounded-xl space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2"><Key className="w-4 h-4 text-gold-400" /> Change Password</h2>

        {pwError && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{pwError}</div>}
        {pwMsg && <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center gap-2"><Check className="w-4 h-4" />{pwMsg}</div>}

        <div>
          <label className="block text-xs text-gray-500 mb-1">Current Password</label>
          <input type="password" value={pwForm.current_password} onChange={e => setPwForm({ ...pwForm, current_password: e.target.value })} required className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">New Password (min 8 characters)</label>
          <input type="password" value={pwForm.new_password} onChange={e => setPwForm({ ...pwForm, new_password: e.target.value })} required minLength={8} className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Confirm New Password</label>
          <input type="password" value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} required className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white text-sm focus:border-gold-500 focus:outline-none" />
        </div>
        <button type="submit" disabled={pwSaving} className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 text-pavilion-900 rounded-lg text-sm font-bold hover:bg-gold-600 disabled:opacity-50">
          {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />} Change Password
        </button>
      </form>
    </div>
  );
}
