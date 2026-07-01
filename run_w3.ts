import './server/src/env';
import { runW3 } from './server/src/indicators/W3_competitive_shock';

async function main() {
  console.log("Triggering W3 run...");
  await runW3();
  console.log("W3 run complete.");
}

main();
