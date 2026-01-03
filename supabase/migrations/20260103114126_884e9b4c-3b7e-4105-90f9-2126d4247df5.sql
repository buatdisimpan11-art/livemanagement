-- 1. Add product_uid column to existing tables
ALTER TABLE public.product_master ADD COLUMN product_uid TEXT;
ALTER TABLE public.active_rotation ADD COLUMN product_uid TEXT;
ALTER TABLE public.product_statistics ADD COLUMN product_uid TEXT;

-- 2. Create tenants table for rental tracking
CREATE TABLE public.tenants (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.shopee_accounts(id) ON DELETE CASCADE,
    product_uid TEXT NOT NULL,
    rented_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    returned_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- RLS policies for tenants
CREATE POLICY "Users can view own tenants" ON public.tenants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own tenants" ON public.tenants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tenants" ON public.tenants FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tenants" ON public.tenants FOR DELETE USING (auth.uid() = user_id);

-- 3. Create product_aliases table for CSV mapping
CREATE TABLE public.product_aliases (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    product_uid TEXT NOT NULL,
    alias_name TEXT NOT NULL,
    source TEXT DEFAULT 'csv',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for product_aliases
ALTER TABLE public.product_aliases ENABLE ROW LEVEL SECURITY;

-- RLS policies for product_aliases
CREATE POLICY "Users can view own aliases" ON public.product_aliases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own aliases" ON public.product_aliases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own aliases" ON public.product_aliases FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own aliases" ON public.product_aliases FOR DELETE USING (auth.uid() = user_id);

-- 4. Add unique constraint for product_uid per studio (prevents same product assigned to multiple accounts in same studio)
CREATE UNIQUE INDEX unique_active_product_per_studio 
ON public.tenants (studio_id, product_uid) 
WHERE returned_at IS NULL;

-- 5. Add indexes for performance
CREATE INDEX idx_product_master_uid ON public.product_master(product_uid);
CREATE INDEX idx_active_rotation_uid ON public.active_rotation(product_uid);
CREATE INDEX idx_product_statistics_uid ON public.product_statistics(product_uid);
CREATE INDEX idx_tenants_product_uid ON public.tenants(product_uid);
CREATE INDEX idx_product_aliases_uid ON public.product_aliases(product_uid);
CREATE INDEX idx_product_aliases_name ON public.product_aliases(alias_name);

-- 6. Add trigger for updated_at on new tables
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_aliases_updated_at
    BEFORE UPDATE ON public.product_aliases
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();