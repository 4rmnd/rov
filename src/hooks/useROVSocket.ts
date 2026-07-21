import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

const ROV_URL = import.meta.env.VITE_ROV_URL ?? "http://localhost:8000";

const LS_AXIS = "rov_axis_mapping_v2";
const LS_BTN = "rov_btn_mapping_v1";

const DEFAULT_AXIS_MAPPING = {
  yaw: { axisIdx: 0, invert: false },      // Left Stick X (Belok Kanan / Kiri)
  forward: { axisIdx: 1, invert: true },   // Left Stick Y (Maju / Mundur)
  throttle: { axisIdx: 2, invert: true },  // Right Stick Y (Naik / Turun)
  lateral: { axisIdx: 5, invert: false },  // Right Stick X (Geser Kiri / Kanan)
};

export type ROVAction =
  | "none" | "arm_toggle" | "arm" | "disarm"
  | "light_toggle" | "gripper_toggle" | "gripper_open" | "gripper_close"
  | "mode_toggle" | "mode_manual" | "mode_depth_hold" | "mode_stabilize"
  | "set_target" | "autonomous_start" | "autonomous_stop"
  | "emergency_stop";

const DEFAULT_BUTTON_MAPPING: Record<number, ROVAction> = {
  0: "mode_toggle", // Triangle △
  1: "gripper_toggle", // Circle ○
  2: "arm_toggle", // Cross ×
  3: "light_toggle", // Square □
  9: "emergency_stop", // Start
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

function parsePOVHat(pov: number) {
  if (pov === 0 || pov > 1.05 || (pov > 0.82 && pov < 0.98)) {
    return { up: false, down: false, left: false, right: false };
  }
  const isUp = pov <= -0.85 || (pov >= 0.85 && pov <= 1.05);
  const isDown = pov >= 0.02 && pov <= 0.28;
  const isRight = pov >= -0.58 && pov <= -0.28;
  const isLeft = pov >= 0.58 && pov <= 0.82;

  const isUpRight = pov >= -0.84 && pov <= -0.59;
  const isDownRight = pov >= -0.27 && pov <= -0.01;
  const isDownLeft = pov >= 0.29 && pov <= 0.57;

  return {
    up: isUp || isUpRight,
    down: isDown || isDownRight || isDownLeft,
    left: isLeft || isDownLeft,
    right: isRight || isUpRight || isDownRight,
  };
}

function loadLS<T>(key: string, fallback: T): T {
  try {
    const r = localStorage.getItem(key);
    return r ? { ...fallback, ...JSON.parse(r) } : fallback;
  } catch {
    return fallback;
  }
}

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
}

// ─── SINGLETON INSTANCE & STATE MANAGEMENT ─────────────────────────────────────
let sharedSocket: Socket | null = null;
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
};

const listeners = new Set<(s: ROVSocketState) => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn({ ...sharedState }));
}

let gamepadLoopStarted = false;

function initGlobalGamepadLoop() {
  if (gamepadLoopStarted) return;
  gamepadLoopStarted = true;

  let gpIdx: number | null = null;
  let prevBtns: boolean[] = [];
  let lightState = false;
  let gripperState = false;

  if (typeof window !== "undefined") {
    window.addEventListener("gamepadconnected", (e: GamepadEvent) => {
      gpIdx = e.gamepad.index;
    });
    window.addEventListener("gamepaddisconnected", (e: GamepadEvent) => {
      if (gpIdx === e.gamepad.index) gpIdx = null;
    });
  }

  setInterval(() => {
    if (!sharedSocket || !sharedSocket.connected) return;

    const pads = typeof navigator !== "undefined" ? (navigator.getGamepads?.() ?? []) : [];
    if (gpIdx === null || !pads[gpIdx]) {
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]) {
          gpIdx = i;
          break;
        }
      }
    }

    if (gpIdx === null) return;
    const gp = pads[gpIdx];
    if (!gp) return;

    const am = loadLS(LS_AXIS, DEFAULT_AXIS_MAPPING);
    const bm = loadLS<Record<number, ROVAction>>(LS_BTN, DEFAULT_BUTTON_MAPPING);

    // 1. Calculate Stick Movement PWM Channels (Supporting both 4-ch and ArduSub 6-ch layouts)
    const ch: Record<number, number> = {
      1: axisPWM(gp.axes[am.lateral.axisIdx] ?? 0, am.lateral.invert),   // Lateral (Legacy Ch 1)
      2: axisPWM(gp.axes[am.forward.axisIdx] ?? 0, am.forward.invert),   // Forward (Legacy Ch 2)
      3: axisPWM(gp.axes[am.throttle.axisIdx] ?? 0, am.throttle.invert),  // Throttle (Ch 3 Vertical)
      4: axisPWM(gp.axes[am.yaw.axisIdx] ?? 0, am.yaw.invert),           // Yaw (Ch 4 Turning)
      5: axisPWM(gp.axes[am.forward.axisIdx] ?? 0, am.forward.invert),   // Forward (ArduSub Standard Ch 5)
      6: axisPWM(gp.axes[am.lateral.axisIdx] ?? 0, am.lateral.invert),   // Lateral (ArduSub Standard Ch 6)
    };

    // 2. D-Pad Movement Support via Axis #9 (POV Hat)
    const povParsed = parsePOVHat(gp.axes[9] ?? gp.axes[4] ?? 0);

    if (ch[5] === 1500 && ch[2] === 1500) {
      if (povParsed.up) { ch[2] = 1800; ch[5] = 1800; }
      else if (povParsed.down) { ch[2] = 1200; ch[5] = 1200; }
    }
    if (ch[6] === 1500 && ch[1] === 1500) {
      if (povParsed.left) { ch[1] = 1200; ch[6] = 1200; }
      else if (povParsed.right) { ch[1] = 1800; ch[6] = 1800; }
    }

    // 3. Fallback D-Pad Buttons 12-15 Movement
    if (ch[5] === 1500 && ch[2] === 1500) {
      if (gp.buttons[12]?.pressed && (!bm[12] || bm[12] === "none")) { ch[2] = 1800; ch[5] = 1800; }
      else if (gp.buttons[13]?.pressed && (!bm[13] || bm[13] === "none")) { ch[2] = 1200; ch[5] = 1200; }
    }
    if (ch[6] === 1500 && ch[1] === 1500) {
      if (gp.buttons[15]?.pressed && (!bm[15] || bm[15] === "none")) { ch[1] = 1800; ch[6] = 1800; }
      else if (gp.buttons[14]?.pressed && (!bm[14] || bm[14] === "none")) { ch[1] = 1200; ch[6] = 1200; }
    }

    // 4. Button Press Detection (Rising Edge Only)
    const btns = Array.from(gp.buttons).map(
      (b) => b.pressed || (typeof b === "object" && b.value > 0.5),
    );
    if (povParsed.up) btns[12] = true;
    if (povParsed.down) btns[13] = true;
    if (povParsed.left) btns[14] = true;
    if (povParsed.right) btns[15] = true;

    const a0 = gp.axes[0] ?? 0;
    const a1 = gp.axes[1] ?? 0;
    const a2 = gp.axes[2] ?? 0;
    const a5 = gp.axes[5] ?? 0;

    if (a1 < -0.45) btns[20] = true;
    if (a1 > 0.45) btns[21] = true;
    if (a0 < -0.45) btns[22] = true;
    if (a0 > 0.45) btns[23] = true;

    if (a2 < -0.45) btns[24] = true;
    if (a2 > 0.45) btns[25] = true;
    if (a5 < -0.45) btns[26] = true;
    if (a5 > 0.45) btns[27] = true;

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

    // 5. Emit RC Override continuously over global socket
    sharedSocket.emit("cmd_rc_override", { channels: ch });
  }, 30);
}

function initSingletonSocket() {
  if (sharedSocket) return;
  if (typeof window === "undefined") return;

  sharedSocket = io(ROV_URL, { transports: ["websocket"] });

  sharedSocket.on("connect", () => {
    sharedState.connected = true;
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

  // Latency Ping-Pong
  setInterval(() => {
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
  };
}
