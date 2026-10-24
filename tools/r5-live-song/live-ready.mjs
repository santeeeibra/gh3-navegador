// Read-only admission signal for the SINGLE CP producer. Never reserves a slot,
// waits, reads guest memory or advances sequence/cadence. Keep the consumer's
// existing busy guard: old producers do not consult this hook.
export function createLiveReady({ready, initializing, fatal, busy, pending}) {
 return () => {
  if(fatal())return 0;
  // R5L currently imports/initializes the consumer on its first delivery.
  // Allow that bootstrap delivery, then reject until async init completes.
  if(!ready())return initializing()?0:1;
  return busy()||pending()?0:1;
 };
}
