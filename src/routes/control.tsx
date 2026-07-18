import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Power, ToggleLeft, Play, RotateCcw,
  Volume2, VolumeX, ShieldAlert, Gamepad2, Keyboard, Bug, Settings, X, RotateCw, Crosshair,
} from "lucide-react";
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

// ─── Clock ─────────────────────────────────────────────────────────────────────
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── PWM helpers ───────────────────────────────────────────────────────────────
const DEADZONE  = 0.10;
const PWM_RANGE = 400;

function applyDZ(v: number) {
  if (Math.abs(v) < DEADZONE) return 0;
  return (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);
}
function axisPWM(v: number, invert = false) {
  return Math.round(1500 + applyDZ(invert ? -v : v) * PWM_RANGE);
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type CH = { 1: number; 2: number; 3: number; 4: number };
const NEUTRAL: CH = { 1: 1500, 2: 1500, 3: 1500, 4: 1500 };

export type AxisMap  = { axisIdx: number; invert: boolean };
export type GPMapping = {
  lateral:  AxisMap;  // CH1
  forward:  AxisMap;  // CH2
  throttle: AxisMap;  // CH3
  yaw:      AxisMap;  // CH4
};

const DEFAULT_MAPPING: GPMapping = {
  lateral:  { axisIdx: 0, invert: false },
  forward:  { axisIdx: 1, invert: true  },
  throttle: { axisIdx: 3, invert: true  },
  yaw:      { axisIdx: 2, invert: false },
};

const LS_KEY = "rov_gp_mapping_v1";

function loadMapping(): GPMapping {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_MAPPING, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_MAPPING };
}

function saveMapping(m: GPMapping) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(m)); } catch {}
}

// ─── Function names for display ────────────────────────────────────────────────
const FN_META: Record<keyof GPMapping, { label: string; ch: number; color: string; desc: string }> = {
  lateral:  { label: "Lateral",  ch: 1, color: "text-cyan-400",    desc: "Strafe left / right" },
  forward:  { label: "Forward",  ch: 2, color: "text-emerald-400", desc: "Move forward / backward" },
  throttle: { label: "Throttle", ch: 3, color: "text-amber-400",   desc: "Ascend / descend" },
  yaw:      { label: "Yaw",      ch: 4, color: "text-violet-400",  desc: "Rotate left / right" },
};

// ─── Joystick Mapping Modal ─────────────────────────────────────────────────────
interface MappingModalProps {
  gpIdx:      number | null;
  mapping:    GPMapping;
  onSave:     (m: GPMapping) => void;
  onClose:    () => void;
}

function MappingModal({ gpIdx, mapping, onSave, onClose }: MappingModalProps) {
  const [draft,        setDraft]       = useState<GPMapping>({ ...mapping });
  const [detecting,    setDetecting]   = useState<keyof GPMapping | null>(null);
  const [liveAxes,     setLiveAxes]    = useState<number[]>([]);
  const detectRef    = useRef<keyof GPMapping | null>(null);
  const draftRef     = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  // Live axis polling
  useEffect(() => {
    const id = setInterval(() => {
      const gp = gpIdx !== null ? (navigator.getGamepads?.()[gpIdx] ?? null) : null;
      if (!gp) { setLiveAxes([]); return; }

      const axes = Array.from(gp.axes);
      setLiveAxes(axes);

      // DETECT mode: find axis moved beyond threshold
      const fn = detectRef.current;
      if (fn !== null) {
        const DETECT_THRESH = 0.5;
        let best = -1; let bestAbs = DETECT_THRESH;
        axes.forEach((v, i) => { if (Math.abs(v) > bestAbs) { bestAbs = Math.abs(v); best = i; } });
        if (best !== -1) {
          setDraft(prev => ({ ...prev, [fn]: { axisIdx: best, invert: prev[fn].invert } }));
          setDetecting(null);
          detectRef.current = null;
        }
      }
    }, 30);
    return () => clearInterval(id);
  }, [gpIdx]);

  const toggleDetect = (fn: keyof GPMapping) => {
    if (detecting === fn) {
      setDetecting(null);
      detectRef.current = null;
    } else {
      setDetecting(fn);
      detectRef.current = fn;
    }
  };

  const setAxis = (fn: keyof GPMapping, idx: number) =>
    setDraft(prev => ({ ...prev, [fn]: { ...prev[fn], axisIdx: idx } }));

  const toggleInvert = (fn: keyof GPMapping) =>
    setDraft(prev => ({ ...prev, [fn]: { ...prev[fn], invert: !prev[fn].invert } }));

  const handleSave = () => { saveMapping(draft); onSave(draft); onClose(); };
  const handleReset = () => setDraft({ ...DEFAULT_MAPPING });

  const gpAvail = gpIdx !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-[oklch(0.13_0.028_250)] border border-panel-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-panel-border/60 sticky top-0 bg-[oklch(0.13_0.028_250)] z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <Settings className="text-violet-400" size={16} />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">Joystick Axis Mapping</div>
              <div className="text-[10px] text-muted-foreground">Assign gamepad axes to ROV functions</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-panel border border-transparent hover:border-panel-border transition-colors cursor-pointer text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* No gamepad warning */}
          {!gpAvail && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-center text-amber-400 text-[11px] font-semibold">
              ⚠ Joystick tidak terdeteksi. Colok controller dan tekan sembarang button untuk mengaktifkan.
            </div>
          )}

          {/* Detect instructions */}
          {detecting && (
            <div className="bg-violet-500/10 border border-violet-500/40 rounded-xl p-3 flex items-center gap-3 animate-pulse">
              <Crosshair className="text-violet-400 shrink-0" size={20} />
              <div>
                <div className="text-violet-300 font-bold text-sm">DETECT MODE AKTIF</div>
                <div className="text-violet-400/80 text-[10px]">
                  Gerak axis yang ingin di-assign ke <strong className={FN_META[detecting].color}>{FN_META[detecting].label}</strong>...
                </div>
              </div>
              <button onClick={() => { setDetecting(null); detectRef.current = null; }}
                className="ml-auto px-2 py-1 rounded-lg border border-violet-500/40 text-violet-400 text-[9px] font-bold hover:bg-violet-500/20 cursor-pointer transition-colors">
                Batal
              </button>
            </div>
          )}

          {/* Function mapping rows */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Function Assignment</div>

            {(Object.keys(FN_META) as (keyof GPMapping)[]).map((fn) => {
              const meta   = FN_META[fn];
              const cur    = draft[fn];
              const axisV  = liveAxes[cur.axisIdx] ?? 0;
              const pct    = ((applyDZ(cur.invert ? -axisV : axisV) + 1) / 2) * 100;
              const isDetecting = detecting === fn;

              return (
                <div key={fn} className={`rounded-xl border p-3 transition-all ${
                  isDetecting ? "border-violet-500/60 bg-violet-500/5" : "border-panel-border/50 bg-[oklch(0.16_0.024_250)]"
                }`}>
                  <div className="flex items-center gap-3">
                    {/* Function label */}
                    <div className="w-24 shrink-0">
                      <div className={`font-bold text-sm ${meta.color}`}>{meta.label}</div>
                      <div className="text-[9px] text-muted-foreground">CH{meta.ch} · {meta.desc}</div>
                    </div>

                    {/* Axis selector */}
                    <div className="flex items-center gap-1.5 flex-1">
                      <span className="text-[9px] text-muted-foreground font-mono shrink-0">Axis</span>
                      <select
                        value={cur.axisIdx}
                        onChange={e => setAxis(fn, Number(e.target.value))}
                        className="bg-panel border border-panel-border rounded-lg px-2 py-1 text-[11px] font-mono text-foreground cursor-pointer focus:outline-none focus:border-accent w-20 shrink-0">
                        {(liveAxes.length > 0 ? liveAxes : Array(8).fill(0)).map((_, i) => (
                          <option key={i} value={i}>Axis {i}</option>
                        ))}
                      </select>

                      {/* Invert toggle */}
                      <button
                        onClick={() => toggleInvert(fn)}
                        title="Toggle invert"
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-bold transition-all cursor-pointer shrink-0 ${
                          cur.invert
                            ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                            : "bg-panel border-panel-border text-muted-foreground hover:text-foreground"
                        }`}>
                        <RotateCw size={9} />
                        {cur.invert ? "INVERTED" : "NORMAL"}
                      </button>

                      {/* Detect button */}
                      <button
                        onClick={() => toggleDetect(fn)}
                        disabled={!gpAvail}
                        title="Auto-detect axis"
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-bold transition-all cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                          isDetecting
                            ? "bg-violet-500/20 text-violet-300 border-violet-500/50 animate-pulse"
                            : "bg-panel border-panel-border text-muted-foreground hover:text-violet-400 hover:border-violet-500/40"
                        }`}>
                        <Crosshair size={9} />
                        {isDetecting ? "DETECTING..." : "DETECT"}
                      </button>
                    </div>
                  </div>

                  {/* Live axis bar */}
                  {gpAvail && (
                    <div className="mt-2 ml-[calc(6rem+0.75rem)]">
                      <div className="flex justify-between text-[8px] font-mono text-muted-foreground mb-0.5">
                        <span>Raw: {(axisV).toFixed(3)}</span>
                        <span>PWM: {axisPWM(axisV, cur.invert)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-panel-border/30 rounded-full overflow-hidden relative">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30 z-10" />
                        <div className={`h-full rounded-full transition-all duration-50 ${Math.abs(axisV) > DEADZONE ? `bg-gradient-to-r ${meta.color.replace("text-", "from-")} to-white/80` : "bg-panel-border/50"}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Live axis monitor */}
          {gpAvail && liveAxes.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                Live Axis Monitor — All Axes
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {liveAxes.map((v, i) => {
                  const pct = ((v + 1) / 2) * 100;
                  const used = Object.values(draft).some(m => m.axisIdx === i);
                  return (
                    <div key={i} className={`p-2 rounded-lg border ${used ? "border-accent/30 bg-accent/5" : "border-panel-border/30 bg-black/10"}`}>
                      <div className="flex justify-between text-[8px] font-mono mb-1">
                        <span className={used ? "text-accent font-bold" : "text-muted-foreground"}>
                          Axis {i}{used ? " ●" : ""}
                        </span>
                        <span className="text-foreground">{v.toFixed(3)}</span>
                      </div>
                      <div className="h-1 w-full bg-panel-border/30 rounded-full overflow-hidden relative">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10" />
                        <div className={`h-full rounded-full transition-all duration-50 ${Math.abs(v) > DEADZONE ? "bg-accent" : "bg-panel-border/50"}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[8px] text-muted-foreground mt-1.5">● = Axis yang sedang di-assign ke salah satu fungsi ROV</div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t border-panel-border/40">
            <button onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-panel-border text-muted-foreground text-xs font-semibold hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer">
              <RotateCw size={12} /> Reset Default
            </button>
            <button onClick={onClose}
              className="flex-1 px-3 py-2 rounded-lg border border-panel-border text-muted-foreground text-xs font-semibold hover:text-foreground transition-colors cursor-pointer">
              Batal
            </button>
            <button onClick={handleSave}
              className="flex-1 px-3 py-2 rounded-lg bg-accent text-white text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer">
              Simpan Mapping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
function PilotControlsPage() {
  const clk    = useClock();
  const socket = useROVSocket();

  // ── State ────────────────────────────────────────────────────────────────────
  const [gpName,       setGpName]       = useState<string | null>(null);
  const [channels,     setChannels]     = useState<CH>(NEUTRAL);
  const [emitCount,    setEmitCount]    = useState(0);
  const [showDebug,    setShowDebug]    = useState(false);
  const [showMapping,  setShowMapping]  = useState(false);
  const [kbEnabled,    setKbEnabled]    = useState(false);
  const [gpEnabled,    setGpEnabled]    = useState(true);
  const [lightState,   setLightState]   = useState(false);
  const [gripperState, setGripperState] = useState(false);
  const [alarmOn,      setAlarmOn]      = useState(true);
  const [mapping,      setMapping]      = useState<GPMapping>(loadMapping);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const socketRef  = useRef(socket);
  const gpIdxRef   = useRef<number | null>(null);
  const gpEnRef    = useRef(true);
  const kbEnRef    = useRef(false);
  const keysRef    = useRef<Record<string, boolean>>({});
  const emitCntRef = useRef(0);
  const mappingRef = useRef(mapping);

  useEffect(() => { socketRef.current  = socket;    });
  useEffect(() => { gpEnRef.current    = gpEnabled; }, [gpEnabled]);
  useEffect(() => { kbEnRef.current    = kbEnabled; }, [kbEnabled]);
  useEffect(() => { mappingRef.current = mapping;   }, [mapping]);

  // ── Control loop — setInterval 50ms (20Hz) ────────────────────────────────
  useEffect(() => {
    const tick = () => {
      // Auto-scan gamepad
      if (gpIdxRef.current === null) {
        const pads = navigator.getGamepads?.() ?? [];
        for (let i = 0; i < pads.length; i++) {
          if (pads[i]) { gpIdxRef.current = i; setGpName(pads[i]!.id); break; }
        }
      }

      let ch: CH = { ...NEUTRAL };
      const m = mappingRef.current;

      if (gpIdxRef.current !== null && gpEnRef.current) {
        const gp = navigator.getGamepads?.()[gpIdxRef.current] ?? null;
        if (!gp) {
          gpIdxRef.current = null;
          setGpName(null);
        } else {
          // Use mapping to read axes
          ch = {
            1: axisPWM(gp.axes[m.lateral.axisIdx]  ?? 0, m.lateral.invert),
            2: axisPWM(gp.axes[m.forward.axisIdx]  ?? 0, m.forward.invert),
            3: axisPWM(gp.axes[m.throttle.axisIdx] ?? 0, m.throttle.invert),
            4: axisPWM(gp.axes[m.yaw.axisIdx]      ?? 0, m.yaw.invert),
          };
        }
      } else if (kbEnRef.current && gpIdxRef.current === null) {
        const k = keysRef.current;
        ch = {
          1: 1500 + (k["d"] ? 300 : 0) - (k["a"] ? 300 : 0),
          2: 1500 + (k["w"] ? 300 : 0) - (k["s"] ? 300 : 0),
          3: 1500 + (k["arrowup"] ? 300 : 0) - (k["arrowdown"] ? 300 : 0),
          4: 1500 + (k["arrowright"] ? 300 : 0) - (k["arrowleft"] ? 300 : 0),
        };
      }

      setChannels({ ...ch });

      const s = socketRef.current;
      if (s.connected) {
        s.sendRCOverride(ch);
        emitCntRef.current += 1;
        if (emitCntRef.current % 10 === 0) setEmitCount(emitCntRef.current);
      }
    };

    const id = setInterval(tick, 50);
    return () => {
      clearInterval(id);
      if (socketRef.current.connected) socketRef.current.sendRCOverride(NEUTRAL);
    };
  }, []);

  // ── Gamepad disconnect ──────────────────────────────────────────────────────
  useEffect(() => {
    function onDisconnect(e: GamepadEvent) {
      if (gpIdxRef.current === e.gamepad.index) { gpIdxRef.current = null; setGpName(null); }
    }
    window.addEventListener("gamepaddisconnected", onDisconnect);
    return () => window.removeEventListener("gamepaddisconnected", onDisconnect);
  }, []);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const KEYS = ["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"];
    function onDown(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (KEYS.includes(k)) { if (k.startsWith("arrow")) e.preventDefault(); keysRef.current[k] = true; }
    }
    function onUp(e: KeyboardEvent) { keysRef.current[e.key.toLowerCase()] = false; }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

  // ── Telemetry ───────────────────────────────────────────────────────────────
  const roll   = socket.trajectory?.orientation?.roll  ?? 0;
  const pitch  = socket.trajectory?.orientation?.pitch ?? 0;
  const yaw    = socket.trajectory?.orientation?.yaw   ?? 0;
  const depth  = socket.telemetry?.depth               ?? 0;
  const volt   = socket.telemetry?.battery_voltage     ?? 0;
  const batPct = socket.telemetry?.battery_remaining   ?? 0;

  // ── Audio alarm ─────────────────────────────────────────────────────────────
  const lastAlarmRef = useRef(0);
  useEffect(() => {
    if (!alarmOn || depth <= 1.8) return;
    const t = Date.now();
    if (t - lastAlarmRef.current < 5000) return;
    lastAlarmRef.current = t;
    try {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx(); const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = "sawtooth"; osc.frequency.setValueAtTime(880, ctx.currentTime);
        g.gain.setValueAtTime(0.05, ctx.currentTime);
        osc.connect(g); g.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.35);
      }
    } catch {}
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("Warning. Critical Depth Threshold Reached.");
      u.lang = "en-US"; u.rate = 1.15; window.speechSynthesis.speak(u);
    }
  }, [depth, alarmOn]);

  const handleSaveMapping = useCallback((m: GPMapping) => setMapping(m), []);

  const toggleArm  = () => socket.telemetry?.armed ? socket.sendDisarm() : socket.sendArm();
  const toggleMode = () => socket.sendSetMode(socket.telemetry?.mode === "DEPTH_HOLD" ? "MANUAL" : "DEPTH_HOLD");
  const toggleLight = () => { const n = !lightState; setLightState(n); socket.sendLight(n); };
  const toggleGrip  = () => { const n = !gripperState; setGripperState(n); socket.sendGripper(n ? "open" : "close"); };

  const gpConn = gpName !== null;
  const pct    = (v: number) => ((v - 1100) / 800) * 100;
  const active = (v: number) => v !== 1500;

  const timeStr = clk.toLocaleTimeString("en-GB", { hour12: false });
  const dateStr = clk.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const dayName = clk.toLocaleDateString("en-GB", { weekday: "long" });

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-background text-foreground select-none overflow-y-auto lg:overflow-hidden">

      {/* Mapping Modal */}
      {showMapping && (
        <MappingModal
          gpIdx={gpIdxRef.current}
          mapping={mapping}
          onSave={handleSaveMapping}
          onClose={() => setShowMapping(false)}
        />
      )}

      {/* Top Bar */}
      <header className="h-12 shrink-0 border-b border-panel-border px-4 flex items-center justify-between bg-[color:var(--color-sidebar)] gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="label-caps">Team</span>
          <span className="font-mono font-semibold">Ocean Explorer</span>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="label-caps">University</span>
          <span>Politeknik Negeri Banyuwangi</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDebug(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold border transition-colors cursor-pointer ${showDebug ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" : "bg-panel border-panel-border text-muted-foreground hover:text-foreground"}`}
            title="Toggle Debug Overlay"><Bug size={10} /> DEBUG</button>
          <div className="text-right">
            <div className="font-mono text-xs leading-none">{timeStr}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{dayName}, {dateStr}</div>
          </div>
        </div>
      </header>

      {/* Debug overlay */}
      {showDebug && (
        <div className="shrink-0 border-b border-yellow-500/30 bg-yellow-500/5 px-4 py-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px] font-mono">
            {[
              { label: "SOCKET",      val: socket.connected       ? "✓ CONNECTED"   : "✗ DISCONNECTED",   ok: socket.connected },
              { label: "MAVLINK",     val: socket.mavlinkConnected? "✓ MAV_OK"      : "✗ NO_LINK",        ok: socket.mavlinkConnected },
              { label: "ARMED",       val: socket.telemetry?.armed? "✓ ARMED"       : "✗ DISARMED",       ok: !!socket.telemetry?.armed },
              { label: "EMIT COUNT",  val: `${emitCount} packets`,                                         ok: emitCount > 0 },
              { label: "GAMEPAD",     val: gpConn ? `✓ idx=${gpIdxRef.current}` : "✗ NONE",              ok: gpConn },
              { label: "RAW PWM",     val: `${channels[1]}/${channels[2]}/${channels[3]}/${channels[4]}`, ok: true },
              { label: "MAPPING",     val: `L:A${mapping.lateral.axisIdx} F:A${mapping.forward.axisIdx} T:A${mapping.throttle.axisIdx} Y:A${mapping.yaw.axisIdx}`, ok: true },
              { label: "LATENCY",     val: socket.latencyMs ? `${socket.latencyMs}ms` : "N/A",            ok: !!socket.latencyMs },
            ].map(r => (
              <div key={r.label}>
                <div className="text-yellow-400 font-bold mb-1">{r.label}</div>
                <div className={r.ok ? "text-emerald-400" : "text-red-400"}>{r.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3-Column layout */}
      <div className="flex-1 min-h-0 p-2.5 flex flex-col lg:flex-row gap-2.5 overflow-y-auto lg:overflow-hidden">

        {/* Col 1: Attitude */}
        <div className="panel flex flex-col flex-1 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="border-b border-panel-border/60 pb-2 shrink-0">
            <span className="label-caps">Attitude Flight Instrument</span>
          </div>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2.5 py-2.5 min-h-0">
            <div className="flex flex-col gap-1.5 min-h-0">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Attitude Indicator</span>
              <div className="flex-1 min-h-[130px] bg-[oklch(0.14_0.028_250)] rounded-lg border border-panel-border grid place-items-center relative">
                <img src={rovImage} alt="ROV" className="w-full h-full object-contain p-3"
                  style={{ transform: `rotate(${roll}deg) scale(${Math.max(0.65, 1 - Math.abs(pitch) / 180)})`, transition: "transform 0.1s ease-out" }} />
                <div className="absolute bottom-1.5 left-2 font-mono text-[10px] text-muted-foreground">R: {roll.toFixed(1)}° P: {pitch.toFixed(1)}°</div>
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
                <div className="absolute bottom-1.5 right-2 font-mono text-[10px] text-muted-foreground">HDG: {yaw.toFixed(1)}°</div>
              </div>
            </div>
          </div>
          <div className="border-t border-panel-border/40 pt-2 shrink-0">
            <div className="text-[10px] text-muted-foreground font-semibold text-center">Internal Gyroscopic AHRS Calibration: OK</div>
          </div>
        </div>

        {/* Col 2: Pilot Switchboard */}
        <div className="panel flex flex-col flex-1 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="border-b border-panel-border/60 pb-2 shrink-0">
            <span className="label-caps">Pilot Switchboard</span>
          </div>

          <div className="flex-1 flex flex-col gap-2 py-3 overflow-y-auto">
            <button onClick={toggleArm}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors shrink-0 ${socket.telemetry?.armed ? "bg-red-500/20 text-red-400 border-red-500/30 animate-pulse" : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"}`}>
              <Power size={16} /><span>{socket.telemetry?.armed ? "THRUSTERS ARMED — CLICK TO DISARM" : "ARM VESSEL MOTORS"}</span>
            </button>
            <button onClick={toggleMode}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors shrink-0 ${socket.telemetry?.mode === "DEPTH_HOLD" ? "bg-accent/20 text-accent border-accent/30" : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"}`}>
              <ToggleLeft size={16} /><span>{socket.telemetry?.mode === "DEPTH_HOLD" ? "STABILIZER: DEPTH HOLD" : "CONTROL: MANUAL MODE"}</span>
            </button>
            <button onClick={toggleLight}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors shrink-0 ${lightState ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/30" : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"}`}>
              <Play size={16} /><span>{lightState ? "LED FLOODLIGHT: ON" : "LED FLOODLIGHT: OFF"}</span>
            </button>
            <button onClick={toggleGrip}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors shrink-0 ${gripperState ? "bg-green-500/20 text-green-500 border-green-500/30" : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"}`}>
              <RotateCcw size={16} /><span>{gripperState ? "VESSEL GRIPPER: OPEN" : "VESSEL GRIPPER: CLOSE"}</span>
            </button>

            {/* Joystick Control Panel */}
            <div className="bg-[oklch(0.12_0.024_250)] rounded-xl border border-panel-border/60 p-3 shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Pilot Input</span>
                <div className="flex items-center gap-1">
                  {/* Mapping button */}
                  <button onClick={() => setShowMapping(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border transition-all cursor-pointer bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20"
                    title="Open Joystick Mapping">
                    <Settings size={10} /> MAPPING
                  </button>
                  <button onClick={() => setKbEnabled(v => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border transition-all cursor-pointer ${kbEnabled ? "bg-accent/20 text-accent border-accent/40" : "bg-panel/50 border-panel-border/50 text-muted-foreground hover:text-foreground"}`}>
                    <Keyboard size={10} /> KB
                  </button>
                  <button onClick={() => setGpEnabled(v => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border transition-all cursor-pointer ${gpEnabled ? "bg-green-500/20 text-green-400 border-green-500/40" : "bg-panel/50 border-panel-border/50 text-muted-foreground hover:text-foreground"}`}>
                    <Gamepad2 size={10} /> {gpEnabled ? "GP ON" : "GP OFF"}
                  </button>
                </div>
              </div>

              {/* Status badge */}
              <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono font-bold ${gpConn ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : kbEnabled ? "bg-accent/10 border-accent/30 text-accent" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${gpConn ? "bg-emerald-400 animate-pulse" : kbEnabled ? "bg-accent" : "bg-red-500"}`} />
                <span className="truncate">{gpConn ? `GAMEPAD: ${gpName}` : kbEnabled ? "KEYBOARD (WASD + Arrows)" : "NO INPUT — Connect gamepad or enable KB"}</span>
              </div>

              {/* Mapping summary (compact) */}
              {gpConn && (
                <div className="grid grid-cols-4 gap-1 text-[8px] font-mono">
                  {(Object.keys(FN_META) as (keyof GPMapping)[]).map(fn => {
                    const meta = FN_META[fn];
                    const m    = mapping[fn];
                    return (
                      <div key={fn} className="bg-black/20 rounded px-1.5 py-1 border border-panel-border/20">
                        <div className={`font-bold ${meta.color}`}>{meta.label.slice(0,3)}</div>
                        <div className="text-muted-foreground">A{m.axisIdx}{m.invert ? "↕" : ""}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!socket.telemetry?.armed && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg px-2.5 py-1.5 text-[9px] font-semibold text-center">
                  ⚠ DISARMED — Pixhawk will ignore all PWM until Armed
                </div>
              )}

              {/* Channel bars */}
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { label: "CH1 Lateral",  v: channels[1] },
                  { label: "CH2 Forward",  v: channels[2] },
                  { label: "CH3 Throttle", v: channels[3] },
                  { label: "CH4 Yaw",      v: channels[4] },
                ] as const).map((ch) => (
                  <div key={ch.label} className={`p-1.5 rounded-lg border transition-colors ${active(ch.v) ? "bg-emerald-500/5 border-emerald-500/20" : "bg-black/10 border-panel-border/20"}`}>
                    <div className="flex justify-between items-center mb-1 text-[8px] font-mono">
                      <span className="text-muted-foreground">{ch.label}</span>
                      <span className={`font-bold tabular-nums ${active(ch.v) ? "text-emerald-400" : "text-muted-foreground"}`}>{ch.v}</span>
                    </div>
                    <div className="h-1.5 w-full bg-panel-border/30 rounded-full overflow-hidden relative">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/25 z-10" />
                      <div className={`h-full rounded-full transition-all duration-75 ${active(ch.v) ? "bg-gradient-to-r from-emerald-500 to-cyan-400" : "bg-panel-border/60"}`}
                        style={{ width: `${pct(ch.v)}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-[8px] font-mono text-muted-foreground">
                <span>Packets sent: <span className={socket.connected ? "text-emerald-400 font-bold" : "text-red-400"}>{emitCount}</span></span>
                <span className={socket.connected ? "text-emerald-400" : "text-red-400"}>{socket.connected ? "● SOCKET OK" : "● NO SOCKET"}</span>
              </div>

              {kbEnabled && !gpConn && (
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
            <button onClick={socket.sendEmergencyStop}
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
              {[
                { label: "Vessel Depth",     val: `${depth.toFixed(2)} m` },
                { label: "Power Voltage",    val: `${volt.toFixed(1)} V` },
                { label: "Battery Capacity", val: `${batPct}%` },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center border-b border-panel-border/20 pb-1.5">
                  <span className="label-caps">{r.label}</span>
                  <span className="text-[color:var(--color-data)] font-bold font-mono">{r.val}</span>
                </div>
              ))}
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
                <button onClick={() => setAlarmOn(v => !v)}
                  className={`p-1.5 rounded-md border transition-colors cursor-pointer ${alarmOn ? "bg-red-500/20 text-red-400 border-red-500/40" : "bg-panel border-panel-border text-muted-foreground"}`}>
                  {alarmOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
                </button>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                Triggers if depth exceeds <strong className="text-accent font-bold">1.8 meters</strong>.
              </div>
              {depth > 1.8 && alarmOn && (
                <div className="bg-red-500/10 border border-red-500/40 text-red-400 rounded-md p-2 text-center text-[10px] font-bold font-mono animate-pulse uppercase tracking-wider">
                  ⚠ ALARM ACTIVE: DANGER DEPTH
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
        <div className="font-mono text-[11px] text-muted-foreground">Fail-Safe: MAV_AUTO_LAND</div>
      </footer>
    </div>
  );
}
