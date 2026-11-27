export type GradingCompany = "PSA" | "BGS" | "CGC" | "TAG" | "Outra";

export const GRADING_COMPANIES: readonly GradingCompany[] = [
  "PSA",
  "BGS",
  "CGC",
  "TAG",
  "Outra",
] as const;

export type ConditionCode = "M" | "NM" | "SP" | "MP" | "HP" | "D";

export type ConditionSpec = {
  code: ConditionCode;
  name: string;
  shortLabel: string;
  summary: string;
  edges: string;
  surface: string;
  badgeClass: string;
  priceFactor: number;
};

export const CONDITION_GUIDE: readonly ConditionSpec[] = [
  {
    code: "M",
    name: "Mint (M)",
    shortLabel: "Impecável",
    summary: "Carta recém-saída do booster, sem qualquer marca visível a olho nu.",
    edges: "Bordas e cantos perfeitos, zero whitening.",
    surface: "Brilho original intacto, sem micro-riscos ou marcas de impressão.",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    priceFactor: 1.15,
  },
  {
    code: "NM",
    name: "Near Mint (NM)",
    shortLabel: "Quase nova",
    summary: "Padrão colecionável. Aceita no máximo 1–2 micro pontos imperceptíveis nas bordas.",
    edges: "Cantos afiados, mínimo whitening quase invisível.",
    surface: "Limpa, sem riscos profundos ou dobras.",
    badgeClass: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    priceFactor: 1.0,
  },
  {
    code: "SP",
    name: "Slightly Played (SP)",
    shortLabel: "Levemente jogada",
    summary: "Sinais sutis de manuseio ou jogo com sleeve; ótima para colecionar ou jogar.",
    edges: "Pequenos desgastes brancos em cantos ou bordas.",
    surface: "Riscos muito leves no foil/verso, sem vincos.",
    badgeClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    priceFactor: 0.85,
  },
  {
    code: "MP",
    name: "Moderately Played (MP)",
    shortLabel: "Jogada moderadamente",
    summary: "Desgaste perceptível em bordas e superfície, mas totalmente jogável com sleeve.",
    edges: "Whitening moderado nas bordas e cantos levemente arredondados.",
    surface: "Arranhões visíveis, pequenas marcas de uso sem rasgos.",
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    priceFactor: 0.68,
  },
  {
    code: "HP",
    name: "Heavily Played (HP)",
    shortLabel: "Muito jogada",
    summary: "Desgaste acentuado em várias áreas, possíveis vincos leves.",
    edges: "Desgaste intenso de tinta e bordas bem marcadas.",
    surface: "Riscos numerosos, descascamento leve ou vinco pequeno.",
    badgeClass: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    priceFactor: 0.5,
  },
  {
    code: "D",
    name: "Danificada (D)",
    shortLabel: "Danificada",
    summary: "Dano estrutural severo: dobras fundas, água, rasgo ou escrita na carta.",
    edges: "Deformação, rasgo ou falta de pedaço na borda.",
    surface: "Vinco profundo, manchas de umidade ou dano irreversível.",
    badgeClass: "bg-destructive/15 text-destructive",
    priceFactor: 0.3,
  },
] as const;

export const CONDITION_PRICE_FACTORS: Record<ConditionCode, number> = {
  M: 1.15,
  NM: 1.0,
  SP: 0.85,
  MP: 0.68,
  HP: 0.5,
  D: 0.3,
};

export const PHOTO_SLOT_LABELS = ["Frente", "Verso", "Detalhe 1", "Detalhe 2"] as const;

export function photoSlotLabel(index: number): string {
  return PHOTO_SLOT_LABELS[index] ?? `Foto ${index + 1}`;
}

export type GradingValidationResult =
  { ok: true; company: string | null; grade: string | null } | { ok: false; error: string };

const HALF_STEP_REGEX = /^(10(\.0)?|[1-9](\.5|\.0)?)$/;
const PSA_GRADE_REGEX =
  /^(10|9|8\.5|8|7\.5|7|6\.5|6|5\.5|5|4\.5|4|3\.5|3|2\.5|2|1\.5|1|A|Authentic)$/i;
const BGS_SPECIAL_REGEX = /^(10\s*(black\s*label|pristine)?|9\.5|[1-9](\.5)?)$/i;
const CGC_SPECIAL_REGEX = /^(10\s*(pristine|gem\s*mint)?|9\.5|[1-9](\.5)?)$/i;
const TAG_GRADE_REGEX = /^(10\s*(pristine|gem\s*mint)?|[1-9](\.5)?)$/i;

export function validateGrading(
  graded: boolean,
  rawCompany: string | null | undefined,
  rawGrade: string | null | undefined,
): GradingValidationResult {
  if (!graded) {
    return { ok: true, company: null, grade: null };
  }

  const company = (rawCompany ?? "").trim();
  const grade = (rawGrade ?? "").trim();

  if (!company) {
    return { ok: false, error: "Selecione a empresa certificadora da carta graduada." };
  }
  if (!GRADING_COMPANIES.includes(company as GradingCompany)) {
    return {
      ok: false,
      error: `Empresa de grading inválida: ${company}. Use PSA, BGS, CGC, TAG ou Outra.`,
    };
  }
  if (!grade) {
    return { ok: false, error: `Informe a nota atribuída pela ${company}.` };
  }
  if (grade.length > 24) {
    return { ok: false, error: "A nota de grading deve ter no máximo 24 caracteres." };
  }

  if (company === "PSA" && !PSA_GRADE_REGEX.test(grade)) {
    return {
      ok: false,
      error: "Nota PSA inválida. Use valores entre 1 e 10 (meio ponto até 8.5) ou Authentic.",
    };
  }
  if (company === "BGS" && !BGS_SPECIAL_REGEX.test(grade) && !HALF_STEP_REGEX.test(grade)) {
    return {
      ok: false,
      error: "Nota BGS inválida. Use valores entre 1 e 10 (ex.: 9.5, 10 Black Label).",
    };
  }
  if (company === "CGC" && !CGC_SPECIAL_REGEX.test(grade) && !HALF_STEP_REGEX.test(grade)) {
    return {
      ok: false,
      error: "Nota CGC inválida. Use valores entre 1 e 10 (ex.: 9.5, 10 Pristine).",
    };
  }
  if (company === "TAG" && !TAG_GRADE_REGEX.test(grade)) {
    return { ok: false, error: "Nota TAG inválida. Use valores entre 1 e 10 (ex.: 9.5, 10)." };
  }

  return { ok: true, company, grade };
}
