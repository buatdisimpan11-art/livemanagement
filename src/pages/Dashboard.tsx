import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Store, Users, Package, Zap, TrendingUp, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface Stats {
  studios: number;
  accounts: number;
  products: number;
  rotationsToday: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ studios: 0, accounts: 0, products: 0, rotationsToday: 0 });
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ full_name: string | null }>({ full_name: null });

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (profileData) setProfile(profileData);

      // Fetch counts
      const [studiosRes, accountsRes, productsRes, historyRes] = await Promise.all([
        supabase.from('studios').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('shopee_accounts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('product_master').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('optimization_history')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', new Date().toISOString().split('T')[0]),
      ]);

      setStats({
        studios: studiosRes.count || 0,
        accounts: accountsRes.count || 0,
        products: productsRes.count || 0,
        rotationsToday: historyRes.count || 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Studio',
      value: stats.studios,
      icon: Store,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      link: '/studios',
    },
    {
      title: 'Akun Shopee',
      value: stats.accounts,
      icon: Users,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      link: '/accounts',
    },
    {
      title: 'Produk Master',
      value: stats.products,
      icon: Package,
      color: 'text-success',
      bgColor: 'bg-success/10',
      link: '/products',
    },
    {
      title: 'Rotasi Hari Ini',
      value: stats.rotationsToday,
      icon: TrendingUp,
      color: 'text-secondary-foreground',
      bgColor: 'bg-secondary',
      link: '/optimize',
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">
              Halo, {profile.full_name || user?.email?.split('@')[0] || 'Mitra'} 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              Selamat datang di LiveSync Studio. Kelola rotasi produk Anda dengan mudah.
            </p>
          </div>
          <Button variant="gradient" size="lg" asChild>
            <Link to="/optimize">
              <Zap className="w-5 h-5" />
              Mulai Optimasi
            </Link>
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <Link key={stat.title} to={stat.link}>
              <Card 
                className="stat-card group cursor-pointer hover:-translate-y-1 transition-all duration-300"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">{stat.title}</p>
                      <p className="text-3xl font-display font-bold">{loading ? '...' : stat.value}</p>
                    </div>
                    <div className={`p-3 rounded-xl ${stat.bgColor} transition-transform duration-300 group-hover:scale-110`}>
                      <stat.icon className={`w-6 h-6 ${stat.color}`} />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-sm text-muted-foreground">
                    <span>Lihat detail</span>
                    <ArrowUpRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-display">Mulai Cepat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/studios">
                  <Store className="w-5 h-5 mr-3 text-primary" />
                  Tambah Studio Baru
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/accounts">
                  <Users className="w-5 h-5 mr-3 text-accent" />
                  Tambah Akun Shopee
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/products">
                  <Package className="w-5 h-5 mr-3 text-success" />
                  Upload Produk Master
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="gradient-primary text-primary-foreground overflow-hidden relative">
            <div className="absolute top-0 right-0 w-40 h-40 bg-primary-foreground/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <CardContent className="p-6 relative z-10">
              <Zap className="w-12 h-12 mb-4 opacity-80" />
              <h3 className="text-2xl font-display font-bold mb-2">Sistem Anti-Kanibal</h3>
              <p className="opacity-90 mb-4">
                Algoritma cerdas kami memastikan tidak ada dua akun dalam satu studio yang mempromosikan produk yang sama.
              </p>
              <Button variant="secondary" asChild>
                <Link to="/optimize">
                  Coba Sekarang
                  <ArrowUpRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
