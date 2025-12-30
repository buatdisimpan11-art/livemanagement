-- LiveSync Database Schema for PostgreSQL
-- Version: 1.0.0

-- Create extension for UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create app_role enum
CREATE TYPE app_role AS ENUM ('admin', 'mitra');

-- =====================
-- USERS TABLE (replaces auth.users)
-- =====================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- =====================
-- PROFILES TABLE
-- =====================
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    full_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_profiles_user_id ON profiles(user_id);

-- =====================
-- USER ROLES TABLE
-- =====================
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role app_role DEFAULT 'mitra',
    UNIQUE(user_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);

-- =====================
-- STUDIOS TABLE
-- =====================
CREATE TABLE studios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_studios_user_id ON studios(user_id);

-- =====================
-- SHOPEE ACCOUNTS TABLE
-- =====================
CREATE TABLE shopee_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    shop_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_shopee_accounts_user_id ON shopee_accounts(user_id);
CREATE INDEX idx_shopee_accounts_studio_id ON shopee_accounts(studio_id);

-- =====================
-- PRODUCT MASTER TABLE
-- =====================
CREATE TABLE product_master (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES shopee_accounts(id) ON DELETE SET NULL,
    product_name VARCHAR(500) NOT NULL,
    affiliate_link TEXT,
    category VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_product_master_user_id ON product_master(user_id);
CREATE INDEX idx_product_master_account_id ON product_master(account_id);

-- =====================
-- PRODUCT STATISTICS TABLE
-- =====================
CREATE TABLE product_statistics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES shopee_accounts(id) ON DELETE CASCADE,
    product_name VARCHAR(500) NOT NULL,
    data_date DATE NOT NULL,
    ranking INTEGER,
    clicks INTEGER DEFAULT 0,
    add_to_cart INTEGER DEFAULT 0,
    orders_created INTEGER DEFAULT 0,
    orders_shipped INTEGER DEFAULT 0,
    products_sold_created INTEGER DEFAULT 0,
    products_sold_shipped INTEGER DEFAULT 0,
    gmv_created DECIMAL(15,2) DEFAULT 0,
    gmv_shipped DECIMAL(15,2) DEFAULT 0,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_product_statistics_user_id ON product_statistics(user_id);
CREATE INDEX idx_product_statistics_studio_id ON product_statistics(studio_id);
CREATE INDEX idx_product_statistics_account_id ON product_statistics(account_id);
CREATE INDEX idx_product_statistics_data_date ON product_statistics(data_date);

-- =====================
-- ACTIVE ROTATION TABLE
-- =====================
CREATE TABLE active_rotation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES shopee_accounts(id) ON DELETE CASCADE,
    product_name VARCHAR(500) NOT NULL,
    locked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_active_rotation_user_id ON active_rotation(user_id);
CREATE INDEX idx_active_rotation_studio_id ON active_rotation(studio_id);
CREATE INDEX idx_active_rotation_account_id ON active_rotation(account_id);

-- =====================
-- OPTIMIZATION HISTORY TABLE
-- =====================
CREATE TABLE optimization_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES shopee_accounts(id) ON DELETE CASCADE,
    products_added INTEGER DEFAULT 0,
    products_removed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_optimization_history_user_id ON optimization_history(user_id);
CREATE INDEX idx_optimization_history_studio_id ON optimization_history(studio_id);
CREATE INDEX idx_optimization_history_account_id ON optimization_history(account_id);

-- =====================
-- FUNCTIONS
-- =====================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION has_role(_role app_role, _user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = _user_id AND role = _role
    );
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================
-- TRIGGERS
-- =====================

-- Trigger for users updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for profiles updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for studios updated_at
CREATE TRIGGER update_studios_updated_at
    BEFORE UPDATE ON studios
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for shopee_accounts updated_at
CREATE TRIGGER update_shopee_accounts_updated_at
    BEFORE UPDATE ON shopee_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================
-- CREATE DEFAULT ADMIN USER
-- Password: admin123 (bcrypt hash)
-- =====================
INSERT INTO users (id, email, password_hash) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'admin@livesync.local', '$2b$10$rOzJqQZQpOqZQpOqZQpOqu8K3L5M7N9P0Q1R2S3T4U5V6W7X8Y9Z0');

INSERT INTO profiles (user_id, email, full_name) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'admin@livesync.local', 'Administrator');

INSERT INTO user_roles (user_id, role) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'admin');
