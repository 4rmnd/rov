const ROV_URL = import.meta.env.VITE_ROV_URL ?? "http://localhost:8000";

export type CameraId = "front" | "bottom";
export type CameraAction = "screenshot" | "record_start" | "record_stop";

export async function sendCameraCommand(camera: CameraId, action: CameraAction) {
  // 1. Try unified endpoint POST /api/camera/command (as specified in document.md / AGENTS.md)
  try {
    const res = await fetch(`${ROV_URL}/api/camera/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ camera, action }),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch {
    /* Fallback to legacy path endpoint if unified command route is unavailable */
  }

  // 2. Fallback to subpath endpoint POST /api/camera/${camera}/${subPath}
  let subPath = "";
  if (action === "screenshot") {
    subPath = "screenshot";
  } else if (action === "record_start") {
    subPath = "record/start";
  } else if (action === "record_stop") {
    subPath = "record/stop";
  }

  const res = await fetch(`${ROV_URL}/api/camera/${camera}/${subPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Camera command failed (${res.status}): ${JSON.stringify(err)}`);
  }

  return res.json();
}
