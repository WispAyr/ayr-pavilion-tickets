import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import TicketViewPage from './pages/TicketViewPage';
import ScannerPage from './pages/ScannerPage';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import EventsList from './pages/admin/EventsList';
import EventForm from './pages/admin/EventForm';
import OrdersList from './pages/admin/OrdersList';
import LoginPage from './pages/admin/LoginPage';
import OrderSuccessPage from './pages/OrderSuccessPage';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="flex-1 pt-16">
        <Routes>
          <Route path="/" element={<Navigate to="/events" replace />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:slug" element={<EventDetailPage />} />
          <Route path="/tickets/:code" element={<TicketViewPage />} />
          <Route path="/order/success" element={<OrderSuccessPage />} />
          <Route path="/scan" element={<ScannerPage />} />

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="events" element={<EventsList />} />
            <Route path="events/new" element={<EventForm />} />
            <Route path="events/:id/edit" element={<EventForm />} />
            <Route path="orders" element={<OrdersList />} />
            <Route path="login" element={<LoginPage />} />
          </Route>
        </Routes>
      </div>

      <Footer />
    </div>
  );
}
