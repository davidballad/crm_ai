import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../hooks/useTenantConfig';
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
  Settings,
  Lock,
  BarChart2,
  Megaphone,
  TrendingUp,
  Truck,
  Building2,
} from 'lucide-react';

const NAV_KEYS = [
  { to: '/app', icon: LayoutDashboard, labelKey: 'layout.dashboard', pro: false },
  { to: '/app/messages', icon: MessageSquare, labelKey: 'layout.messages', pro: false },
  { to: '/app/leads', icon: Users, labelKey: 'layout.leads', pro: false },
  { to: '/app/inventory', icon: Package, labelKey: 'layout.inventory', pro: false },
  { to: '/app/transactions', icon: ShoppingCart, labelKey: 'layout.transactions', pro: false },
  { to: '/app/insights', icon: BrainCircuit, labelKey: 'layout.aiInsights', pro: true },
  { to: '/app/analytics', icon: BarChart2, labelKey: 'layout.analytics', pro: false },
  { to: '/app/profits', icon: TrendingUp, labelKey: 'layout.profits', pro: false },
  { to: '/app/campaigns', icon: Megaphone, labelKey: 'layout.campaigns', pro: false },
  { to: '/app/suppliers', icon: Building2, labelKey: 'layout.suppliers', pro: false },
  { to: '/app/purchases', icon: Truck, labelKey: 'layout.purchases', pro: false },
  { to: '/app/settings/whatsapp', icon: Settings, labelKey: 'layout.connectWhatsApp', pro: false },
];

function SidebarLink({ to, icon: Icon, labelKey, t, onClick, locked }) {
  return (
    <NavLink
      to={to}
      end={to === '/app'}
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
      <span className="flex-1">
        {labelKey === 'layout.leads' ? 'Prospectos'
          : labelKey === 'layout.analytics' ? 'Analíticas'
          : labelKey === 'layout.campaigns' ? 'Campañas'
          : labelKey === 'layout.profits' ? 'Ganancias'
          : labelKey === 'layout.suppliers' ? 'Proveedores'
          : labelKey === 'layout.purchases' ? 'Compras'
          : t(labelKey)}
      </span>
      {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
    </NavLink>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isPro } = usePlan();

  const handleSignOut = () => {
    signOut();
    navigate('/');
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center border-b border-gray-200 px-5 py-4">
        <img src="/main.png" alt="Clienta AI" className="h-14 w-auto" />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_KEYS.map((item) => (
          <SidebarLink
            key={item.to}
            to={item.to}
            icon={item.icon}
            labelKey={item.labelKey}
            t={t}
            onClick={() => setMobileOpen(false)}
            locked={item.pro && !isPro}
          />
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
          {t('common.signOut')}
        </button>
        <a
          href="https://aws.amazon.com/what-is-cloud-computing"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center px-3 py-2 text-gray-400 hover:text-gray-500"
          aria-label="Powered by AWS Cloud Computing"
        >
          <img
            src="https://d0.awsstatic.com/logos/powered-by-aws.png"
            alt="Powered by AWS Cloud Computing"
            className="h-6"
          />
        </a>
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

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
