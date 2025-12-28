import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Zap, Store, Users, Package, ArrowRight, CheckCircle } from 'lucide-react';

export default function Index() {
  const features = [
    { icon: Store, title: 'Multi Studio', desc: 'Kelola banyak studio dalam satu dashboard' },
    { icon: Users, title: 'Multi Akun', desc: 'Hubungkan semua akun Shopee Anda' },
    { icon: Package, title: 'Database Produk', desc: 'Ribuan produk siap dirotasi' },
    { icon: CheckCircle, title: 'Anti-Kanibal', desc: 'Tidak ada produk bentrok antar akun' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(175,84%,32%)] to-[hsl(190,84%,35%)] flex items-center justify-center shadow-lg">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-display font-bold text-lg">LiveSync</span>
              <span className="text-xs text-muted-foreground block -mt-1">Studio</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/auth">Masuk</Link>
            </Button>
            <Button variant="gradient" asChild>
              <Link to="/auth">Mulai Gratis</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>
        
        <div className="container mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            SaaS Manajemen Rotasi Produk Shopee
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold mb-6 leading-tight">
            Optimasi <span className="text-primary">Live Streaming</span>
            <br />Shopee Anda
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Sistem Anti-Kanibal yang memastikan tidak ada dua akun dalam studio yang sama mempromosikan produk identik.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="gradient" size="xl" asChild>
              <Link to="/auth">
                Mulai Sekarang
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <Button variant="outline" size="xl">
              Lihat Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto">
          <h2 className="text-3xl font-display font-bold text-center mb-12">
            Semua yang Anda Butuhkan
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <div 
                key={feature.title}
                className="p-6 rounded-2xl bg-card border border-border hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="bg-gradient-to-br from-[hsl(175,84%,32%)] to-[hsl(190,84%,35%)] rounded-3xl p-12 text-center text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4 relative z-10">
              Siap Meningkatkan Penjualan?
            </h2>
            <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto relative z-10">
              Mulai kelola rotasi produk live streaming Anda dengan lebih efisien hari ini.
            </p>
            <Button variant="secondary" size="xl" asChild className="relative z-10">
              <Link to="/auth">
                Daftar Gratis
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <span className="font-display font-semibold">LiveSync Studio</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2024 LiveSync Studio. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
