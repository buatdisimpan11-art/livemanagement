-- Add account_id to product_master table (make nullable first for existing data)
ALTER TABLE public.product_master ADD COLUMN account_id UUID REFERENCES public.shopee_accounts(id) ON DELETE CASCADE;

-- Create index for faster queries
CREATE INDEX idx_product_master_account ON public.product_master(account_id);