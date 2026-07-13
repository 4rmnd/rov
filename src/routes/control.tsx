import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Power, ToggleLeft, Play, RotateCcw, Volume2, VolumeX, ShieldAlert } from "lucide-react";
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

      {/* 3-Column Split Layout */}
      <div className="flex-1 min-h-0 p-2.5 flex flex-col lg:flex-row gap-2.5 overflow-y-auto lg:overflow-hidden">

        {/* Col 1: Cockpit Attitude Horizon & Heading */}
        <div className="panel flex flex-col flex-1 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="border-b border-panel-border/60 pb-2 shrink-0">
            <span className="label-caps">Attitude Flight Instrument</span>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2.5 py-2.5 min-h-0">
            {/* Attitude Horizon */}
            <div className="flex flex-col gap-1.5 min-h-0">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                Attitude Indicator
              </span>
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

            {/* Compass Heading visual ring */}
            <div className="flex flex-col gap-1.5 min-h-0">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                Compass (Yaw)
              </span>
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

        {/* Col 2: Action Controls */}
        <div className="panel flex flex-col flex-1 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="border-b border-panel-border/60 pb-2 shrink-0">
            <span className="label-caps">Pilot Switchboard</span>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-2.5 py-3">
            {/* Power Arm button */}
            <button
              onClick={handleToggleArm}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors ${
                socket.telemetry?.armed
                  ? "bg-red-500/20 text-red-500 border-red-500/30"
                  : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"
              }`}
            >
              <Power size={16} />
              <span>{socket.telemetry?.armed ? "THRUSTERS ARMED (ON)" : "ARM VESSEL MOTORS"}</span>
            </button>

            {/* Flight Mode toggle */}
            <button
              onClick={handleToggleMode}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors ${
                socket.telemetry?.mode === "DEPTH_HOLD"
                  ? "bg-accent/20 text-accent border-accent/30"
                  : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"
              }`}
            >
              <ToggleLeft size={16} />
              <span>{socket.telemetry?.mode === "DEPTH_HOLD" ? "STABILIZER: DEPTH HOLD" : "CONTROL: MANUAL MODE"}</span>
            </button>

            {/* Auxiliary toggle: light */}
            <button
              onClick={handleToggleLight}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors ${
                lightState
                  ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"
                  : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"
              }`}
            >
              <Play size={16} />
              <span>{lightState ? "LED FLOODLIGHT: ON" : "LED FLOODLIGHT: OFF"}</span>
            </button>

            {/* Auxiliary toggle: gripper */}
            <button
              onClick={handleToggleGripper}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors ${
                gripperState
                  ? "bg-green-500/20 text-green-500 border-green-500/30"
                  : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"
              }`}
            >
              <RotateCcw size={16} />
              <span>{gripperState ? "VESSEL GRIPPER: OPEN" : "VESSEL GRIPPER: CLOSE"}</span>
            </button>
          </div>

          <div className="border-t border-panel-border/40 pt-2.5 shrink-0">
            <button
              onClick={socket.sendEmergencyStop}
              className="w-full flex items-center justify-center gap-2 bg-[color:var(--color-danger)] text-white font-bold py-2 rounded-lg text-xs tracking-wider hover:opacity-90 cursor-pointer transition-opacity"
            >
              <Power size={13} /> KILL POWER / EMERGENCY STOP
            </button>
          </div>
        </div>

        {/* Col 3: Diagnostics & Audio Alarm */}
        <div className="panel flex flex-col w-full lg:w-[280px] shrink-0 min-h-[380px] lg:h-full p-3 justify-between">
          <div className="flex flex-col gap-2.5 flex-1">
            <div className="border-b border-panel-border/60 pb-2 shrink-0">
              <span className="label-caps">Vessel Diagnostics</span>
            </div>

            {/* Diagnostic Table */}
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
                <span
                  className={`font-bold font-mono flex items-center gap-1.5 ${
                    socket.mavlinkConnected ? "text-[color:var(--color-success)]" : "text-red-500"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${socket.mavlinkConnected ? "bg-[color:var(--color-success)]" : "bg-red-500"}`} />
                  {socket.mavlinkConnected ? "MAV_OK" : "NO_SYS_LINK"}
                </span>
              </div>
            </div>

            {/* Audio Alarm Config panel */}
            <div className="bg-[oklch(0.15_0.028_250)] rounded-lg p-2.5 border border-panel-border/70 mt-1.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="text-red-500" size={15} />
                  <span className="text-[11px] text-foreground font-semibold uppercase tracking-wide">
                    Audio Depth Alarm
                  </span>
                </div>
                <button
                  onClick={() => setAudioAlarmEnabled(!audioAlarmEnabled)}
                  className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                    audioAlarmEnabled
                      ? "bg-red-500/20 text-red-400 border-red-500/40"
                      : "bg-panel border-panel-border text-muted-foreground"
                  }`}
                  title={audioAlarmEnabled ? "Mute Alarm" : "Enable Alarm"}
                >
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

      {/* Footer Status Bar */}
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
