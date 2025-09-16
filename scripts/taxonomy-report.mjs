#!/usr/bin/env node
// Consolidated taxonomy analytics report
// Usage: node NudeShared/scripts/taxonomy-report.mjs [--json]
import { initDb, query } from '../server/db/db.js';
import { runMigrations } from '../server/db/migrate.js';

async function main(){
  const started = Date.now();
  try { await initDb(); } catch { /* allow runMigrations to attempt again if needed */ }
  try { await runMigrations(); } catch { /* migrations may already be applied in test harness */ }
  // Remaining legacy categories
  const { rows: remainRows } = await query(`SELECT COUNT(1) AS c FROM media WHERE category IS NOT NULL AND category <> ''`);
  const remainingCategories = Number(remainRows?.[0]?.c||0);
  // Top tags
  const { rows: tagRows } = await query(`SELECT tag, COUNT(1) AS uses FROM media_tags GROUP BY tag ORDER BY uses DESC, tag ASC LIMIT 50`);
  // Pair count sample (cooccurrence cardinality)
  const { rows: pairRows } = await query(`SELECT COUNT(1) AS pairs FROM (
      SELECT t1.tag AS a, t2.tag AS b
      FROM media_tags t1 JOIN media_tags t2 ON t1.media_id = t2.media_id AND t1.tag < t2.tag
      GROUP BY t1.tag, t2.tag
    ) sub`);
  // Coverage (reuse coverage logic limited to 2000)
  const { rows: coverageRows } = await query(`SELECT m.id, COUNT(mt.tag) AS tag_count FROM media m LEFT JOIN media_tags mt ON m.id = mt.media_id GROUP BY m.id ORDER BY m.id DESC LIMIT 2000`);
  const total = coverageRows.length; let with1=0; for(const r of coverageRows){ if(Number(r.tag_count||0)>=1) with1++; }
  const coveragePercent = total? with1/total : 0;
  const out = {
    ok:true,
    remainingCategories,
    topTags: tagRows.map(r=> ({ tag:r.tag, uses:Number(r.uses) })),
    pairCardinality: Number(pairRows?.[0]?.pairs||0),
    coverage: { total, withMin: with1, percent: Number(coveragePercent.toFixed(4)), min:1 },
    generatedAt: new Date().toISOString(),
    ms: Date.now()-started
  };
  if(process.argv.includes('--json')){
    console.log(JSON.stringify(out));
  } else {
    console.log('# Taxonomy Report');
    console.log('Remaining legacy categories:', remainingCategories);
    console.log('Coverage >=1 tag:', `${with1}/${total} (${(coveragePercent*100).toFixed(2)}%)`);
    console.log('Distinct tag pairs (sampled):', out.pairCardinality);
    console.log('Top tags:');
    for(const t of out.topTags){ console.log(' -', t.tag, t.uses); }
  }
}
main().catch(e=> { console.error(JSON.stringify({ ok:false, error:e.message })); /* Keep exit code 0 to ease CI consumption */ process.exit(0); });
