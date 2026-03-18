import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Package,
  MessageSquare,
  BarChart3,
  Users,
  ShoppingCart,
  Mail,
  Check,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Package,
    title: 'Inventory & products',
    description: 'Manage stock, reorder thresholds, and product catalog in one place. CSV import and low-stock alerts.',
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp messaging',
    description: 'Talk to customers via WhatsApp. AI-assisted replies, conversation history, and lead linking.',
  },
  {
    icon: BarChart3,
    title: 'AI insights',
    description: 'Daily AI-powered summaries: demand forecasts, reorder suggestions, revenue trends, and spending analysis.',
  },
  {
    icon: Users,
    title: 'Leads & contacts',
    description: 'Track prospects and customers. Lead status, tier, and total spent. Full history per contact.',
  },
  {
    icon: ShoppingCart,
    title: 'Transactions & sales',
    description: 'Sales history, daily summaries, and cart-to-checkout flow via WhatsApp. No manual entry needed.',
  },
];

const PRICING = [
  { name: 'Starter', price: 'Contact us', description: 'Ideal for single-location businesses', features: ['Inventory & products', 'Leads & messages', 'AI insights', 'WhatsApp integration'] },
  { name: 'Growth', price: 'Contact us', description: 'For teams and multiple users', features: ['Everything in Starter', 'Multi-user roles', 'Transactions & reporting', 'Priority support'] },
];

export default function Landing() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to="/app" replace />;

  return (
    <div className="min-h-screen bg-white">
      {/* Top nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <img src="/mainLogo.png" alt="Clienta AI" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-28 pb-20 sm:pt-36 sm:pb-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            AI-powered CRM for small business
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-gray-600">
            Inventory, WhatsApp messaging, leads, transactions, and daily AI insights — in one place. Built for restaurants, retail, and bars.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/signup"
              className="rounded-lg bg-brand-600 px-6 py-3 text-base font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Get started
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      {/* What we offer */}
      <section className="border-t border-gray-100 bg-gray-50/50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center">What Clienta AI offers</h2>
          <p className="mt-3 text-center text-gray-600 max-w-2xl mx-auto">
            Everything you need to run your business and stay close to customers.
          </p>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Collaborators & contact */}
      <section className="border-t border-gray-100 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center">Collaborate with us</h2>
          <p className="mt-3 text-center text-gray-600 max-w-2xl mx-auto">
            Interested in partnering, reselling, or custom solutions? Get in touch.
          </p>
          <div className="mt-10 flex flex-col items-center">
            <a
              href="mailto:info@clientaai.com"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-3 text-base font-medium text-white hover:bg-gray-800 transition-colors"
            >
              <Mail className="h-5 w-5" />
              info@clientaai.com
            </a>
            <p className="mt-3 text-sm text-gray-500">We respond within 1–2 business days.</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-gray-100 bg-gray-50/50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center">Pricing</h2>
          <p className="mt-3 text-center text-gray-600 max-w-2xl mx-auto">
            Transparent pricing. Contact us for a quote tailored to your business.
          </p>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 max-w-3xl mx-auto">
            {PRICING.map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
              >
                <h3 className="text-xl font-semibold text-gray-900">{plan.name}</h3>
                <p className="mt-1 text-2xl font-bold text-brand-600">{plan.price}</p>
                <p className="mt-2 text-sm text-gray-600">{plan.description}</p>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 shrink-0 text-green-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="mailto:info@clientaai.com?subject=Pricing%20inquiry%20-%20Clienta%20AI"
                  className="mt-6 block w-full rounded-lg border border-brand-600 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                >
                  Contact for pricing
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <img src="/mainLogo.png" alt="Clienta AI" className="h-8 w-auto opacity-90" />
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Clienta AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
