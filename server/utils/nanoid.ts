import { nanoid } from 'nanoid'

export function randomToken(size = 32): string {
  return nanoid(size)
}
