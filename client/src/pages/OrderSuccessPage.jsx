import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Ticket, Mail } from 'lucide-react';

export default function OrderSuccessPage() {
  const [params] = useSearchParams();
  const ref = params.get('ref');

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-20 pb-12 animate-fade-in">
      <div className="max-w-md w-full text-center">
        <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-2xl p-8">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>

          <h1 className="text-2xl font-bold mb-2">Payment Successful!</h1>
          <p className="text-gray-400 mb-6">
            Your tickets have been confirmed and are ready.
          </p>

          {ref && (
            <div className="bg-pavilion-700 rounded-xl p-4 mb-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Order Reference</p>
              <p className="text-xl font-bold font-mono text-gold-400">{ref}</p>
            </div>
          )}

          <div className="space-y-3 text-sm text-gray-400 mb-8">
            <div className="flex items-center gap-3 justify-center">
              <Mail className="w-4 h-4 text-gold-500" />
              <span>Confirmation email sent with your tickets</span>
            </div>
            <div className="flex items-center gap-3 justify-center">
              <Ticket className="w-4 h-4 text-gold-500" />
              <span>Show your QR code at the door for entry</span>
            </div>
          </div>

          <div className="space-y-3">
            <Link
              to="/events"
              className="block w-full py-3 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-bold rounded-lg transition-all"
            >
              Browse More Events
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
