import React, { useState, useEffect, useCallback, useRef } from "react";
import * as faceapi from "face-api.js";
import { useNavigate } from "react-router-dom";
import { fetchApi } from "../lib/api";
import { Modal } from "../components/Modal";
import {
  BookOpen,
  UserPlus,
  GraduationCap,
  List,
  Trash2,
  FlaskConical,
  BookMarked,
  Calendar,
  Upload,
  Camera,
  X,
  RefreshCw,
  Edit2,
  FileSpreadsheet,
  ImagePlus,
} from "lucide-react";
import { parseStudentsCsv, type ParsedStudentRow } from "../lib/importUtils";
import {
  getBlocksForPattern,
  THEORY_PATTERNS,
  LAB_PATTERNS,
} from "@attendance/shared";
import type { TimeBlock } from "@attendance/shared";
import "./Register.css";

interface Course {
  id: number;
  code: string;
  name: string;
  type: string;
  slotPattern: string;
  studentCount?: number;
}
interface Student {
  id: number;
  registrationNumber: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
  isActive: boolean;
  enrolledCourses?: { id: number; code: string; name: string; type: string }[];
}

type Tab =
  "course" | "student" | "bulk-import" | "manage-courses" | "manage-students";

export function Register() {
  const [activeTab, setActiveTab] = useState<Tab>("course");

  return (
    <div className="register-page">
      <div className="page-header">
        <div>
          <h1>Register</h1>
          <p>Create courses, register students, and manage existing records</p>
        </div>
      </div>

      <div className="register-tabs">
        <button
          className={`tab-btn ${activeTab === "course" ? "active" : ""}`}
          onClick={() => setActiveTab("course")}
        >
          <BookOpen size={18} /> Register Course
        </button>
        <button
          className={`tab-btn ${activeTab === "student" ? "active" : ""}`}
          onClick={() => setActiveTab("student")}
        >
          <UserPlus size={18} /> Register Student
        </button>
        <button
          className={`tab-btn ${activeTab === "bulk-import" ? "active" : ""}`}
          onClick={() => setActiveTab("bulk-import")}
        >
          <FileSpreadsheet size={18} /> Bulk Import
        </button>
        <button
          className={`tab-btn ${activeTab === "manage-courses" ? "active" : ""}`}
          onClick={() => setActiveTab("manage-courses")}
        >
          <List size={18} /> Manage Courses
        </button>
        <button
          className={`tab-btn ${activeTab === "manage-students" ? "active" : ""}`}
          onClick={() => setActiveTab("manage-students")}
        >
          <GraduationCap size={18} /> Manage Students
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "course" && <RegisterCourse />}
        {activeTab === "student" && <RegisterStudent />}
        {activeTab === "bulk-import" && <BulkImportStudents />}
        {activeTab === "manage-courses" && <ManageCourses />}
        {activeTab === "manage-students" && <ManageStudents />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Register Course Tab
// ─────────────────────────────────────────
function RegisterCourse() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [courseType, setCourseType] = useState<"THEORY" | "LAB">("THEORY");
  const [slotPattern, setSlotPattern] = useState(THEORY_PATTERNS[0] || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const patterns = courseType === "THEORY" ? THEORY_PATTERNS : LAB_PATTERNS;
  const blocks: TimeBlock[] = slotPattern
    ? getBlocksForPattern(slotPattern)
    : [];

  // Reset pattern when course type changes
  const handleTypeChange = (type: "THEORY" | "LAB") => {
    setCourseType(type);
    const newPatterns = type === "THEORY" ? THEORY_PATTERNS : LAB_PATTERNS;
    setSlotPattern(newPatterns[0] || "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slotPattern) {
      setMessage({ type: "error", text: "Please select a slot pattern." });
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      const course = await fetchApi("/courses", {
        method: "POST",
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          type: courseType,
          slotPattern,
        }),
      });
      setMessage({
        type: "success",
        text: `Course "${course.code} — ${course.name}" (${slotPattern}) created successfully!`,
      });
      setCode("");
      setName("");
      setSlotPattern(patterns[0] || "");
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Failed to create course",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="register-panel">
      <div className="panel-header">
        <div className="panel-icon">
          <BookOpen size={22} />
        </div>
        <div>
          <h2>Create New Course</h2>
          <p>Add a subject/course with its timetable slot</p>
        </div>
      </div>

      {message && (
        <div
          className={
            message.type === "success" ? "success-alert" : "error-alert"
          }
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="register-form">
        {/* Course Type Toggle */}
        <div className="form-group">
          <label>Course Type *</label>
          <div className="type-toggle">
            <button
              type="button"
              className={`type-btn ${courseType === "THEORY" ? "active" : ""}`}
              onClick={() => handleTypeChange("THEORY")}
            >
              <BookMarked size={16} /> Theory
            </button>
            <button
              type="button"
              className={`type-btn ${courseType === "LAB" ? "active" : ""}`}
              onClick={() => handleTypeChange("LAB")}
            >
              <FlaskConical size={16} /> Lab
            </button>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="course-code">Course Code *</label>
            <input
              id="course-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. CS101"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="course-slot">Slot Pattern *</label>
            <select
              id="course-slot"
              value={slotPattern}
              onChange={(e) => setSlotPattern(e.target.value)}
              required
            >
              {patterns.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="course-name">Course Name *</label>
          <input
            id="course-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Introduction to Computer Science"
            required
          />
        </div>

        {/* Schedule Preview */}
        {slotPattern && blocks.length > 0 && (
          <div className="schedule-preview">
            <div className="schedule-preview-header">
              <Calendar size={16} />
              <span>
                Schedule Preview — {blocks.length} class
                {blocks.length > 1 ? "es" : ""} per week
              </span>
            </div>
            <div className="schedule-blocks">
              {blocks.map((b, i) => (
                <div key={i} className="schedule-block">
                  <span className="block-day">{b.day}</span>
                  <span className="block-code">{b.code}</span>
                  <span className="block-time">
                    {b.startTime} – {b.endTime}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary submit-btn"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create Course"}
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────
// Register Student Tab
// ─────────────────────────────────────────
function RegisterStudent() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [name, setName] = useState("");
  const [regNo, setRegNo] = useState("");
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoMode, setPhotoMode] = useState<"none" | "upload" | "camera">(
    "none",
  );
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [enrollInCourse, setEnrollInCourse] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Auto face-embedding extraction from uploaded photo or live camera
  const [faceEmbeddings, setFaceEmbeddings] = useState<number[][]>([]);
  const [faceStatus, setFaceStatus] = useState<
    "idle" | "processing" | "found" | "not-found"
  >("idle");
  const [isCapturing, setIsCapturing] = useState(false);
  const modelsLoadedRef = useRef(false);

  const ensureModels = async () => {
    if (modelsLoadedRef.current) return;
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
    ]);
    modelsLoadedRef.current = true;
  };

  const extractEmbedding = async (dataUrl: string) => {
    setFaceStatus("processing");
    setFaceEmbeddings([]);
    try {
      await ensureModels();
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });
      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (detection && detection.detection.score > 0.85) {
        setFaceEmbeddings([Array.from(detection.descriptor)]);
        setFaceStatus("found");
      } else {
        setFaceStatus("not-found");
      }
    } catch (err) {
      console.warn("Face extraction failed:", err);
      setFaceStatus("not-found");
    }
  };

  // Trigger embedding extraction whenever a photo is set
  useEffect(() => {
    if (photoUrl) {
      if (photoMode === "upload") {
        extractEmbedding(photoUrl);
      }
    } else {
      setFaceStatus("idle");
      setFaceEmbeddings([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoUrl]);

  // Stop camera stream when mode changes away from camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraError("");
  };

  const startCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      setCameraError(
        "Camera access denied or not available. Please allow camera permission.",
      );
    }
  };

  const snapPhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    setIsCapturing(true);
    setFaceStatus("processing");
    await ensureModels();

    const captured: number[][] = [];

    // Try to capture up to 5 embeddings
    for (let i = 0; i < 15; i++) {
      if (captured.length >= 5) break;
      const det = await faceapi
        .detectSingleFace(video)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (det && det.detection.score > 0.85) {
        captured.push(Array.from(det.descriptor));
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    if (captured.length > 0) {
      setFaceEmbeddings(captured);
      setFaceStatus("found");
    } else {
      setFaceStatus("not-found");
    }

    // Capture the final display photo
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setPhotoUrl(dataUrl);
    stopCamera();
    setIsCapturing(false);
  };

  const handleModeChange = (mode: "upload" | "camera") => {
    stopCamera();
    setPhotoUrl("");
    setPhotoMode(mode);
    if (mode === "camera") {
      // small delay to let component render the video element first
      setTimeout(() => startCamera(), 100);
    }
  };

  const clearPhoto = () => {
    stopCamera();
    setPhotoUrl("");
    setPhotoMode("none");
  };

  // Cleanup camera on unmount
  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    fetchApi("/courses")
      .then((data) => {
        setCourses(data);
        if (data.length > 0) setSelectedCourseId(String(data[0].id));
      })
      .catch(console.error);
  }, []);

  // Suggest the next available serial number for the selected course
  useEffect(() => {
    if (!enrollInCourse || !selectedCourseId) return;
    fetchApi(`/enrollments?courseId=${selectedCourseId}`)
      .then((enrollments: { serialNumber: number }[]) => {
        const maxSerial = enrollments.reduce(
          (max, e) => Math.max(max, e.serialNumber ?? 0),
          0,
        );
        setSerialNumber(String(maxSerial + 1));
      })
      .catch(console.error);
  }, [enrollInCourse, selectedCourseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      // Normalize registration number: trim and uppercase before sending
      const normalizedRegNo = regNo.trim().toUpperCase();

      // POST /api/students returns 201 for a new student, or 200 (with _reused:true) for an
      // existing student with the same registration number. Either way, proceed to enrollment.
      const student = await fetchApi("/students", {
        method: "POST",
        body: JSON.stringify({
          registrationNumber: normalizedRegNo,
          name: name.trim(),
          email: email.trim() || undefined,
          photoUrl: photoUrl.trim() || undefined,
        }),
      });

      const isReused = !!student._reused;

      // Auto-save face embeddings extracted from the photo or camera
      let faceAutoEnrolled = false;
      if (faceEmbeddings.length > 0) {
        try {
          await fetchApi(`/students/${student.id}/faces`, {
            method: "POST",
            body: JSON.stringify({
              embeddings: faceEmbeddings,
              modelName: "face-api.js-resnet34",
              modelVersion: "0.22.2",
            }),
          });
          faceAutoEnrolled = true;
        } catch (faceErr) {
          // Non-fatal: face enrollment failure should not block registration
          console.warn("Auto face enrollment failed:", faceErr);
        }
      }

      if (enrollInCourse && selectedCourseId) {
        const parsedSerial = parseInt(serialNumber, 10);
        if (!Number.isInteger(parsedSerial) || parsedSerial < 1) {
          setMessage({
            type: "error",
            text: "Serial number must be a positive whole number.",
          });
          setIsSubmitting(false);
          return;
        }
        try {
          const enrollment = await fetchApi("/enrollments", {
            method: "POST",
            body: JSON.stringify({
              studentId: student.id,
              courseId: parseInt(selectedCourseId),
              serialNumber: parsedSerial,
            }),
          });
          const course = courses.find((c) => String(c.id) === selectedCourseId);
          const courseName = course
            ? `${course.code} — ${course.name}`
            : selectedCourseId;
          const prefix = isReused
            ? `Existing student "${student.name}"`
            : `Student "${student.name}"`;
          const faceNote = faceAutoEnrolled
            ? " · Face ID enrolled ✓"
            : photoUrl && faceStatus === "not-found"
              ? " · No face detected in photo"
              : "";
          setMessage({
            type: "success",
            text: `${prefix} enrolled in ${courseName} as #${enrollment.serialNumber}!${faceNote}`,
          });
        } catch (err: any) {
          if (err.message?.includes("already enrolled")) {
            setMessage({
              type: "error",
              text: `"${student.name}" (${normalizedRegNo}) is already enrolled in this course.`,
            });
          } else if (err.message?.includes("Serial number")) {
            setMessage({ type: "error", text: err.message });
          } else {
            throw err;
          }
        }
      } else {
        const faceNote = faceAutoEnrolled
          ? " · Face ID enrolled ✓"
          : photoUrl && faceStatus === "not-found"
            ? " · No face detected in photo"
            : "";
        setMessage({
          type: "success",
          text: `Student "${student.name}" registered successfully!${faceNote}`,
        });
      }

      setName("");
      setRegNo("");
      setEmail("");
      setSerialNumber("");
      setPhotoUrl("");
      setPhotoMode("none");
      setFaceEmbeddings([]);
      setFaceStatus("idle");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Registration failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="register-panel">
      <div className="panel-header">
        <div className="panel-icon">
          <UserPlus size={22} />
        </div>
        <div>
          <h2>Register New Student</h2>
          <p>Add a student and optionally enroll them in a course</p>
        </div>
      </div>

      {message && (
        <div
          className={
            message.type === "success" ? "success-alert" : "error-alert"
          }
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="register-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="stu-name">Full Name *</label>
            <input
              id="stu-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="stu-reg">Registration Number *</label>
            <input
              id="stu-reg"
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              placeholder="e.g. 2024CS001"
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="stu-email">Email (Optional)</label>
          <input
            id="stu-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@example.com"
          />
        </div>

        {/* Photo capture */}
        <div className="form-group">
          <label>Student Photo (Optional)</label>

          {/* Preview + face detection status */}
          {photoUrl && (
            <div className="photo-preview-wrap">
              <img src={photoUrl} alt="Student" className="photo-preview" />
              <button
                type="button"
                className="btn btn-sm btn-danger photo-clear-btn"
                onClick={clearPhoto}
                title="Remove photo"
              >
                <X size={14} /> Remove
              </button>
              {/* Face detection status badge */}
              <div style={{ marginTop: "0.5rem" }}>
                {faceStatus === "processing" && (
                  <span
                    style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                  >
                    🔍 Scanning for face...
                  </span>
                )}
                {faceStatus === "found" && (
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#22c55e",
                      fontWeight: 600,
                    }}
                  >
                    ✅ Face detected — will auto-enroll for attendance
                  </span>
                )}
                {faceStatus === "not-found" && (
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#f59e0b",
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ No face detected — manual enrollment required later
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Mode picker — only show when no photo yet */}
          {!photoUrl && (
            <>
              <div className="photo-mode-btns">
                <button
                  type="button"
                  className={`photo-mode-btn ${photoMode === "upload" ? "active" : ""}`}
                  onClick={() => handleModeChange("upload")}
                >
                  <Upload size={15} /> Upload File
                </button>
                <button
                  type="button"
                  className={`photo-mode-btn ${photoMode === "camera" ? "active" : ""}`}
                  onClick={() => handleModeChange("camera")}
                >
                  <Camera size={15} /> Live Camera
                </button>
              </div>

              {/* Upload mode */}
              {photoMode === "upload" && (
                <div className="photo-upload-zone">
                  <input
                    id="stu-photo-file"
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      // Guard: reject files over 4 MB before base64 encode (server limit is 5 MB)
                      if (file.size > 4 * 1024 * 1024) {
                        setMessage({
                          type: "error",
                          text: "Photo is too large. Please choose an image under 4 MB.",
                        });
                        e.target.value = "";
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = (ev) =>
                        setPhotoUrl(ev.target?.result as string);
                      reader.readAsDataURL(file);
                    }}
                  />
                  <label htmlFor="stu-photo-file" className="upload-label">
                    <Upload size={28} />
                    <span>Click to select a photo</span>
                    <span className="upload-hint">
                      JPG, PNG, WEBP — max 5 MB
                    </span>
                  </label>
                </div>
              )}

              {/* Camera mode */}
              {photoMode === "camera" && (
                <div className="camera-zone">
                  {cameraError ? (
                    <div
                      className="error-alert"
                      style={{ marginTop: "0.5rem" }}
                    >
                      {cameraError}
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        className="camera-video"
                        autoPlay
                        playsInline
                        muted
                      />
                      <canvas ref={canvasRef} style={{ display: "none" }} />
                      <div className="camera-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={snapPhoto}
                          disabled={!cameraActive || isCapturing}
                        >
                          <Camera size={16} />{" "}
                          {isCapturing ? "Capturing..." : "Snap Photo"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            stopCamera();
                            startCamera();
                          }}
                        >
                          <RefreshCw size={14} /> Retry
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="enroll-section">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={enrollInCourse}
              onChange={(e) => setEnrollInCourse(e.target.checked)}
              style={{ width: "auto", marginRight: "0.5rem" }}
            />
            Enroll this student in a course
          </label>

          {enrollInCourse && (
            <div className="form-group" style={{ marginTop: "0.75rem" }}>
              <label htmlFor="enroll-course">Select Course</label>
              {courses.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  No courses available.{" "}
                  <a href="/register">Create a course first.</a>
                </p>
              ) : (
                <>
                  <select
                    id="enroll-course"
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name} ({c.type === "LAB" ? "🧪 " : ""}
                        {c.slotPattern})
                      </option>
                    ))}
                  </select>

                  <div className="form-group" style={{ marginTop: "0.75rem" }}>
                    <label htmlFor="stu-serial">Serial Number *</label>
                    <input
                      id="stu-serial"
                      type="number"
                      min={1}
                      step={1}
                      value={serialNumber}
                      onChange={(e) => setSerialNumber(e.target.value)}
                      placeholder="e.g. 1"
                      required
                    />
                    <p className="field-hint">
                      This # is unique in the course and appears in attendance
                      grid cells and CSV export.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary submit-btn"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Registering..." : "Register Student"}
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────
// Bulk Import Students Tab
// ─────────────────────────────────────────
interface BulkImportResult {
  enrolled: number;
  skipped: number;
  failed: number;
  results: {
    row: number;
    registrationNumber: string;
    status: "enrolled" | "skipped" | "error";
    message?: string;
  }[];
}

function BulkImportStudents() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(
    null,
  );
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    fetchApi("/courses")
      .then((data) => {
        setCourses(data);
        if (data.length > 0) setSelectedCourseId(String(data[0].id));
      })
      .catch(console.error);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsParsing(true);
    setMessage(null);
    setImportResult(null);
    setParsedRows([]);
    setParseErrors([]);

    try {
      const { rows, errors } = await parseStudentsCsv(file);
      setFileName(file.name);
      setParsedRows(rows);
      setParseErrors(errors);
      if (rows.length === 0) {
        setMessage({
          type: "error",
          text: errors[0] || "No valid student rows found in the CSV.",
        });
      }
    } catch (err: any) {
      setFileName("");
      setMessage({
        type: "error",
        text: err.message || "Failed to read CSV file",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!selectedCourseId || parsedRows.length === 0) return;

    setIsImporting(true);
    setMessage(null);
    setImportResult(null);

    try {
      const result = await fetchApi("/enrollments/bulk", {
        method: "POST",
        body: JSON.stringify({
          courseId: parseInt(selectedCourseId),
          students: parsedRows.map((row) => ({
            registrationNumber: row.registrationNumber,
            name: row.name,
            serialNumber: row.serialNumber,
            email: row.email,
          })),
        }),
      });

      setImportResult(result);
      const course = courses.find((c) => String(c.id) === selectedCourseId);
      const courseLabel = course
        ? `${course.code} — ${course.name}`
        : "selected course";

      if (result.failed === 0 && result.enrolled > 0) {
        setMessage({
          type: "success",
          text: `Imported ${result.enrolled} student${result.enrolled === 1 ? "" : "s"} into ${courseLabel}.${result.skipped > 0 ? ` ${result.skipped} skipped (already enrolled).` : ""}`,
        });
        setParsedRows([]);
        setFileName("");
        setParseErrors([]);

        // Refresh courses to update any counts
        fetchApi("/courses")
          .then((data) => setCourses(data))
          .catch(console.error);
      } else if (result.enrolled > 0) {
        setMessage({
          type: "success",
          text: `Imported ${result.enrolled} student${result.enrolled === 1 ? "" : "s"}. ${result.failed} failed, ${result.skipped} skipped.`,
        });
        fetchApi("/courses").then(setCourses).catch(console.error);
      } else {
        setMessage({
          type: "error",
          text: `Import completed with no new enrollments. ${result.failed} failed, ${result.skipped} skipped.`,
        });
      }
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Bulk import failed",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const canImport =
    !!selectedCourseId &&
    parsedRows.length > 0 &&
    parseErrors.length === 0 &&
    !isImporting;

  return (
    <div className="register-panel">
      <div className="panel-header">
        <div className="panel-icon">
          <FileSpreadsheet size={22} />
        </div>
        <div>
          <h2>Bulk Import Students</h2>
          <p>
            Select a course and upload a CSV with Serial No, Regn No, and Name
            columns
          </p>
        </div>
      </div>

      {message && (
        <div
          className={
            message.type === "success" ? "success-alert" : "error-alert"
          }
        >
          {message.text}
        </div>
      )}

      <div className="register-form">
        <div className="enroll-section">
          <div className="form-group">
            <label htmlFor="bulk-course">Select Course *</label>
            {courses.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                No courses available. Create a course first.
              </p>
            ) : (
              <select
                id="bulk-course"
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name} ({c.type === "LAB" ? "🧪 " : ""}
                    {c.slotPattern})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="form-group">
          <label>Upload CSV File *</label>
          <p className="field-hint">
            Upload a CSV containing Serial No, Regn No, and Name. Email is optional.
          </p>
          <pre
            style={{
              fontSize: "0.8rem",
              background: "var(--bg-card)",
              padding: "0.5rem",
              borderRadius: "4px",
              border: "1px solid var(--border)",
              marginBottom: "1rem",
              color: "var(--text-muted)",
            }}
          >
            Serial No, Regn No, Name, Email (optional)
          </pre>
          <div className="csv-upload-zone">
            <input
              id="bulk-csv-file"
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={handleFileChange}
              disabled={isParsing || isImporting}
            />
            <label htmlFor="bulk-csv-file" className="upload-label">
              <FileSpreadsheet size={28} />
              <span>
                {isParsing
                  ? "Reading CSV..."
                  : fileName
                    ? fileName
                    : "Click to select a CSV file"}
              </span>
              <span className="upload-hint">CSV only</span>
            </label>
          </div>
        </div>

        {parseErrors.length > 0 && (
          <div className="error-alert">
            <strong>CSV validation errors:</strong>
            <ul className="import-error-list">
              {parseErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {parsedRows.length > 0 && (
          <div className="import-preview">
            <div className="import-preview-header">
              <span>
                Preview — {parsedRows.length} student
                {parsedRows.length === 1 ? "" : "s"}
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Serial No</th>
                    <th>Regn No</th>
                    <th>Name</th>
                    <th>Email (optional)</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row) => (
                    <tr key={`${row.registrationNumber}-${row.serialNumber}`}>
                      <td>#{row.serialNumber}</td>
                      <td style={{ fontFamily: "monospace", fontWeight: 600 }}>
                        {row.registrationNumber}
                      </td>
                      <td>{row.name}</td>
                      <td style={{ color: row.email ? undefined : 'var(--text-muted)' }}>{row.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {importResult &&
          importResult.results.some((r) => r.status === "error") && (
            <div className="import-results">
              <strong>Import details:</strong>
              <ul className="import-error-list">
                {importResult.results
                  .filter((r) => r.status !== "enrolled")
                  .map((r) => (
                    <li key={`${r.row}-${r.registrationNumber}`}>
                      Row {r.row} ({r.registrationNumber}):{" "}
                      {r.message || r.status}
                    </li>
                  ))}
              </ul>
            </div>
          )}

        <button
          type="button"
          className="btn btn-primary submit-btn"
          onClick={handleImport}
          disabled={!canImport}
        >
          {isImporting
            ? "Importing..."
            : `Import ${parsedRows.length > 0 ? parsedRows.length : ""} Student${parsedRows.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Manage Courses Tab
// ─────────────────────────────────────────
function ManageCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadCourses = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await fetchApi("/courses");
      setCourses(data);
    } catch (err: any) {
      setError(err.message || "Failed to load courses");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const handleDelete = async (id: number, code: string) => {
    if (
      !confirm(
        `Delete course "${code}" and all its enrollments/sessions? This cannot be undone.`,
      )
    )
      return;
    setDeletingId(id);
    try {
      await fetchApi(`/courses/${id}`, { method: "DELETE" });
      setCourses((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      alert(err.message || "Failed to delete course");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="register-panel">
      <div className="panel-header">
        <div className="panel-icon">
          <List size={22} />
        </div>
        <div>
          <h2>Manage Courses</h2>
          <p>View and delete existing courses</p>
        </div>
      </div>

      {error && <div className="error-alert">{error}</div>}

      {isLoading ? (
        <p style={{ color: "var(--text-muted)", padding: "1rem 0" }}>
          Loading...
        </p>
      ) : courses.length === 0 ? (
        <p style={{ color: "var(--text-muted)", padding: "1rem 0" }}>
          No courses found. Create one using the "Register Course" tab.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Slot Pattern</th>
                <th style={{ textAlign: "center" }}>Classes/Week</th>
                <th style={{ textAlign: "center" }}>Students</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => {
                const blocks = getBlocksForPattern(course.slotPattern);
                return (
                  <tr key={course.id}>
                    <td style={{ fontWeight: 600, fontFamily: "monospace" }}>
                      {course.code}
                    </td>
                    <td>{course.name}</td>
                    <td>
                      <span
                        className={`badge ${course.type === "LAB" ? "badge-info" : "badge-neutral"}`}
                      >
                        {course.type === "LAB" ? "🧪 Lab" : "📚 Theory"}
                      </span>
                    </td>
                    <td
                      style={{
                        fontFamily: "monospace",
                        color: "var(--primary)",
                        fontSize: "0.85rem",
                      }}
                    >
                      {course.slotPattern}
                    </td>
                    <td
                      style={{
                        color: "var(--text-muted)",
                        textAlign: "center",
                      }}
                    >
                      {blocks.length}
                    </td>
                    <td
                      style={{
                        color: "var(--text-muted)",
                        textAlign: "center",
                        fontWeight: 600,
                      }}
                    >
                      {course.studentCount ?? 0}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="icon-btn"
                        onClick={() => handleDelete(course.id, course.code)}
                        disabled={deletingId === course.id}
                        style={{ color: "var(--danger)" }}
                        title="Delete course"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Manage Students Tab
// ─────────────────────────────────────────
function ManageStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const navigate = useNavigate();

  // Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add photo modal state
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [photoStudent, setPhotoStudent] = useState<Student | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoMode, setPhotoMode] = useState<"none" | "upload" | "camera">(
    "none",
  );
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [faceEmbeddings, setFaceEmbeddings] = useState<number[][]>([]);
  const [faceStatus, setFaceStatus] = useState<
    "idle" | "processing" | "found" | "not-found"
  >("idle");
  const photoVideoRef = useRef<HTMLVideoElement>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement>(null);
  const photoStreamRef = useRef<MediaStream | null>(null);
  const photoModelsLoadedRef = useRef(false);

  const stopPhotoCamera = () => {
    if (photoStreamRef.current) {
      photoStreamRef.current.getTracks().forEach((t) => t.stop());
      photoStreamRef.current = null;
    }
    setCameraActive(false);
    setCameraError("");
  };

  const ensurePhotoModels = async () => {
    if (photoModelsLoadedRef.current) return;
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
    ]);
    photoModelsLoadedRef.current = true;
  };

  const extractPhotoEmbedding = async (dataUrl: string) => {
    setFaceStatus("processing");
    setFaceEmbeddings([]);
    try {
      await ensurePhotoModels();
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });
      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (detection && detection.detection.score > 0.85) {
        setFaceEmbeddings([Array.from(detection.descriptor)]);
        setFaceStatus("found");
      } else {
        setFaceStatus("not-found");
      }
    } catch {
      setFaceStatus("not-found");
    }
  };

  const startPhotoCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      photoStreamRef.current = stream;
      if (photoVideoRef.current) {
        photoVideoRef.current.srcObject = stream;
        photoVideoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError("Camera access denied or not available.");
    }
  };

  const snapPhotoForStudent = async () => {
    if (!photoVideoRef.current || !photoCanvasRef.current) return;
    const video = photoVideoRef.current;
    const canvas = photoCanvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setPhotoUrl(dataUrl);
    stopPhotoCamera();
    setPhotoMode("upload");
    await extractPhotoEmbedding(dataUrl);
  };

  const openPhotoModal = (student: Student) => {
    setPhotoStudent(student);
    setPhotoUrl("");
    setPhotoMode("none");
    setPhotoMessage(null);
    setFaceEmbeddings([]);
    setFaceStatus("idle");
    stopPhotoCamera();
    setIsPhotoModalOpen(true);
  };

  const closePhotoModal = () => {
    stopPhotoCamera();
    setIsPhotoModalOpen(false);
    setPhotoStudent(null);
    setPhotoUrl("");
    setPhotoMode("none");
    setPhotoMessage(null);
    setFaceEmbeddings([]);
    setFaceStatus("idle");
  };

  const handlePhotoModeChange = (mode: "upload" | "camera") => {
    stopPhotoCamera();
    setPhotoUrl("");
    setFaceEmbeddings([]);
    setFaceStatus("idle");
    setPhotoMode(mode);
    if (mode === "camera") {
      setTimeout(() => startPhotoCamera(), 100);
    }
  };

  const handleSavePhoto = async () => {
    if (!photoStudent || !photoUrl) return;
    setIsSavingPhoto(true);
    setPhotoMessage(null);
    try {
      await fetchApi(`/students/${photoStudent.id}`, {
        method: "PUT",
        body: JSON.stringify({ photoUrl }),
      });

      let faceNote = "";
      if (faceEmbeddings.length > 0) {
        try {
          await fetchApi(`/students/${photoStudent.id}/faces`, {
            method: "POST",
            body: JSON.stringify({
              embeddings: faceEmbeddings,
              modelName: "face-api.js-resnet34",
              modelVersion: "0.22.2",
            }),
          });
          faceNote = " Face ID enrolled.";
        } catch {
          faceNote = " Photo saved, but face enrollment failed.";
        }
      } else if (faceStatus === "not-found") {
        faceNote = " No face detected in photo.";
      }

      setPhotoMessage({
        type: "success",
        text: `Photo saved for ${photoStudent.name}.${faceNote}`,
      });
      await loadStudents();
      setTimeout(() => closePhotoModal(), 1200);
    } catch (err: any) {
      setPhotoMessage({
        type: "error",
        text: err.message || "Failed to save photo",
      });
    } finally {
      setIsSavingPhoto(false);
    }
  };

  useEffect(() => {
    return () => stopPhotoCamera();
  }, []);

  const loadStudents = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await fetchApi("/students");
      setStudents(data);
    } catch (err: any) {
      setError(err.message || "Failed to load students");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const handleDelete = async (id: number, name: string) => {
    if (
      !confirm(
        `Delete student "${name}" and all their enrollment/attendance records? This cannot be undone.`,
      )
    )
      return;
    setDeletingId(id);
    try {
      await fetchApi(`/students/${id}`, { method: "DELETE" });
      setStudents((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      alert(err.message || "Failed to delete student");
    } finally {
      setDeletingId(null);
    }
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setEditName(student.name);
    setEditEmail(student.email || "");
    setIsModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setIsSubmitting(true);
    try {
      await fetchApi(`/students/${editingStudent.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editName, email: editEmail }),
      });
      setIsModalOpen(false);
      loadStudents();
    } catch (err: any) {
      alert(err.message || "Failed to update student");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="register-panel">
      <div className="panel-header">
        <div className="panel-icon">
          <GraduationCap size={22} />
        </div>
        <div>
          <h2>Manage Students</h2>
          <p>View, edit, and delete registered students</p>
        </div>
      </div>

      {error && <div className="error-alert">{error}</div>}

      {isLoading ? (
        <p style={{ color: "var(--text-muted)", padding: "1rem 0" }}>
          Loading...
        </p>
      ) : students.length === 0 ? (
        <p style={{ color: "var(--text-muted)", padding: "1rem 0" }}>
          No students found. Register one using the "Register Student" tab.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "40px", textAlign: "center" }}>Photo</th>
                <th>Reg. No.</th>
                <th>Name / Email</th>
                <th>Enrolled Courses</th>
                <th style={{ textAlign: "right", width: "160px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td style={{ textAlign: "center" }}>
                    {student.photoUrl ? (
                      <img
                        src={student.photoUrl}
                        alt="Profile"
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          objectFit: "cover",
                          border: "2px solid var(--border-color)",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          backgroundColor: "var(--bg-secondary)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "2px solid var(--border-color)",
                          color: "var(--text-muted)",
                        }}
                      >
                        <UserPlus size={14} />
                      </div>
                    )}
                  </td>
                  <td
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  >
                    {student.registrationNumber}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{student.name}</div>
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.85rem",
                        marginTop: "2px",
                      }}
                    >
                      {student.email || "—"}
                    </div>
                  </td>
                  <td>
                    {student.enrolledCourses &&
                    student.enrolledCourses.length > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        {student.enrolledCourses.map((c) => (
                          <span
                            key={c.id}
                            style={{
                              fontSize: "0.75rem",
                              backgroundColor: "var(--bg-secondary)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              border: "1px solid var(--border-color)",
                              display: "inline-block",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "200px",
                            }}
                            title={`${c.code} — ${c.name}`}
                          >
                            <strong>{c.code}</strong> — {c.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.85rem",
                        }}
                      >
                        None
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        justifyContent: "flex-end",
                      }}
                    >
                      {!student.photoUrl && (
                        <button
                          className="icon-btn"
                          onClick={() => openPhotoModal(student)}
                          title="Add student photo"
                          style={{ color: "var(--success)" }}
                        >
                          <ImagePlus size={16} />
                        </button>
                      )}
                      <button
                        className="icon-btn"
                        onClick={() =>
                          navigate(`/students/${student.id}/enroll`)
                        }
                        title="Enroll Face"
                        style={{ color: "var(--primary)" }}
                      >
                        <Camera size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => openEditModal(student)}
                        title="Edit student"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => handleDelete(student.id, student.name)}
                        disabled={deletingId === student.id}
                        style={{ color: "var(--danger)" }}
                        title="Delete student"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Photo Modal */}
      <Modal
        isOpen={isPhotoModalOpen}
        onClose={closePhotoModal}
        title={
          photoStudent
            ? `Add Photo — ${photoStudent.name}`
            : "Add Student Photo"
        }
      >
        {photoMessage && (
          <div
            className={
              photoMessage.type === "success" ? "success-alert" : "error-alert"
            }
          >
            {photoMessage.text}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {photoStudent && (
            <p
              style={{
                margin: 0,
                fontSize: "0.85rem",
                color: "var(--text-muted)",
              }}
            >
              {photoStudent.registrationNumber}
              {photoStudent.enrolledCourses?.length
                ? ` · ${photoStudent.enrolledCourses.map((c) => c.code).join(", ")}`
                : ""}
            </p>
          )}

          {!photoUrl && (
            <div className="photo-mode-btns">
              <button
                type="button"
                className={`photo-mode-btn ${photoMode === "upload" ? "active" : ""}`}
                onClick={() => handlePhotoModeChange("upload")}
              >
                <Upload size={15} /> Upload File
              </button>
              <button
                type="button"
                className={`photo-mode-btn ${photoMode === "camera" ? "active" : ""}`}
                onClick={() => handlePhotoModeChange("camera")}
              >
                <Camera size={15} /> Live Camera
              </button>
            </div>
          )}

          {photoUrl && (
            <div className="photo-preview-wrap">
              <img
                src={photoUrl}
                alt="Student preview"
                className="photo-preview"
              />
              <button
                type="button"
                className="btn btn-sm btn-danger photo-clear-btn"
                onClick={() => {
                  stopPhotoCamera();
                  setPhotoUrl("");
                  setPhotoMode("none");
                  setFaceEmbeddings([]);
                  setFaceStatus("idle");
                }}
              >
                <X size={14} /> Remove
              </button>
              <div style={{ marginTop: "0.5rem" }}>
                {faceStatus === "processing" && (
                  <span
                    style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                  >
                    Scanning for face...
                  </span>
                )}
                {faceStatus === "found" && (
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#22c55e",
                      fontWeight: 600,
                    }}
                  >
                    Face detected — will auto-enroll for attendance
                  </span>
                )}
                {faceStatus === "not-found" && (
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#f59e0b",
                      fontWeight: 600,
                    }}
                  >
                    No face detected — manual face enrollment still available
                  </span>
                )}
              </div>
            </div>
          )}

          {photoMode === "upload" && !photoUrl && (
            <div className="photo-upload-zone">
              <input
                type="file"
                id="manage-stu-photo-file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 4 * 1024 * 1024) {
                    setPhotoMessage({
                      type: "error",
                      text: "Photo must be under 4 MB.",
                    });
                    e.target.value = "";
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const dataUrl = ev.target?.result as string;
                    setPhotoUrl(dataUrl);
                    extractPhotoEmbedding(dataUrl);
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <label htmlFor="manage-stu-photo-file" className="upload-label">
                <Upload size={28} />
                <span>Click to select a photo</span>
                <span className="upload-hint">JPG, PNG, WEBP — max 4 MB</span>
              </label>
            </div>
          )}

          {photoMode === "camera" && !photoUrl && (
            <div className="camera-zone">
              {cameraError ? (
                <div className="error-alert">{cameraError}</div>
              ) : (
                <>
                  <video
                    ref={photoVideoRef}
                    className="camera-video"
                    autoPlay
                    playsInline
                    muted
                  />
                  <canvas ref={photoCanvasRef} style={{ display: "none" }} />
                  <div className="camera-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={snapPhotoForStudent}
                      disabled={!cameraActive}
                    >
                      <Camera size={16} /> Snap Photo
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        stopPhotoCamera();
                        startPhotoCamera();
                      }}
                    >
                      <RefreshCw size={14} /> Retry
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div
            className="modal-form-actions"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closePhotoModal}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSavePhoto}
              disabled={!photoUrl || isSavingPhoto}
            >
              {isSavingPhoto ? "Saving..." : "Save Photo"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Student Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Edit Student"
      >
        <form
          onSubmit={handleEditSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <div className="form-group">
            <label>Registration Number</label>
            <input
              value={editingStudent?.registrationNumber || ""}
              disabled
              style={{ opacity: 0.7, cursor: "not-allowed" }}
            />
          </div>
          <div className="form-group">
            <label>Full Name</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Email (Optional)</label>
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
            />
          </div>

          <div
            className="modal-form-actions"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
              marginTop: "1rem",
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
