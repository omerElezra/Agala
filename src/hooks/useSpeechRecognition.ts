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

export function useSpeechRecognition(
  onResult: (text: string) => void,
): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // Register event listeners only if module is available
  // Note: hooks must be called unconditionally, so we use no-op when unavailable
  const noop = () => {};
  const useEvent = useSpeechRecognitionEvent ?? ((_: string, __: any) => {});

  useEvent("start", speechAvailable ? () => setIsListening(true) : noop);
  useEvent("end", speechAvailable ? () => setIsListening(false) : noop);
  useEvent(
    "result",
    speechAvailable
      ? (event: any) => {
          const text = event.results[0]?.transcript ?? "";
          setTranscript(text);
          if (event.isFinal && text.trim()) {
            onResultRef.current(text.trim());
          }
        }
      : noop,
  );
  useEvent("error", speechAvailable ? () => setIsListening(false) : noop);

  const startListening = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule) return;
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) return;

    ExpoSpeechRecognitionModule.start({
      lang: "he-IL",
      interimResults: true,
      maxAlternatives: 1,
    });
  }, []);

  const stopListening = useCallback(() => {
    if (!ExpoSpeechRecognitionModule) return;
    ExpoSpeechRecognitionModule.stop();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ExpoSpeechRecognitionModule) {
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, []);

  return {
    isAvailable: speechAvailable,
    isListening,
    transcript,
    startListening,
    stopListening,
  };
}
