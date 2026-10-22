"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The part of the Web Speech API used here (not in TypeScript's DOM types). */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

/**
 * Speak instead of typing: the browser's own speech recognition (Hebrew) writes into the message box, and
 * the employee reads it and sends it as usual - nothing is sent by voice alone. No button where the
 * browser has no speech recognition (e.g. Firefox); the text box works as always.
 */
export function VoiceInput({
  draft,
  onDraftChange,
  disabled,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  disabled: boolean;
}) {
  const supported = useSyncExternalStore(noop, () => recognitionCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => () => recognition.current?.stop(), []);

  if (!supported) return null;

  function start() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const before = draft.trim();
    const rec = new Ctor();
    rec.lang = "he-IL";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      let spoken = "";
      for (let i = 0; i < event.results.length; i++) spoken += event.results[i][0].transcript;
      onDraftChange([before, spoken.trim()].filter(Boolean).join(" "));
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("אין הרשאה למיקרופון. אפשר לאשר אותה בהגדרות הדפדפן.");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setError("לא הצלחנו לשמוע. נסו שוב או הקלידו.");
      }
    };
    rec.onend = () => {
      setListening(false);
      recognition.current = null;
    };
    recognition.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  }

  return (
    <>
      <Button
        type="button"
        variant={listening ? "default" : "outline"}
        size="icon-lg"
        onClick={() => (listening ? recognition.current?.stop() : start())}
        disabled={disabled && !listening}
        aria-pressed={listening}
        aria-label={listening ? "עצירת ההקלטה" : "הקלטת הודעה בקול"}
        title={listening ? "עצירת ההקלטה" : "דברו במקום להקליד"}
        className={cn("shrink-0", listening && "motion-safe:animate-pulse")}
      >
        {listening ? <Square aria-hidden className="size-4 fill-current" /> : <Mic aria-hidden className="size-5" />}
      </Button>
      <span role="status" className="sr-only">
        {listening ? "מקשיבים…" : ""}
      </span>
      {error && <VoiceError message={error} onDismiss={() => setError(null)} />}
    </>
  );
}

function VoiceError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);
  return (
    <span role="alert" className="absolute bottom-full mb-2 rounded-xl bg-foreground px-3 py-1.5 text-xs text-background shadow-card">
      {message}
    </span>
  );
}
