export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }

  const { name, email, role, phone, budget, timeline, source, message } = data;

  if (!name?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email?.trim())) {
    return json({ ok: false, error: 'Name and valid email are required.' }, 400);
  }

  const sources = Array.isArray(source) ? source : [source].filter(Boolean);
  const cleanName = name.trim();
  const cleanEmail = email.trim();

  const description = [
    `**Role:** ${role || '—'}`,
    `**Email:** ${cleanEmail}`,
    `**Phone:** ${phone || '—'}`,
    `**Budget:** ${budget || '—'}`,
    `**Timeline:** ${timeline || '—'}`,
    `**Source:** ${sources.join(', ') || '—'}`,
    '',
    '**Message:**',
    message || '—',
  ].join('\n');

  const [clickupRes, resendRes] = await Promise.allSettled([
    fetch(`https://api.clickup.com/api/v2/list/${env.CLICKUP_LIST_ID}/task`, {
      method: 'POST',
      headers: {
        Authorization: env.CLICKUP_API_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `New Inquiry — ${cleanName}`,
        description,
        status: 'fresh leads',
        priority: budget === '$20K+' ? 2 : 3,
      }),
    }),

    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'UGHD Studios <noreply@ughdstudios.com>',
        to: ['contact@ughdstudios.com'],
        subject: `New Inquiry — ${cleanName} | ${budget || 'Budget TBD'} | ${timeline || 'Timeline TBD'}`,
        html: buildEmailHtml({ name: cleanName, email: cleanEmail, role, phone, budget, timeline, sources, message }),
      }),
    }),
  ]);

  if (clickupRes.status === 'rejected') {
    console.error('ClickUp error:', clickupRes.reason);
  }
  if (resendRes.status === 'rejected') {
    console.error('Resend error:', resendRes.reason);
  }

  return json({ ok: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildEmailHtml({ name, email, role, phone, budget, timeline, sources, message }) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const row = (label, value) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:6px 0">${value}</td></tr>`;

  return `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;color:#111">
      <div style="background:#000;padding:24px 32px">
        <span style="color:#fff;font-size:18px;font-weight:600;letter-spacing:0.04em">UGHD STUDIOS</span>
      </div>
      <div style="padding:32px">
        <h2 style="margin:0 0 24px">New Inquiry — ${esc(name)}</h2>
        <table style="border-collapse:collapse;width:100%">
          ${row('Role', esc(role) || '—')}
          ${row('Email', `<a href="mailto:${esc(email)}" style="color:#000">${esc(email)}</a>`)}
          ${row('Phone', esc(phone) || '—')}
          ${row('Budget', `<strong>${esc(budget) || '—'}</strong>`)}
          ${row('Timeline', esc(timeline) || '—')}
          ${row('Source', esc(sources.join(', ')) || '—')}
        </table>
        <h3 style="margin:28px 0 10px;border-top:1px solid #eee;padding-top:20px">Message</h3>
        <p style="white-space:pre-wrap;background:#f7f7f7;padding:16px;border-radius:6px;margin:0">${esc(message) || '—'}</p>
      </div>
    </div>
  `;
}
