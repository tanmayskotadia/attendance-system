import { db } from './src/prisma/db.js'; async function test() { await db.transaction(async (tx) => { await tx.orm.public.Student.where({ id: 1 }).first(); }); }
