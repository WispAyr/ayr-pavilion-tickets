import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import TicketViewPage from './pages/TicketViewPage';
import ScannerPage from './pages/ScannerPage';
import ScannerTestPage from './pages/ScannerTestPage';
import DoorPage from './pages/DoorPage';
import SkatesPage from './pages/SkatesPage';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import EventsList from './pages/admin/EventsList';
import EventForm from './pages/admin/EventForm';
import OrdersList from './pages/admin/OrdersList';
import LoginPage from './pages/admin/LoginPage';
import EmailsList from './pages/admin/EmailsList';
import ClaimsPage from './pages/admin/ClaimsPage';
import CompsPage from './pages/admin/CompsPage';
import LiveDoorPage from './pages/admin/LiveDoorPage';
import ScannerUsersPage from './pages/admin/ScannerUsersPage';
import StatsPage from './pages/admin/StatsPage';
import UsersPage from './pages/admin/UsersPage';
import ProfilePage from './pages/admin/ProfilePage';
import ForgotPasswordPage from './pages/admin/ForgotPasswordPage';
import ResetPasswordPage from './pages/admin/ResetPasswordPage';
import EventOpsPage from './pages/admin/EventOpsPage';
import TermsPage from './pages/TermsPage';
import TicketProtectionPage from './pages/TicketProtectionPage';
import EventReportPage from "./pages/admin/EventReportPage";
import OrderSuccessPage from './pages/OrderSuccessPage';
import EventPerformancePage from './pages/admin/EventPerformancePage';
import FinancialsPage from './pages/admin/FinancialsPage';
import MarketingPage from './pages/admin/MarketingPage';

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
          <Route path="/scan/test" element={<ScannerTestPage />} />
          <Route path="/door" element={<DoorPage />} />
          <Route path="/skates" element={<SkatesPage />} />
          <Route path="/admin/event-report/:eventId" element={<EventReportPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/ticket-protection" element={<TicketProtectionPage />} />
          <Route path="/admin/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/admin/reset-password" element={<ResetPasswordPage />} />

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="events" element={<EventsList />} />
            <Route path="events/new" element={<EventForm />} />
            <Route path="events/:id/edit" element={<EventForm />} />
            <Route path="orders" element={<OrdersList />} />
            <Route path="emails" element={<EmailsList />} />
            <Route path="claims" element={<ClaimsPage />} />
            <Route path="comps" element={<CompsPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="performance" element={<EventPerformancePage />} />
            <Route path="financials" element={<FinancialsPage />} />
            <Route path="marketing" element={<MarketingPage />} />
            <Route path="events/:eventId/ops" element={<EventOpsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="scanner-users" element={<ScannerUsersPage />} />
            <Route path="door" element={<LiveDoorPage />} />
            <Route path="door/:eventId" element={<LiveDoorPage />} />
            <Route path="login" element={<LoginPage />} />
          </Route>
        </Routes>
      </div>

      <Footer />
    </div>
  );
}
