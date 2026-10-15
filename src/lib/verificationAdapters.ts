// Connect Pro Fleet — Verification provider adapters (V1, mock).
//
// Provider-neutral adapter contract implemented as pure mock adapters. No
// network calls, no credentials, no real pricing. Capability differences are
// real: e.g. the Full provider supports all services; the MVR provider only
// supports MVR; the Insurance provider only insurance. The UI hides
// unsupported services via these flags.

import type {
  VerificationProviderAdapter,
  VerificationProviderId,
  VerificationType,
} from "@/lib/verificationTypes";
import { VERIFICATION_PROVIDER_LABELS } from "@/lib/verificationTypes";

/** Default mock estimated price per service type (illustrative only — never
 *  real pricing). Each provider may override. */
const DEFAULT_PRICES: Record<VerificationType, number> = {
  identity: 5,
  drivers_license: 4,
  insurance: 3,
  mvr: 8,
  background: 15,
};

const fullProvider: VerificationProviderAdapter = {
  provider: "full_provider",
  label: VERIFICATION_PROVIDER_LABELS.full_provider,
  connected: true,
  supportsIdentity: true,
  supportsLicense: true,
  supportsInsurance: true,
  supportsMvr: true,
  supportsBackground: true,
  estimatePrice: (t) => DEFAULT_PRICES[t],
};

const identityLicenseProvider: VerificationProviderAdapter = {
  provider: "identity_license",
  label: VERIFICATION_PROVIDER_LABELS.identity_license,
  connected: true,
  supportsIdentity: true,
  supportsLicense: true,
  supportsInsurance: false,
  supportsMvr: false,
  supportsBackground: false,
  estimatePrice: (t) => DEFAULT_PRICES[t],
};

const mvrProvider: VerificationProviderAdapter = {
  provider: "mvr_provider",
  label: VERIFICATION_PROVIDER_LABELS.mvr_provider,
  connected: true,
  supportsIdentity: false,
  supportsLicense: false,
  supportsInsurance: false,
  supportsMvr: true,
  supportsBackground: false,
  estimatePrice: (t) => DEFAULT_PRICES[t],
};

const insuranceProvider: VerificationProviderAdapter = {
  provider: "insurance_provider",
  label: VERIFICATION_PROVIDER_LABELS.insurance_provider,
  connected: true,
  supportsIdentity: false,
  supportsLicense: false,
  supportsInsurance: true,
  supportsMvr: false,
  supportsBackground: false,
  estimatePrice: (t) => DEFAULT_PRICES[t],
};

const customProvider: VerificationProviderAdapter = {
  provider: "custom",
  label: VERIFICATION_PROVIDER_LABELS.custom,
  connected: false,
  supportsIdentity: true,
  supportsLicense: true,
  supportsInsurance: true,
  supportsMvr: true,
  supportsBackground: true,
  estimatePrice: (t) => DEFAULT_PRICES[t],
};

export const verificationAdapters: VerificationProviderAdapter[] = [
  fullProvider,
  identityLicenseProvider,
  mvrProvider,
  insuranceProvider,
  customProvider,
];

export function getVerificationAdapter(
  provider: VerificationProviderId,
): VerificationProviderAdapter | null {
  return verificationAdapters.find((a) => a.provider === provider) ?? null;
}

/** Whether a given provider supports a given verification type. */
export function providerSupports(
  adapter: VerificationProviderAdapter,
  type: VerificationType,
): boolean {
  switch (type) {
    case "identity":
      return adapter.supportsIdentity;
    case "drivers_license":
      return adapter.supportsLicense;
    case "insurance":
      return adapter.supportsInsurance;
    case "mvr":
      return adapter.supportsMvr;
    case "background":
      return adapter.supportsBackground;
  }
}

/** Pick the first connected provider that supports a given type (mock). */
export function pickProviderForType(
  type: VerificationType,
): VerificationProviderAdapter | null {
  return (
    verificationAdapters.find(
      (a) => a.connected && providerSupports(a, type),
    ) ?? null
  );
}
