export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Errors carry a stable machine code the app maps to friendly copy. Never echo input. */
export function error(code: string, status: number): Response {
  return json({ error: code }, status);
}

/** Structured log line with metrics only. Never pass user content here (see PRIVACY.md). */
export function logMetrics(fields: Record<string, string | number | boolean | string[] | null>) {
  console.log(JSON.stringify(fields));
}
