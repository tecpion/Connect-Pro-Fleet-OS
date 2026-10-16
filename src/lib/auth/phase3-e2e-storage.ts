// Phase 3 E2E — private storage runtime verification steps.

import type { Step } from "./phase3-e2e-compliance";
import type { Phase3Context } from "./phase3-e2e-builders";

const PDF_BODY = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

export async function runStorageSteps(
  ctx: Phase3Context,
  clientA: { storage: { from: (b: string) => any } },
  clientB: { storage: { from: (b: string) => any } },
  storagePaths: string[],
): Promise<Step[]> {
  const steps: Step[] = [];

  // 28. Org A uploads compliance evidence to private bucket.
  const bucket = "vehicle-documents";
  const storagePath = `${ctx.orgA}/vehicle/${ctx.vehId}/${ctx.stamp}-reg-evidence.pdf`;
  storagePaths.push(storagePath);
  const upA = await clientA.storage.from(bucket).upload(storagePath, PDF_BODY, {
    contentType: "application/pdf",
    upsert: true,
  });
  steps.push({
    step: "28_orgA_upload_compliance_evidence",
    ok: !upA.error,
    detail: upA.error ? upA.error.message : `path=${storagePath}`,
  });

  // 29. Org A can read/download it.
  const dlA = await clientA.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60);
  steps.push({
    step: "29_orgA_can_download",
    ok: !dlA.error && !!dlA.data?.signedUrl,
    detail: dlA.error ? dlA.error.message : "signed url created",
  });

  // 30. Org B cannot access it.
  const dlB = await clientB.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60);
  const bDenied =
    !!dlB.error || !dlB.data?.signedUrl || dlB.data.signedUrl === "";
  steps.push({
    step: "30_orgB_cannot_access_evidence",
    ok: bDenied,
    detail: bDenied
      ? `denied: ${dlB.error?.message ?? "no url"}`
      : "LEAK: url returned",
  });

  // 31. Repeat for verification evidence (upload to customer-documents).
  const vStoragePath = `${ctx.orgA}/customer/${ctx.custId}/${ctx.stamp}-id-proof.pdf`;
  storagePaths.push(vStoragePath);
  const upV = await clientA.storage
    .from("customer-documents")
    .upload(vStoragePath, PDF_BODY, {
      contentType: "application/pdf",
      upsert: true,
    });
  const dlV = await clientA.storage
    .from("customer-documents")
    .createSignedUrl(vStoragePath, 60);
  const dlVB = await clientB.storage
    .from("customer-documents")
    .createSignedUrl(vStoragePath, 60);
  const vDenied =
    !!dlVB.error || !dlVB.data?.signedUrl || dlVB.data.signedUrl === "";
  steps.push({
    step: "31_verification_evidence_isolation",
    ok: !upV.error && !dlV.error && !!dlV.data?.signedUrl && vDenied,
    detail: `upload=${!upV.error} orgA_dl=${!dlV.error && !!dlV.data?.signedUrl} orgB_denied=${vDenied}`,
  });

  return steps;
}
