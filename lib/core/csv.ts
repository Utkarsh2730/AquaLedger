import type { FlatRec } from "./types";
import { flatLabel } from "./types";
import { localToUtcIso, DEFAULT_TZ_OFFSET_MIN } from "./time";

export interface ParsedReading {
  flatId: string;
  timestamp: string;
  periodMinutes: number;
  litres: number;
}

export interface CsvParseResult {
  rows: ParsedReading[];
  errors: string[];
}

/**
 * Parses meter-reading CSVs exported by societies. Header row required; columns (any order):
 *   flat     - "B-204" (block-number) or "B204"
 *   date     - YYYY-MM-DD (local), or "timestamp" as full ISO-8601
 *   hour     - optional 0-23; when present the row is an hourly reading
 *   litres   - consumption in the interval (also accepts "liters" / "usage")
 */
export function parseReadingsCsv(text: string, flats: FlatRec[], tzOffsetMin = DEFAULT_TZ_OFFSET_MIN): CsvParseResult {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];
  if (lines.length < 2) return { rows: [], errors: ["CSV needs a header row and at least one data row"] };
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iFlat = col("flat", "flat_no", "unit");
  const iDate = col("date", "day");
  const iTs = col("timestamp", "time", "datetime");
  const iHour = col("hour");
  const iLitres = col("litres", "liters", "usage", "litres_used");
  if (iFlat < 0 || iLitres < 0 || (iDate < 0 && iTs < 0)) {
    return { rows: [], errors: ["Header must include flat, litres and date (or timestamp) columns"] };
  }
  const byLabel = new Map<string, FlatRec>();
  for (const f of flats) {
    byLabel.set(normalise(flatLabel(f)), f);
  }

  const rows: ParsedReading[] = [];
  lines.slice(1).forEach((line, idx) => {
    const cells = splitCsvLine(line);
    const lineNo = idx + 2;
    const flat = byLabel.get(normalise(cells[iFlat] ?? ""));
    if (!flat) return void errors.push(`line ${lineNo}: unknown flat "${cells[iFlat]}"`);
    const litres = Number(cells[iLitres]);
    if (!Number.isFinite(litres) || litres < 0) return void errors.push(`line ${lineNo}: bad litres "${cells[iLitres]}"`);
    let timestamp: string;
    let periodMinutes = 1440;
    if (iTs >= 0 && cells[iTs]) {
      const t = Date.parse(cells[iTs]);
      if (Number.isNaN(t)) return void errors.push(`line ${lineNo}: bad timestamp "${cells[iTs]}"`);
      timestamp = new Date(t).toISOString();
      periodMinutes = 60;
    } else {
      const day = (cells[iDate] ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return void errors.push(`line ${lineNo}: date must be YYYY-MM-DD`);
      const hourCell = iHour >= 0 ? cells[iHour]?.trim() : "";
      if (hourCell) {
        const hour = Number(hourCell);
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) return void errors.push(`line ${lineNo}: hour must be 0-23`);
        timestamp = localToUtcIso(day, hour, tzOffsetMin);
        periodMinutes = 60;
      } else {
        timestamp = localToUtcIso(day, 0, tzOffsetMin);
      }
    }
    rows.push({ flatId: flat.id, timestamp, periodMinutes, litres });
  });
  return { rows, errors };
}

const normalise = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") out.push(cur), (cur = "");
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
