const sb = window.ppSupabase;
const baseUrl = window.PENGEPILOT_CONFIG.baseUrl;
const qs = s => document.querySelector(s);

function setMsg(text, type='') {
  const el=qs('#message');
  if(!el)return;
  el.className='notice '+type;
  el.textContent=text;
  el.classList.remove('hidden');
}

function setFormEnabled(formId, enabled) {
  const form=qs(formId);
  if(!form)return;
  form.querySelectorAll('input,button').forEach(el=>el.disabled=!enabled);
}

async function signIn(e) {
  e.preventDefault(); setMsg('Logger ind…');
  const email=qs('#email').value.trim(), password=qs('#password').value;
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error)return setMsg(error.message,'bad');
  location.replace('index.html');
}

async function signInWithPasskey() {
  if(!sb.auth.signInWithPasskey) return setMsg('Passkey-login kræver en nyere Supabase-klient.','bad');
  setMsg('Åbner passkey…');
  const {error}=await sb.auth.signInWithPasskey();
  if(error) return setMsg(error.code==='passkey_disabled'?'Passkeys er endnu ikke aktiveret for PengePilot.':error.message,'bad');
  location.replace('index.html');
}

async function signUp(e) {
  e.preventDefault(); setMsg('Opretter bruger…');
  const fullName=qs('#fullName').value.trim(), email=qs('#email').value.trim(), password=qs('#password').value;
  const {data,error}=await sb.auth.signUp({email,password,options:{data:{full_name:fullName},emailRedirectTo:baseUrl+'auth-callback.html'}});
  if(error)return setMsg(error.message,'bad');
  if(data.session) location.replace('index.html');
  else setMsg('Brugeren er oprettet. Tjek din email og bekræft adressen før første login.','good');
}

async function sendReset(e) {
  e.preventDefault(); setMsg('Sender nulstillingslink…');
  const email=qs('#email').value.trim();
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:baseUrl+'reset-password.html'});
  if(error)return setMsg(error.message,'bad');
  setMsg('Hvis adressen findes, er der sendt et link til nulstilling.','good');
}

async function updatePassword(e) {
  e.preventDefault();
  const p1=qs('#password').value,p2=qs('#password2').value;
  if(p1!==p2)return setMsg('Adgangskoderne er ikke ens.','bad');
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return setMsg('Nulstillingslinket er udløbet eller ugyldigt. Bed om et nyt link.','bad');
  const {error}=await sb.auth.updateUser({password:p1});
  if(error)return setMsg(error.message,'bad');
  await sb.auth.signOut();
  setMsg('Adgangskoden er opdateret. Du kan nu logge ind.','good');
  setTimeout(()=>location.replace('login.html'),900);
}

async function callback() {
  setMsg('Bekræfter din email…');
  const {data:{session},error}=await sb.auth.getSession();
  if(error)return setMsg(error.message,'bad');
  if(session){
    history.replaceState({},document.title,location.pathname);
    setMsg('Email bekræftet. Sender dig videre…','good');
    return setTimeout(()=>location.replace('index.html'),500);
  }
  setMsg('Bekræftelsen er behandlet. Du kan nu logge ind.','good');
  setTimeout(()=>location.replace('login.html'),900);
}

async function initResetPage() {
  setFormEnabled('#resetForm',false);
  let recoverySeen=false;
  const {data:{subscription}}=sb.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY' && session){ recoverySeen=true; setFormEnabled('#resetForm',true); setMsg('Vælg nu din nye adgangskode.','good'); }
  });
  const {data:{session}}=await sb.auth.getSession();
  if(session){ setFormEnabled('#resetForm',true); if(!recoverySeen)setMsg('Vælg nu din nye adgangskode.','good'); }
  else setMsg('Nulstillingslinket er udløbet eller ugyldigt. Bed om et nyt link.','bad');
  setTimeout(()=>subscription.unsubscribe(),10000);
}

async function redirectIfSignedIn() {
  const {data:{session}}=await sb.auth.getSession();
  if(session) location.replace('index.html');
}

window.addEventListener('DOMContentLoaded',async()=>{
  qs('#loginForm')?.addEventListener('submit',signIn);
  qs('#passkeyLogin')?.addEventListener('click',signInWithPasskey);
  qs('#signupForm')?.addEventListener('submit',signUp);
  qs('#forgotForm')?.addEventListener('submit',sendReset);
  qs('#resetForm')?.addEventListener('submit',updatePassword);
  const authPage=document.body.dataset.authPage;
  if(authPage==='callback') return callback();
  if(qs('#resetForm')) return initResetPage();
  if(qs('#loginForm')||qs('#signupForm')) await redirectIfSignedIn();
});
