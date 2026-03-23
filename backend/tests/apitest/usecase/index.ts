export type { SeedE2ECase } from './types';
import { billInquiryCases } from './bill-inquiry';
import { planInquiryCases } from './plan-inquiry';
import { serviceCancelCases } from './service-cancel';
import { faultDiagnosisCases } from './fault-diagnosis';
import { telecomAppCases } from './telecom-app';
import { outboundCollectionCases } from './outbound-collection';
import { outboundMarketingCases } from './outbound-marketing';

export const seededE2ECases = [
  ...billInquiryCases,
  ...planInquiryCases,
  ...serviceCancelCases,
  ...faultDiagnosisCases,
  ...telecomAppCases,
  ...outboundCollectionCases,
  ...outboundMarketingCases,
];
