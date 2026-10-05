require('dotenv').config();
const { createAuthServer } = require('./auth-server');

const required = ['MONGODB_URI', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AUTH_PUBLIC_URL'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const port = Number(process.env.PORT || 8787);
createAuthServer({
  mongoUri: process.env.MONGODB_URI,
  mongoDbName: process.env.MONGODB_DB || 'notetaker',
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  publicUrl: process.env.AUTH_PUBLIC_URL.replace(/\/$/, ''),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET
}).then(({ server }) => {
  server.listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log(`Authentication server listening on ${process.env.HOST || '127.0.0.1'}:${port}`);
  });
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
