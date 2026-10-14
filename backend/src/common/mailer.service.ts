import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends mail through SMTP when `SMTP_URL` is set (e.g. smtps://user:pass@smtp.example.com:465, with `MAIL_FROM`).
 * Without it nothing leaves the machine: the message, including its link, is written to the log so development works.
 */
@Injectable()
export class MailerService {
  private readonly log = new Logger(MailerService.name);
  private readonly transport: Transporter | null = process.env.SMTP_URL ? createTransport(process.env.SMTP_URL) : null;
  private readonly from = process.env.MAIL_FROM ?? "Cineora <no-reply@cineora.local>";

  get enabled() {
    return !!this.transport;
  }

  /** Never throws: a mail failure must not break sign-up or the reset request. Returns whether it was handed off. */
  async send(mail: Mail): Promise<boolean> {
    if (!this.transport) {
      this.log.warn(`SMTP_URL not set; not sending. To: ${mail.to} | ${mail.subject}\n${mail.text}`);
      return false;
    }
    try {
      await this.transport.sendMail({ from: this.from, ...mail });
      return true;
    } catch (e) {
      this.log.error(`mail to ${mail.to} failed: ${(e as Error).message}`);
      return false;
    }
  }
}
