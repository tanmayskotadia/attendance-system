import { Router, Request, Response } from "express";
import { db } from "../prisma/db.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();

// GET /api/students  (any auth)
router.get(
  "/",
  requireAuth,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const students = await db.orm.public.Student.where({
        isActive: true,
      }).all();

      // Enrich with enrolled courses
      const enriched = await Promise.all(
        students.map(async (student) => {
          const enrollments = await db.orm.public.Enrollment.where({
            studentId: student.id,
          }).all();
          const enrolledCourses = await Promise.all(
            enrollments.map(async (e) => {
              const course = await db.orm.public.Course.first({
                id: e.courseId,
              });
              return course
                ? {
                    id: course.id,
                    code: course.code,
                    name: course.name,
                    type: course.type,
                  }
                : null;
            }),
          );
          return {
            ...student,
            enrolledCourses: enrolledCourses.filter(Boolean),
          };
        }),
      );

      res.json(enriched);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch students" });
    }
  },
);

// GET /api/students/:id
router.get(
  "/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    try {
      const student = await db.orm.public.Student.where({
        id,
        isActive: true,
      }).first();
      if (!student) {
        res.status(404).json({ error: "Student not found" });
        return;
      }
      res.json(student);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch student" });
    }
  },
);

// POST /api/students  (Admin only)
// If a student with the same registration number already exists, we REUSE that record
// (same student can enroll in multiple courses). Returns 201 for new, 200 for existing.
router.post(
  "/",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { registrationNumber, name, email, photoUrl } = req.body;
    if (!registrationNumber || !name) {
      res
        .status(400)
        .json({ error: "registrationNumber and name are required" });
      return;
    }

    // Normalize: trim whitespace, convert to uppercase for consistent storage
    const normalizedRegNo = registrationNumber.trim().toUpperCase();

    try {
      const existing = await db.orm.public.Student.where({
        registrationNumber: normalizedRegNo,
      }).first();
      if (existing) {
        const updates: Record<string, any> = {};
        const trimmedName = name.trim();
        const trimmedEmail = email?.trim() || null;
        if (trimmedName && existing.name !== trimmedName)
          updates.name = trimmedName;
        if (trimmedEmail && existing.email !== trimmedEmail)
          updates.email = trimmedEmail;

        if (Object.keys(updates).length > 0) {
          await db.orm.public.Student.where({ id: existing.id }).update(
            updates,
          );
        }

        // Return the existing student so the caller can proceed with enrollment
        res.status(200).json({ ...existing, ...updates, _reused: true });
        return;
      }

      const student = await db.orm.public.Student.create({
        registrationNumber: normalizedRegNo,
        name: name.trim(),
        email: email?.trim() || null,
        photoUrl: photoUrl || null,
        isActive: true,
      });
      res.status(201).json(student);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create student" });
    }
  },
);

// PUT /api/students/:id  (Admin only)
router.put(
  "/:id",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    const { name, email, photoUrl } = req.body;
    try {
      const existing = await db.orm.public.Student.where({
        id,
        isActive: true,
      }).first();
      if (!existing) {
        res.status(404).json({ error: "Student not found" });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (name) updates.name = name;
      if (email !== undefined) updates.email = email || null;
      if (photoUrl !== undefined) updates.photoUrl = photoUrl || null;

      await db.orm.public.Student.where({ id }).update(updates);
      res.json({ message: "Student updated" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update student" });
    }
  },
);

// DELETE /api/students/:id  (Admin only) — hard delete
router.delete(
  "/:id",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    try {
      // Manually delete related records first to avoid foreign key constraints
      await db.orm.public.AttendanceRecord.where({ studentId: id }).delete();
      await db.orm.public.Enrollment.where({ studentId: id }).delete();
      await db.orm.public.FaceTemplate.where({ studentId: id }).delete();

      // Finally delete the student
      await db.orm.public.Student.where({ id }).delete();
      res.json({ message: "Student deleted from database" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete student" });
    }
  },
);

// POST /api/students/:id/faces  (Admin only)
router.post(
  "/:id/faces",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    const { embeddings, modelName, modelVersion } = req.body;

    if (!embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
      res.status(400).json({ error: "embeddings array is required" });
      return;
    }

    try {
      // Verify student exists
      const student = await db.orm.public.Student.where({
        id,
        isActive: true,
      }).first();
      if (!student) {
        res.status(404).json({ error: "Student not found" });
        return;
      }

      // Delete existing active templates for a clean start
      await db.orm.public.FaceTemplate.where({ studentId: id }).delete();

      // Insert new templates
      for (const embedding of embeddings) {
        await db.orm.public.FaceTemplate.create({
          studentId: id,
          embedding: JSON.stringify(embedding), // Ensure it's stored as valid JSON
          modelName: modelName || "face-api.js-resnet34",
          modelVersion: modelVersion || "0.22.2",
          isActive: true,
        });
      }

      const admin = (req as any).user as { userId: number };
      await db.orm.public.AuditLog.create({
        userId: admin.userId,
        action: "FACE_ENROLLED",
        entityType: "Student",
        entityId: id,
        details: JSON.stringify({ templatesCount: embeddings.length }),
        ip: req.ip || "",
      });

      res.status(201).json({ message: "Face templates saved successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to save face templates" });
    }
  },
);

export default router;
