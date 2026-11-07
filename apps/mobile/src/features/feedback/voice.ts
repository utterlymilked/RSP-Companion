import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

/** Portuguese from Portugal, for both recognition and read-aloud. */
export const VOICE_LANG = "pt-PT";

/** The slice of the browser's SpeechRecognition that dictation uses. */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type DictationError = "denied" | "failed";

/**
 * Voice dictation with pt-PT recognition. Only the browser offers it (Web Speech API); native
 * apps rely on the keyboard's own microphone, so `supported` is false there.
 * `onText` receives each finished phrase to append to the note.
 */
export function useDictation(onText: (phrase: string) => void) {
  const supported = recognitionCtor() !== null;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<DictationError | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => rec.current?.stop(), []);
  useEffect(() => () => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = VOICE_LANG;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res?.isFinal && res[0]) cb.current(res[0].transcript.trim());
      }
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("denied");
      else if (e.error !== "no-speech" && e.error !== "aborted") setError("failed");
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("failed");
    }
  }, []);

  return { supported, listening, error, start, stop };
}

/** Read-aloud, preferring a pt-PT voice. */
export function useReadAloud() {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => void Speech.stop(), []);
  const speak = useCallback((text: string) => {
    setSpeaking(true);
    Speech.speak(text, {
      language: VOICE_LANG,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, []);
  const stop = useCallback(() => {
    void Speech.stop();
    setSpeaking(false);
  }, []);
  return { speaking, speak, stop };
}
