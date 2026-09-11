import { MHG_CONFIG, MemoryRegistry, issueCode, validateCode } from './dist/index.js';
const registry = new MemoryRegistry();
const deps = { config: MHG_CONFIG, registry };
const rows = [
  ['Hampton Inn Evansville East','Evansville','IN','HX','East','EVVIN'],
  ['Hilton Garden Inn Evansville','Evansville','IN','HG','East',''],
  ['Hampton Inn Evansville West','Evansville','IN','HX','West',''],
  ['Hilton Garden Inn Evansville West','Evansville','IN','HG','West',''],
  ['Holiday Inn Express Newburgh','Newburgh','IN','HE','',''],
  ['Courtyard Indianapolis Downtown','Indianapolis','IN','CY','Downtown',''],
  ['Holiday Inn Express Owensboro','Owensboro','KY','HE','',''],
  ['The Kringle','Santa Claus','IN','MB','',''],
  ['Hampton Schaumburg','Schaumburg','IL','HX','',''],
];
for (const [name, city, state, brandCode, submarket, franchisorCode] of rows) {
  const r = await issueCode(deps, { name, city, state, brandCode, submarket, franchisorCode });
  if (r.ok) {
    console.log(r.record.code.padEnd(7), r.record.name.padEnd(36), r.trace.map(s => s.rule).join(' · '));
  } else {
    console.log('FAIL   ', name.padEnd(36), r.failure.rule + ': ' + r.failure.message);
  }
}
console.log('\nregistry:', (await registry.list()).length, 'records');
const bad = await issueCode(deps, { name: 'Third Hampton', city: 'Evansville', state: 'IN', brandCode: 'HX' });
console.log('no-submarket collision ->', bad.ok ? bad.record.code : bad.failure.rule + ': ' + bad.failure.message);
console.log('validate EVVHX ->', validateCode(MHG_CONFIG, 'EVVHX').message);
console.log('validate EVV1X ->', validateCode(MHG_CONFIG, 'EVV1X').message);
