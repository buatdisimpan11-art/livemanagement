import { useState, useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'mitra';

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const fetchedUserId = useRef<string | null>(null);

  useEffect(() => {
    // Reset when user changes
    if (user?.id !== fetchedUserId.current) {
      setRoleLoading(true);
      setRole(null);
    }

    if (user) {
      fetchRole();
    } else {
      setRole(null);
      setRoleLoading(false);
      fetchedUserId.current = null;
    }
  }, [user]);

  const fetchRole = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      setRole((data?.role as AppRole) || 'mitra');
      fetchedUserId.current = user.id;
    } catch (error) {
      console.error('Error fetching role:', error);
      setRole('mitra');
      fetchedUserId.current = user.id;
    } finally {
      setRoleLoading(false);
    }
  };

  const isAdmin = role === 'admin';
  const loading = authLoading || roleLoading;

  return { role, isAdmin, loading };
}
