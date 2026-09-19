import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { fetchApi } from "../lib/api";
import { RefreshCw } from "lucide-react";

interface FaceScannerProps {
  sessionId: number;
  onMatch: (studentId: number) => void;
  records: any[];
}

interface LabeledDescriptor {
  studentId: number;
  descriptor: Float32Array;
}

type ScanState = "IDLE" | "FACE_FOUND" | "MATCHING" | "SUCCESS" | "NO_MATCH";

// How many consecutive detection frames before we extract descriptor & match
const STABLE_FRAMES_REQUIRED = 8;
// How long to show SUCCESS/NO_MATCH before resetting (ms)
const RESET_DELAY_MS = 2500;
// Per-student cooldown after being marked (ms)
const COOLDOWN_MS = 8000;

const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

export function FaceScanner({ sessionId, onMatch, records }: FaceScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [status, setStatus] = useState("Loading face data...");
  const [isReady, setIsReady] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [scanState, setScanState] = useState<ScanState>("IDLE");
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    isMobile ? "environment" : "user",
  );

  // All loop-internal state lives in refs — no stale closure bugs
  const isRunningRef = useRef(false);
  const scanStateRef = useRef<ScanState>("IDLE");
  const stableFrames = useRef(0);
  const labeledDescsRef = useRef<LabeledDescriptor[]>([]);
  const recordsRef = useRef<any[]>(records);
  const matchCooldowns = useRef<Map<number, number>>(new Map());

  // Keep recordsRef current so the loop always sees latest attendance state
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  const setPromptAndState = (state: ScanState, msg: string) => {
    scanStateRef.current = state;
    setScanState(state);
    setPrompt(msg);
  };

  // ── Load templates + models ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchApi(`/sessions/${sessionId}/faces`);
        if (!data || data.length === 0) {
          setStatus("No face templates enrolled for this class.");
          return;
        }
        labeledDescsRef.current = data.map((d: any) => ({
          studentId: d.studentId,
          descriptor: new Float32Array(d.embedding),
        }));
        setStatus(`${data.length} template(s) loaded — loading models…`);

        // Load all three models in parallel
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
          faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
          faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
        ]);

        setIsReady(true);
        setStatus(`Ready · ${data.length} student(s) enrolled`);
      } catch (err) {
        console.error(err);
        setStatus("Failed to load face recognition engine.");
      }
    };
    load();
  }, [sessionId]);

  // ── Camera ───────────────────────────────────────────────────────────────
  const handleStreamSuccess = (stream: MediaStream) => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play();
        if (!isRunningRef.current) {
          isRunningRef.current = true;
          setIsRunning(true);
          setPromptAndState("IDLE", "Show your face to the camera");
          setStatus("Scanning…");
          requestAnimationFrame(scanLoop);
        }
      };
    }
  };

  const startCamera = async (
    modeToUse: "environment" | "user" = facingMode,
  ) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: modeToUse,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      setFacingMode(modeToUse);
      handleStreamSuccess(stream);
    } catch (err: any) {
      if (modeToUse === "environment" && err.name !== "NotAllowedError") {
        console.warn("Rear camera unavailable, trying front camera", err);
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          });
          setFacingMode("user");
          handleStreamSuccess(fallbackStream);
        } catch (fallbackErr) {
          setStatus("Camera access denied or unavailable.");
        }
      } else if (err.name === "NotAllowedError") {
        setStatus("Camera access denied. Please allow permissions.");
      } else {
        setStatus("Camera access denied or unavailable.");
      }
    }
  };

  const stopCamera = () => {
    isRunningRef.current = false;
    setIsRunning(false);
    stableFrames.current = 0;
    scanStateRef.current = "IDLE";
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setPrompt("");
    setScanState("IDLE");
    setStatus("Ready to scan");
  };

  const flipCamera = async () => {
    const newMode = facingMode === "user" ? "environment" : "user";
    // Stop current stream before starting new one to avoid conflicts
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    await startCamera(newMode);
  };

  // ── Main detection loop ───────────────────────────────────────────────────
  // Strategy: Phase 1 = fast face detection only (every frame).
  //           Phase 2 = full descriptor extraction only when face is stable.
  //           No mandatory head-turn — just hold face steady for ~0.5s.
  const scanLoop = async () => {
    if (!isRunningRef.current) return;
    const video = videoRef.current;
    if (!video || video.paused || video.ended) {
      if (isRunningRef.current) requestAnimationFrame(scanLoop);
      return;
    }

    const state = scanStateRef.current;

    try {
      if (state === "IDLE" || state === "FACE_FOUND") {
        // Phase 1: fast detection only — no landmark or descriptor
        const detections = await faceapi.detectAllFaces(video);

        if (detections.length > 1) {
          stableFrames.current = 0;
          setPromptAndState(
            "IDLE",
            "Multiple faces detected — ensure only one student is in frame",
          );
          drawBox(detections, video);
        } else if (detections.length === 1) {
          const detection = detections[0];

          // Face Quality Checks: High confidence detection and face must be large enough
          if (detection.score > 0.85 && detection.box.width > 100) {
            stableFrames.current += 1;
            if (state === "IDLE") {
              setPromptAndState(
                "FACE_FOUND",
                `Hold still… (${Math.min(stableFrames.current, STABLE_FRAMES_REQUIRED)}/${STABLE_FRAMES_REQUIRED})`,
              );
            } else {
              setPrompt(
                `Hold still… (${Math.min(stableFrames.current, STABLE_FRAMES_REQUIRED)}/${STABLE_FRAMES_REQUIRED})`,
              );
            }

            if (stableFrames.current >= STABLE_FRAMES_REQUIRED) {
              // Phase 2: face is stable — run full descriptor extraction
              setPromptAndState("MATCHING", "🔍 Verifying identity…");
              await runMatch(video);
            }
          } else {
            // Face found but poor quality
            stableFrames.current = 0;
            if (detection.box.width <= 100) {
              setPromptAndState("IDLE", "Move closer to the camera");
            } else {
              setPromptAndState(
                "IDLE",
                "Face not clear — reposition or improve lighting",
              );
            }
          }

          drawBox(detections, video);
        } else {
          // Face lost
          if (stableFrames.current > 0) {
            stableFrames.current = 0;
            setPromptAndState("IDLE", "Face not visible — reposition");
          }
          drawBox([], video);
        }
      } else if (state === "SUCCESS" || state === "NO_MATCH") {
        // Waiting for auto-reset — do nothing except keep rAF alive
      }
      // MATCHING state: runMatch handles it; just fall through to reschedule
    } catch (err) {
      console.error("Scan error:", err);
    }

    if (isRunningRef.current) requestAnimationFrame(scanLoop);
  };

  const runMatch = async (video: HTMLVideoElement) => {
    try {
      const full = await faceapi
        .detectSingleFace(video)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!full) {
        stableFrames.current = 0;
        setPromptAndState("IDLE", "Lost face during verification — try again");
        return;
      }

      let bestMatch = { studentId: -1, distance: 1.0 };
      for (const ld of labeledDescsRef.current) {
        const d = faceapi.euclideanDistance(ld.descriptor, full.descriptor);
        if (d < bestMatch.distance)
          bestMatch = { studentId: ld.studentId, distance: d };
      }

      if (bestMatch.distance <= 0.58) {
        const rec = recordsRef.current.find(
          (r) => r.studentId === bestMatch.studentId,
        );
        if (rec) {
          const now = Date.now();
          const lastHit = matchCooldowns.current.get(bestMatch.studentId) || 0;
          const name = rec.student?.name ?? "Student";

          if (rec.status !== "PRESENT" && now - lastHit > COOLDOWN_MS) {
            matchCooldowns.current.set(bestMatch.studentId, now);
            onMatch(bestMatch.studentId);
            setPromptAndState(
              "SUCCESS",
              `✅ ${name} marked Present! (Score: ${bestMatch.distance.toFixed(2)})`,
            );
          } else if (rec.status === "PRESENT") {
            setPromptAndState("SUCCESS", `✅ ${name} is already present`);
          } else {
            // In cooldown — just reset
            setPromptAndState("IDLE", "Show your face to the camera");
            stableFrames.current = 0;
            return;
          }
        }
      } else {
        setPromptAndState(
          "NO_MATCH",
          `❌ No match (score: ${bestMatch.distance.toFixed(2)}) — try again`,
        );
      }

      // Auto-reset after delay
      stableFrames.current = 0;
      setTimeout(() => {
        if (
          scanStateRef.current === "SUCCESS" ||
          scanStateRef.current === "NO_MATCH"
        ) {
          setPromptAndState("IDLE", "Show your face to the camera");
        }
      }, RESET_DELAY_MS);
    } catch (err) {
      console.error("Match error:", err);
      stableFrames.current = 0;
      setPromptAndState("IDLE", "Error during verification — try again");
    }
  };

  const drawBox = (
    detections: faceapi.FaceDetection | faceapi.FaceDetection[],
    video: HTMLVideoElement,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, displaySize.width, displaySize.height);

    const detsArray = Array.isArray(detections)
      ? detections
      : detections
        ? [detections]
        : [];
    if (detsArray.length > 0) {
      const resized = faceapi.resizeResults(detsArray, displaySize);
      faceapi.draw.drawDetections(canvas, resized);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRunningRef.current = false;
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
      }
    };
  }, []);

  // Prompt pill color by state
  const pillColor: Record<ScanState, string> = {
    IDLE: "rgba(0,0,0,0.75)",
    FACE_FOUND: "#4f46e5",
    MATCHING: "#0284c7",
    SUCCESS: "#16a34a",
    NO_MATCH: "#dc2626",
  };

  return (
    <div className="face-scanner">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h3 style={{ margin: 0 }}>Face Recognition</h3>
        <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
          {status}
        </span>
      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "4/3",
          backgroundColor: "#000",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            position: "absolute",
            inset: 0,
          }}
        />
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            inset: 0,
            zIndex: 10,
          }}
        />

        {/* Status prompt pill */}
        {isRunning && prompt && (
          <div
            style={{
              position: "absolute",
              bottom: 14,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: pillColor[scanState],
              color: "#fff",
              padding: "7px 18px",
              borderRadius: 24,
              fontWeight: 600,
              fontSize: "0.9rem",
              zIndex: 30,
              boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
              whiteSpace: "nowrap",
              transition: "background-color 0.25s",
            }}
          >
            {prompt}
          </div>
        )}

        {/* Start button overlay */}
        {!isRunning && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.75rem",
              backgroundColor: "rgba(0,0,0,0.55)",
              zIndex: 20,
            }}
          >
            <button
              className="btn btn-primary"
              onClick={() => startCamera()}
              disabled={!isReady}
              style={{ fontSize: "1rem", padding: "0.6rem 1.6rem" }}
            >
              {isReady ? "Start Camera" : "Loading models…"}
            </button>
            {!isReady && (
              <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                Please wait…
              </span>
            )}
          </div>
        )}
      </div>

      {isRunning && (
        <div
          style={{
            marginTop: "0.75rem",
            display: "flex",
            justifyContent: "center",
            gap: "0.5rem",
          }}
        >
          <button
            className="btn btn-secondary"
            onClick={flipCamera}
            title="Flip Camera"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <RefreshCw size={16} /> Flip Camera
          </button>
          <button className="btn btn-secondary" onClick={stopCamera}>
            Stop Camera
          </button>
        </div>
      )}
    </div>
  );
}
