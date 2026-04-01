import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { etapaFetch } from "./etapa-api";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Check if the user has is_admin: true in Supabase via the Etapa API
      try {
        const result = await etapaFetch(`/api/admin/check?email=${encodeURIComponent(user.email || "")}`);
        return result?.isAdmin === true;
      } catch (err) {
        console.error("Admin check failed:", err);
        return false;
      }
    },
    async session({ session }) {
      if (session.user?.email) {
        (session as any).isAdmin = true; // They passed signIn, so they're admin
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
