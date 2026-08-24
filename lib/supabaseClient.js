import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Supabase auth needs an email — players only ever see "username", so we map
// it to a hidden internal address behind the scenes.
export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@laxeysuper6.local`;
}
