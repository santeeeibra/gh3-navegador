export const ACTORS = ['santi','codex','claude','automation'];
export const AUDIENCES = ['all','internal','unknown',...ACTORS];
export function actorOf(metadata) {
  return ACTORS.includes(metadata?.tester) ? metadata.tester : 'unknown';
}
export function audienceOf(value='all') {
  if (!AUDIENCES.includes(value)) throw new Error('invalid_audience');
  return value;
}
export function matchesAudience(metadata, audience='all') {
  const actor=actorOf(metadata);
  return audience==='all'||(audience==='internal'?actor!=='unknown':actor===audience);
}
// Apply BEFORE pagination so a page never hides later matching records.
export function audienceQuery(query,audience) {
  audienceOf(audience);
  if(audience==='internal')query.set('metadata->>tester',`in.(${ACTORS.join(',')})`);
  else if(audience==='unknown')query.set('or',`(metadata->>tester.is.null,metadata->>tester.not.in.(${ACTORS.join(',')}))`);
  else if(audience!=='all')query.set('metadata->>tester',`eq.${audience}`);
  return query;
}
