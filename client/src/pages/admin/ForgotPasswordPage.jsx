import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';
import { forgotPassword } from '../../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
    } catch {} // Always show success
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-pavilion-900">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <Mail className="w-10 h-10 text-gold-400 mx-auto mb-3" />
          <h1 className="text-2xl font-bold">Forgot Password</h1>
          <p className="text-gray-400 text-sm mt-1">We'll send you a reset link</p>
        </div>

        {sent ? (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-green-400 font-medium mb-2">Check your email</p>
            <p className="text-sm text-gray-400">If an account exists with that email, you'll receive a password reset link shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full pl-10 pr-4 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm"
                  placeholder="your@email.com"
                />
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Reset Link'}
            </button>
          </form>
        )}

        <div className="text-center mt-6">
          <Link to="/admin/login" className="text-sm text-gold-400 hover:text-gold-500 flex items-center justify-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
