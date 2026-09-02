/**
 * Public advisory engine (spec §24).
 *
 * Deterministic rules only. The spec is explicit that an LLM must not decide
 * whether an area is safe, so nothing in this module calls a model: every
 * advisory is a pre-written string emitted when a stated condition over the
 * analytics output is met. A later phase may use an LLM to RE-PHRASE these
 * structured outputs into more natural language, but the determination stays here.
 *
 * Each rule declares the condition that fired it, so any advisory shown to the
 * public can be traced back to the analytics that justified it.
 */

'use strict';

const SEVERITY_ORDER = { CRITICAL: 4, HIGH: 3, MODERATE: 2, INFO: 1 };

/**
 * Rule set, evaluated in order. `when` receives the assembled context and
 * returns true when the rule applies.
 */
const RULES = [
  {
    id: 'overall_severe',
    severity: 'CRITICAL',
    hazard: 'overall',
    when: ctx => ctx.overallCode >= 4,
    title: 'Severe flood conditions',
    text_en:
      'Severe flood conditions are indicated for this area. Move to higher ground now, avoid all low-lying areas and watercourses, and follow instructions from PDMA and local authorities.',
    text_ur:
      'اس علاقے میں شدید سیلابی حالات کا امکان ہے۔ فوراً بلند مقام کی طرف منتقل ہوں، نشیبی علاقوں اور ندی نالوں سے دور رہیں، اور پی ڈی ایم اے و مقامی انتظامیہ کی ہدایات پر عمل کریں۔'
  },
  {
    id: 'urban_flood_high',
    severity: 'HIGH',
    hazard: 'urban_flood',
    when: ctx => ctx.hazardCode('urban_flood') >= 3,
    title: 'Urban flooding likely',
    text_en:
      'Avoid low-lying roads, underpasses and drainage channels. Do not park in basements or underpasses, and allow extra time for travel.',
    text_ur:
      'نشیبی سڑکوں، انڈر پاسز اور نالوں سے گریز کریں۔ گاڑی کو تہہ خانے یا انڈر پاس میں کھڑا نہ کریں اور سفر کے لیے اضافی وقت رکھیں۔'
  },
  {
    id: 'flash_flood_high',
    severity: 'HIGH',
    hazard: 'flash_flood',
    when: ctx => ctx.hazardCode('flash_flood') >= 3,
    title: 'Flash flooding possible',
    text_en:
      'Move away from streams, nullahs and low-lying channels. Do not attempt to cross flowing water on foot or by vehicle — flash flood water rises without warning.',
    text_ur:
      'ندی نالوں اور نشیبی گزرگاہوں سے دور ہو جائیں۔ بہتے پانی کو پیدل یا گاڑی کے ذریعے عبور کرنے کی کوشش نہ کریں — سیلابی ریلا اچانک آ سکتا ہے۔'
  },
  {
    id: 'landslide_high',
    severity: 'HIGH',
    hazard: 'landslide',
    when: ctx => ctx.hazardCode('landslide') >= 3,
    title: 'Landslide risk on slopes',
    text_en:
      'Avoid travel on mountain roads and cut sections where possible. Watch for falling rocks, mud on the carriageway and slope cracks, and do not stop below steep cut slopes.',
    text_ur:
      'پہاڑی سڑکوں اور کٹاؤ والے حصوں پر سفر سے حتی الامکان گریز کریں۔ گرتے پتھروں، سڑک پر مٹی اور ڈھلوان میں دراڑوں پر نظر رکھیں، اور کھڑی ڈھلوان کے نیچے گاڑی نہ روکیں۔'
  },
  {
    id: 'river_flood_high',
    severity: 'HIGH',
    hazard: 'river_flood',
    when: ctx => ctx.hazardCode('river_flood') >= 3,
    title: 'River levels may rise',
    text_en:
      'If you are on or near the floodplain, prepare to move livestock and valuables to higher ground and follow Flood Forecasting Division and PDMA river advisories for official river stage information.',
    text_ur:
      'اگر آپ دریا کے قریب یا نشیبی علاقے میں ہیں تو مویشیوں اور قیمتی سامان کو بلند جگہ منتقل کرنے کی تیاری رکھیں، اور دریاؤں کی صورتحال کے لیے فلڈ فورکاسٹنگ ڈویژن اور پی ڈی ایم اے کی ہدایات پر عمل کریں۔'
  },
  {
    id: 'heavy_rain_incoming',
    severity: 'MODERATE',
    hazard: 'rainfall',
    when: ctx =>
      ['HEAVY', 'VERY_HEAVY', 'EXTREME'].includes(ctx.forecast6hClass) && ctx.overallCode < 3,
    title: 'Heavy rainfall expected',
    text_en:
      'Heavy rainfall is expected in the next few hours. Secure loose items outdoors, clear roof and street drains where you safely can, and avoid unnecessary travel during the heaviest spells.',
    text_ur:
      'اگلے چند گھنٹوں میں تیز بارش متوقع ہے۔ باہر رکھی اشیاء محفوظ کریں، چھت اور گلی کی نالیاں صاف رکھیں، اور شدید بارش کے دوران غیر ضروری سفر سے گریز کریں۔'
  },
  {
    id: 'rain_rising_watch',
    severity: 'MODERATE',
    hazard: 'rainfall',
    when: ctx => ctx.trend === 'RISING' && ctx.overallCode >= 1 && ctx.overallCode < 3,
    title: 'Conditions are worsening',
    text_en:
      'Rainfall is increasing over this area. Stay alert, keep your phone charged, and check updates before travelling in the next few hours.',
    text_ur:
      'اس علاقے میں بارش بڑھ رہی ہے۔ چوکس رہیں، موبائل فون چارج رکھیں، اور اگلے چند گھنٹوں میں سفر سے پہلے تازہ اطلاعات دیکھ لیں۔'
  },
  {
    id: 'saturated_ground',
    severity: 'MODERATE',
    hazard: 'wetness',
    when: ctx => ['VERY_WET', 'SATURATED'].includes(ctx.wetnessClass) && ctx.overallCode >= 1,
    title: 'Ground is already saturated',
    text_en:
      'The ground in this area is already wet from earlier rainfall, so further rain will run off rather than soak in. Expect water to pond faster than usual in low spots.',
    text_ur:
      'اس علاقے کی زمین پہلے کی بارش سے پہلے ہی تر ہے، اس لیے مزید بارش جذب ہونے کے بجائے بہہ جائے گی۔ نشیبی جگہوں پر پانی معمول سے جلد جمع ہو سکتا ہے۔'
  },
  {
    // Baseline voice for the low-but-not-zero band, so a WATCH or MODERATE state
    // never renders an empty advisory panel when no specific rule has fired.
    id: 'watch_baseline',
    severity: 'INFO',
    hazard: 'overall',
    when: ctx => ctx.overallCode >= 1 && ctx.overallCode < 3,
    title: 'Keep an eye on conditions',
    text_en:
      'Conditions here are being watched but no significant flood impact is indicated right now. Avoid standing water, and check for updates before travelling if rain continues.',
    text_ur:
      'اس علاقے کی صورتحال زیرِ نگرانی ہے، تاہم فی الحال کوئی نمایاں سیلابی اثر متوقع نہیں۔ کھڑے پانی سے گریز کریں، اور بارش جاری رہنے کی صورت میں سفر سے پہلے تازہ اطلاعات دیکھ لیں۔'
  },
  {
    id: 'all_clear',
    severity: 'INFO',
    hazard: 'overall',
    when: ctx => ctx.overallCode === 0,
    title: 'No flood concern at present',
    text_en:
      'No significant flood or landslide concern is indicated for this location at present. Normal precautions apply.',
    text_ur:
      'اس مقام کے لیے فی الحال کوئی نمایاں سیلابی یا لینڈ سلائیڈ خطرہ ظاہر نہیں ہو رہا۔ معمول کی احتیاط برقرار رکھیں۔'
  }
];

/** Advisories that only speak when nothing more specific applies. */
const BASELINE_RULE_IDS = new Set(['all_clear', 'watch_baseline']);

/**
 * Generate advisories from a completed risk assessment.
 *
 * @param {object} params { risk, rainfall, wetness }
 * @returns {Array} advisories, most severe first
 */
function generateAdvisories({ risk, rainfall, wetness }) {
  const ctx = {
    overallCode: risk?.overall?.code ?? 0,
    hazardCode: key => risk?.hazards?.[key]?.code ?? 0,
    forecast6hClass: rainfall?.forecast?.['6h']?.class ?? 'NORMAL',
    trend: rainfall?.trend?.direction ?? 'DRY',
    wetnessClass: wetness?.class ?? 'NORMAL'
  };

  const fired = RULES.filter(rule => {
    try {
      return rule.when(ctx);
    } catch {
      return false;
    }
  });

  // Baseline advisories are a fallback voice, never shown beside a real warning.
  const warnings = fired.filter(r => !BASELINE_RULE_IDS.has(r.id));
  const selected = warnings.length ? warnings : fired;

  return selected
    .sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])
    .map(rule => ({
      id: rule.id,
      severity: rule.severity,
      hazard: rule.hazard,
      title: rule.title,
      text_en: rule.text_en,
      text_ur: rule.text_ur,
      // Traceability: the advisory is only as good as the analytics behind it.
      basis:
        rule.hazard === 'overall'
          ? `overall risk = ${risk?.overall?.level ?? 'UNKNOWN'}`
          : rule.hazard === 'rainfall'
            ? `6 h forecast class = ${ctx.forecast6hClass}, trend = ${ctx.trend}`
            : rule.hazard === 'wetness'
              ? `antecedent wetness = ${ctx.wetnessClass}`
              : `${rule.hazard} = ${risk?.hazards?.[rule.hazard]?.level ?? 'UNKNOWN'}`,
      generated_by: 'DETERMINISTIC_RULE'
    }));
}

module.exports = { generateAdvisories, RULES };
