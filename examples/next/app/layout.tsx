export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui', maxWidth: '32rem', margin: '4rem auto' }}>
        {children}
      </body>
    </html>
  )
}
