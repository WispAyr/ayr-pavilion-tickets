import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  Ticket,
  PoundSterling,
  TrendingUp,
  Loader2,
  AlertCircle,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { fetchDashboard, canSeeFinancials } from '../../lib/api';

function formatPrice(pence) {
  return `\u00a3${(pence / 100).toFixed(2)}`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const s = data?.stats || {};
  const stats = [
    {
      label: 'Total Events',
      value: s.totalEvents ?? 0,
      icon: CalendarDays,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Tickets Sold',
      value: s.ticketsSold ?? 0,
      icon: Ticket,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    ...(canSeeFinancials() ? [{
      label: 'Revenue',
      value: formatPrice(s.totalRevenue ?? 0),
      icon: PoundSterling,
      color: 'text-gold-400',
      bgColor: 'bg-gold-500/10',
    }] : []),
    {
      label: 'Active Events',
      value: s.activeEvents ?? 0,
      icon: TrendingUp,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
  ];

  const recentOrders = data?.recentOrders || [];

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link
          to="/admin/events/new"
          className="flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-600 text-pavilion-900 font-semibold rounded-lg transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          New Event
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-400">{stat.label}</span>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Recent orders */}
      <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl">
        <div className="flex items-center justify-between p-5 border-b border-pavilion-600/50">
          <h2 className="text-lg font-bold">Recent Orders</h2>
          <Link
            to="/admin/orders"
            className="text-sm text-gold-400 hover:text-gold-500 transition-colors flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No orders yet</div>
        ) : (
          <div className="divide-y divide-pavilion-600/30">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-white">
                    {order.customerName || order.customerEmail || 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {order.reference || order.id} &middot; {order.event?.title || order.eventTitle || ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gold-400">
                    {canSeeFinancials() ? formatPrice(order.totalAmount || order.total || 0) : '—'}
                  </p>
                  <p className="text-xs text-gray-500">{formatDate(order.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/admin/events"
          className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-5 hover:border-gold-500/30 transition-all group"
        >
          <CalendarDays className="w-8 h-8 text-gold-400 mb-2" />
          <h3 className="font-semibold group-hover:text-gold-400 transition-colors">Manage Events</h3>
          <p className="text-sm text-gray-500 mt-1">Create, edit, and manage your events</p>
        </Link>
        <Link
          to="/admin/orders"
          className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl p-5 hover:border-gold-500/30 transition-all group"
        >
          <Ticket className="w-8 h-8 text-gold-400 mb-2" />
          <h3 className="font-semibold group-hover:text-gold-400 transition-colors">View Orders</h3>
          <p className="text-sm text-gray-500 mt-1">View and manage ticket orders</p>
        </Link>
      </div>
    </div>
  );
}
