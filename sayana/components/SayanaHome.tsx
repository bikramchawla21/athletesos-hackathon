"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function pickMime(): string {
  const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type LiveRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function startLiveCaptions(onText: (text: string) => void): (() => void) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => LiveRec;
    webkitSpeechRecognition?: new () => LiveRec;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = navigator.language || "en-IN";
  let finals = "";
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const piece = ev.results[i];
      const text = piece[0]?.transcript || "";
      if (piece.isFinal) finals += `${text} `;
      else interim += text;
    }
    onText(`${finals}${interim}`.trim());
  };
  rec.onerror = () => {};
  try {
    rec.start();
  } catch {
    return null;
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  };
}

export function SayanaHome() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [reply, setReply] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [caption, setCaption] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const captionStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetch("/api/v1/me").catch(() => {});
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    return () => window.clearInterval(id);
  }, [on]);

  const stopCaptions = () => {
    captionStopRef.current?.();
    captionStopRef.current = null;
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const upload = useCallback(async (blob: Blob) => {
    setBusy(true);
    setCaption("");
    setStatus("Mic is off. Writing this down — about 10–20 seconds.");
    const file = new File([blob], `dump.${blob.type.includes("mp4") ? "m4a" : "webm"}`, {
      type: blob.type || "audio/webm",
    });
    const form = new FormData();
    form.set("audio", file);
    form.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    const res = await fetch("/api/v1/dump", { method: "POST", body: form });
    const data = (await res.json()) as { reply?: string; error?: string; overwhelmed?: boolean };
    if (!res.ok) {
      setStatus(data.error || "couldn’t catch that");
      setBusy(false);
      return;
    }
    setReply(data.reply || "");
    setStatus("Saved on Today. Tap talk when you want to go again.");
    setBusy(false);
  }, []);

  const start = useCallback(async () => {
    if (busy) return;
    setReply("");
    setCaption("");
    setElapsedMs(0);
    setStatus("Listening. Tap stop when you’re done.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      stopCaptions();
      stopStream();
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      if (!blob.size) {
        setStatus("nothing caught — try again");
        return;
      }
      try {
        await upload(blob);
      } catch {
        setStatus("couldn’t send that");
        setBusy(false);
      }
    };
    recorderRef.current = rec;
    rec.start(1000);
    startedAtRef.current = Date.now();
    setOn(true);
    captionStopRef.current = startLiveCaptions(setCaption);
  }, [busy, upload]);

  const stop = useCallback(() => {
    stopCaptions();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
    setOn(false);
  }, []);

  return (
    <div className="home">
      <h1 className="whatsup">Whatsup?</h1>
      <p className="aur">Aur Bata</p>
      <button
        className="mic"
        type="button"
        data-on={on ? "true" : "false"}
        aria-pressed={on}
        disabled={busy}
        onClick={() => (on ? stop() : start())}
      >
        {busy ? "wait" : on ? "stop" : "talk"}
      </button>
      {on ? (
        <p className="timer" aria-live="polite">
          {formatElapsed(elapsedMs)}
        </p>
      ) : null}
      <p className="status" aria-live="polite">
        {status}
      </p>
      {on && caption ? <p className="captions">{caption}</p> : null}
      {reply ? <p className="reply">{reply}</p> : null}
    </div>
  );
}
