import { CONDITIONS, FINISHES, LANGUAGES } from "@/lib/format";

export const BULK_MAX_ROWS = 500;
export const BULK_MAX_PRICE = 100_000;
export const BULK_MAX_QUANTITY = 999;
export const BULK_NOTES_MAX = 500;

export const BULK_HEADERS = [
  "card_id",
  "condition",
  "language",
  "finish",
  "price",
  "quantity",
  "graded",
  "grade_company",
  "grade",
  "notes",
] as const;

export const BULK_REQUIRED_HEADERS = ["card_id", "condition", "price"] as const;

export type BulkListingRow = {
  line: number;
  cardId: string;
  condition: string;
  language: string;
  finish: string;
  price: number;
  quantity: number;
  graded: boolean;
  gradeCompany: string | null;
  grade: string | null;
  notes: string | null;
};

export type BulkListingIssue = {
  line: number;
  field: string;
  message: string;
};

export type BulkListingParseResult = {
  rows: BulkListingRow[];
  issues: BulkListingIssue[];
  totalLines: number;
};

const CARD_ID_RE = /^[a-z0-9._-]{2,48}$/i;
const TRUE_VALUES = new Set(["1", "true", "yes", "y", "sim", "s"]);
const FALSE_VALUES = new Set(["", "0", "false", "no", "n", "nao", "não"]);

function detectSeparator(headerLine: string): "," | ";" {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

export function splitCsvLine(line: string, sep: "," | ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? "";
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(/^R\$/i, "");
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export function parseBulkListingCsv(text: string): BulkListingParseResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  const issues: BulkListingIssue[] = [];
  const rows: BulkListingRow[] = [];

  if (lines.length === 0) {
    return { rows, issues: [{ line: 0, field: "file", message: "Arquivo vazio." }], totalLines: 0 };
  }

  const sep = detectSeparator(lines[0] ?? "");
  const header = splitCsvLine(lines[0] ?? "", sep).map((h) => h.toLowerCase());
  const missing = BULK_REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) {
    return {
      rows,
      issues: [
        {
          line: 1,
          field: "header",
          message: `Colunas obrigatórias ausentes: ${missing.join(", ")}.`,
        },
      ],
      totalLines: lines.length - 1,
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > BULK_MAX_ROWS) {
    return {
      rows,
      issues: [
        { line: 0, field: "file", message: `Limite de ${BULK_MAX_ROWS} linhas por importação.` },
      ],
      totalLines: dataLines.length,
    };
  }

  dataLines.forEach((raw, idx) => {
    const lineNo = idx + 2;
    const cells = splitCsvLine(raw, sep);
    const get = (name: string) => {
      const pos = header.indexOf(name);
      return pos >= 0 ? (cells[pos] ?? "") : "";
    };
    const before = issues.length;
    const cardId = get("card_id");
    const condition = get("condition").toUpperCase();
    const language = (get("language") || "en").toLowerCase();
    const finish = (get("finish") || "normal").toLowerCase();
    const price = parsePrice(get("price"));
    const quantityRaw = get("quantity") || "1";
    const quantity = /^\d+$/.test(quantityRaw) ? Number(quantityRaw) : NaN;
    const gradedRaw = get("graded").toLowerCase();
    const gradeCompany = get("grade_company") || null;
    const grade = get("grade") || null;
    const notes = get("notes") || null;
    const graded = TRUE_VALUES.has(gradedRaw) ? true : FALSE_VALUES.has(gradedRaw) ? false : null;

    const add = (field: string, message: string) => issues.push({ line: lineNo, field, message });

    if (!CARD_ID_RE.test(cardId)) add("card_id", "ID da carta inválido.");
    if (!(condition in CONDITIONS))
      add("condition", `Condição inválida. Use: ${Object.keys(CONDITIONS).join(", ")}.`);
    if (!(language in LANGUAGES))
      add("language", `Idioma inválido. Use: ${Object.keys(LANGUAGES).join(", ")}.`);
    if (!(finish in FINISHES))
      add("finish", `Acabamento inválido. Use: ${Object.keys(FINISHES).join(", ")}.`);
    if (price === null || price <= 0 || price > BULK_MAX_PRICE)
      add("price", "Preço inválido (use valores entre 0,01 e 100000).");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > BULK_MAX_QUANTITY) {
      add("quantity", `Quantidade deve ser entre 1 e ${BULK_MAX_QUANTITY}.`);
    }
    if (graded === null) add("graded", "Use sim ou não em graded.");
    if (graded && (!gradeCompany || !grade))
      add("grade", "Carta graduada exige grade_company e grade.");
    if (!graded && (gradeCompany || grade))
      add("grade", "grade_company e grade só podem ser usados com graded = sim.");
    if (notes && notes.length > BULK_NOTES_MAX)
      add("notes", `Observações com mais de ${BULK_NOTES_MAX} caracteres.`);

    if (issues.length === before && graded !== null && price !== null) {
      rows.push({
        line: lineNo,
        cardId,
        condition,
        language,
        finish,
        price,
        quantity,
        graded,
        gradeCompany: graded ? gradeCompany : null,
        grade: graded ? grade : null,
        notes,
      });
    }
  });

  return { rows, issues, totalLines: dataLines.length };
}

export function bulkListingTemplate(): string {
  return `${BULK_HEADERS.join(",")}\nsv3pt5-199,NM,en,normal,12.50,1,nao,,,\n`;
}
