import { z } from 'zod';
import type { Database } from '../db/client.ts';
import { claimAdmissionNotice, finishAdmissionNotice } from '../repositories/admission-notices.ts';
import { absoluteUrl } from '../../shared/base-path.ts';
import { smtpTransportOptions, type SmtpConfig } from './mail.ts';
import nodemailer from 'nodemailer';

const noticeSchema = z.object({
  id: z.uuid(),
  global: z.boolean(),
  lease: z.uuid(),
  clubId: z.uuid().nullable(),
  applicationId: z.uuid(),
  clubName: z.string().nullable(),
  email: z.email(),
  locale: z.enum(['nl', 'en']),
});
export type AdmissionNotice = z.infer<typeof noticeSchema>;
export type DeliverAdmission = (notice: AdmissionNotice) => Promise<void>;
const escape = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
export function admissionReviewUrl(
  n: AdmissionNotice,
  origin: string,
  base: string,
  approve: boolean,
): string {
  const url = new URL(absoluteUrl(origin, base, `/admission/${n.applicationId}`));
  url.searchParams.set('decision', approve ? 'accept' : 'reject');
  if (n.global) url.searchParams.set('scope', 'platform');
  else if (n.clubId) url.searchParams.set('club', n.clubId);
  return url.toString();
}
export function admissionMessage(n: AdmissionNotice, origin: string, base: string) {
  const nl = n.locale === 'nl';
  const subject = n.global
    ? nl
      ? 'Nieuwe RowLens-aanvraag zonder club'
      : 'New RowLens application without a club'
    : nl
      ? `Nieuwe aanmelding voor ${n.clubName ?? ''}`
      : `New application for ${n.clubName ?? ''}`;
  const intro = nl
    ? 'Er is een nieuwe aanmelding. Log in om de aanvraag te beoordelen en je keuze te bevestigen.'
    : 'There is a new application. Sign in to review it and confirm your decision.';
  const labels = nl
    ? (['Aanmelding accepteren', 'Aanmelding afwijzen'] as const)
    : (['Accept application', 'Reject application'] as const);
  const urls = [true, false].map((approve) => admissionReviewUrl(n, origin, base, approve));
  return {
    subject,
    text: `${subject}\n\n${intro}\n\n${labels[0]}: ${urls[0] ?? ''}\n\n${labels[1]}: ${urls[1] ?? ''}`,
    html: `<h1>${escape(subject)}</h1><p>${intro}</p>${urls.map((url, i) => `<p><a href="${escape(url)}">${labels[i] ?? ''}</a></p>`).join('')}`,
  };
}
export function smtpAdmissionDelivery(
  config: SmtpConfig,
  origin: string,
  base: string,
): DeliverAdmission {
  const transport = nodemailer.createTransport(smtpTransportOptions(config));
  return async (notice) => {
    await transport.sendMail({
      from: config.from,
      to: notice.email,
      ...admissionMessage(notice, origin, base),
    });
  };
}
/** Claim/finish commit separately: SMTP never holds a database transaction open. */
export async function dispatchAdmission(db: Database, deliver: DeliverAdmission): Promise<boolean> {
  const raw = await claimAdmissionNotice(db);
  if (raw == null) return false;
  const n = noticeSchema.parse(raw);
  let accepted = false;
  try {
    await deliver(n);
    accepted = true;
  } catch {
    /* Safe persisted retry; never log recipient/body/SMTP exception. */
  }
  await finishAdmissionNotice(db, n, accepted);
  return true;
}
export function startAdmissionDispatcher(
  db: Database,
  deliver: DeliverAdmission,
  failed: () => void,
) {
  const controller = new AbortController();
  let running: Promise<void> | null = null;
  const tick = () => {
    if (controller.signal.aborted || running) return;
    running = (async () => {
      for (let i = 0; i < 20; i++) {
        if (controller.signal.aborted || !(await dispatchAdmission(db, deliver))) break;
      }
    })()
      .catch(failed)
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return async () => {
    controller.abort();
    clearInterval(timer);
    await running;
  };
}
