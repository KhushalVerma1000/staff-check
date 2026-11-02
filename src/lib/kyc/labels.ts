import type { SkipReason } from '@/db/schema/app';

export const SKIP_LABEL: Record<SkipReason, string> = {
  NOT_YET: 'I do not have it yet',
  NOT_APPLICABLE: 'Not applicable to me',
  WILL_BRING_DOC: 'I will bring a document',
};
