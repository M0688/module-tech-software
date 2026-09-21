// Shared helpers for the workshop software
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://eazzljgezdownmcddeyr.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Tk5nuWw8LkpIb73ttPIlBw_zdT567D6';
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export const $ = id => document.getElementById(id);

export function show(el, text, kind) { el.textContent = text; el.className = 'msg show ' + kind; }
export function hide(el) { el.className = 'msg'; }

export function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function when(ts) {
  return ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export function money(n) { return '£' + Number(n || 0).toFixed(2); }

export function ukNumber(raw) {
  const digits = String(raw || '').replace(/[^0-9+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('44')) return digits;
  if (digits.startsWith('0')) return '44' + digits.slice(1);
  return digits;
}

// On a computer, hand the message to the WhatsApp desktop app.
// On a phone, wa.me opens the app anyway.
export const onPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const waTarget = onPhone ? '_blank' : '_self';

export function waLink(phone, message) {
  const num = ukNumber(phone);
  const text = encodeURIComponent(message || '');
  if (onPhone) return 'https://wa.me/' + (num || '') + '?text=' + text;
  return 'whatsapp://send?' + (num ? 'phone=' + num + '&' : '') + 'text=' + text;
}

// Header + tabs, shared by every page
export function chrome(active) {
  const tabs = [
    ['workshop.html', 'Jobs'],
    ['contacts.html', 'Contacts'],
    ['leads.html', 'Leads'],
    ['diagnose.html', 'Diagnostic'],
    ['knowledge.html', 'Knowledge'],
    ['reports.html', 'Reports']
  ];
  document.body.insertAdjacentHTML('afterbegin', `
    <header><div class="wrap">
      <div class="brand">PRECISION ELECTRONICS REPAIR · WORKSHOP</div>
      <div class="who" id="who" style="display:none"><span id="whoEmail"></span><button id="signOut">Sign out</button></div>
    </div></header>
    <nav class="tabs"><div class="wrap">
      ${tabs.map(([href, label]) => `<a href="${href}"${href === active ? ' class="on"' : ''}>${label}</a>`).join('')}
    </div></nav>`);

  $('signOut').addEventListener('click', async () => { await sb.auth.signOut(); location.href = 'workshop.html'; });
}

// Returns the session, or sends you to the sign-in page
export async function requireSession() {
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.href = 'workshop.html'; return null; }
  const who = $('who');
  if (who) { $('whoEmail').textContent = data.session.user.email; who.style.display = 'flex'; }
  return data.session;
}
