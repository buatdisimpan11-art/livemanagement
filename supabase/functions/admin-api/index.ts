import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Check if user is admin
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "admin") {
      throw new Error("Forbidden: Admin access required");
    }

    const { action, ...params } = await req.json();

    let result;

    switch (action) {
      case "list_users": {
        const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
        if (error) throw error;
        result = { users: users.users };
        break;
      }

      case "create_user": {
        const { email, password, full_name } = params;
        
        const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name }
        });
        
        if (error) throw error;
        result = { user: newUser.user };
        break;
      }

      case "delete_user": {
        const { user_id } = params;
        
        // Delete user from auth (cascade will handle profiles and user_roles)
        const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
        if (error) throw error;
        
        result = { success: true };
        break;
      }

      case "get_user_details": {
        const { user_id } = params;
        
        const [studios, accounts, products, rotations] = await Promise.all([
          supabaseAdmin.from("studios").select("*").eq("user_id", user_id),
          supabaseAdmin.from("shopee_accounts").select("*, studios(name)").eq("user_id", user_id),
          supabaseAdmin.from("product_master").select("*").eq("user_id", user_id),
          supabaseAdmin.from("optimization_history").select("*").eq("user_id", user_id).order("created_at", { ascending: false }).limit(10),
        ]);
        
        result = {
          studios: studios.data || [],
          accounts: accounts.data || [],
          products: products.data || [],
          recent_rotations: rotations.data || [],
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Admin API error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
