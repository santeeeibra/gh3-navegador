// Keep at most one interval of timing debt. A slightly late image should not
// force an additional empty 16.7ms interval; there is still one GPU frame in flight.
export function nextDeadline(deadline, completed, period=1000/60){
 const next=deadline+period;
 return completed-next>period?completed:next;
}
