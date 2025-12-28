import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'mitra';

export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchRole();
    } else {
      setRole(null);
      setLoading(false);
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
    } catch (error) {
      console.error('Error fetching role:', error);
      setRole('mitra');
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = role === 'admin';

  return { role, isAdmin, loading };
}
