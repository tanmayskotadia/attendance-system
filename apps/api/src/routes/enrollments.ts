import { Router, Request, Response } from "express";
import { db } from "../prisma/db.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();

// GET /api/enrollments?courseId=  (any auth) — returns enriched data
router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const courseId = req.query.courseId
      ? parseInt(req.query.courseId as string)
      : undefined;
    try {
      const enrollments = courseId
        ? await db.orm.public.Enrollment.where({ courseId }).all()
        : await db.orm.public.Enrollment.all();

      // Enrich with student + course data
      const enriched = await Promise.all(
        enrollments.map(async (e) => {
          const [student, course] = await Promise.all([
            db.orm.public.Student.first({ id: e.studentId }),
            db.orm.public.Course.first({ id: e.courseId }),
          ]);
          return {
            id: e.id,
            courseId: e.courseId,
            studentId: e.studentId,
            serialNumber: e.serialNumber,
            enrolledAt: e.enrolledAt,
            student: student
              ? {
                  id: student.id,
                  name: student.name,
                  registrationNumber: student.registrationNumber,
                  photoUrl: student.photoUrl,
                }
              : null,
            course: course
              ? {
                  id: course.id,
                  code: course.code,
                  name: course.name,
                  slotPattern: course.slotPattern,
                }
              : null,
          };
        }),
      );
      res.json(enriched);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch enrollments" });
    }
  },
);

interface BulkStudentInput {
  registrationNumber: string;
  name: string;
  serialNumber: number;
  email?: string;
}

// POST /api/enrollments/bulk  (Admin) — register and enroll many students in one course
router.post(
  "/bulk",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { courseId, students } = req.body as {
      courseId?: number;
      students?: BulkStudentInput[];
    };

    if (!courseId || !Array.isArray(students) || students.length === 0) {
      res.status(400).json({
        error: "courseId and a non-empty students array are required",
      });
      return;
    }

    try {
      const course = await db.orm.public.Course.where({ id: courseId }).first();
      if (!course) {
        res.status(404).json({ error: "Course not found" });
        return;
      }

      type RowResult = {
        row: number;
        registrationNumber: string;
        status: "enrolled" | "skipped" | "error";
        message?: string;
      };

      let enrolled = 0;
      let skipped = 0;
      let failed = 0;
      const results: RowResult[] = [];

      // Safe transaction wrapper, works with $transaction or transaction, fallback to db
      const runTransaction = (db as any).$transaction
        ? (cb: any) => (db as any).$transaction(cb)
        : (db as any).transaction
          ? (cb: any) => (db as any).transaction(cb)
          : (cb: any) => cb(db);

      await runTransaction(async (tx: any) => {
        const existingEnrollments = await tx.orm.public.Enrollment.where({
          courseId,
        }).all();
        const usedSerials = new Set(
          existingEnrollments
            .map((e: any) => e.serialNumber)
            .filter((n: any) => n != null),
        );

        const enrolledRegNos = new Set<string>();
        for (const enrollment of existingEnrollments) {
          const student = await tx.orm.public.Student.where({
            id: enrollment.studentId,
          }).first();
          if (student)
            enrolledRegNos.add(student.registrationNumber.toUpperCase());
        }

        for (let i = 0; i < students.length; i++) {
          const input = students[i];
          const row = i + 1;
          const normalizedRegNo =
            input.registrationNumber?.trim().toUpperCase() ?? "";
          const name = input.name?.trim() ?? "";
          const serialNumber = input.serialNumber;

          if (!normalizedRegNo || !name) {
            failed++;
            results.push({
              row,
              registrationNumber: normalizedRegNo || "?",
              status: "error",
              message: "Regn No and Name are required",
            });
            continue; // Note: In a strict transaction, if any row fails, we might want to throw to rollback all.
            // But the user said "Rows skipped/failed with the reason" and "show a clear result"
            // So we only rollback on severe DB errors, while validation failures just skip the row.
          }

          if (!Number.isInteger(serialNumber) || serialNumber < 1) {
            failed++;
            results.push({
              row,
              registrationNumber: normalizedRegNo,
              status: "error",
              message: "Invalid serial number",
            });
            continue;
          }

          if (usedSerials.has(serialNumber)) {
            failed++;
            results.push({
              row,
              registrationNumber: normalizedRegNo,
              status: "error",
              message: `Serial number #${serialNumber} is already used in this course`,
            });
            continue;
          }

          if (enrolledRegNos.has(normalizedRegNo)) {
            skipped++;
            results.push({
              row,
              registrationNumber: normalizedRegNo,
              status: "skipped",
              message: "Already enrolled in this course",
            });
            continue;
          }

          let student = await tx.orm.public.Student.where({
            registrationNumber: normalizedRegNo,
          }).first();
          if (!student) {
            student = await tx.orm.public.Student.create({
              registrationNumber: normalizedRegNo,
              name,
              email: input.email || null,
              photoUrl: null,
              isActive: true,
            });
          } else {
            const updates: any = {};
            if (name && student.name !== name) updates.name = name;
            if (input.email && student.email !== input.email)
              updates.email = input.email;

            if (Object.keys(updates).length > 0) {
              student = await tx.orm.public.Student.where({
                id: student.id,
              }).update(updates);
            }
          }

          const dupEnrollment = await tx.orm.public.Enrollment.where({
            courseId,
            studentId: student.id,
          }).first();

          if (dupEnrollment) {
            skipped++;
            enrolledRegNos.add(normalizedRegNo);
            results.push({
              row,
              registrationNumber: normalizedRegNo,
              status: "skipped",
              message: "Already enrolled in this course",
            });
            continue;
          }

          await tx.orm.public.Enrollment.create({
            courseId,
            studentId: student.id,
            serialNumber,
          });

          usedSerials.add(serialNumber);
          enrolledRegNos.add(normalizedRegNo);
          enrolled++;
          results.push({
            row,
            registrationNumber: normalizedRegNo,
            status: "enrolled",
          });
        }
      });

      res.json({ enrolled, skipped, failed, results });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Bulk import failed or rolled back" });
    }
  },
);

// POST /api/enrollments  (Admin) — enroll a student in a course
// A student (by normalized registration number) must be unique within a course,
// but the same student can be enrolled in multiple different courses.
router.post(
  "/",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { courseId, studentId, serialNumber: requestedSerial } = req.body;
    if (!courseId || !studentId) {
      res.status(400).json({ error: "courseId and studentId are required" });
      return;
    }
    try {
      // Check for duplicate enrollment (same student, same course)
      const dup = await db.orm.public.Enrollment.where({
        courseId,
        studentId,
      }).first();
      if (dup) {
        res
          .status(409)
          .json({ error: "Student already enrolled in this course" });
        return;
      }

      // Also enforce: no two enrollments in the same course can share the same registrationNumber.
      // Since registrationNumber is on Student and is already normalized to uppercase, we just
      // check if another student with the same registrationNumber is already enrolled in this course.
      const student = await db.orm.public.Student.where({
        id: studentId,
      }).first();
      if (!student) {
        res.status(404).json({ error: "Student not found" });
        return;
      }

      const existingEnrollmentsInCourse = await db.orm.public.Enrollment.where({
        courseId,
      }).all();
      for (const e of existingEnrollmentsInCourse) {
        const s = await db.orm.public.Student.where({
          id: e.studentId,
        }).first();
        if (
          s &&
          s.registrationNumber.toUpperCase() ===
            student.registrationNumber.toUpperCase()
        ) {
          res.status(409).json({
            error: `Registration number "${student.registrationNumber}" is already enrolled in this course`,
          });
          return;
        }
      }

      let serialNumber: number;
      if (
        requestedSerial !== undefined &&
        requestedSerial !== null &&
        requestedSerial !== ""
      ) {
        const parsed = parseInt(String(requestedSerial), 10);
        if (!Number.isInteger(parsed) || parsed < 1) {
          res
            .status(400)
            .json({ error: "serialNumber must be a positive whole number" });
          return;
        }
        const serialTaken = existingEnrollmentsInCourse.some(
          (e) => e.serialNumber === parsed,
        );
        if (serialTaken) {
          res.status(409).json({
            error: `Serial number #${parsed} is already assigned in this course`,
          });
          return;
        }
        serialNumber = parsed;
      } else {
        // Auto-assign next serial within the course using MAX to avoid gaps after deletions
        const maxSerial = existingEnrollmentsInCourse.reduce(
          (max, e) => Math.max(max, e.serialNumber ?? 0),
          0,
        );
        serialNumber = maxSerial + 1;
      }

      const enrollment = await db.orm.public.Enrollment.create({
        courseId,
        studentId,
        serialNumber,
      });
      res.status(201).json(enrollment);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to enroll student" });
    }
  },
);

// DELETE /api/enrollments/:id  (Admin) — remove enrollment
router.delete(
  "/:id",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    try {
      const existing = await db.orm.public.Enrollment.where({ id }).first();
      if (!existing) {
        res.status(404).json({ error: "Enrollment not found" });
        return;
      }

      // Clean up AttendanceRecord rows for this student in ONGOING sessions of this course.
      // FINALIZED sessions are left intact to preserve historical data.
      const ongoingSessions = await db.orm.public.AttendanceSession.where({
        courseId: existing.courseId,
        status: "ONGOING",
      }).all();
      for (const session of ongoingSessions) {
        await db.orm.public.AttendanceRecord.where({
          sessionId: session.id,
          studentId: existing.studentId,
        }).delete();
      }

      await db.orm.public.Enrollment.where({ id }).delete();
      res.json({ message: "Enrollment removed" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to remove enrollment" });
    }
  },
);

export default router;
