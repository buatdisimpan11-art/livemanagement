import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeadProductAnalysis } from '@/components/optimize/DeadProductAnalysis';
import { 
  Zap, Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, 
  AlertTriangle, MousePointer, ShoppingCart, TrendingUp, Package, 
  ArrowRight, Skull, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Studio = Tables<'studios'>;
type ShopeeAccount = Tables<'shopee_accounts'>;
type Product = Tables<'product_master'>;

interface CSVProduct {
  product_name: string;
  sales: number;
  rowIndex: number;
  ranking?: number;
  clicks?: number;
  addToCart?: number;
  ordersCreated?: number;
  ordersShipped?: number;
  productsSoldCreated?: number;
  productsSoldShipped?: number;
  gmvCreated?: number;
  gmvShipped?: number;
  dataDate?: string;
  selected?: boolean;
}

interface RecommendedProduct {
  product_name: string;
  affiliate_link: string | null;
  isNew: boolean;
  id?: string;
}

export default function Optimize() {
  const { user } = useAuth();
  const [studios, setStudios] = useState<Studio[]>([]);
  const [accounts, setAccounts] = useState<ShopeeAccount[]>([]);
  const [selectedStudio, setSelectedStudio] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [csvProducts, setCsvProducts] = useState<CSVProduct[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [selectedReplacements, setSelectedReplacements] = useState<Set<string>>(new Set());
  const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([]);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'select' | 'upload' | 'choose' | 'result'>('select');
  const [activeTab, setActiveTab] = useState<'manual' | 'auto'>('auto');

  useEffect(() => {
    if (user) fetchStudios();
  }, [user]);

  useEffect(() => {
    if (selectedStudio) {
      fetchAccounts(selectedStudio);
    }
  }, [selectedStudio]);

  const fetchStudios = async () => {
    if (!user) return;
    const { data } = await supabase.from('studios').select('*').eq('user_id', user.id).order('name');
    setStudios(data || []);
    // Auto-select first studio
    if (data && data.length > 0 && !selectedStudio) {
      setSelectedStudio(data[0].id);
    }
  };

  const fetchAccounts = async (studioId: string) => {
    if (!user) return;
    const { data } = await supabase.from('shopee_accounts').select('*').eq('studio_id', studioId).order('name');
    setAccounts(data || []);
    // Auto-select first account
    if (data && data.length > 0) {
      setSelectedAccount(data[0].id);
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const handleCSVUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const cleanText = text.replace(/^\uFEFF/, '');
      const lines = cleanText.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast.error('File CSV kosong atau tidak valid');
        return;
      }

      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/"/g, ''));
      
      const dateIdx = headers.findIndex(h => h.includes('periode data'));
      const rankingIdx = headers.findIndex(h => h === 'ranking');
      const nameIdx = headers.findIndex(h => h === 'produk');
      const clicksIdx = headers.findIndex(h => h.includes('klik produk'));
      const cartIdx = headers.findIndex(h => h.includes('tambah ke keranjang'));
      const ordersCreatedIdx = headers.findIndex(h => h === 'pesanan(pesanan dibuat)');
      const ordersShippedIdx = headers.findIndex(h => h === 'pesanan(pesanan siap dikirim)');
      const salesIdx = headers.findIndex(h => h.includes('produk terjual') && h.includes('pesanan dibuat'));
      const salesShippedIdx = headers.findIndex(h => h.includes('produk terjual') && h.includes('siap dikirim'));
      const gmvCreatedIdx = headers.findIndex(h => h.includes('penjualan') && h.includes('pesanan dibuat'));
      const gmvShippedIdx = headers.findIndex(h => h.includes('penjualan') && h.includes('siap dikirim'));

      if (nameIdx === -1) {
        toast.error('Kolom "Produk" tidak ditemukan');
        return;
      }

      if (salesIdx === -1) {
        toast.error('Kolom "Produk Terjual(Pesanan Dibuat)" tidak ditemukan');
        return;
      }

      const parseRupiah = (value: string): number => {
        return parseFloat(value.replace(/[Rp.,\s]/g, '').replace(/,/g, '.')) || 0;
      };

      const parseDate = (value: string): string => {
        const parts = value.split('-');
        if (parts.length === 3) {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return value;
      };

      const products: CSVProduct[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const productName = values[nameIdx]?.replace(/"/g, '').trim();
        if (productName) {
          const salesValue = values[salesIdx] || '0';
          products.push({
            product_name: productName,
            sales: parseInt(salesValue.replace(/[^0-9]/g, '') || '0', 10),
            rowIndex: i,
            ranking: rankingIdx !== -1 ? parseInt(values[rankingIdx] || '0', 10) : i,
            clicks: clicksIdx !== -1 ? parseInt(values[clicksIdx]?.replace(/[^0-9]/g, '') || '0', 10) : 0,
            addToCart: cartIdx !== -1 ? parseInt(values[cartIdx]?.replace(/[^0-9]/g, '') || '0', 10) : 0,
            ordersCreated: ordersCreatedIdx !== -1 ? parseInt(values[ordersCreatedIdx]?.replace(/[^0-9]/g, '') || '0', 10) : 0,
            ordersShipped: ordersShippedIdx !== -1 ? parseInt(values[ordersShippedIdx]?.replace(/[^0-9]/g, '') || '0', 10) : 0,
            productsSoldCreated: parseInt(salesValue.replace(/[^0-9]/g, '') || '0', 10),
            productsSoldShipped: salesShippedIdx !== -1 ? parseInt(values[salesShippedIdx]?.replace(/[^0-9]/g, '') || '0', 10) : 0,
            gmvCreated: gmvCreatedIdx !== -1 ? parseRupiah(values[gmvCreatedIdx] || '0') : 0,
            gmvShipped: gmvShippedIdx !== -1 ? parseRupiah(values[gmvShippedIdx] || '0') : 0,
            dataDate: dateIdx !== -1 ? parseDate(values[dateIdx] || '') : new Date().toISOString().split('T')[0],
            selected: false,
          });
        }
      }

      if (products.length === 0) {
        toast.error('Tidak ada produk valid dalam file');
        return;
      }

      setCsvProducts(products);
      setStep('upload');
      toast.success(`${products.length} produk berhasil dibaca dari CSV`);
    } catch (error) {
      console.error('Error parsing CSV:', error);
      toast.error('Gagal membaca file CSV');
    }
    e.target.value = '';
  }, []);

  const toggleProductSelection = (rowIndex: number) => {
    setCsvProducts(prev => prev.map(p => 
      p.rowIndex === rowIndex ? { ...p, selected: !p.selected } : p
    ));
  };

  const proceedToChooseReplacements = async () => {
    const selectedToRemove = csvProducts.filter(p => p.selected);
    if (selectedToRemove.length === 0) {
      toast.error('Pilih minimal 1 produk yang akan diganti');
      return;
    }

    if (!user || !selectedAccount) return;

    const { data: masterProducts } = await supabase
      .from('product_master')
      .select('*')
      .eq('user_id', user.id)
      .eq('account_id', selectedAccount);

    const existingProductNames = csvProducts.map(p => p.product_name.toLowerCase());
    
    const available = (masterProducts || []).filter(p => 
      !existingProductNames.includes(p.product_name.toLowerCase())
    );

    setAvailableProducts(available);
    setSelectedReplacements(new Set());
    setStep('choose');
  };

  const toggleReplacementSelection = (productId: string) => {
    setSelectedReplacements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const generateRecommendations = async () => {
    if (!user || !selectedStudio || !selectedAccount) return;

    const selectedToRemove = csvProducts.filter(p => p.selected);
    const replacementProducts = availableProducts.filter(p => selectedReplacements.has(p.id));

    if (replacementProducts.length === 0) {
      toast.error('Pilih minimal 1 produk pengganti dari gudang');
      return;
    }

    setProcessing(true);
    try {
      await supabase
        .from('active_rotation')
        .delete()
        .eq('account_id', selectedAccount);

      const keptProducts = csvProducts.filter(p => !p.selected);
      const finalList: RecommendedProduct[] = [];
      
      for (const p of keptProducts.sort((a, b) => b.sales - a.sales)) {
        finalList.push({
          product_name: p.product_name,
          affiliate_link: null,
          isNew: false,
        });
      }

      const newRotations = [];
      for (const p of replacementProducts) {
        finalList.push({
          product_name: p.product_name,
          affiliate_link: p.affiliate_link,
          isNew: true,
          id: p.id,
        });
        newRotations.push({
          user_id: user.id,
          studio_id: selectedStudio,
          account_id: selectedAccount,
          product_name: p.product_name,
          product_uid: p.product_uid,
        });
      }

      for (const p of keptProducts) {
        newRotations.push({
          user_id: user.id,
          studio_id: selectedStudio,
          account_id: selectedAccount,
          product_name: p.product_name,
        });
      }

      if (newRotations.length > 0) {
        await supabase.from('active_rotation').insert(newRotations);
      }

      await supabase.from('optimization_history').insert({
        user_id: user.id,
        studio_id: selectedStudio,
        account_id: selectedAccount,
        products_removed: selectedToRemove.length,
        products_added: replacementProducts.length,
      });

      const dataDate = csvProducts[0]?.dataDate || new Date().toISOString().split('T')[0];
      
      await supabase
        .from('product_statistics')
        .delete()
        .eq('account_id', selectedAccount)
        .eq('data_date', dataDate);

      const statisticsData = csvProducts.map(p => ({
        user_id: user.id,
        account_id: selectedAccount,
        studio_id: selectedStudio,
        data_date: p.dataDate || dataDate,
        ranking: p.ranking || null,
        product_name: p.product_name,
        clicks: p.clicks || 0,
        add_to_cart: p.addToCart || 0,
        orders_created: p.ordersCreated || 0,
        orders_shipped: p.ordersShipped || 0,
        products_sold_created: p.productsSoldCreated || 0,
        products_sold_shipped: p.productsSoldShipped || 0,
        gmv_created: p.gmvCreated || 0,
        gmv_shipped: p.gmvShipped || 0,
      }));

      if (statisticsData.length > 0) {
        await supabase.from('product_statistics').insert(statisticsData);
      }

      const usedProductIds = replacementProducts.map(p => p.id);
      if (usedProductIds.length > 0) {
        await supabase
          .from('product_master')
          .delete()
          .in('id', usedProductIds);
      }

      setRecommendations(finalList);
      setStep('result');
      toast.success('Optimasi selesai! Produk pengganti sudah dihapus dari gudang.');
    } catch (error) {
      console.error('Error generating recommendations:', error);
      toast.error('Gagal menghasilkan rekomendasi');
    } finally {
      setProcessing(false);
    }
  };

  const downloadExcel = () => {
    const headers = ['No', 'Nama Produk', 'Link Afiliasi', 'Status'];
    const rows = recommendations.map((p, i) => [
      i + 1,
      `"${p.product_name}"`,
      p.affiliate_link || '',
      p.isNew ? 'BARU' : 'EXISTING'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `optimasi_${selectedAccount}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('File berhasil diunduh');
  };

  const resetFlow = () => {
    setStep('select');
    setCsvProducts([]);
    setRecommendations([]);
    setAvailableProducts([]);
    setSelectedReplacements(new Set());
  };

  const selectedStudioName = studios.find(s => s.id === selectedStudio)?.name;
  const selectedAccountName = accounts.find(a => a.id === selectedAccount)?.name;
  const selectedToRemoveCount = csvProducts.filter(p => p.selected).length;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Optimasi Live</h1>
            <p className="text-muted-foreground mt-1">Analisis dan ganti produk dead secara otomatis atau manual</p>
          </div>
          {step !== 'select' && activeTab === 'manual' && (
            <Button variant="outline" onClick={resetFlow}>
              Mulai Ulang
            </Button>
          )}
        </div>

        {/* Studio & Account Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Pilih Studio & Akun</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Studio</Label>
                <Select value={selectedStudio} onValueChange={setSelectedStudio}>
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
                <Label>Akun Shopee</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount} disabled={!selectedStudio}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {studios.length === 0 && (
              <div className="p-8 text-center">
                <AlertTriangle className="w-12 h-12 mx-auto text-warning mb-4" />
                <p className="text-muted-foreground">Anda perlu membuat studio dan akun terlebih dahulu</p>
                <Button variant="outline" className="mt-4" asChild>
                  <a href="/studios">Buat Studio</a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mode Tabs - Only show when account is selected */}
        {selectedAccount && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'manual' | 'auto')} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="auto" className="gap-2">
                <Skull className="w-4 h-4" />
                Auto (Analisis Dead)
              </TabsTrigger>
              <TabsTrigger value="manual" className="gap-2">
                <Upload className="w-4 h-4" />
                Manual (Upload CSV)
              </TabsTrigger>
            </TabsList>

            {/* Auto Mode - Dead Product Analysis */}
            <TabsContent value="auto" className="space-y-6">
              <DeadProductAnalysis
                studioId={selectedStudio}
                accountId={selectedAccount}
                accountName={selectedAccountName || ''}
                onOptimizeComplete={() => {
                  toast.success('Optimasi selesai!');
                }}
              />
            </TabsContent>

            {/* Manual Mode - CSV Upload */}
            <TabsContent value="manual" className="space-y-6">
              {/* Steps indicator */}
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl overflow-x-auto">
                <div className={`flex items-center gap-2 shrink-0 ${step === 'select' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'select' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>1</div>
                  <span className="hidden sm:inline">Upload CSV</span>
                </div>
                <div className="h-px flex-1 bg-border min-w-4" />
                <div className={`flex items-center gap-2 shrink-0 ${step === 'upload' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'upload' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>2</div>
                  <span className="hidden sm:inline">Pilih Diganti</span>
                </div>
                <div className="h-px flex-1 bg-border min-w-4" />
                <div className={`flex items-center gap-2 shrink-0 ${step === 'choose' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'choose' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>3</div>
                  <span className="hidden sm:inline">Pilih Pengganti</span>
                </div>
                <div className="h-px flex-1 bg-border min-w-4" />
                <div className={`flex items-center gap-2 shrink-0 ${step === 'result' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'result' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>4</div>
                  <span className="hidden sm:inline">Hasil</span>
                </div>
              </div>

              {/* Step 1: Upload CSV */}
              {step === 'select' && (
                <Card>
                  <CardContent className="p-8">
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 text-center">
                      <FileSpreadsheet className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Upload Laporan Live Shopee</h3>
                      <p className="text-muted-foreground mb-4">File CSV dengan data produk dan penjualan</p>
                      <Label htmlFor="csv-optimize" className="cursor-pointer">
                        <Button variant="gradient" asChild>
                          <span>
                            <Upload className="w-5 h-5" />
                            Pilih File CSV
                          </span>
                        </Button>
                        <input 
                          id="csv-optimize"
                          type="file" 
                          accept=".csv" 
                          onChange={handleCSVUpload}
                          className="hidden"
                        />
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Step 2: Select products to remove */}
              {step === 'upload' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Pilih Produk yang Akan Diganti - {selectedAccountName}</span>
                      <span className="text-sm font-normal text-muted-foreground">{selectedToRemoveCount} dipilih</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">Centang produk yang ingin diganti</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Pilih produk dengan performa rendah yang ingin Anda ganti dengan produk baru dari gudang
                        </p>
                      </div>
                    </div>

                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <div className="flex items-center gap-2 text-blue-500 mb-1">
                          <MousePointer className="w-4 h-4" />
                          <span className="text-xs font-medium">Total Klik</span>
                        </div>
                        <p className="text-xl font-bold">{csvProducts.reduce((s, p) => s + (p.clicks || 0), 0).toLocaleString('id-ID')}</p>
                      </div>
                      <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                        <div className="flex items-center gap-2 text-orange-500 mb-1">
                          <ShoppingCart className="w-4 h-4" />
                          <span className="text-xs font-medium">Masuk Keranjang</span>
                        </div>
                        <p className="text-xl font-bold">{csvProducts.reduce((s, p) => s + (p.addToCart || 0), 0).toLocaleString('id-ID')}</p>
                      </div>
                      <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <div className="flex items-center gap-2 text-green-500 mb-1">
                          <Package className="w-4 h-4" />
                          <span className="text-xs font-medium">Produk Terjual</span>
                        </div>
                        <p className="text-xl font-bold">{csvProducts.reduce((s, p) => s + (p.productsSoldCreated || 0), 0).toLocaleString('id-ID')}</p>
                      </div>
                      <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <div className="flex items-center gap-2 text-purple-500 mb-1">
                          <TrendingUp className="w-4 h-4" />
                          <span className="text-xs font-medium">GMV</span>
                        </div>
                        <p className="text-xl font-bold">
                          {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(csvProducts.reduce((s, p) => s + (p.gmvCreated || 0), 0))}
                        </p>
                      </div>
                    </div>

                    <div className="max-h-[400px] overflow-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">Ganti</TableHead>
                            <TableHead className="w-12">No</TableHead>
                            <TableHead>Nama Produk</TableHead>
                            <TableHead className="text-right">Klik</TableHead>
                            <TableHead className="text-right">Keranjang</TableHead>
                            <TableHead className="text-right">Terjual</TableHead>
                            <TableHead className="text-right">GMV</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...csvProducts]
                            .sort((a, b) => a.sales - b.sales)
                            .map((product, idx) => (
                              <TableRow key={product.rowIndex} className={product.selected ? 'bg-destructive/10' : ''}>
                                <TableCell>
                                  <Checkbox
                                    checked={product.selected}
                                    onCheckedChange={() => toggleProductSelection(product.rowIndex)}
                                  />
                                </TableCell>
                                <TableCell>{idx + 1}</TableCell>
                                <TableCell className="font-medium max-w-[250px] truncate" title={product.product_name}>{product.product_name}</TableCell>
                                <TableCell className="text-right">{(product.clicks || 0).toLocaleString('id-ID')}</TableCell>
                                <TableCell className="text-right">{(product.addToCart || 0).toLocaleString('id-ID')}</TableCell>
                                <TableCell className="text-right">{(product.productsSoldCreated || 0).toLocaleString('id-ID')}</TableCell>
                                <TableCell className="text-right text-xs">
                                  {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(product.gmvCreated || 0)}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex justify-end gap-3">
                      <Button variant="outline" onClick={resetFlow}>Batal</Button>
                      <Button variant="gradient" onClick={proceedToChooseReplacements} disabled={selectedToRemoveCount === 0}>
                        <ArrowRight className="w-5 h-5" />
                        Pilih Pengganti ({selectedToRemoveCount})
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Step 3: Choose replacement products */}
              {step === 'choose' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Pilih Produk Pengganti dari Gudang</span>
                      <span className="text-sm font-normal text-muted-foreground">{selectedReplacements.size} dipilih</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-warning">Pilih produk pengganti dari gudang akun ini</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Anda akan mengganti {selectedToRemoveCount} produk. Produk yang dipilih akan dihapus dari gudang setelah digunakan.
                        </p>
                      </div>
                    </div>

                    {availableProducts.length === 0 ? (
                      <div className="p-12 text-center">
                        <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                        <h3 className="text-xl font-semibold mb-2">Gudang Kosong</h3>
                        <p className="text-muted-foreground mb-6">Tidak ada produk di gudang untuk akun ini. Tambah produk ke gudang terlebih dahulu.</p>
                        <Button variant="outline" asChild>
                          <a href="/products">Ke Gudang Produk</a>
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="max-h-[400px] overflow-auto border rounded-lg">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">Pilih</TableHead>
                                <TableHead>Nama Produk</TableHead>
                                <TableHead>Kategori</TableHead>
                                <TableHead>Link</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {availableProducts.map((product) => (
                                <TableRow key={product.id} className={selectedReplacements.has(product.id) ? 'bg-success/10' : ''}>
                                  <TableCell>
                                    <Checkbox
                                      checked={selectedReplacements.has(product.id)}
                                      onCheckedChange={() => toggleReplacementSelection(product.id)}
                                    />
                                  </TableCell>
                                  <TableCell className="font-medium">{product.product_name}</TableCell>
                                  <TableCell className="text-muted-foreground">{product.category || '-'}</TableCell>
                                  <TableCell>
                                    {product.affiliate_link ? (
                                      <a 
                                        href={product.affiliate_link} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline text-sm"
                                      >
                                        Link
                                      </a>
                                    ) : '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        <div className="flex justify-between gap-3">
                          <Button variant="outline" onClick={() => setStep('upload')}>Kembali</Button>
                          <Button variant="gradient" onClick={generateRecommendations} disabled={processing || selectedReplacements.size === 0}>
                            {processing ? (
                              <>
                                <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                                Memproses...
                              </>
                            ) : (
                              <>
                                <Zap className="w-5 h-5" />
                                Proses Optimasi
                              </>
                            )}
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Step 4: Results */}
              {step === 'result' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Hasil Optimasi - {selectedAccountName}</span>
                      <Button variant="gradient" onClick={downloadExcel}>
                        <Download className="w-5 h-5" />
                        Download Excel
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[500px] overflow-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>No</TableHead>
                            <TableHead>Nama Produk</TableHead>
                            <TableHead>Link Afiliasi</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recommendations.map((product, idx) => (
                            <TableRow key={idx} className={product.isNew ? 'bg-success/10' : ''}>
                              <TableCell>{idx + 1}</TableCell>
                              <TableCell className="font-medium">{product.product_name}</TableCell>
                              <TableCell>
                                {product.affiliate_link ? (
                                  <a 
                                    href={product.affiliate_link} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline text-sm"
                                  >
                                    {product.affiliate_link.slice(0, 40)}...
                                  </a>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                {product.isNew ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-success/20 text-success rounded-full text-sm font-medium">
                                    <Zap className="w-3 h-3" /> BARU
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-sm">Existing</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="mt-6 p-4 bg-success/10 border border-success/20 rounded-lg">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-6 h-6 text-success" />
                        <div>
                          <p className="font-medium text-success">Optimasi Berhasil!</p>
                          <p className="text-sm text-muted-foreground">
                            {recommendations.filter(r => r.isNew).length} produk baru telah ditambahkan dan dihapus dari gudang.
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
