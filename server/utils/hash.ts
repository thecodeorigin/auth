import { digest } from 'ohash'

export function sha256Base64Url(input: string): string {
  return digest(input)
}
