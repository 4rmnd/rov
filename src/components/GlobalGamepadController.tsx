import { useEffect, useRef } from "react";
import { useROVSocket, ROVAction } from "../hooks/useROVSocket";

const LS_AXIS = "rov_axis_mapping_v1";
const LS_BTN  = "rov_btn_mapping_v1";

const DEFAULT_AXIS_MAPPING = {
  lateral:  { axisIdx: 0, invert: false }, // Left Stick X
  forward:  { axisIdx: 1, invert: true  }, // Left Stick Y
  throttle: { axisIdx: 2, invert: true  }, // Right Stick Y
  yaw:      { axisIdx: 5, invert: false }, // Right Stick X
};

const DEFAULT_BUTTON_MAPPING: Record<number, ROVAction> = {
  0: "mode_toggle",    // Triangle △
  1: "gripper_toggle", // Circle ○
  2: "arm_toggle",     // Cross ×
  3: "light_toggle",   // Square □
  9: "emergency_stop", // Start
};

const DEADZONE  = 0.10;
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
  const isUp    = (pov <= -0.85) || (pov >= 0.85 && pov <= 1.05);
  const isDown  = (pov >= 0.02 && pov <= 0.28);
  const isRight = (pov >= -0.58 && pov <= -0.28);
  const isLeft  = (pov >= 0.58 && pov <= 0.82);

  const isUpRight   = (pov >= -0.84 && pov <= -0.59);
  const isDownRight = (pov >= -0.27 && pov <= -0.01);
  const isDownLeft  = (pov >= 0.29 && pov <= 0.57);

  return {
    up:    isUp || isUpRight,
    down:  isDown || isDownRight || isDownLeft,
    left:  isLeft || isDownLeft,
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

export function GlobalGamepadController() {
  const socket = useROVSocket();
  const socketRef = useRef(socket);
  const gpIdxRef = useRef<number | null>(null);
  const prevBtnsRef = useRef<boolean[]>([]);
  const lightStateRef = useRef(false);
  const gripperStateRef = useRef(false);

  const axisMapRef = useRef(loadLS(LS_AXIS, DEFAULT_AXIS_MAPPING));
  const btnMapRef = useRef(loadLS(LS_BTN, DEFAULT_BUTTON_MAPPING));

  useEffect(() => {
    socketRef.current = socket;
  });

  // Reload mapping from localStorage periodically / on storage event
  useEffect(() => {
    const reloadMapping = () => {
      axisMapRef.current = loadLS(LS_AXIS, DEFAULT_AXIS_MAPPING);
      btnMapRef.current = loadLS(LS_BTN, DEFAULT_BUTTON_MAPPING);
    };

    window.addEventListener("storage", reloadMapping);
    const interval = setInterval(reloadMapping, 1000);
    return () => {
      window.removeEventListener("storage", reloadMapping);
      clearInterval(interval);
    };
  }, []);

  // Listen to gamepad connection events
  useEffect(() => {
    function onConnect(e: GamepadEvent) {
      gpIdxRef.current = e.gamepad.index;
    }
    function onDisconnect(e: GamepadEvent) {
      if (gpIdxRef.current === e.gamepad.index) {
        gpIdxRef.current = null;
      }
    }
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    return () => {
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, []);

  // Action executor
  const executeAction = (action: string) => {
    const s = socketRef.current;
    if (!s) return;

    switch (action) {
      case "arm_toggle":
        s.telemetry?.armed ? s.sendDisarm() : s.sendArm();
        break;
      case "arm":
        s.sendArm();
        break;
      case "disarm":
        s.sendDisarm();
        break;
      case "light_toggle":
        lightStateRef.current = !lightStateRef.current;
        s.sendLight(lightStateRef.current);
        break;
      case "gripper_toggle":
        gripperStateRef.current = !gripperStateRef.current;
        s.sendGripper(gripperStateRef.current ? "open" : "close");
        break;
      case "gripper_open":
        gripperStateRef.current = true;
        s.sendGripper("open");
        break;
      case "gripper_close":
        gripperStateRef.current = false;
        s.sendGripper("close");
        break;
      case "mode_toggle":
        s.sendSetMode(s.telemetry?.mode === "DEPTH_HOLD" ? "MANUAL" : "DEPTH_HOLD");
        break;
      case "mode_manual":
        s.sendSetMode("MANUAL");
        break;
      case "mode_depth_hold":
        s.sendSetMode("DEPTH_HOLD");
        break;
      case "emergency_stop":
        s.sendEmergencyStop();
        break;
      default:
        break;
    }
  };

  // Main Global Gamepad Control Loop (30ms / 33Hz)
  useEffect(() => {
    const interval = setInterval(() => {
      // Auto-find active gamepad index
      const pads = navigator.getGamepads?.() ?? [];
      if (gpIdxRef.current === null || !pads[gpIdxRef.current]) {
        for (let i = 0; i < pads.length; i++) {
          if (pads[i]) {
            gpIdxRef.current = i;
            break;
          }
        }
      }

      if (gpIdxRef.current === null) return;
      const gp = pads[gpIdxRef.current];
      if (!gp) return;

      const am = axisMapRef.current;
      const bm = btnMapRef.current;

      // 1. Calculate Stick Movement PWM Channels
      const ch: Record<number, number> = {
        1: axisPWM(gp.axes[am.lateral.axisIdx] ?? 0, am.lateral.invert),
        2: axisPWM(gp.axes[am.forward.axisIdx] ?? 0, am.forward.invert),
        3: axisPWM(gp.axes[am.throttle.axisIdx] ?? 0, am.throttle.invert),
        4: axisPWM(gp.axes[am.yaw.axisIdx] ?? 0, am.yaw.invert),
      };

      // 2. D-Pad Movement Support via Axis #9 (POV Hat)
      const povParsed = parsePOVHat(gp.axes[9] ?? gp.axes[4] ?? 0);

      if (ch[2] === 1500) {
        if (povParsed.up) ch[2] = 1800;
        else if (povParsed.down) ch[2] = 1200;
      }
      if (ch[1] === 1500) {
        if (povParsed.left) ch[1] = 1200;
        else if (povParsed.right) ch[1] = 1800;
      }

      // 3. Fallback D-Pad Buttons 12-15 Movement
      if (ch[2] === 1500) {
        if (gp.buttons[12]?.pressed && (!bm[12] || bm[12] === "none")) ch[2] = 1800;
        else if (gp.buttons[13]?.pressed && (!bm[13] || bm[13] === "none")) ch[2] = 1200;
      }
      if (ch[1] === 1500) {
        if (gp.buttons[15]?.pressed && (!bm[15] || bm[15] === "none")) ch[1] = 1800;
        else if (gp.buttons[14]?.pressed && (!bm[14] || bm[14] === "none")) ch[1] = 1200;
      }

      // 4. Button Press Detection (Rising Edge Only)
      const btns = Array.from(gp.buttons).map(b => b.pressed || (typeof b === "object" && b.value > 0.5));
      
      // Virtual POV Hat D-pad Buttons 12-15
      if (povParsed.up) btns[12] = true;
      if (povParsed.down) btns[13] = true;
      if (povParsed.left) btns[14] = true;
      if (povParsed.right) btns[15] = true;

      // Virtual Analog Stick Deflection Buttons 20-27
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

      const prev = prevBtnsRef.current;
      btns.forEach((pressed, i) => {
        if (pressed && !(prev[i] ?? false)) {
          const action = bm[i];
          if (action && action !== "none") executeAction(action);
        }
      });
      prevBtnsRef.current = btns;

      // 5. Emit RC Override to WebSocket Backend
      const s = socketRef.current;
      if (s && s.connected) {
        s.sendRCOverride(ch);
      }
    }, 30);

    return () => clearInterval(interval);
  }, []);

  return null; // Invisible background global controller component
}
