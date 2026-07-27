import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

const nextAuthSecret =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== "production" ? "dev-only-secret-change-me" : undefined)

if (!nextAuthSecret) {
  throw new Error("NEXTAUTH_SECRET is required in production")
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const normalizedEmail = credentials.email.trim().toLowerCase()
        
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail }
        })
        
        if (!user || !user.password_hash) return null
        
        const isPasswordValid = await bcrypt.compare(credentials.password, user.password_hash)
        
        if (!isPasswordValid) return null
        
        return { 
          id: user.id, 
          email: user.email, 
          name: user.full_name, 
          image: user.avatar_url 
        }
      }
    })
  ],
  session: { strategy: "jwt" },
  secret: nextAuthSecret,
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
      }

      if (trigger === "update" && typeof token.id === "string") {
        const currentUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { full_name: true, email: true, avatar_url: true },
        })

        if (currentUser) {
          token.name = currentUser.full_name
          token.email = currentUser.email
          token.picture = currentUser.avatar_url
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user && token) {
        const sessionUser = session.user as typeof session.user & { id?: string }
        sessionUser.id = token.id as string
        sessionUser.name = token.name ?? null
        sessionUser.email = token.email ?? null
        sessionUser.image = token.picture ?? null
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
  }
}
