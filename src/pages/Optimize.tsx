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
import { useGlobalSelection } from '@/hooks/useGlobalSelection';
import { useStudiosQuery } from '@/hooks/useStudiosQuery';
import { useAccountsQuery } from '@/hooks/useAccountsQuery';

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
  const { selectedStudio, setSelectedStudio, selectedAccount, setSelectedAccount } = useGlobalSelection();
  const { data: studios = [], isLoading: studiosLoading } = useStudiosQuery();
  const { data: accounts = [], isLoading: accountsLoading } = useAccountsQuery(selectedStudio);
  
  const [csvProducts, setCsvProducts] = useState<CSVProduct[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [selectedReplacements, setSelectedReplacements] = useState<Set<string>>(new Set());
  const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([]);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'select' | 'upload' | 'choose' | 'result'>('select');
  const [activeTab, setActiveTab] = useState<'manual' | 'auto'>('auto');

  // Auto-select first studio when studios load
  useEffect(() => {
    if (studios.length > 0 && !selectedStudio) {
      setSelectedStudio(studios[0].id);
    }
  }, [studios, selectedStudio, setSelectedStudio]);

  // Auto-select first account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccount) {
      setSelectedAccount(accounts[0].id);
    }
  }, [accounts, selectedAccount, setSelectedAccount]);

  // Clear account when studio changes if account doesn't belong to new studio
  useEffect(() => {
    if (selectedAccount && accounts.length > 0) {
      const accountExists = accounts.some(a => a.id === selectedAccount);
      if (!accountExists) {
        setSelectedAccount(accounts[0].id);
      }
    } else if (accounts.length === 0 && selectedAccount) {
      setSelectedAccount('');
    }
  }, [accounts, selectedAccount, setSelectedAccount]);

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
                    <SelectValue placeholder={studiosLoading ? "Memuat..." : "Pilih studio"} />
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
                    <SelectValue placeholder={accountsLoading ? "Memuat..." : "Pilih akun"} />
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

            {studios.length === 0 && !studiosLoading && (
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
                onOptimizeComplete={() => {}}
              />
            </TabsContent>

            {/* Manual Mode - CSV Upload Flow */}
            <TabsContent value="manual" className="space-y-6">
              {step === 'select' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="w-5 h-5" />
                      Upload CSV Performa Shopee
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center">
                      <FileSpreadsheet className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                      <p className="text-lg font-medium mb-2">Upload file CSV dari Shopee Affiliate</p>
                      <p className="text-muted-foreground mb-6">
                        File harus memiliki kolom "Produk" dan "Produk Terjual(Pesanan Dibuat)"
                      </p>
                      <label>
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleCSVUpload}
                          className="hidden"
                        />
                        <Button variant="gradient" className="cursor-pointer" asChild>
                          <span>
                            <Upload className="w-5 h-5 mr-2" />
                            Pilih File CSV
                          </span>
                        </Button>
                      </label>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 'upload' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Pilih Produk yang Akan Diganti</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium">{csvProducts.length} produk ditemukan</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedToRemoveCount} produk dipilih untuk diganti
                        </p>
                      </div>
                      <Button 
                        variant="gradient" 
                        onClick={proceedToChooseReplacements}
                        disabled={selectedToRemoveCount === 0}
                      >
                        Lanjut Pilih Pengganti
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>

                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12"></TableHead>
                            <TableHead className="w-16">Rank</TableHead>
                            <TableHead>Nama Produk</TableHead>
                            <TableHead className="text-right">Klik</TableHead>
                            <TableHead className="text-right">Keranjang</TableHead>
                            <TableHead className="text-right">Terjual</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {csvProducts.map((product) => (
                            <TableRow 
                              key={product.rowIndex}
                              className={product.selected ? 'bg-destructive/10' : ''}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={product.selected}
                                  onCheckedChange={() => toggleProductSelection(product.rowIndex)}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{product.ranking}</TableCell>
                              <TableCell className="max-w-[300px] truncate">
                                {product.product_name}
                              </TableCell>
                              <TableCell className="text-right">{product.clicks?.toLocaleString('id-ID')}</TableCell>
                              <TableCell className="text-right">{product.addToCart?.toLocaleString('id-ID')}</TableCell>
                              <TableCell className="text-right">{product.sales.toLocaleString('id-ID')}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 'choose' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Pilih Produk Pengganti dari Gudang</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium">{availableProducts.length} produk tersedia di gudang</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedReplacements.size} produk dipilih sebagai pengganti
                        </p>
                      </div>
                      <Button 
                        variant="gradient" 
                        onClick={generateRecommendations}
                        disabled={processing || selectedReplacements.size === 0}
                      >
                        {processing ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Memproses...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 mr-2" />
                            Generate Rekomendasi
                          </>
                        )}
                      </Button>
                    </div>

                    {availableProducts.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Tidak ada produk tersedia di gudang</p>
                        <p className="text-sm mt-1">Tambah produk ke gudang terlebih dahulu</p>
                      </div>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12"></TableHead>
                              <TableHead>Nama Produk</TableHead>
                              <TableHead>Kategori</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {availableProducts.map((product) => (
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
                                <TableCell className="font-medium">{product.product_name}</TableCell>
                                <TableCell className="text-muted-foreground">{product.category || '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {step === 'result' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-success" />
                      Hasil Optimasi
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-success/10 rounded-lg border border-success/20">
                      <div>
                        <p className="font-medium text-success">Optimasi Berhasil!</p>
                        <p className="text-sm text-muted-foreground">
                          {recommendations.filter(r => r.isNew).length} produk baru ditambahkan
                        </p>
                      </div>
                      <Button variant="outline" onClick={downloadExcel}>
                        <Download className="w-4 h-4 mr-2" />
                        Download CSV
                      </Button>
                    </div>

                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">No</TableHead>
                            <TableHead>Nama Produk</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recommendations.map((product, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{idx + 1}</TableCell>
                              <TableCell>{product.product_name}</TableCell>
                              <TableCell>
                                {product.isNew ? (
                                  <span className="inline-flex items-center gap-1 text-success">
                                    <CheckCircle2 className="w-4 h-4" />
                                    BARU
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">Existing</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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
