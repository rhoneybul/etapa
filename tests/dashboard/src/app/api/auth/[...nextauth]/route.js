import NextAuth from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';

const allowedUsers = (process.env.ALLOWED_GITHUB_USERS || '')
  .split(',')
  .map(u => u.trim().toLowerCase())
  .filter(Boolean);

const handler = NextAuth({
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (allowedUsers.length === 0) return true;
      return allowedUsers.includes((profile?.login || '').toLowerCase());
    },
    async session({ session, token }) {
      session.user.login = token.login;
      return session;
    },
    async jwt({ token, profile }) {
      if (profile) token.login = profile.login;
      return token;
    },
  },
});

export { handler as GET, handler as POST };
