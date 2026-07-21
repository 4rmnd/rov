import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Power, ToggleLeft, Play, RotateCcw,
  Volume2, VolumeX, ShieldAlert, Gamepad2, Keyboard, Bug, Settings, X, RotateCw, Crosshair,
  Activity, Radio,
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
const DEADZONE = 0.10;
const PWM_RANGE = 400;
function applyDZ(v: number) {
  if (Math.abs(v) < DEADZONE) return 0;
  return (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);
}
function axisPWM(v: number, invert = false) {
  return Math.round(1500 + applyDZ(invert ? -v : v) * PWM_RANGE);
}

// ─── DirectInput 8-Direction POV Hat Parser (Axis #9) ──────────────────────────
function parsePOVHat(pov: number) {
  // Neutral / Idle values (0.0, 1.0, or outside [-1.05, 1.05])
  if (pov === 0 || pov > 1.05 || (pov > 0.82 && pov < 0.98)) {
    return { up: false, down: false, left: false, right: false };
  }
  const isUp = (pov <= -0.85) || (pov >= 0.85 && pov <= 1.05);
  const isDown = (pov >= 0.02 && pov <= 0.28);
  const isRight = (pov >= -0.58 && pov <= -0.28);
  const isLeft = (pov >= 0.58 && pov <= 0.82);

  const isUpRight = (pov >= -0.84 && pov <= -0.59);
  const isDownRight = (pov >= -0.27 && pov <= -0.01);
  const isDownLeft = (pov >= 0.29 && pov <= 0.57);

  return {
    up: isUp || isUpRight,
    down: isDown || isDownRight || isDownLeft,
    left: isLeft || isDownLeft,
    right: isRight || isUpRight || isDownRight,
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type CH = { 1: number; 2: number; 3: number; 4: number };
const NEUTRAL: CH = { 1: 1500, 2: 1500, 3: 1500, 4: 1500 };

// ── Axis Mapping ──────────────────────────────────────────────────────────────
export type AxisMap = { axisIdx: number; invert: boolean };
export type GPMapping = { lateral: AxisMap; forward: AxisMap; throttle: AxisMap; yaw: AxisMap };

const DEFAULT_AXIS_MAPPING: GPMapping = {
  forward: { axisIdx: 1, invert: true },   // Left Stick Y  (Up = Maju, Down = Mundur)
  yaw:     { axisIdx: 0, invert: false },  // Left Stick X  (Right = Belok Kanan, Left = Belok Kiri)
  throttle:{ axisIdx: 3, invert: true },  // Right Stick Y (Up = Naik, Down = Turun)
  lateral: { axisIdx: 2, invert: false },  // Right Stick X (Right = Geser Kanan, Left = Geser Kiri)
};

// ── Button Mapping ────────────────────────────────────────────────────────────
export type ROVAction =
  | "none" | "arm_toggle" | "arm" | "disarm"
  | "light_toggle" | "gripper_toggle" | "gripper_open" | "gripper_close"
  | "mode_toggle" | "mode_manual" | "mode_depth_hold" | "mode_stabilize"
  | "set_target" | "autonomous_start" | "autonomous_stop"
  | "emergency_stop";

export type ButtonMapping = Record<number, ROVAction>;

const ACTION_META: Record<ROVAction, { label: string; color: string }> = {
  none: { label: "— None (no action) —", color: "text-muted-foreground" },
  arm_toggle: { label: "ARM / DISARM toggle", color: "text-red-400" },
  arm: { label: "ARM motors", color: "text-red-400" },
  disarm: { label: "DISARM motors", color: "text-orange-400" },
  light_toggle: { label: "LED Light toggle", color: "text-yellow-400" },
  gripper_toggle: { label: "Gripper open/close toggle", color: "text-green-400" },
  gripper_open: { label: "Open gripper", color: "text-green-400" },
  gripper_close: { label: "Close gripper", color: "text-green-300" },
  mode_toggle: { label: "Mode: Manual ↔ Depth Hold", color: "text-cyan-400" },
  mode_manual: { label: "Set MANUAL mode", color: "text-cyan-400" },
  mode_depth_hold: { label: "Set DEPTH HOLD mode", color: "text-accent" },
  mode_stabilize: { label: "Set STABILIZE mode", color: "text-blue-400 font-bold" },
  set_target: { label: "Set Target (Lock Dock Station)", color: "text-purple-400 font-bold" },
  autonomous_start: { label: "Start Autonomous Mission", color: "text-emerald-400 font-bold" },
  autonomous_stop: { label: "Stop Autonomous Mission", color: "text-rose-400 font-bold" },
  emergency_stop: { label: "EMERGENCY STOP", color: "text-red-500" },
};

// PS2 stick via USB adapter — corrected HID button layout
// Verified order: Triangle=0, Circle=1, Cross=2, Square=3
// Shoulder: L2=4, R2=5, L1=6, R1=7  (L1/L2 and R1/R2 are swapped vs naive expectation)
// Select=8, Start=9, L3=10, R3=11
// D-pad: beberapa adapter map ke btn 12-15, sebagian lain via axes — lihat tab Axis untuk cek
const PS2_BUTTONS: Record<number, { label: string; sym: string; color: string }> = {
  0: { label: "Triangle △", sym: "△", color: "text-emerald-400" },
  1: { label: "Circle ○", sym: "○", color: "text-red-400" },
  2: { label: "Cross ×", sym: "×", color: "text-sky-400" },
  3: { label: "Square □", sym: "□", color: "text-pink-400" },
  4: { label: "L2 Trigger", sym: "L2", color: "text-violet-400" },
  5: { label: "R2 Trigger", sym: "R2", color: "text-violet-400" },
  6: { label: "L1 Bumper", sym: "L1", color: "text-amber-400" },
  7: { label: "R1 Bumper", sym: "R1", color: "text-amber-400" },
  8: { label: "Select", sym: "SL", color: "text-slate-400" },
  9: { label: "Start", sym: "ST", color: "text-slate-400" },
  10: { label: "L3 (Tombol Pentulan Stick Kiri)", sym: "L3 🕹️", color: "text-cyan-300 font-bold" },
  11: { label: "R3 (Tombol Pentulan Stick Kanan)", sym: "R3 🕹️", color: "text-cyan-300 font-bold" },
  12: { label: "D-pad ↑ (Up)", sym: "↑", color: "text-amber-400" },
  13: { label: "D-pad ↓ (Down)", sym: "↓", color: "text-amber-400" },
  14: { label: "D-pad ← (Left)", sym: "←", color: "text-amber-400" },
  15: { label: "D-pad → (Right)", sym: "→", color: "text-amber-400" },
  16: { label: "Btn 16 / Extra", sym: "16", color: "text-slate-500" },
  17: { label: "Btn 17 / Extra", sym: "17", color: "text-slate-500" },
  18: { label: "Btn 18 / Extra", sym: "18", color: "text-slate-500" },
  19: { label: "Btn 19 / Extra", sym: "19", color: "text-slate-500" },
  20: { label: "Pentulan Kiri ↑ (Left Stick Up)", sym: "L-Stick ↑", color: "text-cyan-300 font-bold" },
  21: { label: "Pentulan Kiri ↓ (Left Stick Down)", sym: "L-Stick ↓", color: "text-cyan-300 font-bold" },
  22: { label: "Pentulan Kiri ← (Left Stick Left)", sym: "L-Stick ←", color: "text-cyan-300 font-bold" },
  23: { label: "Pentulan Kiri → (Left Stick Right)", sym: "L-Stick →", color: "text-cyan-300 font-bold" },
  24: { label: "Pentulan Kanan ↑ (Right Stick Up)", sym: "R-Stick ↑", color: "text-violet-300 font-bold" },
  25: { label: "Pentulan Kanan ↓ (Right Stick Down)", sym: "R-Stick ↓", color: "text-violet-300 font-bold" },
  26: { label: "Pentulan Kanan ← (Right Stick Left)", sym: "R-Stick ←", color: "text-violet-300 font-bold" },
  27: { label: "Pentulan Kanan → (Right Stick Right)", sym: "R-Stick →", color: "text-violet-300 font-bold" },
};

// Default mapping pakai index yang sudah dikoreksi:
// Triangle=0, Circle=1, Cross=2, Square=3, Start=9
const DEFAULT_BUTTON_MAPPING: ButtonMapping = {
  0: "mode_toggle",    // Triangle △
  1: "gripper_toggle", // Circle ○
  2: "arm_toggle",     // Cross ×
  3: "light_toggle",   // Square □
  9: "emergency_stop", // Start
};

// ── LocalStorage ──────────────────────────────────────────────────────────────
const LS_AXIS = "rov_axis_mapping_v6";
const LS_BTN = "rov_btn_mapping_v2";
function loadLS<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? { ...fallback, ...JSON.parse(r) } : fallback; } catch { return fallback; }
}
function saveLS(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
}

// ── Axis function meta ────────────────────────────────────────────────────────
const AXIS_FN_META: Record<keyof GPMapping, { label: string; ch: number; color: string; desc: string }> = {
  lateral: { label: "Lateral", ch: 1, color: "text-cyan-400", desc: "Strafe left / right" },
  forward: { label: "Forward", ch: 2, color: "text-emerald-400", desc: "Move forward / backward" },
  throttle: { label: "Throttle", ch: 3, color: "text-amber-400", desc: "Ascend / descend" },
  yaw: { label: "Yaw", ch: 4, color: "text-violet-400", desc: "Rotate left / right" },
};

// ─── Mapping Modal ─────────────────────────────────────────────────────────────
interface MappingModalProps {
  gpIdx: number | null;
  axisMapping: GPMapping;
  btnMapping: ButtonMapping;
  onSave: (axis: GPMapping, btn: ButtonMapping) => void;
  onClose: () => void;
}

function MappingModal({ gpIdx, axisMapping, btnMapping, onSave, onClose }: MappingModalProps) {
  const [tab, setTab] = useState<"axis" | "button">("button");
  const [draftAxis, setDraftAxis] = useState<GPMapping>({ ...axisMapping });
  const [draftBtn, setDraftBtn] = useState<ButtonMapping>({ ...btnMapping });
  const [detectAxis, setDetectAxis] = useState<keyof GPMapping | null>(null);
  const [detectBtn, setDetectBtn] = useState<number | null>(null);
  const [liveAxes, setLiveAxes] = useState<number[]>([]);
  const [liveBtns, setLiveBtns] = useState<boolean[]>([]);
  const [prevBtns, setPrevBtns] = useState<boolean[]>([]);
  const [activeGpName, setActiveGpName] = useState<string | null>(null);

  const detectAxisRef = useRef<keyof GPMapping | null>(null);
  const detectBtnRef = useRef<number | null>(null);
  const draftAxisRef = useRef(draftAxis);
  useEffect(() => { draftAxisRef.current = draftAxis; }, [draftAxis]);
  useEffect(() => { detectAxisRef.current = detectAxis; }, [detectAxis]);
  useEffect(() => { detectBtnRef.current = detectBtn; }, [detectBtn]);

  // Live poll: dynamically scan all connected gamepads in browser
  useEffect(() => {
    const id = setInterval(() => {
      const pads = navigator.getGamepads?.() ?? [];
      let gp: Gamepad | null = null;
      if (gpIdx !== null && pads[gpIdx]) {
        gp = pads[gpIdx];
      } else {
        for (let i = 0; i < pads.length; i++) {
          if (pads[i]) { gp = pads[i]; break; }
        }
      }

      if (!gp) {
        setLiveAxes([]);
        setLiveBtns([]);
        setActiveGpName(null);
        return;
      }

      setActiveGpName(gp.id);
      const axes = Array.from(gp.axes);
      const btns = Array.from(gp.buttons).map(b => b.pressed || (typeof b === "object" && b.value > 0.5));

      // Virtual D-pad buttons 12, 13, 14, 15 from Axis #9 (POV Hat)
      const povParsed = parsePOVHat(axes[9] ?? axes[4] ?? 0);
      if (povParsed.up) btns[12] = true; // Up -> D-pad ↑
      if (povParsed.down) btns[13] = true; // Down -> D-pad ↓
      if (povParsed.left) btns[14] = true; // Left -> D-pad ←
      if (povParsed.right) btns[15] = true; // Right -> D-pad →

      // Virtual Stick Deflections for Left Stick & Right Stick (20..27)
      const a0 = axes[0] ?? 0;
      const a1 = axes[1] ?? 0;
      const a2 = axes[2] ?? 0;
      const a5 = axes[5] ?? 0;

      if (a1 < -0.45) btns[20] = true; // Left Stick Up
      if (a1 > 0.45) btns[21] = true; // Left Stick Down
      if (a0 < -0.45) btns[22] = true; // Left Stick Left
      if (a0 > 0.45) btns[23] = true; // Left Stick Right

      if (a2 < -0.45) btns[24] = true; // Right Stick Up
      if (a2 > 0.45) btns[25] = true; // Right Stick Down
      if (a5 < -0.45) btns[26] = true; // Right Stick Left
      if (a5 > 0.45) btns[27] = true; // Right Stick Right

      setLiveAxes(axes);
      setLiveBtns(btns);

      // Axis detect
      const aFn = detectAxisRef.current;
      if (aFn !== null) {
        let best = -1; let bestAbs = 0.5;
        axes.forEach((v, i) => { if (Math.abs(v) > bestAbs) { bestAbs = Math.abs(v); best = i; } });
        if (best !== -1) {
          setDraftAxis(prev => ({ ...prev, [aFn]: { axisIdx: best, invert: prev[aFn].invert } }));
          setDetectAxis(null); detectAxisRef.current = null;
        }
      }

      // Button detect: detect rising edge
      const dSlot = detectBtnRef.current;
      if (dSlot !== null) {
        setPrevBtns(prev => {
          btns.forEach((pressed, i) => {
            if (pressed && !prev[i]) {
              setDraftBtn(cur => {
                const action = cur[dSlot] ?? "none";
                const next = { ...cur };
                delete next[dSlot];
                next[i] = action;
                return next;
              });
              setDetectBtn(null); detectBtnRef.current = null;
            }
          });
          return btns;
        });
      } else {
        setPrevBtns(btns);
      }
    }, 30);
    return () => clearInterval(id);
  }, [gpIdx]);

  const gpAvail = activeGpName !== null || liveBtns.length > 0;

  const handleSave = () => { saveLS(LS_AXIS, draftAxis); saveLS(LS_BTN, draftBtn); onSave(draftAxis, draftBtn); onClose(); };

  const setButtonAction = (btnIdx: number, action: ROVAction) => {
    setDraftBtn(prev => ({ ...prev, [btnIdx]: action }));
  };
  const removeButton = (btnIdx: number) => {
    setDraftBtn(prev => { const n = { ...prev }; delete n[btnIdx]; return n; });
  };
  const allBtnIndices = Array.from(new Set([
    ...Object.keys(draftBtn).map(Number),
    ...liveBtns.map((_, i) => i),
    ...Object.keys(PS2_BUTTONS).map(Number),
  ])).sort((a, b) => a - b).slice(0, 20);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative bg-[oklch(0.13_0.028_250)] border border-panel-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-panel-border/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 grid place-items-center">
              <Settings className="text-violet-400" size={16} />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">Controller Mapping — PS2</div>
              <div className="text-[10px] text-muted-foreground">Assign axes and buttons to ROV functions</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-panel border border-transparent hover:border-panel-border cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex px-5 pt-3 gap-2 shrink-0">
          {(["button", "axis"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${tab === t ? "bg-violet-500/20 text-violet-300 border-violet-500/40" : "bg-panel/50 border-panel-border/50 text-muted-foreground hover:text-foreground"}`}>
              {t === "button" ? "🎮 Button Mapping" : "🕹️ Axis Mapping"}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Gamepad Status Banner */}
          {gpAvail ? (
            <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-xl p-3 flex items-center justify-between text-emerald-300 text-xs font-semibold">
              <div className="flex items-center gap-2 truncate">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                <span className="truncate">✓ CONTROLLER TERHUBUNG: <strong className="font-mono text-emerald-200">{activeGpName}</strong></span>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono shrink-0">Tekan tombol / gerak stik</span>
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between text-amber-300 text-xs font-semibold">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span>⚠ JOYSTICK BELUM AKTIF DI BROWSER</span>
              </div>
              <span className="text-[10px] font-mono text-amber-400/90 shrink-0">Colok USB &amp; TEKAN SEMBARANG TOMBOL</span>
            </div>
          )}

          {/* ── BUTTON MAPPING TAB ── */}
          {tab === "button" && (
            <>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Button → ROV Action Assignment
              </div>
              <div className="text-[9px] text-muted-foreground -mt-2">
                Tekan tombol di joystick untuk lihat yang mana (akan menyala hijau terang saat ditekan), lalu assign aksi.
              </div>

              {/* Pentulan Joystick Directions Box (Analog Sticks 20-27) */}
              <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-violet-300 font-bold text-xs">
                    <span className="text-base">🕹️</span>
                    <span>MAPPING PENTULAN JOYSTICK (ANALOG STICKS)</span>
                  </div>
                  <span className="text-[9px] text-violet-400 font-mono">Gerakkan Pentulan Stick</span>
                </div>
                <div className="text-[9px] text-muted-foreground -mt-2">
                  Gerakkan analog stick kiri/kanan ke arah yang diinginkan (akan menyala hijau live) untuk assign fungsi khusus!
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {/* Left Stick Directions (20-23) */}
                  <div className="bg-[oklch(0.14_0.02_250)] p-2.5 rounded-lg border border-cyan-500/30 space-y-2">
                    <div className="text-[10px] font-bold text-cyan-300 flex items-center gap-1">
                      <span>🕹️ Pentulan Kiri (Left Stick)</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {[20, 21, 22, 23].map(btnIdx => {
                        const ps2 = PS2_BUTTONS[btnIdx];
                        const action = draftBtn[btnIdx] ?? "none";
                        const pressed = liveBtns[btnIdx] ?? false;
                        return (
                          <div key={btnIdx} className={`p-2 rounded border transition-all duration-75 flex items-center justify-between gap-2 ${pressed
                            ? "border-emerald-400 bg-emerald-500/30 ring-2 ring-emerald-400 shadow-md scale-[1.02]"
                            : "border-panel-border/40 bg-panel/50"
                            }`}>
                            <span className={`text-[10px] font-bold shrink-0 ${pressed ? "text-emerald-300" : ps2?.color}`}>{ps2?.sym}</span>
                            <select
                              value={action}
                              onChange={e => setButtonAction(btnIdx, e.target.value as ROVAction)}
                              className="bg-panel border border-panel-border rounded px-1.5 py-0.5 text-[10px] font-mono text-foreground focus:outline-none focus:border-cyan-400 min-w-0 cursor-pointer">
                              {(Object.keys(ACTION_META) as ROVAction[]).map(a => (
                                <option key={a} value={a}>{ACTION_META[a].label}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Stick Directions (24-27) */}
                  <div className="bg-[oklch(0.14_0.02_250)] p-2.5 rounded-lg border border-violet-500/30 space-y-2">
                    <div className="text-[10px] font-bold text-violet-300 flex items-center gap-1">
                      <span>🕹️ Pentulan Kanan (Right Stick)</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {[24, 25, 26, 27].map(btnIdx => {
                        const ps2 = PS2_BUTTONS[btnIdx];
                        const action = draftBtn[btnIdx] ?? "none";
                        const pressed = liveBtns[btnIdx] ?? false;
                        return (
                          <div key={btnIdx} className={`p-2 rounded border transition-all duration-75 flex items-center justify-between gap-2 ${pressed
                            ? "border-emerald-400 bg-emerald-500/30 ring-2 ring-emerald-400 shadow-md scale-[1.02]"
                            : "border-panel-border/40 bg-panel/50"
                            }`}>
                            <span className={`text-[10px] font-bold shrink-0 ${pressed ? "text-emerald-300" : ps2?.color}`}>{ps2?.sym}</span>
                            <select
                              value={action}
                              onChange={e => setButtonAction(btnIdx, e.target.value as ROVAction)}
                              className="bg-panel border border-panel-border rounded px-1.5 py-0.5 text-[10px] font-mono text-foreground focus:outline-none focus:border-violet-400 min-w-0 cursor-pointer">
                              {(Object.keys(ACTION_META) as ROVAction[]).map(a => (
                                <option key={a} value={a}>{ACTION_META[a].label}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* D-pad info */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-[9px] text-amber-300/80">
                <span className="font-bold text-amber-300">⚠ D-pad:</span> D-pad terintegrasi otomatis dari Axis #9. Tekan D-pad Atas/Bawah/Kiri/Kanan untuk tes menyala hijau.
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {allBtnIndices.map(btnIdx => {
                  const ps2 = PS2_BUTTONS[btnIdx];
                  const action = draftBtn[btnIdx] ?? "none";
                  const pressed = liveBtns[btnIdx] ?? false;
                  const hasAssign = action !== "none";

                  return (
                    <div key={btnIdx} className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all duration-75 ${pressed
                      ? "border-emerald-400 bg-emerald-500/25 ring-2 ring-emerald-400/80 shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-[1.01]"
                      : hasAssign
                        ? "border-violet-500/30 bg-violet-500/5"
                        : "border-panel-border/40 bg-[oklch(0.16_0.02_250)]"
                      }`}>
                      {/* Button symbol badge */}
                      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center font-bold text-sm shrink-0 transition-all ${pressed
                        ? "bg-emerald-400 text-slate-950 border-emerald-200 font-extrabold scale-110 shadow-lg"
                        : `bg-panel border-panel-border ${ps2?.color ?? "text-muted-foreground"}`
                        }`}>
                        {ps2?.sym ?? btnIdx}
                      </div>

                      {/* Label */}
                      <div className="w-28 shrink-0">
                        <div className={`font-semibold text-[11px] ${pressed ? "text-emerald-300 font-bold" : ps2?.color ?? "text-muted-foreground"}`}>
                          {ps2?.label ?? `Button ${btnIdx}`}
                        </div>
                        {pressed && (
                          <div className="text-[9px] text-emerald-300 font-mono font-bold animate-pulse">● PRESSED / DITEKAN</div>
                        )}
                      </div>

                      {/* Action selector */}
                      <select
                        value={action}
                        onChange={e => setButtonAction(btnIdx, e.target.value as ROVAction)}
                        className="flex-1 bg-panel border border-panel-border rounded-lg px-2 py-1.5 text-[11px] font-mono text-foreground cursor-pointer focus:outline-none focus:border-violet-500/50 min-w-0">
                        {(Object.keys(ACTION_META) as ROVAction[]).map(a => (
                          <option key={a} value={a}>{ACTION_META[a].label}</option>
                        ))}
                      </select>

                      {/* Remove */}
                      {hasAssign && (
                        <button onClick={() => removeButton(btnIdx)}
                          title="Clear assignment"
                          className="shrink-0 p-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Current mapping summary */}
              <div className="bg-black/20 rounded-xl border border-panel-border/30 p-3">
                <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Current Mapping Summary</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(draftBtn).filter(([, a]) => a !== "none").map(([btnIdx, action]) => {
                    const ps2 = PS2_BUTTONS[Number(btnIdx)];
                    const act = ACTION_META[action as ROVAction];
                    return (
                      <div key={btnIdx} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[8px] font-bold bg-panel border-panel-border/50 ${act.color}`}>
                        <span className={`${ps2?.color ?? ""}`}>{ps2?.sym ?? `B${btnIdx}`}</span>
                        <span className="text-panel-border/80">→</span>
                        <span>{action.replace(/_/g, " ")}</span>
                      </div>
                    );
                  })}
                  {Object.values(draftBtn).every(a => a === "none") && (
                    <div className="text-[9px] text-muted-foreground">No buttons assigned yet</div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── AXIS MAPPING TAB ── */}
          {tab === "axis" && (
            <>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Stick Axis → ROV Movement Channel
              </div>

              {detectAxis && (
                <div className="bg-violet-500/10 border border-violet-500/40 rounded-xl p-3 flex items-center gap-3 animate-pulse">
                  <Crosshair className="text-violet-400 shrink-0" size={18} />
                  <div>
                    <div className="text-violet-300 font-bold text-sm">DETECT MODE</div>
                    <div className="text-violet-400/80 text-[10px]">
                      Gerak axis yang ingin di-assign ke <span className={AXIS_FN_META[detectAxis].color}>{AXIS_FN_META[detectAxis].label}</span>
                    </div>
                  </div>
                  <button onClick={() => { setDetectAxis(null); detectAxisRef.current = null; }}
                    className="ml-auto px-2 py-1 rounded-lg border border-violet-500/40 text-violet-400 text-[9px] font-bold cursor-pointer">
                    Batal
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {(Object.keys(AXIS_FN_META) as (keyof GPMapping)[]).map(fn => {
                  const meta = AXIS_FN_META[fn];
                  const cur = draftAxis[fn];
                  const axisV = liveAxes[cur.axisIdx] ?? 0;
                  const pct = ((applyDZ(cur.invert ? -axisV : axisV) + 1) / 2) * 100;
                  const isDetecting = detectAxis === fn;
                  return (
                    <div key={fn} className={`rounded-xl border p-3 transition-all ${isDetecting ? "border-violet-500/60 bg-violet-500/5" : "border-panel-border/50 bg-[oklch(0.16_0.024_250)]"}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-24 shrink-0">
                          <div className={`font-bold text-sm ${meta.color}`}>{meta.label}</div>
                          <div className="text-[9px] text-muted-foreground">CH{meta.ch} · {meta.desc}</div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-1 flex-wrap">
                          <span className="text-[9px] text-muted-foreground font-mono shrink-0">Axis</span>
                          <select value={cur.axisIdx} onChange={e => setDraftAxis(prev => ({ ...prev, [fn]: { ...prev[fn], axisIdx: Number(e.target.value) } }))}
                            className="bg-panel border border-panel-border rounded-lg px-2 py-1 text-[11px] font-mono text-foreground cursor-pointer focus:outline-none w-20 shrink-0">
                            {Array.from({ length: Math.max(10, liveAxes.length) }, (_, i) => (
                              <option key={i} value={i}>Axis {i}</option>
                            ))}
                          </select>
                          <button onClick={() => setDraftAxis(prev => ({ ...prev, [fn]: { ...prev[fn], invert: !prev[fn].invert } }))}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-bold transition-all cursor-pointer shrink-0 ${cur.invert ? "bg-orange-500/20 text-orange-400 border-orange-500/40" : "bg-panel border-panel-border text-muted-foreground hover:text-foreground"}`}>
                            <RotateCw size={9} />{cur.invert ? "INVERTED" : "NORMAL"}
                          </button>
                          <button onClick={() => { setDetectAxis(fn); detectAxisRef.current = fn; }} disabled={!gpAvail}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-bold transition-all cursor-pointer shrink-0 disabled:opacity-40 ${isDetecting ? "bg-violet-500/20 text-violet-300 border-violet-500/50 animate-pulse" : "bg-panel border-panel-border text-muted-foreground hover:text-violet-400"}`}>
                            <Crosshair size={9} />{isDetecting ? "DETECTING..." : "DETECT"}
                          </button>
                        </div>
                      </div>
                      {gpAvail && (
                        <div className="mt-2 ml-[calc(6rem+0.75rem)]">
                          <div className="flex justify-between text-[8px] font-mono text-muted-foreground mb-0.5">
                            <span>Raw: {axisV.toFixed(3)}</span><span>PWM: {axisPWM(axisV, cur.invert)}</span>
                          </div>
                          <div className="h-1.5 w-full bg-panel-border/30 rounded-full overflow-hidden relative">
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30 z-10" />
                            <div className={`h-full rounded-full transition-all ${Math.abs(axisV) > DEADZONE ? "bg-gradient-to-r from-violet-500 to-cyan-400" : "bg-panel-border/50"}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {gpAvail && (
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">All Live Axes</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {Array.from({ length: Math.max(8, liveAxes.length) }, (_, i) => {
                      const v = liveAxes[i] ?? 0;
                      const used = Object.values(draftAxis).some(m => m.axisIdx === i);
                      return (
                        <div key={i} className={`p-2 rounded-lg border ${used ? "border-accent/30 bg-accent/5" : "border-panel-border/30 bg-black/10"}`}>
                          <div className="flex justify-between text-[8px] font-mono mb-1">
                            <span className={used ? "text-accent font-bold" : "text-muted-foreground"}>A{i}{used ? "●" : ""}</span>
                            <span className="text-foreground">{v.toFixed(2)}</span>
                          </div>
                          <div className="h-1 w-full bg-panel-border/30 rounded-full overflow-hidden relative">
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10" />
                            <div className={`h-full rounded-full ${Math.abs(v) > DEADZONE ? "bg-accent" : "bg-panel-border/50"}`} style={{ width: `${((v + 1) / 2) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-panel-border/40 shrink-0">
          <button onClick={() => { setDraftAxis({ ...DEFAULT_AXIS_MAPPING }); setDraftBtn({ ...DEFAULT_BUTTON_MAPPING }); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-panel-border text-muted-foreground text-xs font-semibold hover:text-foreground cursor-pointer transition-colors">
            <RotateCw size={12} /> Reset Default
          </button>
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg border border-panel-border text-muted-foreground text-xs font-semibold hover:text-foreground cursor-pointer transition-colors">
            Batal
          </button>
          <button onClick={handleSave} className="flex-1 px-3 py-2 rounded-lg bg-violet-500 text-white text-xs font-bold hover:opacity-90 cursor-pointer transition-opacity">
            Simpan Mapping
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
function PilotControlsPage() {
  const clk = useClock();
  const socket = useROVSocket();

  const [gpName, setGpName] = useState<string | null>(null);
  const [channels, setChannels] = useState<CH>(NEUTRAL);
  const [emitCount, setEmitCount] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [kbEnabled, setKbEnabled] = useState(false);
  const [gpEnabled, setGpEnabled] = useState(true);
  const [lightState, setLightState] = useState(false);
  const [gripperState, setGripperState] = useState(false);
  const [alarmOn, setAlarmOn] = useState(true);
  const [axisMap, setAxisMap] = useState<GPMapping>(() => loadLS(LS_AXIS, DEFAULT_AXIS_MAPPING));
  const [btnMap, setBtnMap] = useState<ButtonMapping>(() => loadLS(LS_BTN, DEFAULT_BUTTON_MAPPING));

  const socketRef = useRef(socket);
  const gpIdxRef = useRef<number | null>(null);
  const gpEnRef = useRef(true);
  const kbEnRef = useRef(false);
  const keysRef = useRef<Record<string, boolean>>({});
  const emitCntRef = useRef(0);
  const axisMapRef = useRef(axisMap);
  const btnMapRef = useRef(btnMap);
  const prevBtnsRef = useRef<boolean[]>([]);
  // Track local light/gripper in refs for button action handlers
  const lightRef = useRef(lightState);
  const gripperRef = useRef(gripperState);

  useEffect(() => { socketRef.current = socket; });
  useEffect(() => { gpEnRef.current = gpEnabled; }, [gpEnabled]);
  useEffect(() => { kbEnRef.current = kbEnabled; }, [kbEnabled]);
  useEffect(() => { axisMapRef.current = axisMap; }, [axisMap]);
  useEffect(() => { btnMapRef.current = btnMap; }, [btnMap]);
  useEffect(() => { lightRef.current = lightState; }, [lightState]);
  useEffect(() => { gripperRef.current = gripperState; }, [gripperState]);

  // Execute action from button press
  const executeAction = useCallback((action: ROVAction) => {
    const s = socketRef.current;
    switch (action) {
      case "arm_toggle": s.telemetry?.armed ? s.sendDisarm() : s.sendArm(); break;
      case "arm": s.sendArm(); break;
      case "disarm": s.sendDisarm(); break;
      case "light_toggle": setLightState(v => { const n = !v; lightRef.current = n; s.sendLight(n); return n; }); break;
      case "gripper_toggle": setGripperState(v => { const n = !v; gripperRef.current = n; s.sendGripper(n ? "open" : "close"); return n; }); break;
      case "gripper_open": setGripperState(true); s.sendGripper("open"); break;
      case "gripper_close": setGripperState(false); s.sendGripper("close"); break;
      case "mode_toggle": s.sendSetMode(s.telemetry?.mode === "DEPTH_HOLD" ? "MANUAL" : "DEPTH_HOLD"); break;
      case "mode_manual": s.sendSetMode("MANUAL"); break;
      case "mode_depth_hold": s.sendSetMode("DEPTH_HOLD"); break;
      case "mode_stabilize": s.sendSetMode("STABILIZE"); break;
      case "set_target": s.sendAutonomousStart("DOCK_STATION_ALPHA"); break;
      case "autonomous_start": s.sendAutonomousStart("AUTONOMOUS_MISSION"); break;
      case "autonomous_stop": s.sendAutonomousStop(); break;
      case "emergency_stop": s.sendEmergencyStop(); break;
      default: break;
    }
  }, []);

  // Control loop
  useEffect(() => {
    const tick = () => {
      // Auto-scan
      if (gpIdxRef.current === null) {
        const pads = navigator.getGamepads?.() ?? [];
        for (let i = 0; i < pads.length; i++) {
          if (pads[i]) { gpIdxRef.current = i; setGpName(pads[i]!.id); break; }
        }
      }

      let ch: CH = { ...NEUTRAL };
      const am = axisMapRef.current;

      if (gpIdxRef.current !== null && gpEnRef.current) {
        const gp = navigator.getGamepads?.()[gpIdxRef.current] ?? null;
        if (!gp) {
          gpIdxRef.current = null; setGpName(null);
        } else {
          // Build movement channels from axis mapping
          ch = {
            1: axisPWM(gp.axes[am.lateral.axisIdx] ?? 0, am.lateral.invert),
            2: axisPWM(gp.axes[am.forward.axisIdx] ?? 0, am.forward.invert),
            3: axisPWM(gp.axes[am.throttle.axisIdx] ?? 0, am.throttle.invert),
            4: axisPWM(gp.axes[am.yaw.axisIdx] ?? 0, am.yaw.invert),
          };

          // D-Pad movement support via Axis #9 (POV Hat) or Buttons 12-15
          const bm = btnMapRef.current;
          const povParsed = parsePOVHat(gp.axes[9] ?? gp.axes[4] ?? 0);

          if (ch[2] === 1500) {
            if (povParsed.up) ch[2] = 1800;     // D-Pad Up -> Forward (1800)
            else if (povParsed.down) ch[2] = 1200; // D-Pad Down -> Backward (1200)
          }
          if (ch[1] === 1500) {
            if (povParsed.left) ch[1] = 1200;   // D-Pad Left -> Lateral Left (1200)
            else if (povParsed.right) ch[1] = 1800; // D-Pad Right -> Lateral Right (1800)
          }

          // Fallback D-Pad Buttons 12=Up, 13=Down, 14=Left, 15=Right
          if (ch[2] === 1500) {
            if (gp.buttons[12]?.pressed && (!bm[12] || bm[12] === "none")) ch[2] = 1800;
            else if (gp.buttons[13]?.pressed && (!bm[13] || bm[13] === "none")) ch[2] = 1200;
          }
          if (ch[1] === 1500) {
            if (gp.buttons[15]?.pressed && (!bm[15] || bm[15] === "none")) ch[1] = 1800;
            else if (gp.buttons[14]?.pressed && (!bm[14] || bm[14] === "none")) ch[1] = 1200;
          }

          // Button press detection (rising edge only)
          const btns = Array.from(gp.buttons).map(b => b.pressed || (typeof b === "object" && b.value > 0.5));
          if (povParsed.up) btns[12] = true;
          if (povParsed.down) btns[13] = true;
          if (povParsed.left) btns[14] = true;
          if (povParsed.right) btns[15] = true;
          const prev = prevBtnsRef.current;
          btns.forEach((pressed, i) => {
            if (pressed && !(prev[i] ?? false)) {
              const action = bm[i];
              if (action && action !== "none") executeAction(action);
            }
          });
          prevBtnsRef.current = btns;
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
        emitCntRef.current++;
        if (emitCntRef.current % 10 === 0) setEmitCount(emitCntRef.current);
      }
    };

    const id = setInterval(tick, 50);
    return () => { clearInterval(id); if (socketRef.current.connected) socketRef.current.sendRCOverride(NEUTRAL); };
  }, [executeAction]);

  useEffect(() => {
    function onDisc(e: GamepadEvent) { if (gpIdxRef.current === e.gamepad.index) { gpIdxRef.current = null; setGpName(null); } }
    window.addEventListener("gamepaddisconnected", onDisc);
    return () => window.removeEventListener("gamepaddisconnected", onDisc);
  }, []);

  useEffect(() => {
    const KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
    function onDown(e: KeyboardEvent) { const k = e.key.toLowerCase(); if (KEYS.includes(k)) { if (k.startsWith("arrow")) e.preventDefault(); keysRef.current[k] = true; } }
    function onUp(e: KeyboardEvent) { keysRef.current[e.key.toLowerCase()] = false; }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

  const roll = socket.trajectory?.orientation?.roll ?? 0;
  const pitch = socket.trajectory?.orientation?.pitch ?? 0;
  const yaw = socket.trajectory?.orientation?.yaw ?? 0;
  const depth = socket.telemetry?.depth ?? 0;
  const volt = socket.telemetry?.battery_voltage ?? 0;
  const batPct = socket.telemetry?.battery_remaining ?? 0;

  const lastAlarmRef = useRef(0);
  useEffect(() => {
    if (!alarmOn || depth <= 1.8) return;
    const t = Date.now(); if (t - lastAlarmRef.current < 5000) return; lastAlarmRef.current = t;
    try { const Ctx = window.AudioContext ?? (window as any).webkitAudioContext; if (Ctx) { const ctx = new Ctx(); const osc = ctx.createOscillator(); const g = ctx.createGain(); osc.type = "sawtooth"; osc.frequency.setValueAtTime(880, ctx.currentTime); g.gain.setValueAtTime(0.05, ctx.currentTime); osc.connect(g); g.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.35); } } catch { }
    if ("speechSynthesis" in window) { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance("Warning. Critical Depth Threshold Reached."); u.lang = "en-US"; u.rate = 1.15; window.speechSynthesis.speak(u); }
  }, [depth, alarmOn]);

  const toggleArm = () => socket.telemetry?.armed ? socket.sendDisarm() : socket.sendArm();
  const toggleMode = () => socket.sendSetMode(socket.telemetry?.mode === "DEPTH_HOLD" ? "MANUAL" : "DEPTH_HOLD");
  const toggleLight = () => { const n = !lightState; setLightState(n); lightRef.current = n; socket.sendLight(n); };
  const toggleGrip = () => { const n = !gripperState; setGripperState(n); gripperRef.current = n; socket.sendGripper(n ? "open" : "close"); };

  const handleSaveMapping = useCallback((axis: GPMapping, btn: ButtonMapping) => { setAxisMap(axis); setBtnMap(btn); }, []);

  const gpConn = gpName !== null;
  const pct = (v: number) => ((v - 1100) / 800) * 100;
  const active = (v: number) => v !== 1500;

  const assignedBtnCount = Object.values(btnMap).filter(a => a !== "none").length;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-background text-foreground select-none overflow-y-auto lg:overflow-hidden">

      {showMapping && (
        <MappingModal gpIdx={gpIdxRef.current} axisMapping={axisMap} btnMapping={btnMap} onSave={handleSaveMapping} onClose={() => setShowMapping(false)} />
      )}

      {/* Header */}
      <header className="h-12 shrink-0 border-b border-panel-border px-4 flex items-center justify-between bg-[color:var(--color-sidebar)] gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="label-caps">Team</span><span className="font-mono font-semibold">Ocean Explorer</span>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="label-caps">University</span><span>Politeknik Negeri Banyuwangi</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDebug(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold border cursor-pointer transition-colors ${showDebug ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" : "bg-panel border-panel-border text-muted-foreground hover:text-foreground"}`}>
            <Bug size={10} /> DEBUG
          </button>
          <div className="text-right">
            <div className="font-mono text-xs leading-none">{clk.toLocaleTimeString("en-GB", { hour12: false })}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{clk.toLocaleDateString("en-GB", { weekday: "long" })}, {clk.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</div>
          </div>
        </div>
      </header>

      {showDebug && (
        <div className="shrink-0 border-b border-yellow-500/30 bg-yellow-500/5 px-4 py-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px] font-mono">
            {[
              { l: "SOCKET", v: socket.connected ? "✓ CONNECTED" : "✗ DISCONNECTED", ok: socket.connected },
              { l: "MAVLINK", v: socket.mavlinkConnected ? "✓ MAV_OK" : "✗ NO_LINK", ok: socket.mavlinkConnected },
              { l: "ARMED", v: socket.telemetry?.armed ? "✓ ARMED" : "✗ DISARMED", ok: !!socket.telemetry?.armed },
              { l: "PACKETS", v: `${emitCount} sent`, ok: emitCount > 0 },
              { l: "GAMEPAD", v: gpConn ? `✓ idx=${gpIdxRef.current}` : "✗ NONE", ok: gpConn },
              { l: "RAW PWM", v: `${channels[1]}/${channels[2]}/${channels[3]}/${channels[4]}`, ok: true },
              { l: "BTN MAP", v: `${assignedBtnCount} buttons assigned`, ok: assignedBtnCount > 0 },
              { l: "LATENCY", v: socket.latencyMs ? `${socket.latencyMs}ms` : "N/A", ok: !!socket.latencyMs },
            ].map(r => (
              <div key={r.l}>
                <div className="text-yellow-400 font-bold mb-1">{r.l}</div>
                <div className={r.ok ? "text-emerald-400" : "text-red-400"}>{r.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3-column */}
      <div className="flex-1 min-h-0 p-2.5 flex flex-col lg:flex-row gap-2.5 overflow-y-auto lg:overflow-hidden">

        {/* Col 1: Attitude */}
        <div className="panel flex flex-col flex-1 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="border-b border-panel-border/60 pb-2 shrink-0 flex items-center justify-between">
            <span className="label-caps font-bold">Attitude Flight Instrument</span>
            <span className="text-[9px] font-mono text-cyan-400 font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30">AHRS HUD</span>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2.5 py-2.5 min-h-0">
            <div className="flex flex-col gap-1.5 min-h-0">
              <span className="text-[9px] text-cyan-300 font-semibold uppercase tracking-wide">Attitude Indicator</span>
              <div className="flex-1 min-h-[140px] bg-gradient-to-b from-[oklch(0.13_0.028_250)] to-[oklch(0.10_0.02_250)] rounded-xl border border-cyan-500/30 overflow-hidden grid place-items-center relative shadow-[inset_0_0_20px_rgba(6,182,212,0.08)]">
                <img src={rovImage} alt="ROV" className="w-full h-full object-contain p-3 drop-shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                  style={{ transform: `rotate(${roll}deg) scale(${Math.max(0.65, 1 - Math.abs(pitch) / 180)})`, transition: "transform 0.1s ease-out" }} />
                <div className="absolute bottom-2 left-2 text-[10px] font-mono font-bold text-cyan-300 bg-slate-950/80 px-2 py-0.5 rounded-md border border-cyan-500/30 backdrop-blur-md">
                  R: {roll.toFixed(1)}° P: {pitch.toFixed(1)}°
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 min-h-0">
              <span className="text-[9px] text-cyan-300 font-semibold uppercase tracking-wide">Compass (Yaw)</span>
              <div className="flex-1 min-h-[140px] bg-gradient-to-b from-[oklch(0.13_0.028_250)] to-[oklch(0.10_0.02_250)] rounded-xl border border-cyan-500/30 overflow-hidden grid place-items-center relative shadow-[inset_0_0_20px_rgba(6,182,212,0.08)]">
                <svg viewBox="0 0 100 100" className="w-full h-full p-2.5">
                  <g transform={`rotate(${yaw},50,50)`} style={{ transition: "transform 0.1s ease-out" }}>
                    <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="1.5" />
                    <polygon points="50,15 45,25 55,25" fill="#06b6d4" className="drop-shadow-[0_0_8px_rgba(6,182,212,0.9)]" />
                    <text x="50" y="35" fontSize="8" fill="#06b6d4" textAnchor="middle" fontFamily="monospace" fontWeight="extrabold">N</text>
                    <line x1="50" y1="25" x2="50" y2="75" stroke="rgba(6, 182, 212, 0.3)" strokeWidth="1" strokeDasharray="2 2" />
                    <line x1="25" y1="50" x2="75" y2="50" stroke="rgba(6, 182, 212, 0.3)" strokeWidth="1" strokeDasharray="2 2" />
                  </g>
                  <circle cx="50" cy="50" r="3" fill="#06b6d4" />
                </svg>
                <div className="absolute bottom-2 right-2 text-[10px] font-mono font-bold text-cyan-300 bg-slate-950/80 px-2 py-0.5 rounded-md border border-cyan-500/30 backdrop-blur-md">
                  HDG: {yaw.toFixed(1)}°
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-panel-border/40 pt-2 shrink-0">
            <div className="text-[10px] text-cyan-400/90 font-mono font-semibold text-center flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Internal Gyroscopic AHRS Calibration: OK
            </div>
          </div>
        </div>

        {/* Col 2: Switchboard */}
        <div className="panel flex flex-col flex-1 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="border-b border-panel-border/60 pb-2 shrink-0"><span className="label-caps">Pilot Switchboard</span></div>
          <div className="flex-1 flex flex-col gap-2 py-3 overflow-y-auto">
            {[
              { label: socket.telemetry?.armed ? "THRUSTERS ARMED — CLICK TO DISARM" : "ARM VESSEL MOTORS", fn: toggleArm, active: socket.telemetry?.armed, color: "red", icon: <Power size={16} /> },
              { label: socket.telemetry?.mode === "DEPTH_HOLD" ? "STABILIZER: DEPTH HOLD" : "SET DEPTH HOLD MODE", fn: () => socket.sendSetMode("DEPTH_HOLD"), active: socket.telemetry?.mode === "DEPTH_HOLD", color: "accent", icon: <ToggleLeft size={16} /> },
              { label: socket.telemetry?.mode === "STABILIZE" ? "STABILIZER: STABILIZE ACTIVE" : "SET STABILIZE MODE", fn: () => socket.sendSetMode("STABILIZE"), active: socket.telemetry?.mode === "STABILIZE", color: "blue", icon: <Activity size={16} /> },
              { label: lightState ? "LED FLOODLIGHT: ON" : "LED FLOODLIGHT: OFF", fn: toggleLight, active: lightState, color: "yellow", icon: <Play size={16} /> },
              { label: gripperState ? "VESSEL GRIPPER: OPEN" : "VESSEL GRIPPER: CLOSE", fn: toggleGrip, active: gripperState, color: "green", icon: <RotateCcw size={16} /> },
              { label: socket.autonomousStatus?.is_active ? "AUTONOMOUS MISSION: RUNNING" : "START AUTONOMOUS MISSION", fn: () => socket.autonomousStatus?.is_active ? socket.sendAutonomousStop() : socket.sendAutonomousStart("AUTONOMOUS_MISSION"), active: !!socket.autonomousStatus?.is_active, color: "emerald", icon: <Radio size={16} /> },
              { label: "LOCK TARGET: DOCK STATION ALPHA", fn: () => socket.sendAutonomousStart("DOCK_STATION_ALPHA"), active: socket.dockAligned, color: "purple", icon: <Crosshair size={16} /> },
            ].map((btn, i) => (
              <button key={i} onClick={btn.fn}
                className={`flex items-center justify-center gap-2.5 py-2.5 rounded-lg border font-bold text-xs cursor-pointer transition-colors shrink-0 ${btn.active
                  ? btn.color === "accent" ? "bg-accent/20 text-accent border-accent/30"
                    : btn.color === "blue" ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      : btn.color === "yellow" ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"
                        : btn.color === "green" ? "bg-green-500/20 text-green-500 border-green-500/30"
                          : btn.color === "emerald" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse"
                            : btn.color === "purple" ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                              : "bg-red-500/20 text-red-400 border-red-500/30"
                  : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"
                  }`}>
                {btn.icon}<span>{btn.label}</span>
              </button>
            ))}

            {/* Pilot Input Panel */}
            <div className="bg-[oklch(0.12_0.024_250)] rounded-xl border border-panel-border/60 p-3 shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Pilot Input</span>
                <div className="flex items-center gap-1">
                  <Link to="/gamepad-test"
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border transition-all cursor-pointer bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                    title="Buka Diagnostic Tester Gamepad">
                    <Gamepad2 size={10} /> TESTER
                  </Link>
                  <button onClick={() => setShowMapping(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border transition-all cursor-pointer bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20">
                    <Settings size={10} /> MAPPING {assignedBtnCount > 0 && <span className="bg-violet-500/30 rounded-full px-1">{assignedBtnCount}</span>}
                  </button>
                  <button onClick={() => setKbEnabled(v => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border transition-all cursor-pointer ${kbEnabled ? "bg-accent/20 text-accent border-accent/40" : "bg-panel/50 border-panel-border/50 text-muted-foreground hover:text-foreground"}`}>
                    <Keyboard size={10} /> KB
                  </button>
                  <button onClick={() => setGpEnabled(v => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border transition-all cursor-pointer ${gpEnabled ? "bg-green-500/20 text-green-400 border-green-500/40" : "bg-panel/50 border-panel-border/50 text-muted-foreground"}`}>
                    <Gamepad2 size={10} /> {gpEnabled ? "GP ON" : "GP OFF"}
                  </button>
                </div>
              </div>

              <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono font-bold ${gpConn ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : kbEnabled ? "bg-accent/10 border-accent/30 text-accent" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${gpConn ? "bg-emerald-400 animate-pulse" : kbEnabled ? "bg-accent" : "bg-red-500"}`} />
                <span className="truncate">{gpConn ? `GAMEPAD: ${gpName}` : kbEnabled ? "KEYBOARD (WASD + Arrows)" : "NO INPUT — Connect gamepad or enable KB"}</span>
              </div>

              {/* Button mapping badges (compact live view) */}
              {gpConn && assignedBtnCount > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(btnMap).filter(([, a]) => a !== "none").map(([idx, action]) => {
                    const ps2 = PS2_BUTTONS[Number(idx)];
                    return (
                      <div key={idx} className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-panel border border-panel-border/50 text-[8px] font-mono">
                        <span className={ps2?.color ?? ""}>{ps2?.sym ?? `B${idx}`}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className={ACTION_META[action as ROVAction]?.color ?? ""}>{action.replace(/_/g, " ")}</span>
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

              <div className="grid grid-cols-2 gap-1.5">
                {([{ label: "CH1 Lateral", v: channels[1] }, { label: "CH2 Forward", v: channels[2] }, { label: "CH3 Throttle", v: channels[3] }, { label: "CH4 Yaw", v: channels[4] }] as const).map(ch => (
                  <div key={ch.label} className={`p-1.5 rounded-lg border transition-colors ${active(ch.v) ? "bg-emerald-500/5 border-emerald-500/20" : "bg-black/10 border-panel-border/20"}`}>
                    <div className="flex justify-between items-center mb-1 text-[8px] font-mono">
                      <span className="text-muted-foreground">{ch.label}</span>
                      <span className={`font-bold tabular-nums ${active(ch.v) ? "text-emerald-400" : "text-muted-foreground"}`}>{ch.v}</span>
                    </div>
                    <div className="h-1.5 w-full bg-panel-border/30 rounded-full overflow-hidden relative">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/25 z-10" />
                      <div className={`h-full rounded-full transition-all duration-75 ${active(ch.v) ? "bg-gradient-to-r from-emerald-500 to-cyan-400" : "bg-panel-border/60"}`} style={{ width: `${pct(ch.v)}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-[8px] font-mono text-muted-foreground">
                <span>Packets: <span className={socket.connected ? "text-emerald-400 font-bold" : "text-red-400"}>{emitCount}</span></span>
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
            <div className="border-b border-panel-border/60 pb-2 shrink-0"><span className="label-caps">Vessel Diagnostics</span></div>
            <div className="space-y-2 text-xs">
              {[{ label: "Vessel Depth", val: `${depth.toFixed(2)} m` }, { label: "Power Voltage", val: `${volt.toFixed(1)} V` }, { label: "Battery Capacity", val: `${batPct}%` }].map(r => (
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
                <div className="flex items-center gap-2"><ShieldAlert className="text-red-500" size={15} /><span className="text-[11px] text-foreground font-semibold uppercase tracking-wide">Audio Depth Alarm</span></div>
                <button onClick={() => setAlarmOn(v => !v)} className={`p-1.5 rounded-md border transition-colors cursor-pointer ${alarmOn ? "bg-red-500/20 text-red-400 border-red-500/40" : "bg-panel border-panel-border text-muted-foreground"}`}>
                  {alarmOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
                </button>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed">Triggers if depth exceeds <strong className="text-accent font-bold">1.8 meters</strong>.</div>
              {depth > 1.8 && alarmOn && (
                <div className="bg-red-500/10 border border-red-500/40 text-red-400 rounded-md p-2 text-center text-[10px] font-bold font-mono animate-pulse uppercase tracking-wider">⚠ ALARM ACTIVE: DANGER DEPTH</div>
              )}
            </div>
          </div>

          <div className="border-t border-panel-border/40 pt-2 shrink-0 font-mono text-[11px] text-muted-foreground flex justify-between">
            <span>Safety System:</span>
            <span className={socket.connected ? "text-[color:var(--color-success)]" : "text-red-500"}>{socket.connected ? "DIAG_ACTIVE" : "COM_ERROR"}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="h-10 shrink-0 border-t border-panel-border px-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5"><span className="label-caps">Mode</span><span className="font-mono text-accent font-bold">{socket.telemetry?.mode ?? "MANUAL"}</span></div>
          <div className="h-3.5 w-px bg-panel-border/60" />
          <div className="flex items-center gap-1.5"><span className="label-caps">Hardware Stabilizers</span><span className="font-mono font-bold text-[color:var(--color-success)]">ACTIVE</span></div>
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">Fail-Safe: MAV_AUTO_LAND</div>
      </footer>
    </div>
  );
}
