import { useState, useRef, useEffect, useCallback } from "react";

/*
  ╔══════════════════════════════════════════════════════════╗
  ║  SAGE v5 — PRODUCTION READY                             ║
  ║  Before deploying, replace these 4 values:              ║
  ║                                                          ║
  ║  1. FIREBASE_CONiFIG   → your Firebase project config    ║
  ║  2. STRIPE_GROWTH_URL → your Stripe $19/mo payment link ║
  ║  3. STRIPE_BLOOM_URL  → your Stripe $49/mo payment link ║
  ║  4. GA_MEASUREMENT_ID → your Google Analytics ID        ║
  ╚══════════════════════════════════════════════════════════╝
*/

// ─── YOUR CONFIG — replace these ─────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "YOUR_FIREBASE_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
const STRIPE_GROWTH_URL = "https://buy.stripe.com/YOUR_GROWTH_LINK";
const STRIPE_BLOOM_URL  = "https://buy.stripe.com/YOUR_BLOOM_LINK";
const GA_MEASUREMENT_ID = "G-XXXXXXXXXX";

// ─── FONTS ───────────────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Mono:wght@300;400;500&display=swap";
document.head.appendChild(fontLink);

// ─── SEO META TAGS ────────────────────────────────────────────────────────────
function injectSEO() {
  const metas = [
    { name:"description",       content:"Sage is your personal AI wellness coach — available 24/7, deeply empathetic, and built on evidence-based techniques. Start free." },
    { name:"keywords",          content:"AI wellness coach, mental health app, anxiety support, CBT app, emotional wellness, AI therapy alternative" },
    { property:"og:title",      content:"Sage — AI Wellness Coach" },
    { property:"og:description",content:"Your personal AI wellness coach. Always available, never judgmental. Start free today." },
    { property:"og:type",       content:"website" },
    { name:"twitter:card",      content:"summary_large_image" },
    { name:"twitter:title",     content:"Sage — AI Wellness Coach" },
    { name:"twitter:description",content:"24/7 AI wellness coaching built on evidence-based techniques. Free to start." },
    { name:"theme-color",       content:"#0a0d0f" },
    { name:"apple-mobile-web-app-capable",           content:"yes" },
    { name:"apple-mobile-web-app-status-bar-style",  content:"black-translucent" },
    { name:"apple-mobile-web-app-title",             content:"Sage" },
  ];
  document.title = "Sage — AI Wellness Coach";
  metas.forEach(attrs => {
    const el = document.createElement("meta");
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v));
    document.head.appendChild(el);
  });
  // PWA manifest
  const manifest = {
    name: "Sage Wellness", short_name: "Sage",
    description: "Your personal AI wellness coach",
    start_url: "/", display: "standalone",
    background_color: "#0a0d0f", theme_color: "#4a9e8a",
    icons: [{ src:"https://placehold.co/192x192/4a9e8a/fff?text=🌿", sizes:"192x192", type:"image/png" },
            { src:"https://placehold.co/512x512/4a9e8a/fff?text=🌿", sizes:"512x512", type:"image/png" }],
  };
  const blob = new Blob([JSON.stringify(manifest)],{type:"application/json"});
  const link = document.createElement("link");
  link.rel = "manifest"; link.href = URL.createObjectURL(blob);
  document.head.appendChild(link);
}
injectSEO();

// ─── GOOGLE ANALYTICS ────────────────────────────────────────────────────────
function initAnalytics() {
  if (!GA_MEASUREMENT_ID || GA_MEASUREMENT_ID === "G-XXXXXXXXXX") return;
  const s = document.createElement("script");
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  s.async = true; document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){ window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID);
}
initAnalytics();

function track(event, params={}) {
  if (window.gtag) window.gtag("event", event, params);
}

// ─── FIREBASE AUTH + FIRESTORE ────────────────────────────────────────────────
// Loaded dynamically so the app works even before Firebase is configured
let firebaseAuth = null, firebaseDb = null, firebaseLoaded = false;

async function loadFirebase() {
  if (firebaseLoaded) return;
  try {
    const [{ initializeApp }, { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged },
           { getFirestore, doc, setDoc, getDoc, updateDoc }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"),
    ]);
    const app = initializeApp(FIREBASE_CONFIG);
    firebaseAuth = { auth: getAuth(app), createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged };
    firebaseDb = { db: getFirestore(app), doc, setDoc, getDoc, updateDoc };
    firebaseLoaded = true;
  } catch(e) {
    console.warn("Firebase not configured — running in local mode:", e.message);
  }
}

async function saveUserData(uid, data) {
  if (!firebaseDb) return;
  const { db, doc, setDoc } = firebaseDb;
  try { await setDoc(doc(db,"users",uid), data, { merge:true }); } catch(e) { console.warn("Save failed:", e); }
}

async function loadUserData(uid) {
  if (!firebaseDb) return null;
  const { db, doc, getDoc } = firebaseDb;
  try { const snap = await getDoc(doc(db,"users",uid)); return snap.exists() ? snap.data() : null; }
  catch(e) { console.warn("Load failed:", e); return null; }
}

// ─── PLAN CONFIG ─────────────────────────────────────────────────────────────
const PLANS = {
  free:   { name:"Seedling", monthlyLimit:5,   price:"Free"   },
  growth: { name:"Growth",   monthlyLimit:null, price:"$19/mo" },
  bloom:  { name:"Bloom",    monthlyLimit:null, price:"$49/mo" },
};
const FREE_LIMIT = 5;
function isPaid(plan) { return plan==="growth"||plan==="bloom"; }
function sessionsLeft(mem) { return Math.max(0,FREE_LIMIT-(mem.monthlySessionCount||0)); }
function isAtLimit(mem) { return !isPaid(mem.plan)&&(mem.monthlySessionCount||0)>=FREE_LIMIT; }
function getMonthKey() { const d=new Date(); return `${d.getFullYear()}-${d.getMonth()}`; }

// ─── SENSITIVE TOPICS ────────────────────────────────────────────────────────
const SENSITIVE_TOPICS = {
  crisis: {
    words:["suicide","kill myself","end it all","don't want to be here","want to die","hurt myself","self harm","self-harm","no reason to live","can't go on","end my life","take my life"],
    modal:{ emoji:"🫶",color:"#e05c5c",borderColor:"rgba(224,92,92,0.35)",
      title:(n)=>`${n?n+", you":"You"} are not alone in this.`,
      body:"What you're feeling right now is real, and it matters. Sage cares about you deeply. Please reach out to someone trained for this moment — these services are free, confidential, and available right now.",
      resources:[{name:"988 Suicide & Crisis Lifeline",contact:"Call or text 988",available:"24/7 · Free · Confidential",url:"https://988lifeline.org"},{name:"Crisis Text Line",contact:"Text HOME to 741741",available:"24/7 · Free · Confidential",url:"https://crisistextline.org"},{name:"SAMHSA National Helpline",contact:"1-800-662-4357",available:"24/7 · Free · Confidential",url:"https://samhsa.gov"}] }},
  addiction: {
    words:["addicted","addiction","alcoholic","alcohol problem","drinking problem","drug problem","using drugs","can't stop drinking","can't stop using","relapse","rehab","detox","withdrawal","sobriety","cocaine","heroin","meth","opioid","fentanyl","overdose","blackout drinking"],
    modal:{ emoji:"💙",color:"#4a7abf",borderColor:"rgba(74,122,191,0.35)",
      title:(n)=>`${n?n+", reaching":"Reaching"} out takes real courage.`,
      body:"Sage can support your daily wellness, but addiction deserves specialized care from people trained specifically for this journey. These resources are free and judgment-free.",
      resources:[{name:"SAMHSA National Helpline",contact:"1-800-662-4357",available:"24/7 · Free · Confidential",url:"https://samhsa.gov"},{name:"Alcoholics Anonymous",contact:"aa.org",available:"Find a local meeting",url:"https://aa.org"},{name:"SMART Recovery",contact:"smartrecovery.org",available:"Online & in-person groups",url:"https://smartrecovery.org"}] }},
  abuse: {
    words:["hitting me","beats me","physically abused","sexual abuse","sexually abused","domestic violence","abusive relationship","he hits","she hits","my partner hurts","afraid of my partner","controlling partner","won't let me leave","trapped in relationship","stalking me","molested","assault","raped"],
    modal:{ emoji:"🛡️",color:"#9b6ec4",borderColor:"rgba(155,110,196,0.35)",
      title:(n)=>`${n?n+", what":"What"} you're describing is not okay — and not your fault.`,
      body:"Sage hears you and wants you to be safe. What you're experiencing needs specialized support. These organizations have trained advocates who can help you understand your options safely.",
      resources:[{name:"National Domestic Violence Hotline",contact:"1-800-799-7233",available:"24/7 · Free · Confidential",url:"https://thehotline.org"},{name:"RAINN Sexual Assault Hotline",contact:"1-800-656-4673",available:"24/7 · Free · Confidential",url:"https://rainn.org"},{name:"Crisis Text Line",contact:"Text HOME to 741741",available:"24/7 · Free",url:"https://crisistextline.org"}] }},
  eatingDisorder: {
    words:["anorexia","anorexic","bulimia","bulimic","binge eating","purging","i purge","throwing up food","starving myself","not eating","afraid to eat","fear of food","obsessed with weight","counting every calorie","eating disorder"],
    modal:{ emoji:"🌸",color:"#c47a9b",borderColor:"rgba(196,122,155,0.35)",
      title:(n)=>`${n?n+", your":"Your"} relationship with food deserves real support.`,
      body:"Eating disorders respond best to specialized care. These resources connect you with people who truly understand what you're going through — without judgment.",
      resources:[{name:"National Alliance for Eating Disorders",contact:"1-866-662-1235",available:"Helpline & therapist finder",url:"https://allianceforeatingdisorders.com"},{name:"ANAD Helpline",contact:"1-888-375-7767",available:"Mon–Fri 9am–9pm CT",url:"https://anad.org"},{name:"Crisis Text Line",contact:"Text NEDA to 741741",available:"24/7 · Free",url:"https://crisistextline.org"}] }},
  severeDepression: {
    words:["can't get out of bed","haven't eaten in days","completely numb","feel nothing","empty inside","been crying for days","can't function","stopped showering","given up on everything","nothing matters","feel dead inside","lost the will"],
    modal:{ emoji:"🌤️",color:"#5a9e6e",borderColor:"rgba(90,158,110,0.35)",
      title:(n)=>`${n?n+", what":"What"} you're describing sounds really heavy.`,
      body:"What you're experiencing sounds like it needs more support than a wellness app can offer. A therapist can provide the consistent, professional care that makes a real difference.",
      resources:[{name:"SAMHSA Treatment Locator",contact:"findtreatment.gov",available:"Find local mental health care",url:"https://findtreatment.gov"},{name:"988 Suicide & Crisis Lifeline",contact:"Call or text 988",available:"24/7 · Free · Confidential",url:"https://988lifeline.org"},{name:"Open Path Collective",contact:"openpathcollective.org",available:"Low-cost therapy $30–$80/session",url:"https://openpathcollective.org"}] }},
};

function detectSensitiveTopic(text) {
  const l = text.toLowerCase();
  for (const [key,topic] of Object.entries(SENSITIVE_TOPICS)) {
    if (topic.words.some(w=>l.includes(w))) return key;
  }
  return null;
}

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const MOODS = [
  {emoji:"😞",label:"Rough",val:1,color:"#e05c5c"},
  {emoji:"😕",label:"Low",  val:2,color:"#e08c3a"},
  {emoji:"😐",label:"Okay", val:3,color:"#c9b84c"},
  {emoji:"🙂",label:"Good", val:4,color:"#5cb87a"},
  {emoji:"😄",label:"Great",val:5,color:"#4ab5c4"},
];
const PRACTICES = [
  {icon:"🌬️",title:"Box Breathing",      desc:"Inhale 4s · Hold 4s · Exhale 4s · Hold 4s. Repeat 4×."},
  {icon:"🌱",title:"5-4-3-2-1 Grounding",desc:"5 things you see · 4 feel · 3 hear · 2 smell · 1 taste."},
  {icon:"📓",title:"Gratitude Anchor",   desc:"Write 3 specific things you're grateful for today."},
  {icon:"🚶",title:"10-Min Walk",        desc:"No phone. Notice surroundings. Fastest mood shifter."},
  {icon:"🧘",title:"Body Scan",          desc:"Close eyes. Slowly notice each body part head to toe."},
  {icon:"✍️",title:"Thought Record",     desc:"Write the thought, the feeling, then challenge it."},
];

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
function buildSystemPrompt(memory) {
  const memCtx   = memory.importantMoments?.length ? `\n\nWhat you know:\n${memory.importantMoments.map(m=>`• ${m}`).join("\n")}` : "";
  const themeCtx = memory.keyThemes?.length ? `\nRecurring themes: ${memory.keyThemes.join(", ")}` : "";
  const moodCtx  = memory.moodHistory?.length ? `\nMood trend: ${memory.moodHistory.slice(-5).map(m=>`${m.label}(${m.date})`).join("→")}` : "";
  return `You are Sage, a warm, empathetic AI wellness coach for everyday mental wellness.
Scope: stress, anxiety, mood, habits, relationships, general emotional wellbeing.
Limits: not equipped for clinical addiction, abuse counseling, eating disorder treatment, or crisis intervention — defer warmly to specialists when these arise.
Personality: warm, wise, genuinely curious. Reference past conversations naturally. 2–4 sentences. One question per response. Never start with "I".
${memory.userName?`Name: ${memory.userName}.`:""} ${memory.userGoal?`Focus: ${memory.userGoal}.`:""}${memCtx}${themeCtx}${moodCtx}`;
}

// ─── MEMORY EXTRACTOR ────────────────────────────────────────────────────────
async function extractMemory(messages, existing) {
  const recent = messages.slice(-6).map(m=>`${m.role}: ${m.content}`).join("\n");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:600,
        system:`Extract wellness coaching memory. Return ONLY valid JSON: {"importantMoments":["strings under 15 words"],"keyThemes":["max 5"],"pendingCheckIn":"follow-up message for next session or null"}`,
        messages:[{role:"user",content:`Existing: ${JSON.stringify(existing.importantMoments||[])}\nConversation:\n${recent}`}]})});
    const d = await res.json();
    return JSON.parse((d.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim());
  } catch { return {}; }
}

async function generateReport(memory) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:600,
        system:"You are Sage. Write a warm personal weekly wellness report. 3–4 short paragraphs, plain language, no bullets, no headers. Start with an observation.",
        messages:[{role:"user",content:`Name: ${memory.userName||"friend"}. Moods: ${(memory.moodHistory||[]).slice(-7).map(m=>`${m.label} ${m.date}`).join(", ")||"limited"}. Themes: ${(memory.keyThemes||[]).join(", ")||"general"}. Notes: ${(memory.importantMoments||[]).slice(-5).join("; ")||"none"}.`}]})});
    const d = await res.json(); return d.content?.[0]?.text||null;
  } catch { return null; }
}

// ─── FRESH MEMORY ────────────────────────────────────────────────────────────
function freshMemory(overrides={}) {
  return { userName:null,userGoal:null,plan:"free",monthKey:getMonthKey(),monthlySessionCount:0,totalSessionCount:0,
    keyThemes:[],moodHistory:[],importantMoments:[],weeklyReport:null,pendingCheckIn:null,streak:0,lastSessionDate:null,...overrides };
}

// ─── AMBIENT BG ───────────────────────────────────────────────────────────────
function AmbientBg() {
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
      <div style={{position:"absolute",top:"-20%",left:"-10%",width:"60vw",height:"60vw",borderRadius:"50%",background:"radial-gradient(circle,rgba(74,158,138,0.07) 0%,transparent 65%)"}} />
      <div style={{position:"absolute",bottom:"-15%",right:"-10%",width:"50vw",height:"50vw",borderRadius:"50%",background:"radial-gradient(circle,rgba(74,100,158,0.05) 0%,transparent 65%)"}} />
    </div>
  );
}

// ─── AUTH SCREEN ─────────────────────────────────────────────────────────────
function AuthScreen({ onAuth, onLocalMode }) {
  const [mode, setMode]       = useState("login"); // login | signup
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async() => {
    if (!email||!password) { setError("Please enter your email and password."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true); setError("");
    await loadFirebase();
    if (!firebaseAuth) { setError(""); onLocalMode(); return; }
    try {
      const { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword } = firebaseAuth;
      const cred = mode==="signup"
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
      track(mode==="signup"?"sign_up":"login", {method:"email"});
      onAuth(cred.user);
    } catch(e) {
      const msgs = { "auth/user-not-found":"No account found. Try signing up.", "auth/wrong-password":"Incorrect password.", "auth/email-already-in-use":"An account with this email already exists.", "auth/invalid-email":"Please enter a valid email address.", "auth/weak-password":"Password must be at least 6 characters." };
      setError(msgs[e.code]||"Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:"#0a0d0f",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Cormorant Garamond',Georgia,serif"}}>
      <AmbientBg />
      <div style={{maxWidth:400,width:"100%",position:"relative",zIndex:1}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,#4a9e8a,#2d6e5f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,margin:"0 auto 16px"}}>🌿</div>
          <h1 style={{fontSize:32,fontWeight:300,color:"#f0ebe3",marginBottom:6,letterSpacing:"-0.02em"}}>sage</h1>
          <p style={{fontSize:14,color:"#5a5650",lineHeight:1.6}}>{mode==="signup"?"Create your account — your wellness journey starts here.":"Welcome back. Sage remembers where you left off."}</p>
        </div>

        {/* Toggle */}
        <div style={{display:"flex",background:"rgba(255,255,255,0.04)",borderRadius:40,padding:3,marginBottom:24}}>
          {["login","signup"].map(m=>(
            <button key={m} onClick={()=>{setMode(m);setError("");}} style={{flex:1,padding:"10px",borderRadius:36,border:"none",background:mode===m?"#4a9e8a":"transparent",color:mode===m?"#fff":"#5a5650",fontSize:13,cursor:"pointer",fontFamily:"'DM Mono',monospace",letterSpacing:"0.04em",transition:"all 0.2s"}}>
              {m==="login"?"Sign In":"Create Account"}
            </button>
          ))}
        </div>

        {/* Form */}
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
          <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="your@email.com" type="email"
            style={{padding:"14px 18px",borderRadius:36,fontSize:15,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"#f0ebe3",outline:"none",fontFamily:"'Cormorant Garamond',serif"}} />
          <input value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Password (6+ characters)" type="password"
            style={{padding:"14px 18px",borderRadius:36,fontSize:15,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"#f0ebe3",outline:"none",fontFamily:"'Cormorant Garamond',serif"}} />
          {error && <div style={{fontSize:13,color:"#e05c5c",textAlign:"center",padding:"8px 16px",background:"rgba(224,92,92,0.08)",borderRadius:10,border:"1px solid rgba(224,92,92,0.2)"}}>{error}</div>}
        </div>

        <button onClick={submit} disabled={loading} style={{width:"100%",padding:"15px",borderRadius:36,border:"none",background:loading?"rgba(74,158,138,0.5)":"#4a9e8a",color:"#fff",fontSize:14,cursor:loading?"not-allowed":"pointer",fontFamily:"'DM Mono',monospace",letterSpacing:"0.04em",marginBottom:14}}>
          {loading?"Please wait...":(mode==="signup"?"Create My Account →":"Sign In →")}
        </button>

        <div style={{textAlign:"center",marginBottom:10}}>
          <div style={{height:1,background:"rgba(255,255,255,0.06)",marginBottom:14}} />
          <button onClick={onLocalMode} style={{background:"transparent",border:"none",color:"#3a3830",fontSize:12,cursor:"pointer",fontFamily:"'DM Mono',monospace",letterSpacing:"0.04em"}}>
            Continue without account (local only)
          </button>
        </div>

        <p style={{textAlign:"center",fontSize:11,color:"#2a2820",fontFamily:"'DM Mono',monospace",lineHeight:1.6}}>
          By continuing you agree to our{" "}
          <span style={{color:"#3a4a40",cursor:"pointer",textDecoration:"underline"}}>Terms of Service</span>{" "}and{" "}
          <span style={{color:"#3a4a40",cursor:"pointer",textDecoration:"underline"}}>Privacy Policy</span>
        </p>
      </div>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}input::placeholder{color:#3a3830}input[type=password]{letter-spacing:0.1em}`}</style>
    </div>
  );
}

// ─── EXIT INTENT EMAIL CAPTURE ────────────────────────────────────────────────
function ExitIntentCapture({ onDismiss }) {
  const [email, setEmail] = useState("");
  const [done, setDone]   = useState(false);
  const submit = () => { if(email) { track("exit_intent_email_capture"); setDone(true); setTimeout(onDismiss,2000); } };
  return (
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{maxWidth:420,width:"100%",background:"linear-gradient(160deg,#0d1a16,#0a0d0f)",border:"1px solid rgba(74,158,138,0.28)",borderRadius:24,padding:"36px 32px",textAlign:"center",position:"relative"}}>
        <button onClick={onDismiss} style={{position:"absolute",top:14,right:16,background:"transparent",border:"none",color:"#2a2820",fontSize:18,cursor:"pointer"}}>✕</button>
        {done ? (
          <>
            <div style={{fontSize:36,marginBottom:14}}>🌿</div>
            <h3 style={{fontSize:24,fontWeight:300,color:"#f0ebe3",marginBottom:10,fontFamily:"'Cormorant Garamond',serif"}}>You're on the list.</h3>
            <p style={{fontSize:14,color:"#7a7268"}}>Watch for something good in your inbox soon.</p>
          </>
        ) : (
          <>
            <div style={{fontSize:36,marginBottom:14}}>🌱</div>
            <h3 style={{fontSize:24,fontWeight:300,color:"#f0ebe3",lineHeight:1.2,marginBottom:10,fontFamily:"'Cormorant Garamond',serif"}}>Before you go — get 7 days free.</h3>
            <p style={{fontSize:14,color:"#7a7268",lineHeight:1.7,marginBottom:24}}>Leave your email and we'll send you a free Growth trial link. No credit card, no commitment.</p>
            <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="your@email.com" type="email"
              style={{width:"100%",padding:"13px 18px",borderRadius:36,fontSize:14,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"#f0ebe3",outline:"none",marginBottom:10,fontFamily:"'Cormorant Garamond',serif",textAlign:"center"}} />
            <button onClick={submit} style={{width:"100%",padding:"14px",borderRadius:36,border:"none",background:"#4a9e8a",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"'DM Mono',monospace",letterSpacing:"0.04em",marginBottom:10}}>Claim My Free Trial →</button>
            <button onClick={onDismiss} style={{background:"transparent",border:"none",color:"#2a2820",fontSize:12,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>No thanks, I'll skip</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ADD TO HOME SCREEN PROMPT ────────────────────────────────────────────────
function A2HSPrompt({ onDismiss }) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <div style={{position:"fixed",bottom:24,left:16,right:16,zIndex:150,background:"linear-gradient(135deg,#0d1a16,#0a1510)",border:"1px solid rgba(74,158,138,0.3)",borderRadius:18,padding:"18px 20px",display:"flex",gap:14,alignItems:"flex-start",boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
      <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#4a9e8a,#2d6e5f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🌿</div>
      <div style={{flex:1}}>
        <div style={{fontSize:15,color:"#f0ebe3",fontFamily:"'Cormorant Garamond',serif",marginBottom:4}}>Add Sage to your home screen</div>
        <div style={{fontSize:12,color:"#5a5650",lineHeight:1.5}}>
          {isIOS ? "Tap the Share button below, then \"Add to Home Screen\" for the full app experience."
                 : "Tap your browser menu → \"Add to Home Screen\" to install Sage like a native app."}
        </div>
      </div>
      <button onClick={onDismiss} style={{background:"transparent",border:"none",color:"#3a3830",fontSize:16,cursor:"pointer",flexShrink:0,lineHeight:1}}>✕</button>
    </div>
  );
}

// ─── SENSITIVE TOPIC MODAL ────────────────────────────────────────────────────
function SensitiveTopicModal({ topicKey, userName, onClose }) {
  const cfg = SENSITIVE_TOPICS[topicKey]?.modal;
  if (!cfg) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(10px)"}}>
      <div style={{maxWidth:480,width:"100%",background:"#0d1512",border:`1px solid ${cfg.borderColor}`,borderRadius:24,padding:"34px 30px",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontSize:34,marginBottom:13}}>{cfg.emoji}</div>
        <h3 style={{fontSize:22,fontWeight:300,color:"#f0ebe3",marginBottom:11,fontFamily:"'Cormorant Garamond',serif",lineHeight:1.2}}>{cfg.title(userName)}</h3>
        <p style={{fontSize:14,color:"#9a9288",lineHeight:1.8,marginBottom:22}}>{cfg.body}</p>
        <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:20}}>
          {cfg.resources.map(r=>(
            <a key={r.name} href={r.url} target="_blank" rel="noreferrer" style={{display:"block",background:`${cfg.color}0f`,border:`1px solid ${cfg.color}2e`,borderRadius:13,padding:"13px 17px",textDecoration:"none"}}>
              <div style={{fontSize:14,color:"#f0ebe3",fontFamily:"'Cormorant Garamond',serif",marginBottom:2}}>{r.name}</div>
              <div style={{fontSize:12,color:cfg.color,fontFamily:"'DM Mono',monospace",marginBottom:1}}>{r.contact}</div>
              <div style={{fontSize:10,color:"#3a3830",fontFamily:"'DM Mono',monospace"}}>{r.available}</div>
            </a>
          ))}
        </div>
        <div style={{background:"rgba(74,158,138,0.06)",border:"1px solid rgba(74,158,138,0.14)",borderRadius:11,padding:"12px 15px",marginBottom:18}}>
          <div style={{fontSize:13,color:"#7abfb0",lineHeight:1.6}}>🌿 <em>Sage will continue supporting your everyday wellness alongside any professional help you pursue.</em></div>
        </div>
        <button onClick={onClose} style={{width:"100%",padding:"12px",borderRadius:36,border:"1px solid rgba(255,255,255,0.09)",background:"transparent",color:"#9a9288",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:12}}>Return to Sage</button>
      </div>
    </div>
  );
}

// ─── UPGRADE MODAL ────────────────────────────────────────────────────────────
function UpgradeModal({ memory, onClose, triggeredByLimit }) {
  const [selected, setSelected] = useState("growth");
  const checkout = () => {
    const url = selected==="bloom" ? STRIPE_BLOOM_URL : STRIPE_GROWTH_URL;
    track("begin_checkout",{plan:selected,triggered_by:triggeredByLimit?"limit":"voluntary"});
    window.open(url,"_blank");
    onClose();
  };
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,backdropFilter:"blur(8px)"}}>
      <div style={{maxWidth:480,width:"100%",background:"linear-gradient(160deg,#0d1a16,#0a0d0f)",border:"1px solid rgba(74,158,138,0.28)",borderRadius:24,padding:"36px 32px",position:"relative"}}>
        <button onClick={onClose} style={{position:"absolute",top:15,right:17,background:"transparent",border:"none",color:"#2a2820",fontSize:18,cursor:"pointer"}}>✕</button>
        <div style={{textAlign:"center",marginBottom:26}}>
          <div style={{fontSize:34,marginBottom:13}}>🌿</div>
          {triggeredByLimit ? (
            <><h2 style={{fontSize:24,fontWeight:300,color:"#f0ebe3",marginBottom:9,fontFamily:"'Cormorant Garamond',serif",lineHeight:1.15}}>{memory.userName?`${memory.userName}, you've`:"You've"} shown up {FREE_LIMIT} times this month.</h2>
            <p style={{fontSize:14,color:"#7a7268",lineHeight:1.7}}>That takes real courage. Sage wants to keep showing up for you — every day, without limits.</p></>
          ) : (
            <><h2 style={{fontSize:24,fontWeight:300,color:"#f0ebe3",marginBottom:9,fontFamily:"'Cormorant Garamond',serif"}}>Go deeper with Sage</h2>
            <p style={{fontSize:14,color:"#7a7268",lineHeight:1.7}}>Unlock unlimited sessions, memory, weekly reports, and proactive check-ins.</p></>
          )}
        </div>
        <div style={{background:"rgba(74,158,138,0.05)",border:"1px solid rgba(74,158,138,0.13)",borderRadius:13,padding:"16px 18px",marginBottom:20}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"9px 12px"}}>
            {[["∞","Unlimited sessions"],["🧠","Persistent memory"],["📊","Weekly reports"],["🔔","Proactive check-ins"],["🌱","Full practices"],["📤","Export journal"]].map(([icon,text])=>(
              <div key={text} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                <div style={{fontSize:13,flexShrink:0}}>{icon}</div>
                <div style={{fontSize:12,color:"#9abfb5",lineHeight:1.4}}>{text}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:18}}>
          {[{key:"growth",label:"Growth",price:"$19",tag:"Most Popular"},{key:"bloom",label:"Bloom",price:"$49",tag:"Full Care"}].map(p=>(
            <button key={p.key} onClick={()=>setSelected(p.key)} style={{padding:"13px 8px",borderRadius:13,cursor:"pointer",textAlign:"center",background:selected===p.key?"rgba(74,158,138,0.13)":"rgba(255,255,255,0.03)",border:selected===p.key?"1.5px solid #4a9e8a":"1.5px solid rgba(255,255,255,0.07)"}}>
              <div style={{fontSize:9,color:"#4a9e8a",fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",marginBottom:3}}>{p.tag}</div>
              <div style={{fontSize:11,color:"#c8c2b9",marginBottom:2}}>{p.label}</div>
              <div style={{fontSize:22,fontWeight:300,color:"#f0ebe3",fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic"}}>{p.price}</div>
              <div style={{fontSize:9,color:"#3a3830",fontFamily:"'DM Mono',monospace"}}>/month</div>
            </button>
          ))}
        </div>
        <button onClick={checkout} style={{width:"100%",padding:"15px",borderRadius:36,border:"none",background:"linear-gradient(135deg,#4a9e8a,#2d6e5f)",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"'DM Mono',monospace",letterSpacing:"0.04em",marginBottom:9}}>Start 7-Day Free Trial →</button>
        <p style={{textAlign:"center",fontSize:10,color:"#1a1810",fontFamily:"'DM Mono',monospace"}}>No credit card required · Cancel anytime</p>
      </div>
    </div>
  );
}

// ─── SESSION COUNTER BAR ──────────────────────────────────────────────────────
function SessionCounterBar({ memory, onUpgrade }) {
  if (isPaid(memory.plan)) return null;
  const left = sessionsLeft(memory);
  const used = memory.monthlySessionCount||0;
  const barColor = left===0?"#e05c5c":left===1?"#e08c3a":"#4a9e8a";
  return (
    <div style={{padding:"8px 24px",borderBottom:"1px solid rgba(255,255,255,0.05)",background:"rgba(0,0,0,0.2)",flexShrink:0}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{fontSize:9,color:barColor,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em"}}>{left===0?"NO SESSIONS REMAINING":`${left}/${FREE_LIMIT} FREE SESSIONS LEFT`}{left===1&&<span style={{color:"#e08c3a"}}> · Last one</span>}</div>
        <button onClick={onUpgrade} style={{fontSize:9,color:"#4a9e8a",fontFamily:"'DM Mono',monospace",background:"transparent",border:"1px solid rgba(74,158,138,0.2)",cursor:"pointer",padding:"2px 9px",borderRadius:7,letterSpacing:"0.06em"}}>UPGRADE →</button>
      </div>
      <div style={{height:2,borderRadius:1,background:"rgba(255,255,255,0.06)"}}>
        <div style={{height:"100%",width:`${(used/FREE_LIMIT)*100}%`,borderRadius:1,background:barColor,transition:"width 0.5s"}} />
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
        {Array.from({length:FREE_LIMIT}).map((_,i)=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:i<used?barColor:"rgba(255,255,255,0.06)",transition:"background 0.3s"}} />)}
      </div>
    </div>
  );
}

// ─── LIMIT OVERLAY ────────────────────────────────────────────────────────────
function LimitOverlay({ memory, onUpgrade }) {
  const resetDate = new Date(new Date().getFullYear(),new Date().getMonth()+1,1).toLocaleDateString("en",{month:"long",day:"numeric"});
  return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:32,flexDirection:"column",textAlign:"center"}}>
      <div style={{maxWidth:380}}>
        <div style={{fontSize:42,marginBottom:16}}>🌿</div>
        <h3 style={{fontSize:24,fontWeight:300,color:"#f0ebe3",marginBottom:11,fontFamily:"'Cormorant Garamond',serif",lineHeight:1.2}}>{memory.userName?`${memory.userName}, you've`:"You've"} completed all {FREE_LIMIT} free sessions this month.</h3>
        <p style={{fontSize:14,color:"#7a7268",lineHeight:1.8,marginBottom:9}}>Showing up {FREE_LIMIT} times takes real commitment. Sage has been here for every one of them.</p>
        <p style={{fontSize:12,color:"#3a3830",lineHeight:1.7,marginBottom:26}}>Upgrade for unlimited sessions, or your free sessions reset on {resetDate}.</p>
        <button onClick={onUpgrade} style={{width:"100%",padding:"15px",borderRadius:36,border:"none",background:"linear-gradient(135deg,#4a9e8a,#2d6e5f)",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"'DM Mono',monospace",letterSpacing:"0.04em",marginBottom:9}}>Unlock Unlimited Sessions →</button>
        <div style={{fontSize:10,color:"#1a1810",fontFamily:"'DM Mono',monospace"}}>Resets {resetDate}</div>
      </div>
    </div>
  );
}

// ─── LEGAL PAGES ─────────────────────────────────────────────────────────────
function LegalPage({ page, onBack }) {
  const content = {
    privacy: {
      title: "Privacy Policy",
      updated: "May 2026",
      sections: [
        { heading:"What We Collect", body:"We collect your email address when you create an account, conversation content during your sessions with Sage, mood check-in data you log voluntarily, and basic usage analytics (pages visited, features used). We do not collect your name, phone number, or payment details — payment is handled entirely by Stripe." },
        { heading:"How We Use Your Data", body:"Your conversation data is used solely to power your Sage sessions and build your persistent memory profile. We never sell your data to third parties. We never use your mental health conversations for advertising. Analytics data is used only to improve the product." },
        { heading:"Data Storage", body:"Account data is stored securely in Firebase (Google Cloud), which is encrypted at rest and in transit. Conversation memory is tied to your account and accessible only by you. We retain your data for as long as your account is active. You can delete your account and all associated data at any time from Settings." },
        { heading:"Mental Health Data", body:"We treat your wellness data with the highest level of sensitivity. Conversation content is processed by Anthropic's Claude API to generate responses. Anthropic's privacy policy governs that processing. We do not store raw conversation text permanently — only extracted memory summaries that you can view and delete in-app." },
        { heading:"Your Rights", body:"You have the right to access all data we hold about you, correct inaccurate data, delete your account and all data, and export your mood history and journal. Exercise these rights through Settings or by emailing us." },
        { heading:"Children", body:"Sage is not intended for users under 18 years of age. We do not knowingly collect data from minors." },
        { heading:"Contact", body:"For privacy questions, contact us at privacy@trysage.app" },
      ]
    },
    terms: {
      title: "Terms of Service",
      updated: "May 2026",
      sections: [
        { heading:"Nature of Service", body:"Sage is an AI wellness coaching application designed to support everyday mental wellness, stress management, and emotional health. Sage is NOT a medical device, licensed therapist, psychologist, or mental health professional. Sage does not provide diagnosis, treatment, or clinical care of any kind." },
        { heading:"Not a Crisis Service", body:"Sage is not equipped to handle mental health crises. If you are experiencing a mental health emergency, suicidal thoughts, or immediate danger, please contact emergency services (911) or a crisis line (988 Suicide & Crisis Lifeline). Do not rely on Sage in emergency situations." },
        { heading:"User Responsibilities", body:"You agree to use Sage only for lawful purposes and in accordance with these Terms. You are responsible for maintaining the confidentiality of your account credentials. You agree not to attempt to reverse-engineer, copy, or redistribute the Sage application." },
        { heading:"Subscription & Billing", body:"Free accounts include 5 sessions per calendar month. Paid subscriptions are billed monthly through Stripe. You may cancel at any time and retain access until the end of your billing period. We do not offer refunds for partial billing periods." },
        { heading:"Limitation of Liability", body:"Sage is provided 'as is' without warranties of any kind. We are not liable for any decisions made based on conversations with Sage. We are not responsible for outcomes related to mental health conditions. Our total liability to you shall not exceed the amount paid in the 3 months prior to any claim." },
        { heading:"Changes to Terms", body:"We may update these Terms from time to time. Continued use of Sage after changes constitutes acceptance of the updated Terms. We will notify users of material changes by email." },
        { heading:"Contact", body:"For questions about these Terms, contact us at legal@trysage.app" },
      ]
    }
  };
  const data = content[page];
  return (
    <div style={{minHeight:"100vh",background:"#0a0d0f",color:"#e8e2d9",fontFamily:"'Cormorant Garamond',Georgia,serif",padding:"60px 24px 80px",maxWidth:680,margin:"0 auto"}}>
      <button onClick={onBack} style={{background:"transparent",border:"none",color:"#4a9e8a",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontSize:12,letterSpacing:"0.06em",marginBottom:32,display:"flex",alignItems:"center",gap:6}}>← Back</button>
      <div style={{fontSize:10,color:"#4a9e8a",fontFamily:"'DM Mono',monospace",letterSpacing:"0.2em",marginBottom:10}}>LEGAL</div>
      <h1 style={{fontSize:38,fontWeight:300,color:"#f0ebe3",marginBottom:8,lineHeight:1.1}}>{data.title}</h1>
      <div style={{fontSize:11,color:"#3a3830",fontFamily:"'DM Mono',monospace",marginBottom:40}}>Last updated: {data.updated}</div>
      {data.sections.map(s=>(
        <div key={s.heading} style={{marginBottom:32}}>
          <h3 style={{fontSize:18,color:"#c8c2b9",marginBottom:10,fontWeight:400}}>{s.heading}</h3>
          <p style={{fontSize:15,color:"#6a6460",lineHeight:1.8}}>{s.body}</p>
        </div>
      ))}
    </div>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({name:"",goal:""});
  const steps = [
    {title:"Welcome to Sage.",sub:"Your AI wellness coach — with memory. I remember everything you share so you never have to repeat yourself.",cta:"Begin →",field:null},
    {title:"What's your name?",sub:"Sage uses this to make sessions feel personal.",cta:"Continue →",field:{key:"name",placeholder:"Your first name",type:"text"}},
    {title:"What brings you here?",sub:"Choose what resonates most right now.",cta:"Meet Sage →",field:{key:"goal",type:"select",options:["Managing anxiety or stress","Processing difficult emotions","Building better habits","Going through a hard time","General mental wellness","Improving relationships"]}},
  ];
  const s = steps[step];
  const canNext = step===0||data[s.field?.key];
  return (
    <div style={{minHeight:"100vh",background:"#0a0d0f",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Cormorant Garamond',Georgia,serif"}}>
      <AmbientBg />
      <div style={{maxWidth:420,width:"100%",textAlign:"center",position:"relative",zIndex:1}}>
        <div style={{display:"flex",gap:5,justifyContent:"center",marginBottom:38}}>
          {steps.map((_,i)=><div key={i} style={{height:3,flex:1,maxWidth:48,borderRadius:2,background:i<=step?"#4a9e8a":"rgba(255,255,255,0.07)",transition:"background 0.4s"}} />)}
        </div>
        <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#4a9e8a,#2d6e5f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,margin:"0 auto 22px"}}>🌿</div>
        <h2 style={{fontSize:"clamp(24px,5vw,38px)",fontWeight:300,color:"#f0ebe3",marginBottom:10,lineHeight:1.1}}>{s.title}</h2>
        <p style={{fontSize:14,color:"#7a7268",lineHeight:1.7,marginBottom:28}}>{s.sub}</p>
        {s.field?.type==="text"&&<input value={data[s.field.key]} onChange={e=>setData({...data,[s.field.key]:e.target.value})} placeholder={s.field.placeholder} style={{width:"100%",padding:"13px 20px",borderRadius:34,fontSize:16,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"#f0ebe3",outline:"none",marginBottom:14,textAlign:"center",fontFamily:"'Cormorant Garamond',serif"}} />}
        {s.field?.type==="select"&&<div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:20}}>{s.field.options.map(opt=><button key={opt} onClick={()=>setData({...data,[s.field.key]:opt})} style={{padding:"11px 18px",borderRadius:34,fontSize:14,cursor:"pointer",background:data[s.field.key]===opt?"rgba(74,158,138,0.15)":"rgba(255,255,255,0.03)",border:data[s.field.key]===opt?"1px solid #4a9e8a":"1px solid rgba(255,255,255,0.07)",color:data[s.field.key]===opt?"#4a9e8a":"#9a9288",fontFamily:"'Cormorant Garamond',serif"}}>{opt}</button>)}</div>}
        <button onClick={()=>{if(step<steps.length-1)setStep(p=>p+1);else onComplete(data);}} disabled={!canNext} style={{width:"100%",padding:"14px",borderRadius:34,border:"none",background:canNext?"#4a9e8a":"rgba(255,255,255,0.06)",color:"#fff",fontSize:14,cursor:canNext?"pointer":"not-allowed",fontFamily:"'DM Mono',monospace",letterSpacing:"0.04em",opacity:canNext?1:0.4}}>{s.cta}</button>
      </div>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}input::placeholder{color:#3a3830}`}</style>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function SageV5() {
  const [authUser, setAuthUser]         = useState(null);
  const [authChecked, setAuthChecked]   = useState(false);
  const [localMode, setLocalMode]       = useState(false);
  const [memory, setMemory]             = useState(()=>freshMemory());
  const [tab, setTab]                   = useState("chat");
  const [messages, setMessages]         = useState([]);
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [onboarded, setOnboarded]       = useState(false);
  const [sensitiveTopic, setSensitiveTopic] = useState(null);
  const [showUpgrade, setShowUpgrade]   = useState(false);
  const [upgradeLimit, setUpgradeLimit] = useState(false);
  const [showCheckIn, setShowCheckIn]   = useState(false);
  const [moodSelected, setMoodSelected] = useState(null);
  const [moodLogged, setMoodLogged]     = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [showExitIntent, setShowExitIntent] = useState(false);
  const [showA2HS, setShowA2HS]         = useState(false);
  const [legalPage, setLegalPage]       = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const memRef         = useRef(memory);
  const exitShown      = useRef(false);
  memRef.current = memory;

  // ── Firebase auth init ──────────────────────────────────────────────────
  useEffect(()=>{
    loadFirebase().then(()=>{
      if (!firebaseAuth) { setAuthChecked(true); return; }
      const { auth, onAuthStateChanged } = firebaseAuth;
      onAuthStateChanged(auth, async user=>{
        if (user) {
          setAuthUser(user);
          const saved = await loadUserData(user.uid);
          if (saved) {
            const mem = saved.monthKey!==getMonthKey() ? {...saved,monthKey:getMonthKey(),monthlySessionCount:0} : saved;
            setMemory(mem); memRef.current=mem;
            if (saved.userName) setOnboarded(true);
          }
        }
        setAuthChecked(true);
      });
    });
  },[]);

  // ── Persist memory ──────────────────────────────────────────────────────
  const updateMemory = useCallback((patch)=>{
    setMemory(prev=>{
      const next={...prev,...patch};
      memRef.current=next;
      if(authUser) saveUserData(authUser.uid,next);
      else { try{localStorage.setItem("sage_local",JSON.stringify(next));}catch{} }
      return next;
    });
  },[authUser]);

  // ── Exit intent ─────────────────────────────────────────────────────────
  useEffect(()=>{
    const handler=(e)=>{
      if(e.clientY<10&&!exitShown.current&&!onboarded){
        exitShown.current=true; setShowExitIntent(true); track("exit_intent_trigger");
      }
    };
    document.addEventListener("mouseleave",handler);
    return ()=>document.removeEventListener("mouseleave",handler);
  },[onboarded]);

  // ── A2HS prompt after 2nd session ───────────────────────────────────────
  useEffect(()=>{
    const shown = localStorage.getItem("sage_a2hs_shown");
    if (!shown && (memory.totalSessionCount||0)===2) {
      setTimeout(()=>setShowA2HS(true),8000);
      localStorage.setItem("sage_a2hs_shown","1");
    }
  },[memory.totalSessionCount]);

  // ── Init session messages ───────────────────────────────────────────────
  useEffect(()=>{
    if(!onboarded) return;
    const mem=memRef.current;
    const returning=(mem.totalSessionCount||0)>0;
    const greeting = mem.pendingCheckIn&&returning ? mem.pendingCheckIn
      : returning ? `Welcome back${mem.userName?`, ${mem.userName}`:""}. 🌿 How are you feeling today?`
      : `Hey${mem.userName?` ${mem.userName}`:""}. I'm Sage. 🌿 I'll remember everything we talk about — you'll never have to start over. What's on your mind?`;
    setMessages([{role:"assistant",content:greeting}]);
    if(mem.pendingCheckIn&&returning){setShowCheckIn(true);updateMemory({pendingCheckIn:null});}
    updateMemory({totalSessionCount:(mem.totalSessionCount||0)+1,lastSessionDate:new Date().toISOString()});
    track("session_start",{session_number:(mem.totalSessionCount||0)+1,plan:mem.plan||"free"});
  },[onboarded]);

  useEffect(()=>{messagesEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);

  const openUpgrade=(fromLimit=false)=>{ setUpgradeLimit(fromLimit); setShowUpgrade(true); track("upgrade_modal_open",{triggered_by:fromLimit?"limit":"voluntary"}); };

  const send=async(text)=>{
    const t=(text||input).trim();
    if(!t||loading)return;
    if(isAtLimit(memRef.current)){openUpgrade(true);return;}
    setInput("");
    const detected=detectSensitiveTopic(t);
    if(detected){setSensitiveTopic(detected);track("sensitive_topic_detected",{category:detected});}
    const next=[...messages,{role:"user",content:t}];
    setMessages(next);setLoading(true);
    const userCount=next.filter(m=>m.role==="user").length;
    if(userCount===1) updateMemory({monthlySessionCount:(memRef.current.monthlySessionCount||0)+1});
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:buildSystemPrompt(memRef.current),messages:next.map(m=>({role:m.role,content:m.content}))})});
      const d=await res.json();
      const reply=d.content?.[0]?.text||"I'm here. Take a breath — tell me more.";
      const withReply=[...next,{role:"assistant",content:reply}];
      setMessages(withReply);
      if(userCount%3===0){
        extractMemory(withReply,memRef.current).then(ex=>{
          if(!ex)return;
          const p={};
          if(ex.importantMoments?.length) p.importantMoments=[...new Set([...(memRef.current.importantMoments||[]),...ex.importantMoments])].slice(-20);
          if(ex.keyThemes?.length) p.keyThemes=ex.keyThemes.slice(0,6);
          if(ex.pendingCheckIn) p.pendingCheckIn=ex.pendingCheckIn;
          if(Object.keys(p).length)updateMemory(p);
        });
      }
      if(!isPaid(memRef.current.plan)&&(memRef.current.monthlySessionCount||0)===FREE_LIMIT-1&&userCount===1){
        setTimeout(()=>openUpgrade(false),3500);
      }
    }catch{setMessages(prev=>[...prev,{role:"assistant",content:"I had trouble connecting. Take a slow breath — try again in a moment. 🌿"}]);}
    setLoading(false);
  };

  const logMood=()=>{
    if(!moodSelected)return;
    const m=MOODS.find(x=>x.val===moodSelected);
    updateMemory({moodHistory:[...(memRef.current.moodHistory||[]).slice(-29),{val:moodSelected,label:m.label,date:new Date().toLocaleDateString("en",{weekday:"short",month:"short",day:"numeric"})}]});
    setMoodLogged(true); send(`My mood: ${m.emoji} ${m.label}`);
    track("mood_logged",{mood:m.label});
  };

  const handleReport=async()=>{
    setGeneratingReport(true);
    const r=await generateReport(memRef.current);
    if(r)updateMemory({weeklyReport:r});
    setGeneratingReport(false);
    track("report_generated");
  };

  const signOut=async()=>{
    if(firebaseAuth){try{await firebaseAuth.signOut(firebaseAuth.auth);}catch{}}
    setAuthUser(null);setMemory(freshMemory());setOnboarded(false);setMessages([]);
    setMoodLogged(false);setMoodSelected(null);setLocalMode(false);
  };

  // ── Legal pages ─────────────────────────────────────────────────────────
  if(legalPage) return <LegalPage page={legalPage} onBack={()=>setLegalPage(null)} />;

  // ── Auth gate ────────────────────────────────────────────────────────────
  if(!authChecked) return (
    <div style={{minHeight:"100vh",background:"#0a0d0f",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <AmbientBg />
      <div style={{fontSize:14,color:"#3a3830",fontFamily:"'DM Mono',monospace",position:"relative",zIndex:1}}>Loading Sage...</div>
    </div>
  );

  if(!authUser&&!localMode) return (
    <>
      {showExitIntent&&<ExitIntentCapture onDismiss={()=>setShowExitIntent(false)} />}
      <AuthScreen onAuth={user=>{setAuthUser(user);}} onLocalMode={()=>{setLocalMode(true);try{const s=localStorage.getItem("sage_local");if(s){const m=JSON.parse(s);setMemory(m);if(m.userName)setOnboarded(true);}}catch{} }} />
    </>
  );

  // ── Onboarding ───────────────────────────────────────────────────────────
  if(!onboarded) return <Onboarding onComplete={d=>{updateMemory({userName:d.name,userGoal:d.goal});setOnboarded(true);track("onboarding_complete");}}/>;

  const atLimit=isAtLimit(memory);
  const navItems=[
    {id:"chat",     icon:"💬",label:"Chat"},
    {id:"memory",   icon:"🧠",label:"Memory",  dot:memory.importantMoments?.length>0},
    {id:"report",   icon:"📊",label:"Report",  locked:!isPaid(memory.plan)},
    {id:"practices",icon:"🌱",label:"Practices"},
    {id:"settings", icon:"⚙️",label:"Settings"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#0a0d0f",color:"#e8e2d9",fontFamily:"'Cormorant Garamond',Georgia,serif",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{`
        @keyframes pulse{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.06);border-radius:4px}
        textarea::placeholder,input::placeholder{color:#3a3830}button{font-family:'Cormorant Garamond',serif}
      `}</style>

      <AmbientBg />

      {/* Modals */}
      {sensitiveTopic&&<SensitiveTopicModal topicKey={sensitiveTopic} userName={memory.userName} onClose={()=>setSensitiveTopic(null)} />}
      {showUpgrade&&<UpgradeModal memory={memory} onClose={()=>setShowUpgrade(false)} triggeredByLimit={upgradeLimit} />}
      {showExitIntent&&<ExitIntentCapture onDismiss={()=>setShowExitIntent(false)} />}
      {showA2HS&&<A2HSPrompt onDismiss={()=>setShowA2HS(false)} />}

      {/* Header */}
      <header style={{position:"relative",zIndex:10,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 24px",borderBottom:"1px solid rgba(255,255,255,0.05)",background:"rgba(10,13,15,0.94)",backdropFilter:"blur(20px)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#4a9e8a,#2d6e5f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>🌿</div>
          <span style={{fontSize:17,fontWeight:300,letterSpacing:"0.06em",color:"#e8e2d9"}}>sage</span>
          {!authUser&&localMode&&<span style={{fontSize:9,color:"#3a3028",fontFamily:"'DM Mono',monospace",marginLeft:2}}>local mode</span>}
          {authUser&&<span style={{fontSize:9,color:"#1a3028",fontFamily:"'DM Mono',monospace",marginLeft:2}}>cloud sync ✓</span>}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{background:isPaid(memory.plan)?"rgba(74,158,138,0.09)":"rgba(90,86,80,0.09)",border:`1px solid ${isPaid(memory.plan)?"rgba(74,158,138,0.22)":"rgba(90,86,80,0.18)"}`,borderRadius:16,padding:"3px 10px",fontSize:9,color:isPaid(memory.plan)?"#4a9e8a":"#3a3830",fontFamily:"'DM Mono',monospace"}}>
            {PLANS[memory.plan||"free"]?.name}{!isPaid(memory.plan)&&` · ${sessionsLeft(memory)}/${FREE_LIMIT}`}
          </div>
          {!isPaid(memory.plan)&&<button onClick={()=>openUpgrade(false)} style={{padding:"3px 11px",borderRadius:16,border:"none",background:"#4a9e8a",color:"#fff",fontSize:9,cursor:"pointer",fontFamily:"'DM Mono',monospace",letterSpacing:"0.04em"}}>Upgrade</button>}
          <div style={{width:26,height:26,borderRadius:"50%",background:"linear-gradient(135deg,#6366f1,#4a9e8a)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",cursor:"pointer"}} onClick={()=>setTab("settings")}>
            {memory.userName?.[0]?.toUpperCase()||"U"}
          </div>
        </div>
      </header>

      <div style={{flex:1,display:"flex",overflow:"hidden",position:"relative",zIndex:1}}>

        {/* Sidebar */}
        <div style={{width:195,flexShrink:0,borderRight:"1px solid rgba(255,255,255,0.05)",display:"flex",flexDirection:"column",padding:"14px 10px",gap:2,background:"rgba(10,13,15,0.6)"}}>
          <div style={{fontSize:8,color:"#1a1810",fontFamily:"'DM Mono',monospace",letterSpacing:"0.14em",marginBottom:6,paddingLeft:9}}>NAVIGATION</div>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>{if(item.locked){openUpgrade(false);return;}setTab(item.id);}} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:10,background:tab===item.id?"rgba(74,158,138,0.1)":"transparent",border:tab===item.id?"1px solid rgba(74,158,138,0.18)":"1px solid transparent",color:tab===item.id?"#4a9e8a":"#3a3830",cursor:"pointer",fontSize:12,width:"100%",textAlign:"left"}}>
              <span>{item.icon}</span><span>{item.label}</span>
              {item.dot&&<div style={{marginLeft:"auto",width:5,height:5,borderRadius:"50%",background:"#4a9e8a"}} />}
              {item.locked&&<span style={{marginLeft:"auto",fontSize:8}}>🔒</span>}
            </button>
          ))}
          <div style={{marginTop:"auto",padding:"10px 9px",borderTop:"1px solid rgba(255,255,255,0.04)"}}>
            <div style={{fontSize:8,color:"#1a1810",fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",marginBottom:3}}>HELLO,</div>
            <div style={{fontSize:15,color:"#7abfb0",fontStyle:"italic",marginBottom:2}}>{memory.userName||"friend"}</div>
            {authUser&&<div style={{fontSize:8,color:"#1a2a20",fontFamily:"'DM Mono',monospace",marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{authUser.email}</div>}
            {!isPaid(memory.plan)&&(
              <div style={{background:"rgba(74,158,138,0.04)",border:"1px solid rgba(74,158,138,0.1)",borderRadius:8,padding:"8px"}}>
                <div style={{fontSize:8,color:"#4a9e8a",fontFamily:"'DM Mono',monospace",marginBottom:3}}>{sessionsLeft(memory)} sessions left</div>
                <div style={{height:2,borderRadius:1,background:"rgba(255,255,255,0.06)"}}>
                  <div style={{height:"100%",width:`${((memory.monthlySessionCount||0)/FREE_LIMIT)*100}%`,borderRadius:1,background:sessionsLeft(memory)<=1?"#e05c5c":"#4a9e8a",transition:"width 0.5s"}} />
                </div>
                <button onClick={()=>openUpgrade(false)} style={{marginTop:6,width:"100%",padding:"5px",borderRadius:6,border:"none",background:"rgba(74,158,138,0.12)",color:"#4a9e8a",fontSize:9,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>Go unlimited →</button>
              </div>
            )}
          </div>
        </div>

        {/* Main */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* ── CHAT ── */}
          {tab==="chat"&&(
            <>
              <SessionCounterBar memory={memory} onUpgrade={()=>openUpgrade(false)} />
              {!moodLogged&&!atLimit&&(
                <div style={{padding:"8px 22px",borderBottom:"1px solid rgba(255,255,255,0.05)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",background:"rgba(0,0,0,0.18)",flexShrink:0}}>
                  <span style={{fontSize:8,color:"#1a1810",fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em"}}>TODAY'S MOOD →</span>
                  {MOODS.map(m=><button key={m.val} onClick={()=>setMoodSelected(m.val)} style={{padding:"3px 9px",borderRadius:14,fontSize:11,cursor:"pointer",background:moodSelected===m.val?`${m.color}1e`:"transparent",border:moodSelected===m.val?`1px solid ${m.color}`:"1px solid rgba(255,255,255,0.06)",color:moodSelected===m.val?m.color:"#2a2820",transition:"all 0.15s"}}>{m.emoji} {m.label}</button>)}
                  {moodSelected&&<button onClick={logMood} style={{padding:"3px 12px",borderRadius:13,border:"none",background:"#4a9e8a",color:"#fff",fontSize:10,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>Log</button>}
                </div>
              )}
              {atLimit ? <LimitOverlay memory={memory} onUpgrade={()=>openUpgrade(true)} /> : (
                <>
                  <div style={{flex:1,overflowY:"auto",padding:"15px 22px",display:"flex",flexDirection:"column",gap:10}}>
                    {showCheckIn&&messages.length<=1&&(
                      <div style={{margin:"0 0 12px",background:"rgba(74,158,138,0.06)",border:"1px solid rgba(74,158,138,0.16)",borderRadius:12,padding:"12px 16px",display:"flex",gap:11,alignItems:"flex-start"}}>
                        <div style={{width:24,height:24,borderRadius:"50%",background:"linear-gradient(135deg,#4a9e8a,#2d6e5f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,flexShrink:0}}>🌿</div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:8,color:"#4a9e8a",fontFamily:"'DM Mono',monospace",letterSpacing:"0.12em",marginBottom:4}}>SAGE IS CHECKING IN</div>
                          <div style={{fontSize:13,color:"#c8c2b9",lineHeight:1.6,marginBottom:8}}>{messages[0]?.content}</div>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={()=>{setShowCheckIn(false);inputRef.current?.focus();}} style={{padding:"4px 13px",borderRadius:14,border:"none",background:"#4a9e8a",color:"#fff",fontSize:10,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>Reply</button>
                            <button onClick={()=>setShowCheckIn(false)} style={{padding:"4px 13px",borderRadius:14,border:"1px solid rgba(255,255,255,0.07)",background:"transparent",color:"#3a3830",fontSize:10,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>Not now</button>
                          </div>
                        </div>
                      </div>
                    )}
                    {messages.map((m,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",alignItems:"flex-end",gap:7,animation:"slideIn 0.2s ease"}}>
                        {m.role==="assistant"&&<div style={{width:24,height:24,borderRadius:"50%",background:"linear-gradient(135deg,#4a9e8a,#2d6e5f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,flexShrink:0}}>🌿</div>}
                        <div style={{maxWidth:"72%",padding:"10px 14px",fontSize:14,lineHeight:1.7,color:"#e8e2d9",borderRadius:m.role==="user"?"15px 15px 4px 15px":"15px 15px 15px 4px",background:m.role==="user"?"rgba(74,158,138,0.16)":"rgba(255,255,255,0.05)",border:m.role==="assistant"?"1px solid rgba(255,255,255,0.06)":"none"}}>{m.content}</div>
                      </div>
                    ))}
                    {loading&&(
                      <div style={{display:"flex",alignItems:"flex-end",gap:7}}>
                        <div style={{width:24,height:24,borderRadius:"50%",background:"linear-gradient(135deg,#4a9e8a,#2d6e5f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10}}>🌿</div>
                        <div style={{padding:"10px 14px",borderRadius:"15px 15px 15px 4px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",gap:4,alignItems:"center"}}>
                          {[0,1,2].map(d=><div key={d} style={{width:5,height:5,borderRadius:"50%",background:"#4a9e8a",animation:"pulse 1.2s infinite",animationDelay:`${d*0.22}s`}} />)}
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  {messages.length<=1&&(
                    <div style={{padding:"0 22px 8px",display:"flex",gap:6,flexWrap:"wrap",flexShrink:0}}>
                      {["I'm feeling anxious","Help me breathe","I can't stop overthinking","I need to vent"].map(p=><button key={p} onClick={()=>send(p)} style={{padding:"5px 12px",borderRadius:15,border:"1px solid rgba(255,255,255,0.07)",background:"transparent",color:"#2a2820",fontSize:12,cursor:"pointer"}}>{p}</button>)}
                    </div>
                  )}
                  <div style={{padding:"9px 22px 18px",display:"flex",gap:8,alignItems:"flex-end",borderTop:"1px solid rgba(255,255,255,0.05)",flexShrink:0}}>
                    <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Share what's on your mind..." rows={1}
                      style={{flex:1,padding:"10px 16px",borderRadius:22,fontSize:14,resize:"none",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#e8e2d9",outline:"none",maxHeight:100,overflowY:"auto",fontFamily:"'Cormorant Garamond',serif",lineHeight:1.5}} />
                    <button onClick={()=>send()} disabled={!input.trim()||loading} style={{width:38,height:38,borderRadius:"50%",border:"none",flexShrink:0,background:input.trim()&&!loading?"#4a9e8a":"rgba(255,255,255,0.06)",color:"#fff",fontSize:15,cursor:input.trim()&&!loading?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center"}}>↑</button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── MEMORY ── */}
          {tab==="memory"&&(
            <div style={{flex:1,overflowY:"auto",padding:"30px 34px"}}>
              <div style={{fontSize:9,color:"#4a9e8a",fontFamily:"'DM Mono',monospace",letterSpacing:"0.2em",marginBottom:9}}>SAGE MEMORY</div>
              <h2 style={{fontSize:30,fontWeight:300,color:"#f0ebe3",marginBottom:6,fontFamily:"'Cormorant Garamond',serif"}}>What Sage remembers</h2>
              <p style={{fontSize:13,color:"#3a3830",marginBottom:26,lineHeight:1.6}}>{authUser?"Synced to your account — accessible on any device.":"Running in local mode — create an account to sync across devices."}</p>
              {!authUser&&<div style={{background:"rgba(74,158,138,0.06)",border:"1px solid rgba(74,158,138,0.15)",borderRadius:12,padding:"14px 18px",marginBottom:22,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:13,color:"#7abfb0"}}>Create an account to keep your memory safe across devices.</div>
                <button onClick={()=>{setOnboarded(false);setLocalMode(false);setMemory(freshMemory());}} style={{padding:"7px 16px",borderRadius:20,border:"none",background:"#4a9e8a",color:"#fff",fontSize:11,cursor:"pointer",fontFamily:"'DM Mono',monospace",flexShrink:0,marginLeft:12}}>Sign Up Free</button>
              </div>}
              <div style={{background:"rgba(74,158,138,0.05)",border:"1px solid rgba(74,158,138,0.13)",borderRadius:13,padding:"18px 22px",marginBottom:14}}>
                <div style={{fontSize:9,color:"#4a9e8a",fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",marginBottom:10}}>PROFILE</div>
                {[["Name",memory.userName||"—"],["Focus",memory.userGoal||"—"],["Plan",PLANS[memory.plan||"free"]?.name],["Sessions",`${memory.monthlySessionCount||0}/${isPaid(memory.plan)?"∞":FREE_LIMIT} this month`],["All-time",memory.totalSessionCount||0]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                    <div style={{fontSize:10,color:"#1a1810",fontFamily:"'DM Mono',monospace"}}>{k}</div>
                    <div style={{fontSize:12,color:"#c8c2b9"}}>{v}</div>
                  </div>
                ))}
              </div>
              {memory.keyThemes?.length>0&&<div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:13,padding:"18px 22px",marginBottom:14}}>
                <div style={{fontSize:9,color:"#3a3830",fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",marginBottom:9}}>THEMES</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{memory.keyThemes.map(t=><div key={t} style={{padding:"3px 11px",borderRadius:14,background:"rgba(74,158,138,0.08)",border:"1px solid rgba(74,158,138,0.16)",fontSize:11,color:"#7abfb0"}}>{t}</div>)}</div>
              </div>}
              {memory.importantMoments?.length>0&&<div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:13,padding:"18px 22px",marginBottom:14}}>
                <div style={{fontSize:9,color:"#3a3830",fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",marginBottom:9}}>WHAT SAGE KNOWS</div>
                {memory.importantMoments.slice(-10).map((m,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:7}}><div style={{width:4,height:4,borderRadius:"50%",background:"#4a9e8a",marginTop:6,flexShrink:0}} /><div style={{fontSize:12,color:"#9a9288",lineHeight:1.5}}>{m}</div></div>)}
              </div>}
              {!memory.importantMoments?.length&&!memory.keyThemes?.length&&<div style={{textAlign:"center",padding:"40px 20px",color:"#2a2820"}}><div style={{fontSize:28,marginBottom:8}}>🧠</div><div style={{fontSize:13,fontStyle:"italic",fontFamily:"'Cormorant Garamond',serif",color:"#2a2820"}}>Chat with Sage and memory builds automatically.</div></div>}
              <button onClick={()=>updateMemory({keyThemes:[],importantMoments:[],weeklyReport:null,pendingCheckIn:null})} style={{marginTop:6,padding:"7px 18px",borderRadius:22,border:"1px solid rgba(229,100,100,0.15)",background:"transparent",color:"#5a2a2a",fontSize:10,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>Clear memory</button>
            </div>
          )}

          {/* ── REPORT ── */}
          {tab==="report"&&(()=>{
            const locked=!isPaid(memory.plan);
            const mh=memory.moodHistory||[];
            const avg=mh.length?(mh.reduce((a,b)=>a+b.val,0)/mh.length).toFixed(1):null;
            return(
              <div style={{flex:1,overflowY:"auto",padding:"30px 34px"}}>
                <div style={{fontSize:9,color:"#4a9e8a",fontFamily:"'DM Mono',monospace",letterSpacing:"0.2em",marginBottom:9}}>EMOTIONAL PATTERNS</div>
                <h2 style={{fontSize:30,fontWeight:300,color:"#f0ebe3",marginBottom:6,fontFamily:"'Cormorant Garamond',serif"}}>Your weekly report</h2>
                <p style={{fontSize:13,color:"#3a3830",marginBottom:24,lineHeight:1.6}}>Plain-language insight written by Sage, just for you.</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
                  {[{l:"Avg Mood",v:avg?`${avg}/5`:"—",i:"📈"},{l:"Check-ins",v:mh.length,i:"📊"},{l:"Sessions",v:memory.totalSessionCount||0,i:"💬"}].map(s=>(
                    <div key={s.l} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"14px",textAlign:"center"}}>
                      <div style={{fontSize:16,marginBottom:3}}>{s.i}</div>
                      <div style={{fontSize:20,fontWeight:300,color:"#4a9e8a",fontStyle:"italic",fontFamily:"'Cormorant Garamond',serif"}}>{s.v}</div>
                      <div style={{fontSize:8,color:"#1a1810",fontFamily:"'DM Mono',monospace",marginTop:2}}>{s.l}</div>
                    </div>
                  ))}
                </div>
                {mh.length>0&&<div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:13,padding:"18px 22px",marginBottom:18}}>
                  <div style={{fontSize:9,color:"#1a1810",fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",marginBottom:12}}>MOOD HISTORY</div>
                  <div style={{display:"flex",gap:4,alignItems:"flex-end",height:60}}>
                    {mh.slice(-14).map((e,i)=>{const m=MOODS.find(x=>x.val===e.val);return(
                      <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                        <div style={{height:`${(e.val/5)*48}px`,width:"100%",maxWidth:28,borderRadius:"2px 2px 0 0",background:`${m?.color}33`,border:`1px solid ${m?.color}44`,transition:"height 0.4s"}} />
                        <div style={{fontSize:10}}>{m?.emoji}</div>
                        <div style={{fontSize:7,color:"#1a1810",fontFamily:"'DM Mono',monospace"}}>{e.date?.slice(0,3)||""}</div>
                      </div>
                    );})}
                  </div>
                </div>}
                {locked?<div style={{background:"rgba(74,158,138,0.05)",border:"1px solid rgba(74,158,138,0.16)",borderRadius:13,padding:"24px",textAlign:"center"}}><div style={{fontSize:26,marginBottom:10}}>📊</div><div style={{fontSize:16,color:"#c8c2b9",fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",marginBottom:7}}>Weekly reports are a Growth feature.</div><div style={{fontSize:12,color:"#3a3830",marginBottom:18,lineHeight:1.6}}>Upgrade to get plain-language AI insights into your emotional patterns every week.</div><button onClick={()=>openUpgrade(false)} style={{padding:"11px 26px",borderRadius:34,border:"none",background:"#4a9e8a",color:"#fff",fontSize:12,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>Unlock Reports →</button></div>
                :memory.weeklyReport?<div style={{background:"rgba(74,158,138,0.05)",border:"1px solid rgba(74,158,138,0.14)",borderRadius:13,padding:"22px"}}><div style={{fontSize:9,color:"#4a9e8a",fontFamily:"'DM Mono',monospace",letterSpacing:"0.1em",marginBottom:10}}>SAGE'S OBSERVATIONS</div><p style={{fontSize:14,color:"#c8c2b9",lineHeight:1.9,fontStyle:"italic",fontFamily:"'Cormorant Garamond',serif"}}>{memory.weeklyReport}</p><button onClick={handleReport} disabled={generatingReport} style={{marginTop:14,padding:"7px 16px",borderRadius:22,border:"1px solid rgba(74,158,138,0.2)",background:"transparent",color:"#4a9e8a",fontSize:10,cursor:"pointer",fontFamily:"'DM Mono',monospace",opacity:generatingReport?0.5:1}}>{generatingReport?"Generating...":"Refresh →"}</button></div>
                :<div style={{textAlign:"center",padding:"28px 20px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:13}}><div style={{fontSize:28,marginBottom:9}}>🌿</div><div style={{fontSize:14,color:"#7a7268",fontStyle:"italic",fontFamily:"'Cormorant Garamond',serif",marginBottom:14}}>{mh.length<1?"Log a mood first, then generate your report.":"Ready for your first report."}</div><button onClick={handleReport} disabled={generatingReport||mh.length<1} style={{padding:"11px 26px",borderRadius:34,border:"none",background:mh.length>=1?"#4a9e8a":"rgba(255,255,255,0.06)",color:"#fff",fontSize:12,cursor:mh.length>=1?"pointer":"not-allowed",fontFamily:"'DM Mono',monospace",opacity:generatingReport?0.6:1}}>{generatingReport?"Generating...":"Generate My Report →"}</button></div>}
              </div>
            );
          })()}

          {/* ── PRACTICES ── */}
          {tab==="practices"&&(
            <div style={{flex:1,overflowY:"auto",padding:"30px 34px"}}>
              <div style={{fontSize:9,color:"#4a9e8a",fontFamily:"'DM Mono',monospace",letterSpacing:"0.2em",marginBottom:9}}>DAILY PRACTICES</div>
              <h2 style={{fontSize:30,fontWeight:300,color:"#f0ebe3",marginBottom:6,fontFamily:"'Cormorant Garamond',serif"}}>Tools for every moment</h2>
              <p style={{fontSize:13,color:"#3a3830",marginBottom:24}}>Evidence-based techniques. Tap any to practice with Sage.</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
                {PRACTICES.map(p=>(
                  <div key={p.title} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"18px 16px"}}>
                    <div style={{fontSize:22,marginBottom:9}}>{p.icon}</div>
                    <div style={{fontSize:16,color:"#e8e2d9",marginBottom:5}}>{p.title}</div>
                    <div style={{fontSize:11,color:"#3a3830",lineHeight:1.7,marginBottom:12}}>{p.desc}</div>
                    <button onClick={()=>{if(atLimit){openUpgrade(true);return;}setTab("chat");setTimeout(()=>send(`Guide me through ${p.title}`),80);}} style={{padding:"6px 14px",borderRadius:14,border:"1px solid rgba(74,158,138,0.22)",background:"transparent",color:"#4a9e8a",fontSize:10,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>Practice with Sage →</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {tab==="settings"&&(
            <div style={{flex:1,overflowY:"auto",padding:"30px 34px",maxWidth:520}}>
              <div style={{fontSize:9,color:"#4a9e8a",fontFamily:"'DM Mono',monospace",letterSpacing:"0.2em",marginBottom:9}}>SETTINGS</div>
              <h2 style={{fontSize:30,fontWeight:300,color:"#f0ebe3",marginBottom:24,fontFamily:"'Cormorant Garamond',serif"}}>Your account</h2>
              {[["Name",memory.userName||"Not set"],["Focus",memory.userGoal||"Not set"],["Email",authUser?.email||"Local mode"],["Plan",PLANS[memory.plan||"free"]?.name],["Sessions this month",`${memory.monthlySessionCount||0} / ${isPaid(memory.plan)?"∞":FREE_LIMIT}`],["Total sessions",memory.totalSessionCount||0],["Memory entries",memory.importantMoments?.length||0],["Monthly reset",new Date(new Date().getFullYear(),new Date().getMonth()+1,1).toLocaleDateString("en",{month:"long",day:"numeric"})]].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                  <div style={{fontSize:9,color:"#1a1010",fontFamily:"'DM Mono',monospace"}}>{k}</div>
                  <div style={{fontSize:12,color:"#c8c2b9",maxWidth:"60%",textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
                </div>
              ))}
              {!isPaid(memory.plan)&&<div style={{marginTop:20,background:"rgba(74,158,138,0.05)",border:"1px solid rgba(74,158,138,0.14)",borderRadius:12,padding:"16px"}}>
                <div style={{fontSize:15,color:"#4a9e8a",marginBottom:5,fontFamily:"'Cormorant Garamond',serif"}}>Upgrade to Growth — $19/month</div>
                <div style={{fontSize:11,color:"#3a3830",lineHeight:1.6,marginBottom:11}}>Unlimited sessions · Memory sync · Weekly reports · Proactive check-ins</div>
                <button onClick={()=>openUpgrade(false)} style={{padding:"10px 24px",borderRadius:34,border:"none",background:"#4a9e8a",color:"#fff",fontSize:11,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>Upgrade Now →</button>
              </div>}
              {/* Legal links */}
              <div style={{marginTop:20,display:"flex",gap:12}}>
                <button onClick={()=>setLegalPage("privacy")} style={{background:"transparent",border:"none",color:"#3a3830",fontSize:10,cursor:"pointer",fontFamily:"'DM Mono',monospace",textDecoration:"underline"}}>Privacy Policy</button>
                <button onClick={()=>setLegalPage("terms")} style={{background:"transparent",border:"none",color:"#3a3830",fontSize:10,cursor:"pointer",fontFamily:"'DM Mono',monospace",textDecoration:"underline"}}>Terms of Service</button>
              </div>
              {/* Sign out / reset */}
              <div style={{marginTop:12,display:"flex",gap:10,flexWrap:"wrap"}}>
                {authUser&&<button onClick={signOut} style={{padding:"7px 16px",borderRadius:22,border:"1px solid rgba(255,255,255,0.08)",background:"transparent",color:"#4a4640",fontSize:10,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>Sign Out</button>}
                <button onClick={()=>{updateMemory(freshMemory({userName:memory.userName,userGoal:memory.userGoal,plan:memory.plan}));setMessages([]);setMoodLogged(false);setMoodSelected(null);}} style={{padding:"7px 16px",borderRadius:22,border:"1px solid rgba(229,100,100,0.14)",background:"transparent",color:"#5a2a2a",fontSize:10,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>Reset data</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer — only visible before onboarding */}
      {!onboarded&&(
        <footer style={{borderTop:"1px solid rgba(255,255,255,0.04)",padding:"16px 24px",display:"flex",justifyContent:"center",gap:20,position:"relative",zIndex:10}}>
          {[["Privacy Policy","privacy"],["Terms of Service","terms"]].map(([label,page])=>(
            <button key={page} onClick={()=>setLegalPage(page)} style={{background:"transparent",border:"none",color:"#2a2820",fontSize:10,cursor:"pointer",fontFamily:"'DM Mono',monospace",letterSpacing:"0.06em"}}>{label}</button>
          ))}
          <span style={{fontSize:10,color:"#1a1810",fontFamily:"'DM Mono',monospace"}}>© 2026 Sage Wellness</span>
        </footer>
      )}
    </div>
  );
}