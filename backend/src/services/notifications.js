const nodemailer = require('nodemailer');

let transporter;
function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  }
  return transporter;
}

async function sendPasswordReset(email, link) {
  const mailer = getTransporter();
  if (!mailer) {
    console.info(`[demo password reset] ${email}: ${link}`);
    return { delivery: 'development-log' };
  }
  await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Reset your ERA demo password',
    text: `Use this link to reset your password: ${link}\nThis link expires in 30 minutes.`
  });
  return { delivery: 'email' };
}

module.exports = { sendPasswordReset };
