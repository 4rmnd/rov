import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Power, ToggleLeft, Play, RotateCcw, Volume2, VolumeX, ShieldAlert, Cpu } from "lucide-react";
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

function PilotControlsPage() {
  const now = useClock();
  const dayName = now.toLocaleDateString("en-GB", { weekday: "long" });
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { hour12: false });

  const socket = useROVSocket();

  const roll = socket.trajectory?.orientation?.roll ?? 0;
  const pitch = socket.trajectory?.orientation?.pitch ?? 0;
  const yaw = socket.trajectory?.orientation?.yaw ?? 0;

  const depthVal = socket.telemetry?.depth ?? 0;
  const batteryVoltage = socket.telemetry?.battery_voltage ?? 0;
  const batteryRemaining = socket.telemetry?.battery_remaining ?? 0;

  // Audio Alarm Logic (kedalaman berbahaya)
  const [audioAlarmEnabled, setAudioAlarmEnabled] = useState(true);
  const lastAlarmTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!audioAlarmEnabled) return;
    
    // Critical depth alarm threshold: 1.8 meters
    if (depthVal > 1.8) {
      const currentTime = Date.now();
      if (currentTime - lastAlarmTimeRef.current > 5000) { // Limit vocal repeat to 5s
        lastAlarmTimeRef.current = currentTime;

        // Play Beep Tone
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(880, ctx.currentTime); // High alarm pitch
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
          }
        } catch (e) {
          console.error("Audio Context playback failed:", e);
        }

        // Voice Warning
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance("Warning. Critical Depth Threshold Reached.");
          utterance.lang = "en-US";
          utterance.rate = 1.15;
          window.speechSynthesis.speak(utterance);
        }
      }
    }
  }, [depthVal, audioAlarmEnabled]);

  // Quick Control actions
  const [lightState, setLightState] = useState(false);
  const [gripperState, setGripperState] = useState(false);

  const handleToggleArm = () => {
    if (socket.telemetry?.armed) {
      socket.sendDisarm();
    } else {
      socket.sendArm();
    }
  };

  const handleToggleMode = () => {
    const currentMode = socket.telemetry?.mode ?? "MANUAL";
    if (currentMode === "DEPTH_HOLD") {
      socket.sendSetMode("MANUAL");
    } else {
      socket.sendSetMode("DEPTH_HOLD");
    }
  };

  const handleToggleLight = () => {
    const nextState = !lightState;
    setLightState(nextState);
    socket.sendLight(nextState);
  };

  const handleToggleGripper = () => {
    const nextState = !gripperState;
    setGripperState(nextState);
    socket.sendGripper(nextState ? "open" : "close");
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-background text-foreground select-none overflow-y-auto lg:overflow-hidden">
      {/* Top Information Bar */}
      <header className="h-13 shrink-0 border-b border-panel-border px-6 flex items-center justify-between bg-[color:var(--color-sidebar)] text-xs font-semibold tracking-wider uppercase backdrop-blur-md bg-opacity-80">
        <div className="flex items-center gap-2 text-accent">
          <span className="text-muted-foreground font-medium">Team:</span>
          <span>Ocean Explorer</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-medium">University:</span>
          <span className="text-foreground">Politeknik Negeri Banyuwangi</span>
        </div>
        <div className="flex items-center gap-2 text-right font-mono">
          <span className="text-muted-foreground font-medium">{dayName},</span>
          <span className="text-accent">{dateStr}</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-foreground font-bold">{timeStr}</span>
        </div>
      </header>

      {/* Spacious 3-Column Split Layout */}
      <div className="flex-1 min-h-0 p-4 flex flex-col lg:flex-row gap-4 overflow-y-auto lg:overflow-hidden">
        
        {/* Col 1: Cockpit Attitude Horizon & Heading */}
        <div className="panel flex flex-col flex-1 min-h-[460px] lg:h-full p-5 bg-gradient-to-b from-card/60 to-card/10 border border-panel-border/80 rounded-lg shadow-xl justify-between">
          <div className="border-b border-panel-border/60 pb-3 shrink-0">
            <span className="label-caps">Attitude Flight Instrument</span>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 py-4 min-h-0">
            {/* Attitude Horizon HUD */}
            <div className="flex flex-col min-h-0">
              <span className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mb-2">
                Artificial Horizon (HUD)
              </span>
              <div className="flex-1 min-h-[160px] bg-[oklch(0.12_0.02_245)] rounded-lg border border-panel-border/80 grid place-items-center relative overflow-hidden group shadow-inner">
                {/* HUD markings */}
                <div className="absolute inset-0 pointer-events-none z-10">
                  <div className="absolute top-1/2 left-2 right-2 h-px bg-green-500/30" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center">
                    <div className="absolute w-7 h-7 rounded-full border border-green-500/25 pointer-events-none" />
                    <div className="w-12 h-px bg-green-500/50" />
                    <div className="h-6 w-px bg-green-500/40 absolute -top-3" />
                  </div>
                </div>

                <img
                  src={rovImage}
                  alt="ROV Visual Model"
                  className="w-full h-full object-contain p-4 transition-transform duration-100 relative z-20"
                  style={{
                    transform: `rotate(${roll}deg) scale(${Math.max(0.65, 1 - Math.abs(pitch) / 180)})`,
                  }}
                />
                
                <div className="absolute bottom-2 left-3 font-mono text-[9px] text-accent/80 bg-black/70 px-2 py-0.5 border border-panel-border rounded z-30">
                  R: {roll.toFixed(1)}° | P: {pitch.toFixed(1)}°
                </div>
              </div>
            </div>

            {/* Compass Heading visual ring */}
            <div className="flex flex-col min-h-0">
              <span className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mb-2">
                Compass Rose (Yaw)
              </span>
              <div className="flex-1 min-h-[160px] bg-[oklch(0.12_0.02_245)] rounded-lg border border-panel-border/80 grid place-items-center relative overflow-hidden shadow-inner">
                <svg viewBox="0 0 100 100" className="w-full h-full p-2.5">
                  <g transform={`rotate(${yaw}, 50, 50)`} className="transition-transform duration-100">
                    <circle cx="50" cy="50" r="34" fill="none" stroke="var(--color-panel-border)" strokeWidth="2" />
                    {/* Compass Ticks */}
                    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => {
                      const rad = (deg * Math.PI) / 180;
                      const x1 = 50 + 30 * Math.sin(rad);
                      const y1 = 50 - 30 * Math.cos(rad);
                      const x2 = 50 + 34 * Math.sin(rad);
                      const y2 = 50 - 34 * Math.cos(rad);
                      return (
                        <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-muted-foreground)" strokeWidth="1" />
                      );
                    })}
                    <polygon points="50,12 46,22 54,22" fill="var(--color-accent)" />
                    <text
                      x="50"
                      y="31"
                      fontSize="9.5"
                      fill="var(--color-accent)"
                      textAnchor="middle"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      N
                    </text>
                    <text
                      x="50"
                      y="77"
                      fontSize="8"
                      fill="var(--color-muted-foreground)"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      S
                    </text>
                  </g>
                  <circle cx="50" cy="50" r="4.5" fill="#fff" stroke="var(--color-panel-border)" strokeWidth="1.5" />
                </svg>
                <div className="absolute bottom-2 right-3 font-mono text-[9px] text-accent/80 bg-black/70 px-2 py-0.5 border border-panel-border rounded z-30">
                  HDG: {yaw.toFixed(1)}°
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-panel-border/40 pt-3 shrink-0">
            <div className="text-[10px] text-muted-foreground uppercase font-bold text-center">
              Internal Gyroscopic AHRS Calibration: OK
            </div>
          </div>
        </div>

        {/* Col 2: Action Controls (Glossy tactile buttons) */}
        <div className="panel flex flex-col flex-1 min-h-[460px] lg:h-full p-5 bg-gradient-to-b from-card/60 to-card/10 border border-panel-border/80 rounded-lg shadow-xl justify-between">
          <div className="border-b border-panel-border/60 pb-3 shrink-0">
            <span className="label-caps">Pilot Switchboard</span>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-4 py-6">
            {/* Power Arm button */}
            <button
              onClick={handleToggleArm}
              className={`flex items-center justify-center gap-3 py-4 rounded-lg border font-bold text-sm tracking-wide transition-all shadow-md active:scale-98 hover:cursor-pointer ${
                socket.telemetry?.armed
                  ? "bg-red-500/20 text-red-500 border-red-500/50 hover:bg-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.25)]"
                  : "bg-panel/40 border-panel-border/80 text-muted-foreground hover:text-foreground hover:bg-panel hover:border-panel-border"
              }`}
            >
              <Power size={18} className={socket.telemetry?.armed ? "animate-pulse text-red-500" : ""} />
              <span>{socket.telemetry?.armed ? "THRUSTERS ARMED (ON)" : "ARM VESSEL MOTORS"}</span>
            </button>

            {/* Flight Mode toggle */}
            <button
              onClick={handleToggleMode}
              className={`flex items-center justify-center gap-3 py-4 rounded-lg border font-bold text-sm tracking-wide transition-all shadow-md active:scale-98 hover:cursor-pointer ${
                socket.telemetry?.mode === "DEPTH_HOLD"
                  ? "bg-accent/20 text-accent border-accent/50 hover:bg-accent/30 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                  : "bg-panel/40 border-panel-border/80 text-muted-foreground hover:text-foreground hover:bg-panel hover:border-panel-border"
              }`}
            >
              <ToggleLeft size={18} />
              <span>{socket.telemetry?.mode === "DEPTH_HOLD" ? "STABILIZER: DEPTH HOLD" : "CONTROL: MANUAL MODE"}</span>
            </button>

            {/* Auxiliary toggle: light */}
            <button
              onClick={handleToggleLight}
              className={`flex items-center justify-center gap-3 py-4 rounded-lg border font-bold text-sm tracking-wide transition-all shadow-md active:scale-98 hover:cursor-pointer ${
                lightState
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                  : "bg-panel/40 border-panel-border/80 text-muted-foreground hover:text-foreground hover:bg-panel hover:border-panel-border"
              }`}
            >
              <Play size={18} />
              <span>{lightState ? "BRIGHT LED FLOODLIGHT: ON" : "LED FLOODLIGHT: OFF"}</span>
            </button>

            {/* Auxiliary toggle: gripper */}
            <button
              onClick={handleToggleGripper}
              className={`flex items-center justify-center gap-3 py-4 rounded-lg border font-bold text-sm tracking-wide transition-all shadow-md active:scale-98 hover:cursor-pointer ${
                gripperState
                  ? "bg-green-500/20 text-green-400 border-green-500/50 hover:bg-green-500/30 shadow-[0_0_12px_rgba(34,197,94,0.25)]"
                  : "bg-panel/40 border-panel-border/80 text-muted-foreground hover:text-foreground hover:bg-panel hover:border-panel-border"
              }`}
            >
              <RotateCcw size={18} />
              <span>{gripperState ? "VESSEL CLAW GRIPPER: OPEN" : "VESSEL GRIPPER: CLOSE"}</span>
            </button>
          </div>

          <div className="border-t border-panel-border/40 pt-3 shrink-0 flex items-center justify-between">
            <button
              onClick={socket.sendEmergencyStop}
              className="w-full flex items-center justify-center gap-2 bg-[color:var(--color-danger)] text-white font-bold py-2.5 rounded-lg text-xs tracking-wider hover:opacity-90 hover:cursor-pointer shadow-lg hover:shadow-red-900/30 active:scale-98 transition-all"
            >
              <Power size={13} /> KILL POWER / EMERGENCY STOP
            </button>
          </div>
        </div>

        {/* Col 3: Diagnostics & Audio Alarm (Glossy HUD config) */}
        <div className="panel flex flex-col w-full lg:w-[340px] shrink-0 min-h-[460px] lg:h-full p-5 bg-gradient-to-b from-card/60 to-card/10 border border-panel-border/80 rounded-lg shadow-xl justify-between">
          <div className="flex flex-col gap-4 flex-1">
            <div className="border-b border-panel-border/60 pb-3 shrink-0">
              <span className="label-caps">Vessel Diagnostics</span>
            </div>

            {/* Diagnostic Table */}
            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between border-b border-panel-border/10 pb-2">
                <span className="text-muted-foreground uppercase text-[9px]">Vessel Depth</span>
                <span className="text-accent font-extrabold text-sm">{depthVal.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between border-b border-panel-border/10 pb-2">
                <span className="text-muted-foreground uppercase text-[9px]">Power Voltage</span>
                <span className="text-foreground font-bold">{batteryVoltage.toFixed(1)} V</span>
              </div>
              <div className="flex justify-between border-b border-panel-border/10 pb-2">
                <span className="text-muted-foreground uppercase text-[9px]">Battery Capacity</span>
                <span className="text-foreground font-bold">{batteryRemaining}%</span>
              </div>
              <div className="flex justify-between border-b border-panel-border/10 pb-2">
                <span className="text-muted-foreground uppercase text-[9px]">MAVLink Diagnostics</span>
                <span
                  className={`font-bold flex items-center gap-1.5 ${
                    socket.mavlinkConnected ? "text-[color:var(--color-success)]" : "text-red-500"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${socket.mavlinkConnected ? "bg-[color:var(--color-success)]" : "bg-red-500"} animate-pulse`} />
                  {socket.mavlinkConnected ? "MAV_OK" : "NO_SYS_LINK"}
                </span>
              </div>
            </div>

            {/* Audio Alarm Config panel */}
            <div className="bg-[oklch(0.12_0.02_245)] rounded-lg p-4 border border-panel-border/70 mt-4 flex flex-col gap-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="text-red-500 animate-pulse" size={16} />
                  <span className="text-[10px] text-foreground font-bold uppercase tracking-wider">
                    Audio Depth Alarm
                  </span>
                </div>
                <button
                  onClick={() => setAudioAlarmEnabled(!audioAlarmEnabled)}
                  className={`p-1.5 rounded border transition-colors hover:cursor-pointer ${
                    audioAlarmEnabled
                      ? "bg-red-500/20 text-red-400 border-red-500/40"
                      : "bg-panel/40 border-panel-border text-muted-foreground"
                  }`}
                  title={audioAlarmEnabled ? "Mute Alarm" : "Enable Alarm"}
                >
                  {audioAlarmEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                </button>
              </div>

              <div className="text-[10px] text-muted-foreground/80 leading-relaxed font-sans">
                Triggers acoustic signal oscillator warnings and computer vocal speech warning automatically if subsea depth exceeds{" "}
                <strong className="text-accent font-bold">1.8 meters</strong>.
              </div>

              {depthVal > 1.8 && audioAlarmEnabled && (
                <div className="bg-red-500/10 border border-red-500/40 text-red-400 rounded p-2.5 text-center text-[10px] font-bold font-mono animate-pulse uppercase tracking-wider">
                  ⚠️ ALARM ACTIVE: DANGER DEPTH
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-panel-border/40 pt-3 shrink-0 font-mono text-[9px] text-muted-foreground flex justify-between">
            <span>Safety System:</span>
            <span className={socket.connected ? "text-[color:var(--color-success)]" : "text-red-500"}>
              {socket.connected ? "DIAG_ACTIVE" : "COM_ERROR"}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Status Bar */}
      <footer className="h-11 shrink-0 border-t border-panel-border px-6 py-2 bg-[color:var(--color-sidebar)] flex items-center justify-between text-[11px] backdrop-blur-md bg-opacity-80">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-semibold uppercase">Mode:</span>
            <span className="font-mono text-accent font-bold">{socket.telemetry?.mode ?? "MANUAL"}</span>
          </div>
          <div className="h-4 w-px bg-panel-border/60" />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-semibold uppercase">Hardware Stabilizers:</span>
            <span className="font-mono font-bold text-[color:var(--color-success)]">ACTIVE</span>
          </div>
        </div>

        <div className="font-mono text-[10px] text-muted-foreground">
          Fail-Safe protocol: MAV_AUTO_LAND
        </div>
      </footer>
    </div>
  );
}
