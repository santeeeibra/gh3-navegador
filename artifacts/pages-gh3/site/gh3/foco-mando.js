// Claude 08/11 (pedido de Santi): el mando solo cuenta en la ventana con foco. Con dos ventanas del juego
// abiertas en la misma PC, el navegador le pasa la guitarra a las dos; así solo toca la ventana activa.
(()=>{const P=Navigator.prototype,orig=P.getGamepads;if(!orig||orig.__gh3Foco)return;
const enFoco=()=>{try{return top.document.hasFocus();}catch{return document.hasFocus();}};
const f=function(){return enFoco()?orig.call(this):[null,null,null,null];};f.__gh3Foco=true;P.getGamepads=f;})();
