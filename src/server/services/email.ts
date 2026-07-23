export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailMessage {
  to: EmailAddress;
  from: EmailAddress;
  replyTo?: EmailAddress;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export interface MagicLinkEmailData {
  to: EmailAddress;
  magicLinkUrl: string;
  expiryMinutes: number;
}

export class EmailService {
  constructor(private provider: EmailProvider) {}

  async sendMagicLink(data: MagicLinkEmailData): Promise<void> {
    const fromEmail = process.env.FROM_EMAIL as string;
    const fromName = process.env.FROM_NAME as string;
    const replyTo = process.env.REPLY_TO_EMAIL;

    const message: EmailMessage = {
      to: data.to,
      from: {
        email: fromEmail,
        name: fromName,
      },
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
      // Unique per send so Gmail doesn't collapse consecutive magic links into
      // one thread — the recipient always sees the newest link.
      headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
      subject: "Your magic link to sign in",
      html: this.renderMagicLinkTemplate(data),
      text: this.renderMagicLinkText(data),
    };

    await this.provider.send(message);
  }

  private renderMagicLinkTemplate(data: MagicLinkEmailData): string {
    const appName = (process.env.APP_NAME as string).toUpperCase();
    const appUrl = process.env.APP_URL ?? "https://wanthave.app";
    const logoUrl = `${appUrl}/email-logo.png`;

    // Brand palette (from src/client/style.css :root), inlined as literal hex —
    // email clients don't support CSS variables or external stylesheets.
    const paper = "#f7f4ec"; // warm cream page background
    const card = "#fffdf8"; // panel surface
    const ink = "#17161a"; // primary text
    const muted = "#6f6a7a"; // secondary text
    const edge = "#e7e1d4"; // soft border on cream
    const want = "#e5b35b"; // foil-amber accent / button
    const have = "#7fcbd9"; // holo-ice accent
    const onWant = "#0c0b0e"; // ink on amber button
    const fontStack =
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>Sign in to ${appName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${paper}; font-family: ${fontStack}; -webkit-text-size-adjust: 100%;">
  <span style="display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; overflow: hidden; mso-hide: all;">Your secure sign-in link — expires in ${data.expiryMinutes} minutes.</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${paper};">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 600px; max-width: 100%;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding: 8px 0 28px;">
              <img src="${logoUrl}" alt="${appName}" width="200" style="display: block; width: 200px; max-width: 60%; height: auto; border: 0;">
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color: ${card}; border: 1px solid ${edge}; border-radius: 20px; box-shadow: 0 12px 40px rgba(23,22,26,0.06); overflow: hidden;">
              <!-- Seam accent (amber → ice, solid split so Outlook keeps it) -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="50%" height="4" style="background-color: ${want}; font-size: 0; line-height: 4px;">&nbsp;</td>
                  <td width="50%" height="4" style="background-color: ${have}; font-size: 0; line-height: 4px;">&nbsp;</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding: 40px 40px 36px;">
                    <h1 style="margin: 0 0 12px; font-size: 24px; line-height: 1.25; font-weight: 700; color: ${ink};">Sign in to ${appName}</h1>
                    <p style="margin: 0 0 32px; font-size: 16px; line-height: 1.6; color: ${muted};">
                      Tap the button below to sign in. This link is single-use and expires in ${data.expiryMinutes} minutes.
                    </p>
                    <!-- Button -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="${want}" style="border-radius: 8px;">
                          <a href="${data.magicLinkUrl}" target="_blank" style="display: inline-block; padding: 14px 34px; font-size: 16px; font-weight: 600; color: ${onWant}; text-decoration: none; border-radius: 8px;">
                            Sign in
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 32px 0 8px; font-size: 13px; line-height: 1.5; color: ${muted};">
                      If the button doesn't work, copy and paste this link into your browser:
                    </p>
                    <p style="margin: 0; font-size: 13px; line-height: 1.5;">
                      <a href="${data.magicLinkUrl}" style="color: ${ink}; word-break: break-all;">${data.magicLinkUrl}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 28px 24px 8px;">
              <p style="margin: 0 0 6px; font-size: 13px; line-height: 1.5; color: ${muted};">
                Didn't request this? You can safely ignore this email.
              </p>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; font-weight: 700; letter-spacing: -0.01em;">
                <span style="color: ${want};">want</span><span style="color: ${have};">have</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private renderMagicLinkText(data: MagicLinkEmailData): string {
    return `Sign in to ${(process.env.APP_NAME as string).toUpperCase()}

Tap the link below to sign in. This link is single-use and expires in ${data.expiryMinutes} minutes:
${data.magicLinkUrl}

Didn't request this? You can safely ignore this email.`;
  }
}

let emailServiceInstance: EmailService | null = null;

const providerFactories: Record<string, () => EmailProvider> = {
  console: () => {
    const { ConsoleLogProvider } =
      require("./email-providers/console") as typeof import("./email-providers/console");
    return new ConsoleLogProvider();
  },
  resend: () => {
    const { ResendProvider } =
      require("./email-providers/resend") as typeof import("./email-providers/resend");
    return new ResendProvider(process.env.RESEND_API_KEY as string);
  },
};

export function registerEmailProvider(
  name: string,
  factory: () => EmailProvider,
): void {
  providerFactories[name] = factory;
}

export const getEmailService = (): EmailService => {
  if (!emailServiceInstance) {
    const providerName = process.env.EMAIL_PROVIDER as string;
    const factory = providerFactories[providerName];

    if (!factory) {
      throw new Error(
        `Unknown EMAIL_PROVIDER "${providerName}". ` +
          "Register it with registerEmailProvider() before calling getEmailService().",
      );
    }

    emailServiceInstance = new EmailService(factory());
  }
  return emailServiceInstance;
};

export const setEmailService = (service: EmailService): void => {
  emailServiceInstance = service;
};
