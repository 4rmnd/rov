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

  // Gamepad & Keyboard Pilot Control States
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [gamepadName, setGamepadName] = useState("");
  const [joystickActive, setJoystickActive] = useState(true);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [channelValues, setChannelValues] = useState<Record<number, number>>({
    1: 1500,
    2: 1500,
    3: 1500,
    4: 1500,
  });

  // Polling Refs to prevent stale React closures inside loops
  const joystickActiveRef = useRef(joystickActive);
  const keyboardActiveRef = useRef(keyboardActive);
  const socketRefForLoop = useRef(socket);

  useEffect(() => { joystickActiveRef.current = joystickActive; }, [joystickActive]);
  useEffect(() => { keyboardActiveRef.current = keyboardActive; }, [keyboardActive]);
  useEffect(() => { socketRefForLoop.current = socket; }, [socket]);

  const gamepadIndexRef = useRef<number | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastEmitRef = useRef<number>(0);
  const prevChannelsRef = useRef<Record<number, number>>({ 1: 1500, 2: 1500, 3: 1500, 4: 1500 });
  const keysPressed = useRef<Record<string, boolean>>({});

  const resetToNeutral = () => {
    const neutral = { 1: 1500, 2: 1500, 3: 1500, 4: 1500 };
    setChannelValues(neutral);
    if (socketRefForLoop.current.connected) {
      socketRefForLoop.current.sendRCOverride(neutral);
    }
    prevChannelsRef.current = neutral;
  };

  const pollGamepad = () => {
    if (gamepadIndexRef.current === null) return;
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[gamepadIndexRef.current];

    if (!gp) {
      setGamepadConnected(false);
      setGamepadName("");
      gamepadIndexRef.current = null;
      return;
    }

    const deadzone = 0.08;
    const applyDeadzone = (val: number) => {
      if (Math.abs(val) < deadzone) return 0;
      return (val - Math.sign(val) * deadzone) / (1 - deadzone);
    };

    // Standard Mapping: Left Stick (Lateral, Forward), Right Stick (Yaw, Throttle)
    const rawLat = gp.axes[0] ?? 0;
    const rawFwd = gp.axes[1] ?? 0;
    const rawYaw = gp.axes[2] ?? 0;
    const rawThr = gp.axes[3] ?? 0;

    const lat = applyDeadzone(rawLat);
    const fwd = -applyDeadzone(rawFwd); // Invert Y-axis
    const thr = -applyDeadzone(rawThr); // Invert Y-axis
    const yaw = applyDeadzone(rawYaw);

    const pwmLat = Math.round(1500 + lat * 400);
    const pwmFwd = Math.round(1500 + fwd * 400);
    const pwmThr = Math.round(1500 + thr * 400);
    const pwmYaw = Math.round(1500 + yaw * 400);

    const nextChannels = {
      1: pwmLat,
      2: pwmFwd,
      3: pwmThr,
      4: pwmYaw,
    };

    setChannelValues(nextChannels);

    if (socketRefForLoop.current.connected && joystickActiveRef.current) {
      const now = Date.now();
      if (now - lastEmitRef.current >= 50) {
        const changed =
          nextChannels[1] !== prevChannelsRef.current[1] ||
          nextChannels[2] !== prevChannelsRef.current[2] ||
          nextChannels[3] !== prevChannelsRef.current[3] ||
          nextChannels[4] !== prevChannelsRef.current[4];

        if (changed || now - lastEmitRef.current >= 200) {
          socketRefForLoop.current.sendRCOverride(nextChannels);
          prevChannelsRef.current = nextChannels;
          lastEmitRef.current = now;
        }
      }
    }

    requestRef.current = requestAnimationFrame(pollGamepad);
  };

  // Gamepad Connection effect
  useEffect(() => {
    const handleConnect = (e: GamepadEvent) => {
      console.log("Gamepad connected:", e.gamepad.id);
      setGamepadConnected(true);
      setGamepadName(e.gamepad.id);
      gamepadIndexRef.current = e.gamepad.index;
      requestRef.current = requestAnimationFrame(pollGamepad);
    };

    const handleDisconnect = (e: GamepadEvent) => {
      if (gamepadIndexRef.current === e.gamepad.index) {
        console.log("Gamepad disconnected:", e.gamepad.id);
        setGamepadConnected(false);
        setGamepadName("");
        gamepadIndexRef.current = null;
        if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
        }
        resetToNeutral();
      }
    };

    window.addEventListener("gamepadconnected", handleConnect);
    window.addEventListener("gamepaddisconnected", handleDisconnect);

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        setGamepadConnected(true);
        setGamepadName(gamepads[i]!.id);
        gamepadIndexRef.current = i;
        requestRef.current = requestAnimationFrame(pollGamepad);
        break;
      }
    }

    return () => {
      window.removeEventListener("gamepadconnected", handleConnect);
      window.removeEventListener("gamepaddisconnected", handleDisconnect);
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      const neutral = { 1: 1500, 2: 1500, 3: 1500, 4: 1500 };
      if (socketRefForLoop.current.connected) {
        socketRefForLoop.current.sendRCOverride(neutral);
      }
    };
  }, [socket.connected]);

  // Keyboard Backup control effect
  useEffect(() => {
    if (!keyboardActive || gamepadConnected) {
      if (!gamepadConnected) {
        resetToNeutral();
      }
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
          e.preventDefault();
        }
        keysPressed.current[key] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keysPressed.current) {
        keysPressed.current[key] = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const keyboardInterval = setInterval(() => {
      let lat = 0;
      let fwd = 0;
      let thr = 0;
      let yaw = 0;

      if (keysPressed.current["w"]) fwd += 1;
      if (keysPressed.current["s"]) fwd -= 1;
      if (keysPressed.current["a"]) lat -= 1;
      if (keysPressed.current["d"]) lat += 1;

      if (keysPressed.current["arrowup"]) thr += 1;
      if (keysPressed.current["arrowdown"]) thr -= 1;
      if (keysPressed.current["arrowleft"]) yaw -= 1;
      if (keysPressed.current["arrowright"]) yaw += 1;

      const pwmLat = Math.round(1500 + lat * 300);
      const pwmFwd = Math.round(1500 + fwd * 300);
      const pwmThr = Math.round(1500 + thr * 300);
      const pwmYaw = Math.round(1500 + yaw * 300);

      const nextChannels = {
        1: pwmLat,
        2: pwmFwd,
        3: pwmThr,
        4: pwmYaw,
      };

      setChannelValues(nextChannels);

      if (socketRefForLoop.current.connected) {
        const now = Date.now();
        if (now - lastEmitRef.current >= 50) {
          const changed =
            nextChannels[1] !== prevChannelsRef.current[1] ||
            nextChannels[2] !== prevChannelsRef.current[2] ||
            nextChannels[3] !== prevChannelsRef.current[3] ||
            nextChannels[4] !== prevChannelsRef.current[4];

          if (changed || now - lastEmitRef.current >= 200) {
            socketRefForLoop.current.sendRCOverride(nextChannels);
            prevChannelsRef.current = nextChannels;
            lastEmitRef.current = now;
          }
        }
      }
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      clearInterval(keyboardInterval);
      resetToNeutral();
    };
  }, [keyboardActive, gamepadConnected, socket.connected]);

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

          <div className="flex-1 flex flex-col justify-start gap-2.5 py-3 overflow-y-auto scrollbar-thin">
            {/* Power Arm button */}
            <button
              onClick={handleToggleArm}
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors shrink-0 ${
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
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors shrink-0 ${
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
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors shrink-0 ${
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
              className={`flex items-center justify-center gap-2.5 py-3 rounded-lg border font-bold text-sm cursor-pointer transition-colors shrink-0 ${
                gripperState
                  ? "bg-green-500/20 text-green-500 border-green-500/30"
                  : "bg-panel border-panel-border text-muted-foreground hover:text-foreground hover:bg-panel/60"
              }`}
            >
              <RotateCcw size={16} />
              <span>{gripperState ? "VESSEL GRIPPER: OPEN" : "VESSEL GRIPPER: CLOSE"}</span>
            </button>

            {/* Joystick Control Panel */}
            <div className="bg-[oklch(0.12_0.024_250)] rounded-lg p-3 border border-panel-border/60 mt-1 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                  Joystick Pilot Control
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setKeyboardActive(!keyboardActive)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors cursor-pointer ${
                      keyboardActive
                        ? "bg-accent/20 text-accent border-accent/40"
                        : "bg-panel border-panel-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Keyboard
                  </button>
                  <button
                    onClick={() => setJoystickActive(!joystickActive)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors cursor-pointer ${
                      joystickActive
                        ? "bg-green-500/20 text-green-400 border-green-500/40"
                        : "bg-panel border-panel-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {joystickActive ? "Output ON" : "Output OFF"}
                  </button>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center justify-between text-[11px] bg-[oklch(0.15_0.028_250)] rounded px-2 py-1 border border-panel-border/30">
                <span className="text-muted-foreground font-medium">Device Status:</span>
                {gamepadConnected ? (
                  <span className="text-[color:var(--color-success)] font-mono font-bold flex items-center gap-1 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-success)]" />
                    CONNECTED
                  </span>
                ) : keyboardActive ? (
                  <span className="text-accent font-mono font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    KEYBOARD MODE
                  </span>
                ) : (
                  <span className="text-red-400 font-mono font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    DISCONNECTED
                  </span>
                )}
              </div>

              {gamepadConnected && (
                <div className="text-[9px] text-muted-foreground font-mono truncate bg-black/20 p-1 rounded text-center">
                  {gamepadName}
                </div>
              )}

              {/* Channels Visualizers */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "CH1 Lateral", val: channelValues[1], key: 1 },
                  { label: "CH2 Forward", val: channelValues[2], key: 2 },
                  { label: "CH3 Throttle", val: channelValues[3], key: 3 },
                  { label: "CH4 Yaw", val: channelValues[4], key: 4 },
                ].map((ch) => {
                  const percentage = ((ch.val - 1100) / 800) * 100;
                  return (
                    <div key={ch.key} className="space-y-0.5 bg-black/10 p-1.5 rounded border border-panel-border/20">
                      <div className="flex justify-between text-[8px] font-mono">
                        <span className="text-muted-foreground truncate max-w-[55px]">{ch.label}</span>
                        <span className="text-[color:var(--color-data)] font-bold">{ch.val}</span>
                      </div>
                      <div className="h-1.5 w-full bg-panel-border/30 rounded-full overflow-hidden relative border border-panel-border/40">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30 z-10" />
                        <div
                          className="h-full bg-gradient-to-r from-accent to-[color:var(--color-success)] transition-all duration-75"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {!socket.telemetry?.armed && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 rounded p-1.5 text-center text-[9px] font-semibold leading-normal">
                  ⚠️ VESSEL DISARMED. Arm motors to enable thruster outputs.
                </div>
              )}
            </div>
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
