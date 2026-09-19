import Papa from "papaparse";

export interface ParsedStudentRow {
  rowNumber: number;
  registrationNumber: string;
  name: string;
  serialNumber: number;
  email?: string;
}

export interface ParseStudentsCsvResult {
  rows: ParsedStudentRow[];
  errors: string[];
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function getField(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const match = Object.entries(row).find(
      ([k]) => normalizeHeader(k) === normalizeHeader(key),
    );
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

export function parseSerialNumber(raw: string): number | null {
  const value = raw.trim();
  if (!value || value.toUpperCase() === "N/A") return null;
  const parsed = parseInt(value.replace(/^#/, ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseStudentsCsv(file: File): Promise<ParseStudentsCsvResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors: string[] = [];
        const rows: ParsedStudentRow[] = [];

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        results.data.forEach((row, idx) => {
          const regNo = getField(
            row,
            "Regn No",
            "Reg No",
            "Registration Number",
          );
          const name = getField(row, "Name");
          const emailRaw = getField(row, "Email", "Email Address");
          const serialRaw = getField(
            row,
            "Serial No",
            "Serial Number",
            "Serial",
          );

          if (!regNo && !name && !serialRaw && !emailRaw) return;

          const serialNumber = parseSerialNumber(serialRaw);
          const rowNumber = idx + 2;

          if (!regNo) {
            errors.push(`Row ${rowNumber}: missing Regn No`);
            return;
          }
          if (!name) {
            errors.push(`Row ${rowNumber}: missing Name`);
            return;
          }
          if (serialNumber === null) {
            errors.push(
              `Row ${rowNumber}: invalid Serial No "${serialRaw || "(empty)"}"`,
            );
            return;
          }
          if (!emailRaw) {
            errors.push(`Row ${rowNumber}: missing Email`);
            return;
          }
          if (!emailRegex.test(emailRaw)) {
            errors.push(`Row ${rowNumber}: invalid Email format "${emailRaw}"`);
            return;
          }

          rows.push({
            rowNumber,
            registrationNumber: regNo,
            name,
            serialNumber,
            email: emailRaw,
          });
        });

        const regSet = new Set<string>();
        const serialSet = new Set<number>();
        for (const row of rows) {
          const normalizedReg = row.registrationNumber.toUpperCase();
          if (regSet.has(normalizedReg)) {
            errors.push(`Duplicate Reg No "${row.registrationNumber}" in CSV`);
          }
          regSet.add(normalizedReg);

          if (serialSet.has(row.serialNumber)) {
            errors.push(`Duplicate Serial Number #${row.serialNumber} in CSV`);
          }
          serialSet.add(row.serialNumber);
        }

        if (rows.length === 0 && errors.length === 0) {
          errors.push("No student rows found in the CSV file.");
        }

        resolve({ rows, errors });
      },
      error: (err) => reject(new Error(err.message || "Failed to parse CSV")),
    });
  });
}
