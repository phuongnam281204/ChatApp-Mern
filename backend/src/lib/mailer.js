import nodemailer from "nodemailer";

export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

export async function sendPasswordResetEmail({ to, name, token }) {
  const origin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
  const link = `${origin}/?reset=${encodeURIComponent(token)}`;
  const greeting = name ? `Chào ${name},` : "Chào bạn,";

  await getTransporter().sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: "Đặt lại mật khẩu Memo Chat",
    text: [
      greeting,
      "",
      "Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu Memo Chat.",
      `Mở liên kết sau trong 15 phút để đặt mật khẩu mới: ${link}`,
      "",
      "Nếu không phải bạn, hãy bỏ qua email này. Mật khẩu hiện tại vẫn giữ nguyên.",
    ].join("\n"),
  });
}
