
export default () => ({
  port: parseInt(process.env.PORT ?? '', 10) || 3000,
  database_url: process.env.DATABASE_URL!,
  bcrypt_salt_round: parseInt(process.env.BCRYPT_SALT_ROUND!),
  jwt_access_token_secret: process.env.JWT_ACCESS_SECRET!,
  jwt_access_token_expiration_time: process.env.JWT_ACCESS_EXPIRES_IN!,
  jwt_refresh_token_secret: process.env.JWT_REFRESH_SECRET!,
  jwt_refresh_token_expiration_time: process.env.JWT_REFRESH_EXPIRES_IN!,
});
