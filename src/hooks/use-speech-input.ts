"use client";

import * as React from "react";

/**
 * Minimal surface of the Web Speech API we rely on. Typed locally because
 * `SpeechRecognition` is still vendor-prefixed and is not in TypeScript's DOM
 * library, and because declaring only what we touch keeps the fallback path
 * honest.
 */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/**
 * Dictation for the composer.
 *
 * Progressive enhancement on purpose: `supported` is false on first paint and
 * on browsers without the API (notably Firefox and Android WebView), and the
 * caller simply hides the mic. The alternative — shipping a speech model or
 * posting audio to a transcription endpoint — would send the user's voice off
 * the machine, which contradicts the local-first promise.
 */
export function useSpeechInput({
  onTranscript,
}: {
  onTranscript: (text: string, isFinal: boolean) => void;
}) {
  // Availability is a property of the browser, not of React state: reading it
  // through an external store gives a stable `false` on the server and the
  // real answer on the client without a render-then-correct cycle.
  const supported = React.useSyncExternalStore(
    () => () => {},
    () => getConstructor() != null,
    () => false,
  );

  const [listening, setListening] = React.useState(false);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);

  // Kept in a ref so re-creating the callback each render does not force us to
  // tear down and rebuild the recogniser mid-utterance. Written in an effect
  // rather than during render, so a render React discards cannot leave the
  // live recogniser pointing at a callback that was never committed.
  const callbackRef = React.useRef(onTranscript);
  React.useEffect(() => {
    callbackRef.current = onTranscript;
  }, [onTranscript]);

  React.useEffect(() => {
    const Ctor = getConstructor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (final) callbackRef.current(final, true);
      else if (interim) callbackRef.current(interim, false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // Already stopped; nothing to unwind.
      }
      recognitionRef.current = null;
    };
  }, []);

  const toggle = React.useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      setListening(false);
      return;
    }
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if it is already running; treat that as "on".
      setListening(true);
    }
  }, [listening]);

  return { supported, listening, toggle };
}
