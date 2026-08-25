/*
  LUMINA Update Gate service worker.
  IMPORTANT: keep this file byte-for-byte stable across normal app releases.
  New app versions are staged and activated only after the page sends COMMIT_RELEASE,
  which happens exclusively after the user presses "Đồng ý cập nhật".
*/
const META_CACHE = 'lumina-update-meta-v1';
const META_ACTIVE_KEY = '/__lumina_meta_active_version__';
const CORE_PATHS = ['/index.html','/styles.css','/app.js'];
const CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4';
let activeVersionMemory = null;

function releaseCacheName(version){ return `lumina-release-${String(version).replace(/[^0-9A-Za-z._-]/g,'_')}`; }
function metaRequest(){ return new Request(new URL(META_ACTIVE_KEY,self.location.origin).href); }
async function getActiveVersion(){
  if(activeVersionMemory) return activeVersionMemory;
  const cache=await caches.open(META_CACHE); const res=await cache.match(metaRequest());
  activeVersionMemory=res?await res.text():null; return activeVersionMemory;
}
async function setActiveVersion(version){
  const cache=await caches.open(META_CACHE);
  await cache.put(metaRequest(),new Response(String(version),{headers:{'content-type':'text/plain','cache-control':'no-store'}}));
  activeVersionMemory=String(version);
}
function parseVersion(html){
  const m=String(html||'').match(/<meta\s+name=["']lumina-version["']\s+content=["']([^"']+)["']/i)
    || String(html||'').match(/<meta\s+content=["']([^"']+)["']\s+name=["']lumina-version["']/i);
  return m?.[1]?.trim()||null;
}
function networkURL(path,tag){
  const u=new URL(path,self.location.origin); u.searchParams.set(tag,`${Date.now()}-${Math.random().toString(36).slice(2)}`); return u;
}
async function fetchFresh(path,tag){
  const res=await fetch(networkURL(path,tag),{cache:'no-store',credentials:'same-origin'});
  if(!res.ok) throw new Error(`${path}: HTTP ${res.status}`); return res;
}
async function buildRelease(version,tag='__lumina_stage'){
  const indexRes=await fetchFresh('/index.html',tag); const html=await indexRes.clone().text();
  const detected=parseVersion(html);
  if(!detected) throw new Error('Không tìm thấy lumina-version trong index.html.');
  if(version&&detected!==version) throw new Error(`Deploy hiện tại là v${detected}, không phải v${version}.`);
  const v=detected; const cache=await caches.open(releaseCacheName(v));
  await cache.put(new Request(new URL('/index.html',self.location.origin).href),indexRes.clone());
  for(const path of CORE_PATHS.slice(1)){
    const res=await fetchFresh(path,tag); await cache.put(new Request(new URL(path,self.location.origin).href),res.clone());
  }
  try{
    const cdnRes=await fetch(CDN_PREFIX,{cache:'no-store',mode:'no-cors'});
    if(cdnRes) await cache.put(new Request(CDN_PREFIX,{mode:'no-cors'}),cdnRes.clone());
  }catch{}
  return v;
}
async function seedIfNeeded(){
  const active=await getActiveVersion(); if(active) return active;
  const version=await buildRelease(null,'__lumina_seed'); await setActiveVersion(version); return version;
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const hadActive=await getActiveVersion();
    if(!hadActive){ await seedIfNeeded(); await self.skipWaiting(); }
    // If a future maintainer changes sw.js, do NOT skip waiting for existing installs.
  })());
});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('fetch',event=>{
  const req=event.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.searchParams.has('__lumina_probe')||url.searchParams.has('__lumina_stage')||url.searchParams.has('__lumina_seed')) return;
  const isCoreSameOrigin=url.origin===self.location.origin && (req.mode==='navigate'||url.pathname==='/'||CORE_PATHS.includes(url.pathname));
  const isPinnedCdn=req.url.startsWith(CDN_PREFIX);
  if(!isCoreSameOrigin&&!isPinnedCdn) return;
  event.respondWith((async()=>{
    const version=await getActiveVersion();
    if(!version){
      // Only possible during the very first installation; no older accepted release exists yet.
      return fetch(req);
    }
    const cache=await caches.open(releaseCacheName(version));
    const key=isPinnedCdn?new Request(CDN_PREFIX,{mode:'no-cors'}):new Request(new URL(req.mode==='navigate'||url.pathname==='/'?'/index.html':url.pathname,self.location.origin).href);
    const hit=await cache.match(key);
    if(hit) return hit;
    // Strict gate: once an accepted release exists, never silently fall through to a newer core asset.
    return new Response('LUMINA Update Gate: accepted release cache is unavailable. Reopen the app or use the in-app update flow.',{
      status:503,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}
    });
  })());
});

self.addEventListener('message',event=>{
  const msg=event.data||{}; const port=event.ports?.[0];
  const reply=data=>{try{port?.postMessage(data)}catch{}};
  if(msg.type==='STAGE_RELEASE'){
    event.waitUntil((async()=>{try{const version=await buildRelease(String(msg.version||''),'__lumina_stage');reply({ok:true,version})}catch(e){reply({ok:false,error:e?.message||String(e)})}})());
    return;
  }
  if(msg.type==='COMMIT_RELEASE'){
    event.waitUntil((async()=>{try{
      const version=String(msg.version||''); const cache=await caches.open(releaseCacheName(version));
      const required=await Promise.all(CORE_PATHS.map(p=>cache.match(new Request(new URL(p,self.location.origin).href))));
      if(required.some(x=>!x)) throw new Error('Gói cập nhật chưa đầy đủ, không thể kích hoạt.');
      await setActiveVersion(version); reply({ok:true,version});
    }catch(e){reply({ok:false,error:e?.message||String(e)})}})());
    return;
  }
  if(msg.type==='GET_ACTIVE_RELEASE') event.waitUntil((async()=>reply({ok:true,version:await getActiveVersion()}))());
});
