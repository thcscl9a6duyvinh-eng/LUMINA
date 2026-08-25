const APP_VERSION = '1.5.15';
const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;
const UPDATE_PROGRESS_DURATION_MS = 15000;

// Supabase project của chủ app. Chỉ dùng Project URL + anon/publishable key.
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
  if (Math.abs(n)>=1e9) return (n/1e9).toFixed(1).replace('.0','')+'tỷ';
  if (Math.abs(n)>=1e6) return (n/1e6).toFixed(1).replace('.0','')+'tr';
  if (Math.abs(n)>=1e3) return (n/1e3).toFixed(0)+'k';
  return String(Math.round(n));
};
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const nowIso = () => new Date().toISOString();
const uid = () => state.user?.id || 'demo-user';

const state = {
  user:null, demo:false, page:'home', robot:'happy', listening:false, realtime:null,
  profile:null, transactions:[], goals:[], wallets:[], loans:[], subscriptions:[], bank_accounts:[], notifications:[],
  settings:{sound:true,bubbles:true,budget:0},
  assistantReaction:null, _assistantText:'',
};

let pendingUpdateVersion=null, updateCheckTimer=null, updateFlowBusy=false;
let blinkInterval=null, typingTimer=null, reactionTimer=null;
let recognition=null, silenceTimer=null, micClock=null, micStart=0, lastTranscript='', voiceFinishing=false;
let resumeTransactionAfterWallet=false;
let lastAiLine='';

let sessionRecoveryPromise=null;
let lastBackgroundAt=0;

function isStandaloneApp(){
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
}
function sessionExpiresSoon(session,leewaySeconds=120){
  const exp=Number(session?.expires_at||0);
  return !exp || exp-(Date.now()/1000) < leewaySeconds;
}
function isAuthTransportError(error){
  const status=Number(error?.status||error?.code||0);
  const msg=String(error?.message||error||'').toLowerCase();
  return status===401 || status===403 || msg.includes('jwt expired') || msg.includes('invalid jwt') || msg.includes('invalid claim') || msg.includes('auth session missing') || msg.includes('refresh_token') || msg.includes('token is expired');
}
async function ensureLiveSession({forceRefresh=false,interactive=true}={}){
  if(state.demo) return null;
  if(!configured||!sb) throw new Error('Chưa cấu hình Supabase.');
  let session=null;
  try{
    const current=await sb.auth.getSession();
    if(current.error) throw current.error;
    session=current.data?.session||null;
    if(session && (forceRefresh||sessionExpiresSoon(session))){
      const refreshed=await sb.auth.refreshSession();
      if(!refreshed.error && refreshed.data?.session) session=refreshed.data.session;
      else if(forceRefresh && refreshed.error) throw refreshed.error;
    }
  }catch(err){
    if(interactive){
      showAuth();
      showAuthStatus('Phiên đăng nhập cần được làm mới. Hãy đăng nhập lại.','error');
    }
    throw err;
  }
  if(!session?.user){
    if(interactive){
      showAuth();
      showAuthStatus(isStandaloneApp()?'Bản app ngoài Màn hình chính cần đăng nhập riêng một lần trên iPhone này.':'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.','error');
    }
    throw new Error('AUTH_SESSION_MISSING');
  }
  state.user=session.user;
  return session;
}
async function runAuthed(operation,{retry=true}={}){
  await ensureLiveSession({interactive:true});
  let result=await operation();
  if(retry && result?.error && isAuthTransportError(result.error)){
    await ensureLiveSession({forceRefresh:true,interactive:true});
    result=await operation();
  }
  return result;
}
async function recoverSessionOnResume({forceRefresh=false}={}){
  if(state.demo||!configured) return;
  if(sessionRecoveryPromise) return sessionRecoveryPromise;
  sessionRecoveryPromise=(async()=>{
    try{
      const session=await ensureLiveSession({forceRefresh,interactive:false});
      if(!session) return;
      state.user=session.user;
      await refreshAll({skipSessionCheck:true});
      subscribeRealtime();
      if($('#authScreen')&&!$('#authScreen').classList.contains('hidden')) showApp();
    }catch(err){
      console.warn('LUMINA session recovery:',err);
      showAuth();
      showAuthStatus(isStandaloneApp()?'Phiên đăng nhập trong app Màn hình chính không còn hợp lệ. Hãy đăng nhập lại.':'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.','error');
    }finally{sessionRecoveryPromise=null}
  })();
  return sessionRecoveryPromise;
}

function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escapeAttr(v=''){return escapeHtml(v)}
function stripVN(v=''){
  return String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d')
    .replace(/[^a-z0-9.,\s+-]/g,' ').replace(/\s+/g,' ').trim();
}

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
    settings:`<circle cx="12" cy="12" r="3.5"></circle><path d="M19 12a7 7 0 0 0-.12-1.3l2-1.55-2-3.46-2.45 1A7 7 0 0 0 14.2 5.4L13.85 3h-4l-.35 2.4a7 7 0 0 0-2.23 1.29l-2.45-1-2 3.46 2 1.55A7 7 0 0 0 4.7 12c0 .44.04.88.12 1.3l-2 1.55 2 3.46 2.45-1A7 7 0 0 0 9.5 18.6l.35 2.4h4l.35-2.4a7 7 0 0 0 2.23-1.29l2.45 1 2-3.46-2-1.55c.08-.42.12-.86.12-1.3Z"></path>`,
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

const AI_LINES={
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
function pickAiLine(bank){
  const arr=AI_LINES[bank]||AI_LINES.light; let line=arr[Math.floor(Math.random()*arr.length)];
  if(arr.length>1&&line===lastAiLine) line=arr[(arr.indexOf(line)+1)%arr.length];
  lastAiLine=line; return line;
}

function demoSeed(){
  const d=new Date();
  const isoAt=(m,day,h=8)=>new Date(d.getFullYear(),d.getMonth()+m,day,h,0,0).toISOString();
  return {
    transactions:[
      {id:'d1',user_id:'demo-user',kind:'income',amount:12000000,category:'Lương',note:'Lương công ty',account:'Vietcombank',wallet_id:'w1',occurred_at:isoAt(0,3,8)},
      {id:'d2',user_id:'demo-user',kind:'expense',amount:45000,category:'Ăn uống',note:'Cà phê',account:'Tiền mặt',wallet_id:'w2',occurred_at:isoAt(0,3,7)},
      {id:'d3',user_id:'demo-user',kind:'saving',amount:1000000,category:'Tiết kiệm',note:'Quỹ dự phòng',account:'Vietcombank',wallet_id:'w1',occurred_at:isoAt(0,2,9)},
      ...[-1,-2,-3,-4,-5].flatMap((m,i)=>[
        {id:`mi${i}`,user_id:'demo-user',kind:'income',amount:16000000+i*650000,category:'Lương',note:'Thu nhập tháng',account:'Vietcombank',wallet_id:'w1',occurred_at:isoAt(m,5,8)},
        {id:`me${i}`,user_id:'demo-user',kind:'expense',amount:5200000+i*350000,category:i%2?'Ăn uống':'Mua sắm',note:'Chi tiêu tháng',account:'Vietcombank',wallet_id:'w1',occurred_at:isoAt(m,14,18)},
        {id:`ms${i}`,user_id:'demo-user',kind:'saving',amount:3000000+i*200000,category:'Tiết kiệm',note:'Tiết kiệm tháng',account:'Vietcombank',wallet_id:'w1',occurred_at:isoAt(m,20,9)}
      ])
    ],
    goals:[{id:'g1',user_id:'demo-user',title:'Du lịch Đà Lạt',target:10000000,saved:3000000,due_date:`${d.getFullYear()}-12-30`,icon:'🎯'}],
    wallets:[{id:'w1',user_id:'demo-user',name:'Vietcombank',type:'Ngân hàng',balance:12580000,icon:'💳',created_at:nowIso()},{id:'w2',user_id:'demo-user',name:'Tiền mặt',type:'Tiền mặt',balance:1650000,icon:'💳',created_at:nowIso()}],
    loans:[], subscriptions:[], bank_accounts:[], notifications:[]
  };
}
function demoLoad(){
  try{const saved=localStorage.getItem('lumina-demo-v1510');Object.assign(state,saved?JSON.parse(saved):demoSeed())}catch{Object.assign(state,demoSeed())}
}
function demoSave(){
  localStorage.setItem('lumina-demo-v1510',JSON.stringify({transactions:state.transactions,goals:state.goals,wallets:state.wallets,loans:state.loans,subscriptions:state.subscriptions,bank_accounts:state.bank_accounts,notifications:state.notifications}));
}

function authMessage(error){
  const raw=String(error?.message||error||'').trim(),msg=raw.toLowerCase();
  if(msg.includes('invalid login credentials'))return 'Email hoặc mật khẩu không đúng.';
  if(msg.includes('email not confirmed'))return 'Email chưa được xác nhận. Hãy mở email xác nhận rồi đăng nhập lại.';
  if(msg.includes('user already registered'))return 'Email này đã được đăng ký. Hãy đăng nhập.';
  if(msg.includes('password should be at least'))return 'Mật khẩu phải có ít nhất 6 ký tự.';
  if(msg.includes('invalid email'))return 'Địa chỉ email không hợp lệ.';
  if(msg.includes('signup is disabled'))return 'Chức năng đăng ký đang bị tắt trong Supabase Auth.';
  if(msg.includes('rate limit'))return 'Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.';
  return raw||'Có lỗi xảy ra. Vui lòng thử lại.';
}
function dbFriendlyError(error){
  const raw=String(error?.message||error||'').trim(),msg=raw.toLowerCase();
  if(msg.includes('permission denied')||msg.includes('row-level security'))return 'Thiếu quyền dữ liệu. Hãy kiểm tra quyền dữ liệu Supabase rồi đăng xuất/đăng nhập lại.';
  if(msg.includes('wallet_required')||msg.includes('wallet_not_owned'))return 'Ví đã chọn không hợp lệ. Hãy chọn Ví & Tài sản của chính bạn.';
  if(msg.includes('auth_required')||msg.includes('jwt')||msg.includes('auth_session_missing')||msg.includes('refresh_token'))return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';
  if(msg.includes('schema cache'))return 'Ứng dụng và cấu trúc dữ liệu đang không khớp. Hãy cập nhật LUMINA lên bản mới nhất rồi thử lại.';
  return raw||'Có lỗi dữ liệu xảy ra.';
}
function showAuthStatus(message,type='info'){const el=$('#authStatus');if(!el)return;el.textContent=message||'';el.className=`auth-status ${type}`;if(!message)el.classList.add('hidden')}
function setAuthBusy(busy){const a=$('#loginBtn'),b=$('#signupBtn');if(a){a.disabled=busy;a.textContent=busy?'Đang xử lý...':'Đăng nhập'}if(b)b.disabled=busy}
async function loginWithEmail(){
  if(!configured)return toast('Hãy cấu hình Supabase trước.');
  const email=$('#authEmail').value.trim(),password=$('#authPassword').value;
  if(!email)return showAuthStatus('Nhập email để đăng nhập.','error'); if(!password)return showAuthStatus('Nhập mật khẩu để đăng nhập.','error');
  setAuthBusy(true);showAuthStatus('Đang đăng nhập...');
  const {error}=await sb.auth.signInWithPassword({email,password});setAuthBusy(false);if(error)return showAuthStatus(authMessage(error),'error');showAuthStatus('Đăng nhập thành công.','success');
}
async function signupWithEmail(){
  if(!configured)return toast('Hãy cấu hình Supabase trước.');
  const email=$('#authEmail').value.trim(),password=$('#authPassword').value;
  if(!email)return showAuthStatus('Nhập email để đăng ký.','error');if(password.length<6)return showAuthStatus('Mật khẩu phải có ít nhất 6 ký tự.','error');
  setAuthBusy(true);showAuthStatus('Đang tạo tài khoản...');
  const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:`${location.origin}${location.pathname}`,data:{full_name:email.split('@')[0]||'Người dùng'}}});
  setAuthBusy(false);if(error)return showAuthStatus(authMessage(error),'error');
  if(data?.session)showAuthStatus('Đăng ký thành công. Đang vào LUMINA...','success');else{$('#authPassword').value='';showAuthStatus('Đăng ký thành công. Hãy kiểm tra email để xác nhận tài khoản.','success')}
}

async function init(){
  bindStatic();
  const hint=$('#configHint'); if(configured){hint.textContent='';hint.classList.add('hidden')}else{hint.textContent='Chưa cấu hình kết nối dữ liệu.';hint.classList.remove('hidden');return}
  try{
    const session=await ensureLiveSession({interactive:false});
    if(session?.user) await enterApp(session.user);
  }catch{ showAuth(); }
  sb.auth.onAuthStateChange(async(event,session)=>{
    if((event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED')&&session?.user){
      state.user=session.user;
      if(event==='SIGNED_IN') await enterApp(session.user);
    }
    if(event==='SIGNED_OUT') showAuth();
  });
}
function bindStatic(){
  $('#emailAuthForm').addEventListener('submit',async e=>{e.preventDefault();await loginWithEmail()});
  $('#signupBtn').addEventListener('click',signupWithEmail);
  $('#demoBtn').addEventListener('click',()=>{state.demo=true;state.user={id:'demo-user',email:'demo@lumina.app',user_metadata:{full_name:'Duy Vĩnh'}};state.profile={display_name:'Duy Vĩnh'};demoLoad();showApp()});
  $('#menuBtn').onclick=openDrawer;$('#closeDrawer').onclick=closeDrawer;$('#backdrop').onclick=()=>{closeDrawer();closeSheet()};
  $('#logoutBtn').onclick=async()=>{stopListening(false);if(state.demo){state.demo=false;showAuth()}else await sb.auth.signOut()};
  $('#micBtn').onclick=startListening;$('#stopMicBtn').onclick=()=>finishVoice(lastTranscript,{manual:true});$('#closeSheet').onclick=closeSheet;
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
  $$('.drawer-nav button').forEach(b=>b.addEventListener('click',()=>{navigate(b.dataset.page);closeDrawer()}));
  $('#notifyBtn').onclick=openNotificationsCenter;
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){lastBackgroundAt=Date.now();stopListening(false)}
    else{recoverSessionOnResume({forceRefresh:Date.now()-lastBackgroundAt>60000});checkForNewVersion({silent:true})}
  });
  window.addEventListener('pageshow',()=>recoverSessionOnResume({forceRefresh:true}));
  window.addEventListener('focus',()=>{if(!document.hidden)recoverSessionOnResume({forceRefresh:false})});
  window.addEventListener('online',()=>recoverSessionOnResume({forceRefresh:true}));
  window.addEventListener('pagehide',()=>stopListening(false));
}
async function enterApp(user){state.demo=false;state.user=user;await refreshAll();subscribeRealtime();showApp()}
function setAvatar(el,initials,url){if(!el)return;el.textContent=initials;el.style.backgroundImage=url?`url("${String(url).replace(/"/g,'%22')}")`:'';el.style.backgroundSize=url?'cover':'';el.style.backgroundPosition=url?'center':'';el.style.color=url?'transparent':''}
function showAuth(){stopListening(false);state.user=null;state.page='home';$('#appShell').classList.add('hidden');$('#authScreen').classList.remove('hidden');closeDrawer();closeSheet()}
function showApp(){
  $('#authScreen').classList.add('hidden');$('#appShell').classList.remove('hidden');
  const name=state.profile?.display_name||state.user?.user_metadata?.full_name||state.user?.email?.split('@')[0]||'Người dùng';const initials=name.split(/\s+/).map(x=>x[0]).slice(-2).join('').toUpperCase();
  setAvatar($('#userAvatar'),initials,state.user?.user_metadata?.avatar_url);setAvatar($('#drawerAvatar'),initials,state.user?.user_metadata?.avatar_url);$('#drawerName').textContent=name;$('#drawerEmail').textContent=state.user?.email||'';
  navigate('home');startBlinkLoop();updateNotifDot();
}

async function refreshAll({skipSessionCheck=false,retry=true}={}){
  if(state.demo){updateNotifDot();if(!$('#appShell').classList.contains('hidden'))render();return}
  try{if(!skipSessionCheck)await ensureLiveSession({interactive:false})}catch{showAuth();return}
  const tables=['transactions','goals','wallets','loans','subscriptions','bank_accounts','notifications'];
  const results=await Promise.all(tables.map(async t=>{
    let q=sb.from(t).select('*').eq('user_id',uid());q=q.order(t==='transactions'?'occurred_at':'created_at',{ascending:false});const r=await q;return {t,...r};
  }));
  const authFailure=results.find(r=>r.error&&isAuthTransportError(r.error));
  if(authFailure&&retry){
    try{await ensureLiveSession({forceRefresh:true,interactive:false});return refreshAll({skipSessionCheck:true,retry:false})}
    catch{showAuth();return}
  }
  for(const r of results){if(r.error){console.warn(`load ${r.t}`,r.error);continue}state[r.t]=r.data||[]}
  let p=await sb.from('profiles').select('*').eq('id',uid()).maybeSingle();
  if(p.error&&isAuthTransportError(p.error)&&retry){
    try{await ensureLiveSession({forceRefresh:true,interactive:false});p=await sb.from('profiles').select('*').eq('id',uid()).maybeSingle()}catch{}
  }
  if(!p.error)state.profile=p.data;
  updateNotifDot();if(!$('#appShell').classList.contains('hidden'))render();
}
function subscribeRealtime(){
  if(!configured||state.demo||!state.user)return;if(state.realtime)sb.removeChannel(state.realtime);
  let ch=sb.channel(`lumina-${uid()}`);for(const table of ['transactions','goals','wallets','loans','subscriptions','bank_accounts','notifications'])ch=ch.on('postgres_changes',{event:'*',schema:'public',table,filter:`user_id=eq.${uid()}`},()=>refreshAll());state.realtime=ch.subscribe();
}
async function dbInsert(table,row,{refresh=true}={}){
  const item={...row,id:row.id||crypto.randomUUID(),user_id:uid(),created_at:row.created_at||nowIso()};
  if(state.demo){state[table]=state[table]||[];state[table].unshift(item);demoSave();if(refresh)render();return item}
  const result=await runAuthed(()=>sb.from(table).insert({...row,user_id:uid()}).select().single());
  if(result.error)throw new Error(dbFriendlyError(result.error));if(refresh)await refreshAll();return result.data;
}
async function dbUpdate(table,id,patch,{refresh=true}={}){
  if(state.demo){const i=(state[table]||[]).findIndex(x=>x.id===id);if(i>=0)state[table][i]={...state[table][i],...patch};demoSave();if(refresh)render();return state[table]?.[i]}
  const result=await runAuthed(()=>sb.from(table).update(patch).eq('id',id).eq('user_id',uid()).select().maybeSingle());
  if(result.error)throw new Error(dbFriendlyError(result.error));if(refresh)await refreshAll();return result.data;
}
async function dbDelete(table,id,{refresh=true}={}){
  if(state.demo){state[table]=(state[table]||[]).filter(x=>x.id!==id);demoSave();if(refresh)render();return true}
  const result=await runAuthed(()=>sb.from(table).delete().eq('id',id).eq('user_id',uid()));
  if(result.error)throw new Error(dbFriendlyError(result.error));if(refresh)await refreshAll();return true;
}

function navigate(page){state.page=page;$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));render()}
function render(){
  const screen=$('#screen');screen.className='screen '+(state.page==='home'?'home-screen':'scroll-screen');
  const map={home:renderHome,stats:renderStats,goals:renderGoals,wallets:renderWallets,transactions:renderTransactions,loans:renderLoans,subscriptions:renderSubscriptions,banks:renderBanks,settings:renderSettings};screen.innerHTML=(map[state.page]||renderHome)();bindPage();
}
function currentMonthTransactions(){const k=monthKey(new Date());return (state.transactions||[]).filter(t=>monthKey(new Date(t.occurred_at||t.created_at))===k)}
function sums(list=currentMonthTransactions()){return list.reduce((a,t)=>{a[t.kind]=(a[t.kind]||0)+Number(t.amount||0);return a},{income:0,expense:0,saving:0})}
function previousMonthSums(){const d=new Date();d.setMonth(d.getMonth()-1);const k=monthKey(d);return sums((state.transactions||[]).filter(t=>monthKey(new Date(t.occurred_at||t.created_at))===k))}
function robotMood(){const s=sums();if(s.expense>s.income&&s.expense>0)return 'angry';if(s.income>0&&s.expense/s.income>=.65)return 'sad';return 'happy'}
function financialBalance(){const s=sums();return s.income-s.expense-s.saving}
function reactionForTransaction(item){
  if(item.kind==='income')return {mood:'happy',bank:'income'};
  const balance=financialBalance();if(balance<0)return {mood:'angry',bank:'overspend'};
  if(item.kind==='expense'&&Number(item.amount)>=500000)return {mood:'angry',bank:'heavy'};
  return {mood:'sad',bank:'light'};
}
function setAssistantReaction(item){const r=reactionForTransaction(item),text=pickAiLine(r.bank);state.assistantReaction={mood:r.mood,text,until:Date.now()+12000};clearTimeout(reactionTimer);reactionTimer=setTimeout(()=>{state.assistantReaction=null;if(state.page==='home')render()},12050);return text}
function currentAssistant(){if(state.assistantReaction&&state.assistantReaction.until>Date.now())return state.assistantReaction;const mood=robotMood();if(mood==='angry')return {mood,text:pickAiLine('overspend')};if(mood==='sad')return {mood,text:pickAiLine('light')};if(sums().income===0&&sums().expense===0)return {mood:'happy',text:'Xin chào! Hãy thêm giao dịch đầu tiên.'};return {mood:'happy',text:'Tài chính đang được theo dõi. Cứ ghi giao dịch đều nhé.'}}
function moodText(m){return state.listening?'Đang lắng nghe':m==='angry'?'Đang cảnh báo':m==='sad'?'Đang nhắc nhẹ':'Đang vui'}
function typeAssistantText(text){const el=$('#assistantTyping');if(!el)return;clearInterval(typingTimer);el.textContent='';const chars=Array.from(String(text||''));let i=0;typingTimer=setInterval(()=>{if(!document.body.contains(el)){clearInterval(typingTimer);return}el.textContent+=chars[i++]||'';if(i>=chars.length)clearInterval(typingTimer)},26)}

function renderHome(){
  const s=sums(), prev=previousMonthSums();
  const balance=s.income-s.expense-s.saving;
  const prevBal=prev.income-prev.expense-prev.saving;
  const delta=balance-prevBal;
  const mood=state.listening?'happy':robotMood();
  state.robot=mood;
  const recent=[...state.transactions].sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at)).slice(0,5);
  const decor=mood==='happy'?luminaIcon('leaf'):mood==='sad'?luminaIcon('rain'):luminaIcon('alert');
  const bubble=state.settings.bubbles!==false?`<div class="assistant-bubble-row mood-${mood}"><div class="speech-bubble bubble-${mood} ${mood==='angry'?'warning':''}"><span id="assistantTyping" class="typing-text"></span><i class="typing-caret"></i></div></div>`:'';
  const fx=`<div class="assistant-fx mood-${mood}" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`;
  return `<div class="assistant-zone mood-${mood}"><div class="weather-mood">${decor}</div>${state.listening?'<div class="listen-badge">🎙 Tôi đang nghe bạn...</div>':''}${fx}<div class="robot-wrap" id="robotWrap"><div class="holo"></div><img id="robotImg" class="robot-img robot-${mood} ${state.listening?'listening':''}" alt="Lumina assistant"></div>${bubble}<div class="assistant-state ${mood}">${moodText(mood)}</div></div><div class="balance-card"><div><div class="card-label">Số dư hiện tại ${luminaIcon('eye')}</div><div class="amount-main ${balance<0?'negative':''}">${fmt(balance)}</div></div><div class="trend ${delta<0?'negative':''}"><strong>${delta>=0?'↑':'↓'} ${fmt(Math.abs(delta))}</strong>so với tháng trước</div></div><div class="stat-grid"><div class="mini-card income"><div class="ico">${luminaIcon('income')}</div><small>Thu nhập</small><strong>${fmt(s.income)}</strong></div><div class="mini-card expense"><div class="ico">${luminaIcon('expense')}</div><small>Chi tiêu</small><strong>${fmt(s.expense)}</strong></div><div class="mini-card saving"><div class="ico">${luminaIcon('saving')}</div><small>${balance<0?'Vượt mức':'Tiết kiệm'}</small><strong>${fmt(balance<0?Math.abs(balance):s.saving)}</strong></div></div><div class="transaction-wrap"><div class="section-title"><h3>Giao dịch gần đây</h3><button class="text-action" data-go="transactions">Xem tất cả</button></div><div class="transaction-panel"><div class="tx-list">${recent.length?recent.map(txHtml).join(''):'<div class="empty">Chưa có giao dịch.<br>Nhấn micro hoặc thêm thủ công.</div>'}</div></div></div>`;
}
function txHtml(t){const cls=t.kind||'expense',sign=cls==='income'?'+':cls==='expense'?'-':'↗',icon=cls==='income'?'income':cls==='saving'?'saving':'expense',d=new Date(t.occurred_at||t.created_at||Date.now());return `<div class="tx" data-tx="${t.id}"><div class="tx-icon ${cls}">${luminaIcon(icon)}</div><div><div class="tx-name">${escapeHtml(t.note||t.category||'Giao dịch')}</div><div class="tx-meta">${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} · ${escapeHtml(t.category||'Khác')}${t.account?' · '+escapeHtml(t.account):''}</div></div><div class="tx-amount ${cls==='income'?'positive':cls==='expense'?'negative':''}">${sign} ${fmt(t.amount)}</div></div>`}
function monthlySeries(){const out=[];for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);const k=monthKey(d),s=sums((state.transactions||[]).filter(t=>monthKey(new Date(t.occurred_at))===k));out.push({label:'T'+(d.getMonth()+1),...s})}return out}
function categorySpend(){const m={};currentMonthTransactions().filter(t=>t.kind==='expense').forEach(t=>m[t.category||'Khác']=(m[t.category||'Khác']||0)+Number(t.amount));return Object.entries(m).sort((a,b)=>b[1]-a[1])}
function aiInsight(){const s=sums(),cats=categorySpend(),top=cats[0];if(s.expense>s.income&&s.expense)return `Chi tiêu tháng này cao hơn thu nhập ${fmt(s.expense-s.income)}. Ưu tiên giảm ${top?.[0]||'nhóm chi lớn nhất'}.`;if(top&&s.expense>0)return `${top[0]} đang là nhóm chi lớn nhất (${Math.round(top[1]/s.expense*100)}%).`;return 'Lumina sẽ tự phân loại giao dịch và cảnh báo khi có đủ dữ liệu.'}
function catHtml(cat,val,total,i){const keys=['expense','wallet','goals','stats','saving','bank'],pct=total?Math.round(val/total*100):0;return `<div class="cat-row"><div class="tx-icon expense">${luminaIcon(keys[i%keys.length])}</div><div class="cat-main"><span>${escapeHtml(cat)}</span><strong>${pct}%</strong><div class="cat-progress"><i style="width:${pct}%"></i></div></div><div class="cat-amount">${fmtShort(val)}</div></div>`}
function renderStats(){const series=monthlySeries(),max=Math.max(1,...series.flatMap(x=>[x.income,x.expense,x.saving])),s=sums(),total=Math.max(1,s.income+s.expense+s.saving),p1=Math.round(s.income/total*100),p2=Math.round(s.expense/total*100),p3=Math.max(0,100-p1-p2),cats=categorySpend();return `<div class="page-head"><h2>Thống kê</h2><span class="sync-pill ${state.demo?'offline':''}">${state.demo?'● Demo':'● Đồng bộ'}</span></div><div class="panel"><div class="chart-title"><strong>Dòng tiền 6 tháng</strong></div><div class="bars">${series.map(x=>`<div class="bar-month"><i class="bar in" style="height:${Math.max(3,x.income/max*100)}%"></i><i class="bar out" style="height:${Math.max(3,x.expense/max*100)}%"></i><i class="bar save" style="height:${Math.max(3,x.saving/max*100)}%"></i><small>${x.label}</small></div>`).join('')}</div></div><div class="panel"><div class="chart-title"><strong>Tỷ lệ dòng tiền</strong></div><div class="donut-row"><div class="donut" style="--p1:${p1}%;--p2:${p1+p2}%;--p3:100%"></div><div class="ratio-list"><div class="ratio-line"><span>Thu nhập</span><strong>${p1}%</strong></div><div class="ratio-line"><span>Chi tiêu</span><strong>${p2}%</strong></div><div class="ratio-line"><span>Tiết kiệm</span><strong>${p3}%</strong></div></div></div></div><div class="panel"><div class="chart-title"><strong>Chi tiêu theo danh mục</strong></div><div class="category-list">${cats.length?cats.slice(0,8).map(([c,v],i)=>catHtml(c,v,s.expense,i)).join(''):'<div class="empty">Chưa có dữ liệu chi tiêu.</div>'}</div></div><div class="panel ai-card"><h3>✨ AI phân tích</h3><p>${aiInsight()}</p></div>`}
function renderGoals(){const total=(state.goals||[]).reduce((a,g)=>a+Number(g.saved||0),0),target=(state.goals||[]).reduce((a,g)=>a+Number(g.target||0),0),pct=target?Math.round(total/target*100):0;return `<div class="page-head"><h2>Mục tiêu</h2><button class="add-btn" data-add="goal">${luminaIcon('plus')}<span>Thêm</span></button></div><div class="panel goal-total"><small>Tổng đã tiết kiệm</small><strong>${fmt(total)}</strong><em>đạt ${pct}% tổng mục tiêu</em></div>${(state.goals||[]).length?state.goals.map(g=>{const p=g.target?Math.min(100,Math.round(Number(g.saved)/Number(g.target)*100)):0;return `<div class="panel goal-card"><div class="goal-top"><div><h4>🎯 ${escapeHtml(g.title)}</h4><small>${fmt(g.saved)} / ${fmt(g.target)}</small></div><div class="goal-percent">${p}%</div></div><div class="progress"><i style="width:${p}%"></i></div><div class="goal-meta"><span>${g.due_date||'Chưa đặt hạn'}</span><span><button class="mini-action" data-goal-add="${g.id}">+ Nạp</button> <button class="mini-action" data-del="goals:${g.id}">${luminaIcon('trash')} Xóa</button></span></div></div>`}).join(''):'<div class="panel empty">Chưa có mục tiêu.</div>'}`}
function entityPage(title,kind,arr,mapFn){return `<div class="page-head"><h2>${title}</h2><button class="add-btn" data-add="${kind}">${luminaIcon('plus')}<span>Thêm</span></button></div><div class="panel list-card">${arr.length?arr.map(x=>{const r=mapFn(x),table=kind==='wallet'?'wallets':kind==='loan'?'loans':'subscriptions';return `<div class="entity-row"><div class="entity-icon">${luminaIcon(r.iconKey)}</div><div><h4>${escapeHtml(r.title)}</h4><p>${escapeHtml(r.meta)}</p></div><div><strong>${r.value}</strong><div class="row-actions"><button class="mini-action" data-del="${table}:${x.id}">${luminaIcon('trash')} Xóa</button></div></div></div>`}).join(''):'<div class="empty">Chưa có dữ liệu.</div>'}</div>`}
function renderWallets(){return entityPage('Ví & Tài sản','wallet',state.wallets||[],w=>({iconKey:'wallet',title:w.name,meta:w.type||'Ví',value:fmt(w.balance)}))}
function renderLoans(){return entityPage('Khoản vay','loan',state.loans||[],l=>({iconKey:'loan',title:l.name,meta:`Còn ${fmt(l.remaining)} · Hạn ${l.due_date||'—'}`,value:fmt(l.principal)}))}
function renderSubscriptions(){return entityPage('Subscription','subscription',state.subscriptions||[],s=>({iconKey:'subscription',title:s.name,meta:`${s.billing_cycle==='yearly'?'Hàng năm':'Hàng tháng'} · Kỳ tới ${s.next_charge||'—'}`,value:fmt(s.amount)}))}
function renderBanks(){const rows=(state.bank_accounts||[]).map(b=>`<div class="entity-row"><div class="entity-icon">${luminaIcon('bank')}</div><div><h4>${escapeHtml(b.bank_name)}</h4><p>${escapeHtml(b.account_label||'Tài khoản')} · **** ${escapeHtml(b.last4||'')}</p></div><div><strong>${b.enabled?'Đang dùng':'Tắt'}</strong><div class="row-actions"><button class="mini-action" data-del="bank_accounts:${b.id}">${luminaIcon('trash')} Xóa</button></div></div></div>`).join('');return `<div class="page-head"><h2>Ngân hàng</h2><button class="add-btn" data-add="bank">${luminaIcon('plus')}<span>Thêm</span></button></div><div class="notice">Trang này quản lý danh sách ngân hàng. Tài khoản dùng để ghi giao dịch nằm trong Ví & Tài sản.</div><div class="panel list-card">${rows||'<div class="empty">Chưa có tài khoản ngân hàng.</div>'}</div>`}
function renderTransactions(){const all=[...(state.transactions||[])].sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at));return `<div class="page-head"><h2>Giao dịch</h2><button class="add-btn" data-add="transaction">${luminaIcon('plus')}<span>Thêm</span></button></div><div class="panel list-card">${all.length?all.map(t=>`<div>${txHtml(t)}<div class="row-actions" style="justify-content:flex-end"><button class="mini-action" data-del="transactions:${t.id}">${luminaIcon('trash')} Xóa</button></div></div>`).join(''):'<div class="empty">Chưa có giao dịch.</div>'}</div>`}
function renderSettings(){return `<div class="page-head"><h2>Cài đặt</h2></div><div class="panel"><div class="setting-row"><div><strong>Tài khoản đăng nhập</strong><small>Email + mật khẩu</small></div><span>✓</span></div><div class="setting-row"><div><strong>Phiên bản</strong><small>LUMINA Money</small></div><span>v${APP_VERSION}</span></div><div class="setting-row"><div><strong>Cập nhật</strong><small>Chỉ cài khi bạn đồng ý.</small></div><button class="mini-action" data-check-update>${luminaIcon('sync')} Kiểm tra</button></div><div class="setting-row"><div><strong>Bubble AI</strong><small>Hiện lời thoại của trợ lý</small></div><button class="mini-action" data-toggle="bubbles">${state.settings.bubbles!==false?'Đang bật':'Đang tắt'}</button></div></div>`}

function bindPage(){
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  $$('[data-add]').forEach(b=>b.onclick=()=>openAddSheet(b.dataset.add));
  $$('[data-del]').forEach(b=>b.onclick=async()=>{const [table,id]=b.dataset.del.split(':');if(!confirm('Xóa mục này?'))return;try{if(table==='transactions')await deleteTransaction(id);else await dbDelete(table,id)}catch(e){toast(e.message)}});
  $$('[data-goal-add]').forEach(b=>b.onclick=()=>openGoalDeposit(b.dataset.goalAdd));
  $$('[data-toggle]').forEach(b=>b.onclick=()=>{state.settings[b.dataset.toggle]=!state.settings[b.dataset.toggle];render()});
  $$('[data-check-update]').forEach(b=>b.onclick=async()=>{const v=await checkForNewVersion({silent:false});if(!v)toast(`LUMINA v${APP_VERSION} đang là phiên bản mới nhất.`)});
  const rw=$('#robotWrap');if(rw)rw.onclick=()=>{if(!state.listening)startListening()};
  if(state.page==='home'&&state._assistantText)setTimeout(()=>typeAssistantText(state._assistantText),20);updateNotifDot();
}
function openDrawer(){$('#drawer').classList.add('open');$('#backdrop').classList.add('show');$('#drawer').setAttribute('aria-hidden','false')}
function closeDrawer(){$('#drawer').classList.remove('open');$('#backdrop').classList.remove('show');$('#drawer').setAttribute('aria-hidden','true')}
function openSheet(title,html,onSubmit=null){$('#sheetTitle').textContent=title;$('#sheetBody').innerHTML=html;$('#sheet').classList.add('open');$('#sheet').setAttribute('aria-hidden','false');$('#backdrop').classList.add('show');const f=$('#sheet form');if(f&&onSubmit)f.addEventListener('submit',onSubmit,{once:false})}
function closeSheet(){$('#sheet').classList.remove('open');$('#sheet').setAttribute('aria-hidden','true');$('#backdrop').classList.remove('show');$('#sheetBody').innerHTML=''}
function setFormBusy(form,busy,label='Đang lưu...'){const btn=form?.querySelector('[type=submit]');if(!btn)return;if(busy){btn.dataset.oldText=btn.textContent;btn.textContent=label;btn.disabled=true}else{btn.textContent=btn.dataset.oldText||'Lưu';btn.disabled=false}}
function genericForm(title,fields,handler){openSheet(title,`<form><div class="form-grid">${fields}</div><div class="sheet-actions"><button type="button" class="secondary" data-cancel-sheet>Hủy</button><button class="primary" type="submit">Lưu</button></div></form>`,async e=>{e.preventDefault();if(e.currentTarget.dataset.busy)return;e.currentTarget.dataset.busy='1';setFormBusy(e.currentTarget,true);try{await handler(new FormData(e.currentTarget));closeSheet();toast('Đã lưu')}catch(err){toast(err.message)}finally{delete e.currentTarget.dataset.busy;setFormBusy(e.currentTarget,false)}});$('#sheetBody [data-cancel-sheet]').onclick=closeSheet}
function openAddSheet(kind){
  if(kind==='transaction')return transactionForm();if(kind==='wallet')return openWalletForm(false);
  if(kind==='goal')return genericForm('Thêm mục tiêu',`<label class="full">Tên mục tiêu<input name="title" required></label><label>Số tiền mục tiêu<input name="target" type="number" min="1" required></label><label>Đã có<input name="saved" type="number" min="0" value="0"></label><label class="full">Ngày dự kiến<input name="due_date" type="date"></label>`,fd=>dbInsert('goals',{title:fd.get('title'),target:+fd.get('target'),saved:+fd.get('saved'),due_date:fd.get('due_date')||null,icon:'🎯'}));
  if(kind==='loan')return genericForm('Thêm khoản vay',`<label class="full">Tên khoản vay<input name="name" required></label><label>Giá trị vay<input name="principal" type="number" min="0" required></label><label>Còn lại<input name="remaining" type="number" min="0" required></label><label class="full">Hạn thanh toán<input name="due_date" type="date"></label>`,fd=>dbInsert('loans',{name:fd.get('name'),principal:+fd.get('principal'),remaining:+fd.get('remaining'),due_date:fd.get('due_date')||null}));
  if(kind==='subscription')return genericForm('Thêm subscription',`<label class="full">Dịch vụ<input name="name" required></label><label>Số tiền<input name="amount" type="number" min="0" required></label><label>Chu kỳ<select name="billing_cycle"><option value="monthly">Hàng tháng</option><option value="yearly">Hàng năm</option></select></label><label class="full">Kỳ thu tiếp theo<input name="next_charge" type="date"></label>`,fd=>dbInsert('subscriptions',{name:fd.get('name'),amount:+fd.get('amount'),billing_cycle:fd.get('billing_cycle'),next_charge:fd.get('next_charge')||null}));
  if(kind==='bank')return genericForm('Thêm ngân hàng',`<label class="full">Ngân hàng<input name="bank_name" required></label><label class="full">Tên tài khoản<input name="account_label"></label><label class="full">4 số cuối<input name="last4" maxlength="4" inputmode="numeric"></label>`,fd=>dbInsert('bank_accounts',{bank_name:fd.get('bank_name'),account_label:fd.get('account_label'),last4:fd.get('last4'),enabled:true}));
}
function openWalletForm(required=false){
  openSheet(required?'Tạo ví để tiếp tục':'Thêm ví / tài sản',`<form id="walletCreateForm">${required?'<div class="wallet-required">Bạn cần ít nhất một Ví & Tài sản trước khi ghi giao dịch.</div>':''}<div class="form-grid"><label class="full">Tên ví / tài khoản<input name="name" required placeholder="Ví tiền mặt / Vietcombank"></label><label>Loại<select name="type"><option>Tiền mặt</option><option>Ngân hàng</option><option>Ví điện tử</option><option>Tài sản khác</option></select></label><label>Số dư ban đầu<input name="balance" type="number" value="0"></label></div><div class="sheet-actions"><button type="button" class="secondary" data-cancel-sheet>Hủy</button><button class="primary" type="submit">Tạo ví</button></div></form>`,async e=>{
    e.preventDefault();const form=e.currentTarget;if(form.dataset.busy)return;form.dataset.busy='1';setFormBusy(form,true,'Đang tạo...');
    try{const fd=new FormData(form);const w=await dbInsert('wallets',{name:fd.get('name').trim(),type:fd.get('type')||'Ví',balance:+fd.get('balance'),icon:'💳'});closeSheet();toast(`Đã tạo ${w.name}`);if(resumeTransactionAfterWallet){resumeTransactionAfterWallet=false;navigate('transactions');setTimeout(()=>transactionForm({wallet_id:w.id}),80)}}catch(err){toast(err.message)}finally{delete form.dataset.busy;setFormBusy(form,false)}
  });$('#sheetBody [data-cancel-sheet]').onclick=closeSheet;
}
function requireWalletThen(){if((state.wallets||[]).length)return true;resumeTransactionAfterWallet=true;toast('Hãy tạo ít nhất 1 Ví & Tài sản trước.');navigate('wallets');setTimeout(()=>openWalletForm(true),100);return false}
function walletOptions(selected=''){return (state.wallets||[]).map(w=>`<option value="${w.id}" ${selected===w.id?'selected':''}>${escapeHtml(w.name)} · ${fmt(w.balance)}</option>`).join('')}

function learnedCategory(note,kind='expense'){
  const q=stripVN(note);if(!q||q.length<3)return null;const qTokens=new Set(q.split(/\s+/).filter(x=>x.length>=3&&!['mua','tien','dong','cho'].includes(x)));let best=null,bestScore=0;
  for(const tx of state.transactions||[]){if(tx.kind!==kind||!tx.category||!tx.note)continue;const n=stripVN(tx.note);let score=0;if(n===q)score=100;else if(n.includes(q)||q.includes(n))score=70;else score=n.split(/\s+/).filter(x=>qTokens.has(x)).length*22;if(score>bestScore){bestScore=score;best=tx.category}}
  return bestScore>=44?best:null;
}
function hasAnyPhrase(text, phrases){
  const padded=` ${stripVN(text)} `;
  return phrases.some(p=>padded.includes(` ${stripVN(p)} `));
}
function smartCategory(note,kind='expense'){
  const t=stripVN(note),learned=learnedCategory(note,kind);if(learned)return learned;if(kind==='saving')return 'Tiết kiệm';
  if(kind==='income'){
    if(hasAnyPhrase(t,['lương','salary','tiền công']))return 'Lương';
    if(hasAnyPhrase(t,['thưởng','bonus','hoa hồng']))return 'Thưởng';
    if(hasAnyPhrase(t,['freelance','làm thêm','job','dự án']))return 'Thu nhập thêm';
    if(hasAnyPhrase(t,['bán hàng','doanh thu','kinh doanh']))return 'Kinh doanh';
    if(hasAnyPhrase(t,['lãi','cổ tức','interest']))return 'Đầu tư';
    if(hasAnyPhrase(t,['hoàn tiền','refund']))return 'Hoàn tiền';
    return 'Thu nhập khác';
  }
  const rules=[
    ['Xe cộ',['mua xe','ô tô','oto','o to','xe máy','xe may','sửa xe','sua xe','bảo dưỡng','bao duong','lốp xe','lop xe','ắc quy','ac quy','nhớt xe','nhot xe']],
    ['Ăn uống',['cà phê','ca phe','coffee','trà sữa','tra sua','ăn sáng','an sang','ăn trưa','an trua','ăn tối','an toi','cơm','com','phở','pho','bún','bun','bánh mì','banh mi','nhà hàng','nha hang','quán ăn','quan an','nhậu','nhau','bia','đồ ăn','do an']],
    ['Đi chợ & Thực phẩm',['đi chợ','di cho','siêu thị','sieu thi','bách hóa xanh','bach hoa xanh','winmart','coopmart','thực phẩm','thuc pham','rau','thịt','thit','trứng','trung','gạo','gao']],
    ['Di chuyển',['grab','taxi','xanh sm','xe buýt','xe buyt','bus','xăng','xang','đậu xe','dau xe','gửi xe','gui xe','cầu đường','cau duong','vé tàu','ve tau','vé xe','ve xe']],
    ['Nhà ở',['tiền nhà','tien nha','thuê nhà','thue nha','chung cư','chung cu','nội thất','noi that','sửa nhà','sua nha','sơn nhà','son nha','gia dụng','gia dung']],
    ['Hóa đơn',['tiền điện','tien dien','tiền nước','tien nuoc','internet','wifi','điện thoại','dien thoai','gas','hóa đơn','hoa don','cáp quang','cap quang']],
    ['Sức khỏe',['bệnh viện','benh vien','khám','kham','thuốc','thuoc','nha khoa','bác sĩ','bac si','xét nghiệm','xet nghiem','gym','thể hình','the hinh','vitamin']],
    ['Giáo dục',['học phí','hoc phi','khóa học','khoa hoc','trường học','truong hoc','sách','sach','giáo trình','giao trinh','học thêm','hoc them','chứng chỉ','chung chi']],
    ['Du lịch',['du lịch','du lich','khách sạn','khach san','hotel','resort','tour','booking','airbnb','vé máy bay','ve may bay']],
    ['Giải trí',['netflix','spotify','youtube premium','game','phim','rạp phim','rap phim','karaoke','concert']],
    ['Công nghệ',['iphone','ipad','macbook','laptop','máy tính','may tinh','camera','máy ảnh','may anh','tai nghe','chuột','chuot','bàn phím','ban phim','điện thoại','dien thoai']],
    ['Làm đẹp',['spa','salon','cắt tóc','cat toc','mỹ phẩm','my pham','skincare','makeup','nail']],
    ['Gia đình & Trẻ em',['bỉm','bim','sữa bột','sua bot','đồ chơi','do choi','em bé','em be','trẻ em','tre em','gia đình','gia dinh']],
    ['Thú cưng',['thú cưng','thu cung','pet','thức ăn chó','thuc an cho','thức ăn mèo','thuc an meo','bác sĩ thú y','bac si thu y']],
    ['Bảo hiểm & Thuế',['bảo hiểm','bao hiem','thuế','thue','bhxh','bhyt']],
    ['Quà tặng & Từ thiện',['quà tặng','qua tang','sinh nhật','sinh nhat','mừng cưới','mung cuoi','từ thiện','tu thien','ủng hộ','ung ho','donate']],
    ['Công việc',['văn phòng','van phong','in ấn','in an','khách hàng','khach hang','công tác','cong tac']],
    ['Mua sắm',['shopee','lazada','tiki','mua','quần áo','quan ao','giày','giay','túi','tui','phụ kiện','phu kien']]
  ];
  for(const [category,phrases] of rules) if(hasAnyPhrase(t,phrases)) return category;
  return 'Khác';
}
function parseUnder1000(words){const n={khong:0,mot:1,hai:2,ba:3,bon:4,tu:4,nam:5,lam:5,sau:6,bay:7,tam:8,chin:9};let total=0,cur=0;for(const w of words){if(w==='tram'){total+=(cur||1)*100;cur=0}else if(w==='muoi'){total+=(cur||1)*10;cur=0}else if(w in n)cur=n[w]}return total+cur}
function parseSpelledAmount(t){const numWords='(?:khong|mot|hai|ba|bon|tu|nam|lam|sau|bay|tam|chin|muoi|tram|linh|le)',re=new RegExp(`((?:${numWords}\\s*)+)\\s*(ty|trieu|nghin|ngan)`,'g');let total=0,found=false,m;while((m=re.exec(t))){const val=parseUnder1000(m[1].trim().split(/\s+/)),mult=m[2]==='ty'?1e9:m[2]==='trieu'?1e6:1e3;total+=val*mult;found=true}return found?total:null}
function parseAmount(text){const t=stripVN(text).replace(/,/g,'.');let m;m=t.match(/(\d+)\s*tr\s*(\d{1,3})(?!\d)/);if(m){const frac=Number(m[2])/Math.pow(10,m[2].length);return Math.round((Number(m[1])+frac)*1e6)}m=t.match(/(\d+(?:\.\d+)?)\s*(ty|ti)\b/);if(m)return Math.round(Number(m[1])*1e9);m=t.match(/(\d+(?:\.\d+)?)\s*(trieu|tr)\b/);if(m)return Math.round(Number(m[1])*1e6);m=t.match(/(\d+(?:\.\d+)?)\s*(nghin|ngan|k)\b/);if(m)return Math.round(Number(m[1])*1e3);m=t.match(/\b\d{1,3}(?:[.\s]\d{3})+\b/);if(m)return Number(m[0].replace(/[.\s]/g,''));m=t.match(/\b\d{4,}\b/);if(m)return Number(m[0]);return parseSpelledAmount(t)}
function parseVoice(raw){
  const t=stripVN(raw),amount=parseAmount(raw);if(!amount||amount<=0)return null;let kind='expense';if(/tiet kiem|de danh|bo heo|gui tiet kiem/.test(t))kind='saving';else if(/(^| )(thu|nhan|luong|thuong|duoc chuyen|duoc tra|ban duoc|doanh thu|hoan tien)( |$)/.test(t))kind='income';
  let note=String(raw).replace(/\d+(?:[.,]\d+)?\s*(tỷ|ty|tỉ|ti|triệu|trieu|tr|nghìn|nghin|ngàn|ngan|k)?/ig,' ').replace(/\s+/g,' ').trim();note=note.replace(/^\s*(thu|chi|nhận|nhan|trả|tra|thanh toán|thanh toan)\s+/i,'').trim()||(kind==='income'?'Thu nhập':kind==='saving'?'Tiết kiệm':'Chi tiêu');return {kind,amount,category:smartCategory(note,kind),note,occurred_at:nowIso()};
}

function transactionForm(prefill={}){
  if(!requireWalletThen())return;const dt=prefill.occurred_at?new Date(prefill.occurred_at):new Date(),local=new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16),defaultWallet=prefill.wallet_id||state.wallets[0]?.id||'';
  openSheet('Thêm giao dịch',`<form id="txForm"><div class="form-grid"><div class="full"><div class="segmented" id="kindSeg"><button type="button" data-kind="income" class="${prefill.kind==='income'?'active':''}">Thu nhập</button><button type="button" data-kind="expense" class="${!prefill.kind||prefill.kind==='expense'?'active':''}">Chi tiêu</button><button type="button" data-kind="saving" class="${prefill.kind==='saving'?'active':''}">Tiết kiệm</button></div><input type="hidden" name="kind" value="${prefill.kind||'expense'}"></div><label>Số tiền<input name="amount" type="number" inputmode="numeric" min="1" required value="${prefill.amount||''}"></label><label>Tài khoản<select name="wallet_id" required>${walletOptions(defaultWallet)}</select></label><label class="full">Nội dung<input id="txNoteInput" name="note" required placeholder="Ví dụ: cà phê, tiền điện, mua xe..." value="${escapeAttr(prefill.note||'')}"></label><div class="category-auto"><div><small>Danh mục tự động</small><strong id="autoCategoryPreview">${smartCategory(prefill.note||'',prefill.kind||'expense')}</strong></div>${luminaIcon('sync')}</div><label class="full">Thời gian<input name="occurred_at" type="datetime-local" value="${local}"></label></div><div class="sheet-actions"><button type="button" class="secondary" data-cancel-sheet>Hủy</button><button class="primary" type="submit">Ghi nhận</button></div></form>`,async e=>{
    e.preventDefault();const form=e.currentTarget;if(form.dataset.busy)return;form.dataset.busy='1';setFormBusy(form,true,'Đang ghi...');
    try{const fd=new FormData(form),kind=fd.get('kind'),note=fd.get('note'),item={kind,amount:+fd.get('amount'),category:smartCategory(note,kind),note,occurred_at:fd.get('occurred_at')?new Date(fd.get('occurred_at')).toISOString():nowIso()};await recordTransaction(item,fd.get('wallet_id'));closeSheet();showConfirm(item)}catch(err){toast(err.message)}finally{delete form.dataset.busy;setFormBusy(form,false)}
  });$('#sheetBody [data-cancel-sheet]').onclick=closeSheet;const refreshCat=()=>{$('#autoCategoryPreview').textContent=smartCategory($('#txNoteInput').value,$('#txForm [name=kind]').value)};$('#txNoteInput').addEventListener('input',refreshCat);$$('#kindSeg button').forEach(b=>b.onclick=()=>{$$('#kindSeg button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#txForm [name=kind]').value=b.dataset.kind;refreshCat()});
}
async function recordTransaction(item,walletId){
  const wallet=(state.wallets||[]).find(w=>w.id===walletId);
  if(!wallet)throw new Error('Hãy chọn một Ví & Tài sản hợp lệ.');
  // Chỉ gửi đúng các cột tồn tại trong bảng transactions. Không để metadata voice/debug lọt vào PostgREST.
  const cleanItem={
    kind:item.kind,
    amount:Number(item.amount),
    category:smartCategory(item.note,item.kind),
    note:String(item.note||'').trim(),
    wallet_id:wallet.id,
    account:wallet.name,
    occurred_at:item.occurred_at||nowIso()
  };
  if(!cleanItem.amount||cleanItem.amount<=0)throw new Error('Số tiền giao dịch không hợp lệ.');
  let saved;
  if(state.demo){
    saved=await dbInsert('transactions',cleanItem,{refresh:false});
    const delta=cleanItem.kind==='income'?cleanItem.amount:-cleanItem.amount,w=state.wallets.find(x=>x.id===wallet.id);
    w.balance=Number(w.balance||0)+delta;demoSave();render();
  }else{
    saved=await dbInsert('transactions',cleanItem,{refresh:false});
    await refreshAll();
  }
  const line=setAssistantReaction(cleanItem);
  createNotification(cleanItem.kind==='income'?'Có tiền vào':'Giao dịch mới',`${cleanItem.note}: ${cleanItem.kind==='income'?'+':cleanItem.kind==='saving'?'↗':'-'}${fmt(cleanItem.amount)} · ${cleanItem.category}. ${line}`,cleanItem.kind==='income'?'income':'transaction').catch(()=>{});
  if(state.page!=='home')navigate('home');else render();
  return saved||cleanItem;
}
async function deleteTransaction(id){
  const tx=(state.transactions||[]).find(x=>x.id===id);if(!tx)return;
  if(state.demo){if(tx.wallet_id){const w=state.wallets.find(x=>x.id===tx.wallet_id);if(w)w.balance=Number(w.balance||0)+(tx.kind==='income'?-Number(tx.amount):Number(tx.amount))}await dbDelete('transactions',id,{refresh:false});demoSave();render();return}
  await dbDelete('transactions',id,{refresh:false});await refreshAll();
}
function openGoalDeposit(id){const g=(state.goals||[]).find(x=>x.id===id);if(!g)return;genericForm('Nạp vào mục tiêu',`<label class="full">${escapeHtml(g.title)}<input name="amount" type="number" min="1" required></label>`,fd=>dbUpdate('goals',id,{saved:Number(g.saved||0)+Number(fd.get('amount')||0)}))}

function chooseWalletForVoice(item){
  if((state.wallets||[]).length===1)return recordTransaction(item,state.wallets[0].id).then(()=>showConfirm(item)).catch(e=>toast(e.message));
  openSheet('Chọn tài khoản',`<div class="wallet-choice-list">${state.wallets.map(w=>`<button class="wallet-choice" data-wallet-choice="${w.id}"><span class="entity-icon">${luminaIcon('wallet')}</span><span><strong>${escapeHtml(w.name)}</strong><small>${escapeHtml(w.type||'Ví')}</small></span><em>${fmt(w.balance)}</em></button>`).join('')}</div>`);$$('#sheetBody [data-wallet-choice]').forEach(b=>b.onclick=async()=>{const id=b.dataset.walletChoice;closeSheet();try{await recordTransaction(item,id);showConfirm(item)}catch(e){toast(e.message)}});
}
function syncListeningVisuals(){
  $('#micOverlay')?.classList.add('hidden');
  $('#robotImg')?.classList.remove('listening');
  $('.listen-badge')?.remove();
}
function shutdownRecognition(){
  clearTimeout(silenceTimer);clearInterval(micClock);silenceTimer=micClock=null;
  const r=recognition;recognition=null;
  if(r){
    r.onstart=r.onspeechstart=r.onresult=r.onerror=r.onend=null;
    // abort() là lệnh dừng tức thời. stop() được gọi fallback cho WebKit cũ.
    try{r.abort()}catch{}
    try{r.stop()}catch{}
  }
  state.listening=false;
  syncListeningVisuals();
}
function stopListening(renderHomeAfter=true){
  shutdownRecognition();lastTranscript='';voiceFinishing=false;
  if(renderHomeAfter&&state.user&&state.page==='home')render();
}
function updateMicClock(){if(!$('#micTimer'))return;const sec=Math.floor((Date.now()-micStart)/1000);$('#micTimer').textContent=`0:${String(sec).padStart(2,'0')}`}
function finishVoice(text,{manual=false}={}){
  if(voiceFinishing)return;
  voiceFinishing=true;
  const captured=String(text||'').trim();
  shutdownRecognition();
  lastTranscript='';
  // Cập nhật UI về trạng thái KHÔNG nghe ngay lập tức, trước cả parse/ghi Supabase.
  if(state.user&&state.page==='home')render();
  if(!captured){voiceFinishing=false;if(manual)toast('Đã tắt micro.');return}
  const parsed=parseVoice(captured);
  voiceFinishing=false;
  if(!parsed){toast('Tôi chưa đọc được số tiền. Thử “mua cà phê 40k” hoặc “mua xe 10 triệu”.');return}
  chooseWalletForVoice(parsed);
}
function startListening(){
  if(!requireWalletThen())return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR)return toast('Trình duyệt này chưa hỗ trợ nhận giọng nói. Hãy nhập thủ công.');
  if(state.listening)return;
  lastTranscript='';voiceFinishing=false;
  const r=new SR();recognition=r;r.lang='vi-VN';r.continuous=false;r.interimResults=true;
  state.listening=true;micStart=Date.now();
  if($('#micTranscript'))$('#micTranscript').textContent='Đang nghe...';
  $('#micOverlay')?.classList.remove('hidden');
  if(state.user&&state.page==='home')render();
  updateMicClock();micClock=setInterval(updateMicClock,250);
  const arm=()=>{clearTimeout(silenceTimer);silenceTimer=setTimeout(()=>finishVoice(lastTranscript),3000)};
  r.onstart=arm;r.onspeechstart=arm;
  r.onresult=e=>{
    let text='',final=false;
    for(let i=0;i<e.results.length;i++){text+=e.results[i][0].transcript+' ';if(e.results[i].isFinal)final=true}
    lastTranscript=text.trim();
    if($('#micTranscript'))$('#micTranscript').textContent=lastTranscript||'Đang nghe...';
    arm();
    if(final)finishVoice(lastTranscript);
  };
  r.onerror=e=>{
    const denied=e.error==='not-allowed'||e.error==='service-not-allowed';
    shutdownRecognition();voiceFinishing=false;
    if(state.user&&state.page==='home')render();
    toast(denied?'Bạn chưa cho phép micro. Hãy bật quyền Microphone cho Safari.':'Không nhận được giọng nói. Thử lại nhé.');
  };
  r.onend=()=>{if(recognition===r&&!voiceFinishing){if(lastTranscript)finishVoice(lastTranscript);else stopListening()}};
  try{r.start()}catch{stopListening();toast('Không thể bật micro lúc này.')}
}
function showConfirm(item){const c=$('#confirmCard'),icon=item.kind==='income'?'income':item.kind==='saving'?'saving':'expense';c.innerHTML=`<h3>✅ Đã ghi nhận giao dịch!</h3><div class="confirm-row"><div class="tx-icon ${item.kind}">${luminaIcon(icon)}</div><div><p>${escapeHtml(item.note)}</p><small>${escapeHtml(item.category)}</small></div><strong class="${item.kind==='income'?'positive':'negative'}">${item.kind==='income'?'+':item.kind==='saving'?'↗':'-'} ${fmt(item.amount)}</strong></div>`;c.classList.remove('hidden');clearTimeout(c._timer);c._timer=setTimeout(()=>c.classList.add('hidden'),2200)}
function startBlinkLoop(){clearInterval(blinkInterval);blinkInterval=setInterval(()=>{const img=$('#robotImg');if(!img||state.listening)return;img.classList.add('blink');setTimeout(()=>img.classList.remove('blink'),190)},4200)}
function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.remove('show');void t.offsetWidth;t.classList.add('show');clearTimeout(t._timer);clearTimeout(t._clear);t._timer=setTimeout(()=>t.classList.remove('show'),2800);t._clear=setTimeout(()=>{if(!t.classList.contains('show'))t.textContent=''},3400)}

async function createNotification(title,body,type='info'){
  const n={id:crypto.randomUUID(),user_id:uid(),title,body,type,created_at:nowIso(),read_at:null};if(state.demo){state.notifications.unshift(n);demoSave();updateNotifDot();return n}
  try{const data=await dbInsert('notifications',{title,body,type},{refresh:false});await refreshAll();return data}catch(e){console.warn('notification',e);return null}
}
function unreadNotifications(){return (state.notifications||[]).filter(n=>!n.read_at)}
function updateNotifDot(){const dot=$('#notifDot');if(dot)dot.classList.toggle('hidden',!(pendingUpdateVersion||unreadNotifications().length))}
function openNotificationsCenter(){
  const list=state.notifications||[],updateRow=pendingUpdateVersion?`<div class="notification-item unread"><span>${luminaIcon('sync')}</span><div><h4>Phiên bản v${pendingUpdateVersion} đã sẵn sàng</h4><p>Chỉ cập nhật khi bạn đồng ý.</p><button id="openUpdateFromNotif" class="mini-action">Xem cập nhật</button></div></div>`:'';
  const rows=list.slice(0,30).map(n=>`<div class="notification-item ${n.read_at?'':'unread'}"><span>${luminaIcon(n.type==='income'?'income':'bell')}</span><div><h4>${escapeHtml(n.title)}</h4><p>${escapeHtml(n.body)}</p><time>${new Date(n.created_at).toLocaleString('vi-VN')}</time></div></div>`).join('');openSheet('Thông báo',`${updateRow}<div class="notification-list">${rows||'<div class="empty">Chưa có thông báo.</div>'}</div>${unreadNotifications().length?'<div class="notification-actions"><button id="markAllRead" class="secondary">Đánh dấu đã đọc</button></div>':''}`);$('#openUpdateFromNotif')?.addEventListener('click',()=>{closeSheet();showUpdatePrompt(pendingUpdateVersion)});$('#markAllRead')?.addEventListener('click',markAllNotificationsRead);
}
async function markAllNotificationsRead(){const now=nowIso();if(state.demo){state.notifications.forEach(n=>n.read_at=now);demoSave();updateNotifDot();closeSheet();return}try{const result=await runAuthed(()=>sb.from('notifications').update({read_at:now}).eq('user_id',uid()).is('read_at',null));if(result.error)throw new Error(dbFriendlyError(result.error));await refreshAll();closeSheet();toast('Đã đọc tất cả thông báo')}catch(e){toast(e.message)}}

function semverParts(v){return String(v||'').replace(/^v/i,'').split('.').map(x=>parseInt(x,10)||0)}
function isNewerVersion(candidate,current){const a=semverParts(candidate),b=semverParts(current),len=Math.max(a.length,b.length);for(let i=0;i<len;i++){const x=a[i]||0,y=b[i]||0;if(x!==y)return x>y}return false}
function parseVersionFromHtml(html){const m=String(html||'').match(/<meta\s+name=["']lumina-version["']\s+content=["']([^"']+)["']/i)||String(html||'').match(/<meta\s+content=["']([^"']+)["']\s+name=["']lumina-version["']/i);return m?.[1]?.trim()||null}
function ensureUpdateUI(){
  if($('#updatePrompt'))return;document.body.insertAdjacentHTML('beforeend',`<section id="updatePrompt" class="update-prompt hidden"><div class="update-dialog glass"><div class="update-badge">✨ PHIÊN BẢN MỚI</div><div class="update-icon"><span>↻</span></div><h2>LUMINA có bản cập nhật mới</h2><p id="updateVersionText"></p><div class="update-version-row"><span>v${APP_VERSION}</span><b>→</b><strong id="updateTargetVersion">—</strong></div><div class="update-note">LUMINA sẽ không tự cập nhật. Chỉ khi bạn đồng ý, bản mới mới được kích hoạt.</div><div class="update-actions"><button id="deferUpdateBtn" class="secondary">Để sau</button><button id="acceptUpdateBtn" class="primary">Đồng ý cập nhật</button></div></div></section><section id="updateProgressOverlay" class="update-progress-overlay hidden"><div class="update-stage"><div class="update-scene"><div class="update-orbit orbit-a"></div><div class="update-orbit orbit-b"></div><div class="update-orbit orbit-c"></div><div class="update-cube"><div class="cube-face cube-front">L</div><div class="cube-face cube-back">✦</div><div class="cube-face cube-right">◈</div><div class="cube-face cube-left">AI</div><div class="cube-face cube-top">↻</div><div class="cube-face cube-bottom">✓</div></div><div class="update-floor"></div></div><div class="update-copy"><span class="update-live-pill">LUMINA UPDATE</span><h2 id="updateProgressTitle">Đang chuẩn bị phiên bản mới...</h2><p id="updateProgressSub"></p><div class="release-progress"><i id="releaseProgressBar"></i></div><strong id="releaseProgressPct">0%</strong></div></div></section>`);$('#deferUpdateBtn').onclick=hideUpdatePrompt;$('#acceptUpdateBtn').onclick=()=>pendingUpdateVersion&&runUserApprovedUpdate(pendingUpdateVersion)
}
function showUpdatePrompt(v){if(updateFlowBusy||!v)return;ensureUpdateUI();pendingUpdateVersion=v;$('#updateTargetVersion').textContent=`v${v}`;$('#updateVersionText').textContent=`LUMINA v${v} đã được deploy và đang chờ bạn cho phép cập nhật.`;$('#updatePrompt').classList.remove('hidden');updateNotifDot()}
function hideUpdatePrompt(){$('#updatePrompt')?.classList.add('hidden')}
function setPendingUpdate(v){pendingUpdateVersion=v;updateNotifDot()}
async function fetchLatestDeployedVersion(){const url=new URL('./index.html',location.href);url.searchParams.set('__lumina_probe',`${Date.now()}-${Math.random()}`);const res=await fetch(url,{cache:'no-store',headers:{'X-Lumina-Version-Probe':'1'}});if(!res.ok)throw new Error(`Không kiểm tra được phiên bản mới (${res.status}).`);return parseVersionFromHtml(await res.text())}
async function checkForNewVersion({silent=false}={}){if(updateFlowBusy||location.protocol==='file:')return null;try{const latest=await fetchLatestDeployedVersion();if(latest&&isNewerVersion(latest,APP_VERSION)){const same=pendingUpdateVersion===latest;setPendingUpdate(latest);if(!silent||!same)showUpdatePrompt(latest);return latest}setPendingUpdate(null);return null}catch(e){if(!silent)toast(e.message);return null}}
function waitForController(timeout=5000){if(navigator.serviceWorker?.controller)return Promise.resolve(navigator.serviceWorker.controller);return new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(t);resolve(navigator.serviceWorker?.controller||null)},t=setTimeout(finish,timeout);navigator.serviceWorker?.addEventListener('controllerchange',finish,{once:true})})}
function swRequest(type,payload={},timeout=35000){return new Promise(async(resolve,reject)=>{const controller=navigator.serviceWorker?.controller||await waitForController();if(!controller)return reject(new Error('Update Gate chưa được kích hoạt. Hãy đóng rồi mở lại LUMINA một lần.'));const ch=new MessageChannel(),timer=setTimeout(()=>reject(new Error('Quá thời gian xử lý cập nhật.')),timeout);ch.port1.onmessage=e=>{clearTimeout(timer);const d=e.data||{};d.ok?resolve(d):reject(new Error(d.error||'Không thể cập nhật.'))};controller.postMessage({type,...payload},[ch.port2])})}
function setUpdateProgress(pct,status){const n=Math.max(0,Math.min(100,Math.round(pct)));if($('#releaseProgressBar'))$('#releaseProgressBar').style.width=`${n}%`;if($('#releaseProgressPct'))$('#releaseProgressPct').textContent=`${n}%`;if(status&&$('#updateProgressSub'))$('#updateProgressSub').textContent=status}
async function runUserApprovedUpdate(version){if(updateFlowBusy)return;updateFlowBusy=true;hideUpdatePrompt();ensureUpdateUI();const overlay=$('#updateProgressOverlay');overlay.classList.remove('hidden');$('#updateProgressTitle').textContent=`Đang cập nhật lên v${version}`;const started=performance.now();let done=false;const stage=swRequest('STAGE_RELEASE',{version},45000).then(x=>{done=true;return x});const timer=setInterval(()=>{let pct=Math.floor((performance.now()-started)/UPDATE_PROGRESS_DURATION_MS*100);if(!done)pct=Math.min(pct,99);setUpdateProgress(pct,pct<40?'Đang tải giao diện mới...':pct<80?'Đang đồng bộ mô-đun...':'Đang xác minh...')},80);try{await Promise.all([stage,new Promise(r=>setTimeout(r,UPDATE_PROGRESS_DURATION_MS))]);clearInterval(timer);setUpdateProgress(100,'Hoàn tất');await swRequest('COMMIT_RELEASE',{version},10000);$('#updateProgressTitle').textContent=`Cập nhật v${version} thành công`;await new Promise(r=>setTimeout(r,1600));location.replace(location.pathname+`?updated=${encodeURIComponent(version)}`)}catch(e){clearInterval(timer);updateFlowBusy=false;overlay.classList.add('hidden');toast(`Cập nhật chưa hoàn tất: ${e.message}`);setPendingUpdate(version);showUpdatePrompt(version)}}
async function initUpdateGate(){ensureUpdateUI();if(!('serviceWorker'in navigator)||!/^https?:$/.test(location.protocol))return;try{await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});await navigator.serviceWorker.ready;await waitForController(5000);setTimeout(()=>checkForNewVersion({silent:true}),1800);clearInterval(updateCheckTimer);updateCheckTimer=setInterval(()=>{if(!document.hidden)checkForNewVersion({silent:true})},UPDATE_CHECK_INTERVAL_MS)}catch(e){console.warn('Update Gate',e)}}

// Test hooks: không chứa secret, chỉ phục vụ smoke test/debug console.
window.LuminaDebug={parseVoice,parseAmount,smartCategory,getState:()=>state,recordTransaction,openWalletForm,isStandaloneApp,ensureLiveSession,recoverSessionOnResume};

initUpdateGate();
init();
