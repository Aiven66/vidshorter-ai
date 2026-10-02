const BASE='https://www.clipopai.com', SU=process.env.NEXT_PUBLIC_SUPABASE_URL, SRK=process.env.SUPABASE_SERVICE_ROLE_KEY, ANON=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
import { readFileSync } from 'node:fs';
const resolve = JSON.parse(readFileSync('/tmp/resolve.json','utf8'));

// 1) login admin
const lr=await fetch(`${SU}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:ANON,'Content-Type':'application/json'},body:JSON.stringify({email:'admin@126.com',password:'admin@123'})});
const lj=await lr.json();
if(!lj.access_token){console.log('LOGIN FAIL',JSON.stringify(lj));process.exit(1)}
const token=lj.access_token, uid=lj.user.id;

// 2) submit with pre-resolved stream (frontend main path)
const body={videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',userId:uid,locale:'en',sourceType:'url',
  streamUrl:resolve.streamUrl,
  streamMetadata:{userAgent:resolve.userAgent,visitorData:resolve.visitorData,xClientName:resolve.xClientName,clientVersion:resolve.clientVersion,client:resolve.client},
  desiredClipCount:3};
const sr=await fetch(`${BASE}/api/videos/process`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(body)});
const sj=await sr.json();
if(!sj.videoId){console.log('SUBMIT FAIL',sr.status,JSON.stringify(sj));process.exit(1)}
const videoId=sj.videoId;
console.log('submitted with pre-resolved stream, video',videoId);

// 3) poll
const t0=Date.now(); let last=null;
for(let i=0;i<60;i++){
  await sleep(10000);
  last=await (await fetch(`${BASE}/api/videos/process/status?videoId=${videoId}`)).json();
  if(last.done||['failed','completed','link_only_completed','partial'].includes(last.status)){
    console.log(`poll ${i+1} after ${Math.round((Date.now()-t0)/1000)}s -> status=${last.status} stage=${last.stage} clips=${last.clips?.length} err=${last.error||''}`);
    break;
  }
  if(i%3===0)console.log(`poll ${i+1} -> stage=${last.stage} progress=${last.progress}`);
}
if(!last){console.log('TIMEOUT');process.exit(1)}

// 4) verify DB rows
const vrows=await (await fetch(`${SU}/rest/v1/videos?select=status&id=eq.${videoId}`,{headers:{apikey:SRK,Authorization:`Bearer ${SRK}`}})).json();
const srows=await (await fetch(`${SU}/rest/v1/short_videos?select=url,start_time,end_time,duration,highlight_title&video_id=eq.${videoId}&order=created_at.asc&limit=20`,{headers:{apikey:SRK,Authorization:`Bearer ${SRK}`}})).json();
console.log('videos.status:',vrows[0]?.status,'| short_videos count:',srows?.length);
const allSigned=srows?.length>0 && srows.every(c=>c.url.includes('/storage/v1/object/sign/'));
const anyLink=srows?.some(c=>c.url.includes('youtu.be'));
console.log('all storage signed:',allSigned,'| any youtu.be link:',anyLink);
srows?.slice(0,3).forEach(c=>console.log('  -',c.url.slice(0,100)));

// 5) verify first signed clip is a real playable MP4 (ftyp)
let mp4sig=null, clipBytes=0, clipOk=false;
for(const c of srows.slice(0,3)){
  try{
    const r=await fetch(c.url);
    if(r.ok){
      const ct=r.headers.get('content-type')||'';
      const buf=Buffer.from(await r.arrayBuffer());
      mp4sig=buf.length>=12?[...buf.subarray(4,8)].map(b=>String.fromCharCode(b)).join(''):'';
      clipBytes=buf.length;
      clipOk=mp4sig==='ftyp';
      console.log('signed clip fetch:',r.status,'ct',ct,'ftyp?',mp4sig,'bytes',clipBytes);
      if(r.ok)break;
    } else console.log('signed clip fetch:',r.status);
  }catch(e){console.log('signed clip fetch err',e.message)}
}
const allPass=vrows[0]?.status==='completed'&&allSigned&&!anyLink&&clipOk;
console.log(allPass?'=== FULL-PIPELINE E2E PASS (completed + real MP4) ===':`=== FULL-PIPELINE E2E FAIL === status=${vrows[0]?.status} allSigned=${allSigned} anyLink=${anyLink} clipOk=${clipOk}`);
