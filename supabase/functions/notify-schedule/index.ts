import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// v3 (Phase 1): reads the schedule's real period_start/period_end instead of
// the legacy week_offset, and labels open shifts.

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

function periodRange(start: string, end: string) {
  const f = (iso: string) => new Date(iso + 'T00:00:00Z')
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${f(start)} – ${f(end)}`
}

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] as string))
}

function shiftBlock(name: string, start: string, end: string, isMine: boolean) {
  const bg = isMine ? '#1D9E75' : '#E1F5EE'
  const fg = isMine ? '#ffffff' : '#085041'
  return `<span style="display:inline-block;margin:2px 4px 2px 0;padding:4px 10px;border-radius:6px;background:${bg};color:${fg};font-size:12px;font-weight:500;line-height:1.3">${esc(name)} · ${esc(start)}–${esc(end)}</span>`
}

function minutesBetween(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let d = (eh * 60 + em) - (sh * 60 + sm)
  if (d <= 0) d += 24 * 60 // overnight shift
  return d
}

function buildHtml(opts: {
  member: { user_id: string; name: string; username: string; email: string }
  orgName: string
  range: string
  shifts: Array<{ user_id: string | null; name: string; day_index: number; start_time: string; end_time: string; break_minutes: number }>
  appUrl: string
  isUpdate: boolean
}) {
  const { member, orgName, range, shifts, appUrl, isUpdate } = opts
  const firstName = (member.name || 'there').split(' ')[0]
  const myShifts = shifts.filter(s => s.user_id === member.user_id)
  const totalMins = myShifts.reduce((acc, s) => acc + minutesBetween(s.start_time, s.end_time) - (s.break_minutes || 0), 0)
  const totalH = Math.floor(totalMins / 60)
  const totalM = totalMins % 60
  const headline = isUpdate ? 'Schedule updated' : 'Schedule published'
  const intro = isUpdate
    ? 'Your schedule was just updated. Here are the latest shifts.'
    : 'A new schedule has been published.'

  const myList = myShifts.length === 0
    ? `<div style="font-size:13px;color:#888;padding:6px 0">No shifts assigned this week.</div>`
    : DAYS.map((d, di) => {
        const dShifts = myShifts.filter(s => s.day_index === di)
        if (!dShifts.length) return ''
        return `<div style="padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.06)"><strong style="display:inline-block;min-width:46px;font-size:13px">${d}</strong>` +
          dShifts.map(s => `<span style="font-size:13px;background:#1D9E75;color:#fff;padding:3px 9px;border-radius:5px;margin-right:6px">${esc(s.start_time)} – ${esc(s.end_time)}</span>`).join('') +
          `</div>`
      }).join('')

  const fullWeek = DAYS.map((d, di) => {
    const dShifts = shifts.filter(s => s.day_index === di)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
    return `<div style="padding:10px 0;border-bottom:1px solid #f0f0ee"><strong style="display:inline-block;min-width:46px;font-size:13px;color:#666">${d}</strong>` +
      (dShifts.length === 0
        ? `<span style="color:#bbb;font-size:12px;font-style:italic">no shifts</span>`
        : dShifts.map(s => shiftBlock(s.name, s.start_time, s.end_time, s.user_id === member.user_id)).join('')) +
      `</div>`
  }).join('')

  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f3;margin:0;padding:24px;color:#1a1a1a">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 2px 8px rgba(0,0,0,0.04)">
  <div style="font-size:11px;font-weight:600;color:#1D9E75;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">${headline}</div>
  <h1 style="margin:0 0 6px 0;font-size:24px;font-weight:700;letter-spacing:-0.01em">${esc(orgName)}</h1>
  <div style="color:#888;font-size:14px;margin-bottom:24px">Week of ${esc(range)}</div>
  <p style="font-size:15px;margin:0 0 14px;line-height:1.5">Hi ${esc(firstName)},</p>
  <p style="font-size:14px;color:#555;margin:0 0 22px;line-height:1.5">${esc(intro)}</p>

  <div style="background:#E1F5EE;border-radius:10px;padding:16px 18px;margin-bottom:22px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
      <div style="font-size:11px;font-weight:600;color:#085041;text-transform:uppercase;letter-spacing:0.06em">Your shifts</div>
      <div style="font-size:11px;color:#085041;font-weight:600">${totalH}h ${totalM}m total</div>
    </div>
    ${myList}
  </div>

  <div style="font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Full team schedule</div>
  ${fullWeek}

  <div style="text-align:center;margin-top:28px">
    <a href="${esc(appUrl)}" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:600;font-size:14px">Open ShiftSync</a>
  </div>
  <div style="font-size:11px;color:#aaa;margin-top:28px;text-align:center">You’re receiving this because you are a member of ${esc(orgName)} on ShiftSync.</div>
</div>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'POST only' }, 405)

  let body: { schedule_id?: number; change_type?: 'published' | 'updated' }
  try { body = await req.json() } catch { return json({ error: 'invalid JSON' }, 400) }

  const schedule_id = body.schedule_id
  const change_type = body.change_type === 'updated' ? 'updated' : 'published'
  if (!schedule_id) return json({ error: 'schedule_id required' }, 400)

  const SUPA_URL          = Deno.env.get('SUPABASE_URL')!
  const SUPA_ANON         = Deno.env.get('SUPABASE_ANON_KEY')!
  const SUPA_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')
  const RESEND_FROM       = Deno.env.get('RESEND_FROM') || 'ShiftSync <onboarding@resend.dev>'
  const APP_URL           = Deno.env.get('APP_URL') || 'https://shiftsync.vercel.app'

  // Auth: caller must be admin of the schedule’s org.
  const auth = req.headers.get('authorization')
  if (!auth) return json({ error: 'auth required' }, 401)
  const userClient = createClient(SUPA_URL, SUPA_ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data: userResult } = await userClient.auth.getUser()
  const user = userResult?.user
  if (!user) return json({ error: 'invalid auth' }, 401)

  const admin = createClient(SUPA_URL, SUPA_SERVICE_ROLE, { auth: { persistSession: false } })

  const { data: sched, error: schErr } = await admin.from('schedules')
    .select('id, organization_id, period_start, period_end, published, last_notified_at, organizations:organization_id(name)')
    .eq('id', schedule_id).single()
  if (schErr || !sched) return json({ error: 'schedule not found' }, 404)

  const { data: mem } = await admin.from('organization_members')
    .select('role').eq('organization_id', sched.organization_id).eq('user_id', user.id).maybeSingle()
  if (!mem || mem.role !== 'admin') return json({ error: 'not authorized' }, 403)

  // Debounce: don’t notify if last notification was less than 60s ago
  if (sched.last_notified_at) {
    const last = new Date(sched.last_notified_at).getTime()
    if (Date.now() - last < 60_000) return json({ skipped: 'debounce', sent: 0 }, 200)
  }

  // Members + emails
  const { data: members, error: memErr } = await admin
    .rpc('get_org_member_emails', { org: sched.organization_id })
  if (memErr) return json({ error: 'could not load members: ' + memErr.message }, 500)

  // Shifts
  const { data: shiftsRaw } = await admin.from('shifts')
    .select('user_id, day_index, start_time, end_time, break_minutes, profiles:user_id(name)')
    .eq('schedule_id', schedule_id)
  const shifts = (shiftsRaw || []).map((s: any) => ({
    user_id: s.user_id, name: s.user_id ? (s.profiles?.name || 'Unknown') : 'Open shift',
    day_index: s.day_index, start_time: s.start_time, end_time: s.end_time, break_minutes: s.break_minutes || 0,
  }))

  if (!RESEND_API_KEY) {
    return json({
      sent: 0, skipped: 'no_resend_key',
      message: 'RESEND_API_KEY env var not set on this Edge Function. Set it in Supabase → Edge Functions → notify-schedule → Secrets.',
      preview: { recipients: (members || []).map((m: any) => m.email), shift_count: shifts.length },
    }, 200)
  }

  const subject = change_type === 'updated'
    ? `Schedule updated · ${sched.organizations.name}`
    : `Schedule published · ${sched.organizations.name}`
  const range = periodRange(sched.period_start, sched.period_end)

  let sent = 0
  const errors: any[] = []
  for (const m of (members || [])) {
    if (!m.email) continue
    const html = buildHtml({
      member: m, orgName: sched.organizations.name, range,
      shifts, appUrl: APP_URL, isUpdate: change_type === 'updated',
    })
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: RESEND_FROM, to: [m.email], subject, html }),
      })
      if (r.ok) sent++
      else errors.push({ email: m.email, status: r.status, body: await r.text() })
    } catch (e) {
      errors.push({ email: m.email, error: String(e) })
    }
  }

  await admin.from('schedules').update({ last_notified_at: new Date().toISOString() }).eq('id', schedule_id)

  return json({ sent, errors, total_recipients: (members || []).length })
})
