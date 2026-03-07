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

  const value = { user, token, loading, signIn, signOut, isAuthenticated: !!token, isDemoMode };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
