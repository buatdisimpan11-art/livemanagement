import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Plus, Upload, Trash2, Search, ExternalLink, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { useGlobalSelection } from '@/hooks/useGlobalSelection';
import { useStudiosQuery } from '@/hooks/useStudiosQuery';
import { useAccountsQuery } from '@/hooks/useAccountsQuery';

type Product = Tables<'product_master'>;

export default function Products() {
  const { user } = useAuth();
  const { selectedStudio, setSelectedStudio, selectedAccount, setSelectedAccount } = useGlobalSelection();
  const { data: studios = [], isLoading: studiosLoading } = useStudiosQuery();
  const { data: accounts = [], isLoading: accountsLoading } = useAccountsQuery(selectedStudio);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ product_name: '', affiliate_link: '', category: '' });
  const [uploading, setUploading] = useState(false);

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

  useEffect(() => {
    if (selectedAccount) {
      fetchProducts();
    } else {
      setProducts([]);
    }
  }, [selectedAccount]);

  const fetchProducts = async () => {
    if (!user || !selectedAccount) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_master')
        .select('*')
        .eq('user_id', user.id)
        .eq('account_id', selectedAccount)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Gagal memuat data produk');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedAccount) return;

    try {
      const { error } = await supabase
        .from('product_master')
        .insert({ 
          product_name: formData.product_name, 
          affiliate_link: formData.affiliate_link || null, 
          category: formData.category || null,
          user_id: user.id,
          account_id: selectedAccount,
        });
      if (error) throw error;
      toast.success('Produk berhasil ditambahkan');
      setDialogOpen(false);
      setFormData({ product_name: '', affiliate_link: '', category: '' });
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Gagal menyimpan produk');
    }
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Hapus produk "${product.product_name}"?`)) return;

    try {
      const { error } = await supabase.from('product_master').delete().eq('id', product.id);
      if (error) throw error;
      toast.success('Produk berhasil dihapus');
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Gagal menghapus produk');
    }
  };

  const handleCSVUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedAccount) return;

    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast.error('File CSV kosong atau tidak valid');
        return;
      }

      // Parse header
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const nameIdx = headers.findIndex(h => h.includes('product') || h.includes('nama') || h.includes('name'));
      const linkIdx = headers.findIndex(h => h.includes('link') || h.includes('url') || h.includes('affiliate'));
      const catIdx = headers.findIndex(h => h.includes('category') || h.includes('kategori'));

      if (nameIdx === -1) {
        toast.error('Kolom nama produk tidak ditemukan. Pastikan ada kolom "product_name" atau "nama"');
        return;
      }

      const productsToInsert = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const productName = values[nameIdx];
        if (productName) {
          productsToInsert.push({
            product_name: productName,
            affiliate_link: linkIdx !== -1 ? values[linkIdx] || null : null,
            category: catIdx !== -1 ? values[catIdx] || null : null,
            user_id: user.id,
            account_id: selectedAccount,
          });
        }
      }

      if (productsToInsert.length === 0) {
        toast.error('Tidak ada produk valid dalam file');
        return;
      }

      // Insert in batches
      const batchSize = 100;
      for (let i = 0; i < productsToInsert.length; i += batchSize) {
        const batch = productsToInsert.slice(i, i + batchSize);
        const { error } = await supabase.from('product_master').insert(batch);
        if (error) throw error;
      }

      toast.success(`${productsToInsert.length} produk berhasil diupload`);
      setUploadDialogOpen(false);
      fetchProducts();
    } catch (error) {
      console.error('Error uploading CSV:', error);
      toast.error('Gagal mengupload file CSV');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [user, selectedAccount]);

  const filteredProducts = products.filter(p => 
    p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedAccountName = accounts.find(a => a.id === selectedAccount)?.name;
  const isInitialLoading = studiosLoading || (selectedStudio && accountsLoading);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Gudang Produk</h1>
            <p className="text-muted-foreground mt-1">Database produk per akun Shopee untuk rotasi</p>
          </div>
          {selectedAccount && (
            <div className="flex gap-3">
              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="w-5 h-5" />
                    Upload CSV
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Produk dari CSV</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">
                        Produk akan ditambahkan ke akun: <span className="font-medium text-foreground">{selectedAccountName}</span>
                      </p>
                      <h4 className="font-medium mb-2">Format CSV yang didukung:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Kolom wajib: <code className="bg-background px-1 rounded">product_name</code> atau <code className="bg-background px-1 rounded">nama</code></li>
                        <li>• Kolom opsional: <code className="bg-background px-1 rounded">affiliate_link</code>, <code className="bg-background px-1 rounded">category</code></li>
                      </ul>
                    </div>
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                      <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <Label htmlFor="csv-upload" className="cursor-pointer">
                        <span className="text-primary hover:underline">Pilih file CSV</span>
                        <span className="text-muted-foreground"> atau drag & drop</span>
                      </Label>
                      <Input 
                        id="csv-upload"
                        type="file" 
                        accept=".csv" 
                        onChange={handleCSVUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                      {uploading && <p className="mt-2 text-sm text-muted-foreground">Mengupload...</p>}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="gradient">
                    <Plus className="w-5 h-5" />
                    Tambah Produk
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tambah Produk Baru</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      Akun: <span className="font-medium">{selectedAccountName}</span>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product_name">Nama Produk</Label>
                      <Input
                        id="product_name"
                        value={formData.product_name}
                        onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                        placeholder="Nama produk"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="affiliate_link">Link Afiliasi (opsional)</Label>
                      <Input
                        id="affiliate_link"
                        type="url"
                        value={formData.affiliate_link}
                        onChange={(e) => setFormData({ ...formData, affiliate_link: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">Kategori (opsional)</Label>
                      <Input
                        id="category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        placeholder="Fashion, Elektronik, dll"
                      />
                    </div>
                    <div className="flex gap-3 justify-end">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Batal
                      </Button>
                      <Button type="submit" variant="gradient">
                        Tambah
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        {/* Filter Studio & Account */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </CardContent>
        </Card>

        {selectedAccount && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-success/10">
                    <Package className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{products.length}</p>
                    <p className="text-sm text-muted-foreground">Produk di Gudang</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input 
                placeholder="Cari produk..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Products Table */}
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 text-center text-muted-foreground">Memuat...</div>
                ) : products.length === 0 ? (
                  <div className="p-12 text-center">
                    <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-xl font-semibold mb-2">Belum ada produk di akun ini</h3>
                    <p className="text-muted-foreground mb-6">Upload CSV atau tambah produk manual</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Produk</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead>Link</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.slice(0, 100).map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">{product.product_name}</TableCell>
                          <TableCell className="text-muted-foreground">{product.category || '-'}</TableCell>
                          <TableCell>
                            {product.affiliate_link ? (
                              <a 
                                href={product.affiliate_link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(product)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {filteredProducts.length > 100 && (
                  <div className="p-4 text-center text-muted-foreground text-sm border-t">
                    Menampilkan 100 dari {filteredProducts.length} produk. Gunakan pencarian untuk menemukan produk tertentu.
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!selectedAccount && !isInitialLoading && studios.length > 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Pilih Akun Shopee</h3>
              <p className="text-muted-foreground">Pilih studio dan akun untuk melihat produk</p>
            </CardContent>
          </Card>
        )}

        {!isInitialLoading && studios.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Belum Ada Studio</h3>
              <p className="text-muted-foreground mb-4">Buat studio terlebih dahulu untuk mengelola produk</p>
              <Button variant="outline" asChild>
                <a href="/studios">Buat Studio</a>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
