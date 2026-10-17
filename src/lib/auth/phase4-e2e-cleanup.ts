// Phase 4 E2E — best-effort cleanup of all rows created during a run.
// Extracted so the main E2E runner stays focused; admin (service-role) only.
// Only the rows created by this E2E run are deleted.

type Admin = {
  from: (table: string) => any;
  auth: { admin: { deleteUser: (id: string) => Promise<unknown> } };
};

export async function cleanupPhase4E2E(
  admin: Admin,
  orgIds: { orgA: string; orgB: string },
  userIds: { userAId: string; userBId: string },
  storage: { bucket: string; paths: string[] },
): Promise<void> {
  const { orgA, orgB } = orgIds;
  const { userAId, userBId } = userIds;
  try {
    await admin.from("case_events").delete().eq("organization_id", orgA);
    await admin.from("cases").delete().eq("organization_id", orgA);
    await admin.from("violation_events").delete().eq("organization_id", orgA);
    await admin.from("violation_evidence").delete().eq("organization_id", orgA);
    await admin.from("violations").delete().eq("organization_id", orgA);
    await admin
      .from("telematics_device_assignments")
      .delete()
      .eq("organization_id", orgA);
    await admin.from("telematics_devices").delete().eq("organization_id", orgA);
    await admin
      .from("telematics_positions")
      .delete()
      .eq("organization_id", orgA);
    await admin.from("telematics_events").delete().eq("organization_id", orgA);
    await admin.from("telematics_trips").delete().eq("organization_id", orgA);
    await admin.from("telematics_alerts").delete().eq("organization_id", orgA);
    await admin
      .from("telematics_geofences")
      .delete()
      .eq("organization_id", orgA);
    await admin.from("rentals").delete().eq("organization_id", orgA);
    await admin.from("vehicles").delete().eq("organization_id", orgA);
    await admin.from("customers").delete().eq("organization_id", orgA);
    if (storage.paths.length > 0) {
      await admin
        .from("storage.objects")
        .delete()
        .eq("bucket_id", storage.bucket)
        .in("name", storage.paths);
    }
    await admin
      .from("organization_memberships")
      .delete()
      .eq("organization_id", orgA);
    await admin.from("organizations").delete().eq("id", orgA);
    await admin.from("profiles").delete().eq("user_id", userAId);
    await admin
      .from("organization_memberships")
      .delete()
      .eq("organization_id", orgB);
    await admin.from("organizations").delete().eq("id", orgB);
    await admin.from("profiles").delete().eq("user_id", userBId);
    await admin.auth.admin.deleteUser(userAId);
    await admin.auth.admin.deleteUser(userBId);
  } catch {
    // best-effort cleanup — E2E result is already captured above
  }
}
