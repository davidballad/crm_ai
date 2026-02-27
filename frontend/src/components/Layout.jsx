import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BrainCircuit,
  LogOut,
  Menu,
  X,
  Users,
  MessageSquare,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/transactions', icon: ShoppingCart, label: 'Transactions' },
  { to: '/insights', icon: BrainCircuit, label: 'AI Insights' },
];

function SidebarLink({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-brand-50 text-brand-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = () => {
    signOut();
    navigate('/login');
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-gray-200 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <LayoutDashboard className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-bold text-gray-900">Clienta AI</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} {...item} onClick={() => setMobileOpen(false)} />
        ))}
      </nav>

      <div className="border-t border-gray-200 px-3 py-4">
        {user && (
          <div className="mb-3 truncate px-3 text-xs text-gray-500">{user.email}</div>
        )}
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-gray-200 bg-white lg:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 w-64 bg-white shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1 text-gray-500 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center border-b border-gray-200 bg-white px-4 lg:px-6">
          <button onClick={() => setMobileOpen(true)} className="mr-3 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
