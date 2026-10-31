
export default () => ({
  port: parseInt(process.env.PORT ?? '', 10) || 3000,
  database_url: process.env.DATABASE_URL!,
  bcrypt_salt_round: parseInt(process.env.BCRYPT_SALT_ROUND!),
});
