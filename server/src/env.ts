import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try workspace parent first, then fallback to current folder
const parentEnvPath = path.join(process.cwd(), '../.env');
const currentEnvPath = path.join(process.cwd(), '.env');

if (fs.existsSync(parentEnvPath)) {
  dotenv.config({ path: parentEnvPath });
} else {
  dotenv.config({ path: currentEnvPath });
}
