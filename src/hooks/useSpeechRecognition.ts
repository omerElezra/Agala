import { useCallback, useEffect, useRef, useState } from "react";

// Try to load the native module — returns null if unavailable (e.g. Expo Go)
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = null;
let speechAvailable = false;

try {
  const mod = require("expo-speech-recognition");
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
  speechAvailable = !!ExpoSpeechRecognitionModule;
} catch {
  // Native module not available (Expo Go)
}

interface UseSpeechRecognitionResult {
  isAvailable: boolean;
  isListening: boolean;
  transcript: string;
  startListening: () => Promise<void>;
  stopListening: () => void;
}

interface UseSpeechRecognitionOptions {
  autoStop?: boolean;
  silenceMs?: number;
  finalStopMs?: number;
}

export function useSpeechRecognition(
  onResult: (text: string) => void,
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionResult {
  const { autoStop = true, silenceMs = 1400, finalStopMs = 300 } = options;
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const onResultRef = useRef(onResult);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onResultRef.current = onResult;

  const clearStopTimer = useCallback(() => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  }, []);

  const stopNative = useCallback(() => {
    if (!ExpoSpeechRecognitionModule) return;
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const scheduleAutoStop = useCallback(
    (delayMs: number) => {
      if (!autoStop) return;
      clearStopTimer();
      stopTimeoutRef.current = setTimeout(
        () => {
          stopNative();
        },
        Math.max(0, delayMs),
      );
    },
    [autoStop, clearStopTimer, stopNative],
  );

  // Register event listeners only if module is available
  // Note: hooks must be called unconditionally, so we use no-op when unavailable
  const noop = () => {};
  const useEvent = useSpeechRecognitionEvent ?? ((_: string, __: any) => {});

  useEvent(
    "start",
    speechAvailable
      ? () => {
          clearStopTimer();
          setIsListening(true);
        }
      : noop,
  );
  useEvent(
    "end",
    speechAvailable
      ? () => {
          clearStopTimer();
          setIsListening(false);
        }
      : noop,
  );
  useEvent(
    "result",
    speechAvailable
      ? (event: any) => {
          const text = event.results[0]?.transcript ?? "";
          const trimmed = text.trim();

          setTranscript(text);

          if (trimmed.length > 0) {
            scheduleAutoStop(event.isFinal ? finalStopMs : silenceMs);
          }

          if (event.isFinal && trimmed) {
            onResultRef.current(trimmed);
          }
        }
      : noop,
  );
  useEvent(
    "error",
    speechAvailable
      ? () => {
          clearStopTimer();
          setIsListening(false);
        }
      : noop,
  );

  const startListening = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule) return;
    clearStopTimer();
    setTranscript("");

    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) return;

    ExpoSpeechRecognitionModule.start({
      lang: "he-IL",
      interimResults: true,
      maxAlternatives: 1,
    });
  }, [clearStopTimer]);

  const stopListening = useCallback(() => {
    clearStopTimer();
    stopNative();
  }, [clearStopTimer, stopNative]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearStopTimer();
      if (ExpoSpeechRecognitionModule) {
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, [clearStopTimer]);

  return {
    isAvailable: speechAvailable,
    isListening,
    transcript,
    startListening,
    stopListening,
  };
}
