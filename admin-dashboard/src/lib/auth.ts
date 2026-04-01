import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { admins } from "./seed-data";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only allow sign-in if email is in the admins list
      const isAdmin = admins.some((a) => a.email === user.email);
      return isAdmin;
    },
    async session({ session }) {
      if (session.user?.email) {
        const admin = admins.find((a) => a.email === session.user!.email);
        if (admin) {
          (session as any).isAdmin = true;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
