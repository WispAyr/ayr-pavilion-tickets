import { Link, useLocation } from 'react-router-dom';
import { Ticket } from 'lucide-react';

export default function Footer() {
  const location = useLocation();

  // Hide footer on admin and scanner pages
  if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/scan') || location.pathname.startsWith('/door') || location.pathname.startsWith('/skates')) {
    return null;
  }

  return (
    <footer className="border-t border-pavilion-600/50 bg-pavilion-900 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-gold-400" />
            <span className="text-gold-400 font-bold text-sm tracking-widest">AYR PAVILION</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-gray-400">
            <Link to="/events" className="hover:text-white transition-colors">
              Events
            </Link>
            <Link to="/scan" className="hover:text-white transition-colors">
              Door Scanner
            </Link>
            <Link to="/admin" className="hover:text-white transition-colors">
              Admin
            </Link>
          </div>

          <p className="text-sm text-gray-500">
            &copy; 2026 Ayr Pavilion
          </p>
        </div>
      </div>
    </footer>
  );
}
