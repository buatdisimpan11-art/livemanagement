import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'mitra';

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const fetchRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      setRole((data?.role as AppRole) || 'mitra');
    } catch (error) {
      console.error('Error fetching role:', error);
      setRole('mitra');
    } finally {
      setRoleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (user) {
      setRoleLoading(true);
      fetchRole(user.id);
    } else {
      setRole(null);
      setRoleLoading(false);
    }
  }, [user, authLoading, fetchRole]);

  const isAdmin = role === 'admin';
  const loading = authLoading || roleLoading;

  return { role, isAdmin, loading };
}
