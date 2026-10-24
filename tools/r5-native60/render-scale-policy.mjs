export function validRenderScale(value){return [1,0.75,0.5].includes(value);}
// User selection is a ceiling. Existing protection may lower it further.
export function cappedRenderScale(automatic,requested=1){
  return Math.min(validRenderScale(automatic)?automatic:1,validRenderScale(requested)?requested:1);
}
