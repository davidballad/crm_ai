import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { createTenant } from '../api/onboarding';
import { useAuth } from '../context/AuthContext';

const BUSINESS_TYPES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'retail', label: 'Retail' },
  { value: 'bar', label: 'Bar' },
  { value: 'other', label: 'Other' },
];

export default function Signup() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [form, setForm] = useState({
    business_name: '',
    business_type: 'restaurant',
    owner_email: '',
    owner_password: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.owner_password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    try {
      await createTenant(form);
      await signIn(form.owner_email, form.owner_password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Signup failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600">
            <Layers className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-2 text-sm text-gray-500">Start managing your business with AI insights</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label htmlFor="business_name" className="mb-1 block text-sm font-medium text-gray-700">Business name</label>
            <input id="business_name" required value={form.business_name} onChange={update('business_name')} className="input-field" placeholder="My Business" />
          </div>

          <div>
            <label htmlFor="business_type" className="mb-1 block text-sm font-medium text-gray-700">Business type</label>
            <select id="business_type" value={form.business_type} onChange={update('business_type')} className="input-field">
              {BUSINESS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="owner_email" className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input id="owner_email" type="email" required value={form.owner_email} onChange={update('owner_email')} className="input-field" placeholder="you@business.com" />
          </div>

          <div>
            <label htmlFor="owner_password" className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <input id="owner_password" type="password" required minLength={8} value={form.owner_password} onChange={update('owner_password')} className="input-field" placeholder="Min. 8 characters" />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-500">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
