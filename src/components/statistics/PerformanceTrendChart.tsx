import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';

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

interface PerformanceTrendChartProps {
  statistics: ProductStatistic[];
}

const chartConfig = {
  clicks: {
    label: "Klik",
    color: "hsl(217, 91%, 60%)",
  },
  addToCart: {
    label: "Keranjang",
    color: "hsl(24, 95%, 53%)",
  },
  sold: {
    label: "Terjual",
    color: "hsl(142, 71%, 45%)",
  },
  gmv: {
    label: "GMV (Rp)",
    color: "hsl(280, 87%, 65%)",
  },
};

export function PerformanceTrendChart({ statistics }: PerformanceTrendChartProps) {
  const trendData = useMemo(() => {
    // Group by date and aggregate
    const groupedByDate: Record<string, {
      clicks: number;
      addToCart: number;
      sold: number;
      gmv: number;
    }> = {};

    statistics.forEach(stat => {
      if (!groupedByDate[stat.data_date]) {
        groupedByDate[stat.data_date] = {
          clicks: 0,
          addToCart: 0,
          sold: 0,
          gmv: 0,
        };
      }
      groupedByDate[stat.data_date].clicks += stat.clicks || 0;
      groupedByDate[stat.data_date].addToCart += stat.add_to_cart || 0;
      groupedByDate[stat.data_date].sold += stat.products_sold_created || 0;
      groupedByDate[stat.data_date].gmv += Number(stat.gmv_created) || 0;
    });

    // Convert to array and sort by date
    return Object.entries(groupedByDate)
      .map(([date, data]) => ({
        date,
        dateLabel: format(parseISO(date), 'dd MMM', { locale: id }),
        ...data,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [statistics]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}jt`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}rb`;
    }
    return value.toString();
  };

  if (trendData.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Tren Performa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <p>Minimal 2 tanggal data diperlukan untuk menampilkan grafik tren</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Tren Performa Harian
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
          <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="dateLabel" 
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              className="fill-muted-foreground"
            />
            <YAxis 
              yAxisId="left"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => value.toLocaleString('id-ID')}
              className="fill-muted-foreground"
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatCurrency}
              className="fill-muted-foreground"
            />
            <ChartTooltip 
              content={
                <ChartTooltipContent 
                  formatter={(value, name) => {
                    if (name === 'gmv') {
                      return new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        minimumFractionDigits: 0,
                      }).format(Number(value));
                    }
                    return Number(value).toLocaleString('id-ID');
                  }}
                />
              }
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="clicks"
              name="Klik"
              stroke={chartConfig.clicks.color}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="addToCart"
              name="Keranjang"
              stroke={chartConfig.addToCart.color}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="sold"
              name="Terjual"
              stroke={chartConfig.sold.color}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="gmv"
              name="GMV"
              stroke={chartConfig.gmv.color}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
