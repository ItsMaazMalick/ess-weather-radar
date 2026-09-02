const { jsonWithCache } = require('../../../../backend/http-helpers');
const {
  RAINFALL_THRESHOLDS,
  RAINFALL_CLASSES,
  RISK_LEVELS,
  HAZARD_MODELS,
  SUSCEPTIBILITY_FLOOR,
  WETNESS,
  IMPACT_WINDOWS,
  RUNOFF
} = require('../../../../backend/config/thresholds');

export async function GET() {
  return jsonWithCache(
    {
      rainfall: { classes: RAINFALL_CLASSES, thresholds: RAINFALL_THRESHOLDS },
      risk_levels: RISK_LEVELS,
      hazards: Object.entries(HAZARD_MODELS).map(([key, m]) => ({
        key,
        label: m.label,
        trigger: m.trigger,
        susceptibility: m.susceptibility
      })),
      susceptibility_floor: SUSCEPTIBILITY_FLOOR,
      model_note:
        'index = trigger x (floor + (1 - floor) x susceptibility). Susceptibility modulates ' +
        'the rainfall trigger rather than adding to it, so a vulnerable location does not ' +
        'carry an elevated level while no rain is falling.',
      wetness: { classes: WETNESS.classes, thresholds: WETNESS.thresholds },
      runoff: { classes: RUNOFF.classes, thresholds: RUNOFF.thresholds },
      impact_windows: IMPACT_WINDOWS,
      data_types: ['OBSERVED', 'FORECAST', 'MODELLED', 'VERIFIED', 'SATELLITE_OBSERVED'],
      phase: 'PHASE_2',
      calibration_status: 'UNCALIBRATED — categorical risk only, no probability output.'
    },
    'public, max-age=300'
  );
}
