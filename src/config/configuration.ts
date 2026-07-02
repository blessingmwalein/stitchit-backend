export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3001', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    appUrl: process.env.APP_URL ?? 'http://localhost:3001',
    adminUrl: process.env.ADMIN_URL ?? 'http://localhost:3000',
    webUrl: process.env.WEB_URL ?? 'https://stitchit.co.zw',
    corsOrigins: [
      // Always include production domains
      'https://stitchit-admin.vercel.app',
      'https://stitchit.co.zw',
      // Plus any extra origins from env (local dev, staging, etc.)
      ...(process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3002,http://localhost:3003')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ],
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '2592000', 10),
  },
  s3: {
    endPoint: process.env.S3_ENDPOINT ?? 'localhost',
    port: parseInt(process.env.S3_PORT ?? '9000', 10),
    useSSL: process.env.S3_USE_SSL === 'true',
    accessKey: process.env.S3_ACCESS_KEY ?? 'stitchit',
    secretKey: process.env.S3_SECRET_KEY ?? 'stitchit_dev_password',
    bucketFiles: process.env.S3_BUCKET_FILES ?? 'stitchit-files',
    bucketDocuments: process.env.S3_BUCKET_DOCUMENTS ?? 'stitchit-documents',
    publicUrl: process.env.S3_PUBLIC_URL ?? 'http://localhost:9000',
  },
  mail: {
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT ?? '587', 10),
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER,
    password: process.env.MAIL_PASSWORD,
    from: process.env.MAIL_FROM ?? "Stitch't <no-reply@stitchit.co.zw>",
  },
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v21.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? 'stitchit-webhook-verify',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  },
  paynow: {
    integrationId: process.env.PAYNOW_INTEGRATION_ID,
    integrationKey: process.env.PAYNOW_INTEGRATION_KEY,
    resultUrl: process.env.PAYNOW_RESULT_URL,
    returnUrl: process.env.PAYNOW_RETURN_URL,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  },
  pdf: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL ??
      `${process.env.APP_URL ?? 'http://localhost:3001'}/${process.env.API_PREFIX ?? 'api/v1'}/auth/google/callback`,
  },
});
