# Laxey Super 6

A friends-only football prediction league app. This guide gets it live for free, entirely
through your browser — no software to install on your computer.

## What you need (all free)
- A [Supabase](https://supabase.com) account — the database and login system
- A [GitHub](https://github.com) account — holds the code
- A [Vercel](https://vercel.com) account — hosts the live site

Total cost: £0/month at friends-league scale.

---

## Step 1 — Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com), sign up, and click **New project**.
2. Give it any name (e.g. `laxey-super6`), set a database password (save it somewhere), pick
   a region close to you, and create it. Wait ~2 minutes for it to spin up.
3. In the left sidebar, click **SQL Editor** → **New query**.
4. Open `supabase_schema.sql` (in this same bundle), copy the whole file, paste it into the
   editor, and click **Run**. This creates every table and all the security rules in one go.
5. In the left sidebar, click **Project Settings** → **API**. You'll need two values from this
   page in Step 3:
   - **Project URL**
   - **anon public** key

## Step 2 — Make yourself admin

1. Still in Supabase, go to **Authentication** → **Users** → **Add user** → **Create new user**.
   - Email: `admin@laxeysuper6.local`
   - Password: pick something secure
   - Tick "Auto Confirm User"
2. Go to **Table Editor** → `profiles` table → **Insert row**:
   - `id`: copy the UUID of the user you just created (from the Authentication → Users list)
   - `username`: `admin`
   - `full_name`: your name
   - `is_admin`: `true`
3. This is the account you'll log into the app with, as `admin` / whatever password you set.

Everyone else just signs up normally through the app itself — no manual Supabase steps needed
for regular players.

## Step 3 — Upload the code to GitHub (no git install needed)

1. Go to [github.com/new](https://github.com/new), create a new **private** repository called
   `laxey-super6`.
2. On the new repo's page, click **uploading an existing file**.
3. Drag in every file and folder from this bundle's `laxey-super6-app` folder (keep the folder
   structure — `app/`, `lib/`, `package.json`, etc.) and commit.

## Step 4 — Deploy on Vercel

1. Go to [vercel.com](https://vercel.com), sign up with your GitHub account.
2. Click **Add New** → **Project**, and import the `laxey-super6` repo you just created.
3. Before deploying, open **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` → the Project URL from Step 1
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → the anon public key from Step 1
4. Click **Deploy**. After a minute or two you'll get a live URL like
   `laxey-super6.vercel.app` — that's the link you send to friends.

## Making changes later

Any time you want to tweak something, the easiest free route is to describe the change to
Claude (in a chat like this one, or via Claude Code if you get it installed later) and it can
edit the files directly — then re-upload the changed files to GitHub (drag-and-drop replace,
same as Step 3) and Vercel redeploys automatically within a minute.

## Notes
- Predictions and the joker limit are enforced **in the database itself** (see the RLS
  policies and trigger in `supabase_schema.sql`), so a late prediction or a 4th joker gets
  rejected even if someone tries to bypass the app's own checks.
- Player sign-up only ever asks for username, full name, and password — no email or phone
  is collected or stored.
- Only the admin account (the one you set up in Step 2) can see full names, other players'
  predictions, or the Admin tab.
