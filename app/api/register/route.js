import { createClient } from "@supabase/supabase-js";

// This runs on the server only — SUPABASE_SERVICE_ROLE_KEY is never sent to the browser
// because it isn't prefixed with NEXT_PUBLIC_. Never put that key in client-side code.
export async function POST(request) {
  const { username, fullName, password } = await request.json();

  if (!username || !fullName || !password) {
    return Response.json({ error: "Fill in username, full name and password." }, { status: 400 });
  }

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const email = `${username.trim().toLowerCase()}@laxeysuper6.app`;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no confirmation email needed — we already know this "address" isn't real
  });

  if (error) {
    const msg = error.message.toLowerCase().includes("already") ? "That username is taken." : error.message;
    return Response.json({ error: msg }, { status: 400 });
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: data.user.id,
    username: username.trim().toLowerCase(),
    full_name: fullName,
    is_admin: false,
  });

  if (profileError) {
    return Response.json({ error: profileError.message }, { status: 400 });
  }

  return Response.json({ success: true });
}
