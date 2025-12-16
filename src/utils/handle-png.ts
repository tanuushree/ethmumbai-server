import * as fs from 'fs';
import * as path from 'path';

export function savePngFromDataUrl(dataUrl: string, filePath: string) {
  // Extract only the Base64 part
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');

  // Convert Base64 → Buffer
  const imgBuffer = Buffer.from(base64Data, 'base64');

  // Ensure folder exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Save file
  fs.writeFileSync(filePath, imgBuffer);

  return filePath;
}

export function getPngBufferFromDataUrl(dataUrl: string): Buffer {
  // Remove base64 header
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  console.log(base64Data);

  // Convert Base64 → Buffer
  return Buffer.from(base64Data, 'base64');
}
