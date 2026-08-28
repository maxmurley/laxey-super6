import { createClient } from "@supabase/supabase-js";

// Verifies the caller is a real admin (using their own session token against the
// public anon client, which respects RLS) before using the service role key to
// reset someone's password. Never trust a client-sent "isAdmin" flag for this.
export async function POST(request) {
  const { targetUserId, newPassword, callerAccessToken } = await request.json();

  if (!targetUserId || !newPassword || !callerAccessToken) {
    return Response.json({ error: "Missing fields." }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const supabaseAsCaller = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerAccessToken}` } },
  });

  const { data: userData, error: userErr } = await supabaseAsCaller.auth.getUser();
  if (userErr || !userData?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: callerProfile } = await supabaseAsCaller.from("profiles").select("is_admin").eq("id", userData.user.id).single();
  if (!callerProfile?.is_admin) {
    return Response.json({ error: "Only admins can reset passwords." }, { status: 403 });
  }

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, { password: newPassword });
  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({ success: true });
}
