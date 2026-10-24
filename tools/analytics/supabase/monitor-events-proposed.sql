-- PROPUESTA LOCAL: no aplicada. Requiere aprobación para cambiar el backend.
-- Conserva todos los eventos existentes y el límite de metadata de 2048 bytes.
begin;
alter table public.gh3_analytics_events
  drop constraint gh3_analytics_events_event_name_check;
alter table public.gh3_analytics_events
  add constraint gh3_analytics_events_event_name_check check (event_name in (
    'page_view','play_clicked','assets_ready','game_started','song_started',
    'session_ended','load_error','cache_fallback',
    'performance_sample','runtime_error','load_cancelled'
  ));
commit;
-- Reversión: requiere antes retirar/archivar los tres eventos nuevos; no se
-- borran registros históricos automáticamente como parte de esta propuesta.
