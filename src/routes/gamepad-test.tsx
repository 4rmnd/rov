import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  Gamepad2, Settings, ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, Activity, ShieldCheck, Terminal
} from "lucide-react";

export const Route = createFileRoute("/gamepad-test")({
  head: () => ({
    meta: [
      { title: "Gamepad Diagnostic & Mapping Tester — ROV Dashboard" },
      { name: "description", content: "Interactive raw Gamepad API diagnostic and testing tool for PS2 USB adapters." },
    ],
  }),
  component: GamepadTestPage,
});

interface LogEntry {
  id: number;
  time: string;
  type: "button_down" | "button_up" | "axis_move";
  index: number;
  detail: string;
}

const PS2_LABELS: Record<number, string> = {
  0: "Triangle △ (or Cross ×)",
  1: "Circle ○",
  2: "Cross × (or Square □)",
  3: "Square □ (or Triangle △)",
  4: "L2 (or L1)",
  5: "R2 (or R1)",
  6: "L1 (or L2)",
  7: "R1 (or R2)",
  8: "Select",
  9: "Start",
  10: "L3 (Left Stick Click)",
  11: "R3 (Right Stick Click)",
  12: "D-pad ↑ (Up)",
  13: "D-pad ↓ (Down)",
  14: "D-pad ← (Left)",
  15: "D-pad → (Right)",
};

function GamepadTestPage() {
  const [gpInfo,       setGpInfo]       = useState<{ id: string; index: number; mapping: string; buttonsCount: number; axesCount: number } | null>(null);
  const [liveButtons,  setLiveButtons]  = useState<{ index: number; pressed: boolean; value: number }[]>([]);
  const [liveAxes,     setLiveAxes]     = useState<{ index: number; value: number }[]>([]);
  const [logs,         setLogs]         = useState<LogEntry[]>([]);
  const [lastActiveBtn,setLastActiveBtn]= useState<number | null>(null);
  const [lastActiveAxis,setLastActiveAxis]= useState<number | null>(null);

  const prevBtnsRef = useRef<boolean[]>([]);
  const logIdRef    = useRef(0);

  // Poll Gamepad API every 16ms (60fps) for instant, low-latency diagnostic feedback
  useEffect(() => {
    const interval = setInterval(() => {
      const pads = navigator.getGamepads?.() ?? [];
      let activeGp: Gamepad | null = null;

      for (let i = 0; i < pads.length; i++) {
        if (pads[i]) { activeGp = pads[i]; break; }
      }

      if (!activeGp) {
        setGpInfo(null);
        setLiveButtons([]);
        setLiveAxes([]);
        return;
      }

      setGpInfo({
        id: activeGp.id,
        index: activeGp.index,
        mapping: activeGp.mapping || "custom/none",
        buttonsCount: activeGp.buttons.length,
        axesCount: activeGp.axes.length,
      });

      const btnsData = Array.from(activeGp.buttons).map((b, idx) => ({
        index: idx,
        pressed: b.pressed || (typeof b === "object" && b.value > 0.4),
        value: typeof b === "number" ? b : b.value,
      }));
      setLiveButtons(btnsData);

      const axesData = Array.from(activeGp.axes).map((val, idx) => ({
        index: idx,
        value: val,
      }));
      setLiveAxes(axesData);

      // Event Logging for Buttons
      const currPressed = btnsData.map(b => b.pressed);
      const prevPressed = prevBtnsRef.current;
      const now = new Date().toLocaleTimeString("en-GB", { hour12: false }) + "." + String(Date.now() % 1000).padStart(3, "0");

      currPressed.forEach((isPressed, idx) => {
        const wasPressed = prevPressed[idx] ?? false;
        if (isPressed && !wasPressed) {
          // Button Down
          setLastActiveBtn(idx);
          const label = PS2_LABELS[idx] ?? `Button ${idx}`;
          logIdRef.current += 1;
          const entry: LogEntry = {
            id: logIdRef.current,
            time: now,
            type: "button_down",
            index: idx,
            detail: `[DOWN] Button ${idx} (${label}) pressed`,
          };
          setLogs(prev => [entry, ...prev.slice(0, 49)]);
        } else if (!isPressed && wasPressed) {
          // Button Up
          const label = PS2_LABELS[idx] ?? `Button ${idx}`;
          logIdRef.current += 1;
          const entry: LogEntry = {
            id: logIdRef.current,
            time: now,
            type: "button_up",
            index: idx,
            detail: `[UP] Button ${idx} (${label}) released`,
          };
          setLogs(prev => [entry, ...prev.slice(0, 49)]);
        }
      });
      prevBtnsRef.current = currPressed;

      // Active Axis tracking
      axesData.forEach(a => {
        if (Math.abs(a.value) > 0.25) {
          setLastActiveAxis(a.index);
        }
      });

    }, 16);

    return () => clearInterval(interval);
  }, []);

  const clearLogs = () => setLogs([]);

  return (
    <div className="min-h-screen bg-[oklch(0.10_0.024_250)] text-foreground flex flex-col p-4 md:p-6 select-none font-sans">
      
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-panel-border/60 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <Link to="/control" className="p-2 rounded-xl bg-panel border border-panel-border hover:bg-panel/80 hover:border-accent text-muted-foreground hover:text-foreground transition-all cursor-pointer">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Gamepad2 className="text-accent" size={22} />
              <h1 className="text-lg font-bold tracking-tight text-foreground">Gamepad Diagnostic & Raw Input Tester</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Uji coba semua tombol fisik PS2, D-Pad, dan Analog Stick secara real-time</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/control" className="px-3 py-1.5 rounded-lg bg-accent text-white font-bold text-xs hover:opacity-90 transition-opacity">
            Kembali ke Pilot Controls
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">

        {/* Left Column: Gamepad Info & Buttons Grid */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">

          {/* Connection Status Banner */}
          <div className={`p-4 rounded-2xl border transition-all ${
            gpInfo
              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
              : "bg-amber-500/10 border-amber-500/30 text-amber-300"
          }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {gpInfo ? (
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 grid place-items-center shrink-0">
                    <CheckCircle2 className="text-emerald-400" size={20} />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 grid place-items-center shrink-0 animate-pulse">
                    <AlertTriangle className="text-amber-400" size={20} />
                  </div>
                )}
                <div>
                  <div className="font-bold text-sm">
                    {gpInfo ? `✓ JOYSTICK TERHUBUNG: ${gpInfo.id}` : "⚠ JOYSTICK BELUM TERDETEKSI BROWSER"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {gpInfo
                      ? `Index: ${gpInfo.index} | Mode: ${gpInfo.mapping} | Total Buttons: ${gpInfo.buttonsCount} | Total Axes: ${gpInfo.axesCount}`
                      : "Colok USB Adapter PS2 dan TEKAN SEMBARANG TOMBOL pada controller untuk mengaktifkannya di browser."}
                  </div>
                </div>
              </div>

              {lastActiveBtn !== null && (
                <div className="bg-emerald-500/20 border border-emerald-400/50 rounded-xl px-3 py-1.5 text-right font-mono text-xs font-bold text-emerald-300 animate-pulse">
                  LAST BUTTON: #{lastActiveBtn} ({PS2_LABELS[lastActiveBtn] ?? `Btn ${lastActiveBtn}`})
                </div>
              )}
            </div>
          </div>

          {/* BUTTONS DIAGNOSTIC GRID (0 to Max) */}
          <div className="bg-[oklch(0.13_0.028_250)] rounded-2xl border border-panel-border p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-panel-border/50 pb-3">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-accent" />
                <span className="font-bold text-sm text-foreground">Raw Buttons State (0 — {Math.max(19, liveButtons.length - 1)})</span>
              </div>
              <span className="text-xs text-muted-foreground">Tekan tombol di joystick untuk melihat perubahan visual real-time</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {Array.from({ length: Math.max(20, liveButtons.length) }, (_, idx) => {
                const btn = liveButtons[idx];
                const pressed = btn?.pressed ?? false;
                const val = btn?.value ?? 0;
                const label = PS2_LABELS[idx] ?? `Button ${idx}`;
                const isLast = lastActiveBtn === idx;

                return (
                  <div key={idx} className={`p-3 rounded-xl border transition-all duration-75 flex items-center gap-3 ${
                    pressed
                      ? "border-emerald-400 bg-emerald-500/25 ring-2 ring-emerald-400/80 shadow-[0_0_20px_rgba(16,185,129,0.4)] scale-[1.02]"
                      : isLast
                        ? "border-accent/40 bg-accent/10"
                        : "border-panel-border/50 bg-[oklch(0.16_0.02_250)]"
                  }`}>
                    {/* Index Badge */}
                    <div className={`w-10 h-10 rounded-lg border flex items-center justify-center font-mono font-bold text-sm shrink-0 transition-all ${
                      pressed
                        ? "bg-emerald-400 text-slate-950 border-emerald-200 font-extrabold scale-110 shadow-md"
                        : "bg-panel border-panel-border text-foreground"
                    }`}>
                      {idx}
                    </div>

                    {/* Label & Value */}
                    <div className="min-w-0 flex-1">
                      <div className={`font-semibold text-xs truncate ${pressed ? "text-emerald-300 font-bold" : "text-foreground"}`}>
                        {label}
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mt-1">
                        <span>Val: {val.toFixed(2)}</span>
                        <span className={pressed ? "text-emerald-400 font-bold animate-pulse" : ""}>
                          {pressed ? "● PRESSED" : "OFF"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AXES DIAGNOSTIC GRID (0 to Max) */}
          <div className="bg-[oklch(0.13_0.028_250)] rounded-2xl border border-panel-border p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-panel-border/50 pb-3">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-cyan-400" />
                <span className="font-bold text-sm text-foreground">Raw Axes &amp; Analog Sticks (0 — {Math.max(7, liveAxes.length - 1)})</span>
              </div>
              <span className="text-xs text-muted-foreground">Gerakkan stick kiri/kanan &amp; D-Pad jika dikirim via Axis</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: Math.max(8, liveAxes.length) }, (_, idx) => {
                const axis = liveAxes[idx];
                const val = axis?.value ?? 0;
                const isMoved = Math.abs(val) > 0.15;
                const pct = ((val + 1) / 2) * 100;

                return (
                  <div key={idx} className={`p-3 rounded-xl border transition-all ${
                    isMoved
                      ? "border-cyan-400 bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.3)] ring-1 ring-cyan-400"
                      : "border-panel-border/50 bg-[oklch(0.16_0.02_250)]"
                  }`}>
                    <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                      <span className={isMoved ? "text-cyan-300 font-bold" : "text-muted-foreground"}>
                        Axis #{idx} {isMoved ? "● MOVING" : ""}
                      </span>
                      <span className={`font-bold ${isMoved ? "text-cyan-300" : "text-foreground"}`}>
                        {val.toFixed(4)}
                      </span>
                    </div>

                    {/* Axis Progress Bar (-1.0 to +1.0 with zero center line) */}
                    <div className="h-2 w-full bg-panel-border/40 rounded-full overflow-hidden relative">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/40 z-10" />
                      <div
                        className={`h-full transition-all duration-75 rounded-full ${
                          isMoved ? "bg-gradient-to-r from-cyan-500 to-emerald-400" : "bg-panel-border/60"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Column: Real-time Event Logger & Quick Guide */}
        <div className="w-full lg:w-96 flex flex-col gap-6 shrink-0">

          {/* Quick Guide Box */}
          <div className="bg-[oklch(0.13_0.028_250)] rounded-2xl border border-panel-border p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-panel-border/50 pb-2">
              <ShieldCheck className="text-emerald-400" size={16} />
              <span className="font-bold text-xs uppercase tracking-wider text-foreground">Panduan Diagnosa Controller</span>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
              <p>1. Tekan tombol pada joystick PS2 satu per satu dan perhatikan nomor <strong>Button #</strong> yang menyala hijau.</p>
              <p>2. Jika <strong>D-Pad Arrow</strong> menyala pada Button 12/13/14/15, berarti D-Pad terdeteksi sebagai <em>Buttons</em>.</p>
              <p>3. Jika <strong>D-Pad Arrow</strong> menggerakkan bar di bagian <em>Raw Axes</em> (misal Axis 4/5), berarti D-Pad terdeteksi sebagai <em>Axis / Pov Hat</em>.</p>
              <p>4. Setelah tahu nomor tepatnya, kita bisa memasangnya langsung di Halaman Dashboard Pilot Control!</p>
            </div>
          </div>

          {/* Real-time Event Logger */}
          <div className="bg-[oklch(0.13_0.028_250)] rounded-2xl border border-panel-border p-5 flex flex-col flex-1 min-h-[350px]">
            <div className="flex items-center justify-between border-b border-panel-border/50 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-emerald-400" />
                <span className="font-bold text-xs uppercase tracking-wider text-foreground">Real-time Input Log</span>
              </div>
              <button
                onClick={clearLogs}
                className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground p-1 rounded hover:bg-panel transition-colors cursor-pointer">
                <RefreshCw size={10} /> Clear Log
              </button>
            </div>

            {/* Log Stream */}
            <div className="flex-1 overflow-y-auto font-mono text-[11px] space-y-1.5 pr-1">
              {logs.length === 0 ? (
                <div className="text-muted-foreground text-center py-10 text-xs italic">
                  Belum ada event input. Tekan tombol pada joystick untuk melihat log...
                </div>
              ) : (
                logs.map(log => (
                  <div
                    key={log.id}
                    className={`p-2 rounded-lg border text-[10px] leading-tight ${
                      log.type === "button_down"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-black/20 border-panel-border/30 text-muted-foreground"
                    }`}>
                    <span className="text-muted-foreground font-semibold">[{log.time}]</span> {log.detail}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
