import "server-only";
import nodemailer from "nodemailer";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não configurado.`);
  return value;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}

function transport() {
  const port = Number(process.env.SMTP_PORT ?? "465");
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.hostinger.com",
    port,
    secure: (process.env.SMTP_SECURE ?? "true").toLowerCase() === "true",
    auth: { user: required("SMTP_USER"), pass: required("SMTP_PASSWORD") },
  });
}

export async function sendPasswordResetCode(params: { to: string; name: string; code: string }) {
  const from = process.env.EMAIL_FROM?.trim() || `Pulso <${required("SMTP_USER")}>`;
  const safeName = escapeHtml(params.name);
  const safeCode = escapeHtml(params.code);

  await transport().sendMail({
    from,
    to: params.to,
    subject: "Código para recuperar a sua palavra-passe",
    text: `Olá, ${params.name}. O seu código de confirmação Pulso é ${params.code}. O código expira em 10 minutos. Se não pediu esta alteração, ignore este email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#10201c">
        <h1 style="font-size:20px;margin:0 0 16px">Recuperação de palavra-passe</h1>
        <p>Olá, ${safeName}.</p>
        <p>Use este código de confirmação para definir uma nova palavra-passe:</p>
        <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:24px 0">${safeCode}</p>
        <p>O código expira em 10 minutos e só pode ser utilizado uma vez.</p>
        <p style="color:#5c716b;font-size:13px">Se não pediu esta alteração, ignore este email.</p>
      </div>`,
  });
}
