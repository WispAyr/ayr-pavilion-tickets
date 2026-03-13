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
  Mail,
  DoorOpen,
  Shield,
  BarChart3,
  Users,
  UserCircle,
  ChevronUp,
} from 'lucide-react';
import { isAdminLoggedIn, adminLogout, getAdminRole, getAdminDisplayName } from '../../lib/api';

function buildNav(role) {
  const items = [
    { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { to: '/admin/events', icon: CalendarDays, label: 'Events' },
    { to: '/admin/orders', icon: ShoppingCart, label: 'Orders' },
    { to: '/admin/stats', icon: BarChart3, label: 'Analytics' },
    { to: '/admin/emails', icon: Mail, label: 'Emails' },
    { to: '/admin/scanner-users', icon: Shield, label: 'Scanner PINs' },
    { to: '/admin/door', icon: DoorOpen, label: 'Live Door' },
  ];
  if (role === 'owner') {
    items.push({ to: '/admin/users', icon: Users, label: 'Users' });
  }
  return items;
}

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const role = getAdminRole();
  const displayName = getAdminDisplayName();
  const navItems = buildNav(role);

  useEffect(() => {
    if (!isAdminLoggedIn() && location.pathname !== '/admin/login') {
      navigate('/admin/login');
    }
  }, [location, navigate]);

  if (location.pathname === '/admin/login') return <Outlet />;
  if (!isAdminLoggedIn()) return null;

  function handleLogout() {
    adminLogout();
    navigate('/admin/login');
  }

  function isActive(item) {
    if (item.exact) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  }

  const NavLinks = ({ onNavigate }) => (
    <>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item);
        return (
          <Link key={item.to} to={item.to} onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              active ? 'bg-gold-500/10 text-gold-400 border border-gold-500/20' : 'text-gray-400 hover:text-white hover:bg-pavilion-700 border border-transparent'
            }`}>
            <Icon className="w-4 h-4" />
            {item.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-pavilion-900 flex">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-pavilion-800 border-r border-pavilion-600/50 fixed top-0 left-0 bottom-0 z-30">
        <div className="p-5 border-b border-pavilion-600/50">
          <Link to="/admin" className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-gold-400" />
            <span className="text-gold-400 font-bold text-sm tracking-widest">AYR PAVILION</span>
          </Link>
          <p className="text-xs text-gray-500 mt-1">Admin Panel</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavLinks onNavigate={() => {}} />
        </nav>

        {/* User menu */}
        <div className="p-3 border-t border-pavilion-600/50 relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-pavilion-700 transition-all group"
          >
            <div className="w-7 h-7 rounded-full bg-gold-500/20 border border-gold-500/30 flex items-center justify-center text-xs font-bold text-gold-400">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-white truncate">{displayName}</p>
              <p className="text-xs text-gray-500 capitalize">{role}</p>
            </div>
            <ChevronUp className={`w-4 h-4 text-gray-500 transition-transform ${userMenuOpen ? '' : 'rotate-180'}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-pavilion-700 border border-pavilion-600 rounded-xl overflow-hidden shadow-xl">
              <Link to="/admin/profile" onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-pavilion-600 transition-all">
                <UserCircle className="w-4 h-4" /> My Profile
              </Link>
              <button onClick={handleLogout}
                className="flex items-center gap-2 w-full px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all border-t border-pavilion-600">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-pavilion-800/95 backdrop-blur-md border-b border-pavilion-600/50">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-gold-400" />
            <span className="text-gold-400 font-bold text-sm tracking-widest">ADMIN</span>
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-300 hover:text-white">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {sidebarOpen && (
          <div className="border-t border-pavilion-600/50 bg-pavilion-800 px-4 py-3 space-y-1">
            <NavLinks onNavigate={() => setSidebarOpen(false)} />
            <div className="pt-2 border-t border-pavilion-600/30 mt-2 space-y-1">
              <Link to="/admin/profile" onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-pavilion-700">
                <UserCircle className="w-4 h-4" /> My Profile
              </Link>
              <button onClick={handleLogout}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
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
