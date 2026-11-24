// Receives the forms of the site (POST /api/form) and mails them to Gatra.
// Settings come from the environment: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS or SMTP_PASS_FILE, MAIL_FROM, MAIL_TO.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';

const env = process.env;
const port = Number(env.SMTP_PORT || 465);
const pass = env.SMTP_PASS_FILE ? readFileSync(env.SMTP_PASS_FILE, 'utf8').replace(/\r?\n$/, '') : env.SMTP_PASS;
const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port,
  secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass } : undefined,
});
const mailFrom = env.MAIL_FROM || env.SMTP_USER;
const mailTo = env.MAIL_TO || env.SMTP_USER;

// Per form: the subject and the fields it may contain. Anything else in a request is ignored.
const forms = {
  contact: {
    subject: 'Contactformulier',
    fields: [
      { name: 'naam', label: 'Naam', required: true },
      { name: 'organisatie', label: 'Organisatie', required: true },
      { name: 'email', label: 'E-mail', required: true, email: true },
      { name: 'telefoon', label: 'Telefoon' },
      { name: 'bericht', label: 'Bericht', required: true, long: true },
    ],
  },
  spelalfabet: {
    subject: 'Download spelalfabet',
    fields: [
      { name: 'naam', label: 'Naam', required: true },
      { name: 'email', label: 'E-mail', required: true, email: true },
      { name: 'bedrijf', label: 'Bedrijf', required: true },
    ],
  },
  'gedrukte-versie': {
    subject: 'Aanvraag gedrukte versie spelalfabet',
    fields: [
      { name: 'naam', label: 'Naam', required: true },
      { name: 'email', label: 'E-mail', required: true, email: true },
      { name: 'organisatie', label: 'Organisatie' },
      { name: 'aantal', label: 'Aantal', required: true },
      { name: 'toevoeging', label: 'Toevoeging', long: true },
    ],
  },
};

// At most 8 attempts per 10 minutes from one address.
const seen = new Map();
function tooMany(ip) {
  const now = Date.now();
  const times = (seen.get(ip) || []).filter((t) => now - t < 600_000);
  times.push(now);
  seen.set(ip, times);
  if (seen.size > 5000) seen.clear();
  return times.length > 8;
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 20_000) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (req.method === 'GET' && path === '/api/health') return reply(res, 200, { ok: true });
  if (req.method !== 'POST' || path !== '/api/form') return reply(res, 404, { ok: false });

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').pop().trim();
  if (tooMany(ip)) return reply(res, 429, { ok: false, error: 'Te veel berichten. Probeer het later opnieuw.' });

  let data;
  try { data = JSON.parse(await readBody(req)); } catch { return reply(res, 400, { ok: false }); }
  const form = Object.hasOwn(forms, data?.form) ? forms[data.form] : null;
  const input = data?.fields;
  if (!form || typeof input !== 'object' || input === null) return reply(res, 400, { ok: false });

  // The hidden field "website" is only ever filled in by robots: say thanks and send nothing.
  if (input.website) return reply(res, 200, { ok: true });

  const lines = [];
  const values = {};
  for (const field of form.fields) {
    let value = typeof input[field.name] === 'string' ? input[field.name].trim() : '';
    if (!field.long) value = value.replace(/[\r\n]+/g, ' ');
    value = value.slice(0, field.long ? 5000 : 200);
    if (field.required && !value) return reply(res, 400, { ok: false, error: `${field.label} ontbreekt.` });
    if (field.email && !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value)) return reply(res, 400, { ok: false, error: 'Het e-mailadres klopt niet.' });
    values[field.name] = value;
    if (value) lines.push(field.long ? `${field.label}:\n${value}` : `${field.label}: ${value}`);
  }

  try {
    await transport.sendMail({
      from: { name: 'Website gatra.nl', address: mailFrom },
      to: mailTo,
      replyTo: { name: values.naam, address: values.email },
      subject: `${form.subject}: ${values.naam}`,
      text: `${form.subject} via de website\n\n${lines.join('\n')}\n`,
    });
  } catch (error) {
    console.error('mail failed:', error.message);
    return reply(res, 502, { ok: false });
  }
  console.log('sent', data.form);
  reply(res, 200, { ok: true });
}).listen(Number(env.PORT || 8080), () => console.log('form service listening'));
