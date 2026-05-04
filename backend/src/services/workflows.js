// Workflow trigger engine — minimal safe stub.
//
// The full implementation evaluates user-defined Workflow documents (stored in
// MongoDB) against entity events and dispatches actions (email/whatsapp/sms,
// task creation, status changes, etc.). For now this is a no-op so the API
// boots and audit-logged events do not crash the request pipeline.
//
// Wire up real action handlers here when ready. Keep this function async and
// non-throwing — callers invoke it best-effort with `.catch()`.

export async function triggerWorkflows(event, entity, actor) {
  // Intentional no-op. Replace with a real engine when workflow execution is
  // ready. We accept and ignore the parameters to preserve the call signature.
  void event
  void entity
  void actor
  return { matched: 0, executed: 0 }
}
