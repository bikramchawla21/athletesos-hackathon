"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_RECORDING_MS,
  pickSupportedMimeType,
  recordingToFile,
  type VoiceRecordingErrorCode,
  type VoiceRecordingState,
} from "@/lib/voice-recording";

export type CompletedRecording = {
  blob: Blob;
  file: File;
  mimeType: string;
  durationMs: number;
  objectUrl: string;
};

type RecorderControls = {
  state: VoiceRecordingState;
  elapsedMs: number;
  errorCode: VoiceRecordingErrorCode | null;
  recording: CompletedRecording | null;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
  retry: () => void;
  clearRecording: () => void;
};

function classifyGetUserMediaError(error: unknown): VoiceRecordingErrorCode {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "permission_denied";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "no_microphone";
  }
  if (name === "NotSupportedError") {
    return "unsupported";
  }
  return "recording_failed";
}

function revokeUrl(url: string | null | undefined) {
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}

/**
 * Browser MediaRecorder session for the AthleteOS voice-first PWA.
 * Audio stays local in this pass; later passes will upload the File for STT.
 */
export function useVoiceRecorder(): RecorderControls {
  const [state, setState] = useState<VoiceRecordingState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorCode, setErrorCode] = useState<VoiceRecordingErrorCode | null>(null);
  const [recording, setRecording] = useState<CompletedRecording | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeTypeRef = useRef<string>("");
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearRecording = useCallback(() => {
    revokeUrl(objectUrlRef.current);
    objectUrlRef.current = null;
    setRecording(null);
  }, []);

  const resetSession = useCallback(() => {
    clearTimers();
    stopTracks();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    cancelledRef.current = false;
    setElapsedMs(0);
  }, [clearTimers, stopTracks]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearTimers();
      try {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      stopTracks();
      revokeUrl(objectUrlRef.current);
      objectUrlRef.current = null;
    };
  }, [clearTimers, stopTracks]);

  const finalizeRecording = useCallback((parts: BlobPart[], mimeType: string, durationMs: number) => {
    const blob = new Blob(parts, { type: mimeType || "application/octet-stream" });
    if (blob.size === 0) {
      setErrorCode("recording_failed");
      setState("error");
      resetSession();
      return;
    }
    revokeUrl(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;
    const file = recordingToFile(blob, mimeType);
    setRecording({ blob, file, mimeType, durationMs, objectUrl });
    setState("recorded");
    resetSession();
  }, [resetSession]);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    cancelledRef.current = false;
    clearTimers();
    try {
      recorder.stop();
    } catch {
      setErrorCode("recording_failed");
      setState("error");
      resetSession();
    }
  }, [clearTimers, resetSession]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    clearTimers();
    const recorder = mediaRecorderRef.current;
    try {
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      } else {
        resetSession();
        clearRecording();
        setErrorCode(null);
        setState("idle");
      }
    } catch {
      resetSession();
      clearRecording();
      setErrorCode(null);
      setState("idle");
    }
  }, [clearRecording, clearTimers, resetSession]);

  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorCode("unsupported");
      setState("error");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setErrorCode("unsupported");
      setState("error");
      return;
    }

    clearRecording();
    setErrorCode(null);
    setState("requesting_permission");
    cancelledRef.current = false;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });

      if (cancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        setState("idle");
        return;
      }

      streamRef.current = stream;
      const mimeType =
        pickSupportedMimeType((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      mimeTypeRef.current = mimeType;

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setErrorCode("recording_failed");
        setState("error");
        resetSession();
      };

      recorder.onstop = () => {
        const durationMs = Math.max(0, Date.now() - startedAtRef.current);
        const parts = [...chunksRef.current];
        const type = mimeTypeRef.current || recorder.mimeType || "audio/webm";
        stopTracks();
        mediaRecorderRef.current = null;
        clearTimers();

        if (cancelledRef.current) {
          chunksRef.current = [];
          clearRecording();
          setErrorCode(null);
          setState("idle");
          return;
        }

        finalizeRecording(parts, type, durationMs);
      };

      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setState("listening");
      recorder.start(250);

      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);

      maxTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          stop();
        }
      }, MAX_RECORDING_MS);
    } catch (error) {
      stopTracks();
      setErrorCode(classifyGetUserMediaError(error));
      setState("error");
    }
  }, [clearRecording, clearTimers, finalizeRecording, resetSession, stop, stopTracks]);

  const retry = useCallback(() => {
    clearRecording();
    setErrorCode(null);
    setState("idle");
    void start();
  }, [clearRecording, start]);

  return {
    state,
    elapsedMs,
    errorCode,
    recording,
    start,
    stop,
    cancel,
    retry,
    clearRecording,
  };
}
