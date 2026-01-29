import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '@bostonia/database';
import { getEnv } from '@bostonia/shared';
import { logger } from './logger.js';

export function configurePassport() {
  // Google OAuth Strategy
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (googleClientId && googleClientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL: getEnv('GOOGLE_CALLBACK_URL', '/api/auth/google/callback'),
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email provided by Google'));
            }

            // Find or create user
            let user = await prisma.user.findFirst({
              where: {
                oauthAccounts: {
                  some: {
                    provider: 'GOOGLE',
                    providerAccountId: profile.id,
                  },
                },
              },
              include: { oauthAccounts: true },
            });

            if (!user) {
              // Check if user exists with this email
              user = await prisma.user.findUnique({
                where: { email },
                include: { oauthAccounts: true },
              });

              if (user) {
                // Link OAuth account to existing user
                await prisma.oAuthAccount.create({
                  data: {
                    userId: user.id,
                    provider: 'GOOGLE',
                    providerAccountId: profile.id,
                    accessToken,
                    refreshToken,
                  },
                });
              } else {
                // Create new user
                const username = `user_${profile.id.slice(0, 8)}`;
                user = await prisma.user.create({
                  data: {
                    email,
                    username,
                    displayName: profile.displayName,
                    avatarUrl: profile.photos?.[0]?.value,
                    emailVerified: true,
                    oauthAccounts: {
                      create: {
                        provider: 'GOOGLE',
                        providerAccountId: profile.id,
                        accessToken,
                        refreshToken,
                      },
                    },
                    preferences: {
                      create: {},
                    },
                  },
                  include: { oauthAccounts: true },
                });
              }
            }

            return done(null, user);
          } catch (error) {
            logger.error(error, 'Google OAuth error');
            return done(error as Error);
          }
        }
      )
    );
  }

  // Serialize/Deserialize (for session-based auth, not used with JWT)
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
}
