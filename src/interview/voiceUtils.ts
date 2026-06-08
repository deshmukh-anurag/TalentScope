// Browser-side voice helpers: TTS, MediaRecorder + adaptive silence detection.
// All helpers run only in the browser. They throw if SSR'd.

// -------- TTS --------

let cachedVoices: SpeechSynthesisVoice[] = [];

const loadVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      cachedVoices = voices;
      resolve(voices);
      return;
    }
    const handler = () => {
      const v = window.speechSynthesis.getVoices();
      cachedVoices = v;
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(v);
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    // safety timeout
    setTimeout(() => resolve(window.speechSynthesis.getVoices() || []), 1500);
  });
};

const pickBestVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
  if (!voices.length) return null;
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = en.length ? en : voices;
  // Prefer high-quality named voices in this order.
  const preferred = [
    "Google UK English Female",
    "Google US English",
    "Microsoft Aria Online",
    "Microsoft Jenny Online",
    "Samantha",
    "Karen",
    "Daniel"
  ];
  for (const name of preferred) {
    const hit = pool.find((v) => v.name === name);
    if (hit) return hit;
  }
  return pool[0];
};

// Some browsers gate speechSynthesis until a user gesture. Call this from a
// click handler to "unlock" it; subsequent speak() calls then work reliably.
export const unlockTts = (): void => {
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (err) {
    console.warn("[tts] unlock failed:", err);
  }
};

export const speak = async (text: string): Promise<void> => {
  if (!("speechSynthesis" in window)) {
    console.warn("[tts] speechSynthesis not supported");
    return;
  }
  if (!text || !text.trim()) return;

  if (cachedVoices.length === 0) {
    await loadVoices();
  }

  return new Promise<void>((resolve) => {
    try {
      window.speechSynthesis.cancel(); // clear any queued utterances
    } catch {
      /* best-effort cleanup; ignore */
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickBestVoice(cachedVoices);
    if (voice) utterance.voice = voice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = voice?.lang || "en-US";

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      console.log("[tts] finished");
      resolve();
    };

    utterance.onstart = () => console.log("[tts] start");
    utterance.onend = finish;
    utterance.onerror = (e) => {
      console.warn("[tts] error:", e.error);
      finish();
    };

    console.log(`[tts] speak (${text.length} chars)`);
    window.speechSynthesis.speak(utterance);

    // Chrome has a known bug where long utterances get paused after ~15s.
    // Periodically poke pause/resume to keep playback alive.
    const keepAlive = setInterval(() => {
      if (done) {
        clearInterval(keepAlive);
        return;
      }
      try {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      } catch {
      /* best-effort cleanup; ignore */
    }
    }, 8000);
  });
};

export const cancelSpeech = (): void => {
  try {
    window.speechSynthesis.cancel();
  } catch {
      /* best-effort cleanup; ignore */
    }
};

// -------- Audio recording + silence detection --------

export type RecorderState = "idle" | "calibrating" | "listening" | "speaking" | "stopped";

export interface RecorderEvents {
  onLevel?: (level: number) => void;          // 0..1 normalized RMS
  onStateChange?: (state: RecorderState) => void;
  onSpeechDetected?: () => void;              // first time speech is heard
  onSilenceAfterSpeech?: () => void;          // X seconds of silence after speech
}

export interface RecorderOptions {
  silenceMs?: number;            // silence duration after speech that triggers stop (default 2500)
  calibrationMs?: number;        // noise-floor calibration window (default 800)
  speechMargin?: number;         // RMS above noise floor to count as speech (default 0.04)
  minNoiseFloor?: number;        // floor we never go below (default 0.015)
  maxNoiseFloor?: number;        // floor we cap at, even for noisy rooms (default 0.12)
}

export interface VoiceRecorder {
  start: () => Promise<void>;
  stop: () => Promise<Blob>;
  isActive: () => boolean;
  getState: () => RecorderState;
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // strip "data:audio/webm;base64," prefix
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export const audioBlobToBase64 = blobToBase64;

const computeRms = (timeData: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
  return Math.sqrt(sum / timeData.length);
};

// Pick a recorder mime type that the browser actually supports.
const pickMimeType = (): string => {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg"
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) {
      return c;
    }
  }
  return "audio/webm";
};

export const createVoiceRecorder = (
  events: RecorderEvents = {},
  options: RecorderOptions = {}
): VoiceRecorder => {
  const {
    silenceMs = 2500,
    calibrationMs = 800,
    speechMargin = 0.04,
    minNoiseFloor = 0.015,
    maxNoiseFloor = 0.12
  } = options;

  let mediaStream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let timeData: Float32Array | null = null;
  let chunks: Blob[] = [];
  let mimeType = "audio/webm";

  let state: RecorderState = "idle";
  let rafId: number | null = null;
  let calibrationStart = 0;
  let calibrationSamples: number[] = [];
  let noiseFloor = minNoiseFloor;
  let lastSpeechAt = 0;
  let speechSeen = false;
  let silenceFiredOnce = false;

  const setState = (s: RecorderState) => {
    if (state === s) return;
    state = s;
    console.log(`[rec] state -> ${s}`);
    events.onStateChange?.(s);
  };

  const stopMonitor = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const tick = () => {
    if (!analyser || !timeData) return;
    analyser.getFloatTimeDomainData(timeData);
    const rms = computeRms(timeData);
    const level = Math.min(1, rms * 6); // visual scale
    events.onLevel?.(level);

    const now = performance.now();

    if (state === "calibrating") {
      calibrationSamples.push(rms);
      if (now - calibrationStart >= calibrationMs) {
        // noise floor = 90th percentile of samples, clamped.
        const sorted = [...calibrationSamples].sort((a, b) => a - b);
        const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? minNoiseFloor;
        noiseFloor = Math.max(minNoiseFloor, Math.min(maxNoiseFloor, p90 * 1.4));
        console.log(
          `[rec] calibrated noiseFloor=${noiseFloor.toFixed(4)} (samples=${calibrationSamples.length})`
        );
        setState("listening");
      }
    } else if (state === "listening" || state === "speaking") {
      const isSpeech = rms > noiseFloor + speechMargin;

      if (isSpeech) {
        lastSpeechAt = now;
        if (!speechSeen) {
          speechSeen = true;
          events.onSpeechDetected?.();
        }
        if (state !== "speaking") setState("speaking");
      } else if (state === "speaking") {
        const silentFor = now - lastSpeechAt;
        if (silentFor >= silenceMs && !silenceFiredOnce) {
          silenceFiredOnce = true;
          console.log(`[rec] silence ${Math.round(silentFor)}ms after speech`);
          events.onSilenceAfterSpeech?.();
        }
      }
    }

    rafId = requestAnimationFrame(tick);
  };

  const start = async (): Promise<void> => {
    if (state !== "idle" && state !== "stopped") {
      console.warn("[rec] start called in state", state);
      return;
    }
    chunks = [];
    speechSeen = false;
    silenceFiredOnce = false;
    calibrationSamples = [];

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    mimeType = pickMimeType();
    recorder = new MediaRecorder(mediaStream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(250); // ms timeslice — flush often so stop() yields full audio

    const Ctx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctx();
    const source = audioCtx.createMediaStreamSource(mediaStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    timeData = new Float32Array(analyser.fftSize);
    source.connect(analyser);

    calibrationStart = performance.now();
    lastSpeechAt = calibrationStart;
    setState("calibrating");
    rafId = requestAnimationFrame(tick);
    console.log(`[rec] started (mime=${mimeType})`);
  };

  const stop = async (): Promise<Blob> => {
    stopMonitor();
    setState("stopped");

    const blob = await new Promise<Blob>((resolve) => {
      if (!recorder) return resolve(new Blob([], { type: mimeType }));
      if (recorder.state === "inactive") {
        return resolve(new Blob(chunks, { type: mimeType }));
      }
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      try {
        recorder.stop();
      } catch (err) {
        console.warn("[rec] stop error:", err);
        resolve(new Blob(chunks, { type: mimeType }));
      }
    });

    try {
      mediaStream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* best-effort cleanup; ignore */
    }
    try {
      await audioCtx?.close();
    } catch {
      /* best-effort cleanup; ignore */
    }
    mediaStream = null;
    recorder = null;
    audioCtx = null;
    analyser = null;
    timeData = null;

    console.log(`[rec] stopped, blob=${blob.size} bytes type=${blob.type}`);
    return blob;
  };

  return {
    start,
    stop,
    isActive: () => state === "calibrating" || state === "listening" || state === "speaking",
    getState: () => state
  };
};

export const getMimeFromBlob = (blob: Blob): string => blob.type || "audio/webm";
