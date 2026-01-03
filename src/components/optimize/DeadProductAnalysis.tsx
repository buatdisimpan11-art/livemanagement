import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Skull, TrendingDown, TrendingUp, Lock, 
  RefreshCw, Zap, AlertTriangle, CheckCircle2,
  MousePointer, ShoppingCart, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

interface DeadProduct {
  id: string;
  product_name: string;
  product_uid?: string;
  total_clicks: number;
  total_cart: number;
  total_orders: number;
  total_gmv: number;
  days_with_data: number;
  last_activity?: string;
  status: 'dead' | 'no_data' | 'underperforming' | 'active' | 'locked';
  locked_at?: string;
}

interface SuggestedReplacement {
  id: string;
  product_name: string;
  product_uid?: string;
  category?: string;
  historical_clicks: number;
  historical_orders: number;
  historical_gmv: number;
  conversion_rate: number;
}

interface AnalysisSummary {
  total_active: number;
  dead: number;
  underperforming: number;
  performing: number;
  locked: number;
}

interface Props {
  studioId: string;
  accountId: string;
  accountName: string;
  onOptimizeComplete: () => void;
}

export function DeadProductAnalysis({ studioId, accountId, accountName, onOptimizeComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [deadProducts, setDeadProducts] = useState<DeadProduct[]>([]);
  const [underperforming, setUnderperforming] = useState<DeadProduct[]>([]);
  const [activeProducts, setActiveProducts] = useState<DeadProduct[]>([]);
  const [lockedProducts, setLockedProducts] = useState<DeadProduct[]>([]);
  const [suggestedReplacements, setSuggestedReplacements] = useState<SuggestedReplacement[]>([]);
  const [selectedDead, setSelectedDead] = useState<Set<string>>(new Set());
  const [selectedReplacements, setSelectedReplacements] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'analyze' | 'select' | 'replace' | 'done'>('analyze');

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const result = await api.analyzeDead({
        studioId,
        accountId,
        daysThreshold: 7,
        minClicks: 10
      });

      setSummary(result.summary);
      setDeadProducts(result.deadProducts);
      setUnderperforming(result.underperforming);
      setActiveProducts(result.activeProducts);
      setLockedProducts(result.lockedProducts);
      setSuggestedReplacements(result.suggestedReplacements);
      setStep('select');
      toast.success('Analisis selesai');
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Gagal menganalisis produk');
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleDeadSelection = (id: string) => {
    setSelectedDead(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleReplacementSelection = (id: string) => {
    setSelectedReplacements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const proceedToReplace = () => {
    if (selectedDead.size === 0) {
      toast.error('Pilih minimal 1 produk dead untuk diganti');
      return;
    }
    setStep('replace');
  };

  const executeAutoOptimize = async () => {
    if (selectedDead.size === 0 || selectedReplacements.size === 0) {
      toast.error('Pilih produk dead dan pengganti');
      return;
    }

    if (selectedDead.size !== selectedReplacements.size) {
      toast.error(`Jumlah tidak cocok: ${selectedDead.size} dead vs ${selectedReplacements.size} pengganti`);
      return;
    }

    setLoading(true);
    try {
      const deadIds = Array.from(selectedDead);
      const replacements = suggestedReplacements
        .filter(r => selectedReplacements.has(r.id))
        .map(r => ({ product_name: r.product_name, product_uid: r.product_uid }));

      const result = await api.autoOptimize({
        studioId,
        accountId,
        deadProductIds: deadIds,
        replacementProducts: replacements
      });

      toast.success(`Berhasil! ${result.removed} produk diganti dengan ${result.added} produk baru`);
      setStep('done');
      onOptimizeComplete();
    } catch (error: any) {
      console.error('Auto optimize error:', error);
      toast.error(error.message || 'Gagal melakukan optimasi');
    } finally {
      setLoading(false);
    }
  };

  const resetAnalysis = () => {
    setStep('analyze');
    setSummary(null);
    setDeadProducts([]);
    setUnderperforming([]);
    setActiveProducts([]);
    setLockedProducts([]);
    setSuggestedReplacements([]);
    setSelectedDead(new Set());
    setSelectedReplacements(new Set());
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'dead':
        return <Badge variant="destructive" className="gap-1"><Skull className="w-3 h-3" />Dead</Badge>;
      case 'no_data':
        return <Badge variant="outline" className="gap-1 text-muted-foreground"><AlertTriangle className="w-3 h-3" />No Data</Badge>;
      case 'underperforming':
        return <Badge variant="secondary" className="gap-1 text-warning"><TrendingDown className="w-3 h-3" />Underperforming</Badge>;
      case 'active':
        return <Badge className="gap-1 bg-success text-success-foreground"><TrendingUp className="w-3 h-3" />Active</Badge>;
      case 'locked':
        return <Badge variant="outline" className="gap-1"><Lock className="w-3 h-3" />Locked</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (step === 'analyze') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Skull className="w-5 h-5 text-destructive" />
            Analisis Produk Dead - {accountName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-6 bg-muted/50 rounded-xl text-center">
            <Skull className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Deteksi Produk Dead</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Analisis produk yang tidak menghasilkan penjualan dalam 7 hari terakhir dan dapatkan saran pengganti otomatis.
            </p>
            <Button variant="gradient" size="lg" onClick={runAnalysis} disabled={analyzing}>
              {analyzing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Menganalisis...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Mulai Analisis
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'select' && summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Skull className="w-5 h-5 text-destructive" />
              Hasil Analisis - {accountName}
            </span>
            <Button variant="outline" size="sm" onClick={resetAnalysis}>
              <RefreshCw className="w-4 h-4" />
              Analisis Ulang
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-2xl font-bold">{summary.total_active}</p>
              <p className="text-xs text-muted-foreground">Total Aktif</p>
            </div>
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-destructive">{summary.dead}</p>
              <p className="text-xs text-destructive">Dead</p>
            </div>
            <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-warning">{summary.underperforming}</p>
              <p className="text-xs text-warning">Underperforming</p>
            </div>
            <div className="p-4 bg-success/10 border border-success/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-success">{summary.performing}</p>
              <p className="text-xs text-success">Performing</p>
            </div>
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-2xl font-bold">{summary.locked}</p>
              <p className="text-xs text-muted-foreground">Locked</p>
            </div>
          </div>

          {/* Dead & Underperforming Products */}
          {(deadProducts.length > 0 || underperforming.length > 0) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Produk Dead & Underperforming</h4>
                <span className="text-sm text-muted-foreground">{selectedDead.size} dipilih</span>
              </div>
              
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm">Centang produk yang ingin diganti dengan produk baru dari gudang.</p>
              </div>

              <div className="max-h-[300px] overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Ganti</TableHead>
                      <TableHead>Produk</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Klik</TableHead>
                      <TableHead className="text-right">Keranjang</TableHead>
                      <TableHead className="text-right">Order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...deadProducts, ...underperforming].map((product) => (
                      <TableRow 
                        key={product.id} 
                        className={selectedDead.has(product.id) ? 'bg-destructive/10' : ''}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedDead.has(product.id)}
                            onCheckedChange={() => toggleDeadSelection(product.id)}
                            disabled={product.status === 'locked'}
                          />
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate" title={product.product_name}>
                          {product.product_name}
                        </TableCell>
                        <TableCell>{getStatusBadge(product.status)}</TableCell>
                        <TableCell className="text-right">{product.total_clicks}</TableCell>
                        <TableCell className="text-right">{product.total_cart}</TableCell>
                        <TableCell className="text-right">{product.total_orders}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Active Products (collapsed) */}
          {activeProducts.length > 0 && (
            <details className="border rounded-lg">
              <summary className="p-3 cursor-pointer hover:bg-muted/50 font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-success" />
                Produk Performing ({activeProducts.length})
              </summary>
              <div className="p-3 border-t max-h-[200px] overflow-auto">
                <div className="space-y-1">
                  {activeProducts.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm py-1">
                      <span className="truncate">{p.product_name}</span>
                      <span className="text-success font-medium">{p.total_orders} order</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          )}

          {deadProducts.length === 0 && underperforming.length === 0 && (
            <div className="p-8 text-center bg-success/10 border border-success/20 rounded-xl">
              <CheckCircle2 className="w-12 h-12 mx-auto text-success mb-3" />
              <h3 className="text-lg font-semibold text-success">Semua Produk Performing!</h3>
              <p className="text-muted-foreground">Tidak ada produk dead atau underperforming yang perlu diganti.</p>
            </div>
          )}

          {(deadProducts.length > 0 || underperforming.length > 0) && (
            <div className="flex justify-end">
              <Button variant="gradient" onClick={proceedToReplace} disabled={selectedDead.size === 0}>
                <ArrowRight className="w-5 h-5" />
                Pilih Pengganti ({selectedDead.size})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (step === 'replace') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Pilih Produk Pengganti</span>
            <span className="text-sm font-normal text-muted-foreground">
              {selectedReplacements.size} / {selectedDead.size} dipilih
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-start gap-2">
            <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm">
              Pilih <strong>{selectedDead.size}</strong> produk pengganti dari gudang. 
              Produk diurutkan berdasarkan conversion rate historis.
            </p>
          </div>

          {suggestedReplacements.length === 0 ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-warning mb-3" />
              <h3 className="text-lg font-semibold">Gudang Kosong</h3>
              <p className="text-muted-foreground mb-4">Tidak ada produk pengganti di gudang.</p>
              <Button variant="outline" onClick={() => setStep('select')}>Kembali</Button>
            </div>
          ) : (
            <>
              <div className="max-h-[350px] overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Pilih</TableHead>
                      <TableHead>Produk</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">CVR</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suggestedReplacements.map((product) => (
                      <TableRow 
                        key={product.id} 
                        className={selectedReplacements.has(product.id) ? 'bg-success/10' : ''}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedReplacements.has(product.id)}
                            onCheckedChange={() => toggleReplacementSelection(product.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate" title={product.product_name}>
                          {product.product_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{product.category || '-'}</TableCell>
                        <TableCell className="text-right">
                          <span className={product.conversion_rate > 0 ? 'text-success font-medium' : ''}>
                            {product.conversion_rate}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{product.historical_orders}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('select')}>Kembali</Button>
                <Button 
                  variant="gradient" 
                  onClick={executeAutoOptimize} 
                  disabled={loading || selectedReplacements.size !== selectedDead.size}
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Jalankan Optimasi
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  if (step === 'done') {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-success mb-4" />
          <h3 className="text-2xl font-bold mb-2">Optimasi Berhasil!</h3>
          <p className="text-muted-foreground mb-6">
            Produk dead telah diganti dengan produk baru dari gudang.
          </p>
          <Button variant="gradient" onClick={resetAnalysis}>
            <RefreshCw className="w-5 h-5" />
            Analisis Lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
