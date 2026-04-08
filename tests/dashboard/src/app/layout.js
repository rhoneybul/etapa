import { Inter } from 'next/font/google';
import AuthProvider from '@/components/AuthProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Etapa — Test Dashboard',
  description: 'AI plan generator test runner and results viewer',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ background: '#0f0f13', color: '#e4e4ef', minHeight: '100vh' }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
