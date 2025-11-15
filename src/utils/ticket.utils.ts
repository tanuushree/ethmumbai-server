import * as crypto from 'crypto';

export function generateTicketCode(email: string): string {
  const hash = crypto.createHash('sha256').update(email).digest('hex');
  const shortHash = hash.substring(0, 8); // first 8 chars
  const random = Math.random().toString(36).substring(2, 6); // adds randomness
  return `${shortHash}-${random}`.toUpperCase(); 
}