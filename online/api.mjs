// Portable leaderboard service. The database adapter owns persistence.
export function createLeaderboardAPI(db, {now = Date.now, randomUUID = () => crypto.randomUUID()} = {}) {
  const reply = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
  const profileValid = p => p && typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 12 && !/[\u0000-\u001f\u007f]/.test(p.name) && [1,2].includes(p.world) && Number.isInteger(p.stage) && p.stage >= 0 && p.stage < 12 && Number.isInteger(p.jet) && p.jet >= 0 && p.jet < 5 && ['easy','normal','hard'].includes(p.difficulty);
  return async function api(request) {
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/api/rankings') {
        const records = await db.all(`WITH entries AS (
            SELECT r.player_id, k.name, k.score, 0 AS damage, k.created_at
            FROM rankings k JOIN runs r ON r.token=k.run_token
            UNION ALL
            SELECT r.player_id, k.name, k.score, k.score AS damage, k.created_at
            FROM rank_challenges k JOIN runs r ON r.token=k.run_token
          ), totals AS (
            SELECT e.player_id, SUM(e.score) AS score, MAX(CASE WHEN e.created_at > COALESCE(z.reset_at,0) THEN e.damage ELSE 0 END) AS bestDamage, COUNT(*) AS plays FROM entries e LEFT JOIN player_rank_resets z ON z.player_id=e.player_id GROUP BY e.player_id
          ), names AS (
            SELECT player_id, name, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY created_at DESC, name ASC) AS n FROM entries
          )
          SELECT names.name, totals.score, totals.bestDamage, totals.plays FROM totals JOIN names ON names.player_id=totals.player_id AND names.n=1
          ORDER BY totals.score DESC, totals.bestDamage DESC, names.name ASC LIMIT 10`,[]);
        return reply({records});
      }
      if (request.method !== 'POST' || !['/api/runs','/api/rankings','/api/rank/reset'].includes(url.pathname)) return reply({error:'Not found'},404);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({error:'JSON required'},415);
      const origin=request.headers.get('origin');
      if(origin && origin!==url.origin) return reply({error:'Wrong origin'},403);
      // Bound the body while reading, even for requests without Content-Length.
      const reader=request.body?.getReader(); let size=0, chunks=[];
      if(!reader)return reply({error:'Body required'},400);
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return reply({error:'Too large'},413);}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({error:'Invalid JSON'},400);}
      if(url.pathname==='/api/rank/reset') {
        if(typeof body.playerId!=='string' || !/^[a-zA-Z0-9-]{16,64}$/.test(body.playerId))return reply({error:'Invalid player'},400);
        await db.run('INSERT INTO player_rank_resets (player_id, reset_at) VALUES (?, ?) ON CONFLICT(player_id) DO UPDATE SET reset_at=excluded.reset_at',[body.playerId,now()]);
        return reply({reset:true});
      }
      if(url.pathname==='/api/runs') {
        if(!['stage','rank'].includes(body.mode || 'stage') || !profileValid(body) || typeof body.playerId!=='string' || !/^[a-zA-Z0-9-]{16,64}$/.test(body.playerId))return reply({error:'Invalid profile'},400);
        const rate=await db.get('SELECT COUNT(*) AS count FROM runs WHERE player_id = ? AND started_at > ?',[body.playerId,now()-60000]);
        if(rate.count>=20)return reply({error:'Please wait'},429);
        const token=randomUUID();
        await db.run('INSERT INTO runs (token, player_id, name, world, stage, jet, difficulty, started_at, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',[token,body.playerId,body.name.trim(),body.world,body.stage,body.jet,body.difficulty,now(),body.mode || 'stage']);
        return reply({token},201);
      }
      if(typeof body.token!=='string' || body.token.length>64 || !Number.isInteger(body.score) || body.score<0 || body.score>50000 || typeof body.cleared!=='boolean')return reply({error:'Invalid score'},400);
      const run=await db.get('SELECT * FROM runs WHERE token = ?',[body.token]);
      if(!run)return reply({error:'Run not found'},404);
      const isRank = run.mode==='rank';
      const table = isRank ? 'rank_challenges' : 'rankings';
      if(!isRank && (body.score>1800 || body.score%100!==0))return reply({error:'Invalid stage score'},400);
      if(isRank && !body.cleared)return reply({error:'Challenge unfinished'},400);
      const existing=await db.get(`SELECT score, cleared FROM ${table} WHERE run_token = ?`,[body.token]);
      if(existing) return existing.score===body.score && !!existing.cleared===body.cleared ? reply({saved:true}) : reply({error:'Already submitted'},409);
      const elapsed=now()-run.started_at;
      if(elapsed>7200000 || elapsed<0 || (isRank ? (body.outcome==='defeated' ? elapsed<1000 || body.score>Math.floor((elapsed/1000+2)*1200) : elapsed<58000) : body.score>Math.floor((elapsed/1000+2)*400) || (body.cleared && body.score<1000)))return reply({error:'Invalid run timing'},400);
      // Basic validation and idempotent submissions. Full anti-cheat requires authoritative simulation.
      if(isRank) {
        await db.run('INSERT OR IGNORE INTO rank_challenges (run_token, name, score, cleared, created_at) VALUES (?, ?, ?, ?, ?)',[body.token,run.name,body.score,1,now()]);
      } else {
        await db.run('INSERT OR IGNORE INTO rankings (run_token, name, world, stage, jet, difficulty, score, cleared, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',[body.token,run.name,run.world,run.stage,run.jet,run.difficulty,body.score,body.cleared?1:0,now()]);
      }
      const saved=await db.get(`SELECT score, cleared FROM ${table} WHERE run_token = ?`,[body.token]);
      return saved.score===body.score && !!saved.cleared===body.cleared ? reply({saved:true}) : reply({error:'Already submitted'},409);
    } catch(error) {console.error('Leaderboard unavailable:',error.message);return reply({error:'Service unavailable'},503);}
  };
}
