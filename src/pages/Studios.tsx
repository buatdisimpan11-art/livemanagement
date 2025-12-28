import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Store, Plus, Pencil, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Studio = Tables<'studios'>;

export default function Studios() {
  const { user } = useAuth();
  const [studios, setStudios] = useState<Studio[]>([]);
  const [accountCounts, setAccountCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStudio, setEditingStudio] = useState<Studio | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    if (user) fetchStudios();
  }, [user]);

  const fetchStudios = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('studios')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStudios(data || []);

      // Fetch account counts for each studio
      if (data && data.length > 0) {
        const counts: Record<string, number> = {};
        for (const studio of data) {
          const { count } = await supabase
            .from('shopee_accounts')
            .select('id', { count: 'exact', head: true })
            .eq('studio_id', studio.id);
          counts[studio.id] = count || 0;
        }
        setAccountCounts(counts);
      }
    } catch (error) {
      console.error('Error fetching studios:', error);
      toast.error('Gagal memuat data studio');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingStudio) {
        const { error } = await supabase
          .from('studios')
          .update({ name: formData.name, description: formData.description })
          .eq('id', editingStudio.id);
        if (error) throw error;
        toast.success('Studio berhasil diperbarui');
      } else {
        const { error } = await supabase
          .from('studios')
          .insert({ name: formData.name, description: formData.description, user_id: user.id });
        if (error) throw error;
        toast.success('Studio berhasil ditambahkan');
      }
      setDialogOpen(false);
      setEditingStudio(null);
      setFormData({ name: '', description: '' });
      fetchStudios();
    } catch (error) {
      console.error('Error saving studio:', error);
      toast.error('Gagal menyimpan studio');
    }
  };

  const handleEdit = (studio: Studio) => {
    setEditingStudio(studio);
    setFormData({ name: studio.name, description: studio.description || '' });
    setDialogOpen(true);
  };

  const handleDelete = async (studio: Studio) => {
    if (!confirm(`Hapus studio "${studio.name}"? Semua akun di dalamnya juga akan terhapus.`)) return;

    try {
      const { error } = await supabase.from('studios').delete().eq('id', studio.id);
      if (error) throw error;
      toast.success('Studio berhasil dihapus');
      fetchStudios();
    } catch (error) {
      console.error('Error deleting studio:', error);
      toast.error('Gagal menghapus studio');
    }
  };

  const openCreateDialog = () => {
    setEditingStudio(null);
    setFormData({ name: '', description: '' });
    setDialogOpen(true);
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Studios</h1>
            <p className="text-muted-foreground mt-1">Kelola studio live streaming Anda</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="gradient" onClick={openCreateDialog}>
                <Plus className="w-5 h-5" />
                Tambah Studio
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingStudio ? 'Edit Studio' : 'Tambah Studio Baru'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Studio</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Contoh: Studio A"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Deskripsi (opsional)</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Deskripsi singkat studio..."
                    rows={3}
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Batal
                  </Button>
                  <Button type="submit" variant="gradient">
                    {editingStudio ? 'Simpan' : 'Tambah'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-12 bg-muted rounded-lg mb-4" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : studios.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <Store className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Belum ada studio</h3>
              <p className="text-muted-foreground mb-6">Mulai dengan membuat studio pertama Anda</p>
              <Button variant="gradient" onClick={openCreateDialog}>
                <Plus className="w-5 h-5" />
                Tambah Studio
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {studios.map((studio) => (
              <Card key={studio.id} className="group hover:-translate-y-1 transition-all duration-300">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-xl bg-primary/10">
                      <Store className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(studio)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(studio)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-xl mb-2">{studio.name}</CardTitle>
                  {studio.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{studio.description}</p>
                  )}
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="w-4 h-4 mr-2" />
                    <span>{accountCounts[studio.id] || 0} Akun</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
