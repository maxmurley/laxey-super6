"use client";

import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase, usernameToEmail } from "../lib/supabaseClient";
import { pointsFor, finalPoints, isPerfect, monthLabel, JOKER_LIMIT } from "../lib/scoring";

const LEAGUE_NAME = "Laxey Super 6";

// ---------- small UI atoms ----------
function Masthead({ subtitle }) {
  return (
    <div style={{ background: "#1B3A2B" }} className="px-5 pt-6 pb-4 border-b-4">
      <div style={{ borderColor: "#E8A33D" }} className="border-b-2 pb-3 mb-2">
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#E8A33D" }} className="text-[11px] tracking-[0.25em] uppercase mb-1">
          Matchday Predictor
        </p>
        <h1 style={{ fontFamily: "'Oswald', sans-serif", color: "#F5F1E4" }} className="text-3xl uppercase tracking-wide font-semibold leading-none">
          {LEAGUE_NAME}
        </h1>
      </div>
      {subtitle && (
        <p style={{ fontFamily: "'Inter', sans-serif", color: "#CFC6AE" }} className="text-sm">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function ScoreDigit({ value }) {
  return (
    <div style={{ background: "#12201A", color: "#E8A33D", fontFamily: "'IBM Plex Mono', monospace" }} className="w-10 h-12 rounded flex items-center justify-center text-2xl font-semibold shadow-inner">
      {value === null || value === undefined ? "–" : value}
    </div>
  );
}

function Stepper({ value, onChange, disabled }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button disabled={disabled} onClick={() => onChange(Math.min(value + 1, 15))} style={{ color: "#1B3A2B" }} className="w-8 h-6 leading-none text-sm font-bold disabled:opacity-30">▲</button>
      <ScoreDigit value={value} />
      <button disabled={disabled} onClick={() => onChange(Math.max(value - 1, 0))} style={{ color: "#1B3A2B" }} className="w-8 h-6 leading-none text-sm font-bold disabled:opacity-30">▼</button>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{ fontFamily: "'Oswald', sans-serif", background: active ? "#1B3A2B" : "transparent", color: active ? "#F5F1E4" : "#1B3A2B", borderColor: "#1B3A2B" }}
      className="px-3 py-2 text-sm uppercase tracking-wide border-b-2 whitespace-nowrap"
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#1B3A2B" }} className="text-[11px] tracking-[0.2em] uppercase mb-2 opacity-70">
      {children}
    </p>
  );
}

function RuleRow({ title, detail, points }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <div>
        <p style={{ fontFamily: "'Oswald', sans-serif", color: "#1B3A2B" }} className="text-sm uppercase">{title}</p>
        <p style={{ color: "#7a7566" }} className="text-xs">{detail}</p>
      </div>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", background: "#F5F1E4", color: "#1B3A2B" }} className="text-sm font-semibold px-2 py-1 rounded">+{points}</span>
    </div>
  );
}

function LeaderboardTable({ rows, currentUserId, isAdmin, onSelectPlayer }) {
  return (
    <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border divide-y">
      {rows.map((r, i) => (
        <div key={r.user_id} style={{ borderColor: "#CFC6AE", background: r.user_id === currentUserId ? "#FBF3DF" : "transparent" }} className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-3">
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: i < 3 ? "#E8A33D" : "#7a7566" }} className="text-sm w-5 font-semibold">{i + 1}</span>
            {isAdmin ? (
              <button onClick={() => onSelectPlayer(r)} style={{ fontFamily: "'Oswald', sans-serif", color: "#1B3A2B" }} className="text-sm uppercase underline decoration-dotted">
                {r.username}
              </button>
            ) : (
              <span style={{ fontFamily: "'Oswald', sans-serif", color: "#1B3A2B" }} className="text-sm uppercase">
                {r.username}
                {r.user_id === currentUserId && <span style={{ color: "#7a7566" }} className="lowercase font-normal"> (you)</span>}
              </span>
            )}
          </div>
          <div className="text-right">
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#1B3A2B" }} className="text-sm font-semibold">{r.points} pts</span>
            <p style={{ color: "#7a7566" }} className="text-[10px]">{r.perfects} perfect</p>
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="px-3 py-3 text-sm text-center" style={{ color: "#7a7566" }}>No data yet.</p>}
    </div>
  );
}

// ---------- main app ----------
export default function Home() {
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // own profile row
  const [profiles, setProfiles] = useState({}); // id -> profile, all players (for admin list + name lookups)
  const [gameweeks, setGameweeks] = useState([]); // [{id, lockout_at}]
  const [fixtures, setFixtures] = useState([]); // flat array, each has gameweek_id
  const [myPredictions, setMyPredictions] = useState({}); // fixture_id -> {home_score, away_score, joker}
  const [now, setNow] = useState(new Date());

  const [view, setView] = useState("predict");

  // auth form state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMode, setLoginMode] = useState("login");
  const [regFullName, setRegFullName] = useState("");
  const [loginError, setLoginError] = useState("");

  const [selectedGW, setSelectedGW] = useState("");
  const [jokerMsg, setJokerMsg] = useState("");
  const [submitMsg, setSubmitMsg] = useState("");
  const [submitted, setSubmitted] = useState({}); // gw -> bool (local only, resets on reload)

  const [boardScope, setBoardScope] = useState("overall");
  const [boardGW, setBoardGW] = useState("");
  const [boardMonth, setBoardMonth] = useState("");
  const [overallBoard, setOverallBoard] = useState([]);
  const [weeklyBoard, setWeeklyBoard] = useState([]);
  const [monthlyBoard, setMonthlyBoard] = useState([]);
  const [adminViewPlayer, setAdminViewPlayer] = useState(null);
  const [adminViewPredictions, setAdminViewPredictions] = useState([]);

  const [adminNewFixture, setAdminNewFixture] = useState({ gw: "", home: "", away: "", kickoff: "" });
  const [adminImportText, setAdminImportText] = useState("");
  const [adminMsg, setAdminMsg] = useState("");
  const [lockoutGw, setLockoutGw] = useState("");
  const [lockoutValue, setLockoutValue] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [earlyOverride, setEarlyOverride] = useState({});
  const [draftResults, setDraftResults] = useState({});

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  // ---- auth bootstrap ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoaded(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadEverything();
    } else {
      setProfile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function loadEverything() {
    const [{ data: profs }, { data: gws }, { data: fx }, { data: myPreds }] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("gameweeks").select("*").order("id"),
      supabase.from("fixtures").select("*").order("kickoff"),
      supabase.from("predictions").select("*").eq("user_id", session.user.id),
    ]);

    const profMap = {};
    (profs || []).forEach((p) => (profMap[p.id] = p));
    setProfiles(profMap);
    setProfile(profMap[session.user.id] || null);
    setGameweeks(gws || []);
    setFixtures(fx || []);

    const predMap = {};
    (myPreds || []).forEach((p) => (predMap[p.fixture_id] = p));
    setMyPredictions(predMap);

    if ((gws || []).length > 0) {
      setSelectedGW((prev) => prev || gws[0].id);
      setBoardGW((prev) => prev || gws[0].id);
      setLockoutGw((prev) => prev || gws[0].id);
    }
  }

  const allMonths = useMemo(() => {
    const set = new Set();
    fixtures.forEach((f) => set.add(monthLabel(f.kickoff)));
    return Array.from(set);
  }, [fixtures]);

  useEffect(() => {
    if (allMonths.length && !boardMonth) setBoardMonth(allMonths[0]);
  }, [allMonths, boardMonth]);

  // ---- leaderboards (server-side aggregate via RPC, keeps individual picks private) ----
  useEffect(() => {
    if (!session) return;
    supabase.rpc("get_leaderboard", { p_gameweek: null, p_month: null }).then(({ data }) => setOverallBoard(data || []));
  }, [session, fixtures, myPredictions]);

  useEffect(() => {
    if (!session || !boardGW) return;
    supabase.rpc("get_leaderboard", { p_gameweek: boardGW, p_month: null }).then(({ data }) => setWeeklyBoard(data || []));
  }, [session, boardGW, fixtures, myPredictions]);

  useEffect(() => {
    if (!session || !boardMonth) return;
    supabase.rpc("get_leaderboard", { p_gameweek: null, p_month: boardMonth }).then(({ data }) => setMonthlyBoard(data || []));
  }, [session, boardMonth, fixtures, myPredictions]);

  // ---- auth actions ----
  async function handleLogin() {
    setLoginError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(loginUsername),
      password: loginPassword,
    });
    if (error) setLoginError("Incorrect username or password.");
  }

  async function handleRegister() {
    setLoginError("");
    if (!loginUsername || !loginPassword || !regFullName) {
      setLoginError("Fill in username, full name and password.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(loginUsername),
      password: loginPassword,
    });
    if (error) {
      setLoginError(error.message.includes("already registered") ? "That username is taken." : error.message);
      return;
    }
    if (data.user) {
      const { error: profErr } = await supabase.from("profiles").insert({
        id: data.user.id,
        username: loginUsername.trim().toLowerCase(),
        full_name: regFullName,
        is_admin: false,
      });
      if (profErr) setLoginError(profErr.message);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setView("predict");
  }

  // ---- predict tab ----
  function isLocked(fx) {
    if (fx.status !== "scheduled") return true;
    const gw = gameweeks.find((g) => g.id === fx.gameweek_id);
    if (!gw || !gw.lockout_at) return false;
    return now > new Date(gw.lockout_at);
  }

  function jokerCount() {
    return Object.values(myPredictions).filter((p) => p.joker).length;
  }

  async function setPrediction(fx, side, val) {
    if (isLocked(fx)) return;
    const existing = myPredictions[fx.id] || { home_score: 0, away_score: 0, joker: false };
    const next = { ...existing, [side]: val };
    setMyPredictions({ ...myPredictions, [fx.id]: next });
    const { error } = await supabase.from("predictions").upsert(
      { user_id: session.user.id, fixture_id: fx.id, home_score: next.home_score, away_score: next.away_score, joker: next.joker },
      { onConflict: "user_id,fixture_id" }
    );
    if (error) setJokerMsg(error.message);
    setSubmitted((s) => ({ ...s, [fx.gameweek_id]: false }));
  }

  async function toggleJoker(fx) {
    if (isLocked(fx)) return;
    const existing = myPredictions[fx.id] || { home_score: 0, away_score: 0, joker: false };
    const turningOn = !existing.joker;
    if (turningOn && jokerCount() >= JOKER_LIMIT) {
      setJokerMsg(`You've already used all ${JOKER_LIMIT} jokers for the season.`);
      return;
    }
    const next = { ...existing, joker: turningOn };
    const { error } = await supabase.from("predictions").upsert(
      { user_id: session.user.id, fixture_id: fx.id, home_score: next.home_score, away_score: next.away_score, joker: next.joker },
      { onConflict: "user_id,fixture_id" }
    );
    if (error) {
      setJokerMsg(error.message.includes("Joker limit") ? `You've already used all ${JOKER_LIMIT} jokers for the season.` : error.message);
      return;
    }
    setMyPredictions({ ...myPredictions, [fx.id]: next });
    setJokerMsg("");
  }

  function submitPredictions(gw) {
    setSubmitted((s) => ({ ...s, [gw]: true }));
    setSubmitMsg(`Predictions submitted for ${gw} — you can still change them until lockout.`);
  }

  // ---- admin: fixtures ----
  async function adminAddFixture() {
    const { gw, home, away, kickoff } = adminNewFixture;
    if (!gw || !home || !away || !kickoff) {
      setAdminMsg("Fill in all fixture fields.");
      return;
    }
    await supabase.from("gameweeks").upsert({ id: gw }, { onConflict: "id", ignoreDuplicates: true });
    const { error } = await supabase.from("fixtures").insert({ gameweek_id: gw, home, away, kickoff, status: "scheduled" });
    if (error) {
      setAdminMsg(error.message);
    } else {
      setAdminMsg(`Added ${home} v ${away} to ${gw}. Don't forget to set ${gw}'s lockout time below.`);
      setAdminNewFixture({ gw, home: "", away: "", kickoff: "" });
      loadEverything();
    }
  }

  async function adminSetLockout() {
    if (!lockoutGw || !lockoutValue) {
      setAdminMsg("Choose a gameweek and a lockout time.");
      return;
    }
    const { error } = await supabase.from("gameweeks").upsert({ id: lockoutGw, lockout_at: lockoutValue }, { onConflict: "id" });
    if (error) setAdminMsg(error.message);
    else {
      setAdminMsg(`Lockout for ${lockoutGw} set.`);
      loadEverything();
    }
  }

  async function adminSetResult(fx, hs, as) {
    const { error } = await supabase.from("fixtures").update({ status: "FT", home_score: Number(hs), away_score: Number(as) }).eq("id", fx.id);
    if (error) setAdminMsg(error.message);
    else {
      setAdminMsg("Result saved.");
      setDraftResults((prev) => {
        const n = { ...prev };
        delete n[fx.id];
        return n;
      });
      loadEverything();
    }
  }

  async function adminResetResult(fx) {
    const { error } = await supabase.from("fixtures").update({ status: "scheduled", home_score: null, away_score: null }).eq("id", fx.id);
    if (error) setAdminMsg(error.message);
    else {
      setAdminMsg("Result reset — fixture is open for predictions again.");
      loadEverything();
    }
  }

  async function adminSetPostponed(fx, postponed) {
    const { error } = await supabase.from("fixtures").update({ status: postponed ? "postponed" : "scheduled", home_score: null, away_score: null }).eq("id", fx.id);
    if (error) setAdminMsg(error.message);
    else loadEverything();
  }

  async function adminRemoveFixture(fx) {
    const { error } = await supabase.from("fixtures").delete().eq("id", fx.id);
    if (error) setAdminMsg(error.message);
    else {
      setAdminMsg("Fixture removed.");
      setConfirmRemoveId(null);
      loadEverything();
    }
  }

  function excelDateToIso(d) {
    if (!(d instanceof Date) || isNaN(d)) return null;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  }

  async function adminImportExcelFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
        const sheet = wb.Sheets["Fixtures"] || wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 2 });
        const toInsert = [];
        const gwSet = new Set();
        rows.forEach((row) => {
          const [gw, home, away, kickoff] = row;
          if (!gw || !home || !away || !kickoff) return;
          const iso = excelDateToIso(kickoff instanceof Date ? kickoff : new Date(kickoff));
          if (!iso) return;
          gwSet.add(String(gw));
          toInsert.push({ gameweek_id: String(gw), home: String(home).trim(), away: String(away).trim(), kickoff: iso, status: "scheduled" });
        });
        if (toInsert.length === 0) {
          setAdminMsg("No fixtures found — check the file still uses the template's Fixtures tab layout.");
          return;
        }
        for (const gw of gwSet) {
          await supabase.from("gameweeks").upsert({ id: gw }, { onConflict: "id", ignoreDuplicates: true });
        }
        const { error } = await supabase.from("fixtures").insert(toInsert);
        if (error) setAdminMsg(error.message);
        else {
          setAdminMsg(`Imported ${toInsert.length} fixture(s). Remember to set the lockout time for any new gameweek.`);
          loadEverything();
        }
      } catch (err) {
        setAdminMsg("Couldn't read that file — make sure it's the .xlsx template with a 'Fixtures' tab.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function adminImportPaste() {
    const lines = adminImportText.split("\n").map((l) => l.trim()).filter(Boolean);
    const toInsert = [];
    const gwSet = new Set();
    lines.forEach((line) => {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 3) return;
      const [gw, teams, kickoff] = parts;
      const teamMatch = teams.split(/\s+vs\s+/i);
      if (teamMatch.length !== 2) return;
      gwSet.add(gw);
      toInsert.push({ gameweek_id: gw, home: teamMatch[0].trim(), away: teamMatch[1].trim(), kickoff, status: "scheduled" });
    });
    if (toInsert.length === 0) {
      setAdminMsg("No fixtures parsed. Use format: GW2 | Team A vs Team B | 2026-08-24T14:30");
      return;
    }
    for (const gw of gwSet) {
      await supabase.from("gameweeks").upsert({ id: gw }, { onConflict: "id", ignoreDuplicates: true });
    }
    const { error } = await supabase.from("fixtures").insert(toInsert);
    if (error) setAdminMsg(error.message);
    else {
      setAdminMsg(`Imported ${toInsert.length} fixture(s). Remember to set the lockout time for that gameweek.`);
      setAdminImportText("");
      loadEverything();
    }
  }

  async function openPlayerPredictions(row) {
    setAdminViewPlayer(row);
    const { data } = await supabase.from("predictions").select("*").eq("user_id", row.user_id);
    setAdminViewPredictions(data || []);
  }

  // ---------------- RENDER ----------------
  if (!loaded) {
    return (
      <div style={{ background: "#1B3A2B" }} className="min-h-screen flex items-center justify-center">
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#E8A33D" }}>Loading…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ background: "#1B3A2B", fontFamily: "'Inter', sans-serif" }} className="min-h-screen flex flex-col">
        <Masthead subtitle="Friends-only prediction league. Get in, pick your scores, take the bragging rights." />
        <div className="flex-1 flex items-start justify-center px-5 py-8">
          <div style={{ background: "#F5F1E4" }} className="w-full max-w-sm rounded p-5 shadow-lg">
            <div className="flex mb-4 border-b" style={{ borderColor: "#CFC6AE" }}>
              <button onClick={() => setLoginMode("login")} style={{ fontFamily: "'Oswald', sans-serif", color: loginMode === "login" ? "#1B3A2B" : "#9a9382", borderColor: loginMode === "login" ? "#E8A33D" : "transparent" }} className="flex-1 pb-2 uppercase text-sm tracking-wide border-b-2">Log in</button>
              <button onClick={() => setLoginMode("register")} style={{ fontFamily: "'Oswald', sans-serif", color: loginMode === "register" ? "#1B3A2B" : "#9a9382", borderColor: loginMode === "register" ? "#E8A33D" : "transparent" }} className="flex-1 pb-2 uppercase text-sm tracking-wide border-b-2">Sign up</button>
            </div>

            <label style={{ color: "#1B3A2B" }} className="block text-xs uppercase tracking-wide mb-1">Username</label>
            <input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} className="w-full mb-3 px-3 py-2 rounded border text-sm" style={{ borderColor: "#CFC6AE" }} placeholder="e.g. jsmith" />

            {loginMode === "register" && (
              <>
                <label style={{ color: "#1B3A2B" }} className="block text-xs uppercase tracking-wide mb-1">Full name</label>
                <input value={regFullName} onChange={(e) => setRegFullName(e.target.value)} className="w-full mb-3 px-3 py-2 rounded border text-sm" style={{ borderColor: "#CFC6AE" }} placeholder="Only the admin can see this" />
              </>
            )}

            <label style={{ color: "#1B3A2B" }} className="block text-xs uppercase tracking-wide mb-1">Password</label>
            <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full mb-3 px-3 py-2 rounded border text-sm" style={{ borderColor: "#CFC6AE" }} />

            {loginError && <p style={{ color: "#C1443B" }} className="text-xs mb-3">{loginError}</p>}

            <button onClick={loginMode === "login" ? handleLogin : handleRegister} style={{ background: "#1B3A2B", color: "#F5F1E4", fontFamily: "'Oswald', sans-serif" }} className="w-full py-2 rounded uppercase tracking-wide text-sm">
              {loginMode === "login" ? "Log in" : "Create account"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (session && !profile) {
    return (
      <div style={{ background: "#1B3A2B" }} className="min-h-screen flex items-center justify-center">
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#E8A33D" }}>Setting up your profile…</p>
      </div>
    );
  }

  const isAdmin = !!profile.is_admin;
  const gwFixtures = fixtures.filter((f) => f.gameweek_id === selectedGW);
  const gwMetaSelected = gameweeks.find((g) => g.id === selectedGW);
  const openCount = gwFixtures.filter((fx) => fx.status === "scheduled" && !isLocked(fx)).length;

  return (
    <div style={{ background: "#F5F1E4", fontFamily: "'Inter', sans-serif" }} className="min-h-screen pb-10">
      <Masthead subtitle={`Welcome back, ${profile.full_name.split(" ")[0]}`} />

      <div style={{ background: "#F5F1E4", borderColor: "#CFC6AE" }} className="flex overflow-x-auto border-b sticky top-0 z-10">
        <TabButton active={view === "predict"} onClick={() => setView("predict")}>Predict</TabButton>
        <TabButton active={view === "leaderboard"} onClick={() => setView("leaderboard")}>Leaderboard</TabButton>
        <TabButton active={view === "rules"} onClick={() => setView("rules")}>How to Play</TabButton>
        {isAdmin && <TabButton active={view === "admin"} onClick={() => setView("admin")}>Admin</TabButton>}
        <TabButton active={view === "account"} onClick={() => setView("account")}>Account</TabButton>
      </div>

      <div className="px-4 py-5">
        {/* ---------- PREDICT ---------- */}
        {view === "predict" && (
          <div>
            <SectionLabel>Choose gameweek</SectionLabel>
            <div className="flex gap-2 mb-2 flex-wrap">
              {gameweeks.map((gw) => (
                <button key={gw.id} onClick={() => setSelectedGW(gw.id)} style={{ fontFamily: "'Oswald', sans-serif", background: selectedGW === gw.id ? "#1B3A2B" : "#fff", color: selectedGW === gw.id ? "#F5F1E4" : "#1B3A2B", borderColor: "#1B3A2B" }} className="px-4 py-1.5 rounded-full border text-sm uppercase tracking-wide">
                  {gw.id}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mb-4 flex-wrap gap-1">
              {gwMetaSelected?.lockout_at && (
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#7a7566" }} className="text-xs">
                  Predictions lock: {new Date(gwMetaSelected.lockout_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#E8A33D" }} className="text-xs font-semibold">
                Jokers left: {JOKER_LIMIT - jokerCount()}/{JOKER_LIMIT}
              </p>
            </div>
            {jokerMsg && <p style={{ color: "#C1443B" }} className="text-xs mb-3">{jokerMsg}</p>}

            <div className="space-y-3">
              {gwFixtures.map((fx) => {
                const pred = myPredictions[fx.id] || { home_score: 0, away_score: 0, joker: false };
                const kickoffDate = new Date(fx.kickoff);
                const locked = isLocked(fx);
                const pts = finalPoints(myPredictions[fx.id], fx);
                const jokerOn = !!pred.joker;
                const canToggleJoker = fx.status === "scheduled" && !locked;

                return (
                  <div key={fx.id} style={{ background: "#fff", borderColor: "#CFC6AE", boxShadow: jokerOn ? "0 0 0 2px #E8A33D inset" : "none" }} className="rounded border p-3">
                    <div className="flex justify-between items-center mb-2">
                      <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#7a7566" }} className="text-[11px]">
                        {kickoffDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {kickoffDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {fx.status === "postponed" ? (
                        <span style={{ color: "#C1443B" }} className="text-[11px] uppercase font-semibold">Postponed</span>
                      ) : fx.status === "FT" ? (
                        <span style={{ color: "#1B3A2B" }} className="text-[11px] uppercase font-semibold">Full time</span>
                      ) : locked ? (
                        <span style={{ color: "#C1443B" }} className="text-[11px] uppercase font-semibold">Locked</span>
                      ) : (
                        <span style={{ color: "#3f7a4d" }} className="text-[11px] uppercase font-semibold">Open</span>
                      )}
                    </div>

                    {fx.status === "postponed" ? (
                      <p style={{ fontFamily: "'Oswald', sans-serif", color: "#7a7566" }} className="text-sm uppercase text-center py-2">
                        {fx.home} v {fx.away} — postponed, no points either way
                      </p>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p style={{ fontFamily: "'Oswald', sans-serif", color: "#1B3A2B" }} className="w-2/5 text-sm uppercase leading-tight">{fx.home}</p>
                        <div className="flex items-center gap-3">
                          <Stepper value={pred.home_score} onChange={(v) => setPrediction(fx, "home_score", v)} disabled={locked} />
                          <span style={{ color: "#1B3A2B" }} className="font-bold">–</span>
                          <Stepper value={pred.away_score} onChange={(v) => setPrediction(fx, "away_score", v)} disabled={locked} />
                        </div>
                        <p style={{ fontFamily: "'Oswald', sans-serif", color: "#1B3A2B" }} className="w-2/5 text-sm uppercase leading-tight text-right">{fx.away}</p>
                      </div>
                    )}

                    {fx.status === "scheduled" && (canToggleJoker || jokerOn) && (
                      <div className="mt-2 flex justify-center">
                        <button onClick={() => toggleJoker(fx)} disabled={!canToggleJoker && !jokerOn} style={{ fontFamily: "'Oswald', sans-serif", background: jokerOn ? "#E8A33D" : "transparent", color: jokerOn ? "#12201A" : "#1B3A2B", borderColor: "#E8A33D" }} className="text-xs px-3 py-1 rounded-full border uppercase tracking-wide disabled:opacity-40">
                          {jokerOn ? "🃏 Joker played — double points" : "🃏 Play joker (double points)"}
                        </button>
                      </div>
                    )}

                    {fx.status === "FT" && (
                      <div className="mt-2 flex items-center justify-between">
                        <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#7a7566" }} className="text-xs">
                          Final score: {fx.home_score} – {fx.away_score}
                          {jokerOn && <span style={{ color: "#E8A33D" }} className="ml-2 font-semibold">🃏 joker</span>}
                        </p>
                        <span style={{ background: pts > 0 ? "#3f7a4d" : "#CFC6AE", color: pts > 0 ? "#fff" : "#1B3A2B", fontFamily: "'IBM Plex Mono', monospace" }} className="text-xs px-2 py-0.5 rounded-full font-semibold">+{pts} pts</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {gwFixtures.length === 0 && <p style={{ color: "#7a7566" }} className="text-sm text-center mt-6">No fixtures in {selectedGW} yet.</p>}

            {gwFixtures.length > 0 && (
              openCount === 0 ? (
                <p style={{ color: "#7a7566" }} className="text-xs text-center mt-4">{selectedGW} is locked — no predictions left to submit.</p>
              ) : (
                <div className="mt-4 text-center">
                  <button onClick={() => submitPredictions(selectedGW)} style={{ fontFamily: "'Oswald', sans-serif", background: submitted[selectedGW] ? "#3f7a4d" : "#1B3A2B", color: "#F5F1E4" }} className="px-6 py-2 rounded uppercase tracking-wide text-sm">
                    {submitted[selectedGW] ? `Submitted ✓ — resubmit for ${selectedGW}` : `Submit predictions for ${selectedGW}`}
                  </button>
                  {submitMsg && <p style={{ color: "#3f7a4d" }} className="text-xs mt-2">{submitMsg}</p>}
                </div>
              )
            )}
          </div>
        )}

        {/* ---------- LEADERBOARD ---------- */}
        {view === "leaderboard" && (
          <div>
            <div className="flex gap-2 mb-4">
              {["overall", "weekly", "monthly"].map((s) => (
                <button key={s} onClick={() => setBoardScope(s)} style={{ fontFamily: "'Oswald', sans-serif", background: boardScope === s ? "#1B3A2B" : "#fff", color: boardScope === s ? "#F5F1E4" : "#1B3A2B", borderColor: "#1B3A2B" }} className="px-4 py-1.5 rounded-full border text-sm uppercase tracking-wide capitalize">
                  {s}
                </button>
              ))}
            </div>

            {boardScope === "weekly" && (
              <div className="flex gap-2 mb-3 flex-wrap">
                {gameweeks.map((gw) => (
                  <button key={gw.id} onClick={() => setBoardGW(gw.id)} style={{ color: boardGW === gw.id ? "#1B3A2B" : "#7a7566", fontFamily: "'IBM Plex Mono', monospace", textDecoration: boardGW === gw.id ? "underline" : "none" }} className="text-xs">
                    {gw.id}
                  </button>
                ))}
              </div>
            )}
            {boardScope === "monthly" && (
              <select value={boardMonth} onChange={(e) => setBoardMonth(e.target.value)} className="mb-3 px-2 py-1 rounded border text-sm" style={{ borderColor: "#CFC6AE" }}>
                {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}

            <LeaderboardTable
              rows={boardScope === "overall" ? overallBoard : boardScope === "weekly" ? weeklyBoard : monthlyBoard}
              currentUserId={session.user.id}
              isAdmin={isAdmin}
              onSelectPlayer={openPlayerPredictions}
            />
            <p style={{ color: "#7a7566" }} className="text-[11px] mt-2">Ties are broken by most exact/perfect scores.</p>
            {isAdmin && <p style={{ color: "#7a7566" }} className="text-[11px]">Tap a name to see that player's predictions.</p>}

            {isAdmin && adminViewPlayer && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <SectionLabel>{profiles[adminViewPlayer.user_id]?.full_name || adminViewPlayer.username}&apos;s predictions</SectionLabel>
                  <button onClick={() => setAdminViewPlayer(null)} style={{ color: "#7a7566", fontFamily: "'IBM Plex Mono', monospace" }} className="text-xs">Close ✕</button>
                </div>
                <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border divide-y">
                  {fixtures.map((fx) => {
                    const pred = adminViewPredictions.find((p) => p.fixture_id === fx.id);
                    const pts = finalPoints(pred, fx);
                    return (
                      <div key={fx.id} style={{ borderColor: "#CFC6AE" }} className="flex items-center justify-between px-3 py-2 gap-2 flex-wrap">
                        <div>
                          <p style={{ color: "#7a7566" }} className="text-[10px] uppercase">{fx.gameweek_id}</p>
                          <p style={{ fontFamily: "'Oswald', sans-serif", color: "#1B3A2B" }} className="text-sm uppercase">{fx.home} v {fx.away}</p>
                        </div>
                        <div className="text-right">
                          <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#1B3A2B" }} className="text-sm">
                            {pred ? `${pred.home_score} – ${pred.away_score}` : "No prediction"}
                            {pred?.joker && <span style={{ color: "#E8A33D" }}> 🃏</span>}
                          </p>
                          <p style={{ color: "#7a7566" }} className="text-[10px]">
                            {fx.status === "FT" ? `Actual: ${fx.home_score}–${fx.away_score} · +${pts} pts` : fx.status === "postponed" ? "Postponed" : "Pending"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------- RULES ---------- */}
        {view === "rules" && (
          <div className="space-y-6 max-w-md">
            <div>
              <SectionLabel>Scoring</SectionLabel>
              <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border divide-y">
                <RuleRow title="Correct result" detail="Pick the right winner (or draw) — 1 point." points="1" />
                <RuleRow title="Exact score" detail="Nail the score on the nose — 3 points." points="3" />
                <RuleRow title="Wrong" detail="Anything else — 0 points." points="0" />
              </div>
            </div>
            <div>
              <SectionLabel>🃏 Joker</SectionLabel>
              <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border p-3">
                <p style={{ color: "#1B3A2B" }} className="text-sm leading-relaxed">
                  You get <b>3 jokers per season</b>. Play one on any fixture before it locks to <b>double whatever points that prediction earns</b>. Get it wrong and it&apos;s still 0. Un-play any time before lockout to save it.
                </p>
              </div>
            </div>
            <div>
              <SectionLabel>Lockout</SectionLabel>
              <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border p-3">
                <p style={{ color: "#1B3A2B" }} className="text-sm leading-relaxed">
                  Each gameweek has one lockout time, set by the admin. Once it passes, predictions (and jokers) for every fixture that week are frozen.
                </p>
                <p style={{ color: "#7a7566" }} className="text-xs mt-2">Tip: hit &quot;Submit predictions&quot; once you&apos;re happy — that&apos;s your confirmation they&apos;re locked in.</p>
              </div>
            </div>
            <div>
              <SectionLabel>Postponed fixtures</SectionLabel>
              <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border p-3">
                <p style={{ color: "#1B3A2B" }} className="text-sm leading-relaxed">If a match gets called off, it&apos;s voided for everyone — no points either way, joker or not.</p>
              </div>
            </div>
            <div>
              <SectionLabel>Leaderboards & tie-breaks</SectionLabel>
              <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border p-3">
                <p style={{ color: "#1B3A2B" }} className="text-sm leading-relaxed">Weekly, monthly and overall tables. Level on points? Most exact scores ranks higher.</p>
              </div>
            </div>
          </div>
        )}

        {/* ---------- ADMIN ---------- */}
        {view === "admin" && isAdmin && (
          <div className="space-y-8">
            <div>
              <SectionLabel>Registered players — admin only</SectionLabel>
              <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border divide-y overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: "#7a7566" }} className="text-left text-[11px] uppercase">
                      <th className="px-3 py-2">Username</th>
                      <th className="px-3 py-2">Full name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(profiles).filter((p) => !p.is_admin).map((p) => (
                      <tr key={p.id} style={{ borderColor: "#CFC6AE" }} className="border-t">
                        <td className="px-3 py-2" style={{ color: "#1B3A2B" }}>{p.username}</td>
                        <td className="px-3 py-2">{p.full_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <SectionLabel>Add a fixture manually</SectionLabel>
              <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border p-3 space-y-2">
                <div className="flex gap-2">
                  <input placeholder="Gameweek e.g. GW1" value={adminNewFixture.gw} onChange={(e) => setAdminNewFixture({ ...adminNewFixture, gw: e.target.value })} className="w-28 px-2 py-2 rounded border text-sm" style={{ borderColor: "#CFC6AE" }} />
                  <input placeholder="Home team" value={adminNewFixture.home} onChange={(e) => setAdminNewFixture({ ...adminNewFixture, home: e.target.value })} className="flex-1 px-2 py-2 rounded border text-sm" style={{ borderColor: "#CFC6AE" }} />
                </div>
                <input placeholder="Away team" value={adminNewFixture.away} onChange={(e) => setAdminNewFixture({ ...adminNewFixture, away: e.target.value })} className="w-full px-2 py-2 rounded border text-sm" style={{ borderColor: "#CFC6AE" }} />
                <input type="datetime-local" value={adminNewFixture.kickoff} onChange={(e) => setAdminNewFixture({ ...adminNewFixture, kickoff: e.target.value })} className="w-full px-2 py-2 rounded border text-sm" style={{ borderColor: "#CFC6AE" }} />
                <button onClick={adminAddFixture} style={{ background: "#1B3A2B", color: "#F5F1E4", fontFamily: "'Oswald', sans-serif" }} className="px-4 py-2 rounded uppercase text-sm">Add fixture</button>
              </div>
            </div>

            <div>
              <SectionLabel>Set prediction lockout for a gameweek</SectionLabel>
              <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border p-3 space-y-2">
                <div className="flex gap-2">
                  <select value={lockoutGw} onChange={(e) => setLockoutGw(e.target.value)} className="px-2 py-2 rounded border text-sm" style={{ borderColor: "#CFC6AE" }}>
                    {gameweeks.map((gw) => <option key={gw.id} value={gw.id}>{gw.id}</option>)}
                  </select>
                  <input type="datetime-local" value={lockoutValue} onChange={(e) => setLockoutValue(e.target.value)} className="flex-1 px-2 py-2 rounded border text-sm" style={{ borderColor: "#CFC6AE" }} />
                </div>
                <button onClick={adminSetLockout} style={{ background: "#E8A33D", color: "#12201A", fontFamily: "'Oswald', sans-serif" }} className="px-4 py-2 rounded uppercase text-sm">Set lockout</button>
                <div className="pt-1">
                  {gameweeks.map((gw) => (
                    <p key={gw.id} style={{ color: "#7a7566" }} className="text-xs">{gw.id}: {gw.lockout_at ? new Date(gw.lockout_at).toLocaleString("en-GB") : "not set"}</p>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <SectionLabel>Import fixtures from Excel</SectionLabel>
              <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border p-3 space-y-2">
                <p style={{ color: "#7a7566" }} className="text-xs">Upload the filled-in fixture template (.xlsx).</p>
                <input type="file" accept=".xlsx" onChange={(e) => { if (e.target.files?.[0]) adminImportExcelFile(e.target.files[0]); e.target.value = ""; }} className="text-sm" />
              </div>
            </div>

            <div>
              <SectionLabel>Import fixtures (paste-in)</SectionLabel>
              <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border p-3 space-y-2">
                <textarea value={adminImportText} onChange={(e) => setAdminImportText(e.target.value)} placeholder={"GW2 | Kings Arms FC vs Red Lion Rovers | 2026-08-24T10:30"} rows={4} className="w-full px-2 py-2 rounded border text-sm font-mono" style={{ borderColor: "#CFC6AE" }} />
                <button onClick={adminImportPaste} style={{ background: "#E8A33D", color: "#12201A", fontFamily: "'Oswald', sans-serif" }} className="px-4 py-2 rounded uppercase text-sm">Import pasted fixtures</button>
              </div>
            </div>

            {adminMsg && <p style={{ color: "#3f7a4d" }} className="text-sm">{adminMsg}</p>}

            <div>
              <SectionLabel>Enter results / mark postponed / remove</SectionLabel>
              <div className="space-y-2">
                {gameweeks.map((gw) => (
                  <div key={gw.id}>
                    <p style={{ fontFamily: "'Oswald', sans-serif", color: "#1B3A2B" }} className="uppercase text-xs mb-1">{gw.id}</p>
                    {fixtures.filter((f) => f.gameweek_id === gw.id).map((fx) => {
                      const lockoutPassed = gw.lockout_at ? now > new Date(gw.lockout_at) : true;
                      const canEnter = fx.status !== "postponed" && (lockoutPassed || earlyOverride[fx.id]);
                      return (
                        <div key={fx.id} style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border p-2 mb-2 flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs flex-1 min-w-[140px]" style={{ color: "#1B3A2B" }}>{fx.home} v {fx.away}</p>

                          {fx.status !== "postponed" && canEnter && (
                            <>
                              <input type="number" value={draftResults[fx.id]?.hs ?? (fx.home_score ?? "")} onChange={(e) => setDraftResults({ ...draftResults, [fx.id]: { hs: e.target.value, as: draftResults[fx.id]?.as ?? (fx.away_score ?? "") } })} className="w-12 px-1 py-1 rounded border text-sm text-center" style={{ borderColor: "#CFC6AE" }} />
                              <span>–</span>
                              <input type="number" value={draftResults[fx.id]?.as ?? (fx.away_score ?? "")} onChange={(e) => setDraftResults({ ...draftResults, [fx.id]: { hs: draftResults[fx.id]?.hs ?? (fx.home_score ?? ""), as: e.target.value } })} className="w-12 px-1 py-1 rounded border text-sm text-center" style={{ borderColor: "#CFC6AE" }} />
                              <button onClick={() => adminSetResult(fx, draftResults[fx.id]?.hs ?? (fx.home_score ?? ""), draftResults[fx.id]?.as ?? (fx.away_score ?? ""))} style={{ background: "#1B3A2B", color: "#F5F1E4", fontFamily: "'IBM Plex Mono', monospace" }} className="text-[11px] px-2 py-1 rounded uppercase">Save result</button>
                            </>
                          )}
                          {fx.status !== "postponed" && !canEnter && (
                            <>
                              <span style={{ color: "#7a7566" }} className="text-[11px]">Locks for entry at {new Date(gw.lockout_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                              <button onClick={() => setEarlyOverride({ ...earlyOverride, [fx.id]: true })} style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#E8A33D", borderColor: "#E8A33D" }} className="text-[11px] px-2 py-1 rounded border uppercase">Enter early anyway</button>
                            </>
                          )}
                          {fx.status === "FT" && (
                            <button onClick={() => adminResetResult(fx)} style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#E8A33D", borderColor: "#E8A33D" }} className="text-[11px] px-2 py-1 rounded border uppercase">Reset result</button>
                          )}

                          <button onClick={() => adminSetPostponed(fx, fx.status !== "postponed")} style={{ fontFamily: "'IBM Plex Mono', monospace", color: fx.status === "postponed" ? "#fff" : "#C1443B", background: fx.status === "postponed" ? "#C1443B" : "transparent", borderColor: "#C1443B" }} className="text-[11px] px-2 py-1 rounded border uppercase">
                            {fx.status === "postponed" ? "Postponed ✓" : "Mark postponed"}
                          </button>

                          <button
                            onClick={() => { if (confirmRemoveId === fx.id) { adminRemoveFixture(fx); } else { setConfirmRemoveId(fx.id); } }}
                            style={{ fontFamily: "'IBM Plex Mono', monospace", color: confirmRemoveId === fx.id ? "#fff" : "#7a7566", background: confirmRemoveId === fx.id ? "#C1443B" : "transparent", borderColor: confirmRemoveId === fx.id ? "#C1443B" : "#CFC6AE" }}
                            className="text-[11px] px-2 py-1 rounded border uppercase"
                          >
                            {confirmRemoveId === fx.id ? "Tap to confirm" : "Remove"}
                          </button>
                          {confirmRemoveId === fx.id && (
                            <button onClick={() => setConfirmRemoveId(null)} style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#7a7566", borderColor: "#CFC6AE" }} className="text-[11px] px-2 py-1 rounded border uppercase">Cancel</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ---------- ACCOUNT ---------- */}
        {view === "account" && (
          <div style={{ background: "#fff", borderColor: "#CFC6AE" }} className="rounded border p-4 max-w-sm">
            <p style={{ fontFamily: "'Oswald', sans-serif", color: "#1B3A2B" }} className="uppercase mb-3">{profile.full_name}</p>
            <p className="text-sm mb-4" style={{ color: "#7a7566" }}>Username: {profile.username}</p>
            <p className="text-xs mb-4" style={{ color: "#7a7566" }}>Your name is only ever visible to the league admin — not to other players.</p>
            <button onClick={logout} style={{ background: "#C1443B", color: "#fff", fontFamily: "'Oswald', sans-serif" }} className="px-4 py-2 rounded uppercase text-sm">Log out</button>
          </div>
        )}
      </div>
    </div>
  );
}
