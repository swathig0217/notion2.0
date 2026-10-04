// Health check. Also proves edge functions can import the shared package
// (Zod schemas + pure logic) used by the app: one source of truth for both.
import { TaskInsert, parseChecklist } from '@shared/index.ts';

Deno.serve(() => {
  const sharedOk = parseChecklist('- a\n- b').items.length === 2;
  const zodOk = !TaskInsert.safeParse({}).success;
  return Response.json({ ok: sharedOk && zodOk });
});
