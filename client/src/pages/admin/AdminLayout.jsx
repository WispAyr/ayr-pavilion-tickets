import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  ShoppingCart,
  LogOut,
  Menu,
  X,
  Ticket,
} from 'lucide-react';
import { isAdminLoggedIn, adminLogout } from '../../lib/api';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/admin/events', icon: CalendarDays, label: 'Events' },
  { to: '/admin/orders', icon: ShoppingCart, label: 'Orders' },
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAdminLoggedIn() && location.pathname !== '/admin/login') {
      navigate('/admin/login');
    }
  }, [location, navigate]);

  if (location.pathname === '/admin/login') {
    return <Outlet />;
  }

  if (!isAdminLoggedIn()) return null;

  function handleLogout() {
    adminLogout();
    navigate('/admin/login');
  }

  function isActive(item) {
    if (item.exact) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  }

  return (
    <div className="min-h-screen bg-pavilion-900 flex">
      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-pavilion-800 border-r border-pavilion-600/50 fixed top-0 left-0 bottom-0 z-30">
        <div className="p-5 border-b border-pavilion-600/50">
          <Link to="/admin" className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-gold-400" />
            <span className="text-gold-400 font-bold text-sm tracking-widest">AYR PAVILION</span>
          </Link>
          <p className="text-xs text-gray-500 mt-1">Admin Panel</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-gold-500/10 text-gold-400 border border-gold-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-pavilion-700 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-pavilion-600/50">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-pavilion-800/95 backdrop-blur-md border-b border-pavilion-600/50">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-gold-400" />
            <span className="text-gold-400 font-bold text-sm tracking-widest">ADMIN</span>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 text-gray-300 hover:text-white"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {sidebarOpen && (
          <div className="border-t border-pavilion-600/50 bg-pavilion-800 px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? 'bg-gold-500/10 text-gold-400'
                      : 'text-gray-400 hover:text-white hover:bg-pavilion-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 lg:ml-64">
        <main className="p-4 sm:p-6 lg:p-8 pt-20 lg:pt-8 min-h-screen">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
