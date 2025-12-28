import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { BarChart3, TrendingUp, MousePointer, ShoppingCart, Package, Eye, CalendarIcon } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO, isWithinInterval, subDays } from 'date-fns';
import { id } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';
import type { DateRange } from 'react-day-picker';

type Studio = Tables<'studios'>;
type ShopeeAccount = Tables<'shopee_accounts'>;

interface ProductStatistic {
  id: string;
  data_date: string;
  product_name: string;
  ranking: number | null;
  clicks: number | null;
  add_to_cart: number | null;
  products_sold_created: number | null;
  gmv_created: number | null;
}

interface AggregatedStats {
  totalClicks: number;
  totalAddToCart: number;
  totalProductsSold: number;
  totalGMV: number;
  productCount: number;
  uploadDates: string[];
}

export default function Statistics() {
  const { user } = useAuth();
  const [studios, setStudios] = useState<Studio[]>([]);
  const [accounts, setAccounts] = useState<ShopeeAccount[]>([]);
  const [selectedStudio, setSelectedStudio] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [statistics, setStatistics] = useState<ProductStatistic[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'day' | 'yesterday' | 'week' | 'month' | 'year' | 'custom'>('day');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    if (user) fetchStudios();
  }, [user]);

  useEffect(() => {
    if (selectedStudio) {
      fetchAccounts(selectedStudio);
      setSelectedAccount('');
    }
  }, [selectedStudio]);

  useEffect(() => {
    if (selectedAccount) {
      fetchStatistics();
    }
  }, [selectedAccount]);

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

  const fetchStatistics = async () => {
    if (!user || !selectedAccount) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_statistics')
        .select('id, data_date, product_name, ranking, clicks, add_to_cart, products_sold_created, gmv_created')
        .eq('account_id', selectedAccount)
        .order('data_date', { ascending: false })
        .order('ranking', { ascending: true });

      if (error) throw error;
      setStatistics(data || []);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const aggregatedStats = useMemo((): AggregatedStats => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case 'yesterday':
        const yesterday = subDays(now, 1);
        startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
        endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
        break;
      case 'week':
        startDate = startOfWeek(now, { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'month':
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      case 'year':
        startDate = startOfYear(now);
        endDate = endOfYear(now);
        break;
      case 'custom':
        if (dateRange?.from && dateRange?.to) {
          startDate = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate(), 0, 0, 0);
          endDate = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59);
        } else {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        }
        break;
    }

    const filteredStats = statistics.filter(stat => {
      const statDate = parseISO(stat.data_date);
      return isWithinInterval(statDate, { start: startDate, end: endDate });
    });

    const uniqueDates = [...new Set(filteredStats.map(s => s.data_date))];

    return {
      totalClicks: filteredStats.reduce((sum, s) => sum + (s.clicks || 0), 0),
      totalAddToCart: filteredStats.reduce((sum, s) => sum + (s.add_to_cart || 0), 0),
      totalProductsSold: filteredStats.reduce((sum, s) => sum + (s.products_sold_created || 0), 0),
      totalGMV: filteredStats.reduce((sum, s) => sum + (Number(s.gmv_created) || 0), 0),
      productCount: filteredStats.length,
      uploadDates: uniqueDates,
    };
  }, [statistics, period, dateRange]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, ProductStatistic[]> = {};
    statistics.forEach(stat => {
      if (!groups[stat.data_date]) {
        groups[stat.data_date] = [];
      }
      groups[stat.data_date].push(stat);
    });
    return groups;
  }, [statistics]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const selectedAccountName = accounts.find(a => a.id === selectedAccount)?.name;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold">Statistik Produk</h1>
          <p className="text-muted-foreground mt-1">Lihat performa produk dari data CSV yang diupload</p>
        </div>

        {/* Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Studio</label>
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
                <label className="text-sm font-medium">Akun Shopee</label>
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
              <div className="space-y-2">
                <label className="text-sm font-medium">Periode</label>
                <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Hari Ini</SelectItem>
                    <SelectItem value="yesterday">Kemarin</SelectItem>
                    <SelectItem value="week">Minggu Ini</SelectItem>
                    <SelectItem value="month">Bulan Ini</SelectItem>
                    <SelectItem value="year">Tahun Ini</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {period === 'custom' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Rentang Tanggal</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !dateRange && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                          dateRange.to ? (
                            <>
                              {format(dateRange.from, "dd MMM", { locale: id })} -{" "}
                              {format(dateRange.to, "dd MMM yyyy", { locale: id })}
                            </>
                          ) : (
                            format(dateRange.from, "dd MMM yyyy", { locale: id })
                          )
                        ) : (
                          <span>Pilih tanggal</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange?.from}
                        selected={dateRange}
                        onSelect={setDateRange}
                        numberOfMonths={2}
                        locale={id}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedAccount && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <MousePointer className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Klik Produk</p>
                      <p className="text-2xl font-bold">{aggregatedStats.totalClicks.toLocaleString('id-ID')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500/20 rounded-lg">
                      <ShoppingCart className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Masuk Keranjang</p>
                      <p className="text-2xl font-bold">{aggregatedStats.totalAddToCart.toLocaleString('id-ID')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                      <Package className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Produk Terjual</p>
                      <p className="text-2xl font-bold">{aggregatedStats.totalProductsSold.toLocaleString('id-ID')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">GMV</p>
                      <p className="text-2xl font-bold">{formatCurrency(aggregatedStats.totalGMV)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Upload dates info */}
            {aggregatedStats.uploadDates.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarIcon className="w-4 h-4" />
                <span>Data tersedia: {aggregatedStats.uploadDates.map(d => format(parseISO(d), 'dd MMM yyyy', { locale: id })).join(', ')}</span>
              </div>
            )}

            {/* Data Table by Date */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Detail Produk - {selectedAccountName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : statistics.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Belum ada data statistik</p>
                    <p className="text-sm mt-1">Upload CSV dari halaman Optimasi untuk melihat statistik</p>
                  </div>
                ) : (
                  <Tabs defaultValue={Object.keys(groupedByDate)[0]} className="w-full">
                    <TabsList className="mb-4 flex-wrap h-auto gap-1">
                      {Object.keys(groupedByDate).slice(0, 7).map(date => (
                        <TabsTrigger key={date} value={date} className="text-xs">
                          {format(parseISO(date), 'dd MMM yyyy', { locale: id })}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    
                    {Object.entries(groupedByDate).slice(0, 7).map(([date, products]) => (
                      <TabsContent key={date} value={date}>
                        <div className="max-h-[500px] overflow-auto border rounded-lg">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16">Rank</TableHead>
                                <TableHead>Nama Produk</TableHead>
                                <TableHead className="text-right">Klik</TableHead>
                                <TableHead className="text-right">Keranjang</TableHead>
                                <TableHead className="text-right">Terjual</TableHead>
                                <TableHead className="text-right">GMV</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {products.map((product) => (
                                <TableRow key={product.id}>
                                  <TableCell className="font-medium">{product.ranking || '-'}</TableCell>
                                  <TableCell className="max-w-[300px] truncate" title={product.product_name}>
                                    {product.product_name}
                                  </TableCell>
                                  <TableCell className="text-right">{(product.clicks || 0).toLocaleString('id-ID')}</TableCell>
                                  <TableCell className="text-right">{(product.add_to_cart || 0).toLocaleString('id-ID')}</TableCell>
                                  <TableCell className="text-right">{(product.products_sold_created || 0).toLocaleString('id-ID')}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(Number(product.gmv_created) || 0)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        
                        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Total Klik:</span>
                              <span className="ml-2 font-medium">{products.reduce((s, p) => s + (p.clicks || 0), 0).toLocaleString('id-ID')}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Total Keranjang:</span>
                              <span className="ml-2 font-medium">{products.reduce((s, p) => s + (p.add_to_cart || 0), 0).toLocaleString('id-ID')}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Total Terjual:</span>
                              <span className="ml-2 font-medium">{products.reduce((s, p) => s + (p.products_sold_created || 0), 0).toLocaleString('id-ID')}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Total GMV:</span>
                              <span className="ml-2 font-medium">{formatCurrency(products.reduce((s, p) => s + (Number(p.gmv_created) || 0), 0))}</span>
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!selectedAccount && studios.length > 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">Pilih studio dan akun untuk melihat statistik</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
