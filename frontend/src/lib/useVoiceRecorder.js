import React from "react";

export const MAX_VOICE_SECONDS = 120;

// First type the browser can record wins. Chrome/Firefox: webm/opus, Safari: mp4.
const CANDIDATE_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? "";
}

function explain(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Trình duyệt đang chặn micro. Cho phép micro cho trang này rồi thử lại.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Không tìm thấy micro trên thiết bị này.";
    case "NotReadableError":
      return "Micro đang được ứng dụng khác sử dụng.";
    default:
      return "Không bật được micro. Thử lại.";
  }
}

/**
 * Record one voice clip.
 * status: "idle" | "starting" | "recording" | "stopped"
 * stop() resolves to { blob, duration, mimeType } (also kept as `clip`).
 * Recording stops by itself at MAX_VOICE_SECONDS and waits for send/cancel.
 */
export function useVoiceRecorder({ onError } = {}) {
  const [status, setStatus] = React.useState("idle");
  const [elapsed, setElapsed] = React.useState(0);
  const recorderRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const chunksRef = React.useRef([]);
  const startedAtRef = React.useRef(0);
  const timerRef = React.useRef(null);
  const clipRef = React.useRef(null);
  const stopPromiseRef = React.useRef(null);
  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;

  const releaseMic = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = React.useCallback(() => {
    const recorder = recorderRef.current;
    if (clipRef.current) return Promise.resolve(clipRef.current);
    if (!recorder || recorder.state === "inactive") return Promise.resolve(null);
    if (stopPromiseRef.current) return stopPromiseRef.current;

    stopPromiseRef.current = new Promise((resolve) => {
      const duration = Math.min((performance.now() - startedAtRef.current) / 1000, MAX_VOICE_SECONDS);
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        clipRef.current = { blob, duration, mimeType };
        releaseMic();
        setElapsed(duration);
        setStatus("stopped");
        stopPromiseRef.current = null;
        resolve(clipRef.current);
      };
      recorder.stop();
    });
    return stopPromiseRef.current;
  }, [releaseMic]);

  const start = React.useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current?.("Ghi âm chỉ dùng được trên HTTPS hoặc localhost.");
      return;
    }
    const mimeType = pickMimeType();
    if (mimeType === null) {
      onErrorRef.current?.("Trình duyệt này không hỗ trợ ghi âm.");
      return;
    }

    setStatus("starting");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setStatus("idle");
      onErrorRef.current?.(explain(error));
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    clipRef.current = null;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data);
    };
    recorderRef.current = recorder;
    recorder.start(250);
    startedAtRef.current = performance.now();
    setElapsed(0);
    setStatus("recording");

    timerRef.current = setInterval(() => {
      const seconds = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_VOICE_SECONDS) stop();
    }, 200);
  }, [stop]);

  const reset = React.useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    releaseMic();
    recorderRef.current = null;
    chunksRef.current = [];
    clipRef.current = null;
    stopPromiseRef.current = null;
    setElapsed(0);
    setStatus("idle");
  }, [releaseMic]);

  // Never leave the microphone on after leaving the screen.
  React.useEffect(() => reset, [reset]);

  return { status, elapsed, start, stop, cancel: reset, reset };
}
