/*
  OGTT–DM Risk Stratifier (Fresh)

  - Step 1: OGTT indication triggers
  - Step 2: ATP III metabolic syndrome (≥3/5)
  - Step 3: High-risk prognostic marker combinations
  - Step 4: Age-based recommendation for high-risk group

  NOTE: Clinician-facing/educational decision support only.
*/

const $ = (id) => document.getElementById(id);

const state = {
  unitMode: 'US', // 'US' or 'SI'
  baseline: null,
};

// ---------- unit conversions ----------
const conv = {
  // glucose
  mgdl_to_mmol: (mgdl) => mgdl / 18.0,
  mmol_to_mgdl: (mmol) => mmol * 18.0,

  // insulin
  // US conventional in this app = µU/mL (same numeric as mU/L in many contexts for entry)
  // SI in this app = pmol/L
  mU_to_pmol: (mu) => mu * 6.0,     // 1 µU/mL ≈ 6 pmol/L (as used in your original app)
  pmol_to_mU: (pmol) => pmol / 6.0,

  // weight/height
  lb_to_kg: (lb) => lb * 0.45359237,
  kg_to_lb: (kg) => kg / 0.45359237,
  in_to_cm: (inch) => inch * 2.54,
  cm_to_in: (cm) => cm / 2.54,

  // lipids
  tg_mgdl_to_mmol: (mgdl) => mgdl * 0.01129,
  tg_mmol_to_mgdl: (mmol) => mmol / 0.01129,
  hdl_mgdl_to_mmol: (mgdl) => mgdl * 0.02586,
  hdl_mmol_to_mgdl: (mmol) => mmol / 0.02586,

  // HbA1c
  a1c_ifcc_to_percent: (mmolMol) => (0.09148 * mmolMol) + 2.152,
  a1c_percent_to_ifcc: (pct) => (pct - 2.152) / 0.09148,
};

function num(id){
  const el = $(id);
  if(!el) return null;

  let v = el.value;
  if(v === '' || v === null || v === undefined) return null;

  v = String(v).trim().replace(/,/g, '');
  if(!/^\d*\.?\d*$/.test(v)) return null;

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(id){
  const el = $(id);
  return el ? (el.checked === true) : false;
}

function sel(id){
  const el = $(id);
  if(!el) return null;
  const v = el.value;
  return v === '' ? null : v;
}

function round(n, d=2){
  if(n === null || n === undefined || !Number.isFinite(n)) return null;
  const p = Math.pow(10,d);
  return Math.round(n*p)/p;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function setBadge(el, kind, text){
  if(!el) return;
  el.classList.remove('good','warn','bad');
  if(kind) el.classList.add(kind);

  if(text && typeof text === 'object' && typeof text.html === 'string'){
    el.innerHTML = text.html;
  } else {
    el.textContent = text;
  }
}

// ---------- unit flip (convert displayed values when switching modes) ----------
function convertOgttFields(oldMode, newMode){
  if(!oldMode || !newMode || oldMode===newMode) return;
  const gIds = ['g0','g30','g60','g90','g120'];
  const iIds = ['i0','i30','i60','i90','i120'];

  const convertOne = (id, fn, decimals=1)=>{
    const v = num(id);
    if(v===null) return;
    const out = fn(v);
    const r = round(out, decimals);
    const el = $(id);
    if(el) el.value = (r===null ? '' : String(r));
  };

  if(oldMode==='US' && newMode==='SI'){
    gIds.forEach(id => convertOne(id, conv.mgdl_to_mmol, 1));
    iIds.forEach(id => convertOne(id, conv.mU_to_pmol, 1));
  } else if(oldMode==='SI' && newMode==='US'){
    gIds.forEach(id => convertOne(id, conv.mmol_to_mgdl, 1));
    iIds.forEach(id => convertOne(id, conv.pmol_to_mU, 1));
  }
}

function convertBaselineFields(oldMode, newMode){
  if(!oldMode || !newMode || oldMode===newMode) return;

  const convertOne = (id, fn, decimals=1)=>{
    const v = num(id);
    if(v===null) return;
    const out = fn(v);
    const r = round(out, decimals);
    const el = $(id);
    if(el) el.value = (r===null ? '' : String(r));
  };

  // Anthropometrics
  if(oldMode==='US' && newMode==='SI'){
    convertOne('weight', conv.lb_to_kg, 1);
    convertOne('height', conv.in_to_cm, 1);
    convertOne('waist',  conv.in_to_cm, 1);
  } else if(oldMode==='SI' && newMode==='US'){
    convertOne('weight', conv.kg_to_lb, 1);
    convertOne('height', conv.cm_to_in, 1);
    convertOne('waist',  conv.cm_to_in, 1);
  }

  // Lipids
  if(oldMode==='US' && newMode==='SI'){
    convertOne('tg',  conv.tg_mgdl_to_mmol, 2);
    convertOne('hdl', conv.hdl_mgdl_to_mmol, 2);
  } else if(oldMode==='SI' && newMode==='US'){
    convertOne('tg',  conv.tg_mmol_to_mgdl, 1);
    convertOne('hdl', conv.hdl_mmol_to_mgdl, 1);
  }

  // HbA1c: follow unit mode by default (US -> %, SI -> mmol/mol)
  const a1cEl = $('a1c');
  const a1cUnitEl = $('a1cUnit');
  if(a1cEl && a1cUnitEl){
    const a1cVal = num('a1c');
    const curUnit = a1cUnitEl.value || 'percent';

    if(newMode === 'SI'){
      if(curUnit === 'percent'){
        if(a1cVal !== null){
          const ifcc = conv.a1c_percent_to_ifcc(a1cVal);
          const r = round(ifcc, 0);
          a1cEl.value = (r===null ? '' : String(r));
        }
        a1cUnitEl.value = 'ifcc';
      }
    } else if(newMode === 'US'){
      if(curUnit === 'ifcc'){
        if(a1cVal !== null){
          const pct = conv.a1c_ifcc_to_percent(a1cVal);
          const r = round(pct, 1);
          a1cEl.value = (r===null ? '' : String(r));
        }
        a1cUnitEl.value = 'percent';
      }
    }
  }
}

// ---------- calculations ----------
function getInputsCanonical(){
  // Canonical internal units:
  // - glucose: mg/dL
  // - insulin: pmol/L
  // - TG/HDL: mg/dL
  // - weight: kg
  // - height/waist: cm
  const mode = state.unitMode;

  // demographic
  const age = num('age');
  const sex = sel('sex');
  const eth = sel('eth');

  // anthropometrics
  const weightRaw = num('weight');
  const heightRaw = num('height');
  const waistRaw  = num('waist');

  const weightKg = (weightRaw == null) ? null : (mode === 'US' ? conv.lb_to_kg(weightRaw) : weightRaw);
  const heightCm = (heightRaw == null) ? null : (mode === 'US' ? conv.in_to_cm(heightRaw) : heightRaw);
  const waistCm  = (waistRaw  == null) ? null : (mode === 'US' ? conv.in_to_cm(waistRaw) : waistRaw);

  // lipids
  const tgRaw  = num('tg');
  const hdlRaw = num('hdl');
  const tgMgdl  = (tgRaw  == null) ? null : (mode === 'US' ? tgRaw  : conv.tg_mmol_to_mgdl(tgRaw));
  const hdlMgdl = (hdlRaw == null) ? null : (mode === 'US' ? hdlRaw : conv.hdl_mmol_to_mgdl(hdlRaw));

  // BP / A1c
  const sbp = num('sbp');
  const dbp = num('dbp');
  const a1cRaw = num('a1c');
  const a1cUnit = sel('a1cUnit') || 'percent';
  const a1c = (a1cRaw == null) ? null : (a1cUnit === 'ifcc' ? conv.a1c_ifcc_to_percent(a1cRaw) : a1cRaw);
  const bpMeds = sel('bpMeds');

  // risk factors
  const gdm = bool('gdm');
  const pancreatitis = bool('pancreatitis');
  const masld = bool('masld');
  const pcos = bool('pcos');
  const fdr = bool('fdr');

  // OGTT glucose (entered as mg/dL in US mode, mmol/L in SI mode)
  const g0raw = num('g0');
  const g30raw = num('g30');
  const g60raw = num('g60');
  const g90raw = num('g90');
  const g120raw = num('g120');

  const g0 = (g0raw==null)?null:(mode==='US'?g0raw:conv.mmol_to_mgdl(g0raw));
  const g30 = (g30raw==null)?null:(mode==='US'?g30raw:conv.mmol_to_mgdl(g30raw));
  const g60 = (g60raw==null)?null:(mode==='US'?g60raw:conv.mmol_to_mgdl(g60raw));
  const g90 = (g90raw==null)?null:(mode==='US'?g90raw:conv.mmol_to_mgdl(g90raw));
  const g120 = (g120raw==null)?null:(mode==='US'?g120raw:conv.mmol_to_mgdl(g120raw));

  // OGTT insulin (entered as µU/mL in US mode, pmol/L in SI mode)
  const i0raw = num('i0');
  const i30raw = num('i30');
  const i60raw = num('i60');
  const i90raw = num('i90');
  const i120raw = num('i120');

  // ✅ FIX: canonical insulin must be pmol/L
  const i0 = (i0raw==null)?null:(mode==='US'?conv.mU_to_pmol(i0raw):i0raw);
  const i30 = (i30raw==null)?null:(mode==='US'?conv.mU_to_pmol(i30raw):i30raw);
  const i60 = (i60raw==null)?null:(mode==='US'?conv.mU_to_pmol(i60raw):i60raw);
  const i90 = (i90raw==null)?null:(mode==='US'?conv.mU_to_pmol(i90raw):i90raw);
  const i120 = (i120raw==null)?null:(mode==='US'?conv.mU_to_pmol(i120raw):i120raw);

  return {
    mode,
    age, sex, eth,

    // canonical
    weightKg, heightCm, waistCm,
    tgMgdl, hdlMgdl,
    sbp, dbp, a1c, bpMeds,
    gdm, pancreatitis, masld, pcos, fdr,
    g0, g30, g60, g90, g120,
    i0, i30, i60, i90, i120,

    // aliases used by older code / exports (keep backward compatible)
    weight: weightKg,
    height: heightCm,
    waist: waistCm,
    tg: tgMgdl,
    hdl: hdlMgdl,
  };
}

function bmiFromKgCm(kg, cm){
  if(kg == null || cm == null || cm <= 0) return null;
  const m = cm / 100.0;
  return kg / (m*m);
}

function isHighRiskEthnicity(eth){
  return ['African American','Hispanic/Latino','Native American','Asian American'].includes(eth || '');
}

function step1_ogttIndication(x){
  const reasons = [];

  if(x.g0 != null && x.g0 >= 100 && x.g0 < 126) reasons.push('FPG 100–125 mg/dL');
  if(x.a1c != null && x.a1c >= 5.7 && x.a1c <= 6.4) reasons.push('HbA1c 5.7–6.4%');

  if(x.gdm) reasons.push('History of gestational diabetes');
  if(x.pancreatitis) reasons.push('History of pancreatitis');

  const bmi = bmiFromKgCm(x.weightKg, x.heightCm);
  const bmiThresh = (x.eth === 'Asian American') ? 23 : 25;
  const hasBmiTrigger = (bmi != null && bmi >= bmiThresh);

  const hasHTN = (
    (x.sbp != null && x.dbp != null && (x.sbp >= 130 || x.dbp >= 80)) ||
    x.bpMeds === 'yes'
  );

  const hasDyslipidemia = (
    (x.hdlMgdl != null && x.hdlMgdl < 35) ||
    (x.tgMgdl != null && x.tgMgdl > 250)
  );

  if(hasBmiTrigger && (x.masld || hasHTN || hasDyslipidemia || x.pcos || x.fdr || isHighRiskEthnicity(x.eth))) {
    const extras = [];
    if(x.masld) extras.push('MASLD');
    if(hasHTN) extras.push('Hypertension ≥130/80 mm Hg or on treatment');
    if(hasDyslipidemia) extras.push('Dyslipidemia (HDL <35 mg/dL and/or triglycerides >250 mg/dL)');
    if(x.pcos) extras.push('PCOS');
    if(x.fdr) extras.push('First-degree relative with T2D');
    if(isHighRiskEthnicity(x.eth)) extras.push('High-risk ethnicity');
    reasons.push(`BMI ≥${bmiThresh} kg/m² plus one or more of the following:`);
    extras.forEach(e => reasons.push(e));
  }

  const indicated = reasons.length > 0;

  return {
    indicated,
    reasons,
    bmi,
    bmiThresh,
    detail: { hasBmiTrigger, hasHTN, hasDyslipidemia }
  };
}

function step2_metabolicSyndrome(x){
  const met = [];
  const notMet = [];
  const unknown = [];

  // waist
  if(x.sex == null || x.waistCm == null){
    unknown.push('Waist circumference');
  } else {
    const ok = (x.sex === 'M' ? x.waistCm > 102 : x.waistCm > 88);
    (ok ? met : notMet).push('Waist circumference');
  }

  // TG
  if(x.tgMgdl == null) unknown.push('Triglycerides');
  else (x.tgMgdl >= 150 ? met : notMet).push('Triglycerides');

  // HDL
  if(x.sex == null || x.hdlMgdl == null) unknown.push('HDL');
  else {
    const ok = (x.sex === 'M' ? x.hdlMgdl < 40 : x.hdlMgdl < 50);
    (ok ? met : notMet).push('HDL');
  }

  // BP
  const onTx = x.bpMeds === 'yes';
  if(onTx){
    met.push('Blood pressure');
  } else if(x.sbp == null || x.dbp == null){
    unknown.push('Blood pressure');
  } else {
    const ok = (x.sbp >= 130 || x.dbp >= 85);
    (ok ? met : notMet).push('Blood pressure');
  }

  // FPG
  if(x.g0 == null) unknown.push('Fasting glucose');
  else (x.g0 >= 100 ? met : notMet).push('Fasting glucose');

  const count = met.length;
  const complete = (unknown.length === 0);
  const present = (count >= 3) && complete;
  const maybePresent = (count >= 3) && !complete;

  return { count, present, maybePresent, complete, met, notMet, unknown };
}

function calc_igi(x){
  // IGI = (I30 - I0) / (G30 - G0)
  // Use US conventional units:
  // - glucose mg/dL (canonical already)
  // - insulin µU/mL (convert pmol/L -> µU/mL by /6)
  if(x.i0 == null || x.i30 == null || x.g0 == null || x.g30 == null) return null;
  const i0_u = conv.pmol_to_mU(x.i0);
  const i30_u = conv.pmol_to_mU(x.i30);
  const dI = i30_u - i0_u;
  const dG = x.g30 - x.g0;
  if(dG === 0) return null;
  return dI / dG;
}

function calc_pg_auc_weighted(x){
  // (PG0 + 2×PG30 + 3×PG60 + 2×PG120) / 4
  if(x.g0 == null || x.g30 == null || x.g60 == null || x.g120 == null) return null;
  return (x.g0 + 2*x.g30 + 3*x.g60 + 2*x.g120) / 4;
}

function calc_matsuda(x){
  // Matsuda: 10,000 / sqrt( (G0 * I0) * (Gmean * Imean) )
  // Using glucose mg/dL and insulin µU/mL.
  const gVals = [x.g0, x.g30, x.g60, x.g90, x.g120].filter(v => v != null);
  const iValsPmol = [x.i0, x.i30, x.i60, x.i90, x.i120].filter(v => v != null);

  if(x.g0 == null || x.i0 == null) return null;
  if(gVals.length < 2 || iValsPmol.length < 2) return null;

  const iValsU = iValsPmol.map(v => conv.pmol_to_mU(v));

  const gMean = gVals.reduce((a,b)=>a+b,0) / gVals.length;
  const iMean = iValsU.reduce((a,b)=>a+b,0) / iValsU.length;

  const i0u = conv.pmol_to_mU(x.i0);
  const denom = Math.sqrt((x.g0 * i0u) * (gMean * iMean));
  if(!Number.isFinite(denom) || denom <= 0) return null;
  return 10000 / denom;
}

function calc_homa_ir(x){
  // HOMA-IR = (G0 [mg/dL] × I0 [µU/mL]) / 405
  if(x.g0 == null || x.i0 == null) return null;
  const i0u = conv.pmol_to_mU(x.i0);
  return (x.g0 * i0u) / 405.0;
}

function calc_di(x){
  const m = calc_matsuda(x);
  const igi = calc_igi(x);
  if(m == null || igi == null) return null;
  return m * igi;
}

function calc_stumvoll1(x){
  // 1283 + (1.829 × I30[pmoil/L]) – (138.7 × G30[mmol/L]) + (3.772 × I0[pmol/L])
  if(x.i0 == null || x.i30 == null || x.g30 == null) return null;
  const g30_mmol = x.g30 / 18;
  const i30_pmol = x.i30;
  const i0_pmol = x.i0;
  return 1283 + (1.829 * i30_pmol) - (138.7 * g30_mmol) + (3.772 * i0_pmol);
}

// ✅ UPDATED: includes diabetes-range flags so IFG/IGT display correctly
function step3_highRisk(x, metsRes){
  const g0 = x.g0;
  const g60 = x.g60;
  const g120 = x.g120;

  // Prediabetes labels
  const ifg = (g0 != null && g0 >= 100 && g0 < 126);
  const igt = (g120 != null && g120 >= 140 && g120 < 200);

  // Diabetes-range flags
  const diabetesFasting = (g0 != null && g0 >= 126);
  const diabetes2hr     = (g120 != null && g120 >= 200);

  const oneHr = (g60 != null && g60 > 155);

  const a1c6064 = (x.a1c != null && x.a1c >= 6.0 && x.a1c <= 6.4);

  const igi = calc_igi(x);
  const igiLow = (igi != null && igi <= 0.82);

  const stum1 = calc_stumvoll1(x);
  const stumLow = (stum1 != null && stum1 <= 899);

  const metsPresent = !!(metsRes && metsRes.present);
  const metsKnown   = !!(metsRes && metsRes.complete);

  const triggers = [];

  // Step 3 combinations (unchanged)
  if(igt && oneHr && metsPresent) triggers.push('IGT + 1-hour PG >155 mg/dL + metabolic syndrome');
  if(ifg && igt) triggers.push('Combined IFG and IGT');
  if(ifg && oneHr && metsPresent) triggers.push('IFG + 1-hour PG >155 mg/dL + metabolic syndrome');
  if((igt || ifg) && oneHr && a1c6064) triggers.push('IGT or IFG + 1-hour PG >155 mg/dL + HbA1c 6.0–6.4%');

  if((igt || ifg) && oneHr && (igiLow || stumLow)) {
    const sub = [];
    if(igiLow) sub.push('IGI ≤0.82');
    if(stumLow) sub.push('1st-phase ≤899 pmol/L');
    triggers.push(`IGT or IFG + 1-hour PG >155 mg/dL + ${sub.join(' and ')}`);
  }

  const anyHighRisk = triggers.length > 0;
  const status = anyHighRisk ? 'HIGH_RISK' : 'NOT_HIGH_RISK';

  return {
    status,
    triggers,
    ifg, igt,
    diabetesFasting, diabetes2hr,
    oneHr,
    a1c6064,
    igi, igiLow,
    stum1, stumLow,
    metsPresent, metsKnown,
  };
}

function step4_recommendation(x, step3){
  if(step3.status !== 'HIGH_RISK'){
    return { applicable:false, badge:{kind:null,text:'Not applicable'}, text:'Not in high-risk group based on Step 3 criteria.' };
  }
  if(x.age == null) return { applicable:true, badge:{kind:'warn',text:'Age needed'}, text:'Enter age to apply Step 4.' };

  if(x.age < 40) {
    return { applicable:true, badge:{kind:'bad',text:'<40'}, text:'Age <40 years — Not a candidate (high risk).' };
  }
  if(x.age >= 40 && x.age <= 49) {
    return { applicable:true, badge:{kind:'warn',text:'40–49'}, text:'Age 40–49 years — Consider only if able to reverse high-risk prognostic markers with weight loss on repeat OGTT.' };
  }
  return { applicable:true, badge:{kind:'good',text:'≥50'}, text:'Age ≥50 years — Can be accepted after risk mitigation with 5–10% weight loss.' };
}

// ---------- UI ----------
function updateUnitLabels(){
  const mode = state.unitMode;

  const unitLabel = $('unitLabel');
  if(unitLabel) unitLabel.textContent = mode;

  const wL = $('weightLabel'); if(wL) wL.textContent = `Weight (${mode === 'US' ? 'lb' : 'kg'})`;
  const hL = $('heightLabel'); if(hL) hL.textContent = `Height (${mode === 'US' ? 'in' : 'cm'})`;
  const wcL = $('waistLabel'); if(wcL) wcL.textContent = `Waist circumference (${mode === 'US' ? 'in' : 'cm'})`;

  const tgL = $('tgLabel'); if(tgL) tgL.textContent = `Triglycerides (${mode === 'US' ? 'mg/dL' : 'mmol/L'})`;
  const hdlL = $('hdlLabel'); if(hdlL) hdlL.textContent = `HDL (${mode === 'US' ? 'mg/dL' : 'mmol/L'})`;

  const a1cUnitEl = $('a1cUnit');
  const a1cUnit = a1cUnitEl ? (a1cUnitEl.value || 'percent') : 'percent';
  const a1cLabel = $('a1cLabel');
  if(a1cLabel) a1cLabel.textContent = `HbA1c (${a1cUnit === 'ifcc' ? 'mmol/mol' : '%'})`;

  const gluL = $('gluLabel'); if(gluL) gluL.textContent = `Glucose (${mode === 'US' ? 'mg/dL' : 'mmol/L'})`;
  const insL = $('insLabel'); if(insL) insL.textContent = `Insulin (${mode === 'US' ? 'µU/mL' : 'pmol/L'})`;

  const unitPill = $('unitPill');
  if(unitPill) unitPill.innerHTML = `Units: <b id="unitLabel">${mode}</b>`;

  try{
    const w = $('weight'), h = $('height'), wc = $('waist');
    if(w) w.placeholder  = (mode==='US' ? 'lb' : 'kg');
    if(h) h.placeholder  = (mode==='US' ? 'in' : 'cm');
    if(wc) wc.placeholder = (mode==='US' ? 'in' : 'cm');
  }catch(e){}
}

function toast(msg){
  const t = $('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  window.setTimeout(()=>t.classList.remove('show'), 1200);
}

function buildSummary(x, step1, step2, step3, step4){
  const bmi = step1.bmi;
  const metsStr = step2.complete
    ? (step2.present ? `PRESENT (${step2.count}/5)` : `ABSENT (${step2.count}/5)`)
    : `UNKNOWN (${step2.count}/5 met; missing: ${step2.unknown.join(', ') || '—'})`;

  const igiStr = (step3.igi == null) ? '—' : `${round(step3.igi,2)}${step3.igiLow ? ' (≤0.82)' : ''}`;
  const stumStr = (step3.stum1 == null) ? '—' : `${round(step3.stum1,0)}${step3.stumLow ? ' (≤899)' : ''}`;

  const pgauc = calc_pg_auc_weighted(x);
  const matsuda = calc_matsuda(x);
  const homa = calc_homa_ir(x);
  const di = calc_di(x);

  const lines = [];
  lines.push('OGTT–DM Risk Stratifier');
  lines.push('—');
  if(x.age != null) lines.push(`Age: ${x.age}`);
  if(bmi != null) lines.push(`BMI: ${round(bmi,1)} kg/m²`);
  lines.push('');

  lines.push(`Step 1 (OGTT indication): ${step1.indicated ? 'YES' : 'NO'}`);
  if(step1.indicated) lines.push(`Reasons: ${step1.reasons.join('; ')}`);
  else lines.push('Reasons: No Step 1 criteria met based on current inputs.');

  lines.push('');
  lines.push(`Step 2 (Metabolic syndrome): ${metsStr}`);

  lines.push('');
  lines.push(`Step 3 (High-risk prognostic markers): ${step3.status === 'HIGH_RISK' ? 'HIGH RISK' : 'Not high-risk'}`);
  if(step3.status === 'HIGH_RISK') lines.push(`Triggered findings: ${step3.triggers.join('; ')}`);
  else lines.push('Triggered findings: No Step 3 markers triggered based on current inputs.');

  lines.push('');
  lines.push('Calculated indices:');
  lines.push(`- IFG: ${x.g0==null ? 'Unknown' : (step3.diabetesFasting ? 'Diabetes-range fasting (≥126 mg/dL)' : (step3.ifg ? 'Yes' : 'No'))}`);
  lines.push(`- IGT: ${x.g120==null ? 'Unknown' : (step3.diabetes2hr ? 'Diabetes-range 2-hour (≥200 mg/dL)' : (step3.igt ? 'Yes' : 'No'))}`);
  lines.push(`- 1-hour PG >155 mg/dL: ${x.g60==null ? 'Unknown' : (step3.oneHr ? 'Yes' : 'No')}`);
  lines.push(`- IGI: ${igiStr}`);
  lines.push(`- Matsuda index: ${matsuda==null ? '—' : round(matsuda,2)}`);
  lines.push(`- HOMA-IR: ${homa==null ? '—' : round(homa,2)}`);
  lines.push(`- Disposition Index (DI): ${di==null ? '—' : round(di,2)}`);
  lines.push(`- PG AUC (weighted): ${pgauc==null ? '—' : round(pgauc,1)}`);
  lines.push(`- Stumvoll 1st-phase: ${stumStr}`);

  lines.push('');
  lines.push('Step 4 recommendation:');
  lines.push(step4.text);

  lines.push('');
  lines.push('Note: IFG and IGT are defined only for the prediabetes range (fasting 100–125 mg/dL; 2-hour 140–199 mg/dL).');
  lines.push('If fasting glucose is ≥126 mg/dL and/or 2-hour glucose is ≥200 mg/dL, interpret as diabetes-range rather than IFG/IGT.');

  lines.push('');
  lines.push('Disclaimer: Clinical decision support/education tool. No patient data are stored. Use clinical judgment.');

  lines.push('');
  lines.push('Build v5-2026-02-24');
  lines.push('Designed by Katafan Achkar, MD, FASN. Development assistance: ChatGPT (OpenAI).');

  return lines.join('\n');
}

function render(){
  updateUnitLabels();

  const x = getInputsCanonical();

  // Step 1
  const step1 = step1_ogttIndication(x);
  const bmi = step1.bmi;

  if(bmi == null){
    setBadge($('bmiBadge'), null, {html: 'BMI: <span class="bmiNum">—</span>'});
  } else {
    const k = (bmi >= 30) ? 'bad' : (bmi >= 25 ? 'warn' : 'good');
    setBadge($('bmiBadge'), k, {html: `BMI: <span class="bmiNum">${round(bmi,1)}</span> <span class="bmiUnit">kg/m²</span>`});
  }

  setBadge($('step1Badge'), step1.indicated ? 'warn' : 'good', step1.indicated ? 'YES' : 'NO');
  const step1Reasons = $('step1Reasons');
  if(step1Reasons){
    step1Reasons.innerHTML = step1.indicated
      ? `<ul>${step1.reasons.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul>`
      : `<div class="hint">No Step 1 indication criteria met based on current inputs.</div>`;
  }

  // Step 2
  const step2 = step2_metabolicSyndrome(x);
  const step2Text = step2.complete
    ? (step2.present ? `Present (${step2.count}/5)` : `Not present (${step2.count}/5)`)
    : `Incomplete (${step2.count}/5 met)`;
  setBadge($('step2Badge'), step2.complete ? (step2.present ? 'bad' : 'good') : 'warn', step2Text);

  const metsDetail = $('metsDetail');
  if(metsDetail){
    const parts = [];
    parts.push(`<div class="hint"><b>${step2.count}/5</b> criteria met${step2.complete ? '' : ' (incomplete)'}.</div>`);
    if(step2.met.length) parts.push(`<div class="hint">Met: ${escapeHtml(step2.met.join(', '))}</div>`);
    if(step2.notMet.length) parts.push(`<div class="hint">Not met: ${escapeHtml(step2.notMet.join(', '))}</div>`);
    if(step2.unknown.length) parts.push(`<div class="hint">Missing: ${escapeHtml(step2.unknown.join(', '))}</div>`);
    metsDetail.innerHTML = parts.join('');
  }

  // Step 3
  const step3 = step3_highRisk(x, step2);
  setBadge($('step3Badge'), step3.status === 'HIGH_RISK' ? 'bad' : 'good', step3.status === 'HIGH_RISK' ? 'HIGH RISK' : 'Not high-risk');

  const step3Detail = $('step3Detail');
  if(step3Detail){
    const s3 = [];
    s3.push(`<div class="hint">IFG: <b>${x.g0==null?'Unknown':(step3.diabetesFasting?'Diabetes-range':(step3.ifg?'Yes':'No'))}</b> · IGT: <b>${x.g120==null?'Unknown':(step3.diabetes2hr?'Diabetes-range':(step3.igt?'Yes':'No'))}</b> · 1-h PG >155: <b>${x.g60==null?'Unknown':(step3.oneHr?'Yes':'No')}</b> · MetS: <b>${step2.complete ? (step2.present?'Yes':'No') : 'Unknown'}</b> · A1c 6.0–6.4: <b>${step3.a1c6064 ? 'Yes' : (x.a1c==null?'Unknown':'No')}</b></div>`);
    if(step3.triggers.length){
      s3.push(`<ul>${step3.triggers.map(t=>`<li>${escapeHtml(t)}</li>`).join('')}</ul>`);
    } else {
      s3.push(`<div class="hint">No Step 3 markers triggered based on current inputs.</div>`);
    }
    s3.push(`<div class="hint">Stumvoll 1st-phase uses: 1283 + (1.829×I30) − (138.7×G30) + (3.772×I0), with insulin in pmol/L and G30 in mmol/L.</div>`);
    step3Detail.innerHTML = s3.join('');
  }

  // Step 4
  const step4 = step4_recommendation(x, step3);
  setBadge($('step4Badge'), step4.badge.kind, step4.badge.text);
  const step4Detail = $('step4Detail');
  if(step4Detail) step4Detail.textContent = step4.text;

  // top risk badge
  setBadge($('riskBadge'), step3.status === 'HIGH_RISK' ? 'bad' : 'good', step3.status === 'HIGH_RISK' ? 'High risk' : 'Not high-risk');

  // indices
  const igiEl = $('igi'); if(igiEl) igiEl.textContent = (step3.igi == null) ? '—' : `${round(step3.igi,2)}${step3.igiLow ? ' (≤0.82)' : ''}`;
  const stumEl = $('stum1'); if(stumEl) stumEl.textContent = (step3.stum1 == null) ? '—' : `${round(step3.stum1,0)}${step3.stumLow ? ' (≤899)' : ''}`;

  const pgauc = calc_pg_auc_weighted(x);
  const matsuda = calc_matsuda(x);
  const homa = calc_homa_ir(x);
  const di = calc_di(x);

  const pgaucEl = $('pgauc'); if(pgaucEl) pgaucEl.textContent = (pgauc == null) ? '—' : `${round(pgauc,1)}`;
  const matsEl = $('matsuda'); if(matsEl) matsEl.textContent = (matsuda == null) ? '—' : `${round(matsuda,2)}`;
  const homaEl = $('homa'); if(homaEl) homaEl.textContent = (homa == null) ? '—' : `${round(homa,2)}`;
  const diEl = $('di'); if(diEl) diEl.textContent = (di == null) ? '—' : `${round(di,2)}`;

  // ✅ robust output setters (prevents — if ids changed)
  function setTextAny(ids, text){
    for(const id of ids){
      const el = $(id);
      if(el){ el.textContent = text; return true; }
    }
    return false;
  }

  const ifgText =
    (x.g0 == null) ? 'Unknown' :
    (step3.diabetesFasting ? 'Diabetes-range fasting (≥126 mg/dL)' :
      (step3.ifg ? 'Yes' : 'No'));

  const igtText =
    (x.g120 == null) ? 'Unknown' :
    (step3.diabetes2hr ? 'Diabetes-range 2-hour (≥200 mg/dL)' :
      (step3.igt ? 'Yes' : 'No'));

  const oneHrText = (x.g60 == null) ? 'Unknown' : (step3.oneHr ? 'Yes' : 'No');
  const metsText = step2.complete ? (step2.present ? 'Yes' : 'No') : 'Unknown';

  setTextAny(['ifg','ifgVal','ifgOut'], ifgText);
  setTextAny(['igt','igtVal','igtOut'], igtText);
  setTextAny(['onehr','oneHr','onehrVal','onehrOut'], oneHrText);
  setTextAny(['mets','ms','metS','metsVal','metsOut'], metsText);

  // summary
  const summaryEl = $('summary');
  if(summaryEl) summaryEl.textContent = buildSummary(x, step1, step2, step3, step4);
}

// ---------- persistence helpers ----------
function snapshot(){
  const ids = [
    'age','sex','eth','weight','height','waist','tg','hdl','a1c','a1cUnit','sbp','dbp','bpMeds',
    'gdm','pancreatitis','masld','pcos','fdr',
    'g0','g30','g60','g90','g120','i0','i30','i60','i90','i120'
  ];
  const out = { unitMode: state.unitMode, v: {} };
  ids.forEach(id => {
    const el = $(id);
    if(!el) return;
    if(el.type === 'checkbox') out.v[id] = el.checked;
    else out.v[id] = el.value;
  });
  return out;
}

function applySnapshot(snap){
  if(!snap || !snap.v) return;
  if(snap.unitMode) {
    state.unitMode = snap.unitMode;
    const um = $('unitMode'); if(um) um.value = snap.unitMode;
  }
  Object.entries(snap.v).forEach(([id,val])=>{
    const el = $(id);
    if(!el) return;
    if(el.type === 'checkbox') el.checked = !!val;
    else el.value = val;
  });
}

function saveToLocal(key, obj){
  localStorage.setItem(key, JSON.stringify(obj));
}

function loadFromLocal(key){
  try{
    const s = localStorage.getItem(key);
    if(!s) return null;
    return JSON.parse(s);
  } catch { return null; }
}

// ---------- CSV EXPORT (clean + no Summary) ----------
function normalizeForCsv(s){
  if(s===null || s===undefined) return '';
  return String(s)
    .replace(/\u2265/g, '>=')          // ≥
    .replace(/[\u2013\u2014]/g, '-')   // en/em dash
    .replace(/\u00a0/g, ' ');          // non-breaking space
}

function csvEscape(v){
  const s = (v===null || v===undefined) ? '' : String(v);
  if(/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}

function downloadTextFile(filename, mime, content){
  const BOM = '\ufeff';
  const payload = (mime && mime.indexOf('text/csv') === 0) ? (BOM + content) : content;
  const blob = new Blob([payload], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 1500);
}

function buildCsvRow(){
  const x = getInputsCanonical();

  const MODE = String(state.unitMode || '').trim().toUpperCase();
  const A1C_UNIT_SEL = String(sel('a1cUnit') || 'percent').trim().toLowerCase();

  const step1 = step1_ogttIndication(x);
  const bmi = step1 ? step1.bmi : null;
  const step2 = step2_metabolicSyndrome(x);
  const step3 = step3_highRisk(x, step2);
  const step4 = step4_recommendation(x, step3);

  // calculated indices
  const IGI = calc_igi(x);
  const STUMVOLL_1ST_PHASE = calc_stumvoll1(x);
  const PG_AUC_WEIGHTED = calc_pg_auc_weighted(x);
  const MATSUDA = calc_matsuda(x);
  const HOMA_IR = calc_homa_ir(x);
  const DI = calc_di(x);

  // identifiers
  const NAME = $('ptName') ? String($('ptName').value || '').trim() : '';
  const MRN  = $('ptMRN') ? String($('ptMRN').value || '').trim() : '';
  const DOB  = $('ptDOB') ? String($('ptDOB').value || '').trim() : '';
  const OGTT_TEST_DATE = $('testDate') ? String($('testDate').value || '').trim() : '';
  const VISIT_TYPE = $('visitType') ? String($('visitType').value || '').trim() : '';
  const ORDERING_PROVIDER = $('orderingProvider') ? String($('orderingProvider').value || '').trim() : '';

  // raw typed values (exactly as entered on screen)
  const WEIGHT_RAW = $('weight') ? String($('weight').value || '').trim() : '';
  const HEIGHT_RAW = $('height') ? String($('height').value || '').trim() : '';
  const WAIST_RAW  = $('waist') ? String($('waist').value || '').trim() : '';
  const TG_RAW     = $('tg') ? String($('tg').value || '').trim() : '';
  const HDL_RAW    = $('hdl') ? String($('hdl').value || '').trim() : '';
  const A1C_RAW    = $('a1c') ? String($('a1c').value || '').trim() : '';

  const G0_RAW   = $('g0')   ? String($('g0').value   || '').trim() : '';
  const G30_RAW  = $('g30')  ? String($('g30').value  || '').trim() : '';
  const G60_RAW  = $('g60')  ? String($('g60').value  || '').trim() : '';
  const G90_RAW  = $('g90')  ? String($('g90').value  || '').trim() : '';
  const G120_RAW = $('g120') ? String($('g120').value || '').trim() : '';

  const I0_RAW   = $('i0')   ? String($('i0').value   || '').trim() : '';
  const I30_RAW  = $('i30')  ? String($('i30').value  || '').trim() : '';
  const I60_RAW  = $('i60')  ? String($('i60').value  || '').trim() : '';
  const I90_RAW  = $('i90')  ? String($('i90').value  || '').trim() : '';
  const I120_RAW = $('i120') ? String($('i120').value || '').trim() : '';

  const RECOMMENDATION = normalizeForCsv(step4 ? step4.text : '');
  const HIGH_RISK_TRIGGERS = normalizeForCsv(step3 && step3.triggers ? step3.triggers.join(' | ') : '');

  const row = {
    OGTT_TEST_DATE,
    UNIT_MODE: state.unitMode || '',
    NAME,
    MRN,
    DOB,
    VISIT_TYPE,
    ORDERING_PROVIDER,

    AGE_YEARS: x.age,
    SEX: x.sex,
    ETHNICITY: x.eth,

    WEIGHT_RAW,
    HEIGHT_RAW,
    WAIST_RAW,

    WEIGHT_KG: x.weightKg,
    HEIGHT_CM: x.heightCm,
    WAIST_CM: x.waistCm,
    BMI: bmi,

    SBP: x.sbp,
    DBP: x.dbp,
    BP_MEDS: x.bpMeds,

    TG_RAW,
    HDL_RAW,
    TG: x.tgMgdl,
    HDL: x.hdlMgdl,

    // A1c exported exactly as entered + unit label
    A1C: A1C_RAW,
    A1C_UNITS: (A1C_UNIT_SEL === 'ifcc') ? 'mmol/mol' : '%',

    // OGTT exported exactly as entered (prevents unit flipping)
    G0: G0_RAW, G30: G30_RAW, G60: G60_RAW, G90: G90_RAW, G120: G120_RAW,
    I0: I0_RAW, I30: I30_RAW, I60: I60_RAW, I90: I90_RAW, I120: I120_RAW,

    GLUCOSE_UNITS: (MODE === 'SI') ? 'mmol/L' : 'mg/dL',
    INSULIN_UNITS: (MODE === 'SI') ? 'pmol/L' : 'µU/mL',

    // Computed indices
    IGI,
    STUMVOLL_1ST_PHASE,
    PG_AUC_WEIGHTED,
    MATSUDA,
    HOMA_IR,
    DI,

    METS_COUNT: step2 ? step2.count : '',
    METS_PRESENT: step2 ? step2.present : '',

    IFG: step3 ? step3.ifg : '',
    IGT: step3 ? step3.igt : '',
    DIABETES_FASTING: step3 ? step3.diabetesFasting : '',
    DIABETES_2HR: step3 ? step3.diabetes2hr : '',
    ONE_HR_PG_GT_155: step3 ? step3.oneHr : '',
    A1C_6_0_TO_6_4: step3 ? step3.a1c6064 : '',
    IGI_LOW: step3 ? step3.igiLow : '',
    STUMVOLL1_LOW: step3 ? step3.stumLow : '',
    HIGH_RISK_STATUS: step3 ? step3.status : '',
    HIGH_RISK: step3 ? (step3.status === 'HIGH_RISK') : '',
    HIGH_RISK_TRIGGERS,

    // ✅ Summary REMOVED (requested)
    RECOMMENDATION
  };

  const headers = Object.keys(row);
  const values = headers.map(h => (row[h]===null || row[h]===undefined) ? '' : row[h]);
  return {headers, values};
}

function exportCsvAll(){
  try{
    const {headers, values} = buildCsvRow();
    const csv = headers.map(csvEscape).join(',') + '\n' + values.map(csvEscape).join(',') + '\n';
    const stamp = (new Date().toISOString().slice(0,10));
    downloadTextFile(`OGTT_Risk_${stamp}.csv`, 'text/csv;charset=utf-8', csv);
    toast('CSV downloaded');
  }catch(e){
    console.error(e);
    toast('CSV export error - see Console');
  }
}
window.exportCsvAll = exportCsvAll;

// ---------- events ----------
function wire(){
  // CSV
  try{
    const b = $('downloadCsv');
    if(b) b.addEventListener('click', exportCsvAll);
  }catch(e){ console.error('CSV wire error', e); }

  // default test date
  const td = $('testDate');
  if(td && !td.value){ td.value = new Date().toISOString().slice(0,10); }

  // inputs
  const allInputs = document.querySelectorAll('input,select,textarea');
  allInputs.forEach(el => {
    el.addEventListener('input', () => {
      saveToLocal('ogtt_fresh_current', snapshot());
      render();
    });
    el.addEventListener('change', () => {
      saveToLocal('ogtt_fresh_current', snapshot());
      render();
    });
  });

  const unitModeEl = $('unitMode');
  if(unitModeEl){
    unitModeEl.addEventListener('change', (e)=>{
      const newMode = e.target.value;
      const oldMode = state.unitMode;
      if(newMode && oldMode && newMode !== oldMode){
        convertBaselineFields(oldMode, newMode);
        convertOgttFields(oldMode, newMode);
      }
      state.unitMode = newMode;
      saveToLocal('ogtt_fresh_current', snapshot());
      render();
    });
  }

  // copy / print buttons (if present)
  const copyBtn = $('copySummary');
  if(copyBtn){
    copyBtn.addEventListener('click', async ()=>{
      try{
        const txt = $('summary') ? $('summary').textContent : '';
        await navigator.clipboard.writeText(txt);
        toast('Summary copied');
      } catch {
        toast('Copy failed (browser blocked)');
      }
    });
  }

  const printBtn = $('print');
  if(printBtn) printBtn.addEventListener('click', ()=> window.print());

  const exportPdfBtn = $('exportPdf');
  if(exportPdfBtn) exportPdfBtn.addEventListener('click', ()=> window.print());

  const clearBtn = $('clear');
  if(clearBtn){
    clearBtn.addEventListener('click', ()=>{
      localStorage.removeItem('ogtt_fresh_current');
      document.querySelectorAll('input').forEach(i=>{ if(i.type==='checkbox') i.checked=false; else i.value=''; });
      document.querySelectorAll('select').forEach(s=>{ if(s.id==='unitMode') return; s.value=''; });
      render();
      toast('Cleared');
    });
  }

  const saveBaselineBtn = $('saveBaseline');
  if(saveBaselineBtn){
    saveBaselineBtn.addEventListener('click', ()=>{
      saveToLocal('ogtt_fresh_baseline', snapshot());
      toast('Baseline saved');
    });
  }
}

(function init(){
  // keep your prior behavior (no auto-clear unless you want it)
  // try{ localStorage.removeItem('ogtt_fresh_current'); }catch(e){}

  const um = $('unitMode');
  state.unitMode = (um && um.value) ? um.value : state.unitMode;

  // load last session if present
  const snap = loadFromLocal('ogtt_fresh_current');
  if(snap) applySnapshot(snap);

  updateUnitLabels();
  wire();
  render();
})();

// optional helpers used by some pages
function toggleAllAccordions(open){
  document.querySelectorAll('details.accordion').forEach(d=> d.open = !!open);
}
