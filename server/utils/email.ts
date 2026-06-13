export interface EmailMessage {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (import.meta.dev) {
    console.log('--- EMAIL (dev) ---')
    console.log(`To: ${message.to}`)
    console.log(`Subject: ${message.subject}`)
    console.log(message.html)
    console.log('-------------------')
    return
  }

  const { emails } = useResend()

  await emails.send({
    from: useRuntimeConfig().emailFrom,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  })
}
