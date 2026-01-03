import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Tables } from '@/integrations/supabase/types';

type ShopeeAccount = Tables<'shopee_accounts'>;

export function useAccountsQuery(studioId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['accounts', studioId],
    queryFn: async () => {
      if (!user || !studioId) return [];
      const { data, error } = await supabase
        .from('shopee_accounts')
        .select('*')
        .eq('studio_id', studioId)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!studioId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: { name: string; studio_id: string; shop_url?: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { data: account, error } = await supabase
        .from('shopee_accounts')
        .insert({ ...data, user_id: user.id })
        .select()
        .single();
      
      if (error) throw error;
      return account;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['accounts', variables.studio_id] });
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, studioId, data }: { id: string; studioId: string; data: Partial<ShopeeAccount> }) => {
      const { error } = await supabase
        .from('shopee_accounts')
        .update(data)
        .eq('id', id);
      
      if (error) throw error;
      return studioId;
    },
    onSuccess: (studioId) => {
      queryClient.invalidateQueries({ queryKey: ['accounts', studioId] });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, studioId }: { id: string; studioId: string }) => {
      const { error } = await supabase
        .from('shopee_accounts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return studioId;
    },
    onSuccess: (studioId) => {
      queryClient.invalidateQueries({ queryKey: ['accounts', studioId] });
    },
  });
}
