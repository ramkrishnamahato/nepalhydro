// scripts/scrape.js
// Runs inside GitHub Actions (Node 20). Fetches DoED + TFE, parses, writes data.json.

const fs = require('fs');
const path = require('path');

const SCFG = {
  survey:          { label: 'Survey License',    color: '#f0883e' },
  appsurvey:       { label: 'App. Survey',       color: '#e3b341' },
  construction:    { label: 'Construction',      color: '#a78bfa' },
  appconstruction: { label: 'App. Construction', color: '#c084fc' },
  operational:     { label: 'Operational',       color: '#4ade80' }
};

const SRCS = [
  { id: 's1',  url: 'https://doed.gov.np/pages/hydromorethan1/',       stg: 'survey' },
  { id: 's2',  url: 'https://doed.gov.np/pages/hydrolessthan1/',       stg: 'survey' },
  { id: 'as1', url: 'https://doed.gov.np/pages/appslhydromorethan1/',  stg: 'appsurvey' },
  { id: 'as2', url: 'https://doed.gov.np/pages/appslhydrolessthan1/',  stg: 'appsurvey' },
  { id: 'c1',  url: 'https://doed.gov.np/pages/clhydromorethan1/',     stg: 'construction' },
  { id: 'c2',  url: 'https://doed.gov.np/pages/clhydrolessthan1/',     stg: 'construction' },
  { id: 'ac1', url: 'https://doed.gov.np/pages/appclhydro/',           stg: 'appconstruction' },
  { id: 'o1',  url: 'https://doed.gov.np/pages/powerplantsmorethan1/', stg: 'operational' },
  { id: 'o2',  url: 'https://doed.gov.np/pages/powerplantslessthan1/', stg: 'operational' }
];

const DP = {
  TAPLEJUNG:'Koshi',PANCHTHAR:'Koshi',ILAM:'Koshi',JHAPA:'Koshi',MORANG:'Koshi',SUNSARI:'Koshi',DHANKUTA:'Koshi',TERHATHUM:'Koshi',BHOJPUR:'Koshi',SOLUKHUMBU:'Koshi',OKHALDHUNGA:'Koshi',KHOTANG:'Koshi',UDAYAPUR:'Koshi',SANKHUWASABHA:'Koshi',
  SAPTARI:'Madhesh',SIRAHA:'Madhesh',DHANUSA:'Madhesh',MAHOTTARI:'Madhesh',SARLAHI:'Madhesh',RAUTAHAT:'Madhesh',BARA:'Madhesh',PARSA:'Madhesh',
  SINDHULI:'Bagmati',RAMECHHAP:'Bagmati',DOLAKHA:'Bagmati',SINDHUPALCHOK:'Bagmati',KAVREPALANCHOK:'Bagmati',KABHREPALANCHOK:'Bagmati',LALITPUR:'Bagmati',BHAKTAPUR:'Bagmati',KATHMANDU:'Bagmati',NUWAKOT:'Bagmati',RASUWA:'Bagmati',DHADING:'Bagmati',MAKWANPUR:'Bagmati',MAKAWANPUR:'Bagmati',CHITWAN:'Bagmati',CHITAWAN:'Bagmati',
  GORKHA:'Gandaki',LAMJUNG:'Gandaki',TANAHU:'Gandaki',SYANGJA:'Gandaki',KASKI:'Gandaki',MANANG:'Gandaki',MUSTANG:'Gandaki',MYAGDI:'Gandaki',PARBAT:'Gandaki',NAWALPARASI:'Gandaki',BAGLUNG:'Gandaki',NAWALPUR:'Gandaki',
  RUPANDEHI:'Lumbini',KAPILBASTU:'Lumbini',ARGHAKHANCHI:'Lumbini',PALPA:'Lumbini',GULMI:'Lumbini',PYUTHAN:'Lumbini',ROLPA:'Lumbini',RUKUM:'Lumbini',DANG:'Lumbini',BANKE:'Lumbini',BARDIYA:'Lumbini',
  SURKHET:'Karnali',DAILEKH:'Karnali',JAJARKOT:'Karnali',DOLPA:'Karnali',JUMLA:'Karnali',KALIKOT:'Karnali',MUGU:'Karnali',SALYAN:'Karnali',HUMLA:'Karnali',
  BAJURA:'Sudurpaschim',BAJHANG:'Sudurpaschim',ACHHAM:'Sudurpaschim',DOTI:'Sudurpaschim',KAILALI:'Sudurpaschim',KANCHANPUR:'Sudurpaschim',DADELDHURA:'Sudurpaschim',BAITADI:'Sudurpaschim',DARCHULA:'Sudurpaschim'
};

function getProv(raw){ if(!raw) return '—'; const up=raw.toUpperCase(); for(const k in DP){ if(up.includes(k)) return DP[k]; } return '—'; }
function dms2dec(s){ if(!s) return NaN; s=String(s).trim().replace(/°/g,'o').replace(/['′`]/g,"'").replace(/["″]/g,'"'); const m=s.match(/^(\d{1,3}(?:\.\d+)?)\s*o\s*(?:(\d{1,2}(?:\.\d+)?)\s*'?\s*(?:(\d{1,2}(?:\.\d+)?)\s*"?)?)?/i); if(!m) return NaN; return (+m[1]||0)+(+m[2]||0)/60+(+m[3]||0)/3600; }
function vLat(v){return !isNaN(v)&&v>=25&&v<=32;}
function vLon(v){return !isNaN(v)&&v>=79&&v<=90;}

// ── Simple HTML table parser using regex (no cheerio dependency needed) ──
function parseTable(html, src) {
  const out = [];
  // Find all tables, work on <tr> rows
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  const stripTags = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const cells = [];
    let tdMatch;
    tdRegex.lastIndex = 0;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      cells.push(stripTags(tdMatch[1]));
    }
    if (cells.length < 13) continue;

    const name = cells[1];
    if (!name || name.length < 2 || /total|जम्मा|grand|project/i.test(name)) continue;
    const mw = parseFloat((cells[2] || '').replace(/,/g, '')) || 0;

    let licno, issue, validity, promoter, address, lat1, lat2, lon1, lon2, vdcRaw;
    if (cells.length === 13) {
      [licno, issue] = [cells[4], cells[5]]; validity = '—';
      [promoter, address] = [cells[6], cells[7]];
      lat1 = dms2dec(cells[8]); lat2 = dms2dec(cells[9]);
      lon1 = dms2dec(cells[10]); lon2 = dms2dec(cells[11]);
      vdcRaw = cells[12];
    } else {
      [licno, issue, validity] = [cells[4], cells[5], cells[6]];
      [promoter, address] = [cells[7], cells[8]];
      lat1 = dms2dec(cells[9]); lat2 = dms2dec(cells[10]);
      lon1 = dms2dec(cells[11]); lon2 = dms2dec(cells[12]);
      vdcRaw = cells[13];
    }
    if (!vLat(lat1)) lat1 = NaN; if (!vLat(lat2)) lat2 = NaN;
    if (!vLon(lon1)) lon1 = NaN; if (!vLon(lon2)) lon2 = NaN;
    let clat = NaN, clon = NaN;
    if (!isNaN(lat1) && !isNaN(lat2)) clat = (lat1 + lat2) / 2; else if (!isNaN(lat1)) clat = lat1;
    if (!isNaN(lon1) && !isNaN(lon2)) clon = (lon1 + lon2) / 2; else if (!isNaN(lon1)) clon = lon1;

    const province = getProv(vdcRaw);
    const dists = [];
    const re = /\(([^)]+)\)/g; let mm;
    while ((mm = re.exec(vdcRaw)) !== null) { const d = mm[1].trim(); if (d && !dists.includes(d)) dists.push(d); }
    const district = dists.length ? dists.join(', ') : '—';

    out.push({
      sourceId: src.id, name, mw, stage: src.stg, licno, issue, validity,
      promoter, address, lat1, lat2, lon1, lon2, clat, clon,
      vdc: vdcRaw, district, province, river: cells[3]
    });
  }
  return out;
}

async function fetchWithRetry(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 HydroBot/1.0 (+github)' },
        signal: AbortSignal.timeout(25000)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (e) {
      console.warn(`Attempt ${i + 1} failed for ${url}: ${e.message}`);
      if (i === tries - 1) throw e;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

(async () => {
  console.log('Starting hydropower data scrape...');
  const all = [];
  const seen = new Set();
  const stats = {};

  for (const src of SRCS) {
    try {
      const html = await fetchWithRetry(src.url);
      const parsed = parseTable(html, src);
      stats[src.id] = parsed.length;
      console.log(`✓ ${src.id} (${src.stg}): ${parsed.length} projects`);
      parsed.forEach(p => {
        const key = p.name.toLowerCase() + '|' + p.stage;
        if (!seen.has(key)) { all.push(p); seen.add(key); }
      });
    } catch (e) {
      console.error(`✗ ${src.id} failed: ${e.message}`);
      stats[src.id] = 0;
    }
  }

  console.log(`\nTotal unique projects: ${all.length}`);

  const output = {
    updated: new Date().toISOString(),
    total: all.length,
    byStage: {
      survey:          all.filter(p => p.stage === 'survey').length,
      appsurvey:       all.filter(p => p.stage === 'appsurvey').length,
      construction:    all.filter(p => p.stage === 'construction').length,
      appconstruction: all.filter(p => p.stage === 'appconstruction').length,
      operational:     all.filter(p => p.stage === 'operational').length
    },
    totalMW: all.reduce((s, p) => s + (p.mw || 0), 0),
    projects: all,
    sourceStatus: stats
  };

  const outPath = path.join(__dirname, '..', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`✓ Wrote ${outPath} (${(JSON.stringify(output).length / 1024).toFixed(1)} KB)`);
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
