import { createClient } from "@supabase/supabase-js";

export async function POST(request) {
  const { targetUserId, callerAccessToken } = await request.json();

  if (!targetUserId || !callerAccessToken) {
    return Response.json({ error: "Missing fields." }, { status: 400 });
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
    return Response.json({ error: "Only admins can remove players." }, { status: 403 });
  }

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // safety net: never let this route remove an admin account, even the caller's own
  const { data: targetProfile } = await supabaseAdmin.from("profiles").select("is_admin").eq("id", targetUserId).single();
  if (targetProfile?.is_admin) {
    return Response.json({ error: "Can't remove an admin account through this." }, { status: 400 });
  }

  // deleting the auth user cascades to their profile row, and from there to their
  // predictions (both are set up ON DELETE CASCADE in the schema)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({ success: true });
}
