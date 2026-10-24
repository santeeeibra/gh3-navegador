import {safeMetadata} from '../shared/telemetry.js';
export {safeMetadata,safeText,safeResource} from '../shared/telemetry.js';
export const TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const EVENTS = ['page_view','play_clicked','assets_ready','game_started','song_started','session_ended','load_error','cache_fallback','performance_sample','runtime_error','load_cancelled'];

// Un solo formateador: crearlo en cada llamada era lo que agotaba el CPU del servidor con muchos eventos.
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});

export function localDay(value = Date.now()) {
  return DAY_FORMAT.format(new Date(value));
}

export function dayBounds(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('invalid_day');
  // Argentina has remained UTC-3 since 2009. Validate the calendar, including leap days.
  const start = new Date(`${day}T00:00:00-03:00`);
  if (!Number.isFinite(+start) || localDay(start) !== day || day < '2026-01-01' || day > '2099-12-31') throw new Error('invalid_day');
  return {start:start.toISOString(),end:new Date(+start+86400000).toISOString()};
}

export function buildActivity(rows, {day, offset=0, hasMore=false, aliases=new Map(), visits=new Map()}={}) {
  return {day,time_zone:TIME_ZONE,offset,next_offset:hasMore?offset+rows.length:null,has_more:hasMore,
    events:rows.map(row=>{
      const event=EVENTS.includes(row.event_name)?row.event_name:'unknown';
      const metadata=safeMetadata(row.metadata);
      return {at:row.occurred_at,event,attempt:aliases.get(row)||'Sin correlación',visit:visits.get(row)||null,
        correlation:row.metadata?.attempt_id?'attempt':'visit',
        device:['phone','tablet','desktop'].includes(row.device)?row.device:'unknown',metadata,
        detail_available:Boolean(metadata.message||metadata.error_name||metadata.cause)};
    })};
}
