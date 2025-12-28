import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Store, Users, Package, TrendingUp, Shield, Building } from 'lucide-react';

interface MitraStats {
  user_id: string;
  email: string;
  full_name: string | null;
  studios_count: number;
  accounts_count: number;
  products_count: number;
  rotations_today: number;
}

interface GlobalStats {
  totalMitra: number;
  totalStudios: number;
  totalAccounts: number;
  totalProducts: number;
  rotationsToday: number;
}

export default function AdminDashboard() {
  const [mitraList, setMitraList] = useState<MitraStats[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    totalMitra: 0,
    totalStudios: 0,
    totalAccounts: 0,
    totalProducts: 0,
    rotationsToday: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      // Fetch all profiles (mitra users)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, email, full_name');

      if (profilesError) throw profilesError;

      // Fetch global counts
      const [studiosRes, accountsRes, productsRes, historyRes] = await Promise.all([
        supabase.from('studios').select('id, user_id'),
        supabase.from('shopee_accounts').select('id, user_id'),
        supabase.from('product_master').select('id, user_id'),
        supabase.from('optimization_history')
          .select('id, user_id')
          .gte('created_at', new Date().toISOString().split('T')[0]),
      ]);

      const studios = studiosRes.data || [];
      const accounts = accountsRes.data || [];
      const products = productsRes.data || [];
      const histories = historyRes.data || [];

      // Calculate per-mitra stats
      const mitraStats: MitraStats[] = (profiles || []).map((profile) => ({
        user_id: profile.user_id,
        email: profile.email || 'N/A',
        full_name: profile.full_name,
        studios_count: studios.filter(s => s.user_id === profile.user_id).length,
        accounts_count: accounts.filter(a => a.user_id === profile.user_id).length,
        products_count: products.filter(p => p.user_id === profile.user_id).length,
        rotations_today: histories.filter(h => h.user_id === profile.user_id).length,
      }));

      setMitraList(mitraStats);
      setGlobalStats({
        totalMitra: profiles?.length || 0,
        totalStudios: studios.length,
        totalAccounts: accounts.length,
        totalProducts: products.length,
        rotationsToday: histories.length,
      });
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Mitra',
      value: globalStats.totalMitra,
      icon: Building,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Total Studio',
      value: globalStats.totalStudios,
      icon: Store,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      title: 'Total Akun Shopee',
      value: globalStats.totalAccounts,
      icon: Users,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Total Produk',
      value: globalStats.totalProducts,
      icon: Package,
      color: 'text-secondary-foreground',
      bgColor: 'bg-secondary',
    },
    {
      title: 'Rotasi Hari Ini',
      value: globalStats.rotationsToday,
      icon: TrendingUp,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Monitor semua aktivitas Mitra di LiveSync Studio
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{stat.title}</p>
                    <p className="text-2xl font-display font-bold">
                      {loading ? '...' : stat.value}
                    </p>
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
              <p className="text-muted-foreground text-center py-8">Belum ada mitra terdaftar</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mitra</TableHead>
                    <TableHead className="text-center">Studio</TableHead>
                    <TableHead className="text-center">Akun</TableHead>
                    <TableHead className="text-center">Produk</TableHead>
                    <TableHead className="text-center">Rotasi Hari Ini</TableHead>
                    <TableHead className="text-center">Status</TableHead>
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
                      <TableCell className="text-center">{mitra.rotations_today}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={mitra.studios_count > 0 ? 'default' : 'secondary'}>
                          {mitra.studios_count > 0 ? 'Aktif' : 'Baru'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
