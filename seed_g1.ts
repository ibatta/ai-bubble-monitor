import { getSqlite } from './server/src/db/migrate';
import { runG1 } from './server/src/indicators/G1_enterprise_adoption';

async function seed() {
  const db = getSqlite();
  
  // Seed G1 manual entry
  db.prepare(
    `INSERT INTO manual_ledger (indicator_id, payload_json, entered_by, note)
     VALUES (?, ?, ?, ?)`
  ).run(
    'G1',
    JSON.stringify({ adoptionPct: 18.5, surveyName: 'McKinsey State of AI 2025' }),
    'admin',
    'Initial seed'
  );
  
  console.log("Successfully seeded manual ledger for G1.");
  
  // Run G1 scorer
  await runG1();
  console.log("G1 indicator scored.");
}

seed();
