import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN || 'clienta-ai-prod.auth.us-east-1.amazoncognito.com';

export default function AuthCallback() {
  const { setSessionFromOAuth } = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error || !code) {
      navigate('/login', { replace: true });
      return;
    }

    const redirectUri = `${window.location.origin}/auth/callback`;

    fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Token exchange failed');
        return res.json();
      })
      .then(({ id_token, access_token, refresh_token }) => {
        setSessionFromOAuth(id_token, access_token, refresh_token);
        // Parse tenant_id from the id token to decide where to send the user
        const payload = JSON.parse(atob(id_token.split('.')[1]));
        if (payload['custom:tenant_id']) {
          navigate('/app', { replace: true });
        } else {
          navigate('/google-onboarding', { replace: true });
        }
      })
      .catch(() => {
        navigate('/login', { replace: true });
      });
  }, [navigate, setSessionFromOAuth]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        <p className="text-sm text-gray-500">Signing you in…</p>
      </div>
    </div>
  );
}
