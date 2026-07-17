import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { Power, ToggleLeft, Play, RotateCcw, Volume2, VolumeX, ShieldAlert, Gamepad2, Keyboard } from "lucide-react";
import rovImage from "../assets/rov.png";

import { useROVSocket } from "../hooks/useROVSocket";

export const Route = createFileRoute("/control")({
  head: () => ({
    meta: [
      { title: "ROV Pilot Controls Center — Ocean Explorer" },
      { name: "description", content: "HUD cockpit controls, flight orientation instruments, and subsea alarms." },
    ],
  }),
  component: PilotControlsPage,
});

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── Axis-to-PWM helper ────────────────────────────────────────────────────
const DEADZONE = 0.08;
const PWM_RANGE = 400; // ±400 from neutral 1500

function applyDeadzone(v: number): number {
  if (Math.abs(v) < DEADZONE) return 0;
  return (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);
}

function axesToPWM(axis: number, invert = false): number {
  const scaled = applyDeadzone(invert ? -axis : axis);
  return Math.round(1500 + scaled * PWM_RANGE);
}

// ─── Types ────────────────────────────────────────────────────────────────
type Channels = { 1: number; 2: number; 3: number; 4: number };

// ─── Component ────────────────────────────────────────────────────────────
function PilotControlsPage() {
  const now = useClock();
  const dayName = now.toLocaleDateString("en-GB", { weekday: "long" });
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { hour12: false });

  const socket = useROVSocket();

  // ── UI state (React-managed, only for display) ──────────────────────────
  const [gamepadName, setGamepadName] = useState<string | null>(null); // null = not connected
  const [joystickEnabled, setJoystickEnabled] = useState(true);
  const [keyboardEnabled, setKeyboardEnabled] = useState(false);
  const [channels, setChannels] = useState({ 1: 1500, 2: 1500, 3: 1500, 4: 1500 });
  const [lightState, setLightState] = useState(false);
  const [gripperState, setGripperState] = useState(false);
  const [audioAlarmEnabled, setAudioAlarmEnabled] = useState(true);

  // ── All mutable state lives in refs — zero stale-closure risk ───────────
  const socketRef        = useRef(socket);
  const joystickEnabledRef  = useRef(joystickEnabled);
  const keyboardEnabledRef  = useRef(keyboardEnabled);
  const gpIndexRef       = useRef<number | null>(null);
  const rafRef           = useRef<number | null>(null);
  const lastEmitMs       = useRef(0);
  const prevCh           = useRef<Channels>({ 1: 1500, 2: 1500, 3: 1500, 4: 1500 });
  const keysRef          = useRef<Record<string, boolean>>({});
  const loopRunning      = useRef(false);
  const sendNeutralRef   = useRef<() => void>(() => {});

  // Keep refs in sync with state every render (safe, cheap)
  useEffect(() => { socketRef.current = socket; });
  useEffect(() => { joystickEnabledRef.current = joystickEnabled; }, [joystickEnabled]);
  useEffect(() => { keyboardEnabledRef.current = keyboardEnabled; }, [keyboardEnabled]);

  // ── Emit helper — always reads from refs, never captures closure values ──
  const emitChannels = useCallback((ch: Channels) => {
    const s = socketRef.current;
    if (!s.connected) return;
    const now = Date.now();
    const changed = ([1, 2, 3, 4] as const).some(k => ch[k] !== prevCh.current[k]);
    if (changed || now - lastEmitMs.current >= 200) {
      s.sendRCOverride(ch);
      prevCh.current = { ...ch };
      lastEmitMs.current = now;
    }
  }, []);

  const sendNeutral = useCallback(() => {
    const neutral: Channels = { 1: 1500, 2: 1500, 3: 1500, 4: 1500 };
    setChannels(neutral);
    socketRef.current.sendRCOverride(neutral);
    prevCh.current = neutral;
  }, []);

  // Expose sendNeutral as a stable ref callable from inside RAF loop
  useEffect(() => { sendNeutralRef.current = sendNeutral; }, [sendNeutral]);

  // ── Single persistent RAF loop — starts once on mount, never recreated ──
  useEffect(() => {
    function loop() {
      rafRef.current = requestAnimationFrame(loop);

      // ── AUTO-DETECT GAMEPAD EVERY FRAME ─────────────────────────────────
      // Browser Gamepad API hanya menampilkan controller setelah button press
      // pertama. Dengan scan di sini, begitu muncul di API langsung terdeteksi
      // tanpa perlu cabut-colok atau event listener tambahan.
      if (gpIndexRef.current === null) {
        const pads = navigator.getGamepads?.() ?? [];
        for (let i = 0; i < pads.length; i++) {
          if (pads[i]) {
            gpIndexRef.current = i;
            setGamepadName(pads[i]!.id);
            break;
          }
        }
      }

      const gpIdx = gpIndexRef.current;

      // ── GAMEPAD mode ────────────────────────────────────────────────────
      if (gpIdx !== null && joystickEnabledRef.current) {
        const gp = navigator.getGamepads?.()[gpIdx] ?? null;
        if (!gp) {
          // Gamepad benar-benar hilang di frame ini
          gpIndexRef.current = null;
          setGamepadName(null);
          sendNeutralRef.current();
          return;
        }

        const ch = {
          1: axesToPWM(gp.axes[0] ?? 0),          // Left Stick X  → Lateral
          2: axesToPWM(gp.axes[1] ?? 0, true),     // Left Stick Y  → Forward (inverted)
          3: axesToPWM(gp.axes[3] ?? 0, true),     // Right Stick Y → Throttle (inverted)
          4: axesToPWM(gp.axes[2] ?? 0),            // Right Stick X → Yaw
        };

        setChannels({ ...ch });

        const now = Date.now();
        if (now - lastEmitMs.current >= 50) {
          emitChannels(ch);
        }
        return;
      }

      // ── KEYBOARD mode ───────────────────────────────────────────────────
      if (keyboardEnabledRef.current && gpIdx === null) {
        const k = keysRef.current;
        const ch = {
          1: 1500 + (k["d"] ? 300 : 0) - (k["a"] ? 300 : 0),   // Lateral
          2: 1500 + (k["w"] ? 300 : 0) - (k["s"] ? 300 : 0),   // Forward
          3: 1500 + (k["arrowup"] ? 300 : 0) - (k["arrowdown"] ? 300 : 0), // Throttle
          4: 1500 + (k["arrowright"] ? 300 : 0) - (k["arrowleft"] ? 300 : 0), // Yaw
        };

        setChannels({ ...ch });

        const now = Date.now();
        if (now - lastEmitMs.current >= 50) {
          emitChannels(ch);
        }
      }
    }

    if (!loopRunning.current) {
      loopRunning.current = true;
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        loopRunning.current = false;
      }
      const s = socketRef.current;
      if (s.connected) s.sendRCOverride({ 1: 1500, 2: 1500, 3: 1500, 4: 1500 });
    };
  }, []); // ← Empty deps: loop mounts once, reads everything from refs

  // ── Gamepad disconnect event + 500ms polling fallback ──────────────────
  // Auto-deteksi saat connect ditangani di RAF loop (lebih reliable).
  // Di sini hanya handle disconnect event dan polling fallback saat tab throttled.
  useEffect(() => {
    function onDisconnect(e: GamepadEvent) {
      if (gpIndexRef.current === e.gamepad.index) {
        gpIndexRef.current = null;
        setGamepadName(null);
        sendNeutral();
      }
    }
    window.addEventListener("gamepaddisconnected", onDisconnect);

    // Fallback: poll setiap 500ms untuk menangkap gamepad saat tab throttled
    // (RAF bisa diturunkan ke 1fps oleh browser di background tab)
    const pollInterval = setInterval(() => {
      if (gpIndexRef.current !== null) return; // Sudah ada gamepad, skip
      const pads = navigator.getGamepads?.() ?? [];
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]) {
          gpIndexRef.current = i;
          setGamepadName(pads[i]!.id);
          break;
        }
      }
    }, 500);

    return () => {
      window.removeEventListener("gamepaddisconnected", onDisconnect);
      clearInterval(pollInterval);
    };
  }, []); // ← Empty deps: runs once

  // ── Keyboard events ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      const tracked = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
      if (tracked.includes(k)) {
        if (k.startsWith("arrow")) e.preventDefault();
        keysRef.current[k] = true;
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      keysRef.current[k] = false;
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []); // ← Empty deps: runs once

  // ── When keyboard mode is toggled OFF, reset channels ───────────────────
  useEffect(() => {
    if (!keyboardEnabled && gpIndexRef.current === null) {
      keysRef.current = {};
      sendNeutral();
    }
  }, [keyboardEnabled, sendNeutral]);

  // ── Telemetry aliases ────────────────────────────────────────────────────
  const roll = socket.trajectory?.orientation?.roll ?? 0;
  const pitch = socket.trajectory?.orientation?.pitch ?? 0;
  const yaw = socket.trajectory?.orientation?.yaw ?? 0;
  const depthVal = socket.telemetry?.depth ?? 0;
  const batteryVoltage = socket.telemetry?.battery_voltage ?? 0;
  const batteryRemaining = socket.telemetry?.battery_remaining ?? 0;

  // ── Audio Depth Alarm ────────────────────────────────────────────────────
  const lastAlarmTimeRef = useRef<number>(0);
  useEffect(() => {
    if (!audioAlarmEnabled || depthVal <= 1.8) return;
    const t = Date.now();
    if (t - lastAlarmTimeRef.current < 5000) return;
    lastAlarmTimeRef.current = t;
    try {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {}
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("Warning. Critical Depth Threshold Reached.");
      u.lang = "en-US"; u.rate = 1.15;
      window.speechSynthesis.speak(u);
    }
  }, [depthVal, audioAlarmEnabled]);

  // ── Quick control handlers ───────────────────────────────────────────────
  const handleToggleArm = () => socket.telemetry?.armed ? socket.sendDisarm() : socket.sendArm();
  const handleToggleMode = () => {
    const mode = socket.telemetry?.mode ?? "MANUAL";
    socket.sendSetMode(mode === "DEPTH_HOLD" ? "MANUAL" : "DEPTH_HOLD");
  };
  const handleToggleLight = () => {
    const next = !lightState;
    setLightState(next);
    socket.sendLight(next);
  };
  const handleToggleGripper = () => {
    const next = !gripperState;
    setGripperState(next);
    socket.sendGripper(next ? "open" : "close");
  };

  const gamepadConnected = gamepadName !== null;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-background text-foreground select-none overflow-y-auto lg:overflow-hidden">

      {/* Top Bar */}
      <header className="h-12 shrink-0 border-b border-panel-border px-4 flex items-center justify-between bg-[color:var(--color-sidebar)] gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="label-caps">Team</span>
          <span className="font-mono font-semibold">Ocean Explorer</span>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="label-caps">University</span>
          <span className="text-foreground">Politeknik Negeri Banyuwangi</span>
        </div>
        <div className="text-right">
          <div className="font-mono text-xs leading-none">{timeStr}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{dayName}, {dateStr}</div>
        </div>
      </header>

      {/* 3-Column Layout */}
      <div className="flex-1 min-h-0 p-2.5 flex flex-col lg:flex-row gap-2.5 overflow-y-auto lg:overflow-hidden">

        {/* Col 1: Attitude Instrument */}
        <div className="panel flex flex-col flex-1 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="border-b border-panel-border/60 pb-2 shrink-0">
            <span className="label-caps">Attitude Flight Instrument</span>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2.5 py-2.5 min-h-0">
            <div className="flex flex-col gap-1.5 min-h-0">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Attitude Indicator</span>
              <div className="flex-1 min-h-[130px] bg-[oklch(0.14_0.028_250)] rounded-lg border border-panel-border grid place-items-center relative">
                <img
                  src={rovImage}
                  alt="ROV Visual Model"
                  className="w-full h-full object-contain p-3"
                  style={{
                    transform: `rotate(${roll}deg) scale(${Math.max(0.65, 1 - Math.abs(pitch) / 180)})`,
                    transition: "transform 0.1s ease-out",
                  }}
                />
                <div className="absolute bottom-1.5 left-2 font-mono text-[10px] text-muted-foreground">
                  R: {roll.toFixed(1)}° P: {pitch.toFixed(1)}°
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 min-h-0">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Compass (Yaw)</span>
              <div className="flex-1 min-h-[130px] bg-[oklch(0.14_0.028_250)] rounded-lg border border-panel-border grid place-items-center relative">
                <svg viewBox="0 0 100 100" className="w-full h-full p-2.5">
                  <g transform={`rotate(${yaw}, 50, 50)`} style={{ transition: "transform 0.1s ease-out" }}>
                    <circle cx="50" cy="50" r="30" fill="none" stroke="var(--color-panel-border)" strokeWidth="1.5" />
                    <polygon points="50,15 45,25 55,25" fill="var(--color-data)" />
                    <text x="50" y="35" fontSize="8" fill="var(--color-data)" textAnchor="middle" fontFamily="monospace" fontWeight="bold">N</text>
                    <line x1="50" y1="25" x2="50" y2="75" stroke="var(--color-panel-border)" strokeWidth="1" strokeDasharray="2 2" />
                    <line x1="25" y1="50" x2="75" y2="50" stroke="var(--color-panel-border)" strokeWidth="1" strokeDasharray="2 2" />
                  </g>
                  <circle cx="50" cy="50" r="3" fill="#fff" />
                </svg>
                <div className="absolute bottom-1.5 right-2 font-mono text-[10px] text-muted-foreground">
                  HDG: {yaw.toFixed(1)}°
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-panel-border/40 pt-2 shrink-0">
            <div className="text-[10px] text-muted-foreground font-semibold text-center">
              Internal Gyroscopic AHRS Calibration: OK
            </div>
          </div>
        </div>

        {/* Col 2: Pilot Switchboard */}
        <div className="panel flex flex-col flex-1 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="border-b border-panel-border/60 pb-2 shrink-0">
            <span className="label-caps">Pilot Switchboard</span>
          </div>

          <div className="flex-1 flex flex-col gap-2 py-3 overflow-y-auto">
            {/* ARM */}
            <button onClick={handleToggleArm}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors shrink-0 ${
                socket.telemetry?.armed
                  ? "bg-red-500/20 text-red-500 border-red-500/30"
                  : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"
              }`}>
              <Power size={16} />
              <span>{socket.telemetry?.armed ? "THRUSTERS ARMED (ON)" : "ARM VESSEL MOTORS"}</span>
            </button>

            {/* MODE */}
            <button onClick={handleToggleMode}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors shrink-0 ${
                socket.telemetry?.mode === "DEPTH_HOLD"
                  ? "bg-accent/20 text-accent border-accent/30"
                  : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"
              }`}>
              <ToggleLeft size={16} />
              <span>{socket.telemetry?.mode === "DEPTH_HOLD" ? "STABILIZER: DEPTH HOLD" : "CONTROL: MANUAL MODE"}</span>
            </button>

            {/* LIGHT */}
            <button onClick={handleToggleLight}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors shrink-0 ${
                lightState ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"
                           : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"
              }`}>
              <Play size={16} />
              <span>{lightState ? "LED FLOODLIGHT: ON" : "LED FLOODLIGHT: OFF"}</span>
            </button>

            {/* GRIPPER */}
            <button onClick={handleToggleGripper}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors shrink-0 ${
                gripperState ? "bg-green-500/20 text-green-500 border-green-500/30"
                             : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"
              }`}>
              <RotateCcw size={16} />
              <span>{gripperState ? "VESSEL GRIPPER: OPEN" : "VESSEL GRIPPER: CLOSE"}</span>
            </button>

            {/* ── Joystick Control Panel ── */}
            <div className="bg-[oklch(0.12_0.024_250)] rounded-xl border border-panel-border/60 p-3 shrink-0 space-y-3">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                  Pilot Input
                </span>
                <div className="flex items-center gap-1">
                  {/* Keyboard toggle */}
                  <button
                    onClick={() => setKeyboardEnabled(v => !v)}
                    title="Toggle Keyboard Control"
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border transition-all cursor-pointer ${
                      keyboardEnabled
                        ? "bg-accent/20 text-accent border-accent/40"
                        : "bg-panel/50 border-panel-border/50 text-muted-foreground hover:text-foreground"
                    }`}>
                    <Keyboard size={10} />
                    KB
                  </button>
                  {/* Joystick output toggle */}
                  <button
                    onClick={() => setJoystickEnabled(v => !v)}
                    title="Toggle Joystick Output"
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border transition-all cursor-pointer ${
                      joystickEnabled
                        ? "bg-green-500/20 text-green-400 border-green-500/40"
                        : "bg-panel/50 border-panel-border/50 text-muted-foreground hover:text-foreground"
                    }`}>
                    <Gamepad2 size={10} />
                    {joystickEnabled ? "ON" : "OFF"}
                  </button>
                </div>
              </div>

              {/* Status badge */}
              <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono font-bold ${
                gamepadConnected
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : keyboardEnabled
                  ? "bg-accent/10 border-accent/30 text-accent"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  gamepadConnected ? "bg-emerald-400 animate-pulse"
                  : keyboardEnabled ? "bg-accent"
                  : "bg-red-500"
                }`} />
                <span className="truncate">
                  {gamepadConnected
                    ? `GAMEPAD: ${gamepadName}`
                    : keyboardEnabled
                    ? "KEYBOARD (WASD + Arrows)"
                    : "NO INPUT — Connect gamepad or enable KB"}
                </span>
              </div>

              {/* Disarmed warning */}
              {!socket.telemetry?.armed && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg px-2.5 py-1.5 text-[9px] font-semibold text-center">
                  ⚠ DISARMED — Motor outputs ignored by Pixhawk until Armed
                </div>
              )}

              {/* Channel bars */}
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { label: "CH1 Lateral",  val: channels[1] },
                  { label: "CH2 Forward",  val: channels[2] },
                  { label: "CH3 Throttle", val: channels[3] },
                  { label: "CH4 Yaw",      val: channels[4] },
                ] as const).map((ch) => {
                  const pct = ((ch.val - 1100) / 800) * 100;
                  const active = ch.val !== 1500;
                  return (
                    <div key={ch.label} className={`p-1.5 rounded-lg border transition-colors ${
                      active ? "bg-emerald-500/5 border-emerald-500/20" : "bg-black/10 border-panel-border/20"
                    }`}>
                      <div className="flex justify-between items-center mb-1 text-[8px] font-mono">
                        <span className="text-muted-foreground">{ch.label}</span>
                        <span className={`font-bold tabular-nums ${active ? "text-emerald-400" : "text-muted-foreground"}`}>
                          {ch.val}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-panel-border/30 rounded-full overflow-hidden relative">
                        {/* Center marker */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/25 z-10" />
                        <div
                          className={`h-full rounded-full transition-all duration-75 ${
                            active ? "bg-gradient-to-r from-emerald-500 to-cyan-400" : "bg-panel-border/60"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Keyboard legend */}
              {keyboardEnabled && !gamepadConnected && (
                <div className="grid grid-cols-2 gap-1 text-[8px] text-muted-foreground">
                  <div className="flex items-center gap-1"><kbd className="bg-panel border border-panel-border rounded px-1 font-mono">W/S</kbd> Forward</div>
                  <div className="flex items-center gap-1"><kbd className="bg-panel border border-panel-border rounded px-1 font-mono">A/D</kbd> Lateral</div>
                  <div className="flex items-center gap-1"><kbd className="bg-panel border border-panel-border rounded px-1 font-mono">↑/↓</kbd> Throttle</div>
                  <div className="flex items-center gap-1"><kbd className="bg-panel border border-panel-border rounded px-1 font-mono">←/→</kbd> Yaw</div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-panel-border/40 pt-2.5 shrink-0">
            <button
              onClick={socket.sendEmergencyStop}
              className="w-full flex items-center justify-center gap-2 bg-[color:var(--color-danger)] text-white font-bold py-2 rounded-lg text-xs tracking-wider hover:opacity-90 cursor-pointer transition-opacity">
              <Power size={13} /> KILL POWER / EMERGENCY STOP
            </button>
          </div>
        </div>

        {/* Col 3: Diagnostics */}
        <div className="panel flex flex-col w-full lg:w-[280px] shrink-0 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="flex flex-col gap-2.5 flex-1">
            <div className="border-b border-panel-border/60 pb-2 shrink-0">
              <span className="label-caps">Vessel Diagnostics</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-panel-border/20 pb-1.5">
                <span className="label-caps">Vessel Depth</span>
                <span className="text-[color:var(--color-data)] font-bold font-mono">{depthVal.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between items-center border-b border-panel-border/20 pb-1.5">
                <span className="label-caps">Power Voltage</span>
                <span className="text-[color:var(--color-data)] font-bold font-mono">{batteryVoltage.toFixed(1)} V</span>
              </div>
              <div className="flex justify-between items-center border-b border-panel-border/20 pb-1.5">
                <span className="label-caps">Battery Capacity</span>
                <span className="text-[color:var(--color-data)] font-bold font-mono">{batteryRemaining}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="label-caps">MAVLink</span>
                <span className={`font-bold font-mono flex items-center gap-1.5 ${socket.mavlinkConnected ? "text-[color:var(--color-success)]" : "text-red-500"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${socket.mavlinkConnected ? "bg-[color:var(--color-success)]" : "bg-red-500"}`} />
                  {socket.mavlinkConnected ? "MAV_OK" : "NO_SYS_LINK"}
                </span>
              </div>
            </div>

            <div className="bg-[oklch(0.15_0.028_250)] rounded-lg p-2.5 border border-panel-border/70 mt-1.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="text-red-500" size={15} />
                  <span className="text-[11px] text-foreground font-semibold uppercase tracking-wide">Audio Depth Alarm</span>
                </div>
                <button
                  onClick={() => setAudioAlarmEnabled(v => !v)}
                  className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                    audioAlarmEnabled ? "bg-red-500/20 text-red-400 border-red-500/40" : "bg-panel border-panel-border text-muted-foreground"
                  }`}
                  title={audioAlarmEnabled ? "Mute Alarm" : "Enable Alarm"}>
                  {audioAlarmEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                </button>
              </div>

              <div className="text-[11px] text-muted-foreground leading-relaxed">
                Triggers acoustic and voice warning automatically if subsea depth exceeds{" "}
                <strong className="text-accent font-bold">1.8 meters</strong>.
              </div>

              {depthVal > 1.8 && audioAlarmEnabled && (
                <div className="bg-red-500/10 border border-red-500/40 text-red-400 rounded-md p-2 text-center text-[10px] font-bold font-mono animate-pulse uppercase tracking-wider">
                  Alarm active: danger depth
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-panel-border/40 pt-2 shrink-0 font-mono text-[11px] text-muted-foreground flex justify-between">
            <span>Safety System:</span>
            <span className={socket.connected ? "text-[color:var(--color-success)]" : "text-red-500"}>
              {socket.connected ? "DIAG_ACTIVE" : "COM_ERROR"}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="h-10 shrink-0 border-t border-panel-border px-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="label-caps">Mode</span>
            <span className="font-mono text-accent font-bold">{socket.telemetry?.mode ?? "MANUAL"}</span>
          </div>
          <div className="h-3.5 w-px bg-panel-border/60" />
          <div className="flex items-center gap-1.5">
            <span className="label-caps">Hardware Stabilizers</span>
            <span className="font-mono font-bold text-[color:var(--color-success)]">ACTIVE</span>
          </div>
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">
          Fail-Safe protocol: MAV_AUTO_LAND
        </div>
      </footer>
    </div>
  );
}
