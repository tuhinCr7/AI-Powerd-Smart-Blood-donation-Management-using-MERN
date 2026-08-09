import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/layout/Layout.jsx';
import ProtectedRoute, { GuestRoute } from './components/ProtectedRoute.jsx';
import { PageLoader } from './components/ui/Feedback.jsx';
import Home from './pages/Home.jsx';

// Route-level code splitting — the marketing homepage stays in the main bundle.
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Chat = lazy(() => import('./pages/Chat.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

const PatientDashboard = lazy(() => import('./pages/patient/PatientDashboard.jsx'));
const Matches = lazy(() => import('./pages/patient/Matches.jsx'));
const MyRequests = lazy(() => import('./pages/patient/MyRequests.jsx'));
const NewRequest = lazy(() => import('./pages/patient/NewRequest.jsx'));

const DonorDashboard = lazy(() => import('./pages/donor/DonorDashboard.jsx'));
const RequestFeed = lazy(() => import('./pages/donor/RequestFeed.jsx'));

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout.jsx'));
const AdminOverview = lazy(() => import('./pages/admin/Overview.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/Users.jsx'));
const AdminRequests = lazy(() => import('./pages/admin/Requests.jsx'));
const AdminReports = lazy(() => import('./pages/admin/Reports.jsx'));

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          {/* public */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />

          {/* any signed-in user */}
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route
            path="/chat/:conversationId?"
            element={
              <ProtectedRoute roles={['patient', 'donor']}>
                <Chat />
              </ProtectedRoute>
            }
          />

          {/* patient */}
          <Route path="/patient" element={<ProtectedRoute roles={['patient']}><PatientDashboard /></ProtectedRoute>} />
          <Route path="/patient/matches" element={<ProtectedRoute roles={['patient']}><Matches /></ProtectedRoute>} />
          <Route path="/patient/requests" element={<ProtectedRoute roles={['patient']}><MyRequests /></ProtectedRoute>} />
          <Route path="/patient/requests/new" element={<ProtectedRoute roles={['patient']}><NewRequest /></ProtectedRoute>} />

          {/* donor */}
          <Route path="/donor" element={<ProtectedRoute roles={['donor']}><DonorDashboard /></ProtectedRoute>} />
          <Route path="/donor/requests" element={<ProtectedRoute roles={['donor']}><RequestFeed /></ProtectedRoute>} />

          {/* admin panel */}
          <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="requests" element={<AdminRequests />} />
            <Route path="reports" element={<AdminReports />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
