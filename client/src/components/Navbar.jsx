import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Ticket } from 'lucide-react';

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Hide navbar on admin, scanner, door, and skates pages
  if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/scan') || location.pathname.startsWith('/door') || location.pathname.startsWith('/skates')) return null;

  const navLinks = [
    { to: '/events', label: 'Events' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-pavilion-900/95 backdrop-blur-md border-b border-pavilion-600/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/events" className="flex items-center gap-2 group">
            <Ticket className="w-6 h-6 text-gold-400 group-hover:text-gold-500 transition-colors" />
            <span className="text-gold-400 font-bold text-lg tracking-widest group-hover:text-gold-500 transition-colors">
              AYR PAVILION
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`text-sm font-medium transition-colors ${
                  location.pathname.startsWith(link.to)
                    ? 'text-gold-400'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 text-gray-300 hover:text-white transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-pavilion-600/50 bg-pavilion-900/98 backdrop-blur-md">
          <div className="px-4 py-3 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname.startsWith(link.to)
                    ? 'text-gold-400 bg-pavilion-800'
                    : 'text-gray-300 hover:text-white hover:bg-pavilion-800'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
