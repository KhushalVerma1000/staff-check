export interface PayoutKyc {
  status: string;
  bankHolder: string | null;
  bankName: string | null;
  /** Already decrypted, or null when missing or undecryptable. */
  account: string | null;
  ifsc: string | null;
}

export interface PayoutRow {
  code: string;
  name: string;
  holder: string;
  bank: string;
  account: string;
  ifsc: string;
  netPaise: number;
  /** Empty when the row is ready to pay. Otherwise says why the bank must not be sent this row. */
  problem: string;
}

/**
 * One row per payslip for the bank upload. A row is only "ready" with approved onboarding, full bank details
 * and something to pay; anything else is listed with the reason and left out of the payable total.
 */
export function payoutRow(slip: { code: string; name: string; netPaise: number }, kyc: PayoutKyc | undefined): PayoutRow {
  const base = { code: slip.code, name: slip.name, netPaise: slip.netPaise };
  const blank = { holder: '', bank: '', account: '', ifsc: '' };
  if (!kyc) return { ...base, ...blank, problem: 'No onboarding record' };
  const filled = {
    holder: kyc.bankHolder ?? '',
    bank: kyc.bankName ?? '',
    account: kyc.account ?? '',
    ifsc: (kyc.ifsc ?? '').toUpperCase(),
  };
  let problem = '';
  if (kyc.status !== 'APPROVED') problem = 'Onboarding not approved yet';
  else if (!filled.holder || !filled.account || !filled.ifsc) problem = 'Bank details missing';
  else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(filled.ifsc)) problem = 'IFSC looks wrong';
  else if (slip.netPaise <= 0) problem = 'Nothing to pay';
  return { ...base, ...filled, problem };
}

/** Sum of net pay for rows ready to pay. */
export function payableTotal(rows: PayoutRow[]): number {
  return rows.filter((r) => !r.problem).reduce((a, r) => a + r.netPaise, 0);
}

/** Cells starting with = + - @ are text to Excel only if stored as text; this also keeps CSV/other readers from treating them as formulas. */
export function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}
