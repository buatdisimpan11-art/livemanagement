import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Zap, Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Studio = Tables<'studios'>;
type ShopeeAccount = Tables<'shopee_accounts'>;
type Product = Tables<'product_master'>;

interface CSVProduct {
  product_name: string;
  sales: number;
  rowIndex: number;
}

interface RecommendedProduct {
  product_name: string;
  affiliate_link: string | null;
  isNew: boolean;
}

export default function Optimize() {
  const { user } = useAuth();
  const [studios, setStudios] = useState<Studio[]>([]);
  const [accounts, setAccounts] = useState<ShopeeAccount[]>([]);
  const [selectedStudio, setSelectedStudio] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [csvProducts, setCsvProducts] = useState<CSVProduct[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([]);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'select' | 'upload' | 'result'>('select');

  useEffect(() => {
    if (user) fetchStudios();
  }, [user]);

  useEffect(() => {
    if (selectedStudio) {
      fetchAccounts(selectedStudio);
      setSelectedAccount('');
    }
  }, [selectedStudio]);

  const fetchStudios = async () => {
    if (!user) return;
    const { data } = await supabase.from('studios').select('*').eq('user_id', user.id).order('name');
    setStudios(data || []);
  };

  const fetchAccounts = async (studioId: string) => {
    if (!user) return;
    const { data } = await supabase.from('shopee_accounts').select('*').eq('studio_id', studioId).order('name');
    setAccounts(data || []);
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
      // Remove BOM if present
      const cleanText = text.replace(/^\uFEFF/, '');
      const lines = cleanText.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast.error('File CSV kosong atau tidak valid');
        return;
      }

      // Parse header - look for specific columns from Shopee export
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/"/g, ''));
      
      // Look for "Produk" column (product name)
      const nameIdx = headers.findIndex(h => h === 'produk');
      
      // Look for "Produk Terjual(Pesanan Dibuat)" column (products sold)
      const salesIdx = headers.findIndex(h => h.includes('produk terjual') && h.includes('pesanan dibuat'));

      if (nameIdx === -1) {
        toast.error('Kolom "Produk" tidak ditemukan');
        return;
      }

      if (salesIdx === -1) {
        toast.error('Kolom "Produk Terjual(Pesanan Dibuat)" tidak ditemukan');
        return;
      }

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

  const generateRecommendations = async () => {
    if (!user || !selectedStudio || !selectedAccount || csvProducts.length === 0) return;

    setProcessing(true);
    try {
      // Sort by sales (lowest first) and get bottom 5
      const sortedProducts = [...csvProducts].sort((a, b) => a.sales - b.sales);
      const productsToRemove = sortedProducts.slice(0, 5);
      const existingProductNames = csvProducts.map(p => p.product_name.toLowerCase());

      // Get products already in rotation for this studio (anti-cannibalization)
      const { data: rotationData } = await supabase
        .from('active_rotation')
        .select('product_name')
        .eq('studio_id', selectedStudio)
        .neq('account_id', selectedAccount);

      const usedProductNames = new Set(rotationData?.map(r => r.product_name.toLowerCase()) || []);

      // Get available products from master
      const { data: masterProducts } = await supabase
        .from('product_master')
        .select('*')
        .eq('user_id', user.id);

      // Filter: not in current CSV, not used by other accounts in same studio
      const availableProducts = (masterProducts || []).filter(p => {
        const nameLower = p.product_name.toLowerCase();
        return !existingProductNames.includes(nameLower) && !usedProductNames.has(nameLower);
      });

      // Select 5 replacement products
      const replacements = availableProducts.slice(0, 5);

      if (replacements.length < 5) {
        toast.warning(`Hanya ${replacements.length} produk pengganti tersedia`);
      }

      // Clear old rotations for this account
      await supabase
        .from('active_rotation')
        .delete()
        .eq('account_id', selectedAccount);

      // Build final recommendation list
      const finalList: RecommendedProduct[] = [];
      
      // Add existing products (except bottom 5)
      const keptProducts = sortedProducts.slice(5);
      for (const p of keptProducts.sort((a, b) => b.sales - a.sales)) {
        finalList.push({
          product_name: p.product_name,
          affiliate_link: null,
          isNew: false,
        });
      }

      // Add new recommendations
      const newRotations = [];
      for (const p of replacements) {
        finalList.push({
          product_name: p.product_name,
          affiliate_link: p.affiliate_link,
          isNew: true,
        });
        newRotations.push({
          user_id: user.id,
          studio_id: selectedStudio,
          account_id: selectedAccount,
          product_name: p.product_name,
        });
      }

      // Also add kept products to rotation
      for (const p of keptProducts) {
        newRotations.push({
          user_id: user.id,
          studio_id: selectedStudio,
          account_id: selectedAccount,
          product_name: p.product_name,
        });
      }

      // Save to active_rotation
      if (newRotations.length > 0) {
        await supabase.from('active_rotation').insert(newRotations);
      }

      // Record optimization history
      await supabase.from('optimization_history').insert({
        user_id: user.id,
        studio_id: selectedStudio,
        account_id: selectedAccount,
        products_removed: productsToRemove.length,
        products_added: replacements.length,
      });

      setRecommendations(finalList);
      setStep('result');
      toast.success('Optimasi selesai!');
    } catch (error) {
      console.error('Error generating recommendations:', error);
      toast.error('Gagal menghasilkan rekomendasi');
    } finally {
      setProcessing(false);
    }
  };

  const downloadExcel = () => {
    // Generate CSV content
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
  };

  const selectedStudioName = studios.find(s => s.id === selectedStudio)?.name;
  const selectedAccountName = accounts.find(a => a.id === selectedAccount)?.name;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Optimasi Live</h1>
            <p className="text-muted-foreground mt-1">Ganti produk tidak laku dengan rekomendasi anti-kanibal</p>
          </div>
          {step !== 'select' && (
            <Button variant="outline" onClick={resetFlow}>
              Mulai Ulang
            </Button>
          )}
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl">
          <div className={`flex items-center gap-2 ${step === 'select' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'select' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>1</div>
            <span className="hidden sm:inline">Pilih Akun</span>
          </div>
          <div className="h-px flex-1 bg-border" />
          <div className={`flex items-center gap-2 ${step === 'upload' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'upload' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>2</div>
            <span className="hidden sm:inline">Upload CSV</span>
          </div>
          <div className="h-px flex-1 bg-border" />
          <div className={`flex items-center gap-2 ${step === 'result' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'result' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>3</div>
            <span className="hidden sm:inline">Hasil</span>
          </div>
        </div>

        {/* Step 1: Select Studio & Account */}
        {step === 'select' && (
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

              {selectedAccount && (
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 text-center">
                  <FileSpreadsheet className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Upload Laporan Live Shopee</h3>
                  <p className="text-muted-foreground mb-4">File CSV dengan kolom nama produk dan penjualan</p>
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
              )}

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
        )}

        {/* Step 2: Review CSV Data */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Data CSV - {selectedAccountName}</span>
                <span className="text-sm font-normal text-muted-foreground">{csvProducts.length} produk</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-warning">5 produk dengan penjualan terendah akan diganti</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sistem akan mencari pengganti dari Gudang Produk yang tidak bentrok dengan akun lain di {selectedStudioName}
                  </p>
                </div>
              </div>

              <div className="max-h-[400px] overflow-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Nama Produk</TableHead>
                      <TableHead className="text-right">Produk Terjual</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...csvProducts]
                      .sort((a, b) => b.sales - a.sales)
                      .map((product, idx) => {
                        const isBottomFive = [...csvProducts].sort((a, b) => a.sales - b.sales).slice(0, 5).includes(product);
                        return (
                          <TableRow key={idx} className={isBottomFive ? 'bg-destructive/5' : ''}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell className="font-medium">{product.product_name}</TableCell>
                            <TableCell className="text-right">{product.sales.toLocaleString('id-ID')} pcs</TableCell>
                            <TableCell>
                              {isBottomFive ? (
                                <span className="inline-flex items-center gap-1 text-destructive text-sm">
                                  <XCircle className="w-4 h-4" /> Akan diganti
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-success text-sm">
                                  <CheckCircle2 className="w-4 h-4" /> Dipertahankan
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={resetFlow}>Batal</Button>
                <Button variant="gradient" onClick={generateRecommendations} disabled={processing}>
                  {processing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Generate Rekomendasi
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Results */}
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
                      {recommendations.filter(r => r.isNew).length} produk baru telah ditambahkan. 
                      Produk ini sudah di-lock untuk {selectedAccountName} dan tidak akan muncul untuk akun lain di {selectedStudioName}.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
