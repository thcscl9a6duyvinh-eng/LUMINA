const SUPABASE_URL = 'https://htwctvptazeloivccuth.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CAjoORAdCLQf8ZUq8AVskQ_TPrpGyTm';

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
  $('#configHint').textContent = configured
    ? 'Supabase đã được cấu hình trong app.js. Đăng nhập hoặc đăng ký để bắt đầu.'
    : 'Chưa điền SUPABASE_URL / SUPABASE_ANON_KEY trong app.js. Bạn vẫn có thể mở bản demo để kiểm tra toàn bộ giao diện.';

  bindStatic();
  if (!configured) return;
  const { data:{session} } = await sb.auth.getSession();
  if (session){ await enterApp(session.user); }
  sb.auth.onAuthStateChange(async (event, session)=>{
    if (event === 'SIGNED_IN' && session?.user) await enterApp(session.user);
    if (event === 'SIGNED_OUT') showAuth();
  });
}

function bindStatic(){
  $('#authForm').addEventListener('submit', async e=>{
    e.preventDefault();
    if (!configured) return toast('Hãy điền Supabase URL và Anon Key trước.');
    const email=$('#emailInput').value.trim(), password=$('#passwordInput').value;
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error) toast(error.message); else toast('Đăng nhập thành công');
  });
  $('#signupBtn').addEventListener('click', async ()=>{
    if (!configured) return toast('Hãy điền Supabase URL và Anon Key trước.');
    const email=$('#emailInput').value.trim(), password=$('#passwordInput').value;
    if(!email || password.length<6) return toast('Nhập email và mật khẩu tối thiểu 6 ký tự.');
    const full_name=email.split('@')[0];
    const {error}=await sb.auth.signUp({email,password,options:{data:{full_name}}});
    if(error) toast(error.message); else toast('Đã đăng ký. Kiểm tra email nếu Supabase yêu cầu xác nhận.');
  });
  $('#demoBtn').addEventListener('click', ()=>{
    state.demo=true; state.user={id:'demo-user',email:'demo@lumina.app',user_metadata:{full_name:'Duy Vĩnh'}};
    state.profile={display_name:'Duy Vĩnh',monthly_budget:0}; demoLoad(); showApp();
  });
  $('#menuBtn').onclick=openDrawer; $('#closeDrawer').onclick=closeDrawer; $('#backdrop').onclick=()=>{closeDrawer();closeSheet()};
  $('#logoutBtn').onclick=async()=>{ if(state.demo){state.demo=false;showAuth()} else await sb.auth.signOut(); };
  $('#micBtn').onclick=startListening; $('#stopMicBtn').onclick=stopListening; $('#closeSheet').onclick=closeSheet;
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
  $$('.drawer-nav button').forEach(b=>b.addEventListener('click',()=>{navigate(b.dataset.page);closeDrawer()}));
  $('#notifyBtn').onclick=()=>toast('Không có thông báo mới.');
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden && !state.demo && state.user) refreshAll(); });
}

async function enterApp(user){
  state.demo=false; state.user=user;
  await refreshAll(); subscribeRealtime(); showApp();
}
function showAuth(){
  state.user=null; state.page='home';
  $('#appShell').classList.add('hidden'); $('#authScreen').classList.remove('hidden'); closeDrawer(); closeSheet();
}
function showApp(){
  $('#authScreen').classList.add('hidden'); $('#appShell').classList.remove('hidden');
  const name = state.profile?.display_name || state.user?.user_metadata?.full_name || state.user?.email?.split('@')[0] || 'Duy Vĩnh';
  const initials=name.split(/\s+/).map(x=>x[0]).slice(-2).join('').toUpperCase();
  $('#userAvatar').textContent=initials; $('#drawerAvatar').textContent=initials; $('#drawerName').textContent=name; $('#drawerEmail').textContent=state.user?.email||'demo@lumina.app';
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
    <div class="panel"><div class="setting-row"><div><strong>Đồng bộ nhiều thiết bị</strong><small>Mọi dữ liệu thật lấy từ Supabase theo user_id.</small></div><span>✓</span></div><div class="setting-row"><div><strong>Phiên bản</strong><small>LUMINA Money</small></div><span>v1.5.4</span></div></div>
    <div class="notice">Safari và web đã thêm vào Màn hình chính có thể không chia sẻ cùng localStorage/session trên iOS. Bản này không dùng localStorage làm nguồn dữ liệu thật: cả hai tải dữ liệu từ Supabase. Bạn chỉ cần đăng nhập cùng tài khoản ở từng nơi một lần.</div>`;
}

function bindPage(){
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  $$('[data-add]').forEach(b=>b.onclick=()=>openAddSheet(b.dataset.add));
  $$('[data-del]').forEach(b=>b.onclick=async()=>{const [table,id]=b.dataset.del.split(':');if(confirm('Xóa mục này?')) await dbDelete(table,id)});
  $$('[data-goal-add]').forEach(b=>b.onclick=()=>openGoalDeposit(b.dataset.goalAdd));
  $$('[data-toggle]').forEach(b=>b.onclick=()=>{const k=b.dataset.toggle;state.settings[k]=!state.settings[k];render()});
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

init();
