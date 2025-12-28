-- Create table to store product statistics from CSV uploads
CREATE TABLE public.product_statistics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES public.shopee_accounts(id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  data_date DATE NOT NULL,
  ranking INTEGER,
  product_name TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  add_to_cart INTEGER DEFAULT 0,
  orders_created INTEGER DEFAULT 0,
  orders_shipped INTEGER DEFAULT 0,
  products_sold_created INTEGER DEFAULT 0,
  products_sold_shipped INTEGER DEFAULT 0,
  gmv_created DECIMAL(15,2) DEFAULT 0,
  gmv_shipped DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_product_statistics_user_date ON public.product_statistics(user_id, data_date);
CREATE INDEX idx_product_statistics_account ON public.product_statistics(account_id);
CREATE INDEX idx_product_statistics_studio ON public.product_statistics(studio_id);

-- Enable Row Level Security
ALTER TABLE public.product_statistics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own statistics"
ON public.product_statistics
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own statistics"
ON public.product_statistics
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own statistics"
ON public.product_statistics
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own statistics"
ON public.product_statistics
FOR DELETE
USING (auth.uid() = user_id);