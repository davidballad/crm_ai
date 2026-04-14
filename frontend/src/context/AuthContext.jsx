import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
};

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN || 'clienta-ai-prod.auth.us-east-1.amazoncognito.com';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';
const OAUTH_REDIRECT_URI = `${window.location.origin}/auth/callback`;

const userPool = poolData.UserPoolId ? new CognitoUserPool(poolData) : null;

const DEMO_USER = {
  email: 'demo@clienta.ai',
  tenantId: 'demo-tenant',
  role: 'admin',
  sub: 'demo-user-001',
};

const isDemoMode = !userPool;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(isDemoMode ? DEMO_USER : null);
  const [token, setToken] = useState(isDemoMode ? 'demo-token' : null);
  const [loading, setLoading] = useState(!isDemoMode);

  const extractUserData = useCallback((session) => {
    const idToken = session.getIdToken();
    const payload = idToken.decodePayload();
    return {
      email: payload.email,
      tenantId: payload['custom:tenant_id'],
      role: payload['custom:role'],
      sub: payload.sub,
    };
  }, []);

  useEffect(() => {
    if (isDemoMode) return;
    if (!userPool) {
      setLoading(false);
      return;
    }
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      setLoading(false);
      return;
    }
    cognitoUser.getSession((err, session) => {
      if (err || !session?.isValid()) {
        setLoading(false);
        return;
      }
      setToken(session.getIdToken().getJwtToken());
      setUser(extractUserData(session));
      setLoading(false);
    });
  }, [extractUserData]);

  const signIn = useCallback((email, password) => {
    if (isDemoMode) {
      setUser(DEMO_USER);
      setToken('demo-token');
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      if (!userPool) {
        reject(new Error('Cognito is not configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID.'));
        return;
      }
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      const authDetails = new AuthenticationDetails({ Username: email, Password: password });

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session) => {
          const jwt = session.getIdToken().getJwtToken();
          setToken(jwt);
          setUser(extractUserData(session));
          resolve(session);
        },
        onFailure: (err) => reject(err),
        newPasswordRequired: () => {
          reject(new Error('New password required. Please contact support.'));
        },
      });
    });
  }, [extractUserData]);

  const signOut = useCallback(() => {
    if (!userPool) return;
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) cognitoUser.signOut();
    setUser(null);
    setToken(null);
  }, []);

  const forgotPassword = useCallback((email) => {
    return new Promise((resolve, reject) => {
      if (!userPool) {
        reject(new Error('Cognito is not configured.'));
        return;
      }
      const cognitoUser = new CognitoUser({ Username: email.toLowerCase(), Pool: userPool });
      cognitoUser.forgotPassword({
        onSuccess: resolve,
        onFailure: reject,
      });
    });
  }, []);

  const signInWithGoogle = useCallback(() => {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      scope: 'email openid profile',
      redirect_uri: OAUTH_REDIRECT_URI,
      identity_provider: 'Google',
    });
    window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
  }, []);

  // Called by AuthCallback after exchanging the OAuth code for tokens.
  const setSessionFromOAuth = useCallback((idToken, accessToken, refreshToken) => {
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    const username = payload['cognito:username'] || payload.email || payload.sub;
    const prefix = `CognitoIdentityServiceProvider.${CLIENT_ID}`;
    localStorage.setItem(`${prefix}.LastAuthUser`, username);
    localStorage.setItem(`${prefix}.${username}.idToken`, idToken);
    localStorage.setItem(`${prefix}.${username}.accessToken`, accessToken);
    localStorage.setItem(`${prefix}.${username}.refreshToken`, refreshToken);
    setToken(idToken);
    setUser({
      email: payload.email,
      tenantId: payload['custom:tenant_id'] || null,
      role: payload['custom:role'] || null,
      sub: payload.sub,
    });
  }, []);

  // Refresh the ID token using the stored refresh token (called after google-tenant creation).
  const refreshSession = useCallback(async () => {
    const prefix = `CognitoIdentityServiceProvider.${CLIENT_ID}`;
    const lastUser = localStorage.getItem(`${prefix}.LastAuthUser`);
    const refreshToken = lastUser ? localStorage.getItem(`${prefix}.${lastUser}.refreshToken`) : null;
    if (!refreshToken || !COGNITO_DOMAIN) return;
    const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!res.ok) return;
    const { id_token, access_token } = await res.json();
    localStorage.setItem(`${prefix}.${lastUser}.idToken`, id_token);
    localStorage.setItem(`${prefix}.${lastUser}.accessToken`, access_token);
    const payload = JSON.parse(atob(id_token.split('.')[1]));
    setToken(id_token);
    setUser({
      email: payload.email,
      tenantId: payload['custom:tenant_id'] || null,
      role: payload['custom:role'] || null,
      sub: payload.sub,
    });
  }, []);

  const confirmForgotPassword = useCallback((email, code, newPassword) => {
    return new Promise((resolve, reject) => {
      if (!userPool) {
        reject(new Error('Cognito is not configured.'));
        return;
      }
      const cognitoUser = new CognitoUser({ Username: email.toLowerCase(), Pool: userPool });
      cognitoUser.confirmForgotPassword(code, newPassword, {
        onSuccess: resolve,
        onFailure: reject,
      });
    });
  }, []);

  const value = {
    user, token, loading, isAuthenticated: !!token, isDemoMode,
    signIn, signOut, signInWithGoogle,
    setSessionFromOAuth, refreshSession,
    forgotPassword, confirmForgotPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
