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
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: loginUsername, fullName: regFullName, password: loginPassword }),
    });
    const result = await res.json();
    if (!res.ok || result.error) {
      setLoginError(result.error || "Something went wrong creating your account.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(loginUsername),
      password: loginPassword,
    });
    if (error) setLoginError(error.message);
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
        
