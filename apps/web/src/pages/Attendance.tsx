import { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import {
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Scan,
  UserCheck,
  LayoutList,
  LayoutGrid,
  Download,
} from "lucide-react";
import { exportToCsv } from "../lib/exportUtils";
import { getBlocksForPattern } from "@attendance/shared";
import type { DayOfWeek } from "@attendance/shared";
import { FaceScanner } from "../components/FaceScanner";
import "./Attendance.css";

interface Course {
  id: number;
  code: string;
  name: string;
  type: string;
  slotPattern: string;
}

interface AttendanceRecord {
  id: number;
  sessionId: number;
  studentId: number;
  status: "PRESENT" | "ABSENT" | "NOT_MARKED";
  method: string | null;
  confidence: number | null;
  serialNumber: number | null;
  markedAt: string | null;
  student: {
    id: number;
    name: string;
    registrationNumber: string;
    photoUrl?: string;
  } | null;
}

interface Session {
  id: number;
  courseId: number;
  slotCode: string;
  date: string;
  status: "ONGOING" | "FINALIZED";
}

type Step = "setup" | "session";
type StudentListView = "detail" | "grid";

const JS_DAY_TO_TIMETABLE: Record<number, DayOfWeek | null> = {
  0: null,
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: null,
};

export function Attendance() {
  // ── Step 1: Setup ──
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [isStarting, setIsStarting] = useState(false);
  const [setupError, setSetupError] = useState("");

  // ── Step 2: Session ──
  const [step, setStep] = useState<Step>("setup");
  const [session, setSession] = useState<Session | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [isMarkingAllAbsent, setIsMarkingAllAbsent] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [studentListView, setStudentListView] =
    useState<StudentListView>("detail");

  // Sync and online status effect
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const { syncPendingMarks } = await import("../lib/syncService");
      const count = await syncPendingMarks();
      if (count > 0) {
        // Refresh session to get updated records from server
        if (session) await loadSession(session.id);
      }
      checkPending();
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check and sync
    const checkPending = async () => {
      const { getPendingMarks } = await import("../lib/offlineQueue");
      const marks = await getPendingMarks();
      setPendingCount(marks.length);
    };
    checkPending();

    if (navigator.onLine) {
      handleOnline();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [session?.id]);

  useEffect(() => {
    fetchApi("/courses")
      .then((c) => {
        setCourses(c);
        if (c.length > 0) setSelectedCourseId(String(c[0].id));
      })
      .catch(console.error)
      .finally(() => setIsLoadingCourses(false));
  }, []);

  const activeCourse = courses.find((c) => String(c.id) === selectedCourseId);
  const dayOfWeek: DayOfWeek | null = selectedDate
    ? (JS_DAY_TO_TIMETABLE[new Date(selectedDate + "T00:00:00").getDay()] ??
      null)
    : null;

  const activeBlocks =
    activeCourse && dayOfWeek
      ? getBlocksForPattern(activeCourse.slotPattern).filter(
          (b) => b.day === dayOfWeek,
        )
      : [];

  const loadSession = async (sessionId: number) => {
    const data = await fetchApi(`/sessions/${sessionId}`);
    setSession(data.session);
    setRecords(data.records);
    setCourse(data.course);
  };

  const handleStartSession = async () => {
    if (!selectedCourseId || !selectedDate) {
      setSetupError("Please fill in all fields.");
      return;
    }
    if (activeBlocks.length === 0) {
      setSetupError(
        "This course has no classes scheduled on the selected date.",
      );
      return;
    }
    setIsStarting(true);
    setSetupError("");
    try {
      const slotCode = activeBlocks[0].code;
      const data = await fetchApi("/sessions", {
        method: "POST",
        body: JSON.stringify({
          courseId: parseInt(selectedCourseId),
          slotCode,
          date: selectedDate,
        }),
      });
      await loadSession(data.session.id);
      setStep("session");
    } catch (err: any) {
      setSetupError(err.message || "Failed to start session");
    } finally {
      setIsStarting(false);
    }
  };

  // Unified mark function — method can be 'MANUAL' or 'FACE'
  const markAttendance = async (
    studentId: number,
    status: "PRESENT" | "ABSENT" | "NOT_MARKED",
    method: "MANUAL" | "FACE" = "MANUAL",
    confidence?: number,
  ) => {
    if (!session) return;
    setMarkingId(studentId);
    try {
      const isOffline = !navigator.onLine;

      if (isOffline) {
        // Import dynamically to avoid top-level await issues if any
        const { queueMark } = await import("../lib/offlineQueue");
        await queueMark({
          sessionId: session.id,
          studentId,
          status,
          method,
          confidence: confidence ?? null,
          markedAt: new Date().toISOString(),
        });
        // Update local state immediately
        setRecords((prev) =>
          prev.map((r) =>
            r.studentId === studentId
              ? {
                  ...r,
                  status,
                  method,
                  confidence: confidence ?? null,
                  markedAt: new Date().toISOString(),
                }
              : r,
          ),
        );
        setPendingCount((prev) => prev + 1);
      } else {
        await fetchApi(`/sessions/${session.id}/records/${studentId}`, {
          method: "PATCH",
          body: JSON.stringify({
            status,
            method,
            confidence: confidence ?? null,
          }),
        });
        setRecords((prev) =>
          prev.map((r) =>
            r.studentId === studentId
              ? {
                  ...r,
                  status,
                  method,
                  confidence: confidence ?? null,
                  markedAt: new Date().toISOString(),
                }
              : r,
          ),
        );
      }
    } catch (err: any) {
      alert(err.message || "Failed to mark attendance");
    } finally {
      setMarkingId(null);
    }
  };

  const cycleGridStatus = (
    status: AttendanceRecord["status"],
  ): AttendanceRecord["status"] => {
    if (status === "NOT_MARKED") return "PRESENT";
    if (status === "PRESENT") return "ABSENT";
    return "NOT_MARKED";
  };

  const handleGridCellTap = (record: AttendanceRecord) => {
    if (session?.status === "FINALIZED") return;
    markAttendance(record.studentId, cycleGridStatus(record.status), "MANUAL");
  };

  // Mark all still-unmarked students as ABSENT at once
  const handleMarkAllAbsent = async () => {
    if (!session) return;
    const unmarked = records.filter((r) => r.status === "NOT_MARKED");
    if (unmarked.length === 0) return;
    if (!confirm(`Mark ${unmarked.length} unmarked student(s) as ABSENT?`))
      return;
    setIsMarkingAllAbsent(true);
    for (const r of unmarked) {
      await markAttendance(r.studentId, "ABSENT", "MANUAL");
    }
    setIsMarkingAllAbsent(false);
  };

  const handleExportCsv = () => {
    if (!session || !course || records.length === 0) return;
    exportToCsv(records, session.date, course.code);
  };

  const presentCount = records.filter((r) => r.status === "PRESENT").length;
  const absentCount = records.filter((r) => r.status === "ABSENT").length;
  const unmarkedCount = records.filter((r) => r.status === "NOT_MARKED").length;
  const totalCount = records.length;
  const markedPct =
    totalCount > 0
      ? Math.round(((presentCount + absentCount) / totalCount) * 100)
      : 0;
  const isFinalized = session?.status === "FINALIZED";
  const gridRecords = [...records].sort(
    (a, b) => (a.serialNumber ?? 0) - (b.serialNumber ?? 0),
  );

  // ── Setup Screen ──
  if (step === "setup") {
    return (
      <div className="attendance-setup">
        <div className="page-header">
          <div>
            <h1>Daily Attendance</h1>
            <p>Select a date and course to begin an attendance session</p>
          </div>
        </div>

        <div className="setup-card page-card">
          <div className="setup-icon">
            <CalendarDays size={32} />
          </div>
          <h2>Start Attendance Session</h2>

          {setupError && <div className="error-alert">{setupError}</div>}

          {courses.length === 0 && !isLoadingCourses ? (
            <div className="empty-hint">
              No courses found. <a href="/register">Create a course first →</a>
            </div>
          ) : (
            <div className="setup-form">
              <div className="form-group">
                <label htmlFor="att-date">Date</label>
                <input
                  id="att-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="att-course">Course</label>
                <select
                  id="att-course"
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  disabled={isLoadingCourses}
                >
                  {isLoadingCourses ? (
                    <option>Loading courses...</option>
                  ) : (
                    courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name} ({c.slotPattern})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>
                  Classes on {dayOfWeek || "..."} ({selectedDate})
                </label>
                {isLoadingCourses ? (
                  <div className="schedule-empty">Loading slots...</div>
                ) : activeCourse && dayOfWeek ? (
                  activeBlocks.length > 0 ? (
                    <div className="scheduled-blocks">
                      {activeBlocks.map((b, i) => (
                        <div key={i} className="schedule-slot-chip">
                          <Clock size={15} />
                          <strong>{b.code}</strong>
                          <span className="slot-time">
                            {b.startTime} – {b.endTime}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="schedule-empty">
                      No classes scheduled on {dayOfWeek} for this course.
                    </div>
                  )
                ) : (
                  <div className="schedule-empty">
                    Select a course and a valid weekday to view scheduled
                    classes.
                  </div>
                )}
              </div>

              <button
                className="btn btn-primary btn-cta start-btn"
                onClick={handleStartSession}
                disabled={
                  isStarting || isLoadingCourses || activeBlocks.length === 0
                }
              >
                {isStarting ? (
                  "Starting..."
                ) : (
                  <>
                    {" "}
                    Start Session <ChevronRight size={18} />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Session Screen ──
  const sessionBlock =
    course && session
      ? getBlocksForPattern(course.slotPattern).find(
          (b) => b.code === session.slotCode,
        )
      : null;

  return (
    <div className="attendance-session">
      {/* Header */}
      <div className="session-header page-header">
        <div>
          <h1>
            {course?.code} — {course?.name}
          </h1>
          <p>
            {session?.slotCode}
            {sessionBlock
              ? ` · ${sessionBlock.startTime}–${sessionBlock.endTime}`
              : ""}
            {` · ${session?.date}`}
            {isFinalized && (
              <span
                className="badge badge-success"
                style={{ marginLeft: "0.5rem" }}
              >
                Finalized
              </span>
            )}
          </p>
        </div>
        <div className="session-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setStep("setup")}
          >
            ← Back
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExportCsv}
            disabled={records.length === 0}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="session-body">
        {/* Offline & Sync Status Banner */}
        {(!isOnline || pendingCount > 0) && (
          <div
            className={`sync-banner ${isOnline ? "sync-banner--online" : "sync-banner--offline"}`}
          >
            <div className="sync-banner-inner">
              {!isOnline ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
              <strong>{!isOnline ? "You are offline." : "Back online."}</strong>
              <span>Attendance marks will be saved locally.</span>
            </div>
            {pendingCount > 0 && (
              <span className="sync-banner-pending">
                {pendingCount} mark(s) pending sync...
              </span>
            )}
          </div>
        )}

        {/* Summary stats + progress bar */}
        <div className="att-session-top">
          <div className="att-summary">
            <div className="att-stat present">
              <span>{presentCount}</span> Present
            </div>
            <div className="att-stat absent">
              <span>{absentCount}</span> Absent
            </div>
            <div className="att-stat unmarked">
              <span>{unmarkedCount}</span> Not Marked
            </div>
          </div>

          {totalCount > 0 && (
            <div className="att-progress">
              <div className="att-progress-labels">
                <span>
                  {presentCount + absentCount} of {totalCount} marked
                </span>
                <span>{markedPct}%</span>
              </div>
              <div className="att-progress-track">
                <div
                  className={`att-progress-fill ${markedPct === 100 ? "is-complete" : ""}`}
                  style={{ width: `${markedPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Face scanner — between progress bar and student list on mobile */}
        <div className="camera-panel page-card">
          {session && (
            <FaceScanner
              sessionId={session.id}
              records={records}
              onMatch={(studentId) =>
                markAttendance(studentId, "PRESENT", "FACE")
              }
            />
          )}
        </div>

        {/* Student list */}
        <div className={`att-session-students view-${studentListView}`}>
          {records.length > 0 && (
            <div
              className="att-view-toggle"
              role="tablist"
              aria-label="Student list view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={studentListView === "detail"}
                className={`att-view-toggle-btn ${studentListView === "detail" ? "active" : ""}`}
                onClick={() => setStudentListView("detail")}
              >
                <LayoutList size={15} />
                Detail
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={studentListView === "grid"}
                className={`att-view-toggle-btn ${studentListView === "grid" ? "active" : ""}`}
                onClick={() => setStudentListView("grid")}
              >
                <LayoutGrid size={15} />
                Grid
              </button>
            </div>
          )}

          {unmarkedCount > 0 && studentListView === "detail" && (
            <div className="mark-all-absent">
              <button
                className="btn btn-sm btn-secondary"
                onClick={handleMarkAllAbsent}
                disabled={isMarkingAllAbsent}
              >
                <XCircle size={13} />
                {isMarkingAllAbsent
                  ? "Marking..."
                  : `Mark ${unmarkedCount} remaining as Absent`}
              </button>
            </div>
          )}

          {records.length === 0 ? (
            <div
              className="empty-hint"
              style={{ padding: "2rem", textAlign: "center" }}
            >
              No students enrolled in this course yet.
            </div>
          ) : (
            <>
              <div className="student-grid">
                {records.map((r) => (
                  <div
                    key={r.studentId}
                    className={`student-card status-${r.status.toLowerCase()}`}
                  >
                    <div
                      className="student-avatar"
                      style={{ overflow: "hidden", flexShrink: 0 }}
                    >
                      {r.student?.photoUrl ? (
                        <img
                          src={r.student.photoUrl}
                          alt={r.student.name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: "50%",
                          }}
                        />
                      ) : (
                        (r.student?.name.charAt(0).toUpperCase() ?? "?")
                      )}
                    </div>

                    <div className="student-info">
                      <span className="student-name">
                        {r.student?.name ?? "Unknown"}
                      </span>
                      <span className="student-reg">
                        {r.student?.registrationNumber}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          marginTop: "0.1rem",
                        }}
                      >
                        {r.serialNumber && (
                          <span className="student-serial">
                            #{r.serialNumber}
                          </span>
                        )}
                        {r.method === "FACE" && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 2,
                              fontSize: "0.65rem",
                              background: "rgba(31,92,58,0.15)",
                              color: "var(--primary)",
                              padding: "1px 6px",
                              borderRadius: 10,
                              fontWeight: 600,
                            }}
                          >
                            <Scan size={9} /> FACE
                          </span>
                        )}
                        {r.method === "MANUAL" && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 2,
                              fontSize: "0.65rem",
                              background: "rgba(148,163,184,0.15)",
                              color: "var(--text-muted)",
                              padding: "1px 6px",
                              borderRadius: 10,
                              fontWeight: 600,
                            }}
                          >
                            <UserCheck size={9} /> MANUAL
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="att-buttons">
                      <button
                        className={`btn btn-sm ${r.status === "PRESENT" ? "btn-success" : "btn-secondary"}`}
                        onClick={() =>
                          markAttendance(
                            r.studentId,
                            r.status === "PRESENT" ? "NOT_MARKED" : "PRESENT",
                            "MANUAL",
                          )
                        }
                        disabled={markingId === r.studentId}
                        title={
                          r.status === "PRESENT"
                            ? "Undo Present"
                            : "Mark Present"
                        }
                      >
                        <CheckCircle2 size={15} />
                      </button>
                      <button
                        className={`btn btn-sm ${r.status === "ABSENT" ? "btn-danger" : "btn-secondary"}`}
                        onClick={() =>
                          markAttendance(
                            r.studentId,
                            r.status === "ABSENT" ? "NOT_MARKED" : "ABSENT",
                            "MANUAL",
                          )
                        }
                        disabled={markingId === r.studentId}
                        title={
                          r.status === "ABSENT" ? "Undo Absent" : "Mark Absent"
                        }
                      >
                        <XCircle size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="attendance-seat-grid"
                aria-label="Student seat grid"
              >
                {gridRecords.map((r) => (
                  <button
                    key={r.studentId}
                    type="button"
                    className={`seat-cell status-${r.status.toLowerCase()}${markingId === r.studentId ? " is-marking" : ""}`}
                    title={`${r.student?.name ?? "Student"} — tap to cycle attendance`}
                    disabled={isFinalized || markingId === r.studentId}
                    onClick={() => handleGridCellTap(r)}
                  >
                    #{r.serialNumber ?? "?"}
                  </button>
                ))}
              </div>
              <p className="seat-grid-hint">
                Tap a cell to cycle: Not marked → Present → Absent
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
