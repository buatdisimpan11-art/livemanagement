import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'mitra';

interface UserRoleContextType {
  role: AppRole | null;
  isAdmin: boolean;
  loading: boolean;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

export function UserRoleProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [fetchedForUser, setFetchedForUser] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setRole(null);
      setRoleLoading(false);
      setFetchedForUser(null);
      return;
    }

    // Skip if already fetched for this user
    if (fetchedForUser === user.id) {
      return;
    }

    const fetchRole = async () => {
      setRoleLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;
        setRole((data?.role as AppRole) || 'mitra');
        setFetchedForUser(user.id);
      } catch (error) {
        console.error('Error fetching role:', error);
        setRole('mitra');
        setFetchedForUser(user.id);
      } finally {
        setRoleLoading(false);
      }
    };

    fetchRole();
  }, [user, authLoading, fetchedForUser]);

  const isAdmin = role === 'admin';
  const loading = authLoading || roleLoading;

  return (
    <UserRoleContext.Provider value={{ role, isAdmin, loading }}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  const context = useContext(UserRoleContext);
  if (context === undefined) {
    throw new Error('useUserRole must be used within a UserRoleProvider');
  }
  return context;
}
