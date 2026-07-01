import { getSqlite, isProduction } from './server/src/db/migrate';
import { getLastJobRun } from './server/src/db/repository';

async function test() {
  const db = getSqlite();
  
  console.log("All job runs:");
  const runs = db.prepare("SELECT * FROM job_runs").all();
  console.log(JSON.stringify(runs, null, 2));

  console.log("\nQuery 'fred%':");
  const row = db.prepare("SELECT status, ran_at FROM job_runs WHERE adapter LIKE ? ORDER BY ran_at DESC LIMIT 1").get("fred%");
  console.log("Result:", row);
  
  const healthRes = await getLastJobRun('fred');
  console.log("getLastJobRun('fred') result:", healthRes);
}

test();
