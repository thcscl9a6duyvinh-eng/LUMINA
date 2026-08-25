const APP_VERSION = '1.5.9';
const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;
const UPDATE_PROGRESS_DURATION_MS = 15000;

// Update Gate: Vercel có deploy mới cũng KHÔNG tự thay giao diện đang dùng.
// App chỉ chuyển sang release mới sau khi người dùng bấm "Đồng ý cập nhật".
let pendingUpdateVersion = null;
let updateCheckTimer = null;
let updateFlowBusy = false;

// Đây là dự án Supabase DUY NHẤT của chủ app. Người dùng cuối không cần tài khoản Supabase.
const SUPABASE_URL = 'https://htwctvptazeloivccuth.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CAjoORAdCLQf8ZUq8AVskQ_TPrpGyTm'; // Chỉ dùng Anon/Publishable key, KHÔNG dùng service_role key ở frontend.

const configured = !SUPABASE_URL.startsWith('PASTE_') && !SUPABASE_ANON_KEY.startsWith('PASTE_');
const sb = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const fmt = n => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n)||0)) + '₫';
const fmtShort = n => {
  n = Number(n)||0;
  if (Math.abs(n) >= 1e9) return (n/1e9).toFixed(1).replace('.0','')+'tỷ';
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(1).replace('.0','')+'tr';
  if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(0)+'k';
  return String(Math.round(n));
};
const uid = () => state.user?.id || 'demo-user';
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const nowIso = () => new Date().toISOString();

const state = {
  user:null, demo:false, page:'home', robot:'happy', listening:false, realtime:null,
  profile:null, transactions:[], goals:[], wallets:[], loans:[], subscriptions:[], bank_accounts:[],
  settings:{sound:true, bubbles:true, budget:0}
};

const demoSeed = () => {
  const d = new Date();
  const isoAt = (monthOffset, day, hour=8) => {
    const x = new Date(d.getFullYear(), d.getMonth()+monthOffset, day, hour, 0, 0);
    return x.toISOString();
  };
  return {
    transactions:[
      {id:'d1',user_id:uid(),kind:'income',amount:12000000,category:'Lương',note:'Lương công ty',account:'Vietcombank',occurred_at:isoAt(0,3,8)},
      {id:'d2',user_id:uid(),kind:'expense',amount:45000,category:'Ăn uống',note:'Cà phê',account:'Tiền mặt',occurred_at:isoAt(0,3,7)},
      {id:'d3',user_id:uid(),kind:'expense',amount:75000,category:'Ăn uống',note:'Ăn trưa',account:'Tiền mặt',occurred_at:isoAt(0,2,12)},
      {id:'d4',user_id:uid(),kind:'expense',amount:32000,category:'Di chuyển',note:'Grab',account:'Ví điện tử',occurred_at:isoAt(0,2,18)},
      {id:'d5',user_id:uid(),kind:'expense',amount:220000,category:'Mua sắm',note:'Shopee',account:'Thẻ',occurred_at:isoAt(0,1,20)},
      {id:'d6',user_id:uid(),kind:'saving',amount:6000000,category:'Tiết kiệm',note:'Quỹ mục tiêu',account:'Tiết kiệm',occurred_at:isoAt(0,1,9)},
      {id:'d7',user_id:uid(),kind:'income',amount:6200000,category:'Thu nhập khác',note:'Freelance',account:'Vietcombank',occurred_at:isoAt(0,8,10)},
      ...[-1,-2,-3,-4,-5].flatMap((m,i)=>[
        {id:`mi${i}`,user_id:uid(),kind:'income',amount:16000000+i*650000,category:'Lương',note:'Thu nhập tháng',account:'Vietcombank',occurred_at:isoAt(m,5,8)},
        {id:`me${i}`,user_id:uid(),kind:'expense',amount:5200000+i*350000,category:i%2?'Ăn uống':'Mua sắm',note:'Chi tiêu tháng',account:'Tiền mặt',occurred_at:isoAt(m,14,18)},
        {id:`ms${i}`,user_id:uid(),kind:'saving',amount:3000000+i*200000,category:'Tiết kiệm',note:'Tiết kiệm tháng',account:'Tiết kiệm',occurred_at:isoAt(m,20,9)}
      ])
    ],
    goals:[
      {id:'g1',user_id:uid(),title:'Du lịch Đà Lạt',target:10000000,saved:3000000,due_date:`${d.getFullYear()}-12-30`,icon:'🎯'},
      {id:'g2',user_id:uid(),title:'MacBook M3',target:30000000,saved:3000000,due_date:`${d.getFullYear()+1}-06-30`,icon:'💻'},
      {id:'g3',user_id:uid(),title:'Máy ảnh',target:15000000,saved:0,due_date:`${d.getFullYear()+1}-12-30`,icon:'📷'}
    ],
    wallets:[
      {id:'w1',user_id:uid(),name:'Vietcombank',type:'Ngân hàng',balance:12580000,icon:'🏦'},
      {id:'w2',user_id:uid(),name:'Tiền mặt',type:'Ví',balance:1650000,icon:'💵'}
    ],
    loans:[{id:'l1',user_id:uid(),name:'Khoản vay mẫu',principal:8000000,remaining:5200000,due_date:`${d.getFullYear()}-11-30`}],
    subscriptions:[{id:'s1',user_id:uid(),name:'iCloud+',amount:69000,billing_cycle:'monthly',next_charge:`${d.getFullYear()}-${String(d.getMonth()+2).padStart(2,'0')}-05`}],
    bank_accounts:[{id:'b1',user_id:uid(),bank_name:'Vietcombank',account_label:'Tài khoản chính',last4:'1234',enabled:true}]
  };
};

function demoLoad(){
  const saved = localStorage.getItem('lumina-demo-v154');
  const data = saved ? JSON.parse(saved) : demoSeed();
  Object.assign(state, data);
}
function demoSave(){
  localStorage.setItem('lumina-demo-v154', JSON.stringify({transactions:state.transactions,goals:state.goals,wallets:state.wallets,loans:state.loans,subscriptions:state.subscriptions,bank_accounts:state.bank_accounts}));
}

async function init(){
  const urlParams=new URLSearchParams(window.location.search);
  const authError=urlParams.get('error_description')||urlParams.get('error');
  if(authError) setTimeout(()=>showAuthStatus(decodeURIComponent(authError),'error'),200);

  const configHint=$('#configHint');
  if(configured){
    configHint.textContent='';
    configHint.classList.add('hidden');
  }else{
    configHint.textContent='Chưa cấu hình kết nối dữ liệu. Hãy điền SUPABASE_URL và SUPABASE_ANON_KEY trong app.js.';
    configHint.classList.remove('hidden');
  }

  bindStatic();
  if (!configured) return;
  const { data:{session} } = await sb.auth.getSession();
  if (session){ await enterApp(session.user); }
  sb.auth.onAuthStateChange(async (event, session)=>{
    if (event === 'SIGNED_IN' && session?.user) await enterApp(session.user);
    if (event === 'SIGNED_OUT') showAuth();
  });
}

function authMessage(error){
  const raw=String(error?.message||error||'').trim();
  const msg=raw.toLowerCase();
  if(msg.includes('invalid login credentials')) return 'Email hoặc mật khẩu không đúng.';
  if(msg.includes('email not confirmed')) return 'Email chưa được xác nhận. Hãy mở email xác nhận rồi đăng nhập lại.';
  if(msg.includes('user already registered')) return 'Email này đã được đăng ký. Hãy đăng nhập.';
  if(msg.includes('password should be at least')) return 'Mật khẩu phải có ít nhất 6 ký tự.';
  if(msg.includes('invalid email')) return 'Địa chỉ email không hợp lệ.';
  if(msg.includes('signup is disabled')) return 'Chức năng đăng ký đang bị tắt trong Supabase Auth.';
  if(msg.includes('rate limit')||msg.includes('over_email_send_rate_limit')) return 'Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.';
  return raw || 'Có lỗi xảy ra. Vui lòng thử lại.';
}

function showAuthStatus(message,type='info'){
  const el=$('#authStatus');
  if(!el) return;
  el.textContent=message||'';
  el.className=`auth-status ${type}`;
  if(!message) el.classList.add('hidden');
}

function setAuthBusy(busy){
  const login=$('#loginBtn'), signup=$('#signupBtn');
  if(login){ login.disabled=busy; login.textContent=busy?'Đang xử lý...':'Đăng nhập'; }
  if(signup){ signup.disabled=busy; }
}

async function loginWithEmail(){
  if(!configured) return toast('Hãy cấu hình Supabase trước.');
  const email=$('#authEmail').value.trim();
  const password=$('#authPassword').value;
  if(!email) return showAuthStatus('Nhập email để đăng nhập.','error');
  if(!password) return showAuthStatus('Nhập mật khẩu để đăng nhập.','error');
  setAuthBusy(true); showAuthStatus('Đang đăng nhập...');
  const {error}=await sb.auth.signInWithPassword({email,password});
  setAuthBusy(false);
  if(error) return showAuthStatus(authMessage(error),'error');
  showAuthStatus('Đăng nhập thành công.','success');
}

async function signupWithEmail(){
  if(!configured) return toast('Hãy cấu hình Supabase trước.');
  const email=$('#authEmail').value.trim();
  const password=$('#authPassword').value;
  if(!email) return showAuthStatus('Nhập email để đăng ký.','error');
  if(password.length<6) return showAuthStatus('Mật khẩu phải có ít nhất 6 ký tự.','error');
  setAuthBusy(true); showAuthStatus('Đang tạo tài khoản...');
  const emailRedirectTo=`${window.location.origin}${window.location.pathname}`;
  const displayName=email.split('@')[0]||'Người dùng';
  const {data,error}=await sb.auth.signUp({
    email,password,
    options:{emailRedirectTo,data:{full_name:displayName}}
  });
  setAuthBusy(false);
  if(error) return showAuthStatus(authMessage(error),'error');
  if(data?.session){
    showAuthStatus('Đăng ký thành công. Đang vào LUMINA...','success');
  }else{
    $('#authPassword').value='';
    showAuthStatus('Đăng ký thành công. Hãy kiểm tra email và bấm liên kết xác nhận trước khi đăng nhập.','success');
  }
}

function bindStatic(){
  $('#emailAuthForm').addEventListener('submit', async e=>{e.preventDefault();await loginWithEmail();});
  $('#signupBtn').addEventListener('click', signupWithEmail);
  $('#demoBtn').addEventListener('click', ()=>{
    state.demo=true; state.user={id:'demo-user',email:'demo@lumina.app',user_metadata:{full_name:'Duy Vĩnh'}};
    state.profile={display_name:'Duy Vĩnh',monthly_budget:0}; demoLoad(); showApp();
  });
  $('#menuBtn').onclick=openDrawer; $('#closeDrawer').onclick=closeDrawer; $('#backdrop').onclick=()=>{closeDrawer();closeSheet()};
  $('#logoutBtn').onclick=async()=>{ if(state.demo){state.demo=false;showAuth()} else await sb.auth.signOut(); };
  $('#micBtn').onclick=startListening; $('#stopMicBtn').onclick=stopListening; $('#closeSheet').onclick=closeSheet;
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
  $$('.drawer-nav button').forEach(b=>b.addEventListener('click',()=>{navigate(b.dataset.page);closeDrawer()}));
  $('#notifyBtn').onclick=()=>{ if(pendingUpdateVersion) showUpdatePrompt(pendingUpdateVersion); else toast(`Bạn đang dùng LUMINA v${APP_VERSION} mới nhất đã được chấp nhận.`); };
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ if(!state.demo && state.user) refreshAll(); checkForNewVersion({silent:true}); } });
}

async function enterApp(user){
  state.demo=false; state.user=user;
  await refreshAll(); subscribeRealtime(); showApp();
}

function setAvatar(el, initials, url){
  if(!el) return;
  el.textContent=initials;
  el.style.backgroundImage=url?`url("${String(url).replace(/"/g,'%22')}")`:'';
  el.style.backgroundSize=url?'cover':'';
  el.style.backgroundPosition=url?'center':'';
  el.style.color=url?'transparent':'';
}

function showAuth(){
  state.user=null; state.page='home';
  $('#appShell').classList.add('hidden'); $('#authScreen').classList.remove('hidden'); closeDrawer(); closeSheet();
}
function showApp(){
  $('#authScreen').classList.add('hidden'); $('#appShell').classList.remove('hidden');
  const name = state.profile?.display_name || state.user?.user_metadata?.full_name || state.user?.user_metadata?.name || state.user?.email?.split('@')[0] || 'Người dùng';
  const initials=name.split(/\s+/).map(x=>x[0]).slice(-2).join('').toUpperCase();
  setAvatar($('#userAvatar'), initials, state.user?.user_metadata?.avatar_url || state.user?.user_metadata?.picture); setAvatar($('#drawerAvatar'), initials, state.user?.user_metadata?.avatar_url || state.user?.user_metadata?.picture); $('#drawerName').textContent=name; $('#drawerEmail').textContent=state.user?.email||'demo@lumina.app';
  navigate('home'); startBlinkLoop();
}

async function refreshAll(){
  if(state.demo) return;
  const tables=['transactions','goals','wallets','loans','subscriptions','bank_accounts'];
  const req=tables.map(t=>sb.from(t).select('*').eq('user_id',uid()).order(t==='transactions'?'occurred_at':'created_at',{ascending:false}).then(r=>({t,...r})));
  const results=await Promise.all(req);
  results.forEach(r=>{ if(!r.error) state[r.t]=r.data||[]; });
  const p=await sb.from('profiles').select('*').eq('id',uid()).maybeSingle();
  if(!p.error) state.profile=p.data;
  if(!$('#appShell').classList.contains('hidden')) render();
}
function subscribeRealtime(){
  if(!configured || state.demo || !state.user) return;
  if(state.realtime) sb.removeChannel(state.realtime);
  let ch=sb.channel(`lumina-${uid()}`);
  ['transactions','goals','wallets','loans','subscriptions','bank_accounts'].forEach(table=>{
    ch=ch.on('postgres_changes',{event:'*',schema:'public',table,filter:`user_id=eq.${uid()}`},()=>refreshAll());
  });
  state.realtime=ch.subscribe();
}

async function dbInsert(table,row){
  const item={...row,id:row.id||crypto.randomUUID(),user_id:uid()};
  if(state.demo){ state[table].unshift(item); demoSave(); render(); return item; }
  const {data,error}=await sb.from(table).insert({...row,user_id:uid()}).select().single();
  if(error){toast(error.message);throw error} await refreshAll(); return data;
}
async function dbUpdate(table,id,patch){
  if(state.demo){ const i=state[table].findIndex(x=>x.id===id); if(i>=0) state[table][i]={...state[table][i],...patch}; demoSave(); render(); return; }
  const {error}=await sb.from(table).update(patch).eq('id',id).eq('user_id',uid()); if(error) return toast(error.message); await refreshAll();
}
async function dbDelete(table,id){
  if(state.demo){ state[table]=state[table].filter(x=>x.id!==id); demoSave(); render(); return; }
  const {error}=await sb.from(table).delete().eq('id',id).eq('user_id',uid()); if(error) return toast(error.message); await refreshAll();
}

function navigate(page){
  state.page=page; $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page)); render();
}
function render(){
  const screen=$('#screen'); screen.className='screen '+(state.page==='home'?'home-screen':'scroll-screen');
  const map={home:renderHome,stats:renderStats,goals:renderGoals,wallets:renderWallets,transactions:renderTransactions,loans:renderLoans,subscriptions:renderSubscriptions,banks:renderBanks,settings:renderSettings};
  screen.innerHTML=(map[state.page]||renderHome)(); bindPage();
}

function currentMonthTransactions(){
  const k=monthKey(new Date()); return state.transactions.filter(t=>monthKey(new Date(t.occurred_at))===k);
}
function sums(list=currentMonthTransactions()){
  return list.reduce((a,t)=>{a[t.kind]=(a[t.kind]||0)+Number(t.amount||0);return a},{income:0,expense:0,saving:0});
}
function previousMonthSums(){
  const d=new Date(); d.setMonth(d.getMonth()-1); const k=monthKey(d);
  return sums(state.transactions.filter(t=>monthKey(new Date(t.occurred_at))===k));
}
function robotMood(){
  const s=sums();
  if(s.expense > s.income && s.expense>0) return 'angry';
  if(s.income>0 && s.expense/s.income >= .65) return 'sad';
  return 'happy';
}
function assistantMessage(mood){
  const s=sums();
  if(mood==='angry') return 'Cảnh báo!<br>Bạn đã chi tiêu vượt thu nhập! ⚠️';
  if(mood==='sad') return 'Bạn chi tiêu hơi ít...<br>Hãy sống thoải mái hơn nhé! 💙';
  if(s.income===0 && s.expense===0) return 'Xin chào!<br>Hãy thêm giao dịch đầu tiên ✨';
  return 'Tuyệt vời!<br>Hôm nay chi tiêu hợp lý 🎉';
}
function renderHome(){
  const s=sums(), prev=previousMonthSums(); const balance=s.income-s.expense-s.saving; const prevBal=prev.income-prev.expense-prev.saving; const delta=balance-prevBal;
  const mood=state.listening?'happy':robotMood(); state.robot=mood;
  const recent=[...state.transactions].sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at)).slice(0,5);
  return `
    <div class="assistant-zone">
      <div class="weather-mood">${mood==='happy'?'🌿':mood==='sad'?'🌧️':'💢'}</div>
      ${state.listening?'<div class="listen-badge">🎙 Tôi đang nghe bạn...</div>':''}
      <div class="robot-wrap" id="robotWrap"><div class="holo"></div><img id="robotImg" class="robot-img robot-${mood} ${state.listening?'listening':''}" alt="Lumina assistant"></div>
      ${state.settings.bubbles!==false?`<div class="speech-bubble ${mood==='angry'?'warning':''}">${assistantMessage(mood)}</div>`:''}
    </div>
    <div class="balance-card">
      <div><div class="card-label">Số dư hiện tại 👁</div><div class="amount-main ${balance<0?'negative':''}">${fmt(balance)}</div></div>
      <div class="trend ${delta<0?'negative':''}"><strong>${delta>=0?'↑':'↓'} ${fmt(Math.abs(delta))}</strong>so với tháng trước</div>
    </div>
    <div class="stat-grid">
      <div class="mini-card income"><div class="ico">♙</div><small>Thu nhập</small><strong>${fmt(s.income)}</strong></div>
      <div class="mini-card expense"><div class="ico">♜</div><small>Chi tiêu</small><strong>${fmt(s.expense)}</strong></div>
      <div class="mini-card saving"><div class="ico">♢</div><small>${balance<0?'Vượt mức':'Tiết kiệm'}</small><strong>${fmt(balance<0?Math.abs(balance):s.saving)}</strong></div>
    </div>
    <div class="transaction-wrap">
      <div class="section-title"><h3>Giao dịch gần đây</h3><button class="text-action" data-go="transactions">Xem tất cả</button></div>
      <div class="transaction-panel"><div class="tx-list">${recent.length?recent.map(txHtml).join(''):'<div class="empty">Chưa có giao dịch.<br>Nhấn micro hoặc thêm thủ công.</div>'}</div></div>
    </div>`;
}
function txHtml(t){
  const cls=t.kind||'expense', sign=cls==='income'?'+':cls==='expense'?'-':'↗'; const icons={income:'♙',expense:'♨',saving:'♢'};
  const d=new Date(t.occurred_at||t.created_at||Date.now());
  return `<div class="tx" data-tx="${t.id}"><div class="tx-icon ${cls}">${icons[cls]}</div><div><div class="tx-name">${escapeHtml(t.note||t.category||'Giao dịch')}</div><div class="tx-meta">${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} · ${escapeHtml(t.category||'Khác')}${t.account?' · '+escapeHtml(t.account):''}</div></div><div class="tx-amount ${cls==='income'?'positive':cls==='expense'?'negative':''}">${sign} ${fmt(t.amount)}</div></div>`;
}

function monthlySeries(){
  const out=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);const k=monthKey(d);const s=sums(state.transactions.filter(t=>monthKey(new Date(t.occurred_at))===k));out.push({label:'T'+(d.getMonth()+1),...s})}
  return out;
}
function categorySpend(){
  const map={}; currentMonthTransactions().filter(t=>t.kind==='expense').forEach(t=>map[t.category||'Khác']=(map[t.category||'Khác']||0)+Number(t.amount));
  return Object.entries(map).sort((a,b)=>b[1]-a[1]);
}
function aiInsight(){
  const s=sums(), cats=categorySpend(), top=cats[0];
  if(s.expense>s.income && s.expense) return `Chi tiêu tháng này cao hơn thu nhập ${fmt(s.expense-s.income)}. Ưu tiên giảm ${top?.[0]||'nhóm chi lớn nhất'} và tạm hoãn các khoản không thiết yếu.`;
  if(top && s.expense>0) return `${top[0]} đang là nhóm chi lớn nhất (${Math.round(top[1]/s.expense*100)}%). Bạn có thể đặt hạn mức cho nhóm này để giữ nhịp tiết kiệm.`;
  return 'Lumina sẽ tự động phân loại thu/chi, phân bổ theo danh mục, cảnh báo vượt mức và gợi ý tiết kiệm khi có dữ liệu.';
}
function renderStats(){
  const series=monthlySeries(), max=Math.max(1,...series.flatMap(x=>[x.income,x.expense,x.saving])); const s=sums(); const total=Math.max(1,s.income+s.expense+s.saving); const p1=Math.round(s.income/total*100),p2=p1+Math.round(s.expense/total*100),p3=p2+Math.round(s.saving/total*100); const cats=categorySpend();
  return `<div class="page-head"><h2>Thống kê</h2><span class="sync-pill ${state.demo?'offline':''}">${state.demo?'● Demo':'● Đồng bộ'}</span></div>
    <div class="tabs"><button class="active">Tháng</button><button>Năm</button><button>6 Tháng</button></div>
    <div class="panel"><div class="chart-title"><strong>Dòng tiền 6 tháng</strong><div class="legend"><span class="l1"><i></i>Thu</span><span class="l2"><i></i>Chi</span><span class="l3"><i></i>Tiết kiệm</span></div></div><div class="bars">${series.map(x=>`<div class="bar-month"><i class="bar in" style="height:${Math.max(3,x.income/max*100)}%"></i><i class="bar out" style="height:${Math.max(3,x.expense/max*100)}%"></i><i class="bar save" style="height:${Math.max(3,x.saving/max*100)}%"></i><small>${x.label}</small></div>`).join('')}</div></div>
    <div class="panel"><div class="chart-title"><strong>Tỷ lệ dòng tiền</strong></div><div class="donut-row"><div class="donut" style="--p1:${p1}%;--p2:${p2}%;--p3:${p3}%"></div><div class="ratio-list"><div class="ratio-line"><span>Thu nhập</span><strong>${p1}%</strong></div><div class="ratio-line"><span>Chi tiêu</span><strong>${Math.max(0,p2-p1)}%</strong></div><div class="ratio-line"><span>Tiết kiệm</span><strong>${Math.max(0,p3-p2)}%</strong></div></div></div></div>
    <div class="panel"><div class="chart-title"><strong>Chi tiêu theo danh mục</strong></div><div class="category-list">${cats.length?cats.slice(0,6).map(([cat,val],i)=>catHtml(cat,val,s.expense,i)).join(''):'<div class="empty">Chưa có dữ liệu chi tiêu.</div>'}</div></div>
    <div class="panel ai-card"><h3>✨ AI phân tích</h3><p>${aiInsight()}</p></div>`;
}
function catHtml(cat,val,total,i){const icons=['🍽️','🚕','🎮','🛍️','🧩','☕'];const pct=total?Math.round(val/total*100):0;return `<div class="cat-row"><div class="tx-icon expense">${icons[i%icons.length]}</div><div class="cat-main"><span>${escapeHtml(cat)}</span><strong>${pct}%</strong><div class="cat-progress"><i style="width:${pct}%"></i></div></div><div class="cat-amount">${fmtShort(val)}</div></div>`}

function renderGoals(){
  const total=state.goals.reduce((a,g)=>a+Number(g.saved||0),0), target=state.goals.reduce((a,g)=>a+Number(g.target||0),0), pct=target?Math.round(total/target*100):0;
  return `<div class="page-head"><h2>Mục tiêu</h2><button class="add-btn" data-add="goal">+ Thêm</button></div>
    <div class="panel goal-total"><small>Tổng đã tiết kiệm</small><strong>${fmt(total)}</strong><em>đạt ${pct}% tổng mục tiêu</em></div>
    ${state.goals.length?state.goals.map(g=>{const p=g.target?Math.min(100,Math.round(Number(g.saved)/Number(g.target)*100)):0;return `<div class="panel goal-card"><div class="goal-top"><div><h4>${g.icon||'🎯'} ${escapeHtml(g.title)}</h4><small>${fmt(g.saved)} / ${fmt(g.target)}</small></div><div class="goal-percent">${p}%</div></div><div class="progress"><i style="width:${p}%"></i></div><div class="goal-meta"><span>⌁ ${g.due_date||'Chưa đặt hạn'}</span><span><button class="mini-action" data-goal-add="${g.id}">+ Nạp</button> <button class="mini-action" data-del="goals:${g.id}">Xóa</button></span></div></div>`}).join(''):'<div class="panel empty">Chưa có mục tiêu.</div>'}`;
}
function renderWallets(){return entityPage('Ví & Tài sản','wallet',state.wallets,w=>({icon:w.icon||'💳',title:w.name,meta:w.type||'Ví',value:fmt(w.balance)}));}
function renderLoans(){return entityPage('Khoản vay','loan',state.loans,l=>({icon:'◌',title:l.name,meta:`Còn ${fmt(l.remaining)} · Hạn ${l.due_date||'—'}`,value:fmt(l.principal)}));}
function renderSubscriptions(){return entityPage('Subscription','subscription',state.subscriptions,s=>({icon:'◫',title:s.name,meta:`${s.billing_cycle==='yearly'?'Hàng năm':'Hàng tháng'} · Kỳ tới ${s.next_charge||'—'}`,value:fmt(s.amount)}));}
function renderBanks(){
  const rows=state.bank_accounts.map(b=>`<div class="entity-row"><div class="entity-icon">🏦</div><div><h4>${escapeHtml(b.bank_name)}</h4><p>${escapeHtml(b.account_label||'Tài khoản')} · **** ${escapeHtml(b.last4||'')}</p></div><div><strong>${b.enabled?'Đang dùng':'Tắt'}</strong><div class="row-actions"><button class="mini-action" data-del="bank_accounts:${b.id}">Xóa</button></div></div></div>`).join('');
  return `<div class="page-head"><h2>Ngân hàng</h2><button class="add-btn" data-add="bank">+ Thêm</button></div><div class="notice">Trên iPhone, web app không thể đọc thông báo nền của ứng dụng ngân hàng khác. Trang này quản lý tài khoản ngân hàng; giao dịch có thể nhập tay, nhập bằng giọng nói hoặc đồng bộ qua nguồn API/webhook riêng nếu bạn tích hợp sau.</div><div class="panel list-card">${rows||'<div class="empty">Chưa có tài khoản ngân hàng.</div>'}</div>`;
}
function entityPage(title,kind,arr,mapFn){return `<div class="page-head"><h2>${title}</h2><button class="add-btn" data-add="${kind}">+ Thêm</button></div><div class="panel list-card">${arr.length?arr.map(x=>{const r=mapFn(x);const table=kind==='wallet'?'wallets':kind==='loan'?'loans':'subscriptions';return `<div class="entity-row"><div class="entity-icon">${r.icon}</div><div><h4>${escapeHtml(r.title)}</h4><p>${escapeHtml(r.meta)}</p></div><div><strong>${r.value}</strong><div class="row-actions"><button class="mini-action" data-del="${table}:${x.id}">Xóa</button></div></div></div>`}).join(''):'<div class="empty">Chưa có dữ liệu.</div>'}</div>`}

function renderTransactions(){
  const all=[...state.transactions].sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at));
  return `<div class="page-head"><h2>Giao dịch</h2><button class="add-btn" data-add="transaction">+ Thêm</button></div><div class="panel list-card">${all.length?all.map(t=>`<div>${txHtml(t)}<div class="row-actions" style="justify-content:flex-end"><button class="mini-action" data-del="transactions:${t.id}">Xóa</button></div></div>`).join(''):'<div class="empty">Chưa có giao dịch.</div>'}</div>`;
}
function renderSettings(){
  return `<div class="page-head"><h2>Cài đặt</h2><span class="sync-pill ${state.demo?'offline':''}">${state.demo?'Demo cục bộ':'Supabase online'}</span></div>
    <div class="panel"><div class="setting-row"><div><strong>Bubble trợ lý</strong><small>Hiển thị Lumina đang “nói”</small></div><button class="switch ${state.settings.bubbles!==false?'on':''}" data-toggle="bubbles"></button></div><div class="setting-row"><div><strong>Âm thanh</strong><small>Hiệu ứng xác nhận nhẹ</small></div><button class="switch ${state.settings.sound!==false?'on':''}" data-toggle="sound"></button></div></div>
    <div class="panel"><div class="setting-row"><div><strong>Tài khoản đăng nhập</strong><small>Email + mật khẩu</small></div><span>✓</span></div><div class="setting-row"><div><strong>Phiên bản</strong><small>LUMINA Money · Update Gate thủ công</small></div><span>v${APP_VERSION}</span></div><div class="setting-row"><div><strong>Cập nhật</strong><small>Kiểm tra bản deploy mới, không tự cài.</small></div><button class="mini-action" data-check-update>Kiểm tra</button></div></div>`;
}

function bindPage(){
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  $$('[data-add]').forEach(b=>b.onclick=()=>openAddSheet(b.dataset.add));
  $$('[data-del]').forEach(b=>b.onclick=async()=>{const [table,id]=b.dataset.del.split(':');if(confirm('Xóa mục này?')) await dbDelete(table,id)});
  $$('[data-goal-add]').forEach(b=>b.onclick=()=>openGoalDeposit(b.dataset.goalAdd));
  $$('[data-toggle]').forEach(b=>b.onclick=()=>{const k=b.dataset.toggle;state.settings[k]=!state.settings[k];render()});
  $$('[data-check-update]').forEach(b=>b.onclick=async()=>{const v=await checkForNewVersion({silent:false});if(!v)toast(`LUMINA v${APP_VERSION} đang là phiên bản mới nhất.`)});
  const rw=$('#robotWrap'); if(rw) rw.onclick=()=>{ if(state.listening) return; startListening(); };
}

function openDrawer(){$('#drawer').classList.add('open');$('#backdrop').classList.add('show');$('#drawer').setAttribute('aria-hidden','false')}
function closeDrawer(){$('#drawer').classList.remove('open');$('#backdrop').classList.remove('show');$('#drawer').setAttribute('aria-hidden','true')}
function openSheet(title,html,onSubmit){
  $('#sheetTitle').textContent=title; $('#sheetBody').innerHTML=html; $('#sheet').classList.add('open'); $('#sheet').setAttribute('aria-hidden','false'); $('#backdrop').classList.add('show');
  const form=$('#sheet form'); if(form) form.onsubmit=onSubmit;
}
function closeSheet(){$('#sheet').classList.remove('open');$('#sheet').setAttribute('aria-hidden','true');$('#backdrop').classList.remove('show')}

function openAddSheet(kind){
  if(kind==='transaction') return transactionForm();
  if(kind==='goal') return genericForm('Thêm mục tiêu',`<label class="full">Tên mục tiêu<input name="title" required placeholder="Du lịch Đà Lạt"></label><label>Số tiền mục tiêu<input name="target" type="number" required min="1"></label><label>Đã có<input name="saved" type="number" value="0" min="0"></label><label class="full">Ngày dự kiến<input name="due_date" type="date"></label>`,async fd=>dbInsert('goals',{title:fd.get('title'),target:+fd.get('target'),saved:+fd.get('saved'),due_date:fd.get('due_date')||null,icon:'🎯'}));
  if(kind==='wallet') return genericForm('Thêm ví / tài sản',`<label class="full">Tên<input name="name" required placeholder="Vietcombank"></label><label>Loại<input name="type" placeholder="Ngân hàng / Ví"></label><label>Số dư<input name="balance" type="number" value="0"></label>`,async fd=>dbInsert('wallets',{name:fd.get('name'),type:fd.get('type')||'Ví',balance:+fd.get('balance'),icon:'💳'}));
  if(kind==='loan') return genericForm('Thêm khoản vay',`<label class="full">Tên khoản vay<input name="name" required></label><label>Giá trị vay<input name="principal" type="number" required></label><label>Còn lại<input name="remaining" type="number" required></label><label class="full">Hạn thanh toán<input name="due_date" type="date"></label>`,async fd=>dbInsert('loans',{name:fd.get('name'),principal:+fd.get('principal'),remaining:+fd.get('remaining'),due_date:fd.get('due_date')||null}));
  if(kind==='subscription') return genericForm('Thêm subscription',`<label class="full">Dịch vụ<input name="name" required placeholder="iCloud+"></label><label>Số tiền<input name="amount" type="number" required></label><label>Chu kỳ<select name="billing_cycle"><option value="monthly">Hàng tháng</option><option value="yearly">Hàng năm</option></select></label><label class="full">Kỳ thu tiếp theo<input name="next_charge" type="date"></label>`,async fd=>dbInsert('subscriptions',{name:fd.get('name'),amount:+fd.get('amount'),billing_cycle:fd.get('billing_cycle'),next_charge:fd.get('next_charge')||null}));
  if(kind==='bank') return genericForm('Thêm ngân hàng',`<label class="full">Ngân hàng<input name="bank_name" required placeholder="Vietcombank"></label><label class="full">Tên tài khoản<input name="account_label" placeholder="Tài khoản chính"></label><label class="full">4 số cuối<input name="last4" maxlength="4" inputmode="numeric"></label>`,async fd=>dbInsert('bank_accounts',{bank_name:fd.get('bank_name'),account_label:fd.get('account_label'),last4:fd.get('last4'),enabled:true}));
}
function genericForm(title,fields,handler){
  openSheet(title,`<form><div class="form-grid">${fields}</div><div class="sheet-actions"><button type="button" class="secondary" onclick="document.querySelector('#closeSheet').click()">Hủy</button><button class="primary" type="submit">Lưu</button></div></form>`,async e=>{e.preventDefault();await handler(new FormData(e.target));closeSheet();toast('Đã lưu')});
}
function transactionForm(prefill={}){
  const dt=(prefill.occurred_at?new Date(prefill.occurred_at):new Date()); const local=new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16);
  openSheet('Thêm giao dịch',`<form id="txForm"><div class="form-grid"><div class="full"><div class="segmented" id="kindSeg"><button type="button" data-kind="income" class="${prefill.kind==='income'?'active':''}">Thu nhập</button><button type="button" data-kind="expense" class="${!prefill.kind||prefill.kind==='expense'?'active':''}">Chi tiêu</button><button type="button" data-kind="saving" class="${prefill.kind==='saving'?'active':''}">Tiết kiệm</button></div><input type="hidden" name="kind" value="${prefill.kind||'expense'}"></div><label>Số tiền<input name="amount" type="number" inputmode="numeric" min="1" required value="${prefill.amount||''}"></label><label>Danh mục<input name="category" required value="${escapeAttr(prefill.category||'Ăn uống')}"></label><label class="full">Nội dung<input name="note" required value="${escapeAttr(prefill.note||'')}"></label><label>Tài khoản<input name="account" value="${escapeAttr(prefill.account||'Tiền mặt')}"></label><label>Thời gian<input name="occurred_at" type="datetime-local" value="${local}"></label></div><div class="sheet-actions"><button type="button" class="secondary" onclick="document.querySelector('#closeSheet').click()">Hủy</button><button class="primary" type="submit">Ghi nhận</button></div></form>`,async e=>{e.preventDefault();const fd=new FormData(e.target);const item={kind:fd.get('kind'),amount:+fd.get('amount'),category:fd.get('category'),note:fd.get('note'),account:fd.get('account'),occurred_at:new Date(fd.get('occurred_at')).toISOString()};await dbInsert('transactions',item);closeSheet();showConfirm(item)});
  $$('#kindSeg button').forEach(b=>b.onclick=()=>{$$('#kindSeg button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#txForm [name=kind]').value=b.dataset.kind});
}
function openGoalDeposit(id){
  const g=state.goals.find(x=>x.id===id); if(!g)return;
  genericForm('Nạp vào mục tiêu',`<label class="full">${escapeHtml(g.title)}<input name="amount" type="number" min="1" required placeholder="Số tiền"></label>`,async fd=>dbUpdate('goals',id,{saved:Number(g.saved||0)+Number(fd.get('amount')||0)}));
}

let recognition=null, silenceTimer=null, micStart=0, micClock=null;
function startListening(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return toast('Trình duyệt này chưa hỗ trợ nhận giọng nói Web Speech. Hãy dùng Safari iOS mới hoặc nhập thủ công.');
  if(state.listening) return;
  recognition=new SR(); recognition.lang='vi-VN'; recognition.continuous=false; recognition.interimResults=true;
  state.listening=true; micStart=Date.now(); $('#micOverlay').classList.remove('hidden'); render(); updateMicClock(); micClock=setInterval(updateMicClock,250);
  const armSilence=()=>{clearTimeout(silenceTimer);silenceTimer=setTimeout(()=>{try{recognition.stop()}catch{}},3000)};
  recognition.onstart=armSilence;
  recognition.onspeechstart=armSilence;
  recognition.onresult=e=>{armSilence();let text='';for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;$('#micTranscript').textContent=text;if(e.results[e.results.length-1].isFinal){const parsed=parseVoice(text); if(parsed){addVoiceTransaction(parsed)} else toast('Tôi chưa hiểu số tiền hoặc loại giao dịch.')}};
  recognition.onerror=e=>{toast(e.error==='not-allowed'?'Bạn chưa cho phép micro. Hãy bật quyền Microphone cho Safari.':'Không nhận được giọng nói. Thử lại nhé.');stopListening()};
  recognition.onend=()=>stopListening();
  try{recognition.start()}catch{stopListening()}
}
function stopListening(){
  clearTimeout(silenceTimer);clearInterval(micClock);silenceTimer=micClock=null;
  if(recognition){try{recognition.onend=null;recognition.stop()}catch{} recognition=null}
  state.listening=false; $('#micOverlay').classList.add('hidden'); if(state.user) render();
}
function updateMicClock(){const sec=Math.floor((Date.now()-micStart)/1000);$('#micTimer').textContent=`0:${String(sec).padStart(2,'0')}`}
function parseVoice(raw){
  const text=raw.toLowerCase().normalize('NFC');
  let kind=/\b(thu|nhận|nhan|lương|luong|được trả|duoc tra)\b/.test(text)?'income':/\b(tiết kiệm|tiet kiem|để dành|de danh)\b/.test(text)?'saving':'expense';
  let amount=null;
  const normalized=text.replace(/,/g,'.');
  let m=normalized.match(/(\d+(?:\.\d+)?)\s*(triệu|trieu|tr)\b/); if(m) amount=parseFloat(m[1])*1e6;
  if(!amount){m=normalized.match(/(\d+(?:\.\d+)?)\s*(nghìn|nghin|ngàn|ngan|k)\b/);if(m)amount=parseFloat(m[1])*1e3}
  if(!amount){m=normalized.match(/\b(\d{4,})\b/);if(m)amount=parseInt(m[1],10)}
  if(!amount) return null;
  const category=detectCategory(text,kind);
  let note=raw.replace(/\d+(?:[.,]\d+)?\s*(triệu|trieu|tr|nghìn|nghin|ngàn|ngan|k)?/ig,'').replace(/\b(thu|chi|nhận|lương|tiết kiệm|mua|trả|đồng|vnd)\b/ig,'').replace(/\s+/g,' ').trim();
  if(!note) note=kind==='income'?'Thu nhập':kind==='saving'?'Tiết kiệm':'Chi tiêu';
  return {kind,amount:Math.round(amount),category,note,account:'Tiền mặt',occurred_at:nowIso()};
}
function detectCategory(text,kind){
  if(kind==='income') return /lương|luong/.test(text)?'Lương':'Thu nhập khác'; if(kind==='saving') return 'Tiết kiệm';
  const rules=[['Ăn uống',/cà phê|ca phe|coffee|ăn|an |cơm|com|trà sữa|tra sua|nhậu|nhau/],['Di chuyển',/grab|taxi|xăng|xang|vé xe|ve xe|xe buýt|xe buyt/],['Mua sắm',/shopee|lazada|mua sắm|mua sam|quần|quan |áo|ao /],['Giải trí',/phim|game|netflix|spotify|giải trí|giai tri/],['Hóa đơn',/điện|dien|nước|nuoc|internet|wifi|điện thoại|dien thoai/]];
  return rules.find(([,r])=>r.test(text))?.[0]||'Khác';
}
async function addVoiceTransaction(item){
  try{await dbInsert('transactions',item);showConfirm(item);toast('Đã ghi nhận giao dịch bằng giọng nói');}finally{stopListening()}
}
function showConfirm(item){
  const c=$('#confirmCard'); c.innerHTML=`<h3>✅ Đã ghi nhận giao dịch!</h3><div class="confirm-row"><div class="tx-icon ${item.kind}">♨</div><div><p>${escapeHtml(item.note)}</p><small>${escapeHtml(item.category)}</small></div><strong class="${item.kind==='income'?'positive':'negative'}">${item.kind==='income'?'+':'-'} ${fmt(item.amount)}</strong></div>`; c.classList.remove('hidden'); setTimeout(()=>c.classList.add('hidden'),2200);
}

let blinkInterval=null;
function startBlinkLoop(){
  clearInterval(blinkInterval); blinkInterval=setInterval(()=>{const img=$('#robotImg');if(!img||state.listening)return;img.classList.add('blink');setTimeout(()=>img.classList.remove('blink'),190)},3200+Math.random()*2200);
}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),2600)}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escapeAttr(v=''){return escapeHtml(v)}

function semverParts(v){
  return String(v||'').replace(/^v/i,'').split('.').map(x=>parseInt(x,10)||0);
}
function isNewerVersion(candidate,current){
  const a=semverParts(candidate), b=semverParts(current), len=Math.max(a.length,b.length);
  for(let i=0;i<len;i++){const x=a[i]||0,y=b[i]||0;if(x!==y)return x>y}
  return false;
}
function parseVersionFromHtml(html){
  const m=String(html||'').match(/<meta\s+name=["']lumina-version["']\s+content=["']([^"']+)["']/i)
    || String(html||'').match(/<meta\s+content=["']([^"']+)["']\s+name=["']lumina-version["']/i);
  return m?.[1]?.trim()||null;
}
function ensureUpdateUI(){
  if($('#updatePrompt')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <section id="updatePrompt" class="update-prompt hidden" role="dialog" aria-modal="true" aria-labelledby="updateTitle">
      <div class="update-dialog glass">
        <div class="update-badge">✨ PHIÊN BẢN MỚI</div>
        <div class="update-icon"><span>↻</span></div>
        <h2 id="updateTitle">LUMINA có bản cập nhật mới</h2>
        <p id="updateVersionText">Phiên bản mới đã sẵn sàng.</p>
        <div class="update-version-row"><span>v${APP_VERSION}</span><b>→</b><strong id="updateTargetVersion">—</strong></div>
        <div class="update-note">LUMINA sẽ không tự cập nhật. Chỉ khi bạn đồng ý, bản mới mới được tải và kích hoạt.</div>
        <div class="update-actions">
          <button id="deferUpdateBtn" class="secondary" type="button">Để sau</button>
          <button id="acceptUpdateBtn" class="primary" type="button">Đồng ý cập nhật</button>
        </div>
      </div>
    </section>
    <section id="updateProgressOverlay" class="update-progress-overlay hidden" aria-live="assertive">
      <div class="update-stage">
        <div class="update-scene" aria-hidden="true">
          <div class="update-orbit orbit-a"></div><div class="update-orbit orbit-b"></div><div class="update-orbit orbit-c"></div>
          <div class="update-cube">
            <div class="cube-face cube-front">L</div><div class="cube-face cube-back">✦</div>
            <div class="cube-face cube-right">◈</div><div class="cube-face cube-left">AI</div>
            <div class="cube-face cube-top">↻</div><div class="cube-face cube-bottom">✓</div>
          </div>
          <div class="update-floor"></div>
        </div>
        <div class="update-copy">
          <span class="update-live-pill">LUMINA UPDATE</span>
          <h2 id="updateProgressTitle">Đang chuẩn bị phiên bản mới...</h2>
          <p id="updateProgressSub">Giữ nguyên màn hình trong lúc LUMINA hoàn tất cập nhật.</p>
          <div class="release-progress"><i id="releaseProgressBar"></i><span class="release-shine"></span></div>
          <strong id="releaseProgressPct">0%</strong>
        </div>
      </div>
    </section>`);
  $('#deferUpdateBtn').onclick=hideUpdatePrompt;
  $('#acceptUpdateBtn').onclick=()=>pendingUpdateVersion&&runUserApprovedUpdate(pendingUpdateVersion);
}
function showUpdatePrompt(version){
  if(updateFlowBusy||!version) return;
  ensureUpdateUI();
  pendingUpdateVersion=version;
  $('#updateTargetVersion').textContent=`v${version}`;
  $('#updateVersionText').textContent=`LUMINA v${version} đã được deploy và đang chờ bạn cho phép cập nhật.`;
  $('#updatePrompt').classList.remove('hidden');
  $('#notifDot')?.classList.remove('hidden');
}
function hideUpdatePrompt(){ $('#updatePrompt')?.classList.add('hidden'); }
function setPendingUpdate(version){
  pendingUpdateVersion=version;
  $('#notifDot')?.classList.toggle('hidden',!version);
}
async function fetchLatestDeployedVersion(){
  const url=new URL('./index.html',window.location.href);
  url.searchParams.set('__lumina_probe',`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const res=await fetch(url,{cache:'no-store',headers:{'X-Lumina-Version-Probe':'1'}});
  if(!res.ok) throw new Error(`Không kiểm tra được phiên bản mới (${res.status}).`);
  const html=await res.text();
  return parseVersionFromHtml(html);
}
async function checkForNewVersion({silent=false}={}){
  if(updateFlowBusy||location.protocol==='file:') return null;
  try{
    const latest=await fetchLatestDeployedVersion();
    if(latest&&isNewerVersion(latest,APP_VERSION)){
      const wasPending=pendingUpdateVersion===latest;
      setPendingUpdate(latest);
      if(!silent||!wasPending) showUpdatePrompt(latest);
      return latest;
    }
    setPendingUpdate(null);
    return null;
  }catch(err){
    if(!silent) toast(err.message||'Chưa thể kiểm tra bản cập nhật.');
    return null;
  }
}
function waitForController(timeout=5000){
  if(navigator.serviceWorker?.controller) return Promise.resolve(navigator.serviceWorker.controller);
  return new Promise(resolve=>{
    let done=false;
    const finish=()=>{if(done)return;done=true;clearTimeout(t);navigator.serviceWorker?.removeEventListener('controllerchange',onChange);resolve(navigator.serviceWorker?.controller||null)};
    const onChange=()=>finish();
    const t=setTimeout(finish,timeout);
    navigator.serviceWorker?.addEventListener('controllerchange',onChange,{once:true});
  });
}
function swRequest(type,payload={},timeout=35000){
  return new Promise(async(resolve,reject)=>{
    const controller=navigator.serviceWorker?.controller||await waitForController();
    if(!controller) return reject(new Error('Update Gate chưa được kích hoạt. Hãy đóng rồi mở lại LUMINA một lần.'));
    const channel=new MessageChannel();
    const timer=setTimeout(()=>reject(new Error('Quá thời gian xử lý bản cập nhật.')),timeout);
    channel.port1.onmessage=e=>{clearTimeout(timer);const data=e.data||{};data.ok?resolve(data):reject(new Error(data.error||'Không thể xử lý bản cập nhật.'))};
    controller.postMessage({type,...payload},[channel.port2]);
  });
}
function setUpdateProgress(pct,status){
  const n=Math.max(0,Math.min(100,Math.round(pct)));
  const bar=$('#releaseProgressBar'),label=$('#releaseProgressPct');
  if(bar)bar.style.width=`${n}%`; if(label)label.textContent=`${n}%`;
  if(status&&$('#updateProgressSub'))$('#updateProgressSub').textContent=status;
}
async function runUserApprovedUpdate(version){
  if(updateFlowBusy) return;
  updateFlowBusy=true; hideUpdatePrompt(); ensureUpdateUI();
  const overlay=$('#updateProgressOverlay'); overlay.classList.remove('hidden');
  $('#updateProgressTitle').textContent=`Đang cập nhật lên v${version}`;
  $('#updateProgressSub').textContent='Đang tải gói giao diện và tính năng mới an toàn...';
  setUpdateProgress(0);
  const started=performance.now();
  let stageDone=false,stageError=null;
  const stagePromise=swRequest('STAGE_RELEASE',{version},45000).then(r=>{stageDone=true;return r}).catch(e=>{stageError=e;stageDone=true;throw e});
  const ticker=setInterval(()=>{
    const elapsed=performance.now()-started;
    let pct=Math.floor((elapsed/UPDATE_PROGRESS_DURATION_MS)*100);
    if(!stageDone) pct=Math.min(pct,99);
    setUpdateProgress(Math.min(pct,100),pct<35?'Đang tải giao diện mới...':pct<72?'Đang đồng bộ các mô-đun LUMINA...':pct<100?'Đang xác minh bản cập nhật...':'Hoàn tất');
  },80);
  try{
    await Promise.all([stagePromise,new Promise(r=>setTimeout(r,UPDATE_PROGRESS_DURATION_MS))]);
    clearInterval(ticker);
    if(stageError) throw stageError;
    setUpdateProgress(100,'Bản cập nhật đã được xác minh.');
    await swRequest('COMMIT_RELEASE',{version},10000);
    $('#updateProgressTitle').textContent=`Cập nhật phiên bản mới v${version} thành công`;
    $('#updateProgressSub').textContent='LUMINA đang đưa bạn trở lại màn hình chính...';
    overlay.classList.add('update-success');
    sessionStorage.setItem('lumina-return-home','1');
    await new Promise(r=>setTimeout(r,1800));
    const next=new URL(window.location.href); ['error','error_code','error_description','code'].forEach(k=>next.searchParams.delete(k));
    next.searchParams.set('updated',version);
    window.location.replace(next.toString());
  }catch(err){
    clearInterval(ticker); updateFlowBusy=false;
    overlay.classList.remove('update-success'); overlay.classList.add('hidden');
    toast(`Cập nhật chưa hoàn tất: ${err.message||err}`);
    setPendingUpdate(version); showUpdatePrompt(version);
  }
}
async function initUpdateGate(){
  ensureUpdateUI();
  if(!('serviceWorker' in navigator)||!/^https?:$/.test(location.protocol)) return;
  try{
    await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    await waitForController(5000);
    setTimeout(()=>checkForNewVersion({silent:true}),1800);
    clearInterval(updateCheckTimer);
    updateCheckTimer=setInterval(()=>{if(!document.hidden)checkForNewVersion({silent:true})},UPDATE_CHECK_INTERVAL_MS);
    window.addEventListener('online',()=>checkForNewVersion({silent:true}));
  }catch(err){ console.warn('Lumina Update Gate:',err); }
}

initUpdateGate();
init();


/* ===== LUMINA v1.5.8 runtime fixes & UI consistency ===== */
function luminaIcon(name, cls=''){
  const icons={
    home:`<path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V20h14V9.5"></path>`,
    stats:`<path d="M5 19V11"></path><path d="M12 19V5"></path><path d="M19 19v-8"></path><path d="M3 19h18"></path>`,
    mic:`<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v3"></path><path d="M8 21h8"></path>`,
    goals:`<circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="2.5"></circle><path d="M19 5 14.5 9.5"></path>`,
    wallet:`<path d="M4 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4z"></path><path d="M4 9V6a2 2 0 0 1 2-2h10"></path><path d="M16 13h4"></path>`,
    bell:`<path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5"></path><path d="M10 21a2 2 0 0 0 4 0"></path>`,
    income:`<path d="M12 19V5"></path><path d="m7 10 5-5 5 5"></path><path d="M5 19h14"></path>`,
    expense:`<path d="M12 5v14"></path><path d="m17 14-5 5-5-5"></path><path d="M5 5h14"></path>`,
    saving:`<path d="M12 3 19 12 12 21 5 12 12 3Z"></path><path d="M12 8v8"></path>`,
    bank:`<path d="M3 10h18"></path><path d="M5 10v8"></path><path d="M10 10v8"></path><path d="M14 10v8"></path><path d="M19 10v8"></path><path d="M2 20h20"></path><path d="M12 3 3 7v2h18V7Z"></path>`,
    loan:`<rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M8 10h8"></path><path d="M8 14h5"></path>`,
    subscription:`<path d="M17 1v4"></path><path d="M7 1v4"></path><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18"></path><path d="m8 15 2 2 4-4"></path>`,
    settings:`<path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 1 0 12 8.5z"></path><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.4 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.8a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.4a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6c.39 0 .76-.14 1.04-.4.28-.26.46-.62.46-1V3a2 2 0 1 1 4 0v.1c0 .39.18.74.46 1 .28.26.65.4 1.04.4.7 0 1.37-.27 1.87-.76l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .39.14.76.4 1.04.26.28.62.46 1 .46h.1a2 2 0 1 1 0 4h-.1c-.39 0-.74.18-1 .46-.26.28-.4.65-.4 1.04Z"></path>`,
    trash:`<path d="M4 7h16"></path><path d="M10 11v5"></path><path d="M14 11v5"></path><path d="M6 7l1 12h10l1-12"></path><path d="M9 7V4h6v3"></path>`,
    plus:`<path d="M12 5v14"></path><path d="M5 12h14"></path>`,
    sync:`<path d="M20 6v6h-6"></path><path d="M4 18v-6h6"></path><path d="M7 8a7 7 0 0 1 11-2"></path><path d="M17 16a7 7 0 0 1-11 2"></path>`,
    eye:`<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.5"></circle>`,
    leaf:`<path d="M18 4c-4 0-8 2-10 5-1.3 1.8-1.7 4-1 6 2-.6 4-.2 5.9-.7 3.4-.9 5.1-4.1 5.1-10Z"></path><path d="M8 20c1.2-3.2 3.8-5.7 7-7"></path>`,
    rain:`<path d="M7 17 6 19"></path><path d="M12 17l-1 2"></path><path d="M17 17l-1 2"></path><path d="M6 14a4 4 0 0 1 .6-8A5.5 5.5 0 0 1 17 7.5 3.5 3.5 0 1 1 17.5 14Z"></path>`,
    alert:`<path d="M12 4 3 20h18L12 4Z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path>`
  };
  return `<svg viewBox="0 0 24 24" class="nav-svg ${cls}" aria-hidden="true">${icons[name]||icons.wallet}</svg>`;
}
function moodText(m){ return m==='angry'?'Đang cảnh báo':m==='sad'?'Cần chú ý':'Đang ổn định'; }
function assistantMessage(mood){
  const s=sums();
  if(mood==='angry') return 'Cảnh báo!<br>Đã vượt thu nhập.';
  if(mood==='sad') return 'Chi tiêu đang cao.<br>Xem lại nhé.';
  if(s.income===0 && s.expense===0) return 'Xin chào!<br>Thêm giao dịch đầu tiên.';
  return 'Tốt lắm!<br>Chi tiêu đang ổn.';
}
function renderHome(){
  const s=sums(), prev=previousMonthSums(); const balance=s.income-s.expense-s.saving; const prevBal=prev.income-prev.expense-prev.saving; const delta=balance-prevBal;
  const mood=state.listening?'happy':robotMood(); state.robot=mood;
  const recent=[...state.transactions].sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at)).slice(0,5);
  const moodDecor = mood==='happy'?luminaIcon('leaf'):mood==='sad'?luminaIcon('rain'):luminaIcon('alert');
  return `
    <div class="assistant-zone">
      <div class="weather-mood">${moodDecor}</div>
      ${state.listening?'<div class="listen-badge">🎙 Tôi đang nghe bạn...</div>':''}
      <div class="robot-wrap" id="robotWrap"><div class="holo"></div><img id="robotImg" class="robot-img robot-${mood} ${state.listening?'listening':''}" alt="Lumina assistant"></div>
      ${state.settings.bubbles!==false?`<div class="speech-bubble ${mood==='angry'?'warning':''}">${assistantMessage(mood)}</div>`:''}
      <div class="assistant-state ${mood}">${moodText(mood)}</div>
    </div>
    <div class="balance-card">
      <div><div class="card-label">Số dư hiện tại ${luminaIcon('eye')}</div><div class="amount-main ${balance<0?'negative':''}">${fmt(balance)}</div></div>
      <div class="trend ${delta<0?'negative':''}"><strong>${delta>=0?'↑':'↓'} ${fmt(Math.abs(delta))}</strong>so với tháng trước</div>
    </div>
    <div class="stat-grid">
      <div class="mini-card income"><div class="ico">${luminaIcon('income')}</div><small>Thu nhập</small><strong>${fmt(s.income)}</strong></div>
      <div class="mini-card expense"><div class="ico">${luminaIcon('expense')}</div><small>Chi tiêu</small><strong>${fmt(s.expense)}</strong></div>
      <div class="mini-card saving"><div class="ico">${luminaIcon('saving')}</div><small>${balance<0?'Vượt mức':'Tiết kiệm'}</small><strong>${fmt(balance<0?Math.abs(balance):s.saving)}</strong></div>
    </div>
    <div class="transaction-wrap">
      <div class="section-title"><h3>Giao dịch gần đây</h3><button class="text-action" data-go="transactions">Xem tất cả</button></div>
      <div class="transaction-panel"><div class="tx-list">${recent.length?recent.map(txHtml).join(''):'<div class="empty">Chưa có giao dịch.<br>Nhấn micro hoặc thêm thủ công.</div>'}</div></div>
    </div>`;
}
function txHtml(t){
  const cls=t.kind||'expense', sign=cls==='income'?'+':cls==='expense'?'-':'↗';
  const iconKey=cls==='income'?'income':cls==='saving'?'saving':'expense';
  const d=new Date(t.occurred_at||t.created_at||Date.now());
  return `<div class="tx" data-tx="${t.id}"><div class="tx-icon ${cls}">${luminaIcon(iconKey)}</div><div><div class="tx-name">${escapeHtml(t.note||t.category||'Giao dịch')}</div><div class="tx-meta">${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} · ${escapeHtml(t.category||'Khác')}${t.account?' · '+escapeHtml(t.account):''}</div></div><div class="tx-amount ${cls==='income'?'positive':cls==='expense'?'negative':''}">${sign} ${fmt(t.amount)}</div></div>`;
}
function catHtml(cat,val,total,i){const keys=['expense','wallet','goals','stats','saving','bank'];const pct=total?Math.round(val/total*100):0;return `<div class="cat-row"><div class="tx-icon expense">${luminaIcon(keys[i%keys.length])}</div><div class="cat-main"><span>${escapeHtml(cat)}</span><strong>${pct}%</strong><div class="cat-progress"><i style="width:${pct}%"></i></div></div><div class="cat-amount">${fmtShort(val)}</div></div>`}
function entityPage(title,kind,arr,mapFn){return `<div class="page-head"><h2>${title}</h2><button class="add-btn" data-add="${kind}">${luminaIcon('plus')}<span>Thêm</span></button></div><div class="panel list-card">${arr.length?arr.map(x=>{const r=mapFn(x);const table=kind==='wallet'?'wallets':kind==='loan'?'loans':'subscriptions';return `<div class="entity-row"><div class="entity-icon">${luminaIcon(r.iconKey||'wallet')}</div><div><h4>${escapeHtml(r.title)}</h4><p>${escapeHtml(r.meta)}</p></div><div><strong>${r.value}</strong><div class="row-actions"><button class="mini-action" data-del="${table}:${x.id}">${luminaIcon('trash')} Xóa</button></div></div></div>`}).join(''):'<div class="empty">Chưa có dữ liệu.</div>'}</div>`}
function renderWallets(){return entityPage('Ví & Tài sản','wallet',state.wallets,w=>({iconKey:'wallet',title:w.name,meta:w.type||'Ví',value:fmt(w.balance)}));}
function renderLoans(){return entityPage('Khoản vay','loan',state.loans,l=>({iconKey:'loan',title:l.name,meta:`Còn ${fmt(l.remaining)} · Hạn ${l.due_date||'—'}`,value:fmt(l.principal)}));}
function renderSubscriptions(){return entityPage('Subscription','subscription',state.subscriptions,s=>({iconKey:'subscription',title:s.name,meta:`${s.billing_cycle==='yearly'?'Hàng năm':'Hàng tháng'} · Kỳ tới ${s.next_charge||'—'}`,value:fmt(s.amount)}));}
function renderBanks(){
  const rows=state.bank_accounts.map(b=>`<div class="entity-row"><div class="entity-icon">${luminaIcon('bank')}</div><div><h4>${escapeHtml(b.bank_name)}</h4><p>${escapeHtml(b.account_label||'Tài khoản')} · **** ${escapeHtml(b.last4||'')}</p></div><div><strong>${b.enabled?'Đang dùng':'Tắt'}</strong><div class="row-actions"><button class="mini-action" data-del="bank_accounts:${b.id}">${luminaIcon('trash')} Xóa</button></div></div></div>`).join('');
  return `<div class="page-head"><h2>Ngân hàng</h2><button class="add-btn" data-add="bank">${luminaIcon('plus')}<span>Thêm</span></button></div><div class="notice">Trên iPhone, web app không thể đọc thông báo nền của ứng dụng ngân hàng khác. Trang này dùng để quản lý tài khoản ngân hàng và nhập giao dịch thủ công/giọng nói.</div><div class="panel list-card">${rows||'<div class="empty">Chưa có tài khoản ngân hàng.</div>'}</div>`;
}
function renderTransactions(){const all=[...state.transactions].sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at));return `<div class="page-head"><h2>Giao dịch</h2><button class="add-btn" data-add="transaction">${luminaIcon('plus')}<span>Thêm</span></button></div><div class="panel list-card">${all.length?all.map(t=>`<div>${txHtml(t)}<div class="row-actions" style="justify-content:flex-end"><button class="mini-action" data-del="transactions:${t.id}">${luminaIcon('trash')} Xóa</button></div></div>`).join(''):'<div class="empty">Chưa có giao dịch.</div>'}</div>`;}
function renderSettings(){return `<div class="page-head"><h2>Cài đặt</h2></div><div class="panel"><div class="setting-row"><div><strong>Tài khoản đăng nhập</strong><small>Email + mật khẩu</small></div><span>✓</span></div><div class="setting-row"><div><strong>Phiên bản</strong><small>LUMINA Money · Update Gate thủ công</small></div><span>v${APP_VERSION}</span></div><div class="setting-row"><div><strong>Cập nhật</strong><small>Kiểm tra bản deploy mới, không tự cài.</small></div><button class="mini-action" data-check-update>${luminaIcon('sync')} Kiểm tra</button></div><div class="setting-row"><div><strong>Hiển thị bubble AI</strong><small>Bật/tắt lời thoại nổi của trợ lý</small></div><button class="mini-action" data-toggle="bubbles">${state.settings.bubbles!==false?'Đang bật':'Đang tắt'}</button></div></div>`;}
function dbFriendlyError(error){
  const raw=String(error?.message||error||'').trim();
  const msg=raw.toLowerCase();
  if(msg.includes('permission denied')||msg.includes('row-level security')) return 'Tài khoản chưa có quyền ghi dữ liệu. Hãy chạy lại file supabase.sql v1.5.8 trong Supabase rồi đăng xuất/đăng nhập lại.';
  if(msg.includes('jwt')||msg.includes('auth')) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';
  if(msg.includes('violates foreign key')) return 'Tài khoản chưa được khởi tạo đầy đủ. Hãy đăng xuất rồi đăng nhập lại một lần.';
  return raw || 'Có lỗi dữ liệu xảy ra. Vui lòng thử lại.';
}
async function dbInsert(table,row){
  const item={...row,id:row.id||crypto.randomUUID(),user_id:uid()};
  if(state.demo){ state[table].unshift(item); demoSave(); render(); return item; }
  const {data,error}=await sb.from(table).insert({...row,user_id:uid()}).select().single();
  if(error){const m=dbFriendlyError(error); toast(m); throw new Error(m)}
  await refreshAll(); return data;
}
async function dbUpdate(table,id,patch){
  if(state.demo){ const i=state[table].findIndex(x=>x.id===id); if(i>=0) state[table][i]={...state[table][i],...patch}; demoSave(); render(); return; }
  const {error}=await sb.from(table).update(patch).eq('id',id).eq('user_id',uid()); if(error){const m=dbFriendlyError(error); toast(m); throw new Error(m)} await refreshAll();
}
async function dbDelete(table,id){
  if(state.demo){ state[table]=state[table].filter(x=>x.id!==id); demoSave(); render(); return; }
  const {error}=await sb.from(table).delete().eq('id',id).eq('user_id',uid()); if(error){const m=dbFriendlyError(error); toast(m); throw new Error(m)} await refreshAll();
}
function genericForm(title,fields,handler){
  openSheet(title,`<form><div class="form-grid">${fields}</div><div class="sheet-actions"><button type="button" class="secondary" onclick="document.querySelector('#closeSheet').click()">Hủy</button><button class="primary" type="submit">Lưu</button></div></form>`,async e=>{e.preventDefault();try{await handler(new FormData(e.target));closeSheet();toast('Đã lưu')}catch(err){console.warn(err)}});
}
function transactionForm(prefill={}){
  const dt=(prefill.occurred_at?new Date(prefill.occurred_at):new Date()); const local=new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16);
  openSheet('Thêm giao dịch',`<form id="txForm"><div class="form-grid"><div class="full"><div class="segmented" id="kindSeg"><button type="button" data-kind="income" class="${prefill.kind==='income'?'active':''}">Thu nhập</button><button type="button" data-kind="expense" class="${!prefill.kind||prefill.kind==='expense'?'active':''}">Chi tiêu</button><button type="button" data-kind="saving" class="${prefill.kind==='saving'?'active':''}">Tiết kiệm</button></div><input type="hidden" name="kind" value="${prefill.kind||'expense'}"></div><label>Số tiền<input name="amount" type="number" inputmode="numeric" min="1" required value="${prefill.amount||''}"></label><label>Danh mục<input name="category" required value="${escapeAttr(prefill.category||'Ăn uống')}"></label><label class="full">Nội dung<input name="note" required value="${escapeAttr(prefill.note||'')}"></label><label>Tài khoản<input name="account" value="${escapeAttr(prefill.account||'Tiền mặt')}"></label><label>Thời gian<input name="occurred_at" type="datetime-local" value="${local}"></label></div><div class="sheet-actions"><button type="button" class="secondary" onclick="document.querySelector('#closeSheet').click()">Hủy</button><button class="primary" type="submit">Ghi nhận</button></div></form>`,async e=>{e.preventDefault();const fd=new FormData(e.target);const rawDate=fd.get('occurred_at');const item={kind:fd.get('kind'),amount:+fd.get('amount'),category:fd.get('category'),note:fd.get('note'),account:fd.get('account'),occurred_at:rawDate?new Date(rawDate).toISOString():nowIso()};try{await dbInsert('transactions',item);closeSheet();showConfirm(item)}catch(err){console.warn(err)}});
  $$('#kindSeg button').forEach(b=>b.onclick=()=>{$$('#kindSeg button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#txForm [name=kind]').value=b.dataset.kind});
}
async function addVoiceTransaction(item){ try{await dbInsert('transactions',item);showConfirm(item);toast('Đã ghi nhận giao dịch bằng giọng nói');}catch(err){console.warn(err)}finally{stopListening()} }
function showConfirm(item){ const c=$('#confirmCard'); const icon=item.kind==='income'?'income':item.kind==='saving'?'saving':'expense'; c.innerHTML=`<h3>✅ Đã ghi nhận giao dịch!</h3><div class="confirm-row"><div class="tx-icon ${item.kind}">${luminaIcon(icon)}</div><div><p>${escapeHtml(item.note)}</p><small>${escapeHtml(item.category)}</small></div><strong class="${item.kind==='income'?'positive':'negative'}">${item.kind==='income'?'+':item.kind==='expense'?'-':'↗'} ${fmt(item.amount)}</strong></div>`; c.classList.remove('hidden'); clearTimeout(c._timer); c._timer=setTimeout(()=>c.classList.add('hidden'),2200);}
function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.remove('show');void t.offsetWidth;t.classList.add('show');clearTimeout(t._timer);clearTimeout(t._clear);t._timer=setTimeout(()=>t.classList.remove('show'),2600);t._clear=setTimeout(()=>{if(!t.classList.contains('show')) t.textContent='';},3200)}

/* ===== LUMINA v1.5.9 · smart capture, wallet-only accounts, notifications, reactive AI ===== */
var AI_LINES = {
  income:[
    'Đẹp! Tiền vừa vào, hôm nay làm ăn có lực đấy.','Giỏi. Cộng tiền kiểu này mới đúng bài.','Ô kê, ví vừa béo lên rồi. Giữ nhịp này nhé.','Có tiền vào là Lumina vui hẳn. Làm tốt lắm.','Thu nhập tăng rồi. Nay đáng được khen.','Quá ổn. Tiền đang đi đúng chiều.','Đỉnh. Ví vừa được tiếp máu.','Tốt lắm, kiếm tiền có nghề rồi đấy.','Cú cộng tiền này nhìn rất đã mắt.','Giỏi thật. Cứ để số dư xanh thế này đi.','Có thu nhập mới rồi. Lumina chấm điểm cao.','Tài chính vừa sáng lên một nấc.','Chuẩn bài: kiếm trước, tiêu sau.','Hay. Khoản này giúp tháng này dễ thở hơn.','Được đấy. Ví tiền đang cảm ơn bạn.','Làm tốt. Đừng vội tiêu sạch chiến lợi phẩm nhé.','Cộng tiền thành công. Hôm nay có quyền tự hào.','Thu nhập đẹp. Lumina duyệt.','Tốt. Thêm một khoản làm số dư khỏe hơn.','Kiếm tiền thế này thì robot cũng phải nể.','Ví vừa tăng cân. Làm tiếp đi.','Khoản thu này rất có ích. Giỏi nhé.','Tiền vào rồi. Giờ giữ nó ở lại càng lâu càng tốt.','Hôm nay có thành quả. Chúc mừng.','Cộng tiền ngon lành. Tài chính đang lên mood.','Làm ra tiền là kỹ năng, giữ được tiền là đẳng cấp.','Một khoản thu đẹp. Đừng phụ công mình nhé.','Nice. Số dư vừa được cứu viện.','Tốt lắm. Tháng này có thêm khoảng thở.','Tiền vào đúng lúc. Lumina khen thật.'
  ],
  light:[
    'Khoản này chưa lớn, nhưng cộng nhiều lần là thành lớn đấy.','Chi nhẹ thôi. Lumina vẫn đang nhìn đấy nhé.','Ổn, chưa đau ví. Nhưng đừng để lặt vặt thành cả triệu.','Khoản nhỏ, kiểm soát được. Cứ tỉnh táo là ổn.','Một cú chi nhẹ. Không sao, miễn là có chủ đích.','Chưa đáng lo, nhưng nhớ tổng tháng mới là thứ đáng sợ.','Chi được, miễn đừng biến thành thói quen vô thức.','Ví hơi nhói một chút thôi.','Khoản này tạm ổn. Đừng tiện tay mua thêm nhé.','Nhẹ nhàng thôi, số dư còn phải sống đến cuối tháng.','Chi nhỏ nhưng Lumina vẫn ghi sổ đầy đủ.','Ổn. Tự hỏi một câu: có thật sự cần không?','Chưa tới mức báo động. Giữ nhịp thế này là được.','Một khoản hợp lý thì không cần áy náy.','Chi tiêu có kiểm soát là tốt.','Ví vẫn chịu được. Đừng thử sức chịu đựng của nó quá.','Khoản này nhỏ. Quan trọng là đừng lặp 10 lần.','Tạm duyệt. Lumina chưa cau mày đâu.','Không quá tay. Tốt.','Chi nhẹ, nhớ bù lại bằng một khoản tiết kiệm nhé.','Vẫn trong vùng an toàn.','Ổn áp. Nhưng đừng lấy câu “có chút thôi” làm lý do cả ngày.','Khoản nhỏ, cứ ghi đều là bạn sẽ thấy thói quen thật.','Chấp nhận được. Tiếp tục theo dõi nhé.','Không sao. Có kế hoạch là được.','Lumina cho qua khoản này.','Ví chỉ mất một ít máu. Chưa cần cấp cứu.','Tạm ổn. Hãy giữ các khoản sau cũng gọn như vậy.','Chi tiêu nhỏ có ý thức thì không xấu.','Khoản này ổn, miễn là không phá ngân sách ngày.'
  ],
  heavy:[
    'Ông nội ơi, một phát hơn 500 nghìn luôn à? Kiểm tra lại ví đi.','Mày vừa đốt một cục tiền khá to đấy. Có đáng không?','Khoản này nặng ví thật. Đừng bảo Lumina không cảnh báo.','Hơn 500 nghìn một cú. Tiêu kiểu này cuối tháng đừng khóc nhé.','Ác thật, ví vừa ăn nguyên một cú đấm.','Khoản chi to rồi đấy. Dừng tay vài phút trước khi mua tiếp.','Mạnh tay thế? Ít nhất phải chắc rằng món này đáng tiền.','Ví đang nhìn mày với ánh mắt thất vọng đấy.','Một cú chi nặng. Hôm nay bớt mua linh tinh lại.','Trời đất, tiền bay nhanh hơn tốc độ kiếm rồi.','Khoản này đau. Lumina đề nghị khóa tay mua sắm tạm thời.','Chơi lớn quá rồi. Nhìn lại ngân sách tháng ngay.','Tiền không mọc lại trong 5 phút đâu nhé.','Cú này đủ nặng để phải cân lại các khoản còn lại.','Mày tiêu hơn nửa triệu như bấm nút vậy à?','Ví vừa bị hành. Nghỉ mua sắm một nhịp đi.','Khoản này không còn là “tiêu vặt” nữa đâu.','Được rồi đại gia, giờ xem còn bao nhiêu tiền đã.','Một phát khá gắt. Đừng nối combo thêm nữa.','Nếu món này không cần thiết thì cú chi này hơi ngu đấy.','Khoản lớn. Hít một cái rồi xem lại mục tiêu tiết kiệm.','Lumina đang đỏ mắt vì cú chi này đấy.','Nặng tay thật. Tháng này phải bù lại bằng tiết kiệm.','Cú chi to đã ghi nhận. Giờ đừng tự lừa mình là “không đáng bao nhiêu”.','Mày vừa làm biểu đồ chi tiêu nhảy dựng lên.','Khoản này đủ lớn để cần một lý do tử tế.','Đau ví. Rất đau ví.','Chi hơn 500 nghìn rồi. Tạm cai nút mua ngay nhé.','Tài chính vừa ăn damage lớn.','Cú này gắt. Phần còn lại của tháng phải chơi phòng thủ.'
  ],
  overspend:[
    'Âm tiền rồi đấy. Mày tiêu kiểu gì mà thu nhập không đỡ nổi vậy?','Số dư âm. Dừng mua linh tinh ngay, không đùa nữa.','Toang rồi. Chi vượt thu nhập thật rồi đấy.','Mày vừa đưa ví xuống dưới số 0. Làm ơn tỉnh lại.','Âm tiền mà còn định tiêu tiếp thì Lumina chịu thua.','Báo động đỏ: kiếm ít hơn tiêu. Sửa ngay.','Ví âm rồi. Đây không còn là lúc “thích thì mua” nữa.','Chi quá tay rồi đấy. Cắt các khoản không cần thiết ngay.','Số dư đang âm. Mày đang tiêu tiền của tương lai đấy.','Đừng tự an ủi nữa: tháng này đang vượt thu nhập.','Âm là âm. Nghỉ mua sắm và lên kế hoạch bù lại đi.','Lumina giận thật. Tiền ra nhiều hơn tiền vào rồi.','Ví đã thủng. Việc đầu tiên: dừng chi không thiết yếu.','Mày vừa vượt giới hạn. Từ giờ ưu tiên sống sót tài chính.','Âm tiền rồi mà còn “một món nữa” là dở đấy.','Đây là cảnh báo thật: dòng tiền đang sai hướng.','Tiêu đến âm thì phải phanh, không phải tăng ga.','Số dư đỏ chót rồi. Nhìn thẳng vào nó đi.','Tháng này đang bị chi tiêu đè đầu. Cắt ngay một nhóm chi.','Lumina không vui: tài chính đã xuống dưới 0.','Mày đang vay tương lai để trả cho hiện tại đấy.','Dừng combo tiêu tiền. Ví hết chịu nổi rồi.','Âm tiền là tín hiệu phải đổi hành vi ngay.','Không ổn. Thu chưa đủ mà chi đã vượt.','Cảnh báo nặng: nếu tiếp tục, mục tiêu tiết kiệm coi như bay.','Số dư âm. Mọi khoản mua sắm không cần thiết tạm cấm.','Thật sự quá tay rồi. Phải kéo số dư về dương trước.','Ví đang cấp cứu. Đừng tạo thêm giao dịch chi nữa.','Mày vừa tiêu vượt khả năng tháng này. Chấn chỉnh ngay.','Đỏ rồi. Hôm nay ngừng tiêu, mai tính tiếp.'
  ]
};
var lastAiLine='';
var typingTimer=null;
var reactionTimer=null;
var voiceFinalized=false;
var pendingVoiceTransaction=null;
var resumeTransactionAfterWallet=false;

function stripVN(v=''){
  return String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9.,\s+-]/g,' ').replace(/\s+/g,' ').trim();
}
function pickAiLine(bank){
  const arr=AI_LINES[bank]||AI_LINES.light; let line=arr[Math.floor(Math.random()*arr.length)];
  if(arr.length>1 && line===lastAiLine) line=arr[(arr.indexOf(line)+1+Math.floor(Math.random()*(arr.length-1)))%arr.length];
  lastAiLine=line; return line;
}
function financialBalance(){const s=sums();return s.income-s.expense-s.saving}
function reactionForTransaction(item){
  const balance=financialBalance();
  if(balance<0) return {mood:'angry',bank:'overspend'};
  if(item.kind==='income') return {mood:'happy',bank:'income'};
  if(item.kind==='expense' && Number(item.amount)>=500000) return {mood:'angry',bank:'heavy'};
  if(item.kind==='expense') return {mood:'sad',bank:'light'};
  return {mood:'happy',bank:'income'};
}
function setAssistantReaction(item){
  const r=reactionForTransaction(item); const text=pickAiLine(r.bank);
  state.assistantReaction={mood:r.mood,text,until:Date.now()+12000};
  clearTimeout(reactionTimer); reactionTimer=setTimeout(()=>{state.assistantReaction=null;if(state.page==='home')render()},12050);
  return text;
}
function currentAssistant(){
  if(state.assistantReaction && state.assistantReaction.until>Date.now()) return state.assistantReaction;
  const mood=robotMood();
  if(mood==='angry') return {mood,text:pickAiLine('overspend')};
  if(mood==='sad') return {mood,text:pickAiLine('light')};
  if(sums().income===0&&sums().expense===0) return {mood:'happy',text:'Xin chào! Hãy thêm giao dịch đầu tiên.'};
  return {mood:'happy',text:pickAiLine('income')};
}
function typeAssistantText(text){
  const el=$('#assistantTyping'); if(!el)return; clearInterval(typingTimer); el.textContent='';
  const chars=Array.from(String(text||'')); let i=0;
  typingTimer=setInterval(()=>{ if(!document.body.contains(el)){clearInterval(typingTimer);return} el.textContent+=chars[i]||''; i++; if(i>=chars.length)clearInterval(typingTimer); },26);
}
function moodText(m){ return state.listening?'Đang lắng nghe':m==='angry'?'Đang cảnh báo':m==='sad'?'Đang nhắc nhẹ':'Đang vui'; }
function renderHome(){
  const s=sums(), prev=previousMonthSums(); const balance=s.income-s.expense-s.saving; const prevBal=prev.income-prev.expense-prev.saving; const delta=balance-prevBal;
  const a=currentAssistant(); const mood=state.listening?'happy':a.mood; state.robot=mood; state._assistantText=a.text;
  const recent=[...state.transactions].sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at)).slice(0,5);
  const moodDecor=mood==='happy'?luminaIcon('leaf'):mood==='sad'?luminaIcon('rain'):luminaIcon('alert');
  return `<div class="assistant-zone"><div class="weather-mood">${moodDecor}</div>${state.listening?'<div class="listen-badge">🎙 Tôi đang nghe bạn...</div>':''}<div class="robot-wrap" id="robotWrap"><div class="holo"></div><img id="robotImg" class="robot-img robot-${mood} ${state.listening?'listening':''}" alt="Lumina assistant"></div>${state.settings.bubbles!==false?`<div class="speech-bubble ${mood==='angry'?'warning':''}"><span id="assistantTyping" class="typing-text"></span><i class="typing-caret"></i></div>`:''}<div class="assistant-state ${mood}">${moodText(mood)}</div></div><div class="balance-card"><div><div class="card-label">Số dư hiện tại ${luminaIcon('eye')}</div><div class="amount-main ${balance<0?'negative':''}">${fmt(balance)}</div></div><div class="trend ${delta<0?'negative':''}"><strong>${delta>=0?'↑':'↓'} ${fmt(Math.abs(delta))}</strong>so với tháng trước</div></div><div class="stat-grid"><div class="mini-card income"><div class="ico">${luminaIcon('income')}</div><small>Thu nhập</small><strong>${fmt(s.income)}</strong></div><div class="mini-card expense"><div class="ico">${luminaIcon('expense')}</div><small>Chi tiêu</small><strong>${fmt(s.expense)}</strong></div><div class="mini-card saving"><div class="ico">${luminaIcon('saving')}</div><small>${balance<0?'Vượt mức':'Tiết kiệm'}</small><strong>${fmt(balance<0?Math.abs(balance):s.saving)}</strong></div></div><div class="transaction-wrap"><div class="section-title"><h3>Giao dịch gần đây</h3><button class="text-action" data-go="transactions">Xem tất cả</button></div><div class="transaction-panel"><div class="tx-list">${recent.length?recent.map(txHtml).join(''):'<div class="empty">Chưa có giao dịch.<br>Nhấn micro hoặc thêm thủ công.</div>'}</div></div></div>`;
}

function learnedCategory(note,kind='expense'){
  const q=stripVN(note); if(!q||q.length<3)return null;
  const qTokens=new Set(q.split(/\s+/).filter(x=>x.length>=3&&!['mua','tien','dong','cho'].includes(x)));
  let best=null,bestScore=0;
  for(const tx of (state.transactions||[])){
    if(tx.kind!==kind||!tx.category||!tx.note)continue;
    const n=stripVN(tx.note); let score=0;
    if(n===q)score=100; else if(n.includes(q)||q.includes(n))score=70; else{
      const tokens=n.split(/\s+/).filter(x=>x.length>=3); const common=tokens.filter(x=>qTokens.has(x)).length; score=common*22;
    }
    if(score>bestScore){bestScore=score;best=tx.category}
  }
  return bestScore>=44?best:null;
}
function smartCategory(note,kind='expense'){
  const t=stripVN(note); const learned=learnedCategory(note,kind); if(learned)return learned;
  if(kind==='saving') return 'Tiết kiệm';
  if(kind==='income'){
    if(/luong|salary|tien cong/.test(t))return 'Lương';
    if(/thuong|bonus|hoa hong/.test(t))return 'Thưởng';
    if(/freelance|lam them|job|du an/.test(t))return 'Thu nhập thêm';
    if(/ban hang|doanh thu|kinh doanh/.test(t))return 'Kinh doanh';
    if(/lai|co tuc|interest/.test(t))return 'Đầu tư';
    if(/hoan tien|refund/.test(t))return 'Hoàn tiền';
    if(/qua|duoc cho|duoc tang/.test(t))return 'Quà tặng';
    return 'Thu nhập khác';
  }
  const rules=[
    ['Xe cộ',/\b(mua xe|xe|oto|o to|xe may|sua xe|bao duong|lop xe|ac quy|nhot xe)\b/],
    ['Ăn uống',/\b(ca phe|coffee|tra sua|an sang|an trua|an toi|com|pho|bun|banh mi|nha hang|quan an|nhau|bia|do an)\b/],
    ['Đi chợ & Thực phẩm',/di cho|sieu thi|bach hoa xanh|winmart|coopmart|thuc pham|rau|thit|ca |trung|sua |gao/],
    ['Di chuyển',/grab|taxi|be |xanh sm|xe buyt|bus|xang|dau xe|gui xe|cau duong|ve tau|ve xe/],
    ['Nhà ở',/tien nha|thue nha|chung cu|noi that|sua nha|son nha|do gia dung/],
    ['Hóa đơn',/tien dien|tien nuoc|internet|wifi|dien thoai|gas|hoa don|cap quang/],
    ['Sức khỏe',/benh vien|kham|thuoc|nha khoa|bac si|xet nghiem|gym|the hinh|vitamin/],
    ['Giáo dục',/hoc phi|khoa hoc|truong hoc|sach|giao trinh|hoc them|chung chi/],
    ['Du lịch',/du lich|khach san|hotel|resort|tour|booking|airbnb|ve may bay/],
    ['Giải trí',/netflix|spotify|youtube premium|game|phim|rap phim|karaoke|concert|ve xem/],
    ['Công nghệ',/iphone|ipad|macbook|laptop|may tinh|camera|may anh|tai nghe|chuot|ban phim|dien thoai/],
    ['Làm đẹp',/spa|salon|cat toc|my pham|skincare|makeup|nail/],
    ['Gia đình & Trẻ em',/bim|sua bot|do choi|em be|con |tre em|gia dinh/],
    ['Thú cưng',/cho |meo|thu cung|pet|thuc an cho|thuc an meo|bac si thu y/],
    ['Bảo hiểm & Thuế',/bao hiem|thue |phi bao hiem|bhxh|bhyt/],
    ['Quà tặng & Từ thiện',/qua tang|sinh nhat|mung cuoi|tu thien|ung ho|donate/],
    ['Công việc',/van phong|in an|khach hang|cong tac|phuc vu cong viec/],
    ['Mua sắm',/shopee|lazada|tiki|mua |quan ao|ao |quan |giay|tui|phu kien/]
  ];
  return (rules.find(([,re])=>re.test(t))||['Khác'])[0];
}
function parseUnder1000(words){
  const n={khong:0,mot:1,hai:2,ba:3,bon:4,tu:4,nam:5,lam:5,sau:6,bay:7,tam:8,chin:9}; let total=0,cur=0;
  for(let i=0;i<words.length;i++){const w=words[i];if(w==='tram'){total+=(cur||1)*100;cur=0}else if(w==='muoi'){total+=(cur||1)*10;cur=0}else if(w in n){cur=n[w]} }
  return total+cur;
}
function parseSpelledAmount(t){
  const numWords='(?:khong|mot|hai|ba|bon|tu|nam|lam|sau|bay|tam|chin|muoi|tram|linh|le)'; let total=0,found=false;
  const re=new RegExp(`((?:${numWords}\\s*)+)\\s*(ty|trieu|nghin|ngan)`,'g'); let m;
  while((m=re.exec(t))){const val=parseUnder1000(m[1].trim().split(/\s+/));const mult=m[2]==='ty'?1e9:m[2]==='trieu'?1e6:1e3;total+=val*mult;found=true}
  return found?total:null;
}
function parseAmount(text){
  const t=stripVN(text).replace(/,/g,'.'); let m;
  m=t.match(/(\d+)\s*tr\s*(\d{1,3})(?!\d)/); if(m){const frac=Number(m[2])/Math.pow(10,m[2].length);return Math.round((Number(m[1])+frac)*1e6)}
  m=t.match(/(\d+(?:\.\d+)?)\s*(ty|ti)\b/); if(m)return Math.round(Number(m[1])*1e9);
  m=t.match(/(\d+(?:\.\d+)?)\s*(trieu|tr)\b/); if(m)return Math.round(Number(m[1])*1e6);
  m=t.match(/(\d+(?:\.\d+)?)\s*(nghin|ngan|k)\b/); if(m)return Math.round(Number(m[1])*1e3);
  m=t.match(/\b\d{1,3}(?:[.\s]\d{3})+\b/); if(m)return Number(m[0].replace(/[.\s]/g,''));
  m=t.match(/\b\d{4,}\b/); if(m)return Number(m[0]);
  return parseSpelledAmount(t);
}
function parseVoice(raw){
  const t=stripVN(raw); const amount=parseAmount(raw); if(!amount||amount<=0)return null;
  let kind='expense';
  if(/tiet kiem|de danh|bo heo|gui tiet kiem/.test(t))kind='saving';
  else if(/(^| )(thu|nhan|luong|thuong|duoc chuyen|duoc tra|ban duoc|doanh thu|hoan tien)( |$)/.test(t))kind='income';
  else if(/mua|chi|tra|thanh toan|an |uong|dong tien|nap tien|dat /.test(t))kind='expense';
  let note=String(raw).replace(/\d+(?:[.,]\d+)?\s*(tỷ|ty|tỉ|ti|triệu|trieu|tr|nghìn|nghin|ngàn|ngan|k)?/ig,' ').replace(/\s+/g,' ').trim();
  note=note.replace(/^\s*(thu|chi|nhận|nhan|trả|tra|thanh toán|thanh toan)\s+/i,'').trim()|| (kind==='income'?'Thu nhập':kind==='saving'?'Tiết kiệm':'Chi tiêu');
  return {kind,amount,category:smartCategory(note,kind),note,occurred_at:nowIso(),raw_voice:raw};
}

function requireWalletThen(action='manual'){
  if((state.wallets||[]).length)return true;
  if(action==='manual')resumeTransactionAfterWallet=true;
  toast('Bạn cần tạo ít nhất 1 Ví & Tài sản trước khi ghi giao dịch.'); navigate('wallets'); setTimeout(()=>openWalletForm(true),120); return false;
}
function walletOptions(selected=''){return (state.wallets||[]).map(w=>`<option value="${w.id}" ${selected===w.id?'selected':''}>${escapeHtml(w.name)} · ${fmt(w.balance)}</option>`).join('')}
function openWalletForm(required=false){
  openSheet(required?'Tạo ví để tiếp tục':'Thêm ví / tài sản',`<form id="walletCreateForm">${required?'<div class="wallet-required">Giao dịch phải gắn với một Ví & Tài sản. Hãy tạo ít nhất một ví trước.</div>':''}<div class="form-grid"><label class="full">Tên ví / tài khoản<input name="name" required placeholder="Ví tiền mặt / Vietcombank"></label><label>Loại<select name="type"><option>Tiền mặt</option><option>Ngân hàng</option><option>Ví điện tử</option><option>Tài sản khác</option></select></label><label>Số dư ban đầu<input name="balance" type="number" value="0"></label></div><div class="sheet-actions"><button type="button" class="secondary" onclick="document.querySelector('#closeSheet').click()">Hủy</button><button class="primary" type="submit">Tạo ví</button></div></form>`,async e=>{e.preventDefault();try{const fd=new FormData(e.target);const w=await dbInsert('wallets',{name:fd.get('name'),type:fd.get('type')||'Ví',balance:+fd.get('balance'),icon:'💳'});closeSheet();toast('Đã tạo Ví & Tài sản');if(pendingVoiceTransaction){const item=pendingVoiceTransaction;pendingVoiceTransaction=null;await recordTransaction(item,w.id);navigate('home')}else if(resumeTransactionAfterWallet){resumeTransactionAfterWallet=false;navigate('transactions');setTimeout(()=>transactionForm(),100)}}catch(err){console.warn(err)}});
}
function transactionForm(prefill={}){
  if(!requireWalletThen('manual'))return;
  const dt=prefill.occurred_at?new Date(prefill.occurred_at):new Date(); const local=new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16); const defaultWallet=prefill.wallet_id||state.wallets[0]?.id||'';
  openSheet('Thêm giao dịch',`<form id="txForm"><div class="form-grid"><div class="full"><div class="segmented" id="kindSeg"><button type="button" data-kind="income" class="${prefill.kind==='income'?'active':''}">Thu nhập</button><button type="button" data-kind="expense" class="${!prefill.kind||prefill.kind==='expense'?'active':''}">Chi tiêu</button><button type="button" data-kind="saving" class="${prefill.kind==='saving'?'active':''}">Tiết kiệm</button></div><input type="hidden" name="kind" value="${prefill.kind||'expense'}"></div><label>Số tiền<input name="amount" type="number" inputmode="numeric" min="1" required value="${prefill.amount||''}"></label><label>Tài khoản<select name="wallet_id" required>${walletOptions(defaultWallet)}</select></label><label class="full">Nội dung<input id="txNoteInput" name="note" required placeholder="Ví dụ: cà phê, tiền điện, mua xe..." value="${escapeAttr(prefill.note||'')}"></label><div class="category-auto"><div><small>Danh mục tự động</small><strong id="autoCategoryPreview">${smartCategory(prefill.note||'',prefill.kind||'expense')}</strong></div>${luminaIcon('sync')}</div><label class="full">Thời gian<input name="occurred_at" type="datetime-local" value="${local}"></label></div><div class="sheet-actions"><button type="button" class="secondary" onclick="document.querySelector('#closeSheet').click()">Hủy</button><button class="primary" type="submit">Ghi nhận</button></div></form>`,async e=>{e.preventDefault();const fd=new FormData(e.target);const kind=fd.get('kind');const note=fd.get('note');const item={kind,amount:+fd.get('amount'),category:smartCategory(note,kind),note,occurred_at:fd.get('occurred_at')?new Date(fd.get('occurred_at')).toISOString():nowIso()};try{await recordTransaction(item,fd.get('wallet_id'));closeSheet();showConfirm(item)}catch(err){console.warn(err)}});
  const refreshCat=()=>{$('#autoCategoryPreview').textContent=smartCategory($('#txNoteInput').value,$('#txForm [name=kind]').value)}; $('#txNoteInput').addEventListener('input',refreshCat);
  $$('#kindSeg button').forEach(b=>b.onclick=()=>{$$('#kindSeg button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#txForm [name=kind]').value=b.dataset.kind;refreshCat()});
}
async function recordTransaction(item,walletId){
  const wallet=(state.wallets||[]).find(w=>w.id===walletId); if(!wallet)throw new Error('Hãy chọn một Ví & Tài sản hợp lệ.');
  item={...item,category:smartCategory(item.note,item.kind),wallet_id:wallet.id,account:wallet.name};
  let saved;
  if(state.demo){saved=await dbInsert('transactions',item);const delta=item.kind==='income'?Number(item.amount):-Number(item.amount);await dbUpdate('wallets',wallet.id,{balance:Number(wallet.balance||0)+delta});}
  else{
    const {data,error}=await sb.rpc('record_transaction',{p_kind:item.kind,p_amount:Number(item.amount),p_category:item.category,p_note:item.note,p_wallet_id:wallet.id,p_occurred_at:item.occurred_at||nowIso()});
    if(error){const m=dbFriendlyError(error);toast(m);throw new Error(m)} saved=Array.isArray(data)?data[0]:data; await refreshAll();
  }
  const line=setAssistantReaction(item); await createNotification(item.kind==='income'?'Có tiền vào':'Giao dịch mới',`${item.note}: ${item.kind==='income'?'+':'-'}${fmt(item.amount)} · ${item.category}. ${line}`,item.kind==='income'?'income':'transaction');
  if(state.page!=='home')navigate('home'); else render();
  return saved||item;
}
async function deleteTransaction(id){
  const tx=(state.transactions||[]).find(x=>x.id===id); if(!tx)return;
  if(state.demo){await dbDelete('transactions',id);if(tx.wallet_id){const w=state.wallets.find(x=>x.id===tx.wallet_id);if(w){const delta=tx.kind==='income'?-Number(tx.amount):Number(tx.amount);await dbUpdate('wallets',w.id,{balance:Number(w.balance||0)+delta})}}return}
  const {error}=await sb.rpc('delete_transaction',{p_transaction_id:id}); if(error){const m=dbFriendlyError(error);toast(m);throw new Error(m)} await refreshAll();
}
function chooseWalletForVoice(item){
  if(!requireWalletThen('voice')){pendingVoiceTransaction=item;return}
  if(state.wallets.length===1)return recordTransaction(item,state.wallets[0].id).then(()=>showConfirm(item));
  openSheet('Chọn tài khoản',`<div class="wallet-choice-list">${state.wallets.map(w=>`<button class="wallet-choice" data-wallet-choice="${w.id}"><span class="entity-icon">${luminaIcon('wallet')}</span><span><strong>${escapeHtml(w.name)}</strong><small>${escapeHtml(w.type||'Ví')}</small></span><em>${fmt(w.balance)}</em></button>`).join('')}</div>`); $$('#sheetBody [data-wallet-choice]').forEach(b=>b.onclick=async()=>{const id=b.dataset.walletChoice;closeSheet();try{await recordTransaction(item,id);showConfirm(item)}catch(e){console.warn(e)}});
}
async function addVoiceTransaction(item){ stopListening('final'); return chooseWalletForVoice(item); }

function shutdownRecognitionHardware(){
  clearTimeout(silenceTimer);clearInterval(micClock);silenceTimer=micClock=null;
  const r=recognition; recognition=null;
  if(r){try{r.onstart=r.onspeechstart=r.onresult=r.onerror=r.onend=null;r.abort()}catch(e){try{r.stop()}catch{}}}
  if(window.__luminaMicStream){try{window.__luminaMicStream.getTracks().forEach(t=>t.stop())}catch{} window.__luminaMicStream=null}
}
function stopListening(reason='manual'){
  shutdownRecognitionHardware();state.listening=false;voiceFinalized=false;$('#micOverlay')?.classList.add('hidden');if(state.user&&state.page==='home')render();
}
function startListening(){
  if(!requireWalletThen('voice'))return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR)return toast('Trình duyệt này chưa hỗ trợ nhận giọng nói. Hãy nhập giao dịch thủ công.'); if(state.listening)return;
  voiceFinalized=false; const r=new SR(); recognition=r;r.lang='vi-VN';r.continuous=false;r.interimResults=true;state.listening=true;micStart=Date.now();$('#micOverlay').classList.remove('hidden');render();updateMicClock();micClock=setInterval(updateMicClock,250);
  const arm=()=>{clearTimeout(silenceTimer);silenceTimer=setTimeout(()=>{if(!voiceFinalized)stopListening('silence')},3000)};
  r.onstart=arm;r.onspeechstart=arm;r.onresult=e=>{arm();let text='';let final=false;for(let i=e.resultIndex;i<e.results.length;i++){text+=e.results[i][0].transcript;final=final||e.results[i].isFinal}$('#micTranscript').textContent=text;if(final&&!voiceFinalized){voiceFinalized=true;shutdownRecognitionHardware();state.listening=false;$('#micOverlay').classList.add('hidden');const parsed=parseVoice(text);if(parsed)addVoiceTransaction(parsed);else{toast('Tôi chưa đọc được số tiền. Thử: “mua cà phê 40k” hoặc “mua xe 10 triệu”.');if(state.page==='home')render()}}};
  r.onerror=e=>{const denied=e.error==='not-allowed'||e.error==='service-not-allowed';stopListening('error');toast(denied?'Bạn chưa cho phép micro. Hãy bật quyền Microphone cho Safari.':'Không nhận được giọng nói. Thử lại nhé.')};r.onend=()=>{if(!voiceFinalized&&state.listening)stopListening('end')};try{r.start()}catch{stopListening('error')}
}

async function refreshAll(){
  if(state.demo){state.notifications=state.notifications||[];updateNotifDot();return}
  const tables=['transactions','goals','wallets','loans','subscriptions','bank_accounts','notifications'];
  const req=tables.map(t=>sb.from(t).select('*').eq('user_id',uid()).order(t==='transactions'?'occurred_at':'created_at',{ascending:false}).then(r=>({t,...r}))); const results=await Promise.all(req); results.forEach(r=>{if(!r.error)state[r.t]=r.data||[]}); const p=await sb.from('profiles').select('*').eq('id',uid()).maybeSingle();if(!p.error)state.profile=p.data;updateNotifDot();if(!$('#appShell').classList.contains('hidden'))render();
}
function subscribeRealtime(){
  if(!configured||state.demo||!state.user)return;if(state.realtime)sb.removeChannel(state.realtime);let ch=sb.channel(`lumina-${uid()}`);['transactions','goals','wallets','loans','subscriptions','bank_accounts','notifications'].forEach(table=>{ch=ch.on('postgres_changes',{event:'*',schema:'public',table,filter:`user_id=eq.${uid()}`},()=>refreshAll())});state.realtime=ch.subscribe();
}
async function createNotification(title,body,type='info'){
  const n={id:crypto.randomUUID(),user_id:uid(),title,body,type,created_at:nowIso(),read_at:null};
  if(state.demo){state.notifications=state.notifications||[];state.notifications.unshift(n);updateNotifDot();return}
  try{await sb.from('notifications').insert({user_id:uid(),title,body,type});await refreshAll()}catch(e){console.warn('notification',e)}
}
function unreadNotifications(){return (state.notifications||[]).filter(n=>!n.read_at)}
function updateNotifDot(){const dot=$('#notifDot');if(dot)dot.classList.toggle('hidden',!(pendingUpdateVersion||unreadNotifications().length))}
function setPendingUpdate(version){pendingUpdateVersion=version;updateNotifDot()}
function openNotificationsCenter(){
  const list=state.notifications||[]; const updateRow=pendingUpdateVersion?`<div class="notification-item unread"><span>${luminaIcon('sync')}</span><div><h4>Phiên bản v${pendingUpdateVersion} đã sẵn sàng</h4><p>Chỉ cập nhật khi bạn đồng ý.</p><button id="openUpdateFromNotif" class="mini-action">Xem cập nhật</button></div></div>`:'';
  const rows=list.slice(0,30).map(n=>`<div class="notification-item ${n.read_at?'':'unread'}"><span>${luminaIcon(n.type==='income'?'income':'bell')}</span><div><h4>${escapeHtml(n.title)}</h4><p>${escapeHtml(n.body)}</p><time>${new Date(n.created_at).toLocaleString('vi-VN')}</time></div></div>`).join('');
  openSheet('Thông báo',`${updateRow}<div class="notification-list">${rows||'<div class="empty">Chưa có thông báo.</div>'}</div>${unreadNotifications().length?'<div class="notification-actions"><button id="markAllRead" class="secondary">Đánh dấu đã đọc</button></div>':''}`);
  $('#openUpdateFromNotif')?.addEventListener('click',()=>{closeSheet();showUpdatePrompt(pendingUpdateVersion)});$('#markAllRead')?.addEventListener('click',markAllNotificationsRead);
}
async function markAllNotificationsRead(){
  const now=nowIso();if(state.demo){(state.notifications||[]).forEach(n=>n.read_at=now);updateNotifDot();closeSheet();return}
  const {error}=await sb.from('notifications').update({read_at:now}).eq('user_id',uid()).is('read_at',null);if(error)return toast(dbFriendlyError(error));await refreshAll();closeSheet();toast('Đã đọc tất cả thông báo');
}

function openAddSheet(kind){
  if(kind==='transaction')return transactionForm(); if(kind==='wallet')return openWalletForm(false);
  if(kind==='goal')return genericForm('Thêm mục tiêu',`<label class="full">Tên mục tiêu<input name="title" required placeholder="Du lịch Đà Lạt"></label><label>Số tiền mục tiêu<input name="target" type="number" required min="1"></label><label>Đã có<input name="saved" type="number" value="0" min="0"></label><label class="full">Ngày dự kiến<input name="due_date" type="date"></label>`,async fd=>dbInsert('goals',{title:fd.get('title'),target:+fd.get('target'),saved:+fd.get('saved'),due_date:fd.get('due_date')||null,icon:'🎯'}));
  if(kind==='loan')return genericForm('Thêm khoản vay',`<label class="full">Tên khoản vay<input name="name" required></label><label>Giá trị vay<input name="principal" type="number" required></label><label>Còn lại<input name="remaining" type="number" required></label><label class="full">Hạn thanh toán<input name="due_date" type="date"></label>`,async fd=>dbInsert('loans',{name:fd.get('name'),principal:+fd.get('principal'),remaining:+fd.get('remaining'),due_date:fd.get('due_date')||null}));
  if(kind==='subscription')return genericForm('Thêm subscription',`<label class="full">Dịch vụ<input name="name" required placeholder="iCloud+"></label><label>Số tiền<input name="amount" type="number" required></label><label>Chu kỳ<select name="billing_cycle"><option value="monthly">Hàng tháng</option><option value="yearly">Hàng năm</option></select></label><label class="full">Kỳ thu tiếp theo<input name="next_charge" type="date"></label>`,async fd=>dbInsert('subscriptions',{name:fd.get('name'),amount:+fd.get('amount'),billing_cycle:fd.get('billing_cycle'),next_charge:fd.get('next_charge')||null}));
  if(kind==='bank')return genericForm('Thêm ngân hàng',`<label class="full">Ngân hàng<input name="bank_name" required placeholder="Vietcombank"></label><label class="full">Tên tài khoản<input name="account_label" placeholder="Tài khoản chính"></label><label class="full">4 số cuối<input name="last4" maxlength="4" inputmode="numeric"></label>`,async fd=>dbInsert('bank_accounts',{bank_name:fd.get('bank_name'),account_label:fd.get('account_label'),last4:fd.get('last4'),enabled:true}));
}
function bindPage(){
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));$$('[data-add]').forEach(b=>b.onclick=()=>openAddSheet(b.dataset.add));$$('[data-del]').forEach(b=>b.onclick=async()=>{const [table,id]=b.dataset.del.split(':');if(confirm('Xóa mục này?')){try{table==='transactions'?await deleteTransaction(id):await dbDelete(table,id)}catch(e){console.warn(e)}}});$$('[data-goal-add]').forEach(b=>b.onclick=()=>openGoalDeposit(b.dataset.goalAdd));$$('[data-toggle]').forEach(b=>b.onclick=()=>{const k=b.dataset.toggle;state.settings[k]=!state.settings[k];render()});$$('[data-check-update]').forEach(b=>b.onclick=async()=>{const v=await checkForNewVersion({silent:false});if(!v)toast(`LUMINA v${APP_VERSION} đang là phiên bản mới nhất.`)});const rw=$('#robotWrap');if(rw)rw.onclick=()=>{if(!state.listening)startListening()};if(state.page==='home'&&state._assistantText)setTimeout(()=>typeAssistantText(state._assistantText),20);updateNotifDot();
}
function dbFriendlyError(error){
  const raw=String(error?.message||error||'').trim(),msg=raw.toLowerCase();if(msg.includes('permission denied')||msg.includes('row-level security'))return 'Thiếu quyền dữ liệu. Hãy chạy lại supabase.sql v1.5.9 rồi đăng xuất/đăng nhập lại.';if(msg.includes('wallet_required')||msg.includes('vi_tai_san'))return 'Hãy tạo và chọn một Ví & Tài sản trước.';if(msg.includes('jwt')||msg.includes('auth'))return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';return raw||'Có lỗi dữ liệu xảy ra.';
}

setTimeout(()=>{const n=$('#notifyBtn');if(n)n.onclick=openNotificationsCenter;updateNotifDot()},0);
