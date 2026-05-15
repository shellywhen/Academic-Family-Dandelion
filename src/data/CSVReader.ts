export type CSVRow = Record<string, string>;

export function parseCSV(text: string): CSVRow[] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === "\r") {
      continue;
    }

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  const records: CSVRow[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row.some((cell) => cell.trim().length > 0)) continue;
    const entry: CSVRow = {};
    header.forEach((key, idx) => {
      entry[key] = row[idx]?.trim?.() ?? "";
    });
    records.push(entry);
  }

  return records;
}

export type NodeData = {
  id: number;
  name: string;
  chi_name: string | null;
  advisor: string;
  start_year: number;
  graduation_year: number | null;
  graduation_university: string;
  faculty_position: string | null;
  personal_website: string | null;
  other_news: string | null;
  doctoral_thesis: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Converts CSV text to a JSON object keyed by the "Name" field.
 * @param csv CSV string
 * @returns Record<number, NodeData>
 */
export function parseCSVToNodeData(csv: string): Record<number, NodeData> {
  const jsonObject: Record<number, NodeData> = {}; // Initialize empty object

  const rows = csv.trim().split("\n").slice(1); // remove header row
  if (!rows) return jsonObject; // Return empty object if no data

  rows.forEach((row, index) => {
    const columns = row.split(",");
    if (columns.length > 0) {
      jsonObject[index] = {
        id: index,
        name: columns[0],
        chi_name: columns[1],
        advisor: columns[2],
        start_year: parseInt(columns[3], 10),
        graduation_year: parseOptionalInt(columns[4]),
        graduation_university: columns[5],
        faculty_position: columns[6],
        personal_website: columns[7],
        other_news: columns[8],
        doctoral_thesis: columns[9],
        latitude: parseOptionalFloat(columns[10]),
        longitude: parseOptionalFloat(columns[11]),
      };
    }
  });

  return jsonObject;
}

export function parseOptionalInt(value?: string): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseOptionalFloat(value?: string): number | null {
  if (!value) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}