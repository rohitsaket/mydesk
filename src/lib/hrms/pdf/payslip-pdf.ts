import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from "pdf-lib";

/**
 * Branded A4 payslip PDF generator (server-only).
 * Fonts: vendored pyftsubset cuts of DejaVu Sans (ASCII + en-dash + ₹),
 * ~20KB each, license preserved in assets/fonts/DejaVu-LICENSE.txt.
 */

export interface PayslipPdfInput {
  company: string;
  employee: { name: string; empCode: string; designation: string; department: string };
  payslip: {
    month: number;
    year: number;
    status: string;
    gross: number;
    deductions: number;
    net: number;
    payableDays: number;
    lopDays: number;
    overtimeHours: number;
    earnings: { label: string; amount: number }[];
    deductionLines: { label: string; amount: number }[];
  };
  payDate: Date;
  generatedAt: Date;
}

// ── palette ─────────────────────────────────────────────────
const C = {
  primary: rgb(0.145, 0.388, 0.922), // #2563EB
  ink: rgb(0.059, 0.09, 0.16), // #0F172A
  slate: rgb(0.278, 0.333, 0.412), // #475569
  muted: rgb(0.392, 0.455, 0.545), // #64748B
  hairline: rgb(0.886, 0.91, 0.941), // #E2E8F0
  rule: rgb(0.796, 0.835, 0.878), // #CBD5E1
  cardBg: rgb(0.973, 0.98, 0.988), // #F8FAFC
  earnTint: rgb(0.937, 0.965, 1), // #EFF6FF
  earnText: rgb(0.118, 0.251, 0.686), // #1E40AF
  dedTint: rgb(1, 0.945, 0.949), // #FFF1F2
  dedText: rgb(0.624, 0.071, 0.224), // #9F1239
  danger: rgb(0.792, 0.243, 0.243), // #CA3A3A
  successBg: rgb(0.925, 0.992, 0.961), // #ECFDF5
  successBorder: rgb(0.063, 0.71, 0.51), // #10B981
  successText: rgb(0.016, 0.443, 0.322), // #047857
  warnBg: rgb(1, 0.984, 0.922), // #FFFBEB
  warnText: rgb(0.706, 0.325, 0.024), // #B45309
  neutralBg: rgb(0.976, 0.98, 0.992),
  neutralText: rgb(0.29, 0.345, 0.416),
  white: rgb(1, 1, 1),
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ── font cache ──────────────────────────────────────────────
let regularBytes: Uint8Array | null = null;
let boldBytes: Uint8Array | null = null;

function loadFont(file: string): Uint8Array | null {
  try {
    return new Uint8Array(readFileSync(join(process.cwd(), "assets", "fonts", file)));
  } catch {
    return null;
  }
}

// ── text helpers ────────────────────────────────────────────
/** Keep only glyphs vendored in the subset fonts (ASCII, en-dash, ₹). */
function tx(s: string): string {
  const stripped = s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "*");
  return stripped.replace(/[^\u0020-\u007E\u20B9]/g, "");
}

/** ₹ with Indian digit grouping (last 3, then 2s): 1234567 → ₹12,34,567 */
export function formatINR(n: number): string {
  const neg = n < 0;
  const abs = Math.round(Math.abs(n));
  let digits = String(abs);
  if (digits.length > 3) {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    digits = `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
  }
  return `${neg ? "-" : ""}\u20B9${digits}`;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function two(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = TENS[Math.floor(n / 10)] ?? "";
  const r = n % 10;
  return r ? `${t} ${ONES[r]}` : t;
}

function three(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = "";
  if (h) out += `${ONES[h]} Hundred`;
  if (rest) out += `${h ? " " : ""}${two(rest)}`;
  return out;
}

/** Indian numbering: crore / lakh / thousand. */
export function rupeesInWords(n: number): string {
  const abs = Math.round(Math.abs(n));
  if (abs === 0) return "Rupees Zero Only";
  const crore = Math.floor(abs / 1_00_00_000);
  const lakh = Math.floor((abs % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((abs % 1_00_000) / 1000);
  const rest = abs % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return `Rupees ${parts.join(" ")} Only${n < 0 ? " (Dr)" : ""}`;
}

// ── drawing micro-kit ───────────────────────────────────────
interface Ctx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
}

function label(ctx: Ctx, text: string, x: number, y: number, size: number, color: RGB, bold = false) {
  ctx.page.drawText(tx(text), { x, y, size, font: bold ? ctx.bold : ctx.font, color });
}

function labelRight(ctx: Ctx, text: string, rightX: number, y: number, size: number, color: RGB, bold = false) {
  const f = bold ? ctx.bold : ctx.font;
  const w = f.widthOfTextAtSize(tx(text), size);
  ctx.page.drawText(tx(text), { x: rightX - w, y, size, font: f, color });
}

function hairline(ctx: Ctx, x1: number, y: number, x2: number, color = C.hairline, thickness = 0.7) {
  ctx.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

/** Greedy word wrap against a max width; returns lines. */
function wrap(ctx: Ctx, text: string, size: number, maxWidth: number, bold = false): string[] {
  const f = bold ? ctx.bold : ctx.font;
  const words = tx(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (f.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ── status chip colors ──────────────────────────────────────
function statusChip(status: string): { bg: RGB; text: RGB } {
  if (status === "PAID") return { bg: C.successBg, text: C.successText };
  if (status === "PROCESSING") return { bg: C.warnBg, text: C.warnText };
  return { bg: C.neutralBg, text: C.neutralText };
}

// ── main builder ────────────────────────────────────────────
export async function buildPayslipPdf(input: PayslipPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Payslip ${tx(input.employee.name)} ${MONTHS[input.payslip.month - 1]} ${input.payslip.year}`);
  pdf.setAuthor(tx(input.company));
  pdf.setSubject("Payslip");
  pdf.setProducer("My Desk HRMS");
  pdf.setCreator("My Desk HRMS");

  regularBytes ??= loadFont("DejaVuSans.ttf");
  boldBytes ??= loadFont("DejaVuSans-Bold.ttf");

  const font = await pdf.embedFont(regularBytes ?? new Uint8Array(), { subset: false });
  const bold = await pdf.embedFont(boldBytes ?? new Uint8Array(), { subset: false });
  const ctx: Ctx = { page: pdf.addPage([PAGE_W, PAGE_H]), font, bold };
  const { page } = ctx;

  // local y coordinate (top-origin → pdf origin)
  let top = 0;
  const money = (n: number) => formatINR(n);

  // ── header band ──────────────────────────────────────────
  const BAND_H = 84;
  page.drawRectangle({ x: 0, y: PAGE_H - BAND_H, width: PAGE_W, height: BAND_H, color: C.primary });
  label(ctx, input.company, M, PAGE_H - 40, 19, C.white, true);
  label(ctx, "Payroll Services - Confidential", M, PAGE_H - 56, 7.5, rgb(0.85, 0.9, 0.99));
  labelRight(ctx, "PAYSLIP", PAGE_W - M, PAGE_H - 38, 13, C.white, true);
  labelRight(ctx, `${MONTHS[input.payslip.month - 1]} ${input.payslip.year}`, PAGE_W - M, PAGE_H - 54, 9, rgb(0.85, 0.9, 0.99));
  top = BAND_H;

  // status chip (right aligned, below band)
  const chip = statusChip(input.payslip.status);
  const statusText = input.payslip.status.replace(/_/g, " ");
  const chipW = bold.widthOfTextAtSize(statusText, 7.5) + 18;
  const chipH = 16;
  const chipY = PAGE_H - top - 8 - chipH;
  page.drawRectangle({ x: PAGE_W - M - chipW, y: chipY, width: chipW, height: chipH, color: chip.bg, borderColor: chip.text, borderWidth: 0.8 });
  labelRight(ctx, statusText, PAGE_W - M - 9, chipY + 5, 7.5, chip.text, true);
  // generated stamp (left side, same row)
  label(
    ctx,
    `Generated ${input.generatedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
    M,
    chipY + 5,
    7,
    C.muted
  );
  top += 8 + chipH + 10;

  // ── employee card ────────────────────────────────────────
  const CARD_H = 78;
  page.drawRectangle({ x: M, y: PAGE_H - top - CARD_H, width: PAGE_W - 2 * M, height: CARD_H, color: C.cardBg, borderColor: C.hairline, borderWidth: 0.8 });
  const col2 = M + (PAGE_W - 2 * M) / 2 + 8;
  const rows: [string, string, boolean][] = [
    ["Employee", input.employee.name, true],
    ["Pay Period", `${MONTHS[input.payslip.month - 1]} ${input.payslip.year}`, false],
    ["Employee Code", input.employee.empCode, false],
    ["Pay Date", input.payDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), false],
    ["Designation", input.employee.designation, false],
    ["Department", input.employee.department, false],
  ];
  rows.forEach(([lab, val, isBold], i) => {
    const rowY = PAGE_H - top - 14 - Math.floor(i / 2) * 24;
    const x = i % 2 === 0 ? M + 14 : col2;
    label(ctx, lab.toUpperCase(), x, rowY + 10, 6, C.muted, true);
    label(ctx, val || "-", x, rowY - 1, 9, isBold ? C.ink : C.slate, isBold);
  });
  top += CARD_H + 14;

  // ── earnings & deductions ────────────────────────────────
  const gap = 14;
  const colW = (PAGE_W - 2 * M - gap) / 2;
  const earnX = M;
  const dedX = M + colW + gap;
  const earnings = input.payslip.earnings;
  const deductions = input.payslip.deductionLines;
  const commonRows = Math.max(earnings.length, deductions.length);

  const HEAD_H = 20;
  const ROW_H = 16;
  const TOTAL_H = 24;

  // column headers
  page.drawRectangle({ x: earnX, y: PAGE_H - top - HEAD_H, width: colW, height: HEAD_H, color: C.earnTint });
  label(ctx, "EARNINGS", earnX + 10, PAGE_H - top - HEAD_H + 6.5, 8, C.earnText, true);
  page.drawRectangle({ x: dedX, y: PAGE_H - top - HEAD_H, width: colW, height: HEAD_H, color: C.dedTint });
  label(ctx, "DEDUCTIONS", dedX + 10, PAGE_H - top - HEAD_H + 6.5, 8, C.dedText, true);
  top += HEAD_H;

  // line rows (aligned across both tables)
  for (let i = 0; i < commonRows; i++) {
    const rowTop = PAGE_H - top - ROW_H;
    const rowBaseline = rowTop + 5.5;
    const e = earnings[i];
    const d = deductions[i];
    if (e) {
      label(ctx, e.label, earnX + 10, rowBaseline, 8.5, C.slate);
      labelRight(ctx, money(e.amount), earnX + colW - 10, rowBaseline, 8.5, C.ink);
    }
    if (d) {
      label(ctx, d.label, dedX + 10, rowBaseline, 8.5, C.slate);
      labelRight(ctx, money(d.amount), dedX + colW - 10, rowBaseline, 8.5, C.danger);
    }
    if (i < commonRows - 1) {
      hairline(ctx, earnX + 8, rowTop + 1, earnX + colW - 8);
      hairline(ctx, dedX + 8, rowTop + 1, dedX + colW - 8);
    }
    top += ROW_H;
  }

  // totals row
  const totalTop = PAGE_H - top - TOTAL_H;
  page.drawRectangle({ x: earnX, y: totalTop, width: colW, height: TOTAL_H, color: C.earnTint });
  label(ctx, "Gross Earnings", earnX + 10, totalTop + 8.5, 8.5, C.earnText, true);
  labelRight(ctx, money(input.payslip.gross), earnX + colW - 10, totalTop + 8.5, 8.5, C.earnText, true);
  page.drawRectangle({ x: dedX, y: totalTop, width: colW, height: TOTAL_H, color: C.dedTint });
  label(ctx, "Total Deductions", dedX + 10, totalTop + 8.5, 8.5, C.dedText, true);
  labelRight(ctx, money(input.payslip.deductions), dedX + colW - 10, totalTop + 8.5, 8.5, C.dedText, true);
  top += TOTAL_H + 16;

  // ── net pay band ─────────────────────────────────────────
  const NET_H = 40;
  const netY = PAGE_H - top - NET_H;
  page.drawRectangle({ x: M, y: netY, width: PAGE_W - 2 * M, height: NET_H, color: C.successBg, borderColor: C.successBorder, borderWidth: 1 });
  label(ctx, "NET PAYABLE", M + 12, netY + NET_H - 13, 6.5, C.successText, true);
  const wordsLines = wrap(ctx, rupeesInWords(input.payslip.net), 7.5, PAGE_W - 2 * M - 130).slice(0, 2);
  wordsLines.forEach((line, i) => {
    label(ctx, line, M + 12, netY + 13 - i * 9, 7, C.slate);
  });
  labelRight(ctx, money(input.payslip.net), PAGE_W - M - 12, netY + 13, 15, C.successText, true);
  top += NET_H + 14;

  // ── summary cells ────────────────────────────────────────
  const SUM_H = 34;
  const cellW = (PAGE_W - 2 * M) / 3;
  const sumY = PAGE_H - top - SUM_H;
  page.drawRectangle({ x: M, y: sumY, width: PAGE_W - 2 * M, height: SUM_H, color: C.cardBg, borderColor: C.hairline, borderWidth: 0.8 });
  const cells: [string, string][] = [
    ["Payable Days", `${input.payslip.payableDays} days`],
    ["LOP Days", input.payslip.lopDays > 0 ? `${input.payslip.lopDays} days` : "None"],
    ["Overtime", input.payslip.overtimeHours > 0 ? `${input.payslip.overtimeHours} hours` : "None"],
  ];
  cells.forEach(([lab, val], i) => {
    const cx = M + i * cellW;
    if (i > 0) page.drawLine({ start: { x: cx, y: sumY + 5 }, end: { x: cx, y: sumY + SUM_H - 5 }, thickness: 0.7, color: C.hairline });
    const lw = bold.widthOfTextAtSize(lab.toUpperCase(), 6);
    label(ctx, lab.toUpperCase(), cx + (cellW - lw) / 2, sumY + 21, 6, C.muted, true);
    const vw = bold.widthOfTextAtSize(val, 9);
    label(ctx, val, cx + (cellW - vw) / 2, sumY + 8, 9, C.ink, true);
  });
  top += SUM_H + 26;

  // ── footer ───────────────────────────────────────────────
  hairline(ctx, M, PAGE_H - top, PAGE_W - M, C.rule, 0.9);
  const stamp = input.generatedAt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const footer1 = "Computer-generated payslip - My Desk HRMS";
  const footer2 = `Generated ${stamp} IST - This document is confidential and intended solely for ${input.employee.name}.`;
  [footer1, footer2].forEach((line, i) => {
    const w = font.widthOfTextAtSize(tx(line), 6.5);
    label(ctx, line, (PAGE_W - w) / 2, PAGE_H - top - 12 - i * 9, 6.5, C.muted);
  });

  return pdf.save();
}
