// Connect Pro Fleet — Rental Detail right-column sections (Build #59).
//
// Operational cards: Rental Actions, Security Deposit, Payment Arrangement,
// Billing, Damage Claims, Tolls & Violations, Rental Documents. Each wraps the
// EXISTING authoritative sub-component — no ledger duplicated, no deposit
// accounting changed.

import type { RentalAgreement, Customer } from "@/lib/types";
import { DepositPanel } from "@/components/DepositPanel";
import { RentalArrangementSection } from "@/pages/rentals/RentalArrangementSection";
import { RentalBillingSection } from "@/pages/rentals/RentalBillingSection";
import { RentalDamageClaimsSection } from "@/pages/rentals/RentalDamageClaimsSection";
import { RentalViolationsSection } from "@/pages/violations/ViolationSections";
import { RentalComplianceSection } from "@/pages/compliance/ComplianceSections";

export interface RentalRightSectionProps {
  rental: RentalAgreement;
  customer?: Customer;
  customerName: string;
}

export function SecurityDepositSection({ rental }: RentalRightSectionProps) {
  return (
    <div data-testid="rd-deposit">
      <DepositPanel
        reservationId={rental.reservation_id}
        rentalId={rental.id}
      />
    </div>
  );
}

export function PaymentArrangementSection({ rental }: RentalRightSectionProps) {
  return (
    <div data-testid="rd-arrangement">
      <RentalArrangementSection rental={rental} />
    </div>
  );
}

export function BillingSection({ rental }: RentalRightSectionProps) {
  return (
    <div data-testid="rd-billing">
      <RentalBillingSection rental={rental} />
    </div>
  );
}

export function DamageClaimsSection({ rental }: RentalRightSectionProps) {
  return (
    <div data-testid="rd-damage-claims">
      <RentalDamageClaimsSection rentalId={rental.id} />
    </div>
  );
}

export function TollsViolationsSection({ rental }: RentalRightSectionProps) {
  return (
    <div data-testid="rd-tolls-violations">
      <RentalViolationsSection rentalId={rental.id} />
    </div>
  );
}

export function RentalDocumentsSection({
  rental,
  customerName,
}: RentalRightSectionProps) {
  return (
    <div data-testid="rd-documents">
      <RentalComplianceSection
        rentalId={rental.id}
        rentalLabel={`${rental.agreement_number}${customerName ? ` · ${customerName}` : ""}`}
      />
    </div>
  );
}
