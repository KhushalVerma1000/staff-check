/**
 * Monthly pay for one person. All amounts are integer paise; nothing here uses floating point money.
 *
 * Rules (spec section 7, "Monthly payroll"):
 *  - Each component is the monthly amount scaled by paid days / working days, rounded to the nearest paise.
 *  - PF (employee share): 12% of earned basic, with basic capped at ₹15,000, when the company turns PF on.
 *  - ESIC (employee share): 0.75% of earned gross, rounded UP to the next rupee, only for staff whose
 *    monthly gross is ₹21,000 or less, when the company turns ESIC on.
 *  - Professional tax: the flat monthly amount the company sets (state slabs are not modelled), only when
 *    the person earned something this month.
 *  - Deductions never take net pay below zero.
 */
export const PF_WAGE_CEILING = 15_000_00;
export const PF_RATE_BP = 1200;
export const ESIC_GROSS_LIMIT = 21_000_00;
export const ESIC_RATE_BP = 75;

export interface Structure {
  basic: number;
  hra: number;
  other: number;
}

export interface PaySettings {
  pf: boolean;
  esic: boolean;
  professionalTax: number;
}

export interface PayInput {
  structure: Structure;
  settings: PaySettings;
  /** Mon–Sat days in the month. */
  workingDays: number;
  /** Days to pay for; half days count 0.5. Clamped to 0..workingDays. */
  paidDays: number;
}

export interface Pay {
  basic: number;
  hra: number;
  other: number;
  gross: number;
  pf: number;
  esic: number;
  pt: number;
  deductions: number;
  net: number;
}

/** amount × paid / working, to the nearest paise, using integer maths (paid days come in halves). */
export function prorate(amount: number, paidDays: number, workingDays: number): number {
  if (workingDays <= 0 || amount <= 0) return 0;
  const halves = Math.round(Math.min(Math.max(paidDays, 0), workingDays) * 2);
  return Math.round((amount * halves) / (workingDays * 2));
}

export function computePay(i: PayInput): Pay {
  const { structure: s, settings, workingDays, paidDays } = i;
  const basic = prorate(s.basic, paidDays, workingDays);
  const hra = prorate(s.hra, paidDays, workingDays);
  const other = prorate(s.other, paidDays, workingDays);
  const gross = basic + hra + other;

  const pf = settings.pf ? Math.round((Math.min(basic, PF_WAGE_CEILING) * PF_RATE_BP) / 10_000) : 0;

  const fullGross = s.basic + s.hra + s.other;
  // ceil(gross × 0.75% to the next whole rupee), in integers: paise × 75 / 10000 / 100
  const esic = settings.esic && fullGross <= ESIC_GROSS_LIMIT ? Math.floor((gross * ESIC_RATE_BP + 999_999) / 1_000_000) * 100 : 0;

  const pt = gross > 0 ? settings.professionalTax : 0;

  const wanted = pf + esic + pt;
  const deductions = Math.min(wanted, gross);
  // If deductions must be cut, take it off professional tax first, then ESIC, then PF (keeps the statutory shares intact longest).
  let over = wanted - deductions;
  const cut = (v: number) => {
    const c = Math.min(v, over);
    over -= c;
    return v - c;
  };
  const ptF = cut(pt);
  const esicF = cut(esic);
  const pfF = cut(pf);
  return { basic, hra, other, gross, pf: pfF, esic: esicF, pt: ptF, deductions, net: gross - deductions };
}
