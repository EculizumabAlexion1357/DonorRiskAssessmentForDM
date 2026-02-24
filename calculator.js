/*
  OGTT–DM Risk Stratifier (DOM-safe)
  - Waits for DOMContentLoaded before running
  - Guards all DOM lookups so missing elements won't crash the app
*/

(function () {
  'use strict';

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);

  function safeText(id, txt) {
    const el = $(id);
    if (el) el.textContent = txt;
  }
  function safeHTML(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
  }
  function hasEl(id) {
    return !!$(id);
  }

  // global-ish state
  const state = (window.state = window.state || { unitMode: 'US', baseline: null });
  if (!state.unitMode) state.unitMode = 'US';

  // ---------- unit conversions ----------
  const conv = {
    // glucose
    mgdl_to_mmol: (mgdl) => mgdl / 18.0,
    mmol_to_mgdl: (mmol) => mmol * 18.0,
    // insulin (µU/mL == mU/L)
    mU_to_pmol: (mu) => mu * 6.0,
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

  function num(id) {
    const el = $(id);
    if (!el) return null;
    let v = el.value;
    if (v === '' || v === null || v === undefined) return null;
    v = String(v).trim().replace(/,/g, '');
    if (!/^\d*\.?\d*$/.test(v)) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function bool(id) {
    const el = $(id);
    return el ? el.checked === true : false;
  }

  function sel(id) {
    const el = $(id);
    if (!el) return null;
    const v = el.value;
    return v === '' ? null : v;
  }

  function round(n, d = 2) {
    if (n === null || n === undefined || !Number.isFinite(n)) return null;
    const p = Math.pow(10, d);
    return Math.round(n * p) / p;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    window.setTimeout(() => t.classList.remove('show'), 1200);
  }

  // ---------- unit flip ----------
  function convertOgttFields(oldMode, newMode) {
    if (!oldMode || !newMode || oldMode === newMode) return;

    const gIds = ['g0', 'g30', 'g60', 'g90', 'g120'];
    const iIds = ['i0', 'i30', 'i60', 'i90', 'i120'];

    const convertOne = (id, fn, decimals = 1) => {
      const el = $(id);
      if (!el) return;
      const v = num(id);
      if (v === null) return;
      const out = fn(v);
      const r = round(out, decimals);
      el.value = (r === null ? '' : String(r));
    };

    if (oldMode === 'US' && newMode === 'SI') {
      gIds.forEach((id) => convertOne(id, conv.mgdl_to_mmol, 1));
      iIds.forEach((id) => convertOne(id, conv.mU_to_pmol, 1));
    } else if (oldMode === 'SI' && newMode === 'US') {
      gIds.forEach((id) => convertOne(id, conv.mmol_to_mgdl, 1));
      iIds.forEach((id) => convertOne(id, conv.pmol_to_mU, 1));
    }
  }

  function convertBaselineFields(oldMode, newMode) {
    if (!oldMode || !newMode || oldMode === newMode) return;

    const convertOne = (id, fn, decimals = 1) => {
      const el = $(id);
      if (!el) return;
      const v = num(id);
      if (v === null) return;
      const out = fn(v);
      const r = round(out, decimals);
      el.value = (r === null ? '' : String(r));
    };

    if (oldMode === 'US' && newMode === 'SI') {
      convertOne('weight', conv.lb_to_kg, 1);
      convertOne('height', conv.in_to_cm, 1);
      convertOne('waist', conv.in_to_cm, 1);
      convertOne('tg', conv.tg_mgdl_to_mmol, 2);
      convertOne('hdl', conv.hdl_mgdl_to_mmol, 2);
    } else if (oldMode === 'SI' && newMode === 'US') {
      convertOne('weight', conv.kg_to_lb, 1);
      convertOne('height', conv.cm_to_in, 1);
      convertOne('waist', conv.cm_to_in, 1);
      convertOne('tg', conv.tg_mmol_to_mgdl, 1);
      convertOne('hdl', conv.hdl_mmol_to_mgdl, 1);
    }

    // HbA1c: follow unit mode
    const a1cEl = $('a1c');
    const a1cUnitEl = $('a1cUnit');
    if (a1cEl && a1cUnitEl) {
      const a1cVal = num('a1c');
      const curUnit = a1cUnitEl.value || 'percent';

      if (newMode === 'SI' && curUnit === 'percent') {
        if (a1cVal !== null) {
          const ifcc = conv.a1c_percent_to_ifcc(a1cVal);
          a1cEl.value = String(round(ifcc, 0));
        }
        a1cUnitEl.value = 'ifcc';
      }

      if (newMode === 'US' && curUnit === 'ifcc') {
        if (a1cVal !== null) {
          const pct = conv.a1c_ifcc_to_percent(a1cVal);
          a1cEl.value = String(round(pct, 1));
        }
        a1cUnitEl.value = 'percent';
      }
    }
  }

  function setBadge(el, kind, text) {
    if (!el) return;
    el.classList.remove('good', 'warn', 'bad');
    if (kind) el.classList.add(kind);
    if (text && typeof text === 'object' && typeof text.html === 'string') el.innerHTML = text.html;
    else el.textContent = text;
  }

  // ---------- canonical inputs ----------
  function getInputsCanonical() {
    const mode = state.unitMode;

    const age = num('age');
    const sex = sel('sex');
    const eth = sel('eth');

    const weightRaw = num('weight');
    const heightRaw = num('height');
    const waistRaw = num('waist');

    const weightKg = weightRaw == null ? null : (mode === 'US' ? conv.lb_to_kg(weightRaw) : weightRaw);
    const heightCm = heightRaw == null ? null : (mode === 'US' ? conv.in_to_cm(heightRaw) : heightRaw);
    const waistCm = waistRaw == null ? null : (mode === 'US' ? conv.in_to_cm(waistRaw) : waistRaw);

    const tgRaw = num('tg');
    const hdlRaw = num('hdl');
    const tgMgdl = tgRaw == null ? null : (mode === 'US' ? tgRaw : conv.tg_mmol_to_mgdl(tgRaw));
    const hdlMgdl = hdlRaw == null ? null : (mode === 'US' ? hdlRaw : conv.hdl_mmol_to_mgdl(hdlRaw));

    const sbp = num('sbp');
    const dbp = num('dbp');

    const a1cRaw = num('a1c');
    const a1cUnit = sel('a1cUnit') || 'percent';
    const a1c = a1cRaw == null ? null : (a1cUnit === 'ifcc' ? conv.a1c_ifcc_to_percent(a1cRaw) : a1cRaw);

    const bpMeds = sel('bpMeds');

    const gdm = bool('gdm');
    const pancreatitis = bool('pancreatitis');
    const masld = bool('masld');
    const pcos = bool('pcos');
    const fdr = bool('fdr');

    // glucose: canonical mg/dL
    const g0raw = num('g0');
    const g30raw = num('g30');
    const g60raw = num('g60');
    const g90raw = num('g90');
    const g120raw = num('g120');

    const g0 = g0raw == null ? null : (mode === 'US' ? g0raw : conv.mmol_to_mgdl(g0raw));
    const g30 = g30raw == null ? null : (mode === 'US' ? g30raw : conv.mmol_to_mgdl(g30raw));
    const g60 = g60raw == null ? null : (mode === 'US' ? g60raw : conv.mmol_to_mgdl(g60raw));
    const g90 = g90raw == null ? null : (mode === 'US' ? g90raw : conv.mmol_to_mgdl(g90raw));
    const g120 = g120raw == null ? null : (mode === 'US' ? g120raw : conv.mmol_to_mgdl(g120raw));

    // insulin: canonical pmol/L  ✅ FIXED
    const i0raw = num('i0');
    const i30raw = num('i30');
    const i60raw = num('i60');
    const i90raw = num('i90');
    const i120raw = num('i120');

    const i0 = i0raw == null ? null : (mode === 'US' ? conv.mU_to_pmol(i0raw) : i0raw);
    const i30 = i30raw == null ? null : (mode === 'US' ? conv.mU_to_pmol(i30raw) : i30raw);
    const i60 = i60raw == null ? null : (mode === 'US' ? conv.mU_to_pmol(i60raw) : i60raw);
    const i90 = i90raw == null ? null : (mode === 'US' ? conv.mU_to_pmol(i90raw) : i90raw);
    const i120 = i120raw == null ? null : (mode === 'US' ? conv.mU_to_pmol(i120raw) : i120raw);

    return {
      mode,
      age, sex, eth,
      weightKg, heightCm, waistCm,
      tgMgdl, hdlMgdl,
      sbp, dbp, a1c, bpMeds,
      gdm, pancreatitis, masld, pcos, fdr,
      g0, g30, g60, g90, g120,
      i0, i30, i60, i90, i120
    };
  }

  function bmiFromKgCm(kg, cm) {
    if (kg == null || cm == null || cm <= 0) return null;
    const m = cm / 100.0;
    return kg / (m * m);
  }

  function isHighRiskEthnicity(eth) {
    return ['African American', 'Hispanic/Latino', 'Native American', 'Asian American'].includes(eth || '');
  }

  // ---------- Steps ----------
  function step1_ogttIndication(x) {
    const reasons = [];

    if (x.g0 != null && x.g0 >= 100 && x.g0 < 126) reasons.push('FPG 100–125 mg/dL');
    if (x.a1c != null && x.a1c >= 5.7 && x.a1c <= 6.4) reasons.push('HbA1c 5.7–6.4%');
    if (x.gdm) reasons.push('History of gestational diabetes');
    if (x.pancreatitis) reasons.push('History of pancreatitis');

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

    if (hasBmiTrigger && (x.masld || hasHTN || hasDyslipidemia || x.pcos || x.fdr || isHighRiskEthnicity(x.eth))) {
      const extras = [];
      if (x.masld) extras.push('MASLD');
      if (hasHTN) extras.push('Hypertension ≥130/80 mm Hg or on treatment');
      if (hasDyslipidemia) extras.push('Dyslipidemia (HDL <35 mg/dL and/or triglycerides >250 mg/dL)');
      if (x.pcos) extras.push('PCOS');
      if (x.fdr) extras.push('First-degree relative with T2D');
      if (isHighRiskEthnicity(x.eth)) extras.push('High-risk ethnicity');

      reasons.push(`BMI ≥${bmiThresh} kg/m² plus one or more of the following:`);
      extras.forEach(e => reasons.push(e));
    }

    return {
      indicated: reasons.length > 0,
      reasons,
      bmi,
      bmiThresh
    };
  }

  function step2_metabolicSyndrome(x) {
    const met = [], notMet = [], unknown = [];

    // waist
    if (x.sex == null || x.waistCm == null) unknown.push('Waist circumference');
    else {
      const ok = (x.sex === 'M' ? x.waistCm > 102 : x.waistCm > 88);
      (ok ? met : notMet).push('Waist circumference');
    }

    // TG
    if (x.tgMgdl == null) unknown.push('Triglycerides');
    else (x.tgMgdl >= 150 ? met : notMet).push('Triglycerides');

    // HDL
    if (x.sex == null || x.hdlMgdl == null) unknown.push('HDL');
    else {
      const ok = (x.sex === 'M' ? x.hdlMgdl < 40 : x.hdlMgdl < 50);
      (ok ? met : notMet).push('HDL');
    }

    // BP
    const onTx = x.bpMeds === 'yes';
    if (onTx) met.push('Blood pressure');
    else if (x.sbp == null || x.dbp == null) unknown.push('Blood pressure');
    else (x.sbp >= 130 || x.dbp >= 85 ? met : notMet).push('Blood pressure');

    // FPG
    if (x.g0 == null) unknown.push('Fasting glucose');
    else (x.g0 >= 100 ? met : notMet).push('Fasting glucose');

    const count = met.length;
    const complete = unknown.length === 0;
    const present = (count >= 3) && complete;

    return { count, present, complete, met, notMet, unknown };
  }

  // ---------- indices ----------
  function insulin_mU(pmol) { return (pmol == null) ? null : conv.pmol_to_mU(pmol); }

  function calc_igi(x) {
    if (x.i0 == null || x.i30 == null || x.g0 == null || x.g30 == null) return null;
    const i0 = insulin_mU(x.i0), i30 = insulin_mU(x.i30);
    const dI = i30 - i0;
    const dG = x.g30 - x.g0;
    if (dG === 0) return null;
    return dI / dG;
  }

  function calc_pg_auc_weighted(x) {
    if (x.g0 == null || x.g30 == null || x.g60 == null || x.g120 == null) return null;
    return (x.g0 + 2 * x.g30 + 3 * x.g60 + 2 * x.g120) / 4;
  }

  function calc_matsuda(x) {
    const gVals = [x.g0, x.g30, x.g60, x.g90, x.g120].filter(v => v != null);
    const iVals = [x.i0, x.i30, x.i60, x.i90, x.i120].filter(v => v != null).map(insulin_mU);
    if (x.g0 == null || x.i0 == null) return null;
    if (gVals.length < 2 || iVals.length < 2) return null;

    const gMean = gVals.reduce((a, b) => a + b, 0) / gVals.length;
    const iMean = iVals.reduce((a, b) => a + b, 0) / iVals.length;

    const denom = Math.sqrt((x.g0 * insulin_mU(x.i0)) * (gMean * iMean));
    if (!Number.isFinite(denom) || denom <= 0) return null;
    return 10000 / denom;
  }

  function calc_homa_ir(x) {
    if (x.g0 == null || x.i0 == null) return null;
    return (x.g0 * insulin_mU(x.i0)) / 405.0;
  }

  function calc_di(x) {
    const m = calc_matsuda(x);
    const igi = calc_igi(x);
    if (m == null || igi == null) return null;
    return m * igi;
  }

  function calc_stumvoll1(x) {
    if (x.i0 == null || x.i30 == null || x.g30 == null) return null;
    const g30_mmol = x.g30 / 18;
    return 1283 + (1.829 * x.i30) - (138.7 * g30_mmol) + (3.772 * x.i0);
  }

  function step3_highRisk(x, metsRes) {
    const ifg = (x.g0 != null && x.g0 >= 100 && x.g0 < 126);
    const igt = (x.g120 != null && x.g120 >= 140 && x.g120 < 200);
    const oneHr = (x.g60 != null && x.g60 > 155);
    const a1c6064 = (x.a1c != null && x.a1c >= 6.0 && x.a1c <= 6.4);

    const igi = calc_igi(x);
    const igiLow = (igi != null && igi <= 0.82);

    const stum1 = calc_stumvoll1(x);
    const stumLow = (stum1 != null && stum1 <= 899);

    const triggers = [];
    if (igt && oneHr && metsRes.present) triggers.push('IGT + 1-hour PG >155 mg/dL + metabolic syndrome');
    if (ifg && igt) triggers.push('Combined IFG and IGT');
    if (ifg && oneHr && metsRes.present) triggers.push('IFG + 1-hour PG >155 mg/dL + metabolic syndrome');
    if ((igt || ifg) && oneHr && a1c6064) triggers.push('IGT or IFG + 1-hour PG >155 mg/dL + HbA1c 6.0–6.4%');
    if ((igt || ifg) && oneHr && (igiLow || stumLow)) {
      const sub = [];
      if (igiLow) sub.push('IGI ≤0.82');
      if (stumLow) sub.push('1st-phase ≤899 pmol/L');
      triggers.push(`IGT or IFG + 1-hour PG >155 mg/dL + ${sub.join(' and ')}`);
    }

    return {
      status: triggers.length ? 'HIGH_RISK' : 'NOT_HIGH_RISK',
      triggers,
      ifg, igt, oneHr,
      a1c6064,
      igi, igiLow,
      stum1, stumLow,
    };
  }

  function step4_recommendation(x, step3) {
    if (step3.status !== 'HIGH_RISK') {
      return { badge: { kind: null, text: 'Not applicable' }, text: 'Not in high-risk group based on Step 3 criteria.' };
    }
    if (x.age == null) return { badge: { kind: 'warn', text: 'Age needed' }, text: 'Enter age to apply Step 4.' };
    if (x.age < 40) return { badge: { kind: 'bad', text: '<40' }, text: 'Age <40 years — Not a candidate (high risk).' };
    if (x.age <= 49) return { badge: { kind: 'warn', text: '40–49' }, text: 'Age 40–49 years — Consider only if able to reverse high-risk prognostic markers with weight loss on repeat OGTT.' };
    return { badge: { kind: 'good', text: '≥50' }, text: 'Age ≥50 years — Can be accepted after risk mitigation with 5–10% weight loss.' };
  }

  // ---------- UI ----------
  function updateUnitLabels() {
    const mode = state.unitMode;

    safeText('unitLabel', mode);
    safeText('weightLabel', `Weight (${mode === 'US' ? 'lb' : 'kg'})`);
    safeText('heightLabel', `Height (${mode === 'US' ? 'in' : 'cm'})`);
    safeText('waistLabel', `Waist circumference (${mode === 'US' ? 'in' : 'cm'})`);
    safeText('tgLabel', `Triglycerides (${mode === 'US' ? 'mg/dL' : 'mmol/L'})`);
    safeText('hdlLabel', `HDL (${mode === 'US' ? 'mg/dL' : 'mmol/L'})`);

    const a1cUnit = (hasEl('a1cUnit') ? ($('a1cUnit').value || 'percent') : 'percent');
    safeText('a1cLabel', `HbA1c (${a1cUnit === 'ifcc' ? 'mmol/mol' : '%'})`);

    safeText('gluLabel', `Glucose (${mode === 'US' ? 'mg/dL' : 'mmol/L'})`);
    safeText('insLabel', `Insulin (${mode === 'US' ? 'µU/mL' : 'pmol/L'})`);

    const pill = $('unitPill');
    if (pill) pill.innerHTML = `Units: <b id="unitLabel">${mode}</b>`;
  }

  function buildSummary(x, step1, step2, step3, step4) {
    const lines = [];
    lines.push('OGTT–DM Risk Stratifier');
    lines.push('—');
    if (x.age != null) lines.push(`Age: ${x.age}`);
    if (step1.bmi != null) lines.push(`BMI: ${round(step1.bmi, 1)} kg/m²`);
    lines.push('');

    lines.push(`Step 1 (OGTT indication): ${step1.indicated ? 'YES' : 'NO'}`);
    lines.push(step1.indicated ? `Reasons: ${step1.reasons.join('; ')}` : 'Reasons: No Step 1 criteria met based on current inputs.');

    lines.push('');
    const metsStr = step2.complete
      ? (step2.present ? `PRESENT (${step2.count}/5)` : `ABSENT (${step2.count}/5)`)
      : `UNKNOWN (${step2.count}/5 met; missing: ${step2.unknown.join(', ') || '—'})`;
    lines.push(`Step 2 (Metabolic syndrome): ${metsStr}`);

    lines.push('');
    lines.push(`Step 3 (High-risk prognostic markers): ${step3.status === 'HIGH_RISK' ? 'HIGH RISK' : 'Not high-risk'}`);
    lines.push(step3.triggers.length ? `Triggered findings: ${step3.triggers.join('; ')}` : 'Triggered findings: No Step 3 markers triggered based on current inputs.');

    lines.push('');
    lines.push('Calculated indices:');
    lines.push(`- IGI: ${calc_igi(x) == null ? '—' : round(calc_igi(x), 2)}`);
    lines.push(`- Matsuda index: ${calc_matsuda(x) == null ? '—' : round(calc_matsuda(x), 2)}`);
    lines.push(`- HOMA-IR: ${calc_homa_ir(x) == null ? '—' : round(calc_homa_ir(x), 2)}`);
    lines.push(`- DI: ${calc_di(x) == null ? '—' : round(calc_di(x), 2)}`);
    lines.push(`- PG AUC (weighted): ${calc_pg_auc_weighted(x) == null ? '—' : round(calc_pg_auc_weighted(x), 1)}`);
    lines.push(`- Stumvoll 1st-phase: ${calc_stumvoll1(x) == null ? '—' : round(calc_stumvoll1(x), 0)}`);

    lines.push('');
    lines.push('Step 4 recommendation:');
    lines.push(step4.text);

    lines.push('');
    lines.push('Disclaimer: Clinical decision support/education tool. No patient data are stored. Use clinical judgment.');

    return lines.join('\n');
  }

  function render() {
    updateUnitLabels();

    const x = getInputsCanonical();

    const step1 = step1_ogttIndication(x);
    const step2 = step2_metabolicSyndrome(x);
    const step3 = step3_highRisk(x, step2);
    const step4 = step4_recommendation(x, step3);

    // BMI badge
    if (hasEl('bmiBadge')) {
      if (step1.bmi == null) {
        setBadge($('bmiBadge'), null, { html: 'BMI: <span class="bmiNum">—</span>' });
      } else {
        const k = (step1.bmi >= 30) ? 'bad' : (step1.bmi >= 25 ? 'warn' : 'good');
        setBadge($('bmiBadge'), k, { html: `BMI: <span class="bmiNum">${round(step1.bmi, 1)}</span> <span class="bmiUnit">kg/m²</span>` });
      }
    }

    // Step 1
    setBadge($('step1Badge'), step1.indicated ? 'warn' : 'good', step1.indicated ? 'YES' : 'NO');
    safeHTML(
      'step1Reasons',
      step1.indicated
        ? `<ul>${step1.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
        : `<div class="hint">No Step 1 indication criteria met based on current inputs.</div>`
    );

    // Step 2
    const step2Text = step2.complete
      ? (step2.present ? `Present (${step2.count}/5)` : `Not present (${step2.count}/5)`)
      : `Incomplete (${step2.count}/5 met)`;
    setBadge($('step2Badge'), step2.complete ? (step2.present ? 'bad' : 'good') : 'warn', step2Text);

    if (hasEl('metsDetail')) {
      const parts = [];
      parts.push(`<div class="hint"><b>${step2.count}/5</b> criteria met${step2.complete ? '' : ' (incomplete)'}.</div>`);
      if (step2.met.length) parts.push(`<div class="hint">Met: ${escapeHtml(step2.met.join(', '))}</div>`);
      if (step2.notMet.length) parts.push(`<div class="hint">Not met: ${escapeHtml(step2.notMet.join(', '))}</div>`);
      if (step2.unknown.length) parts.push(`<div class="hint">Missing: ${escapeHtml(step2.unknown.join(', '))}</div>`);
      safeHTML('metsDetail', parts.join(''));
    }

    // Step 3
    setBadge($('step3Badge'), step3.status === 'HIGH_RISK' ? 'bad' : 'good', step3.status === 'HIGH_RISK' ? 'HIGH RISK' : 'Not high-risk');
    if (hasEl('step3Detail')) {
      const s3 = [];
      if (step3.triggers.length) s3.push(`<ul>${step3.triggers.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`);
      else s3.push(`<div class="hint">No Step 3 markers triggered based on current inputs.</div>`);
      safeHTML('step3Detail', s3.join(''));
    }

    // Step 4
    setBadge($('step4Badge'), step4.badge.kind, step4.badge.text);
    safeText('step4Detail', step4.text);

    // top risk badge
    setBadge($('riskBadge'), step3.status === 'HIGH_RISK' ? 'bad' : 'good', step3.status === 'HIGH_RISK' ? 'High risk' : 'Not high-risk');

    // indices
    safeText('igi', (calc_igi(x) == null) ? '—' : `${round(calc_igi(x), 2)}${(calc_igi(x) != null && calc_igi(x) <= 0.82) ? ' (≤0.82)' : ''}`);
    safeText('stum1', (calc_stumvoll1(x) == null) ? '—' : `${round(calc_stumvoll1(x), 0)}${(calc_stumvoll1(x) != null && calc_stumvoll1(x) <= 899) ? ' (≤899)' : ''}`);
    safeText('pgauc', (calc_pg_auc_weighted(x) == null) ? '—' : `${round(calc_pg_auc_weighted(x), 1)}`);
    safeText('matsuda', (calc_matsuda(x) == null) ? '—' : `${round(calc_matsuda(x), 2)}`);
    safeText('homa', (calc_homa_ir(x) == null) ? '—' : `${round(calc_homa_ir(x), 2)}`);
    safeText('di', (calc_di(x) == null) ? '—' : `${round(calc_di(x), 2)}`);

    // summary
    safeText('summary', buildSummary(x, step1, step2, step3, step4));
  }

  // ---------- wiring ----------
  function wire() {
    // unit mode
    const unitEl = $('unitMode');
    if (unitEl) {
      unitEl.addEventListener('change', (e) => {
        const newMode = e.target.value || 'US';
        const oldMode = state.unitMode || 'US';
        if (newMode !== oldMode) {
          convertBaselineFields(oldMode, newMode);
          convertOgttFields(oldMode, newMode);
        }
        state.unitMode = newMode;
        render();
      });
    }

    // rerender on input
    document.querySelectorAll('input,select,textarea').forEach((el) => {
      el.addEventListener('input', render);
      el.addEventListener('change', render);
    });

    // default testDate
    const td = $('testDate');
    if (td && !td.value) td.value = new Date().toISOString().slice(0, 10);

    // safe: prevent missing buttons from throwing
    const clearBtn = $('clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        document.querySelectorAll('input').forEach(i => { if (i.type === 'checkbox') i.checked = false; else i.value = ''; });
        document.querySelectorAll('select').forEach(s => { if (s.id === 'unitMode') return; s.value = ''; });
        render();
        toast('Cleared');
      });
    }
  }

  // ---------- INIT (DOM SAFE) ----------
  function init() {
    try {
      // if unitMode exists, read it
      const unitEl = $('unitMode');
      if (unitEl && unitEl.value) state.unitMode = unitEl.value;
      updateUnitLabels();
      wire();
      render();
      console.log('OGTT calculator loaded. Unit mode:', state.unitMode);
    } catch (e) {
      console.error('Init failed:', e);
      alert('Calculator JS error. Open DevTools Console for details.');
    }
  }

  // THIS is the key fix: wait until DOM exists
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // expose a couple helpers
  window.toggleAllAccordions = function (open) {
    document.querySelectorAll('details.accordion').forEach(d => d.open = !!open);
  };

})();
