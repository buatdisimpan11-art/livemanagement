import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Plus, Pencil, Trash2, Store, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type ShopeeAccount = Tables<'shopee_accounts'>;
type Studio = Tables<'studios'>;

export default function Accounts() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<(ShopeeAccount & { studio_name?: string })[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ShopeeAccount | null>(null);
  const [formData, setFormData] = useState({ name: '', shop_url: '', studio_id: '' });

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    
    if (isInitialLoad) {
      setLoading(true);
    }
    
    try {
      const [accountsRes, studiosRes] = await Promise.all([
        supabase.from('shopee_accounts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('studios').select('*').eq('user_id', user.id).order('name'),
      ]);

      if (accountsRes.error) throw accountsRes.error;
      if (studiosRes.error) throw studiosRes.error;

      setStudios(studiosRes.data || []);
      
      // Map studio names to accounts
      const studioMap = new Map(studiosRes.data?.map(s => [s.id, s.name]) || []);
      const accountsWithStudio = (accountsRes.data || []).map(acc => ({
        ...acc,
        studio_name: studioMap.get(acc.studio_id) || 'Unknown'
      }));
      setAccounts(accountsWithStudio);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  }, [user?.id, isInitialLoad]);

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id, fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingAccount) {
        const { error } = await supabase
          .from('shopee_accounts')
          .update({ name: formData.name, shop_url: formData.shop_url, studio_id: formData.studio_id })
          .eq('id', editingAccount.id);
        if (error) throw error;
        toast.success('Akun berhasil diperbarui');
      } else {
        const { error } = await supabase
          .from('shopee_accounts')
          .insert({ 
            name: formData.name, 
            shop_url: formData.shop_url || null, 
            studio_id: formData.studio_id, 
            user_id: user.id 
          });
        if (error) throw error;
        toast.success('Akun berhasil ditambahkan');
      }
      setDialogOpen(false);
      setEditingAccount(null);
      setFormData({ name: '', shop_url: '', studio_id: '' });
      fetchData();
    } catch (error) {
      console.error('Error saving account:', error);
      toast.error('Gagal menyimpan akun');
    }
  };

  const handleEdit = (account: ShopeeAccount) => {
    setEditingAccount(account);
    setFormData({ name: account.name, shop_url: account.shop_url || '', studio_id: account.studio_id });
    setDialogOpen(true);
  };

  const handleDelete = async (account: ShopeeAccount) => {
    if (!confirm(`Hapus akun "${account.name}"?`)) return;

    try {
      const { error } = await supabase.from('shopee_accounts').delete().eq('id', account.id);
      if (error) throw error;
      toast.success('Akun berhasil dihapus');
      fetchData();
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Gagal menghapus akun');
    }
  };

  const openCreateDialog = () => {
    setEditingAccount(null);
    setFormData({ name: '', shop_url: '', studio_id: studios[0]?.id || '' });
    setDialogOpen(true);
  };

  // Memoize grouped accounts to prevent recalculation on every render
  const groupedAccounts = useMemo(() => {
    return accounts.reduce((acc, account) => {
      const studioId = account.studio_id;
      if (!acc[studioId]) {
        acc[studioId] = { name: account.studio_name || 'Unknown', accounts: [] };
      }
      acc[studioId].accounts.push(account);
      return acc;
    }, {} as Record<string, { name: string; accounts: typeof accounts }>);
  }, [accounts]);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Akun Shopee</h1>
            <p className="text-muted-foreground mt-1">Kelola akun toko Shopee Anda</p>
          </div>
          <Button variant="gradient" onClick={openCreateDialog} disabled={studios.length === 0}>
            <Plus className="w-5 h-5" />
            Tambah Akun
          </Button>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingAccount ? 'Edit Akun' : 'Tambah Akun Baru'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="studio">Studio</Label>
                  <Select value={formData.studio_id} onValueChange={(v) => setFormData({ ...formData, studio_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih studio" />
                    </SelectTrigger>
                    <SelectContent>
                      {studios.map((studio) => (
                        <SelectItem key={studio.id} value={studio.id}>
                          {studio.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Akun</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Contoh: Toko Berkah"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shop_url">URL Toko (opsional)</Label>
                  <Input
                    id="shop_url"
                    type="url"
                    value={formData.shop_url}
                    onChange={(e) => setFormData({ ...formData, shop_url: e.target.value })}
                    placeholder="https://shopee.co.id/..."
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Batal
                  </Button>
                  <Button type="submit" variant="gradient">
                    {editingAccount ? 'Simpan' : 'Tambah'}
                  </Button>
                </div>
              </form>
          </DialogContent>
        </Dialog>

        {isInitialLoad && loading ? (
          <div className="space-y-6">
            {[1, 2].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-6 bg-muted rounded w-1/4 mb-4" />
                  <div className="h-20 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : studios.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Store className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Buat Studio Terlebih Dahulu</h3>
              <p className="text-muted-foreground mb-6">Anda perlu membuat studio sebelum menambahkan akun</p>
              <Button variant="gradient" asChild>
                <a href="/studios">Buat Studio</a>
              </Button>
            </CardContent>
          </Card>
        ) : accounts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Users className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Belum ada akun</h3>
              <p className="text-muted-foreground mb-6">Mulai dengan menambahkan akun Shopee pertama Anda</p>
              <Button variant="gradient" onClick={openCreateDialog}>
                <Plus className="w-5 h-5" />
                Tambah Akun
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedAccounts).map(([studioId, group]) => (
              <div key={studioId}>
                <div className="flex items-center gap-2 mb-4">
                  <Store className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-display font-semibold">{group.name}</h2>
                  <span className="text-sm text-muted-foreground">({group.accounts.length} akun)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.accounts.map((account) => (
                    <Card key={account.id} className="group hover:-translate-y-1 transition-all duration-300">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="p-2.5 rounded-xl bg-accent/10">
                            <Users className="w-5 h-5 text-accent" />
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" onClick={() => handleEdit(account)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(account)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <h3 className="font-semibold text-lg mb-1">{account.name}</h3>
                        {account.shop_url && (
                          <a 
                            href={account.shop_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                          >
                            Lihat Toko <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
