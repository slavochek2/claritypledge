import { mockAgreementsService } from './agreements-service-mock';
import { realAgreementsService } from './agreements-service-real';

// P422: Service switch - components use this interface
// Feature flag controls which implementation is used
const USE_REAL_API = import.meta.env.VITE_USE_REAL_AGREEMENTS_API === 'true';

export const agreementsService = USE_REAL_API ? realAgreementsService : mockAgreementsService;

export type { AgreementsService, ClarityAgreement, AgreementParty, AgreementStatus, AgreementVisibility, CreateAgreementInput } from './agreements-service.interface';
