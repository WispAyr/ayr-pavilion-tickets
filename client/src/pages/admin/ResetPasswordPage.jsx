import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { resetPassword } from '../../lib/api';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true); setError(null);
    try {
      await resetPassword(token, form.password);
      setDone(true);
      setTimeout(() => navigate('/admin/login'), 3000);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-pavilion-900">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-400">Invalid reset link.</p>
          <Link to="/admin/forgot-password" className="mt-4 block text-sm text-gold-400 hover:underline">Request a new one</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-pavilion-900">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <Lock className="w-10 h-10 text-gold-400 mx-auto mb-3" />
          <h1 className="text-2xl font-bold">Reset Password</h1>
          <p className="text-gray-400 text-sm mt-1">Choose a new password</p>
        </div>

        {done ? (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-green-400 font-medium mb-2">Password reset!</p>
            <p className="text-sm text-gray-400">Redirecting you to login...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  required minLength={8} autoFocus
                  className="w-full pl-10 pr-4 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
                  placeholder="Min 8 characters" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })}
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
                  placeholder="Repeat password" />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set New Password'}
            </button>
          </form>
        )}

        <div className="text-center mt-6">
          <Link to="/admin/login" className="text-sm text-gold-400 hover:text-gold-500">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
