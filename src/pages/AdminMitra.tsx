import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Store, Users, Package, TrendingUp, Shield, Plus, Trash2, Eye, Building } from 'lucide-react';
import { toast } from 'sonner';

interface MitraUser {
  id: string;
  email: string;
  created_at: string;
  user_metadata?: {
    full_name?: string;
  };
}

interface MitraStats {
  user_id: string;
  email: string;
  full_name: string | null;
  studios_count: number;
  accounts_count: number;
  products_count: number;
}

interface MitraDetails {
  studios: any[];
  accounts: any[];
  products: any[];
  recent_rotations: any[];
}

interface GlobalStats {
  totalMitra: number;
  totalStudios: number;
  totalAccounts: number;
  totalProducts: number;
}

export default function AdminMitra() {
  const [mitraList, setMitraList] = useState<MitraStats[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    totalMitra: 0,
    totalStudios: 0,
    totalAccounts: 0,
    totalProducts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedMitra, setSelectedMitra] = useState<MitraStats | null>(null);
  const [mitraDetails, setMitraDetails] = useState<MitraDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '', full_name: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchMitraData();
  }, []);

  const fetchMitraData = async () => {
    try {
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, email, full_name');

      if (profilesError) throw profilesError;

      // Fetch counts per user
      const [studiosRes, accountsRes, productsRes] = await Promise.all([
        supabase.from('studios').select('id, user_id'),
        supabase.from('shopee_accounts').select('id, user_id'),
        supabase.from('product_master').select('id, user_id'),
      ]);

      const studios = studiosRes.data || [];
      const accounts = accountsRes.data || [];
      const products = productsRes.data || [];

      const mitraStats: MitraStats[] = (profiles || []).map((profile) => ({
        user_id: profile.user_id,
        email: profile.email || 'N/A',
        full_name: profile.full_name,
        studios_count: studios.filter(s => s.user_id === profile.user_id).length,
        accounts_count: accounts.filter(a => a.user_id === profile.user_id).length,
        products_count: products.filter(p => p.user_id === profile.user_id).length,
      }));

      setMitraList(mitraStats);
      setGlobalStats({
        totalMitra: profiles?.length || 0,
        totalStudios: studios.length,
        totalAccounts: accounts.length,
        totalProducts: products.length,
      });
    } catch (error) {
      console.error('Error fetching mitra data:', error);
      toast.error('Gagal memuat data mitra');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMitra = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-api', {
        body: {
          action: 'create_user',
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Mitra berhasil ditambahkan');
      setDialogOpen(false);
      setFormData({ email: '', password: '', full_name: '' });
      fetchMitraData();
    } catch (error: any) {
      console.error('Error creating mitra:', error);
      toast.error(error.message || 'Gagal menambahkan mitra');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMitra = async (mitra: MitraStats) => {
    if (!confirm(`Hapus mitra "${mitra.full_name || mitra.email}"? Semua data mitra ini akan terhapus permanen.`)) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('admin-api', {
        body: {
          action: 'delete_user',
          user_id: mitra.user_id,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Mitra berhasil dihapus');
      fetchMitraData();
    } catch (error: any) {
      console.error('Error deleting mitra:', error);
      toast.error(error.message || 'Gagal menghapus mitra');
    }
  };

  const handleViewDetails = async (mitra: MitraStats) => {
    setSelectedMitra(mitra);
    setDetailsOpen(true);
    setDetailsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-api', {
        body: {
          action: 'get_user_details',
          user_id: mitra.user_id,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setMitraDetails(data);
    } catch (error: any) {
      console.error('Error fetching mitra details:', error);
      toast.error('Gagal memuat detail mitra');
    } finally {
      setDetailsLoading(false);
    }
  };

  const statCards = [
    { title: 'Total Mitra', value: globalStats.totalMitra, icon: Building, color: 'text-primary', bgColor: 'bg-primary/10' },
    { title: 'Total Studio', value: globalStats.totalStudios, icon: Store, color: 'text-accent', bgColor: 'bg-accent/10' },
    { title: 'Total Akun', value: globalStats.totalAccounts, icon: Users, color: 'text-success', bgColor: 'bg-success/10' },
    { title: 'Total Produk', value: globalStats.totalProducts, icon: Package, color: 'text-warning', bgColor: 'bg-warning/10' },
  ];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold">Kelola Mitra</h1>
              <p className="text-muted-foreground mt-1">Tambah, hapus, dan kelola semua mitra</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="gradient">
                <Plus className="w-5 h-5" />
                Tambah Mitra
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Mitra Baru</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateMitra} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nama Lengkap</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="Nama mitra"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Minimal 6 karakter"
                    minLength={6}
                    required
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Batal
                  </Button>
                  <Button type="submit" variant="gradient" disabled={submitting}>
                    {submitting ? 'Menambahkan...' : 'Tambah Mitra'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{stat.title}</p>
                    <p className="text-2xl font-display font-bold">{loading ? '...' : stat.value}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Mitra Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-display">Daftar Mitra</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : mitraList.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Belum ada mitra terdaftar</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mitra</TableHead>
                    <TableHead className="text-center">Studio</TableHead>
                    <TableHead className="text-center">Akun</TableHead>
                    <TableHead className="text-center">Produk</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mitraList.map((mitra) => (
                    <TableRow key={mitra.user_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{mitra.full_name || 'Belum diisi'}</p>
                          <p className="text-sm text-muted-foreground">{mitra.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{mitra.studios_count}</TableCell>
                      <TableCell className="text-center">{mitra.accounts_count}</TableCell>
                      <TableCell className="text-center">{mitra.products_count}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={mitra.studios_count > 0 ? 'default' : 'secondary'}>
                          {mitra.studios_count > 0 ? 'Aktif' : 'Baru'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => handleViewDetails(mitra)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDeleteMitra(mitra)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Mitra Details Sheet */}
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Detail Mitra
              </SheetTitle>
            </SheetHeader>
            {selectedMitra && (
              <div className="mt-6 space-y-6">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="font-semibold text-lg">{selectedMitra.full_name || 'Belum diisi'}</p>
                  <p className="text-sm text-muted-foreground">{selectedMitra.email}</p>
                </div>

                {detailsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-20 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : mitraDetails && (
                  <>
                    {/* Studios */}
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Store className="w-4 h-4" /> Studio ({mitraDetails.studios.length})
                      </h4>
                      {mitraDetails.studios.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Belum ada studio</p>
                      ) : (
                        <div className="space-y-2">
                          {mitraDetails.studios.map((studio: any) => (
                            <div key={studio.id} className="p-3 bg-muted/30 rounded-lg">
                              <p className="font-medium">{studio.name}</p>
                              {studio.description && <p className="text-sm text-muted-foreground">{studio.description}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Accounts */}
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Users className="w-4 h-4" /> Akun Shopee ({mitraDetails.accounts.length})
                      </h4>
                      {mitraDetails.accounts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Belum ada akun</p>
                      ) : (
                        <div className="space-y-2">
                          {mitraDetails.accounts.map((account: any) => (
                            <div key={account.id} className="p-3 bg-muted/30 rounded-lg">
                              <p className="font-medium">{account.name}</p>
                              <p className="text-sm text-muted-foreground">Studio: {account.studios?.name || '-'}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Products Summary */}
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Package className="w-4 h-4" /> Produk Master
                      </h4>
                      <p className="text-sm text-muted-foreground">Total {mitraDetails.products.length} produk</p>
                    </div>

                    {/* Recent Rotations */}
                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" /> Rotasi Terakhir
                      </h4>
                      {mitraDetails.recent_rotations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Belum ada aktivitas</p>
                      ) : (
                        <div className="space-y-2">
                          {mitraDetails.recent_rotations.map((rotation: any) => (
                            <div key={rotation.id} className="p-3 bg-muted/30 rounded-lg text-sm">
                              <p>+{rotation.products_added || 0} / -{rotation.products_removed || 0} produk</p>
                              <p className="text-muted-foreground">{new Date(rotation.created_at).toLocaleDateString('id-ID')}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </AppLayout>
  );
}
