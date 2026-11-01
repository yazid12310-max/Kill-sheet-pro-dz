// Kill Sheet engine — IWCF surface BOP kill sheet (field units: ft, ppg, psi, bbl).
// Rounding rules follow IWCF practice:
//   • Kill mud weight          → rounded UP to 0.1 ppg
//   • Max allowable mud weight → rounded DOWN to 0.1 ppg
//   • MAASP rounded DOWN to whole psi; ICP / FCP to nearest psi
//   • Strokes                  → rounded UP to whole strokes
//   • Volumes                  → 1 decimal bbl

export const G = 0.052;

export const roundUp = (v, d = 0) => { const f = 10 ** d; return Math.ceil(v * f - 1e-9) / f; };
export const roundDown = (v, d = 0) => { const f = 10 ** d; return Math.floor(v * f + 1e-9) / f; };
export const round = (v, d = 0) => { const f = 10 ** d; return Math.round(v * f) / f; };

export const DEFAULT_INPUTS = {
  well: "", rig: "",
  md: 10000, tvd: 9500,
  shoeMd: 5500, shoeTvd: 5200,
  omw: 10.5,
  lotPressure: 1450, lotMw: 10.0,
  sidpp: 450, sicp: 650, pitGain: 15,
  pumpOutput: 0.102, killRate: 30, scr: 600, surfaceLineStrokes: 0,
  dpLen: 9050, dpCap: 0.01776,
  hwdpLen: 0, hwdpCap: 0.0087,
  dcLen: 950, dcCap: 0.0073,
  dcOhCap: 0.0291, dpOhCap: 0.0459, dpCsgCap: 0.0505,
  steps: 10,
};

export function compute(raw) {
  const i = Object.fromEntries(Object.entries({ ...DEFAULT_INPUTS, ...raw }).map(([k, v]) => [k, typeof DEFAULT_INPUTS[k] === "number" ? Number(v) || 0 : v]));
  const errors = [];
  if (i.tvd <= 0) errors.push("tvd");
  if (i.omw <= 0) errors.push("omw");
  if (i.pumpOutput <= 0) errors.push("pumpOutput");
  if (i.shoeTvd <= 0) errors.push("shoeTvd");
  if (errors.length) return { errors };

  // Max allowable mud weight & MAASP
  const mamw = roundDown(i.lotMw + i.lotPressure / (G * i.shoeTvd), 1);
  const maasp = roundDown((mamw - i.omw) * G * i.shoeTvd);

  // Drill string volume
  const dpVol = i.dpLen * i.dpCap;
  const hwdpVol = i.hwdpLen * i.hwdpCap;
  const dcVol = i.dcLen * i.dcCap;
  const stringVol = dpVol + hwdpVol + dcVol;

  // Annulus volume (open hole below shoe, cased hole above)
  const ohLen = Math.max(i.md - i.shoeMd, 0);
  const dcOhLen = Math.min(i.dcLen + i.hwdpLen, ohLen);
  const dpOhLen = Math.max(ohLen - dcOhLen, 0);
  const dcOhVol = dcOhLen * i.dcOhCap;
  const dpOhVol = dpOhLen * i.dpOhCap;
  const openHoleVol = dcOhVol + dpOhVol;
  const csgVol = Math.min(i.shoeMd, i.md) * i.dpCsgCap;
  const annulusVol = openHoleVol + csgVol;
  const totalVol = stringVol + annulusVol;

  const stk = (v) => roundUp(v / i.pumpOutput);
  const surfToBit = stk(stringVol) + roundUp(i.surfaceLineStrokes);
  const bitToShoe = stk(openHoleVol);
  const shoeToSurf = stk(csgVol);
  const bottomsUp = stk(annulusVol);
  const totalStrokes = surfToBit + bottomsUp;
  const mins = (s) => (i.killRate > 0 ? s / i.killRate : 0);

  // Kick data
  const formationPressure = round(i.sidpp + G * i.omw * i.tvd);
  const kmw = roundUp(i.omw + i.sidpp / (G * i.tvd), 1);
  const icp = round(i.scr + i.sidpp);
  const fcp = round((i.scr * kmw) / i.omw);
  const newMaasp = roundDown((mamw - kmw) * G * i.shoeTvd);
  const overbalanceKmw = round(G * kmw * i.tvd - formationPressure);

  // Influx height & gradient
  let influxHeight = 0;
  const dcAnnVol = dcOhVol;
  if (i.dcOhCap > 0 && i.pitGain <= dcAnnVol) influxHeight = i.pitGain / i.dcOhCap;
  else if (i.dpOhCap > 0) influxHeight = dcOhLen + (i.pitGain - dcAnnVol) / i.dpOhCap;
  const influxGradient = influxHeight > 0 ? G * i.omw - (i.sicp - i.sidpp) / influxHeight : null;
  const influxType = influxGradient == null ? "—" : influxGradient < 0.25 ? "gas" : influxGradient <= 0.4 ? "oil" : "water";

  // Step-down schedule: equal stroke intervals from 0 to surface-to-bit
  const steps = Math.max(2, Math.min(40, Math.round(i.steps) || 10));
  const schedule = [];
  for (let n = 0; n <= steps; n++) {
    const s = Math.round((surfToBit * n) / steps);
    const p = icp - ((icp - fcp) * s) / (surfToBit || 1);
    schedule.push({ step: n, strokes: s, pressure: Math.round(p), minutes: round(mins(s), 1) });
  }
  const dropPer100 = surfToBit ? round(((icp - fcp) / surfToBit) * 100, 1) : 0;

  return {
    errors: [],
    inputs: i,
    mamw, maasp, newMaasp,
    dpVol: round(dpVol, 1), hwdpVol: round(hwdpVol, 1), dcVol: round(dcVol, 1), stringVol: round(stringVol, 1),
    dcOhVol: round(dcOhVol, 1), dpOhVol: round(dpOhVol, 1), openHoleVol: round(openHoleVol, 1), csgVol: round(csgVol, 1),
    annulusVol: round(annulusVol, 1), totalVol: round(totalVol, 1),
    surfToBit, bitToShoe, shoeToSurf, bottomsUp, totalStrokes,
    surfToBitMin: round(mins(surfToBit), 1), bottomsUpMin: round(mins(bottomsUp), 1), totalMin: round(mins(totalStrokes), 1),
    formationPressure, kmw, icp, fcp, overbalanceKmw,
    influxHeight: round(influxHeight), influxGradient: influxGradient == null ? null : round(influxGradient, 3), influxType,
    schedule, dropPer100,
  };
}

// Trip sheet: expected vs actual hole fill / displacement per row
export function tripRows(settings, entries) {
  const disp = Number(settings.pipeDisp) || 0;      // bbl/ft metal displacement (dry) or closed-end (wet)
  const standLen = Number(settings.standLen) || 93;  // ft per stand
  let cumCalc = 0, cumActual = 0;
  return entries.map((e) => {
    const stands = Number(e.stands) || 0;
    const calc = stands * standLen * disp;
    const actual = Number(e.actual) || 0;
    cumCalc += calc; cumActual += actual;
    const diff = actual - calc;
    return { ...e, calc: round(calc, 2), diff: round(diff, 2), cumCalc: round(cumCalc, 2), cumActual: round(cumActual, 2), cumDiff: round(cumActual - cumCalc, 2) };
  });
}
