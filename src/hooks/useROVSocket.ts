import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

const ROV_URL = import.meta.env.VITE_ROV_URL ?? "http://localhost:8000";


export const DEFAULT_AXIS_MAPPING = {
  // Gamepad API Standard: Axis 0=LS_X, Axis 1=LS_Y, Axis 2=RS_X, Axis 3=RS_Y
  forward: { axisIdx: 1, invert: true },   // Left Stick Y  (Up = Maju, Down = Mundur)
  yaw:     { axisIdx: 0, invert: false },  // Left Stick X  (Right = Belok Kanan, Left = Belok Kiri)
  throttle:{ axisIdx: 3, invert: true },  // Right Stick Y (Up = Naik, Down = Turun)
  lateral: { axisIdx: 2, invert: false },  // Right Stick X (Right = Geser Kanan, Left = Geser Kiri)
};

export type ROVAction =
  | "none" | "arm_toggle" | "arm" | "disarm"
  | "light_toggle" | "gripper_toggle" | "gripper_open" | "gripper_close"
  | "mode_toggle" | "mode_manual" | "mode_depth_hold" | "mode_stabilize"
  | "set_target" | "autonomous_start" | "autonomous_stop"
  | "emergency_stop";

export const DEFAULT_BUTTON_MAPPING: Record<number, ROVAction> = {
  0: "mode_toggle", // Triangle △
  1: "gripper_toggle", // Circle ○
  2: "arm_toggle", // Cross ×
  3: "light_toggle", // Square □
  9: "emergency_stop", // Start
};

export const DEFAULT_CALIB = {
  forward: 1.0,
  yaw: 1.0,
  throttle: 1.0,
  lateral: 1.0,
};

const DEADZONE = 0.1;
const PWM_RANGE = 400;

function applyDZ(v: number) {
  if (Math.abs(v) < DEADZONE) return 0;
  return (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);
}

function axisPWM(v: number, invert = false) {
  return Math.round(1500 + applyDZ(invert ? -v : v) * PWM_RANGE);
}

// parsePOVHat removed to prevent axis-to-button ghosting

export interface TelemetryState {
  roll: number;
  pitch: number;
  yaw: number;
  depth: number;
  battery_voltage: number;
  battery_current: number;
  battery_remaining: number;
  armed: boolean;
  mode: string;
  accel_x: number;
  accel_y: number;
  accel_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  last_update: number;
}

export interface TrajectoryPoint {
  x: number;
  y: number;
  depth: number;
  yaw: number;
  timestamp: number;
}

export interface TrajectoryState {
  current_pos: {
    x: number;
    y: number;
    depth: number;
  };
  orientation: {
    roll: number;
    pitch: number;
    yaw: number;
  };
  path: TrajectoryPoint[];
  timestamp: number;
}

export interface QRStatus {
  data: string;
  aligned: boolean;
  timestamp?: number;
}

export interface CameraResult {
  camera: "front" | "bottom";
  action: "screenshot" | "record_start" | "record_stop";
  status: "ok" | "error";
  filename?: string;
  filepath?: string;
}

export interface AutonomousStatus {
  state: string;
  target_id: string;
  elapsed_s: number;
  is_active: boolean;
  waypoint_index?: number;
  waypoint_total?: number;
}

export interface FailsafeSubsystem {
  ok: boolean;
  severity: string;
  message: string;
  recovery_attempts: number;
  fault_since: number | null;
}

export interface FailsafeStatus {
  emergency_active: boolean;
  emergency_reason: string;
  subsystems: Record<string, FailsafeSubsystem>;
  event_count: number;
  timestamp: string;
}

export interface ROVSocketState {
  connected: boolean;
  mavlinkConnected: boolean;
  latencyMs: number | null;
  telemetry: TelemetryState | null;
  trajectory: TrajectoryState | null;
  qrStatus: QRStatus | null;
  dockAligned: boolean;
  lastCameraResult: CameraResult | null;
  autonomousStatus: AutonomousStatus | null;
  failsafeStatus: FailsafeStatus | null;
  lightState: boolean;
  gripperState: boolean;
  config: any | null;
  gpEnabled: boolean;
  kbEnabled: boolean;
  gpName: string | null;
  channels: Record<number, number>;
  emitCount: number;
}

// ─── SINGLETON INSTANCE & STATE MANAGEMENT ─────────────────────────────────────
const globalAny = (typeof globalThis !== 'undefined' ? globalThis : window) as any;

let sharedSocket: Socket | null = globalAny.__rovSharedSocket || null;
let sharedState: ROVSocketState = {
  connected: false,
  mavlinkConnected: false,
  latencyMs: null,
  telemetry: null,
  trajectory: null,
  qrStatus: null,
  dockAligned: false,
  lastCameraResult: null,
  autonomousStatus: null,
  failsafeStatus: null,
  lightState: false,
  gripperState: false,
  config: null,
  gpEnabled: true,
  kbEnabled: false,
  gpName: null,
  channels: { 1: 1500, 2: 1500, 3: 1500, 4: 1500, 5: 1500, 6: 1500 },
  emitCount: 0,
};

const keys: Record<string, boolean> = {};
let kbListenersAdded = false;

const listeners = new Set<(s: ROVSocketState) => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn({ ...sharedState }));
}

let gamepadLoopStarted = globalAny.__rovGamepadLoopStarted || false;

function initGlobalGamepadLoop() {
  if (gamepadLoopStarted) return;
  gamepadLoopStarted = true;
  globalAny.__rovGamepadLoopStarted = true;

  let gpIdx: number | null = null;
  let prevBtns: boolean[] = [];

  if (typeof window !== "undefined") {
    window.addEventListener("gamepadconnected", (e: GamepadEvent) => {
      gpIdx = e.gamepad.index;
      sharedState.gpName = e.gamepad.id;
      notifyListeners();
    });
    window.addEventListener("gamepaddisconnected", (e: GamepadEvent) => {
      if (gpIdx === e.gamepad.index) {
        gpIdx = null;
        sharedState.gpName = null;
        notifyListeners();
      }
    });

    if (!kbListenersAdded) {
      const KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
      window.addEventListener("keydown", (e: KeyboardEvent) => {
        const k = e.key.toLowerCase();
        if (KEYS.includes(k)) { if (k.startsWith("arrow")) e.preventDefault(); keys[k] = true; }
      });
      window.addEventListener("keyup", (e: KeyboardEvent) => {
        keys[e.key.toLowerCase()] = false;
      });
      kbListenersAdded = true;
    }
  }

  if (globalAny.__rovGamepadInterval) {
    clearInterval(globalAny.__rovGamepadInterval);
  }

  globalAny.__rovGamepadInterval = setInterval(() => {
    if (!sharedSocket || !sharedSocket.connected) return;

    const currentConfig = sharedState.config || {};
    const am = currentConfig.axisMap ?? DEFAULT_AXIS_MAPPING;
    const bm = currentConfig.btnMap ?? DEFAULT_BUTTON_MAPPING;
    const calib = currentConfig.calib ?? DEFAULT_CALIB;

    let ch: Record<number, number> = { 1: 1500, 2: 1500, 3: 1500, 4: 1500, 5: 1500, 6: 1500 };
    const btns: boolean[] = Array.from({ length: 30 }, () => false);

    const pads = typeof navigator !== "undefined" ? (navigator.getGamepads?.() ?? []) : [];
    if (gpIdx === null || !pads[gpIdx]) {
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]) {
          gpIdx = i;
          sharedState.gpName = pads[i]?.id ?? "Unknown Gamepad";
          notifyListeners();
          break;
        }
      }
    }

    const gp = gpIdx !== null ? pads[gpIdx] : null;

    if (sharedState.gpEnabled && gp) {
      // Backend expects: 1=Lateral, 2=Forward, 3=Throttle, 4=Yaw
      ch[1] = axisPWM((gp.axes[am.lateral.axisIdx] ?? 0) * calib.lateral, am.lateral.invert);
      ch[2] = axisPWM((gp.axes[am.forward.axisIdx] ?? 0) * calib.forward, am.forward.invert);
      ch[3] = axisPWM((gp.axes[am.throttle.axisIdx] ?? 0) * calib.throttle, am.throttle.invert);
      ch[4] = axisPWM((gp.axes[am.yaw.axisIdx] ?? 0) * calib.yaw, am.yaw.invert);

      Array.from(gp.buttons).forEach((b, i) => {
        btns[i] = b.pressed || (typeof b === "object" && b.value > 0.5);
      });
    } else if (sharedState.kbEnabled) {
      ch[1] = 1500 + (keys["d"] ? 300 : 0) - (keys["a"] ? 300 : 0);
      ch[2] = 1500 + (keys["w"] ? 300 : 0) - (keys["s"] ? 300 : 0);
      ch[3] = 1500 + (keys["arrowup"] ? 300 : 0) - (keys["arrowdown"] ? 300 : 0);
      ch[4] = 1500 + (keys["arrowright"] ? 300 : 0) - (keys["arrowleft"] ? 300 : 0);
    } else if (gpIdx === null && sharedState.gpName !== null) {
      sharedState.gpName = null;
      notifyListeners();
    }

    btns.forEach((pressed, i) => {
      if (pressed && !(prevBtns[i] ?? false)) {
        const action = bm[i];
        if (action && action !== "none") {
          switch (action) {
            case "arm_toggle":
              sharedState.telemetry?.armed
                ? sharedSocket?.emit("cmd_disarm")
                : sharedSocket?.emit("cmd_arm");
              break;
            case "arm":
              sharedSocket?.emit("cmd_arm");
              break;
            case "disarm":
              sharedSocket?.emit("cmd_disarm");
              break;
            case "light_toggle":
              sharedState.lightState = !sharedState.lightState;
              notifyListeners();
              sharedSocket?.emit("cmd_light", { state: sharedState.lightState });
              break;
            case "gripper_toggle":
              sharedState.gripperState = !sharedState.gripperState;
              notifyListeners();
              sharedSocket?.emit("cmd_gripper", { action: sharedState.gripperState ? "open" : "close" });
              break;
            case "gripper_open":
              sharedState.gripperState = true;
              notifyListeners();
              sharedSocket?.emit("cmd_gripper", { action: "open" });
              break;
            case "gripper_close":
              sharedState.gripperState = false;
              notifyListeners();
              sharedSocket?.emit("cmd_gripper", { action: "close" });
              break;
            case "mode_toggle":
              sharedSocket?.emit("cmd_set_mode", {
                mode: sharedState.telemetry?.mode === "DEPTH_HOLD" ? "MANUAL" : "DEPTH_HOLD",
              });
              break;
            case "mode_manual":
              sharedSocket?.emit("cmd_set_mode", { mode: "MANUAL" });
              break;
            case "mode_depth_hold":
              sharedSocket?.emit("cmd_set_mode", { mode: "DEPTH_HOLD" });
              break;
            case "mode_stabilize":
              sharedSocket?.emit("cmd_set_mode", { mode: "STABILIZE" });
              break;
            case "set_target":
              sharedSocket?.emit("cmd_set_target", { target_id: "DOCK_STATION_ALPHA" });
              break;
            case "autonomous_start":
              sharedSocket?.emit("cmd_autonomous_start", { target_id: "AUTONOMOUS_MISSION" });
              break;
            case "autonomous_stop":
              sharedSocket?.emit("cmd_autonomous_stop", { reason: "operator_abort" });
              break;
            case "emergency_stop":
              sharedSocket?.emit("cmd_emergency_stop", { reason: "Operator E-Stop" });
              break;
          }
        }
      }
    });
    prevBtns = btns;

    sharedState.channels = ch;
    sharedState.emitCount += 1;
    notifyListeners();

    sharedSocket.emit("cmd_rc_override", { channels: ch });
  }, 50);
}

function initSingletonSocket() {
  if (sharedSocket) return;
  if (typeof window === "undefined") return;

  sharedSocket = io(ROV_URL, { transports: ["websocket"] });
  globalAny.__rovSharedSocket = sharedSocket;

  sharedSocket.on("connect", () => {
    sharedState.connected = true;
    notifyListeners();
    fetch(`${ROV_URL}/api/config`)
      .then(res => res.json())
      .then(data => {
        sharedState.config = data;
        notifyListeners();
      })
      .catch(err => console.error("Failed to load config:", err));
  });

  sharedSocket.on("config_update", (data: any) => {
    sharedState.config = data;
    notifyListeners();
  });

  sharedSocket.on("disconnect", () => {
    sharedState.connected = false;
    sharedState.dockAligned = false;
    sharedState.autonomousStatus = null;
    sharedState.failsafeStatus = null;
    notifyListeners();
  });

  sharedSocket.on("mavlink_status", (data: { connected: boolean }) => {
    sharedState.mavlinkConnected = data.connected;
    notifyListeners();
  });

  sharedSocket.on("telemetry_update", (data: TelemetryState) => {
    sharedState.telemetry = data;
    notifyListeners();
  });

  sharedSocket.on("trajectory_update", (data: TrajectoryState) => {
    sharedState.trajectory = data;
    notifyListeners();
  });

  sharedSocket.on("qr_detected", (data: QRStatus) => {
    sharedState.qrStatus = data;
    notifyListeners();
  });

  sharedSocket.on("dock_aligned", () => {
    sharedState.dockAligned = true;
    notifyListeners();
  });

  sharedSocket.on("dock_lost", () => {
    sharedState.dockAligned = false;
    notifyListeners();
  });

  sharedSocket.on("camera_result", (data: CameraResult) => {
    sharedState.lastCameraResult = data;
    notifyListeners();
  });

  sharedSocket.on("autonomous_status", (data: AutonomousStatus) => {
    sharedState.autonomousStatus = data;
    notifyListeners();
  });

  sharedSocket.on("failsafe_status", (data: FailsafeStatus) => {
    sharedState.failsafeStatus = data;
    notifyListeners();
  });

  sharedSocket.on("emergency_stop", (data: { message: string }) => {
    sharedState.failsafeStatus = sharedState.failsafeStatus
      ? {
          ...sharedState.failsafeStatus,
          emergency_active: true,
          emergency_reason: data.message || "Emergency Stop",
        }
      : {
          emergency_active: true,
          emergency_reason: data.message || "Emergency Stop",
          subsystems: {},
          event_count: 0,
          timestamp: new Date().toISOString(),
        };
    notifyListeners();
  });

  sharedSocket.on("mission_complete", (data: { success: boolean; reason: string }) => {
    console.log(`[Autonomous Mission] ${data.success ? 'Success' : 'Failed'}: ${data.reason}`);
    if (sharedState.autonomousStatus) {
      sharedState.autonomousStatus.state = data.success ? "COMPLETE" : "FAILED";
    }
    notifyListeners();
  });

  // Latency Ping-Pong
  if (globalAny.__rovPingInterval) {
    clearInterval(globalAny.__rovPingInterval);
  }
  globalAny.__rovPingInterval = setInterval(() => {
    if (sharedSocket?.connected) {
      sharedSocket.emit("ping_rov", { sent_at: Date.now() });
    }
  }, 2000);

  sharedSocket.on("pong_rov", (data: { echo: { sent_at: number } }) => {
    if (data?.echo?.sent_at) {
      sharedState.latencyMs = Date.now() - data.echo.sent_at;
      notifyListeners();
    }
  });

  // Initialize Global Gamepad Loop ONCE alongside single socket
  initGlobalGamepadLoop();
}

export function useROVSocket() {
  const [state, setState] = useState<ROVSocketState>(() => {
    initSingletonSocket();
    return { ...sharedState };
  });

  useEffect(() => {
    initSingletonSocket();
    const listener = (newState: ROVSocketState) => setState(newState);
    listeners.add(listener);
    listener({ ...sharedState });
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const sendEmergencyStop = () =>
    sharedSocket?.emit("cmd_emergency_stop", { reason: "Operator E-Stop" });
  const sendClearEmergency = () => sharedSocket?.emit("cmd_clear_emergency");
  const sendArm = () => sharedSocket?.emit("cmd_arm");
  const sendDisarm = () => sharedSocket?.emit("cmd_disarm");
  const sendSetMode = (mode: string) => sharedSocket?.emit("cmd_set_mode", { mode });
  const sendGripper = (action: "open" | "close") => {
    sharedState.gripperState = action === "open";
    notifyListeners();
    sharedSocket?.emit("cmd_gripper", { action });
  };
  const sendLight = (state: boolean) => {
    sharedState.lightState = state;
    notifyListeners();
    sharedSocket?.emit("cmd_light", { state });
  };
  const sendAutonomousStart = (targetId: string) =>
    sharedSocket?.emit("cmd_autonomous_start", { target_id: targetId });
  const sendAutonomousStop = () =>
    sharedSocket?.emit("cmd_autonomous_stop", { reason: "operator_abort" });
  const sendRCOverride = (channels: Record<number, number>) =>
    sharedSocket?.emit("cmd_rc_override", { channels });

  const setGpEnabled = (enabled: boolean) => {
    sharedState.gpEnabled = enabled;
    notifyListeners();
  };
  const setKbEnabled = (enabled: boolean) => {
    sharedState.kbEnabled = enabled;
    notifyListeners();
  };

  return {
    ...state,
    sendEmergencyStop,
    sendClearEmergency,
    sendArm,
    sendDisarm,
    sendSetMode,
    sendGripper,
    sendLight,
    sendAutonomousStart,
    sendAutonomousStop,
    sendRCOverride,
    setGpEnabled,
    setKbEnabled,
  };
}
