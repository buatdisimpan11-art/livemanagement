-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'mitra');

-- User roles table (security best practice - roles separate from profiles)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'mitra',
    UNIQUE (user_id, role)
);

-- Profiles table for user info
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Studios table
CREATE TABLE public.studios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shopee accounts table
CREATE TABLE public.shopee_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    studio_id UUID REFERENCES public.studios(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    shop_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product master (warehouse)
CREATE TABLE public.product_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    product_name TEXT NOT NULL,
    affiliate_link TEXT,
    category TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Active rotation tracking (the anti-cannibalization logic)
CREATE TABLE public.active_rotation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    studio_id UUID REFERENCES public.studios(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES public.shopee_accounts(id) ON DELETE CASCADE NOT NULL,
    product_name TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    locked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(studio_id, account_id, product_name)
);

-- Optimization history
CREATE TABLE public.optimization_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    studio_id UUID REFERENCES public.studios(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES public.shopee_accounts(id) ON DELETE CASCADE NOT NULL,
    products_removed INTEGER DEFAULT 0,
    products_added INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopee_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_rotation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimization_history ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles" ON public.user_roles
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for studios
CREATE POLICY "Users can view own studios" ON public.studios
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own studios" ON public.studios
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own studios" ON public.studios
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own studios" ON public.studios
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all studios" ON public.studios
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for shopee_accounts
CREATE POLICY "Users can view own accounts" ON public.shopee_accounts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own accounts" ON public.shopee_accounts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts" ON public.shopee_accounts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts" ON public.shopee_accounts
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for product_master
CREATE POLICY "Users can view own products" ON public.product_master
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own products" ON public.product_master
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own products" ON public.product_master
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own products" ON public.product_master
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for active_rotation
CREATE POLICY "Users can view own rotations" ON public.active_rotation
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own rotations" ON public.active_rotation
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rotations" ON public.active_rotation
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own rotations" ON public.active_rotation
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for optimization_history
CREATE POLICY "Users can view own history" ON public.optimization_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own history" ON public.optimization_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trigger for creating profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email, full_name)
    VALUES (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'mitra');
    
    RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_studios_updated_at BEFORE UPDATE ON public.studios
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shopee_accounts_updated_at BEFORE UPDATE ON public.shopee_accounts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();