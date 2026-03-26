import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { getTenantConfig } from '../api/onboarding';

export function useTenantConfig() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['tenantConfig'],
    queryFn: getTenantConfig,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes — plan changes are infrequent
    retry: false,
  });
}

/** Convenience hook: returns { plan, isPro, isLoading }. */
export function usePlan() {
  const { data, isLoading } = useTenantConfig();
  const plan = data?.plan || 'free';
  return { plan, isPro: plan === 'pro', isLoading };
}
