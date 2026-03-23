import { Routes, Route } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { setTokenGetter } from './api/client';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import InventoryList from './pages/InventoryList';
import InventoryForm from './pages/InventoryForm';
import TransactionList from './pages/TransactionList';
import Insights from './pages/Insights';
import LeadsList from './pages/LeadsList';
import LeadProfile from './pages/LeadProfile';
import MessagesInbox from './pages/MessagesInbox';
import WhatsAppSetup from './pages/WhatsAppSetup';
import Shop from './pages/Shop';

export default function App() {
  const { token } = useAuth();
  setTokenGetter(() => token);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/shop" element={<Shop />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="inventory" element={<InventoryList />} />
        <Route path="inventory/new" element={<InventoryForm />} />
        <Route path="inventory/:id" element={<InventoryForm />} />
        <Route path="transactions" element={<TransactionList />} />
        <Route path="insights" element={<Insights />} />
        <Route path="leads" element={<LeadsList />} />
        <Route path="leads/:id" element={<LeadProfile />} />
        <Route path="messages" element={<MessagesInbox />} />
        <Route path="settings/whatsapp" element={<WhatsAppSetup />} />
      </Route>
    </Routes>
  );
}
