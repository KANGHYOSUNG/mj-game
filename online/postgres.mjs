import {readFileSync} from 'node:fs';

// Queries are fixed SQL from api.mjs; only values are supplied by players.
export function postgresQuery(sql) {
  let position=0;
  return sql.replace(/\?/g,()=>`$${++position}`);
}
const numericFields=new Set(['score','bestDamage','plays','count','started_at','created_at','reset_at']);
function normalize(row) {
  if(!row)return row;
  return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,numericFields.has(key) && value!==null ? Number(value) : value]));
}
export function postgresAdapter(query) {
  return {
    get:async(sql,args)=>normalize((await query(postgresQuery(sql),args))[0]),
    all:async(sql,args)=>(await query(postgresQuery(sql),args)).map(normalize),
    run:async(sql,args)=>query(postgresQuery(sql),args)
  };
}
export const schemaStatements=readFileSync(new URL('./schema.postgres.sql',import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean);
export async function initializePostgres(sql) {
  // Serialize first-start schema creation across concurrent serverless instances.
  await sql.transaction([
    sql.query('SELECT pg_advisory_xact_lock(73421068)'),
    ...schemaStatements.map(statement=>sql.query(statement))
  ]);
}
