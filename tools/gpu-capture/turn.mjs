// node tools/gpu-capture/turn.mjs reserve "<qué>"          -> prints the token
// GPUCAP_TURN=<token> node tools/gpu-capture/turn.mjs release "<qué>"
import {reserveTurn,releaseTurn,requireTurn} from './lib.mjs';
const [cmd,what='gpu-capture (Claude)']=process.argv.slice(2);
if(cmd==='reserve')console.log(reserveTurn(what));
else if(cmd==='release'){releaseTurn(requireTurn(),what);console.log('released');}
else throw Error('reserve|release');
